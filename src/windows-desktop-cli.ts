#!/usr/bin/env node
/**
 * JSON-lines desktop control for MCP clients with terminal and image-file tools.
 * Keep one session open so observations and request IDs retain their state.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { WindowsDesktopArgsSchema } from './tools/schemas.js';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleWindowsDesktop } from './tools/windows-desktop.js';

const directory = await mkdtemp(join(tmpdir(), 'dc-desktop-'));
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let imageNumber = 0;
console.log(JSON.stringify({
    ready: true,
    input_schema: zodToJsonSchema(WindowsDesktopArgsSchema),
    instructions: 'Send one windows_desktop JSON object per line. Observe before every input, include window and observation_id. Open each returned image_path using read_file to see the screen. Keep this PID for interact_with_process. On timeout read_process_output before retrying. Use request_id for input retries. Passwords use a local credential alias.',
}));
for await (const line of lines) {
    if (!line.trim()) continue;
    try {
        const result = await handleWindowsDesktop(JSON.parse(line));
        const output: Record<string, unknown> = { ok: true };
        for (const block of result.content) {
            if (block.type === 'text') {
                try { Object.assign(output, JSON.parse(block.text)); }
                catch { output.message = block.text; }
            }
            if (block.type === 'image') {
                const path = join(directory, 'screen-' + (++imageNumber) + '.jpg');
                await writeFile(path, Buffer.from(block.data, 'base64'));
                output.image_path = path;
            }
        }
        console.log(JSON.stringify(output));
    } catch (error) {
        console.log(JSON.stringify({ ok: false, error: (error as Error).message }));
    }
}
