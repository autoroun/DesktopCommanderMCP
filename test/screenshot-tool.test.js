import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTakeScreenshot, validateScreenshotImage } from '../dist/tools/screenshot.js';

test('take_screenshot rejects invalid image dimensions', async () => {
    await assert.rejects(() => handleTakeScreenshot({ max_width: 10 }), /max_width|Windows/);
    await assert.rejects(() => handleTakeScreenshot({ max_width: 999999 }), /max_width|Windows/);
    await assert.rejects(() => handleTakeScreenshot({ max_width: 100.5 }), /max_width|Windows/);
});

test('screenshot validation rejects non-image data', () => {
    assert.throws(() => validateScreenshotImage(''), /invalid base64/);
    assert.throws(() => validateScreenshotImage('not-base64!'), /invalid base64/);
    assert.throws(() => validateScreenshotImage(Buffer.from('hello').toString('base64')), /invalid or oversized JPEG/);
});

test('take_screenshot returns a real MCP image block on an interactive Windows desktop', {
    skip: process.platform !== 'win32' || process.env.CI === 'true',
}, async () => {
    const result = await handleTakeScreenshot({ max_width: 900 });
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, 'image');
    assert.equal(result.content[0].mimeType, 'image/jpeg');
    validateScreenshotImage(result.content[0].data);
});
