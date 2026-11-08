import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  callWindowsCompanionTool,
  listWindowsCompanionTools,
  windowsCompanionExecutable,
  closeWindowsCompanion,
} from '../dist/tools/windows-companion.js';

after(async () => { await closeWindowsCompanion(); });

test('companion always blocks shell and dangerous operations', async () => {
  for (const name of ['execute_powershell', 'execute_process', 'read_file', 'write_file', 'copy_move_delete_path', 'mouse_action', 'launch_app']) {
    const result = await callWindowsCompanionTool({ name, arguments: {} });
    assert.equal(result.isError, true, name);
    assert.match(result.content[0].text, /allowlist/, name);
  }
});

test('companion validates JSON arguments', async () => {
  const result = await callWindowsCompanionTool({ name: 'get_system_info', arguments: [] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /JSON object/);
});

test('companion exposes live inspection tools when installed on Windows', {
  skip: process.platform !== 'win32' || !windowsCompanionExecutable(),
}, async () => {
  const listed = await listWindowsCompanionTools();
  assert.equal(listed.isError, undefined, JSON.stringify(listed));
  const tools = JSON.parse(listed.content[0].text).tools;
  assert(tools.some(t => t.name === 'get_system_info'));
  assert(!tools.some(t => t.name === 'execute_powershell'));
  assert(!tools.some(t => t.name === 'read_file'));
  const system = await callWindowsCompanionTool({ name: 'get_system_info', arguments: {} });
  assert.equal(system.isError, undefined, JSON.stringify(system));
  assert.match(system.content[0].text, /Windows/i);
});
