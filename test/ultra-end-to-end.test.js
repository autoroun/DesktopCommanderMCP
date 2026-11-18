/** Full Access fork end-to-end smoke: MCP, jobs, UI and persisted settings. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'scripts','ultra','smoke.mjs');
const { exitCode, output } = await new Promise((resolve,reject) => {
  const child=spawn(process.execPath,[script],{cwd:root,windowsHide:true,env:process.env});
  let output='';
  child.stdout.on('data',b=>{output=(output+b.toString()).slice(-30000)});
  child.stderr.on('data',b=>{output=(output+b.toString()).slice(-30000)});
  child.on('error',reject);
  child.on('close',code=>resolve({exitCode:code,output}));
});
if(exitCode!==0)throw new Error('Ultra end-to-end failure:\n'+output);
console.log(output.trim());
export default function runTests(){return true}
