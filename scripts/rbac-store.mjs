import fs from 'node:fs';
import path from 'node:path';

const dataDir=process.env.JPS_DATA_DIR||path.resolve('data');
const filePath=path.join(dataDir,'workspace-rbac.json');

export const ACCESS_LEVELS=['L0','L1','L2','L3','L4','L5'];
export const ROLE_IDS=[
  'owner','operations_manager','finance_manager','compliance_manager','people_admin',
  'office_admin','dispatcher','lead_engineer','engineer','subcontractor',
];

const permission=(permission,scope='all',approvalLimit)=>({permission,scope,...(approvalLimit===undefined?{}:{approvalLimit})});
const allPermissions=[
  'jobs.view','jobs.create','jobs.edit','jobs.cancel','jobs.delete','jobs.assign','jobs.override_availability','jobs.invoice_handoff',
  'sites.view','sites.manage','assets.manage','compliance.submit','compliance.review','compliance.configure','compliance.export',
  'subcontractors.view','subcontractors.manage','subcontractors.review_compliance','subcontractors.approve','subcontractors.view_financial',
  'purchase_orders.view','purchase_orders.create','purchase_orders.edit_draft','purchase_orders.submit','purchase_orders.approve_l1','purchase_orders.approve_l2','purchase_orders.issue','purchase_orders.receive','purchase_orders.cancel','purchase_orders.view_costs',
  'expenses.view_own','expenses.view_team','expenses.view_all','expenses.create','expenses.review','expenses.approve_l1','expenses.approve_l2','expenses.mark_reimbursed','expenses.export',
  'leave.view_own','leave.view_team_availability','leave.view_private_details','leave.request','leave.administer','leave.approve','leave.override_policy',
  'timesheets.view_own','timesheets.view_team','timesheets.review','timesheets.export',
  'reports.operational','reports.compliance','reports.financial','reports.people',
  'users.view','users.invite','users.edit','users.assign_roles','users.deactivate',
  'settings.company','settings.operational','settings.finance','settings.people','settings.integrations','audit.view',
];

