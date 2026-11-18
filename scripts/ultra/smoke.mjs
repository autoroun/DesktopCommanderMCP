import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dc-ultra-test-'));
const c = new Client({ name: 'ultra-smoke', version: '1.0.0' }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(process.cwd(), 'dist/index.js')],
  cwd: process.cwd(),
  env: { ...process.env, USERPROFILE: temp, HOME: temp, DC_ULTRA_DASHBOARD: '0' }
});
try {
  await c.connect(transport);
  const names = (await c.listTools()).tools.map(t => t.name);
  assert(names.includes('ultra_control'), 'Ultra MCP tool is not published');
  const tool = async (action, rest = {}) => {
    const r = await c.callTool({ name: 'ultra_control', arguments: { action, ...rest } });
    if (r.isError) throw Error(JSON.stringify(r.content));
    return JSON.parse(r.content[0].text);
  };
  assert.equal((await tool('status')).trusted, false);
  assert.equal((await tool('enable')).trusted, true);
  assert.equal((await tool('status')).trusted, true);
  const scan = await tool('project_scan', { cwd: process.cwd() });
  assert(scan.entries.some(e => e.name === 'package.json'));
  const started = await tool('task_start', { cwd: temp, commands: ['Write-Output ULTRA_SMOKE_OK'] });
  let state = await tool('task_status', { job_id: started.job_id });
  for (let i=0; i<30 && state.state==='running'; i++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    state = await tool('task_status', { job_id: started.job_id });
  }
  assert.equal(state.state, 'completed', state.output);
  assert(state.output.includes('ULTRA_SMOKE_OK'));
  const dash = await tool('dashboard_start', { port: 8876 });
  assert(dash.url.includes('127.0.0.1'));
  const page = await fetch(dash.url).then(r => r.text());
  assert(page.includes('Desktop Commander Ultra'));
  const match = page.match(/const auth="([a-f0-9]{64})"/);
  assert(match, 'Dashboard token is missing');
  const data = await fetch(dash.url+'/api/status',{headers:{'X-Ultra-Token':match[1]}}).then(r => r.json());
  assert.equal(data.trusted, true);
  assert(data.jobs.some(j=>j.id===started.job_id));
  await tool('dashboard_stop');
  assert.equal((await tool('disable')).trusted, false);
  assert.equal((await tool('status')).trusted, false);
  console.log('PASS: MCP registry, trusted mode, project scan, jobs, dashboard, and restore');
} finally {
  await c.close().catch(()=>{});
  await fs.rm(temp, { recursive:true, force:true });
}
