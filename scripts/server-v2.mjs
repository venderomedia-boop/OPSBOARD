import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addFormTypeVersion, attachExtraForm, configureJobCompliance, createFormType, createJobTemplate,
  createSite, createSiteAsset, createSiteAssignment, createSiteLocation, deleteSite, deleteSiteAsset,
  deleteSiteAssignment, deleteSiteLocation, getComplianceForms, getComplianceOverview, getFormCatalogue,
  getFormHistory, getFormTypeDetail, getPersistenceInfo, getSiteLocations, getSubmissions,
  resetDemoState, runComplianceSelfTest, saveFormInstance, updateFormType, updateJobTemplate,
  updateSite, updateSiteAsset, updateSiteAssignment, updateSiteLocation,
} from './compliance-engine-v2.mjs';
import { generateComplianceExport, listExports, resolveExport } from './compliance-exports-v2.mjs';
import { handleEmailIntakeApi } from './email-intake-routes.mjs';
import { handleTimesheetApi } from './timesheet-routes.mjs';
import { handleJobReportApi } from './job-report-routes.mjs';
import { getRecurringWorkOverview, runRecurringScheduler } from './recurring-work.mjs';
import { assertScopedRecordAccess, assertSiteScope, assertTechnicianScope, authorizeApiRequest, createWorkspaceUser, deactivateWorkspaceUser, filterComplianceOverview, filterScopedRecords, getCurrentWorkspaceUser, getRbacInfo, listRbacAudit, listRoleTemplates, listWorkspaceUsers, requirePermission, updateWorkspaceUser } from './rbac-store.mjs';
import { createExpense, getExpense, getExpenseReceipt, listExpenses, transitionExpense, updateExpense } from './expense-store.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..','dist');
const port=Number(process.env.PORT||3000);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pdf':'application/pdf'};
function setCors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-JPS-User-Id');}
function json(res,status,payload){setCors(res);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(payload));}
async function readJson(req){const chunks=[];for await(const c of req)chunks.push(c);if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON body'),{statusCode:400});}}
function q(url,key){return url.searchParams.get(key)||undefined;}
function normalizeAssetBody(body){if(!body||typeof body!=='object')return body;if(typeof body.type==='string'){const raw=body.type.trim().toLowerCase();const aliases={'tap':'tap','tap / outlet':'tap','outlet':'tap','shower':'shower','luminaire':'luminaire','light':'luminaire','emergency light':'luminaire','tank':'tank','boiler':'boiler','other':'other'};body.type=aliases[raw]||raw.replace(/\s*\/.*$/,'').replace(/\s+/g,'_');}return body;}
function getDemoStatus(){const expected=['ft-water-temps','ft-shower-descale'];const setup=getComplianceForms('job-7');if(!setup)return{ready:false,baseline:false,jobId:'job-7',displayId:'J-1055',message:'Demo job is not configured'};const formIds=setup.formTypes.map(f=>f.id),instances=setup.instances.filter(i=>expected.includes(i.formTypeId)),counts=Object.fromEntries(expected.map(id=>{const rows=instances.filter(i=>i.formTypeId===id);return[id,{total:rows.length,completed:rows.filter(i=>i.status==='completed').length,inProgress:rows.filter(i=>i.status==='in_progress').length,notStarted:rows.filter(i=>i.status==='not_started').length}];})),extraFormIds=formIds.filter(id=>!expected.includes(id));const ready=expected.every(id=>formIds.includes(id))&&extraFormIds.length===0&&setup.site?.id==='site-1'&&setup.jobTemplate?.id==='jt-quarterly-water-hygiene'&&instances.length>0;const completed=instances.filter(i=>i.status==='completed').length;return{ready,baseline:ready&&completed===0&&instances.every(i=>i.status==='not_started'),jobId:'job-7',displayId:'J-1055',site:{id:setup.site.id,name:setup.site.name},jobTemplate:{id:setup.jobTemplate.id,name:setup.jobTemplate.name},formTypes:setup.formTypes.map(f=>({id:f.id,name:f.name,currentVersion:f.currentVersion})),extraFormIds,totalInstances:instances.length,completedInstances:completed,completionPercent:instances.length?Math.round(completed/instances.length*100):0,counts,locations:setup.siteLocations?.length||0,assets:setup.siteAssets?.length||0,message:ready?'Demo workflow configured':'Demo workflow needs reset'};}
function resetDemo(){resetDemoState();return getDemoStatus();}

function expenseGrant(actor,key){return actor.grants?.find(grant=>grant.permission===key);}
function expenseScope(actor){
  const candidates=['expenses.view_all','expenses.review','expenses.view_team','expenses.view_own']
    .map(key=>({key,grant:expenseGrant(actor,key)})).filter(item=>item.grant);
  const rank={own:1,team:2,contract:3,department:4,all:5};
  return candidates.sort((a,b)=>(rank[b.grant.scope||'own']||0)-(rank[a.grant.scope||'own']||0))[0]?.grant?.scope||'own';
}
function visibleExpenses(req,rows){
  const actor=getCurrentWorkspaceUser(req);
  const scope=expenseScope(actor);
  if(scope==='all'||scope==='department')return rows;
  if(scope==='own')return rows.filter(item=>String(item.technicianId||'')===String(actor.technicianId||'')||item.submitterName===actor.name);
  if(scope==='team'){
    const allowed=new Set([actor.technicianId,...(actor.teamIds||[])].filter(Boolean).map(String));
    return rows.filter(item=>allowed.has(String(item.technicianId||'')));
  }
  if(scope==='contract'){
    const allowed=new Set((actor.contractIds||[]).map(String));
    return rows.filter(item=>allowed.has(String(item.contractId||item.siteId||'')));
  }
  return[];
}
function assertExpenseVisible(req,item){
  if(!item)throw Object.assign(new Error('Expense claim not found'),{statusCode:404});
  if(!visibleExpenses(req,[item]).length)throw Object.assign(new Error('This expense is outside your permitted access scope'),{statusCode:403});
  return item;
}
function createExpenseInputForActor(req,body){
  const actor=getCurrentWorkspaceUser(req);
  const grant=expenseGrant(actor,'expenses.create');
  const scope=grant?.scope||'own';
  if(scope==='own')return{...body,technicianId:actor.technicianId||body.technicianId,submitterName:actor.name};
  return body;
}
function approvalLimit(actor,key){
  const grant=expenseGrant(actor,key);
  return grant?.approvalLimit===undefined?undefined:Number(grant.approvalLimit);
}
function assertExpenseTransition(req,item,next){
  const actor=getCurrentWorkspaceUser(req);
  const selfClaim=Boolean((actor.technicianId&&String(item.technicianId||'')===String(actor.technicianId))||item.submitterName===actor.name);
  if(next==='submitted'){
    if(!actor.permissions.includes('expenses.create'))throw Object.assign(new Error('Permission expenses.create is required'),{statusCode:403});
    return;
  }
  if(next==='rejected'){
    if(!actor.permissions.includes('expenses.review'))throw Object.assign(new Error('Permission expenses.review is required'),{statusCode:403});
    if(selfClaim)throw Object.assign(new Error('You cannot review your own expense claim'),{statusCode:403});
    return;
  }
  if(next==='approved'){
    if(selfClaim)throw Object.assign(new Error('You cannot approve your own expense claim'),{statusCode:403});
    const amount=Number(item.gross||0);
    const l2=approvalLimit(actor,'expenses.approve_l2');
    const l1=approvalLimit(actor,'expenses.approve_l1');
    const allowed=(actor.permissions.includes('expenses.approve_l2')&&(l2===undefined||amount<=l2))
      ||(actor.permissions.includes('expenses.approve_l1')&&(l1===undefined||amount<=l1));
    if(!allowed)throw Object.assign(new Error('This expense exceeds your approval authority'),{statusCode:403});
    return;
  }
  if(next==='reimbursed'){
    if(!actor.permissions.includes('expenses.mark_reimbursed'))throw Object.assign(new Error('Permission expenses.mark_reimbursed is required'),{statusCode:403});
    return;
  }
  if(next==='draft'){
    if(!actor.permissions.includes('expenses.create'))throw Object.assign(new Error('Permission expenses.create is required'),{statusCode:403});
    return;
  }
  throw Object.assign(new Error('Unsupported expense transition'),{statusCode:422});
}

async function handleApi(req,res,url){const p=decodeURIComponent(url.pathname);if(req.method==='OPTIONS'){setCors(res);res.writeHead(204);res.end();return true;}authorizeApiRequest(req,p);
  if(req.method==='GET'&&p==='/api/v1/workspace/me'){json(res,200,getCurrentWorkspaceUser(req));return true;}
  if(req.method==='GET'&&p==='/api/v1/workspace/roles'){json(res,200,listRoleTemplates());return true;}
  if(req.method==='GET'&&p==='/api/v1/workspace/audit'){json(res,200,listRbacAudit({limit:Number(q(url,'limit')||250)}));return true;}
  if(req.method==='GET'&&p==='/api/v1/workspace-users'){json(res,200,listWorkspaceUsers({includeInactive:q(url,'includeInactive')==='1'}));return true;}
  if(req.method==='POST'&&p==='/api/v1/workspace-users'){json(res,201,createWorkspaceUser(req,await readJson(req)));return true;}
  let workspaceUserMatch=p.match(/^\/api\/v1\/workspace-users\/([^/]+)$/);
  if(workspaceUserMatch&&req.method==='PATCH'){json(res,200,updateWorkspaceUser(req,workspaceUserMatch[1],await readJson(req)));return true;}
  if(workspaceUserMatch&&req.method==='DELETE'){json(res,200,deactivateWorkspaceUser(req,workspaceUserMatch[1]));return true;}
  if(req.method==='GET'&&p==='/api/v1/expenses'){
    const rows=listExpenses({technicianId:q(url,'technicianId'),status:q(url,'status')});
    json(res,200,visibleExpenses(req,rows));return true;
  }
  if(req.method==='POST'&&p==='/api/v1/expenses'){
    const body=createExpenseInputForActor(req,await readJson(req));
    json(res,201,createExpense(body));return true;
  }
  let expenseMatch=p.match(/^\/api\/v1\/expenses\/([^/]+)$/);
  if(expenseMatch&&req.method==='GET'){
    json(res,200,assertExpenseVisible(req,getExpense(expenseMatch[1])));return true;
  }
  if(expenseMatch&&req.method==='PATCH'){
    const current=assertExpenseVisible(req,getExpense(expenseMatch[1]));
    const actor=getCurrentWorkspaceUser(req);
    const selfClaim=Boolean((actor.technicianId&&String(current.technicianId||'')===String(actor.technicianId))||current.submitterName===actor.name);
    if(!actor.permissions.includes('expenses.review')&&!selfClaim)throw Object.assign(new Error('You cannot edit this expense claim'),{statusCode:403});
    json(res,200,updateExpense(expenseMatch[1],await readJson(req)));return true;
  }
  let expenseTransitionMatch=p.match(/^\/api\/v1\/expenses\/([^/]+)\/transition$/);
  if(expenseTransitionMatch&&req.method==='POST'){
    const current=assertExpenseVisible(req,getExpense(expenseTransitionMatch[1]));
    const body=await readJson(req);
    assertExpenseTransition(req,current,String(body.status||''));
    json(res,200,transitionExpense(expenseTransitionMatch[1],body));return true;
  }
  let expenseReceiptMatch=p.match(/^\/api\/v1\/expenses\/([^/]+)\/receipt$/);
  if(expenseReceiptMatch&&req.method==='GET'){
    assertExpenseVisible(req,getExpense(expenseReceiptMatch[1]));
    const receipt=getExpenseReceipt(expenseReceiptMatch[1]);
    if(!receipt){json(res,404,{message:'Receipt image not found'});return true;}
    setCors(res);
    res.writeHead(200,{'content-type':receipt.mimeType,'content-length':receipt.buffer.length,'content-disposition':`inline; filename="${String(receipt.name).replace(/"/g,'')}"`,'cache-control':'private, no-store'});
    res.end(receipt.buffer);return true;
  }
  const emailHandled=await handleEmailIntakeApi(req,url,{json:(status,payload)=>json(res,status,payload)});if(emailHandled)return true;
  const timesheetHandled=await handleTimesheetApi(req,res,url,{json:(status,payload)=>json(res,status,payload),readJson});if(timesheetHandled)return true;
  const jobReportHandled=await handleJobReportApi(req,res,url,{json:(status,payload)=>json(res,status,payload),readJson});if(jobReportHandled)return true;
  if(req.method==='GET'&&p==='/api/v1/recurring-work'){json(res,200,getRecurringWorkOverview({today:q(url,'today')}));return true;}
  if(req.method==='POST'&&p==='/api/v1/recurring-work/run'){const body=await readJson(req);json(res,200,runRecurringScheduler(body||{}));return true;}
  if(req.method==='GET'&&p==='/api/v1/compliance/overview'){json(res,200,filterComplianceOverview(req,getComplianceOverview()));return true;}
  if(req.method==='GET'&&p==='/api/v1/compliance/self-test'){const r=runComplianceSelfTest();json(res,r.ok?200:500,r);return true;}
  if(req.method==='GET'&&p==='/api/v1/compliance/persistence'){json(res,200,getPersistenceInfo());return true;}
  if(req.method==='GET'&&p==='/api/v1/demo/status'){const r=getDemoStatus();json(res,r.ready?200:409,r);return true;}
  if(req.method==='POST'&&p==='/api/v1/demo/reset'){json(res,200,resetDemo());return true;}
  if(req.method==='GET'&&p==='/api/v1/form-types'){json(res,200,getFormCatalogue());return true;}
  if(req.method==='GET'&&p==='/api/v1/sites'){json(res,200,filterComplianceOverview(req,getComplianceOverview()).sites);return true;}
  let siteMatch=p.match(/^\/api\/v1\/sites\/([^/]+)$/);
  if(req.method==='GET'&&siteMatch){const overview=getComplianceOverview();const found=overview.sites.find(site=>site.id===siteMatch[1]);if(!found){json(res,404,{message:'Site not found'});return true;}assertSiteScope(req,siteMatch[1],overview);json(res,200,found);return true;}
  if(req.method==='GET'&&p==='/api/v1/site-locations'){const siteId=q(url,'siteId');if(siteId){assertSiteScope(req,siteId,getComplianceOverview());json(res,200,getSiteLocations(siteId));}else{json(res,200,filterComplianceOverview(req,getComplianceOverview()).siteLocations||[]);}return true;}
  if(req.method==='GET'&&p==='/api/v1/submissions'){const overview=filterComplianceOverview(req,getComplianceOverview());const allowedJobs=new Set((overview.jobs||[]).map(job=>String(job.id)));const allowedSites=new Set((overview.sites||[]).map(site=>String(site.id)));const rows=getSubmissions({siteId:q(url,'siteId'),formTypeId:q(url,'formTypeId'),status:q(url,'status'),year:q(url,'year')}).filter(row=>allowedJobs.has(String(row.jobId||''))||allowedSites.has(String(row.siteId||'')));json(res,200,rows);return true;}
  if(req.method==='GET'&&p==='/api/v1/exports'){json(res,200,listExports());return true;}

  let m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms$/);
  if(req.method==='GET'&&m){const r=getComplianceForms(m[1]);json(res,r?200:404,r||{message:'Job has no compliance setup'});return true;}
  m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms\/([^/]+)$/);
  if(req.method==='GET'&&m){const r=getFormTypeDetail(m[1],m[2]);json(res,r?200:404,r||{message:'Compliance form not found for this job'});return true;}
  m=p.match(/^\/api\/v1\/sites\/([^/]+)\/form-types\/([^/]+)\/history$/);
  if(req.method==='GET'&&m){json(res,200,getFormHistory(m[1],m[2],Number(q(url,'year')||new Date().getFullYear())));return true;}

  if(req.method==='POST'&&p==='/api/v1/sites'){json(res,201,createSite(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/sites\/([^/]+)$/);if(m&&(req.method==='PATCH'||req.method==='DELETE')){json(res,200,req.method==='DELETE'?deleteSite(m[1]):updateSite(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/site-locations'){json(res,201,createSiteLocation(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/site-locations\/([^/]+)$/);if(m&&(req.method==='PATCH'||req.method==='DELETE')){json(res,200,req.method==='DELETE'?deleteSiteLocation(m[1]):updateSiteLocation(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/site-assets'){json(res,201,createSiteAsset(normalizeAssetBody(await readJson(req))));return true;}
  m=p.match(/^\/api\/v1\/site-assets\/([^/]+)$/);if(m&&(req.method==='PATCH'||req.method==='DELETE')){json(res,200,req.method==='DELETE'?deleteSiteAsset(m[1]):updateSiteAsset(m[1],normalizeAssetBody(await readJson(req))));return true;}
  if(req.method==='POST'&&p==='/api/v1/site-assignments'){json(res,201,createSiteAssignment(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/site-assignments\/([^/]+)$/);if(m&&(req.method==='PATCH'||req.method==='DELETE')){json(res,200,req.method==='DELETE'?deleteSiteAssignment(m[1]):updateSiteAssignment(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/form-types'){json(res,201,createFormType(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/form-types\/([^/]+)$/);if(m&&req.method==='PATCH'){json(res,200,updateFormType(m[1],await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/form-types\/([^/]+)\/versions$/);if(m&&req.method==='POST'){json(res,201,addFormTypeVersion(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/job-templates'){json(res,201,createJobTemplate(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/job-templates\/([^/]+)$/);if(m&&req.method==='PATCH'){json(res,200,updateJobTemplate(m[1],await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-setup$/);if(m&&req.method==='PATCH'){json(res,200,configureJobCompliance(m[1],await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms\/([^/]+)\/attach$/);if(m&&req.method==='POST'){json(res,200,attachExtraForm(m[1],m[2]));return true;}
  m=p.match(/^\/api\/v1\/form-instances\/([^/]+)$/);if(m&&req.method==='POST'){json(res,200,saveFormInstance(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/exports'){const body=await readJson(req);if(!body.siteId||!body.formTypeId||!body.year)throw Object.assign(new Error('siteId, formTypeId and year are required'),{statusCode:422});json(res,201,await generateComplianceExport(body.siteId,body.formTypeId,body.year,body.format||'both'));return true;}
  return false;
}

const server=http.createServer(async(req,res)=>{const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);const p=decodeURIComponent(url.pathname);try{if(p==='/health'){json(res,200,{ok:true,service:'opsboard',complianceApi:true,recurringWork:true,locationHierarchy:true,persistence:getPersistenceInfo(),rbac:getRbacInfo(),demo:getDemoStatus()});return;}if(p.startsWith('/api/')){if(!(await handleApi(req,res,url)))json(res,404,{message:'API route not found'});return;}if(p.startsWith('/exports/')){const name=p.slice('/exports/'.length),file=resolveExport(name);if(!file){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','content-disposition':`attachment; filename="${path.basename(file)}"`,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);return;}let file=path.join(root,(p==='/'?'index.html':p.replace(/^\/+/,'')));if(!file.startsWith(root)){res.writeHead(403);res.end('Forbidden');return;}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);}catch(error){json(res,Number(error?.statusCode||500),{message:error?.message||'Internal server error',...(error?.details?{details:error.details}:{})});}});
try{
  const startup=runRecurringScheduler({});
  if(startup.generated.length||startup.rolledForward.length)console.log(`Recurring work startup: generated=${startup.generated.length} rolledForward=${startup.rolledForward.length}`);
}catch(error){
  console.warn('Recurring work startup check failed',error?.message||error);
}
const recurringTimer=setInterval(()=>{
  try{
    const run=runRecurringScheduler({});
    if(run.generated.length||run.rolledForward.length)console.log(`Recurring work: generated=${run.generated.length} rolledForward=${run.rolledForward.length}`);
  }catch(error){
    console.warn('Recurring work check failed',error?.message||error);
  }
},30000);
recurringTimer.unref?.();
server.listen(port,'0.0.0.0',()=>console.log(`OPSBOARD v2 listening on ${port}`));