export const ROLE_TEMPLATES={
  owner:{
    id:'owner',label:'Managing Director / System Owner',shortLabel:'Director / Owner',level:'L5',mfaRequired:true,
    description:'Full system ownership, users, configuration, integrations, audit and final approvals.',
    restrictions:'The final active owner cannot be deactivated or demoted.',
    grants:allPermissions.map(key=>permission(key,'all',key==='purchase_orders.approve_l2'||key==='expenses.approve_l2'?Number.MAX_SAFE_INTEGER:undefined)),
  },
  operations_manager:{
    id:'operations_manager',label:'Operations Manager',shortLabel:'Operations Manager',level:'L4',mfaRequired:true,
    description:'Operational control of jobs, scheduling, engineers, PPM, sites, subcontractors and leave.',
    restrictions:'No ownership transfer or integration credentials. Cannot approve own transactions.',
    grants:[
      ...['jobs.view','jobs.create','jobs.edit','jobs.cancel','jobs.assign','jobs.override_availability','sites.view','sites.manage','assets.manage','compliance.submit','compliance.review','compliance.export','subcontractors.view','subcontractors.manage','subcontractors.approve','purchase_orders.view','purchase_orders.create','purchase_orders.edit_draft','purchase_orders.submit','purchase_orders.issue','purchase_orders.receive','purchase_orders.cancel','purchase_orders.view_costs','leave.view_team_availability','leave.approve','timesheets.view_team','timesheets.review','reports.operational','reports.compliance','users.view','settings.operational','audit.view'].map(key=>permission(key,'all')),
      permission('purchase_orders.approve_l1','all',2500),permission('expenses.view_team','department'),permission('expenses.review','department'),permission('expenses.approve_l1','department',500),permission('reports.financial','department'),permission('subcontractors.view_financial','department'),
    ],
  },
  finance_manager:{
    id:'finance_manager',label:'Finance Manager / Senior Bookkeeper',shortLabel:'Finance Manager',level:'L4',mfaRequired:true,
    description:'Purchase orders, expenses, invoice handoff, tax, supplier finance data and reporting.',
    restrictions:'No dispatch authority by default. Cannot approve own transactions.',
    grants:[
      permission('jobs.view','department'),permission('sites.view','department'),permission('subcontractors.view','department'),permission('subcontractors.view_financial','all'),
      ...['purchase_orders.view','purchase_orders.create','purchase_orders.edit_draft','purchase_orders.submit','purchase_orders.issue','purchase_orders.receive','purchase_orders.cancel','purchase_orders.view_costs','expenses.view_all','expenses.review','expenses.mark_reimbursed','expenses.export','reports.financial','settings.finance','audit.view'].map(key=>permission(key,'all')),
      permission('purchase_orders.approve_l1','all',2500),permission('purchase_orders.approve_l2','all',10000),permission('expenses.create','department'),permission('expenses.approve_l1','all',500),permission('expenses.approve_l2','all',2500),permission('leave.view_own','own'),permission('leave.request','own'),permission('timesheets.view_team','department'),permission('timesheets.export','all'),
    ],
  },
  compliance_manager:{
    id:'compliance_manager',label:'Compliance Manager / Contract Manager',shortLabel:'Compliance Manager',level:'L4',mfaRequired:true,
    description:'Sites, assets, compliance forms, statutory evidence, PPM standards and subcontractor credentials.',
    restrictions:'No payroll, banking information or unrestricted finance approval.',
    grants:[
      ...['jobs.view','sites.view','sites.manage','assets.manage','compliance.submit','compliance.review','compliance.configure','compliance.export','subcontractors.view','subcontractors.review_compliance','reports.compliance'].map(key=>permission(key,'all')),
      permission('subcontractors.manage','department'),permission('purchase_orders.view','contract'),permission('expenses.view_own','own'),permission('expenses.view_team','team'),permission('leave.view_own','own'),permission('leave.request','own'),permission('timesheets.view_team','contract'),permission('reports.operational','contract'),permission('audit.view','department'),
    ],
  },
  people_admin:{
    id:'people_admin',label:'HR / People Administrator',shortLabel:'People Administrator',level:'L4',mfaRequired:true,
    description:'Onboarding, offboarding, staff accounts, annual leave, entitlement and people administration.',
    restrictions:'No job pricing, supplier bank details or operational PO approval.',
    grants:[
      permission('leave.view_own','own'),permission('leave.view_team_availability','all'),permission('leave.view_private_details','department'),permission('leave.request','own'),permission('leave.administer','all'),permission('leave.approve','all'),permission('leave.override_policy','department'),
      permission('timesheets.view_team','department'),permission('reports.people','all'),permission('users.view','all'),permission('users.invite','all'),permission('users.edit','all'),permission('users.deactivate','all'),permission('settings.people','department'),permission('audit.view','department'),
    ],
  },
  office_admin:{
    id:'office_admin',label:'Office Administrator / Service Coordinator',shortLabel:'Office Administrator',level:'L3',
    description:'Broad create/update access across daily office workflows.',
    restrictions:'No privileged role grants, integrations or high-risk approvals.',
    grants:[
      ...['jobs.view','jobs.create','jobs.edit','jobs.assign','sites.view','subcontractors.view'].map(key=>permission(key,'all')),
      ...['jobs.cancel','sites.manage','assets.manage','compliance.submit','compliance.review','compliance.export','subcontractors.manage','purchase_orders.view','purchase_orders.create','purchase_orders.edit_draft','purchase_orders.submit','expenses.view_team','expenses.create','expenses.review','leave.administer','timesheets.view_team','timesheets.review','reports.operational','reports.compliance'].map(key=>permission(key,'department')),
      permission('leave.view_own','own'),permission('leave.view_team_availability','all'),permission('leave.request','own'),
    ],
  },
  dispatcher:{
    id:'dispatcher',label:'Dispatcher / Planner',shortLabel:'Dispatcher',level:'L3',
    description:'Jobs, assignments, diary, buildings, PPM and engineer availability.',
    restrictions:'Finance read-only. No approvals, private leave details or user/security administration.',
    grants:[
      ...['jobs.view','jobs.create','jobs.edit','jobs.assign','sites.view','subcontractors.view','leave.view_team_availability'].map(key=>permission(key,'all')),
      permission('jobs.cancel','department'),permission('compliance.submit','contract'),permission('purchase_orders.view','contract'),permission('purchase_orders.create','contract'),permission('expenses.view_own','own'),permission('leave.view_own','own'),permission('leave.request','own'),permission('timesheets.view_team','team'),permission('reports.operational','department'),
    ],
  },
  lead_engineer:{
    id:'lead_engineer',label:'Lead Engineer / Supervisor',shortLabel:'Lead Engineer',level:'L2',
    description:'Own and supervised-team jobs, evidence, exceptions and material requests.',
    restrictions:'No company-wide finance or settings. No self-approval.',
    grants:[
      ...['jobs.view','jobs.create','jobs.edit','jobs.assign','jobs.invoice_handoff','sites.view','compliance.submit','compliance.review','subcontractors.view','purchase_orders.view','purchase_orders.create','expenses.view_team','leave.view_team_availability','timesheets.view_team','timesheets.review','reports.operational'].map(key=>permission(key,'team')),
      permission('expenses.view_own','own'),permission('expenses.create','own'),permission('leave.view_own','own'),permission('leave.request','own'),permission('timesheets.view_own','own'),
    ],
  },
  engineer:{
    id:'engineer',label:'Field Engineer',shortLabel:'Field Engineer',level:'L1',
    description:'Assigned jobs, required site details, forms, evidence and own records.',
    restrictions:'No other staff personal data, approvals, company finance or settings.',
    grants:[permission('jobs.view','own'),permission('jobs.create','contract'),permission('jobs.edit','own'),permission('jobs.invoice_handoff','own'),permission('sites.view','contract'),permission('compliance.submit','own'),permission('purchase_orders.create','own'),permission('expenses.view_own','own'),permission('expenses.create','own'),permission('leave.view_own','own'),permission('leave.request','own'),permission('timesheets.view_own','own')],
  },
  subcontractor:{
    id:'subcontractor',label:'Subcontractor / External Operative',shortLabel:'Subcontractor',level:'L1',external:true,
    description:'Restricted external access to specifically assigned jobs.',
    restrictions:'No internal diary, customer portfolio, staff data, pricing, reports or settings.',
    grants:[permission('jobs.view','contract'),permission('sites.view','contract'),permission('compliance.submit','contract'),permission('expenses.create','contract'),permission('timesheets.view_own','own')],
  },
};

