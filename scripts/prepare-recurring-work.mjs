import fs from 'node:fs';
import path from 'node:path';

let changed = false;

const engineFile = path.resolve('scripts/compliance-engine-v2.mjs');
let engine = fs.readFileSync(engineFile, 'utf8');

const normalizeMarker = "  s.jobs=s.jobs.map(j=>({...j,extraFormTypeIds:Array.isArray(j.extraFormTypeIds)?j.extraFormTypeIds:[]}));";
const normalizedSchedules = `${normalizeMarker}\n  s.siteAssignments=s.siteAssignments.map(a=>({...a,nextDueDate:a.nextDueDate||null,leadDays:Math.max(0,Math.min(90,Number(a.leadDays??21)||21)),autoCreate:a.autoCreate!==false,durationMinutes:Math.max(15,Number(a.durationMinutes??90)||90),priority:a.priority==='urgent'?'urgent':'normal',serviceType:a.serviceType||'',lastGeneratedJobId:a.lastGeneratedJobId||null,lastGeneratedDueDate:a.lastGeneratedDueDate||null,lastCompletedJobId:a.lastCompletedJobId||null,lastCompletedAt:a.lastCompletedAt||null}));`;
if (engine.includes(normalizeMarker) && !engine.includes('usageIntervalHours') && !engine.includes('durationMinutes:Math.max(15,Number(a.durationMinutes??90)')) {
  engine = engine.replace(normalizeMarker, normalizedSchedules);
  changed = true;
}

const assignmentOriginal = "const item={id:input.id||makeId('assign',`${input.siteId}-${input.formTypeId}`),siteId:input.siteId,formTypeId:input.formTypeId,jobTemplateId:input.jobTemplateId||null,frequency:input.frequency||formType(input.formTypeId).frequency||'ad_hoc',active:input.active!==false,nextDueDate:input.nextDueDate||null};";
const assignmentExpanded = "const item={id:input.id||makeId('assign',`${input.siteId}-${input.formTypeId}`),siteId:input.siteId,formTypeId:input.formTypeId,jobTemplateId:input.jobTemplateId||null,frequency:input.frequency||formType(input.formTypeId).frequency||'ad_hoc',active:input.active!==false,nextDueDate:input.nextDueDate||null,leadDays:Math.max(0,Math.min(90,Number(input.leadDays??21)||21)),autoCreate:input.autoCreate!==false,durationMinutes:Math.max(15,Number(input.durationMinutes??90)||90),priority:input.priority==='urgent'?'urgent':'normal',serviceType:input.serviceType||'',lastGeneratedJobId:null,lastGeneratedDueDate:null,lastCompletedJobId:null,lastCompletedAt:null};";
if (engine.includes(assignmentOriginal)) {
  engine = engine.replace(assignmentOriginal, assignmentExpanded);
  changed = true;
}
if (changed) fs.writeFileSync(engineFile, engine);

const workflowFile = path.resolve('scripts/workflow-store.mjs');
let workflow = fs.readFileSync(workflowFile, 'utf8');
let workflowChanged = false;
const jobTemplateMarker = "    jobTemplateId:input.jobTemplateId||undefined,\n    serviceType:required(input.serviceType,'serviceType'),";
const recurringJobFields = "    jobTemplateId:input.jobTemplateId||undefined,\n    recurringAssignmentId:input.recurringAssignmentId||undefined,\n    recurringDueDate:input.recurringDueDate||undefined,\n    plannedMaintenance:Boolean(input.plannedMaintenance),\n    serviceType:required(input.serviceType,'serviceType'),";
if (workflow.includes(jobTemplateMarker) && !workflow.includes('recurringAssignmentId:input.recurringAssignmentId')) {
  workflow = workflow.replace(jobTemplateMarker, recurringJobFields);
  workflowChanged = true;
}
const patchFields = "['serviceType','description','notes','siteId','jobTemplateId','invoiceStubId']";
const recurringPatchFields = "['serviceType','description','notes','siteId','jobTemplateId','invoiceStubId','recurringAssignmentId','recurringDueDate','plannedMaintenance']";
if (workflow.includes(patchFields)) {
  workflow = workflow.replace(patchFields, recurringPatchFields);
  workflowChanged = true;
}
if (workflowChanged) fs.writeFileSync(workflowFile, workflow);

const serverFile = path.resolve('scripts/server-v2.mjs');
let server = fs.readFileSync(serverFile, 'utf8');
let serverChanged = false;
const complianceImport = "import { createWorkflowComplianceJob } from './compliance-engine-v2.mjs';";
const recurringImport = "import { getRecurringWorkOverview, runRecurringScheduler } from './recurring-work.mjs';";
if (server.includes(complianceImport) && !server.includes(recurringImport)) {
  server = server.replace(complianceImport, `${complianceImport}\n${recurringImport}`);
  serverChanged = true;
}

const technicianRoute = "  if(req.method==='GET'&&p==='/api/v1/workflow/technicians'){json(res,200,listWorkflowTechnicians());return true;}";
const recurringRoutes = `${technicianRoute}\n  if(req.method==='GET'&&p==='/api/v1/recurring-work'){json(res,200,getRecurringWorkOverview({today:q(url,'today')}));return true;}\n  if(req.method==='POST'&&p==='/api/v1/recurring-work/run'){const body=await readJson(req);json(res,200,runRecurringScheduler(body||{}));return true;}`;
if (server.includes(technicianRoute) && !server.includes("p==='/api/v1/recurring-work'")) {
  server = server.replace(technicianRoute, recurringRoutes);
  serverChanged = true;
}

const listenLine = "server.listen(port,'0.0.0.0',()=>console.log(`OPSBOARD v2 listening on ${port}`));";
const recurringListen = `try{const startup=runRecurringScheduler({});if(startup.generated.length||startup.rolledForward.length)console.log(\`Recurring work startup: generated=\${startup.generated.length} rolledForward=\${startup.rolledForward.length}\`);}catch(error){console.warn('Recurring work startup check failed',error?.message||error);}\nconst recurringTimer=setInterval(()=>{try{const run=runRecurringScheduler({});if(run.generated.length||run.rolledForward.length)console.log(\`Recurring work: generated=\${run.generated.length} rolledForward=\${run.rolledForward.length}\`);}catch(error){console.warn('Recurring work check failed',error?.message||error);}},30000);recurringTimer.unref?.();\n${listenLine}`;
if (server.includes(listenLine) && !server.includes('Recurring work startup:')) {
  server = server.replace(listenLine, recurringListen);
  serverChanged = true;
}
if (serverChanged) fs.writeFileSync(serverFile, server);

console.log(`Prepared recurring planned-maintenance workflow (engine=${changed}, workflow=${workflowChanged}, server=${serverChanged}).`);
