import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('desktop workflow reaches initialization and existing gateway tool responses', {
    skip: process.platform !== 'win32',
}, async () => {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('../dist/index.js', import.meta.url)), '--no-onboarding'],
        stderr: 'ignore',
    });
    const client = new Client({ name: 'desktop-guidance-regression', version: '1' });
    try {
        await client.connect(transport);
        assert.match(client.getInstructions(), /windows-desktop-cli/);
        for (const name of ['get_config', 'list_sessions', 'start_process']) {
            const args = name === 'start_process'
                ? { command: 'Write-Output desktop-guidance-smoke', shell: 'powershell.exe', timeout_ms: 1000 }
                : {};
            const result = await client.callTool({ name, arguments: args });
            const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
            assert.match(text, /windows-desktop-cli/, name);
            assert.match(text, /observation_id/, name);
            assert.match(text, /current conversation as the delivery destination/, name);
            if (name === 'start_process') assert.match(text, /Process started with PID/);
        }
        const directory = await mkdtemp(join(tmpdir(), 'dc-image-guidance-test-'));
        try {
            const path = join(directory, 'image.png');
            await writeFile(path, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVt8AAAAASUVORK5CYII=', 'base64'));
            const imageResult = await client.callTool({name: 'read_file', arguments: {path}});
            assert(imageResult.content.some(c => c.type === 'image'));
            assert(imageResult.content.some(c => c.type === 'text' && c.text.includes('current conversation as the delivery destination')));
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    } finally {
        await client.close();
        await transport.close();
    }
});
