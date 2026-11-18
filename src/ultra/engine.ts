/**
 * Desktop Commander Ultra: owner-authorized, unattended local automation.
 * Remote account/device pairing and OS privilege boundaries are not changed.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';

type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
type Job = {
  id: string; state: JobState; cwd: string; steps: string[];
  index: number; attempts: number; started: string; ended?: string;
  output: string; exitCode?: number | null; child?: ChildProcess; cancel?: boolean;
};
const jobs = new Map<string, Job>();
const maxJobs = 120;
const maxParallelJobs = 3;
const pendingJobs: Array<{ job: Job; retries: number }> = [];
let activeJobs = 0;
let dashboard: Server | undefined;
let dashboardPort = 0;
const dashboardToken = randomBytes(32).toString('hex');
const jobLog = path.join(os.homedir(), '.claude-server-commander', 'ultra-jobs.jsonl');

export type UltraInput = {
  action: 'status' | 'task_start' | 'task_status' | 'task_cancel' |
    'project_scan' | 'dashboard_start' | 'dashboard_stop' | 'power';
  commands?: string[]; cwd?: string; retries?: number; job_id?: string;
  port?: number; operation?: 'shutdown' | 'restart' | 'abort';
};
const textResult = (value: unknown, failed = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  isError: failed
});
const compactJob = (job: Job) => ({
  id: job.id, state: job.state, cwd: job.cwd, currentStep: job.index + 1,
  totalSteps: job.steps.length, attempts: job.attempts, started: job.started,
  ended: job.ended, exitCode: job.exitCode, output: job.output.slice(-12000)
});
let auditQueue: Promise<void> = Promise.resolve();
async function persist(event: Record<string, unknown>) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n';
  const write = auditQueue.then(async () => {
    try {
      await fs.mkdir(path.dirname(jobLog), { recursive: true });
      const size = (await fs.stat(jobLog).catch(() => undefined))?.size ?? 0;
      if (size + Buffer.byteLength(line) > 10 * 1024 * 1024) {
        await fs.rm(jobLog + '.previous', { force: true });
        await fs.rename(jobLog, jobLog + '.previous');
      }
      await fs.appendFile(jobLog, line);
    } catch (error) {
      console.error('Ultra audit log error:', error);
    }
  });
  auditQueue = write.catch(() => undefined);
  await write;
}
function commandArgs(command: string): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] };
  }
  return { file: '/bin/sh', args: ['-lc', command] };
}
function killTree(child?: ChildProcess) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', (error) => console.error('Ultra cancel error:', error));
  } else child.kill('SIGTERM');
}
function oneCommand(job: Job, command: string): Promise<number | null> {
  return new Promise((resolve) => {
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (exit: number | null) => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      job.child = undefined;
      resolve(exit);
    };
    const spec = commandArgs(command);
    const child = spawn(spec.file, spec.args, {
      cwd: job.cwd, windowsHide: true, env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    job.child = child;
    const collect = (piece: Buffer) => {
      job.output = (job.output + piece.toString('utf8')).slice(-64000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (e) => { collect(Buffer.from('\n' + String(e))); finish(-1); });
    child.on('close', finish);
    timeout = setTimeout(() => { collect(Buffer.from('\n[Ultra: command timed out after 180 s]')); killTree(child); }, 180000);
    timeout.unref();
  });
}
function scheduleJobs() {
  while (activeJobs < maxParallelJobs && pendingJobs.length) {
    const next = pendingJobs.shift()!;
    if (next.job.cancel) continue;
    activeJobs++;
    void work(next.job, next.retries).catch(async (error) => {
      next.job.state = 'failed';
      next.job.ended = new Date().toISOString();
      next.job.output += '\n' + String(error);
      await persist({ event: 'job-error', job: next.job.id, error: String(error) });
    }).finally(() => { activeJobs--; scheduleJobs(); });
  }
}
async function work(job: Job, retries: number) {
  job.state = 'running';
  await persist({ event: 'job-start', job: job.id, cwd: job.cwd, steps: job.steps.length });
  for (let i = 0; i < job.steps.length; i++) {
    job.index = i;
    let exit: number | null = -1;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (job.cancel) break;
      job.attempts = attempt + 1;
      job.output += '\n> Step ' + (i + 1) + ' attempt ' + (attempt + 1) + '\n';
      exit = await oneCommand(job, job.steps[i]);
      if (exit === 0) break;
    }
    job.exitCode = exit;
    if (job.cancel || exit !== 0) {
      job.state = job.cancel ? 'cancelled' : 'failed';
      break;
    }
  }
  if (job.state === 'running') job.state = 'completed';
  job.ended = new Date().toISOString();
  await persist({ event: 'job-end', job: job.id, state: job.state, exitCode: job.exitCode, outputTail: job.output.slice(-2000) });
}
function status() {
  return {
    version: 'Ultra 1.1', mode: 'FULL_ACCESS', platform: process.platform, hostname: os.hostname(),
    uptimeSeconds: Math.floor(process.uptime()), pid: process.pid,
    dashboard: dashboard ? 'http://127.0.0.1:' + dashboardPort : null,
    jobs: Array.from(jobs.values()).slice(-30).reverse().map(compactJob)
  };
}
async function projectScan(cwd: string) {
  const folder = path.resolve(cwd);
  const entries = (await fs.readdir(folder, { withFileTypes: true }))
    .slice(0, 80).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }));
  const packagePath = path.join(folder, 'package.json');
  let scripts: Record<string, string> = {};
  try { scripts = JSON.parse(await fs.readFile(packagePath, 'utf8')).scripts ?? {}; } catch { /* optional */ }
  const probe: Job = { id: 'scan', state: 'running', cwd: folder, steps: [], index: 0, attempts: 1, started: '', output: '' };
  const code = await oneCommand(probe, 'git status --short --branch');
  return { directory: folder, entries, packageScripts: scripts, gitExitCode: code, gitStatus: probe.output.slice(-6000) };
}
const esc = (s: string) => s.replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x] || x));
function dashboardHtml() {
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Desktop Commander Ultra</title><style>' +
    ':root{color-scheme:dark}body{margin:0;background:#0c111b;color:#f3f5fa;font:14px system-ui,Segoe UI,Arial}main{max-width:1100px;margin:auto;padding:35px 22px}h1{font-size:28px;margin-bottom:3px}p{color:#94a3b8}' +
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:25px 0}.card{background:#151e2d;border:1px solid #2a3b52;border-radius:15px;padding:18px}.val{font-size:22px;font-weight:750;margin-top:9px}button{background:#2563eb;border:0;color:white;padding:10px 15px;border-radius:9px;cursor:pointer;margin:4px}button.danger{background:#a92936}button.secondary{background:#334155}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1;max-height:250px;overflow:auto}article{margin-bottom:10px}.dot{display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:8px}</style></head><body><main>' +
    '<h1>Desktop Commander Ultra</h1><p><span class="dot"></span>Yalnızca bu bilgisayarda (127.0.0.1) yönetim. İşlem geçmişi ve acil durdurma.</p>' +
    '<section class="cards"><div class="card">Mod<div id="mode" class="val">Yükleniyor</div></div><div class="card">Cihaz<div id="machine" class="val"></div></div><div class="card">İşler<div id="jobcount" class="val"></div></div><div class="card">Çalışma süresi<div id="uptime" class="val"></div></div></section>' +
    '<div class="card"><h2>Kontroller</h2><button id="refresh" class="secondary">Yenile</button><button id="stopAll" class="danger">Çalışan tüm işleri durdur</button><p>Windows yönetici/UAC ve AI platform izinleri bu panelin kapsamı dışındadır.</p></div>' +
    '<h2>Görevler</h2><section id="tasks"></section></main><script>const auth=' + JSON.stringify(dashboardToken) + ';' +
    'async function api(action,payload){const r=await fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json","X-Ultra-Token":auth},body:JSON.stringify({action,...(payload||{})})});return r.json()}' +
    'async function load(){let d=await (await fetch("/api/status",{headers:{"X-Ultra-Token":auth}})).json();document.getElementById("mode").textContent=d.mode;document.getElementById("machine").textContent=d.hostname;document.getElementById("jobcount").textContent=d.jobs.length;document.getElementById("uptime").textContent=Math.floor(d.uptimeSeconds/60)+" dk";let root=document.getElementById("tasks");root.replaceChildren();for(let job of d.jobs){let a=document.createElement("article");a.className="card";let h=document.createElement("h3");h.textContent=job.id.slice(0,8)+" · "+job.state+" · "+job.currentStep+"/"+job.totalSteps;let p=document.createElement("pre");p.textContent=job.output;let b=document.createElement("button");b.textContent="Görevi durdur";b.className="danger";b.onclick=async()=>{await api("task_cancel",{job_id:job.id});load()};a.append(h,p);if(job.state==="running"||job.state==="queued")a.append(b);root.append(a)}}' +
    'document.getElementById("refresh").onclick=load;document.getElementById("stopAll").onclick=async()=>{await api("cancel_all");load()};load();</script></body></html>';
}
async function startDashboard(port = 8765) {
  if (dashboard) return status().dashboard;
  const server = createServer(async (req, res) => {
    const host = req.headers.host;
    if (host !== '127.0.0.1:' + dashboardPort && host !== 'localhost:' + dashboardPort) {
      res.writeHead(403); res.end('Invalid local host'); return;
    }
    const origin = req.headers.origin;
    if (origin && origin !== 'http://127.0.0.1:' + dashboardPort) {
      res.writeHead(403); res.end('Forbidden origin'); return;
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' });
      res.end(dashboardHtml()); return;
    }
    if (req.headers['x-ultra-token'] !== dashboardToken) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(status())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/action') {
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (body.length > 8192) throw new Error('Payload too large');
        }
        const input = JSON.parse(body);
        let response;
        if (input.action === 'task_cancel') response = await handleUltra({ action: 'task_cancel', job_id: input.job_id });
        else if (input.action === 'cancel_all') {
          const running = [...jobs.values()].filter(job => job.state === 'running' || job.state === 'queued');
          for (const job of running) await handleUltra({ action: 'task_cancel', job_id: job.id });
          response = { cancelled: running.map(job => job.id) };
        } else throw new Error('Unknown dashboard action');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(response)); return;
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(error) })); return;
    }
    res.writeHead(404); res.end('Not found');
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  } catch (error) { server.close(); throw error; }
  dashboard = server; dashboardPort = port;
  await persist({ event: 'dashboard-start', port });
  return 'http://127.0.0.1:' + dashboardPort;
}
export async function handleUltra(input: UltraInput) {
  try {
    switch (input.action) {
      case 'status': return textResult(status());
      case 'dashboard_start': return textResult({ url: await startDashboard(input.port ?? 8765) });
      case 'dashboard_stop':
        if (dashboard) { dashboard.close(); dashboard = undefined; dashboardPort = 0; }
        return textResult({ stopped: true });
      case 'project_scan':
        if (!input.cwd) return textResult({ error: 'cwd is required' }, true);
        return textResult(await projectScan(input.cwd));
      case 'task_start': {
        if (!input.commands || input.commands.length < 1 || input.commands.length > 25) return textResult({ error: 'Provide 1-25 commands.' }, true);
        const cwd = path.resolve(input.cwd ?? process.cwd());
        const stat = await fs.stat(cwd);
        if (!stat.isDirectory()) return textResult({ error: 'cwd is not a directory' }, true);
        if (jobs.size >= maxJobs) {
          for (const [id, job] of jobs) { if (job.state !== 'running' && job.state !== 'queued') { jobs.delete(id); break; } }
          if (jobs.size >= maxJobs) return textResult({ error: 'Too many active jobs.' }, true);
        }
        const job: Job = { id: randomUUID(), state: 'queued', cwd, steps: input.commands, index: 0, attempts: 0, started: new Date().toISOString(), output: '' };
        jobs.set(job.id, job);
        pendingJobs.push({ job, retries: Math.min(3, Math.max(0, input.retries ?? 0)) });
        scheduleJobs();
        return textResult({ job_id: job.id, state: job.state, steps: job.steps.length, next: 'Use task_status to check progress.' });
      }
      case 'task_status': {
        const job = input.job_id && jobs.get(input.job_id);
        return job ? textResult(compactJob(job)) : textResult({ error: 'Unknown job ID; jobs are in memory after restart. Audit log: ' + jobLog }, true);
      }
      case 'task_cancel': {
        const job = input.job_id && jobs.get(input.job_id);
        if (!job) return textResult({ error: 'Unknown job ID' }, true);
        job.cancel = true; killTree(job.child);
        if (job.state === 'queued') {
          job.state = 'cancelled'; job.ended = new Date().toISOString();
          await persist({ event: 'job-end', job: job.id, state: job.state, exitCode: null });
        }
        return textResult({ job_id: job.id, cancellationRequested: true });
      }
      case 'power': {
        if (process.platform !== 'win32') return textResult({ error: 'Windows only' }, true);
        const op = input.operation;
        if (!['shutdown', 'restart', 'abort'].includes(String(op))) return textResult({ error: 'operation must be shutdown, restart or abort' }, true);
        const args = op === 'shutdown' ? ['/s','/t','30'] : op === 'restart' ? ['/r','/t','30'] : ['/a'];
        const exitCode = await new Promise<number>((resolve) => {
          const child = spawn('shutdown.exe', args, { windowsHide: true, stdio: 'ignore' });
          child.on('error', (error) => { console.error('Ultra power command:', error); resolve(-1); });
          child.on('close', (code) => resolve(code ?? -1));
        });
        await persist({ event: 'power-request', operation: op, exitCode });
        if (exitCode !== 0) return textResult({ error: 'Windows refused the power operation.', exitCode }, true);
        return textResult({ requested: op, delaySeconds: op === 'abort' ? 0 : 30 });
      }
      default: return textResult({ error: 'Unsupported action' }, true);
    }
  } catch (error) { return textResult({ error: String(error) }, true); }
}
// The remote launcher spawns a stdio MCP child. Keep the dashboard in the child
// so that the jobs shown in the UI are the same jobs controlled by MCP tools.
if (process.env.DC_ULTRA_DASHBOARD === '1' && !process.argv.includes('remote')) {
  void startDashboard().catch((error) => console.error('Ultra dashboard start failed:', error));
}
