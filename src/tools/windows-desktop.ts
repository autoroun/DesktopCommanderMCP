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

export async function handleWindowsDesktop(input: unknown) {
    if (process.platform !== 'win32') throw new Error('Requires an interactive Windows desktop.');
    const args = WindowsDesktopArgsSchema.parse(input);
    const required = {
        launch: ['app'], observe: [], click: ['window', 'x', 'y'], double_click: ['window', 'x', 'y'],
        text: ['window', 'text'], key: ['window', 'key'], credential: ['window', 'credential'],
    }[args.action];
    for (const field of required) {
        if (!(field in args)) throw new Error('Missing argument: ' + field);
    }

    for (const [command, prefix] of [['python', []], ['py', ['-3']]] as const) {
        let output: string;
        try {
            output = await runHelper(command, [...prefix], JSON.stringify(args));
        } catch (error) {
            // Retry only before the helper could have performed an action.
            if (['ENOENT', 81, 90, 9009].includes((error as NodeJS.ErrnoException).code!)) continue;
            throw error;
        }
        if (args.action === 'observe') {
            const { image, ...info } = JSON.parse(output);
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
