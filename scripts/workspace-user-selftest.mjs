import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-workspace-user-'));
process.env.OPSBOARD_DATA_DIR=dir;

try{
  const store=await import(`./workflow-store.mjs?workspaceusertest=${Date.now()}`);
  store.resetWorkflowStore();

  const defaults=store.listWorkspaceUsers({includeInactive:true});
  if(!defaults.some(user=>user.role==='owner'&&user.active!==false)) throw new Error('Default active owner is missing');

  const created=store.createWorkspaceUser({
    name:'Sarah Office',
    email:'sarah.office@example.com',
    phone:'0161 555 0101',
    role:'office_admin',
    permissions:['manage_jobs','manage_schedule','manage_timesheets','view_reports'],
  });
  if(created.role!=='office_admin'||created.active!==true) throw new Error('Office user creation failed');

  const updated=store.updateWorkspaceUser(created.id,{
    role:'dispatcher',
    permissions:['manage_jobs','manage_schedule','view_reports'],
  });
  if(updated.role!=='dispatcher'||updated.permissions.includes('manage_users')) throw new Error('Workspace user update failed');

  let duplicateBlocked=false;
  try{store.createWorkspaceUser({name:'Duplicate',email:'sarah.office@example.com',role:'dispatcher'});}catch(error){duplicateBlocked=error?.statusCode===409;}
  if(!duplicateBlocked) throw new Error('Duplicate workspace email was not blocked');

  let engineerDuplicateBlocked=false;
  try{store.createWorkspaceUser({name:'Engineer Duplicate',email:'priya@apexclimate.co.uk',role:'dispatcher'});}catch(error){engineerDuplicateBlocked=error?.statusCode===409;}
  if(!engineerDuplicateBlocked) throw new Error('Engineer/workspace duplicate email was not blocked');

  const deactivated=store.deactivateWorkspaceUser(created.id);
  if(deactivated.active!==false) throw new Error('Workspace user deactivation failed');

  const reactivated=store.updateWorkspaceUser(created.id,{active:true});
  if(reactivated.active!==true) throw new Error('Workspace user reactivation failed');

  const owner=store.listWorkspaceUsers({includeInactive:true}).find(user=>user.role==='owner'&&user.active!==false);
  let lastOwnerBlocked=false;
  try{store.deactivateWorkspaceUser(owner.id);}catch(error){lastOwnerBlocked=error?.statusCode===409;}
  if(!lastOwnerBlocked) throw new Error('Last active owner deactivation was not blocked');

  console.log('Workspace user lifecycle build gate passed');
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}
