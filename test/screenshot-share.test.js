import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { createVerifiedScreenshotShare, handleShareScreenshot } from '../dist/tools/screenshot-share.js';

test('screenshot URL sharing refuses out-of-range TTL before capture or tunnel', async () => {
    await assert.rejects(() => createVerifiedScreenshotShare(1600, 0), /ttl_minutes/);
    await assert.rejects(() => createVerifiedScreenshotShare(1600, 16), /ttl_minutes/);
    const result = await handleShareScreenshot({ ttl_minutes: 99 });
    assert.equal(result.isError, true);
    const obj = JSON.parse(result.content[0].text);
    assert.equal(obj.status, 'failed');
    assert.match(obj.note, /NOT confirmed/);
});

test('fresh MCP client advertises screenshot link delivery accurately', {
    skip: process.platform !== 'win32',
}, async () => {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('../dist/index.js', import.meta.url)), '--no-onboarding'],
        stderr: 'ignore',
    });
    const client = new Client({ name: 'screenshot-share-compat-test', version: '1' });
    try {
        await client.connect(transport);
        const tools = (await client.listTools()).tools;
        const tool = tools.find(t => t.name === 'share_screenshot');
        assert(tool, 'share_screenshot must appear in a new session');
        assert.match(tool.description, /verified/);
        assert.match(tool.description, /Cloudflare/);
        assert.match(client.getInstructions(), /SCREENSHOT_DELIVERY_VERIFIED/);
        assert.match(client.getInstructions(), /screenshot-share-cli/);
    } finally {
        await client.close();
        await transport.close();
    }
});
