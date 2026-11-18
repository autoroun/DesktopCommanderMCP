import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dc-ultra-e2e-'));
const originalEnv = { ...process.env };
const connect = async () => {
  const client = new Client({ name: 'ultra-regression', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(process.cwd(), 'dist/index.js')],
    cwd: process.cwd(),
    env: { ...originalEnv, HOME: home, USERPROFILE: home, DC_ULTRA_DASHBOARD: '0' }
  });
  await client.connect(transport);
  const call = async (action, args = {}) => {
    const reply = await client.callTool({ name: 'ultra_control', arguments: { action, ...args } });
    assert.equal(reply.isError, false, 'ultra_control ' + action + ' failed: ' + JSON.stringify(reply.content));
    return JSON.parse(reply.content[0].text);
  };
  return { client, call };
};
let c;
try {
  c = await connect();
  const tools = (await c.client.listTools()).tools;
  const ultra = tools.find(x => x.name === 'ultra_control');
  assert(ultra, 'Ultra tool not registered');
  const actions = ultra.inputSchema.properties.action.enum;
  assert(actions.includes('task_start'));
  assert(!actions.includes('enable') && !actions.includes('disable'), 'Legacy profiles are still present');
  const configReply = await c.client.callTool({ name: 'get_config', arguments: {} });
  const conf = configReply.structuredContent.config;
  assert.deepEqual(conf.blockedCommands, [], 'Default command blocklist is not empty');
  assert.deepEqual(conf.allowedDirectories, [], 'Default folder blocklist is not empty');
  assert.equal(conf.pendingWelcomeOnboarding, false);
  const illegalConfig = await c.client.callTool({ name: 'set_config_value', arguments: { key: 'blockedCommands', value: ['shutdown'] } });
  assert.equal(illegalConfig.isError, true, 'Legacy permission mode still editable');
  assert.equal((await c.call('status')).mode, 'FULL_ACCESS');
  // Even an external edit to the config file cannot re-enable obsolete access lists.
  const configPath=path.join(home,'.claude-server-commander','config.json');
  const persisted=JSON.parse(await fs.readFile(configPath,'utf8'));
  persisted.blockedCommands=['git'];
  persisted.allowedDirectories=['C:\\forbidden-test-only'];
  await fs.writeFile(configPath,JSON.stringify(persisted));
  await new Promise(r=>setTimeout(r,600));
  const effective=(await c.client.callTool({name:'get_config',arguments:{}})).structuredContent.config;
  assert.deepEqual(effective.blockedCommands,[]);
  assert.deepEqual(effective.allowedDirectories,[]);

  const scan = await c.call('project_scan', { cwd: process.cwd() });
  assert(scan.entries.some(e => e.name === 'package.json'));
  const started = await c.call('task_start', { cwd: home, commands: ['Write-Output ULTRA_E2E_OK'] });
  let state;
  for (let i=0; i<40; i++) {
    state=await c.call('task_status', {job_id:started.job_id});
    if (state.state==='completed' || state.state==='failed') break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(state.state,'completed', JSON.stringify(state));
  assert(state.output.includes('ULTRA_E2E_OK'));

  const failed = await c.call('task_start', { cwd:home, commands:['exit 7'], retries:1 });
  let failState;
  for(let i=0;i<45;i++){
    failState=await c.call('task_status',{job_id:failed.job_id});
    if(failState.state==='failed' || failState.state==='completed') break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(failState.state,'failed');
  assert.equal(failState.attempts,2);
  const sleeping=await c.call('task_start',{cwd:home,commands:['Start-Sleep -Seconds 20; Write-Output SHOULD_NOT_APPEAR']});
  await new Promise(r=>setTimeout(r,250));
  await c.call('task_cancel',{job_id:sleeping.job_id});
  let cancelled;
  for(let i=0;i<45;i++){
    cancelled=await c.call('task_status',{job_id:sleeping.job_id});
    if(cancelled.state==='cancelled') break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(cancelled.state,'cancelled',JSON.stringify(cancelled));
  assert(!cancelled.output.includes('SHOULD_NOT_APPEAR'));
  const queued=[];
  for(let i=0;i<5;i++) queued.push(await c.call('task_start',{cwd:home,commands:['Start-Sleep -Seconds 8']}));
  const statuses=await Promise.all(queued.map(j=>c.call('task_status',{job_id:j.job_id})));
  assert(statuses.filter(j=>j.state==='running').length<=3,'Too many concurrent jobs');
  assert(statuses.filter(j=>j.state==='queued').length>=2,'Queue capacity not enforced');
  for(const j of queued) await c.call('task_cancel',{job_id:j.job_id});
  for(let i=0;i<40;i++) {
    const current=await Promise.all(queued.map(j=>c.call('task_status',{job_id:j.job_id})));
    if(current.every(j=>j.state==='cancelled')) break;
    await new Promise(r=>setTimeout(r,100));
  }
  const cancelledBatch=await Promise.all(queued.map(j=>c.call('task_status',{job_id:j.job_id})));
  assert(cancelledBatch.every(j=>j.state==='cancelled'),'Queued/running job cancellation failed');

  const { url }=await c.call('dashboard_start',{port:8876});
  const html=await fetch(url).then(x=>x.text());
  assert(html.includes('Desktop Commander Ultra'));
  assert(!html.includes('id="on"')&&!html.includes('id="off"'),'Profile buttons should not appear');
  const token=html.match(/const auth="([a-f0-9]{64})"/)?.[1];
  assert(token);
  const nope=await fetch(url+'/api/status');
  assert.equal(nope.status,403,'Unauthenticated status should be blocked');
  const forbidden=await new Promise((resolve,reject) => {
    const req=http.request({hostname:'127.0.0.1',port:8876,path:'/api/status',method:'GET',headers:{Host:'not-local.example:8876','X-Ultra-Token':token}},res => {res.resume();res.on('end',()=>resolve(res.statusCode))});
    req.on('error',reject);req.end();
  });
  assert.equal(forbidden,403,'DNS rebinding host check should block');
  const overview=await fetch(url+'/api/status',{headers:{'X-Ultra-Token':token}}).then(x=>x.json());
  assert.equal(overview.mode,'FULL_ACCESS');
  assert(overview.jobs.some(j=>j.id===started.job_id));
  await c.call('dashboard_stop');
  const audit=await fs.readFile(path.join(home,'.claude-server-commander','ultra-jobs.jsonl'),'utf8');
  assert(audit.includes('job-end'));
  await c.client.close();
  c=undefined;
  c=await connect();
  assert.equal((await c.call('status')).mode,'FULL_ACCESS');
  const cfg=(await c.client.callTool({name:'get_config',arguments:{}})).structuredContent.config;
  assert.deepEqual(cfg.blockedCommands,[]);
  assert.deepEqual(cfg.allowedDirectories,[]);
  console.log('PASS: single mode, persistent config, forbidden settings, project scan, success/retry/cancel jobs, audit, panel, auth, DNS rebinding');
} finally {
  if(c) await c.client.close().catch(()=>{});
  await fs.rm(home,{recursive:true,force:true});
}
