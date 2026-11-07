import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('remote tool completion logging does not serialize private tool results', () => {
    const source = readFileSync(new URL('../src/remote-device/device.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /console\.log\([^\n]*JSON\.stringify\(result\)/);
    assert.match(source, /contentTypes\.join/);
    assert.match(source, /remoteChannel\.updateCallResult\(call_id, 'completed', result/);
});
