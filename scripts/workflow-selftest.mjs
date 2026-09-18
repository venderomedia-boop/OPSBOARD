import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-workflow-test-'));
process.env.OPSBOARD_DATA_DIR=dir;

try{
  const workflow=await import(`./workflow-store.mjs?selftest=${Date.now()}`);
  const invoices=await import(`./invoice-queue.mjs?selftest=${Date.now()}`);
  const checks=[];
  const assert=(name,condition,detail='')=>{checks.push({name,ok:Boolean(condition),detail});if(!condition)throw new Error(`${name}${detail?`: ${detail}`:''}`);};

  const job=workflow.createWorkflowJob({
    customerName:'Workflow Build Test',contactName:'Test Contact',contactPhone:'0000',siteAddress:'1 Test Way',city:'Manchester',postcode:'M1 1AA',
    serviceType:'HVAC Workflow Verification',description:'Build-gate lifecycle verification',scheduledStart:'2026-09-17T16:00:00Z',scheduledEnd:'2026-09-17T17:00:00Z',priority:'normal',assignedTechnicianId:'user-1',amount:250,
  });
  assert('manual job creation',job.id.startsWith('job-live-')&&job.displayId.startsWith('J-'),job.id);
  assert('dispatch assignment created',workflow.listWorkflowAssignments({date:'2026-09-17',technicianId:'user-1'}).some(a=>a.jobId===job.id));
  assert('mobile workload query source',workflow.listWorkflowJobs({from:'2026-09-17',to:'2026-09-17',technicianId:'user-1'}).some(j=>j.id===job.id));

  const multi=workflow.replaceWorkflowAssignments(job.id,{date:'2026-09-17',technicianIds:['user-1','tech-priya']});
  assert('multi-engineer assignment persisted',multi.assignments.length===2&&multi.job.assignedTechnicianIds?.length===2);
  assert('second engineer workload query',workflow.listWorkflowJobs({from:'2026-09-17',to:'2026-09-17',technicianId:'tech-priya'}).some(j=>j.id===job.id));
  assert('same job visible in both engineer diaries',workflow.listWorkflowAssignments({date:'2026-09-17'}).filter(a=>a.jobId===job.id).length===2);
  const reduced=workflow.replaceWorkflowAssignments(job.id,{date:'2026-09-17',technicianIds:['user-1']});
  assert('assignment replacement removes deselected engineer',reduced.assignments.length===1&&reduced.job.assignedTechnicianIds?.[0]==='user-1');

  workflow.createWorkflowEvent({jobId:job.id,type:'status_change',toStatus:'en_route',createdBy:'user-1'});
  assert('en route transition',workflow.getWorkflowJob(job.id)?.status==='en_route');
  workflow.createWorkflowEvent({jobId:job.id,type:'status_change',toStatus:'in_progress',createdBy:'user-1'});
  assert('in progress transition',workflow.getWorkflowJob(job.id)?.status==='in_progress');

  const photo=workflow.createWorkflowMedia(job.id,{type:'photo',caption:'Plant evidence',uri:''});
  const signature=workflow.createWorkflowMedia(job.id,{type:'signature',caption:'Customer sign-off',uri:'data:image/svg+xml,test'});
  assert('photo evidence persisted',workflow.listWorkflowMedia(job.id).some(m=>m.id===photo.id&&m.type==='photo'));
  assert('signature persisted',workflow.listWorkflowMedia(job.id).some(m=>m.id===signature.id&&m.type==='signature'));

  workflow.createWorkflowEvent({jobId:job.id,type:'status_change',toStatus:'completed',createdBy:'user-1'});
  const completed=workflow.getWorkflowJob(job.id);
  assert('completed transition',completed?.status==='completed'&&Boolean(completed?.completedAt));

  const stub=invoices.createInvoiceStub({jobId:job.id,customerName:completed.customer.name,serviceType:completed.serviceType,technicianName:'Marcus Reed',description:completed.description,siteAddress:[completed.customer.address,completed.customer.city,completed.customer.postcode].filter(Boolean).join(', '),photos:[{id:photo.id,caption:photo.caption}],signature,jobStatus:completed.status,amount:completed.amount,submittedAt:new Date().toISOString()});
  workflow.updateWorkflowJob(job.id,{invoiceStubId:stub.id});
  assert('ready to invoice',invoices.listInvoiceStubs({status:'pending'}).some(i=>i.id===stub.id));
  assert('invoice linked to job',workflow.getWorkflowJob(job.id)?.invoiceStubId===stub.id);
  invoices.updateInvoiceStub(stub.id,'sent');
  assert('invoice sent removes pending',!invoices.listInvoiceStubs({status:'pending'}).some(i=>i.id===stub.id));
  assert('invoice sent retained in history',invoices.listInvoiceStubs({status:'sent'}).some(i=>i.id===stub.id));

  const events=workflow.listWorkflowEvents(job.id);
  assert('audit timeline retained',events.filter(e=>e.type==='status_change').length===3,`${events.length} events`);
  console.log(`Workflow lifecycle build gate passed: ${checks.filter(c=>c.ok).length}/${checks.length} checks job=${job.displayId} invoice=${stub.reference}`);
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
