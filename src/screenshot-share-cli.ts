#!/usr/bin/env node
/**
 * Fallback for fixed-catalog MCP gateways that do not expose share_screenshot.
 * Keeps a screenshot-only localhost listener and temporary Cloudflare Quick
 * Tunnel alive for a bounded time. No account credentials or arbitrary file
 * paths are accepted.
 */
import { createVerifiedScreenshotShare } from './tools/screenshot-share.js';

function intOption(prefix: string, fallback: number) {
    const value = process.argv.slice(2).find(arg => arg.startsWith(prefix));
    return value ? Number(value.substring(prefix.length)) : fallback;
}

try {
    const width = intOption('--width=', 1600);
    const minutes = intOption('--minutes=', 10);
    const share = await createVerifiedScreenshotShare(width, minutes);
    console.log('SCREENSHOT_DELIVERY_VERIFIED ' + JSON.stringify({
        url: share.url,
        expires_at: share.expiresAt,
        https_status: share.verifiedStatus,
        security: 'Temporary image-only HTTPS tunnel; 256-bit URL path; no file browsing or shell access.',
    }));
    // Keep the isolated HTTP server alive until expiration or explicit stop.
    process.once('SIGINT', () => void share.stop().then(() => process.exit(0)));
    process.once('SIGTERM', () => void share.stop().then(() => process.exit(0)));
} catch (error) {
    console.error('SCREENSHOT_DELIVERY_FAILED ' + (error as Error).message);
    process.exitCode = 1;
}