const clone=value=>JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();
const levelRank={L0:0,L1:1,L2:2,L3:3,L4:4,L5:5};
function ensureDir(){fs.mkdirSync(dataDir,{recursive:true});}
function emptyState(){
  const now=nowIso();
  return {
    nextUserNumber:2,
    nextAuditNumber:1,
    users:[
      {
        id:'workspace-user-1',name:'Karen Doyle',email:'karen.doyle@jps.example',phone:'+44 161 555 0142',
        role:'owner',roleIds:['owner'],accessLevel:'L5',permissionOverrides:[],teamIds:[],contractIds:[],technicianId:null,
        mfaRequired:true,lastAccessReviewAt:now,active:true,createdAt:now,updatedAt:now,
      },
      {
        id:'workspace-user-field-1',name:'Marcus Reed',email:'marcus@apexclimate.co.uk',phone:'',
        role:'engineer',roleIds:['engineer'],accessLevel:'L1',permissionOverrides:[],teamIds:[],contractIds:['site-1'],technicianId:'user-1',
        mfaRequired:false,lastAccessReviewAt:now,active:true,createdAt:now,updatedAt:now,
      },
    ],
    audit:[],
  };
}
function readState(){
  ensureDir();
  if(!fs.existsSync(filePath)) return emptyState();
  try{
    const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
    const base=emptyState();
    return {...base,...parsed,users:Array.isArray(parsed.users)?parsed.users.map(normalizeUser):base.users,audit:Array.isArray(parsed.audit)?parsed.audit:[]};
  }catch{return emptyState();}
}
function writeState(state){ensureDir();const tmp=`${filePath}.tmp`;fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,filePath);}
function normalizeRoleIds(value,legacyRole){
  const raw=Array.isArray(value)&&value.length?value:[legacyRole||'dispatcher'];
  const ids=[...new Set(raw.map(String).filter(id=>ROLE_IDS.includes(id)))];
  return ids.length?ids:['dispatcher'];
}
function accessLevelForRoles(roleIds){
  return roleIds.reduce((highest,id)=>{
    const level=ROLE_TEMPLATES[id]?.level||'L0';
    return levelRank[level]>levelRank[highest]?level:highest;
  },'L0');
}
function grantsForRoles(roleIds){
  const byPermission=new Map();
  const scopeRank={own:1,team:2,contract:3,department:4,all:5};
  for(const roleId of roleIds){
    for(const grant of ROLE_TEMPLATES[roleId]?.grants||[]){
      const current=byPermission.get(grant.permission);
      if(!current){byPermission.set(grant.permission,{...grant});continue;}
      byPermission.set(grant.permission,{
        permission:grant.permission,
        scope:(scopeRank[grant.scope||'own']>scopeRank[current.scope||'own'])?grant.scope:current.scope,
        approvalLimit:Math.max(current.approvalLimit||0,grant.approvalLimit||0)||undefined,
      });
    }
  }
  return [...byPermission.values()];
}
function applyOverrides(grants,overrides=[]){
  const map=new Map(grants.map(grant=>[grant.permission,{...grant}]));
  for(const override of overrides){
    if(!allPermissions.includes(override.permission))continue;
    if(override.effect==='deny') map.delete(override.permission);
    else map.set(override.permission,{permission:override.permission,scope:override.scope||'own',...(override.approvalLimit===undefined?{}:{approvalLimit:Number(override.approvalLimit)})});
  }
  return [...map.values()];
}
function normalizeUser(user){
  const roleIds=normalizeRoleIds(user.roleIds,user.role);
  const templateGrants=grantsForRoles(roleIds);
  const permissionOverrides=Array.isArray(user.permissionOverrides)?user.permissionOverrides:[];
  const grants=applyOverrides(templateGrants,permissionOverrides);
  const active=user.active!==false;
  return {
    ...user,
    role:roleIds[0],
    roleIds,
    accessLevel:active?accessLevelForRoles(roleIds):'L0',
    permissionOverrides,
    permissions:grants.map(grant=>grant.permission),
    grants,
    teamIds:Array.isArray(user.teamIds)?user.teamIds:[],
    contractIds:Array.isArray(user.contractIds)?user.contractIds:[],
    mfaRequired:roleIds.some(id=>Boolean(ROLE_TEMPLATES[id]?.mfaRequired)),
    active,
  };
}
function publicUser(user){return clone(normalizeUser(user));}
function validateEmail(value){
  const email=String(value||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error('email must be valid'),{statusCode:422});
  return email;
}
function required(value,label){const v=String(value||'').trim();if(!v)throw Object.assign(new Error(`${label} is required`),{statusCode:422});return v;}
function writeAudit(state,{actorId,action,targetId,details={}}){
  const item={id:`rbac-audit-${state.nextAuditNumber++}`,actorId,action,targetId,details,createdAt:nowIso()};
  state.audit.push(item);return item;
}
function actorFromHeader(req,state=readState()){
  const requested=String(req?.headers?.['x-jps-user-id']||'').trim();
  const actor=requested?state.users.find(user=>user.id===requested&&user.active!==false):state.users.find(user=>user.id==='workspace-user-1'&&user.active!==false);
  if(!actor)throw Object.assign(new Error('Authenticated workspace user is required'),{statusCode:401});
  return normalizeUser(actor);
}
function hasPermission(user,key){return user.active!==false&&user.grants.some(grant=>grant.permission===key);}
function highestRequestedLevel(roleIds){return accessLevelForRoles(roleIds);}
function activeOwners(state){return state.users.filter(user=>user.active!==false&&normalizeRoleIds(user.roleIds,user.role).includes('owner'));}

