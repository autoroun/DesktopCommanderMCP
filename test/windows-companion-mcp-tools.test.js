import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('fresh MCP clients discover companion tools and guidance', {
  skip: process.platform !== 'win32',
}, async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/index.js', import.meta.url)), '--no-onboarding'],
    stderr: 'ignore',
  });
  const client = new Client({ name: 'fresh-chat-compatibility-test', version: '1.0' });
  try {
    await client.connect(transport);
    const instructions = client.getInstructions() ?? '';
    assert.match(instructions, /windows_companion_list_tools/);
    assert.match(instructions, /windows-desktop-cli/);

    const listed = await client.listTools();
    const byName = new Map(listed.tools.map(tool => [tool.name, tool]));
    for (const tool of [
      'windows_desktop',
      'take_screenshot',
      'windows_companion_list_tools',
      'windows_companion_call_tool',
    ]) {
      assert(byName.has(tool), 'Expected freshly registered tool: ' + tool);
    }
    assert.match(byName.get('windows_companion_call_tool').description, /read-only/);

    const discovered = await client.callTool({
      name: 'windows_companion_list_tools',
      arguments: {},
    });
    const info = JSON.parse(discovered.content.find(content => content.type === 'text').text);
    assert.equal(info.connected, true);
    assert(info.tools.some(tool => tool.name === 'get_system_info'));
    assert(!info.tools.some(tool => tool.name === 'execute_powershell'));

    const result = await client.callTool({
      name: 'windows_companion_call_tool',
      arguments: { name: 'get_system_info', arguments: {} },
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Windows/i);
  } finally {
    await client.close();
    await transport.close();
  }
});
