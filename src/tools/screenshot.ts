import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Return a real MCP image block, not a path or a text-only base64 dump.
 * Requires an interactive Windows desktop and Python with Pillow installed.
 * No screenshot is written to disk.
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
        'if im.width > int(sys.argv[1]): im.thumbnail((int(sys.argv[1]), 3840))',
        'b = io.BytesIO()',
        'im.convert("RGB").save(b, format="JPEG", quality=78, optimize=True)',
        'sys.stdout.write(base64.b64encode(b.getvalue()).decode("ascii"))',
    ].join('\n');
    let output: string;
    try {
        const { stdout } = await execFileAsync('python', ['-c', python, String(width)], {
            windowsHide: true,
            timeout: 15000,
            maxBuffer: 15 * 1024 * 1024,
        });
        output = stdout.trim();
    } catch (error) {
        throw new Error('Screen capture failed. An interactive desktop and Python Pillow are required: ' + String(error));
    }
    if (!output || !/^[A-Za-z0-9+/]+={0,2}$/.test(output)) {
        throw new Error('Screenshot did not return valid image data');
    }
    return { content: [{ type: 'image' as const, data: output, mimeType: 'image/jpeg' }] };
}