export function listRoleTemplates(){return clone(Object.values(ROLE_TEMPLATES));}
export function getWorkspaceUser(userId){const state=readState();const user=state.users.find(item=>item.id===userId);return user?publicUser(user):null;}
export function getCurrentWorkspaceUser(req){return publicUser(actorFromHeader(req));}
export function listWorkspaceUsers({includeInactive=false}={}){const state=readState();return state.users.filter(user=>includeInactive||user.active!==false).map(publicUser);}
export function listRbacAudit({limit=250}={}){const state=readState();return clone(state.audit.slice(-Math.max(1,Math.min(1000,Number(limit)||250))).reverse());}

export function requirePermission(req,key){
  const state=readState();
  const actor=actorFromHeader(req,state);
  if(!hasPermission(actor,key)){
    writeAudit(state,{actorId:actor.id,action:'access.denied',targetId:actor.id,details:{permission:key}});
    writeState(state);
    throw Object.assign(new Error(`Permission ${key} is required`),{statusCode:403});
  }
  return actor;
}

export function requireAnyPermission(req,keys=[]){
  const state=readState();
  const actor=actorFromHeader(req,state);
  if(!keys.some(key=>hasPermission(actor,key))){
    writeAudit(state,{actorId:actor.id,action:'access.denied',targetId:actor.id,details:{permissions:keys}});
    writeState(state);
    throw Object.assign(new Error(`One of these permissions is required: ${keys.join(', ')}`),{statusCode:403});
  }
  return actor;
}

function permissionGrant(actor,key){
  return actor.grants.find(grant=>grant.permission===key);
}

function technicianIdsFor(record){
  return [...new Set([
    ...(Array.isArray(record?.assignedTechnicianIds)?record.assignedTechnicianIds:[]),
    record?.assignedTechnicianId,
    record?.technicianId,
  ].filter(Boolean).map(String))];
}

function contractIdentifiersFor(record){
  return [...new Set([
    record?.contractId,
    record?.siteId,
    record?.customerId,
    record?.customer?.id,
  ].filter(Boolean).map(String))];
}

function scopedRecordAllowed(actor,grant,record,kind='job'){
  const scope=grant?.scope||'own';
  if(scope==='all'||scope==='department')return true;

  const ownTechnicianId=actor.technicianId?String(actor.technicianId):'';
  const technicianIds=technicianIdsFor(record);

  if(scope==='own'){
    if(kind==='user')return record?.id===actor.id;
    return Boolean(ownTechnicianId&&technicianIds.includes(ownTechnicianId));
  }

  if(scope==='team'){
    const allowed=new Set([ownTechnicianId,...(actor.teamIds||[]).map(String)].filter(Boolean));
    const recordTeamId=record?.teamId?String(record.teamId):'';
    return technicianIds.some(id=>allowed.has(id))||Boolean(recordTeamId&&allowed.has(recordTeamId));
  }

  if(scope==='contract'){
    const allowed=new Set((actor.contractIds||[]).map(String));
    return contractIdentifiersFor(record).some(id=>allowed.has(id));
  }

  return false;
}

