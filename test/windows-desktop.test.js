import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWindowsDesktop } from '../dist/tools/windows-desktop.js';

test('desktop input rejects incomplete or invalid actions before sending input', {
    skip: process.platform !== 'win32',
}, async () => {
    await assert.rejects(handleWindowsDesktop({ action: 'key', key: 'Enter' }), /Missing argument: window/);
    await assert.rejects(handleWindowsDesktop({ action: 'click', window: 1, x: 0 }), /Missing argument: y/);
    await assert.rejects(handleWindowsDesktop({ action: 'credential', window: 1 }), /Missing argument: credential/);
    await assert.rejects(handleWindowsDesktop({ action: 'click', window: 1, x: -1, y: 0 }));
});

test('desktop observe returns window metadata and a JPEG image', {
    skip: process.platform !== 'win32' || process.env.DC_INTERACTIVE_TEST !== '1',
}, async () => {
    const { content } = await handleWindowsDesktop({ action: 'observe' });
    const info = JSON.parse(content[0].text);
    assert.ok(info.window > 0 && info.width > 0 && info.height > 0);
    assert.equal(content[1].type, 'image');
    assert.equal(content[1].mimeType, 'image/jpeg');
});

test('input requires a recent observation before any desktop effects', {
    skip: process.platform !== 'win32',
}, async () => {
    await assert.rejects(handleWindowsDesktop({action: 'text', window: 1, text: 'never sent'}), /Observe/);
});

test('request IDs retain failures and reject changed payloads', {
    skip: process.platform !== 'win32',
}, async () => {
    const args = {action: 'key', window: 1, key: 'Enter', request_id: 'regression-no-double-input'};
    await assert.rejects(handleWindowsDesktop(args), /Observe/);
    await assert.rejects(handleWindowsDesktop(args), /Observe/);
    await assert.rejects(handleWindowsDesktop({...args, key: 'Tab'}), /different arguments/);
});

test('observations stay fresh with repeated request IDs and superseded input is rejected', {
    skip: process.platform !== 'win32' || process.env.DC_INTERACTIVE_TEST !== '1',
}, async () => {
    const args = {action: 'observe', request_id: 'fresh-screen'};
    const first = JSON.parse((await handleWindowsDesktop(args)).content[0].text);
    const second = JSON.parse((await handleWindowsDesktop(args)).content[0].text);
    assert.notEqual(first.observation_id, second.observation_id);
    await assert.rejects(handleWindowsDesktop({
        action: 'key', key: 'Enter', window: second.window, observation_id: first.observation_id,
    }), /superseded/);
});
