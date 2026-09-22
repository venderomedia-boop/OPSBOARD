import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-recurring-route-'));
const port=39000+(process.pid%1000);
const env={
  ...process.env,
  PORT:String(port),
  COMPLIANCE_DB_PATH:path.join(tempDir,'opsboard.sqlite'),
  COMPLIANCE_EXPORT_DIR:path.join(tempDir,'exports'),
  OPSBOARD_DATA_DIR:tempDir,
};

const child=spawn(process.execPath,['scripts/server-v2.mjs'],{
  cwd:process.cwd(),
  env,
  stdio:['ignore','pipe','pipe'],
});

let output='';
child.stdout.on('data',(chunk)=>{output+=chunk.toString();});
child.stderr.on('data',(chunk)=>{output+=chunk.toString();});

function waitForReady(timeoutMs=10000){
  return new Promise((resolve,reject)=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      if(output.includes('OPSBOARD v2 listening')){
        clearInterval(timer);
        resolve();
        return;
      }
      if(child.exitCode!==null){
        clearInterval(timer);
        reject(new Error(`Server exited before recurring route smoke test was ready:\n${output}`));
        return;
      }
      if(Date.now()-started>timeoutMs){
        clearInterval(timer);
        reject(new Error(`Timed out waiting for OPSBOARD test server:\n${output}`));
      }
    },80);
  });
}

async function jsonRequest(pathname,options={}){
  const response=await fetch(`http://127.0.0.1:${port}${pathname}`,options);
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`${options.method||'GET'} ${pathname} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

try{
  await waitForReady();

  const overview=await jsonRequest('/api/v1/recurring-work?today=2026-09-22');
  if(overview.today!=='2026-09-22')throw new Error('Recurring overview did not preserve the requested date');
  if(!Array.isArray(overview.schedules))throw new Error('Recurring overview is missing schedules[]');
  if(!overview.counts||typeof overview.counts.total!=='number')throw new Error('Recurring overview is missing counts');

  const run=await jsonRequest('/api/v1/recurring-work/run',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({today:'2026-09-22'}),
  });
  if(!Array.isArray(run.generated)||!Array.isArray(run.skipped)||!Array.isArray(run.rolledForward)){
    throw new Error('Recurring scheduler route returned an invalid response shape');
  }

  const health=await jsonRequest('/health');
  if(health.recurringWork!==true)throw new Error('Health endpoint does not advertise recurring-work capability');

  console.log(`Recurring-work route smoke test passed: schedules=${overview.schedules.length} generated=${run.generated.length}`);
}finally{
  child.kill('SIGTERM');
  await new Promise((resolve)=>setTimeout(resolve,120));
  if(child.exitCode===null)child.kill('SIGKILL');
  fs.rmSync(tempDir,{recursive:true,force:true});
}