export function filterScopedRecords(req,key,records=[],kind='job'){
  const actor=requirePermission(req,key);
  const grant=permissionGrant(actor,key);
  return clone((Array.isArray(records)?records:[]).filter(record=>scopedRecordAllowed(actor,grant,record,kind)));
}

export function assertScopedRecordAccess(req,key,record,kind='job'){
  const actor=requirePermission(req,key);
  const grant=permissionGrant(actor,key);
  if(!record)return null;
  if(scopedRecordAllowed(actor,grant,record,kind))return record;

  const state=readState();
  writeAudit(state,{actorId:actor.id,action:'scope.denied',targetId:String(record?.id||'unknown'),details:{permission:key,scope:grant?.scope||'own',kind}});
  writeState(state);
  throw Object.assign(new Error('This record is outside your permitted access scope'),{statusCode:403});
}

export function assertTechnicianScope(req,key,technicianIds=[]){
  const actor=requirePermission(req,key);
  const grant=permissionGrant(actor,key);
  const scope=grant?.scope||'own';
  const ids=[...new Set((Array.isArray(technicianIds)?technicianIds:[technicianIds]).filter(Boolean).map(String))];
  if(!ids.length||scope==='all'||scope==='department')return ids;

  const allowed=new Set([actor.technicianId,...(scope==='team'?(actor.teamIds||[]):[])].filter(Boolean).map(String));
  if(ids.every(id=>allowed.has(id)))return ids;

  const state=readState();
  writeAudit(state,{actorId:actor.id,action:'scope.denied',targetId:actor.id,details:{permission:key,scope,technicianIds:ids}});
  writeState(state);
  throw Object.assign(new Error('One or more engineers are outside your permitted assignment scope'),{statusCode:403});
}

export function filterComplianceOverview(req,overview={}){
  const actor=requireAnyPermission(req,['sites.view','reports.compliance']);
  const normalized={
    ...overview,
    sites:Array.isArray(overview.sites)?overview.sites:[],
    siteLocations:Array.isArray(overview.siteLocations)?overview.siteLocations:[],
    siteAssets:Array.isArray(overview.siteAssets)?overview.siteAssets:[],
    formTypes:Array.isArray(overview.formTypes)?overview.formTypes:[],
    jobTemplates:Array.isArray(overview.jobTemplates)?overview.jobTemplates:[],
    formInstances:Array.isArray(overview.formInstances)?overview.formInstances:[],
    siteAssignments:Array.isArray(overview.siteAssignments)?overview.siteAssignments:[],
    jobs:Array.isArray(overview.jobs)?overview.jobs:[],
  };
  const grants=['sites.view','reports.compliance'].map(key=>permissionGrant(actor,key)).filter(Boolean);
  const rank={own:1,team:2,contract:3,department:4,all:5};
  const grant=grants.sort((a,b)=>(rank[b.scope||'own']||0)-(rank[a.scope||'own']||0))[0];
  const scope=grant?.scope||'own';
  if(scope==='all'||scope==='department')return clone(normalized);

  const allJobs=normalized.jobs;
  let scopedJobs=[];
  if(scope==='contract'){
    const allowed=new Set((actor.contractIds||[]).map(String));
    scopedJobs=allJobs.filter(job=>contractIdentifiersFor(job).some(id=>allowed.has(id)));
  }else{
    scopedJobs=allJobs.filter(job=>scopedRecordAllowed(actor,grant,job,'job'));
  }

  const siteIds=new Set(scopedJobs.map(job=>job.siteId).filter(Boolean).map(String));
  if(scope==='contract')for(const id of actor.contractIds||[])siteIds.add(String(id));
  const jobIds=new Set(scopedJobs.map(job=>job.id).filter(Boolean).map(String));

  const filterSiteRows=(rows=[])=>rows.filter(row=>siteIds.has(String(row.siteId||row.id||'')));
  return clone({
    ...normalized,
    sites:normalized.sites.filter(site=>siteIds.has(String(site.id))),
    siteLocations:filterSiteRows(normalized.siteLocations),
    siteAssets:filterSiteRows(normalized.siteAssets),
    siteAssignments:filterSiteRows(normalized.siteAssignments),
    jobs:scopedJobs,
    formInstances:normalized.formInstances.filter(instance=>jobIds.has(String(instance.jobId||''))||siteIds.has(String(instance.siteId||''))),
  });
}

