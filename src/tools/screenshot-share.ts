import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { handleTakeScreenshot } from './screenshot.js';

const MAX_TTL_MINUTES = 15;
const ALLOWED_ORIGIN_PATH = /^\/[a-f0-9]{64}\.jpg$/;
const CLOUD_TUNNEL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;

type ScreenshotShare = {
    url: string;
    expiresAt: string;
    stop: () => Promise<void>;
    /** 200 for a successful remote HEAD verification. */
    verifiedStatus: number;
};
const activeShares = new Set<ScreenshotShare>();
const activeTunnels = new Set<ChildProcessWithoutNullStreams>();
process.once('exit', () => {
    for (const tunnel of activeTunnels) {
        try { tunnel.kill(); } catch { /* process already exited */ }
    }
});

export function locateCloudflared(): string {
    const custom = process.env.DC_CLOUDFLARED_EXE;
    if (custom) return custom;
    if (process.platform === 'win32' && process.env['ProgramFiles(x86)']) {
        return path.join(process.env['ProgramFiles(x86)']!, 'cloudflared', 'cloudflared.exe');
    }
    return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

function serveOnlyScreenshot(bytes: Buffer, secretPath: string): Promise<{ http: HttpServer; port: number }> {
    return new Promise((resolve, reject) => {
        const http = createServer((request, response) => {
            // A Quick Tunnel is internet-accessible. Do not expose directory
            // browsing, proxying, arbitrary files, credentials, or any API.
            if (!request.url || request.url !== secretPath || !ALLOWED_ORIGIN_PATH.test(request.url)
                || (request.method !== 'HEAD' && request.method !== 'GET')) {
                response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
                return;
            }
            response.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': String(bytes.length),
                'Cache-Control': 'private, no-store, max-age=0',
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer',
                'Content-Disposition': 'inline; filename="desktop-screenshot.jpg"',
            });
            response.end(request.method === 'HEAD' ? undefined : bytes);
        });
        http.once('error', reject);
        http.listen(0, '127.0.0.1', () => {
            const address = http.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Could not bind the screenshot-only loopback server.'));
                return;
            }
            resolve({ http, port: address.port });
        });
    });
}

function awaitTunnelDomain(tunnel: ChildProcessWithoutNullStreams): Promise<string> {
    return new Promise((resolve, reject) => {
        let collected = '';
        const timeout = setTimeout(() => finish(new Error('Timed out waiting for Cloudflare Quick Tunnel URL')), 35000);
        const onData = (piece: Buffer) => {
            collected = (collected + piece.toString('utf8')).slice(-16000);
            const found = collected.match(CLOUD_TUNNEL_REGEX);
            if (found?.length) finish(undefined, found[0]);
        };
        const onExit = (code: number | null) =>
            finish(new Error('Cloudflare Tunnel exited before startup (exit ' + String(code) + ').'));
        const onError = (err: Error) => finish(err);
        const finish = (error?: Error, url?: string) => {
            clearTimeout(timeout);
            tunnel.stderr.off('data', onData);
            tunnel.stdout.off('data', onData);
            tunnel.off('exit', onExit);
            tunnel.off('error', onError);
            error ? reject(error) : resolve(url!);
        };
        tunnel.stdout.on('data', onData);
        tunnel.stderr.on('data', onData);
        tunnel.once('exit', onExit);
        tunnel.once('error', onError);
    });
}

