import fs from 'node:fs';
import path from 'node:path';

const file=path.resolve('scripts/server-v2.mjs');
let source=fs.readFileSync(file,'utf8');
let changed=false;

const oldPatch="  if(workflowJobMatch&&req.method==='PATCH'){json(res,200,updateWorkflowJob(workflowJobMatch[1],await readJson(req)));return true;}";
const newPatch="  if(workflowJobMatch&&req.method==='PATCH'){const updated=updateWorkflowJob(workflowJobMatch[1],await readJson(req));if(updated.siteId&&updated.jobTemplateId)createWorkflowComplianceJob({id:updated.id,displayId:updated.displayId,customerId:updated.customerId,customer:updated.customer?.name,siteId:updated.siteId,jobTemplateId:updated.jobTemplateId,serviceType:updated.serviceType,status:updated.status});json(res,200,updated);return true;}";
if(source.includes(oldPatch)){source=source.replace(oldPatch,newPatch);changed=true;}

const oldEvent="  if(req.method==='POST'&&p==='/api/v1/workflow/job-events'){json(res,201,createWorkflowEvent(await readJson(req)));return true;}";
const newEvent="  if(req.method==='POST'&&p==='/api/v1/workflow/job-events'){const body=await readJson(req);const event=createWorkflowEvent(body);const updated=getWorkflowJob(body.jobId);if(updated?.siteId&&updated?.jobTemplateId)createWorkflowComplianceJob({id:updated.id,displayId:updated.displayId,customerId:updated.customerId,customer:updated.customer?.name,siteId:updated.siteId,jobTemplateId:updated.jobTemplateId,serviceType:updated.serviceType,status:updated.status});json(res,201,event);return true;}";
if(source.includes(oldEvent)){source=source.replace(oldEvent,newEvent);changed=true;}

if(changed)fs.writeFileSync(file,source);
console.log(`Prepared workflow/compliance status synchronization (changed=${changed}).`);
