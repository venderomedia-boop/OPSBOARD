import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-workspace-route-'));
const port=40000+(process.pid%1000);
const child=spawn(process.execPath,['scripts/server-v2.mjs'],{
  cwd:process.cwd(),
  env:{
    ...process.env,
    PORT:String(port),
    OPSBOARD_DATA_DIR:dir,
    COMPLIANCE_DB_PATH:path.join(dir,'opsboard.sqlite'),
    COMPLIANCE_EXPORT_DIR:path.join(dir,'exports'),
    RESEND_API_KEY:'',
    TIMESHEET_EMAIL_FROM:'',
    RESEND_FROM_EMAIL:'',
  },
  stdio:['ignore','pipe','pipe'],
});

let output='';
child.stdout.on('data',(chunk)=>{output+=chunk.toString();});
child.stderr.on('data',(chunk)=>{output+=chunk.toString();});

function waitForReady(timeoutMs=10000){
  return new Promise((resolve,reject)=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      if(output.includes('OPSBOARD v2 listening')){clearInterval(timer);resolve();return;}
      if(child.exitCode!==null){clearInterval(timer);reject(new Error(`Server exited early:\n${output}`));return;}
      if(Date.now()-started>timeoutMs){clearInterval(timer);reject(new Error(`Timed out waiting for server:\n${output}`));}
    },80);
  });
}
async function request(method,pathname,body){
  const response=await fetch(`http://127.0.0.1:${port}${pathname}`,{
    method,
    headers:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(`${method} ${pathname} -> ${response.status}: ${JSON.stringify(data)}`),{status:response.status});
  return data;
}

try{
  await waitForReady();

  const initial=await request('GET','/api/v1/workspace-users?includeInactive=1');
  if(!Array.isArray(initial)||!initial.some(user=>user.role==='owner'))throw new Error('Workspace user route did not return default owner');

  const created=await request('POST','/api/v1/workspace-users',{
    name:'Route Test Dispatcher',
    email:'route.dispatcher@example.com',
    role:'dispatcher',
    permissions:['manage_jobs','manage_schedule'],
  });
  if(created.role!=='dispatcher')throw new Error('Workspace user create route failed');

  const updated=await request('PATCH',`/api/v1/workspace-users/${created.id}`,{
    role:'office_admin',
    permissions:['manage_users','manage_jobs','manage_timesheets'],
  });
  if(updated.role!=='office_admin'||!updated.permissions.includes('manage_users'))throw new Error('Workspace user update route failed');

  const deactivated=await request('DELETE',`/api/v1/workspace-users/${created.id}`);
  if(deactivated.active!==false)throw new Error('Workspace user delete/deactivate route failed');

  const emailStatus=await request('GET','/api/v1/workflow/timesheets/email-status');
  if(emailStatus.configured!==false||emailStatus.hasApiKey!==false||emailStatus.hasSender!==false){
    throw new Error('Timesheet email status should report unconfigured in isolated test');
  }

  console.log('Workspace-user HTTP route build gate passed');
}finally{
  child.kill('SIGTERM');
  await new Promise((resolve)=>setTimeout(resolve,120));
  if(child.exitCode===null)child.kill('SIGKILL');
  fs.rmSync(dir,{recursive:true,force:true});
}