export function assertSiteScope(req,siteId,overview={}){
  const scoped=filterComplianceOverview(req,overview);
  if((scoped.sites||[]).some(site=>String(site.id)===String(siteId)))return true;
  const actor=actorFromHeader(req);
  const state=readState();
  writeAudit(state,{actorId:actor.id,action:'scope.denied',targetId:String(siteId),details:{permission:'sites.view',kind:'site'}});
  writeState(state);
  throw Object.assign(new Error('This site is outside your permitted access scope'),{statusCode:403});
}

export function authorizeApiRequest(req,pathName){
  const method=String(req.method||'GET').toUpperCase();
  const path=String(pathName||'');

  // Current user resolution is always allowed once an actor can be resolved.
  if(path==='/api/v1/workspace/me'){actorFromHeader(req);return;}
  if(path==='/api/v1/workspace/roles'){requirePermission(req,'users.view');return;}
  if(path==='/api/v1/workspace/audit'){requirePermission(req,'audit.view');return;}
  if(path==='/api/v1/workspace-users'){
    requirePermission(req,method==='POST'?'users.invite':'users.view');return;
  }
  if(/^\/api\/v1\/workspace-users\/[^/]+$/.test(path)){
    requirePermission(req,method==='DELETE'?'users.deactivate':'users.edit');return;
  }

  if(path.startsWith('/api/v1/workflow/technicians')){
    requireAnyPermission(req,method==='GET'?['jobs.assign','users.view']:method==='DELETE'?['users.deactivate']:['users.edit','jobs.assign']);return;
  }
  if(path.startsWith('/api/v1/workflow/job-assignments')||/^\/api\/v1\/workflow\/jobs\/[^/]+\/assignments$/.test(path)){
    requirePermission(req,method==='GET'?'jobs.view':'jobs.assign');return;
  }
  // Specific job subresources must be checked before the generic jobs route.
  if(path.startsWith('/api/v1/workflow/job-events')||/\/workflow\/jobs\/[^/]+\/events$/.test(path)){
    requirePermission(req,method==='GET'?'jobs.view':'jobs.edit');return;
  }
  if(/\/workflow\/jobs\/[^/]+\/media(?:\/[^/]+)?$/.test(path)){
    requirePermission(req,method==='GET'?'jobs.view':'jobs.edit');return;
  }
  if(/\/api\/v1\/(?:workflow\/)?jobs\/[^/]+\/invoice-stubs$/.test(path)){
    requirePermission(req,method==='GET'?'purchase_orders.view_costs':'reports.financial');return;
  }
  if(path.startsWith('/api/v1/workflow/jobs')){
    if(method==='GET')requirePermission(req,'jobs.view');
    else if(method==='POST')requirePermission(req,'jobs.create');
    else if(method==='PATCH')requirePermission(req,'jobs.edit');
    else if(method==='DELETE')requirePermission(req,'jobs.delete');
    return;
  }
  if(path.startsWith('/api/v1/workflow/dashboard')){
    requirePermission(req,'reports.operational');return;
  }
  if(path.startsWith('/api/v1/workflow/me/assignments')){
    requirePermission(req,'jobs.view');return;
  }

  if(path.startsWith('/api/v1/sites')||path.startsWith('/api/v1/site-locations')){
    requirePermission(req,method==='GET'?'sites.view':'sites.manage');return;
  }
  if(path.startsWith('/api/v1/site-assets')){
    requirePermission(req,method==='GET'?'sites.view':'assets.manage');return;
  }
  if(path.startsWith('/api/v1/site-assignments')){
    requirePermission(req,method==='GET'?'sites.view':'sites.manage');return;
  }
  if(path.startsWith('/api/v1/form-types')||path.startsWith('/api/v1/job-templates')){
    requirePermission(req,method==='GET'?'compliance.review':'compliance.configure');return;
  }
  if(path.includes('/compliance-forms')||path.includes('/compliance-setup')||path.startsWith('/api/v1/form-instances')){
    if(method==='GET')requireAnyPermission(req,['compliance.submit','compliance.review']);
    else requirePermission(req,'compliance.submit');
    return;
  }
  if(path.startsWith('/api/v1/submissions')){
    requirePermission(req,'compliance.review');return;
  }
  if(path.startsWith('/api/v1/exports')){
    requirePermission(req,'compliance.export');return;
  }
  if(path.startsWith('/api/v1/recurring-work')){
    requirePermission(req,method==='GET'?'jobs.view':'jobs.edit');return;
  }
  if(path.startsWith('/api/v1/workflow/timesheets')){
    if(/\/export\.(?:txt|pdf|csv|xlsx)$/.test(path))requirePermission(req,'timesheets.export');
    else if(/\/email$/.test(path))requireAnyPermission(req,['timesheets.export','timesheets.review']);
    else if(method==='GET')requireAnyPermission(req,['timesheets.view_own','timesheets.view_team','timesheets.review']);
    else requireAnyPermission(req,['timesheets.view_own','timesheets.view_team','timesheets.review']);
    return;
  }
  if(path==='/api/v1/leave'){
    if(method==='GET')requireAnyPermission(req,['leave.view_own','leave.view_team_availability','leave.view_private_details','leave.administer','leave.approve']);
    else if(method==='POST')requireAnyPermission(req,['leave.request','leave.administer']);
    return;
  }
  if(/^\/api\/v1\/leave\/[^/]+\/transition$/.test(path)){
    requireAnyPermission(req,['leave.request','leave.administer','leave.approve']);
    return;
  }
  if(/^\/api\/v1\/leave\/[^/]+$/.test(path)){
    requireAnyPermission(req,['leave.view_own','leave.view_team_availability','leave.view_private_details','leave.administer','leave.approve']);
    return;
  }
  if(path==='/api/v1/expenses'){
    if(method==='GET')requireAnyPermission(req,['expenses.view_own','expenses.view_team','expenses.view_all','expenses.review']);
    else if(method==='POST')requirePermission(req,'expenses.create');
    return;
  }
  if(/^\/api\/v1\/expenses\/[^/]+\/receipt$/.test(path)){
    requireAnyPermission(req,['expenses.view_own','expenses.view_team','expenses.view_all','expenses.review']);
    return;
  }
  if(/^\/api\/v1\/expenses\/[^/]+\/transition$/.test(path)){
    requireAnyPermission(req,['expenses.create','expenses.review','expenses.approve_l1','expenses.approve_l2','expenses.mark_reimbursed']);
    return;
  }
  if(/^\/api\/v1\/expenses\/[^/]+$/.test(path)){
    requireAnyPermission(req,method==='GET'
      ? ['expenses.view_own','expenses.view_team','expenses.view_all','expenses.review']
      : ['expenses.create','expenses.review']);
    return;
  }
  // Provider inbound webhook authenticates with its own signature/API-key controls.
  if(path==='/api/v1/email/inbound')return;
  if(path.startsWith('/api/v1/email-intake')){
    requirePermission(req,method==='GET'?'jobs.view':'jobs.create');return;
  }
  if(/\/api\/v1\/(?:workflow\/)?jobs\/[^/]+\/invoice-stubs$/.test(path)){
    requirePermission(req,method==='POST'?'jobs.invoice_handoff':'jobs.view');return;
  }
  if(path.includes('/invoice-stubs')){
    requirePermission(req,method==='GET'?'jobs.view':'reports.financial');return;
  }
  if(path==='/api/v1/workflow/job-report/pdf'||path.startsWith('/api/v1/job-reports')||/\/api\/v1\/jobs\/[^/]+\/report/.test(path)){
    requirePermission(req,'reports.operational');return;
  }
  if(path==='/api/v1/compliance/overview'){
    requireAnyPermission(req,['sites.view','reports.compliance']);return;
  }
  if(path.startsWith('/api/v1/compliance/persistence')||path.startsWith('/api/v1/compliance/self-test')){
    requireAnyPermission(req,['compliance.configure','settings.operational']);return;
  }

  // Demo utilities are operational-administration functions.
  if(path.startsWith('/api/v1/demo/')){requirePermission(req,'settings.operational');return;}

  // RBAC is deny-by-default. Every new API surface must receive an explicit policy.
  if(path.startsWith('/api/v1/'))throw Object.assign(new Error('No RBAC policy is configured for this API route'),{statusCode:403});
}

