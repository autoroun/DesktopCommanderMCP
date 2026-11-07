import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTakeScreenshot } from '../dist/tools/screenshot.js';

test('take_screenshot rejects invalid image dimensions', async () => {
    await assert.rejects(() => handleTakeScreenshot({ max_width: 10 }), /max_width|Windows/);
});

test('take_screenshot returns a real MCP image block on an interactive Windows desktop', {
    skip: process.platform !== 'win32' || process.env.CI === 'true',
}, async () => {
    const result = await handleTakeScreenshot({ max_width: 900 });
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, 'image');
    assert.equal(result.content[0].mimeType, 'image/jpeg');
    assert.ok(Buffer.from(result.content[0].data, 'base64').subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
});