async function verifyRemoteUrl(url: string, tunnel: ChildProcessWithoutNullStreams, expected: Buffer): Promise<void> {
    let lastFailure = 'unknown';
    // Quick Tunnel DNS can be negatively cached by consumer routers while its
    // hostname propagates. Retry verification for up to about 75 seconds.
    for (let attempt = 0; attempt < 90; attempt++) {
        if (tunnel.exitCode !== null) break;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' },
                signal: AbortSignal.timeout(3500),
                redirect: 'error',
            });
            if (response.status === 200 && (response.headers.get('content-type') ?? '').startsWith('image/jpeg')) {
                const delivered = Buffer.from(await response.arrayBuffer());
                // Confirm the full image (not only HTTP status or an upstream
                // error page) arrived intact over the public HTTPS URL.
                if (delivered.equals(expected)) return;
                lastFailure = 'HTTP 200 returned different JPEG bytes (' + delivered.length + ' bytes).';
            } else {
                lastFailure = 'HTTP ' + response.status + ', content-type ' + (response.headers.get('content-type') ?? '(missing)');
            }
        } catch (error) {
            lastFailure = (error as Error).message + ' ' + String((error as any)?.cause?.code ?? '');
        }
        await new Promise(resolve => setTimeout(resolve, 600));
    }
    throw new Error('Screenshot link could not be verified over public HTTPS; delivery was NOT confirmed. Host: ' + new URL(url).hostname + '. Last check: ' + lastFailure);
}

/** Share only the just-captured screen through a short-lived tokenized HTTPS URL.
 * Transport uses the locally installed cloudflared Quick Tunnel; bytes are not
 * written to a third-party storage provider.
 */
export async function createVerifiedScreenshotShare(maxWidth = 1600, ttlMinutes = 10): Promise<ScreenshotShare> {
    if (process.platform !== 'win32') throw new Error('Screenshot sharing requires an interactive Windows desktop.');
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > MAX_TTL_MINUTES) {
        throw new Error('ttl_minutes must be between 1 and 15.');
    }
    const result = await handleTakeScreenshot({ max_width: maxWidth });
    const imageBlock = result.content.find(item => item.type === 'image');
    if (!imageBlock) throw new Error('Screenshot was not captured.');
    const bytes = Buffer.from(imageBlock.data, 'base64');
    const tokenPath = '/' + randomBytes(32).toString('hex') + '.jpg';

    const { http, port } = await serveOnlyScreenshot(bytes, tokenPath);
    let tunnel: ChildProcessWithoutNullStreams | undefined;
    let timer: NodeJS.Timeout | undefined;
    let closed = false;
    const stop = async () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        if (tunnel && tunnel.exitCode === null) tunnel.kill();
        if (tunnel) activeTunnels.delete(tunnel);
        await new Promise<void>(resolve => http.close(() => resolve()));
        for (const share of activeShares) {
            if (share.stop === stop) activeShares.delete(share);
        }
    };
    try {
        const openedTunnel = spawn(locateCloudflared(), [
            'tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`,
        ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        tunnel = openedTunnel;
        activeTunnels.add(openedTunnel);
        const domain = await awaitTunnelDomain(openedTunnel);
        const url = domain.replace(/\/$/, '') + tokenPath;
        await verifyRemoteUrl(url, openedTunnel, bytes);
        const expiresAt = new Date(Date.now() + ttlMinutes * 60000).toISOString();
        timer = setTimeout(() => void stop(), ttlMinutes * 60000);
        timer.unref();
        const share: ScreenshotShare = { url, expiresAt, stop, verifiedStatus: 200 };
        activeShares.add(share);
        return share;
    } catch (error) {
        await stop();
        throw error;
    }
}

export async function handleShareScreenshot(args: { max_width?: number; ttl_minutes?: number } = {}) {
    try {
        const share = await createVerifiedScreenshotShare(args.max_width ?? 1600, args.ttl_minutes ?? 10);
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    status: 'verified',
                    url: share.url,
                    expires_at: share.expiresAt,
                    public_https_status: share.verifiedStatus,
                    transport: 'ephemeral Cloudflare Quick Tunnel',
                    security: 'Only this screenshot at a 256-bit random path is served; HTTPS link expires automatically.',
                    note: 'The verified HTTPS URL can be sent as a direct clickable link. Never claim the screenshot is visible inline unless the chat host displays it.',
                }),
            }],
        };
    } catch (error) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    status: 'failed',
                    reason: String((error as Error).message),
                    note: 'Screenshot delivery is NOT confirmed. Do not claim it was sent.',
                }),
            }],
            isError: true,
        };
    }
}
