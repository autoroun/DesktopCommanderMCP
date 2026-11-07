import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CAPTURE_TIMEOUT_MS = 15000;

export function validateScreenshotImage(base64: string): void {
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error('Screen capture returned invalid base64 image data');
    }
    const data = Buffer.from(base64, 'base64');
    if (data.length < 4 || data.length > MAX_IMAGE_BYTES ||
        data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
        throw new Error('Screen capture returned an invalid or oversized JPEG');
    }
}

/** Capture the interactive Windows desktop as an MCP image content block.
 * The remote MCP client must preserve image content for the ChatGPT UI to display it.
 * Never return the image as a local path or text-only base64.
 */
export async function handleTakeScreenshot(args: { max_width?: number } = {}) {
    if (process.platform !== 'win32') {
        throw new Error('take_screenshot currently supports interactive Windows desktops only.');
    }
    const width = args.max_width ?? 1600;
    if (!Number.isInteger(width) || width < 320 || width > 3840) {
        throw new Error('max_width must be an integer between 320 and 3840');
    }
    const python = [
        'import base64, io, sys',
        'from PIL import ImageGrab',
        'im = ImageGrab.grab()',
        'if im.width <= 0 or im.height <= 0: raise RuntimeError("No interactive screen detected")',
        'if im.width > int(sys.argv[1]): im.thumbnail((int(sys.argv[1]), 3840))',
        'b = io.BytesIO()',
        'im.convert("RGB").save(b, format="JPEG", quality=78, optimize=True)',
        'sys.stdout.write(base64.b64encode(b.getvalue()).decode("ascii"))',
    ].join('\n');
    const candidates: Array<[string, string[]]> = [
        ['python', ['-c', python, String(width)]],
        ['py', ['-3', '-c', python, String(width)]],
        ['C:\\Python\\python.exe', ['-c', python, String(width)]],
    ];
    const failures: string[] = [];
    for (const [executable, params] of candidates) {
        try {
            const { stdout } = await execFileAsync(executable, params, {
                windowsHide: true,
                timeout: CAPTURE_TIMEOUT_MS,
                maxBuffer: 12 * 1024 * 1024,
            });
            const output = stdout.trim();
            validateScreenshotImage(output);
            return { content: [{ type: 'image' as const, data: output, mimeType: 'image/jpeg' }] };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code ?? 'capture_error';
            failures.push(executable + ': ' + code);
        }
    }
    throw new Error('Unable to capture the interactive Windows desktop. Check desktop session and Python Pillow installation. Attempts: ' + failures.join('; '));
}