export function createWorkspaceUser(req,input={}){
  const actor=requirePermission(req,'users.invite');
  const state=readState();
  const name=required(input.name,'name');
  const email=validateEmail(input.email);
  if(state.users.some(user=>String(user.email||'').toLowerCase()===email))throw Object.assign(new Error('A workspace user with this email already exists'),{statusCode:409});
  const roleIds=normalizeRoleIds(input.roleIds,input.role);
  const requestedLevel=highestRequestedLevel(roleIds);
  if(levelRank[requestedLevel]>=4&&!hasPermission(actor,'users.assign_roles'))throw Object.assign(new Error('Owner approval is required for L4/L5 access'),{statusCode:403});
  if(roleIds.includes('owner')&&!actor.roleIds.includes('owner'))throw Object.assign(new Error('Only an owner can grant system ownership'),{statusCode:403});
  if(Array.isArray(input.permissionOverrides)&&input.permissionOverrides.length&&!hasPermission(actor,'users.assign_roles'))throw Object.assign(new Error('Only a privileged role administrator can set permission exceptions'),{statusCode:403});
  const now=nowIso();
  const item=normalizeUser({
    id:`workspace-user-${state.nextUserNumber++}`,name,email,phone:String(input.phone||'').trim(),
    role:roleIds[0],roleIds,permissionOverrides:Array.isArray(input.permissionOverrides)?input.permissionOverrides:[],
    teamIds:Array.isArray(input.teamIds)?input.teamIds.map(String):[],contractIds:Array.isArray(input.contractIds)?input.contractIds.map(String):[],
    technicianId:input.technicianId?String(input.technicianId):null,lastAccessReviewAt:input.lastAccessReviewAt||now,
    active:input.active!==false,createdAt:now,updatedAt:now,
  });
  state.users.push(item);
  writeAudit(state,{actorId:actor.id,action:'user.created',targetId:item.id,details:{roleIds:item.roleIds,accessLevel:item.accessLevel,permissionOverrides:item.permissionOverrides?.length||0}});
  writeState(state);
  return publicUser(item);
}

