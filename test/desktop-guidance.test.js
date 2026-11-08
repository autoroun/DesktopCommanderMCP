import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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
            if (name === 'start_process') assert.match(text, /Process started with PID/);
        }
    } finally {
        await client.close();
        await transport.close();
    }
});
