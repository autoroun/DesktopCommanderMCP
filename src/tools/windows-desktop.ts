import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WindowsDesktopArgsSchema } from './schemas.js';
import { validateScreenshotImage } from './screenshot.js';

const helper = fileURLToPath(new URL('./windows-desktop.py', import.meta.url));

function runHelper(command: string, prefix: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = execFile(command, [...prefix, '-X', 'utf8', helper], {
            windowsHide: true, timeout: 20000, maxBuffer: 12 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                const failure = new Error(stderr.trim() || 'Windows desktop helper failed');
                Object.assign(failure, { code: error.code });
                reject(failure);
            } else {
                resolve(stdout);
            }
        });
        child.stdin?.on('error', () => { /* exit status is handled above */ });
        child.stdin?.end(input);
    });
}

let pending: Promise<unknown> = Promise.resolve();
let observation: { window: number; capturedAt: number; context: unknown } | undefined;
const recentRequests = new Map<string, { hash: string; result: Promise<any> }>();

/** Serialize requests because mouse and keyboard are shared by every caller. */
export async function handleWindowsDesktop(input: unknown): Promise<any> {
    const args = WindowsDesktopArgsSchema.parse(input);
    const hash = createHash('sha256').update(JSON.stringify(args)).digest('hex');
    if (args.request_id) {
        const previous = recentRequests.get(args.request_id);
        if (previous) {
            if (previous.hash !== hash) return Promise.reject(new Error('request_id was already used with different arguments.'));
            return previous.result;
        }
        if (recentRequests.size >= 256) {
            return Promise.reject(new Error('Request history is full. Restart the server before using new request IDs.'));
        }
    }
    const result = pending.then(() => executeDesktop(args));
    pending = result.catch(() => undefined);
    if (args.request_id) recentRequests.set(args.request_id, { hash, result });
    return result;
}

async function executeDesktop(input: unknown) {
    if (process.platform !== 'win32') throw new Error('Requires an interactive Windows desktop.');
    const args = WindowsDesktopArgsSchema.parse(input);
    const required = {
        launch: ['app'], observe: [], click: ['window', 'x', 'y'], double_click: ['window', 'x', 'y'],
        scroll: ['window', 'amount'], right_click: ['window', 'x', 'y'], wait_for_window: ['title'],
        text: ['window', 'text'], key: ['window', 'key'], credential: ['window', 'credential'],
    }[args.action];
    for (const field of required) {
        if (!(field in args)) throw new Error('Missing argument: ' + field);
    }

    const sendsInput = !['launch', 'observe', 'wait_for_window'].includes(args.action);
    let context: unknown;
    if (sendsInput) {
        if (!observation || observation.window !== args.window || Date.now() - observation.capturedAt > 60000) {
            throw new Error('Observe the target window again before sending input (observations expire after 60 seconds).');
        }
        context = observation.context;
    }
    // A failed input may have partially reached the application. Require a fresh observation.
    observation = undefined;
    for (const [command, prefix] of [['python', []], ['py', ['-3']]] as const) {
        let output: string;
        try {
            output = await runHelper(command, [...prefix], JSON.stringify({ ...args, context }));
        } catch (error) {
            // Retry only before the helper could have performed an action.
            if (['ENOENT', 81, 90, 9009].includes((error as NodeJS.ErrnoException).code!)) continue;
            throw error;
        }
        if (['observe', 'wait_for_window'].includes(args.action)) {
            const { image, context: capturedContext, ...info } = JSON.parse(output);
            observation = { window: info.window, capturedAt: Date.now(), context: capturedContext };
            validateScreenshotImage(image);
            return { content: [
                { type: 'text' as const, text: JSON.stringify(info) },
                { type: 'image' as const, mimeType: 'image/jpeg', data: image },
            ] };
        }
        return { content: [{ type: 'text' as const, text: output.trim() }] };
    }
    throw new Error('Install Python 3 and run python -m pip install Pillow pywin32 pywinauto.');
}