export function updateWorkspaceUser(req,userId,patch={}){
  const actor=requirePermission(req,'users.edit');
  const state=readState();
  const index=state.users.findIndex(user=>user.id===userId);
  if(index<0)throw Object.assign(new Error('Workspace user not found'),{statusCode:404});
  const current=normalizeUser(state.users[index]);
  const next={...current};
  if('name' in patch)next.name=required(patch.name,'name');
  if('email' in patch){
    const email=validateEmail(patch.email);
    if(state.users.some(user=>user.id!==userId&&String(user.email||'').toLowerCase()===email))throw Object.assign(new Error('A workspace user with this email already exists'),{statusCode:409});
    next.email=email;
  }
  if('phone' in patch)next.phone=String(patch.phone||'').trim();
  if('teamIds' in patch)next.teamIds=Array.isArray(patch.teamIds)?patch.teamIds.map(String):[];
  if('contractIds' in patch)next.contractIds=Array.isArray(patch.contractIds)?patch.contractIds.map(String):[];
  if('technicianId' in patch)next.technicianId=patch.technicianId?String(patch.technicianId):null;
  if('lastAccessReviewAt' in patch)next.lastAccessReviewAt=String(patch.lastAccessReviewAt||'');

  if('roleIds' in patch||'role' in patch){
    const roleIds=normalizeRoleIds(patch.roleIds,patch.role);
    const requestedLevel=highestRequestedLevel(roleIds);
    const currentLevel=highestRequestedLevel(current.roleIds);
    const privilegedChange=levelRank[requestedLevel]>=4||levelRank[currentLevel]>=4||roleIds.includes('owner')||current.roleIds.includes('owner');
    if(privilegedChange&&!hasPermission(actor,'users.assign_roles'))throw Object.assign(new Error('Owner approval is required for L4/L5 role changes'),{statusCode:403});
    if(roleIds.includes('owner')&&!actor.roleIds.includes('owner'))throw Object.assign(new Error('Only an owner can grant system ownership'),{statusCode:403});
    if(current.roleIds.includes('owner')&&!roleIds.includes('owner')&&activeOwners(state).length<=1)throw Object.assign(new Error('The final active owner cannot be demoted'),{statusCode:409});
    next.roleIds=roleIds;next.role=roleIds[0];
  }
  if('permissionOverrides' in patch){
    if(!hasPermission(actor,'users.assign_roles'))throw Object.assign(new Error('Permission users.assign_roles is required'),{statusCode:403});
    next.permissionOverrides=Array.isArray(patch.permissionOverrides)?patch.permissionOverrides:[];
  }
  if('active' in patch){
    const becomingInactive=patch.active===false&&current.active!==false;
    if(becomingInactive&&current.roleIds.includes('owner')&&activeOwners(state).length<=1)throw Object.assign(new Error('The final active owner cannot be deactivated'),{statusCode:409});
    next.active=patch.active!==false;
  }
  next.updatedAt=nowIso();
  const normalized=normalizeUser(next);
  state.users[index]=normalized;
  writeAudit(state,{actorId:actor.id,action:'user.updated',targetId:userId,details:{roleIds:normalized.roleIds,accessLevel:normalized.accessLevel,active:normalized.active,permissionOverrides:normalized.permissionOverrides?.length||0}});
  writeState(state);
  return publicUser(normalized);
}

export function deactivateWorkspaceUser(req,userId){
  requirePermission(req,'users.deactivate');
  return updateWorkspaceUser(req,userId,{active:false});
}

export function getRbacInfo(){
  const state=readState();
  return {filePath,users:state.users.length,active:state.users.filter(user=>user.active!==false).length,roles:ROLE_IDS.length,auditEvents:state.audit.length};
}
