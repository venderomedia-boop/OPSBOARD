import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-email-api-'));
process.env.OPSBOARD_DATA_DIR=dataDir;
process.env.EMAIL_INTAKE_TEST_MODE='1';
process.env.EMAIL_INTAKE_ALLOWED_DOMAINS='trustedfm.co.uk';

const {handleEmailIntakeApi}=await import('../scripts/email-intake-routes.mjs');
const {getWorkflowJob,resetWorkflowStore}=await import('../scripts/workflow-store.mjs');
const {resetEmailIntakeStore}=await import('../scripts/email-intake-store.mjs');
resetWorkflowStore();
resetEmailIntakeStore();

function sendJson(res,status,payload){
  res.writeHead(status,{'content-type':'application/json'});
  res.end(JSON.stringify(payload));
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  try{
    const handled=await handleEmailIntakeApi(req,url,{json:(status,payload)=>sendJson(res,status,payload)});
    if(!handled)sendJson(res,404,{message:'not found'});
  }catch(error){sendJson(res,Number(error?.statusCode||500),{message:error?.message||'error'});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base=`http://127.0.0.1:${port}`;
async function api(route,options={}){
  const res=await fetch(base+route,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const body=await res.json();
  return {status:res.status,body};
}

try{
  const structured={
    provider:'resend',providerEmailId:'em_api_1',messageId:'<api-473923@trustedfm.co.uk>',
    from:'dispatch@trustedfm.co.uk',to:'jobs@ops.example',subject:'Work Order: 473923 - Emergency Lighting Test',
    text:'Customer: Travelodge\nSite: Manchester Central\nAddress: 27 Dale Street, Manchester M1 1JA\nJob Type: Emergency Lighting Test\nAttendance: 22/09/2026\nTime: 09:00\nContact: Sarah Williams\nTelephone: 0161 555 0199\nWork Order: 473923'
  };
  const ingest=await api('/api/v1/email-intake/test-ingest',{method:'POST',body:JSON.stringify(structured)});
  assert.equal(ingest.status,202);
  assert.equal(ingest.body.intake.status,'ready');
  const intakeId=ingest.body.intake.id;

  const summary=await api('/api/v1/email-intake/summary');
  assert.equal(summary.status,200);
  assert.equal(summary.body.ready,1);

  const create=await api(`/api/v1/email-intake/${intakeId}/create-job`,{method:'POST',body:'{}'});
  assert.equal(create.status,201);
  assert.equal(create.body.job.source,'email');
  assert.equal(create.body.job.sourceMetadata.externalReference,'473923');
  assert.equal(create.body.job.customer.address,'27 Dale Street, Manchester M1 1JA');
  const stored=getWorkflowJob(create.body.job.id);
  assert.equal(stored.source,'email');
  assert.equal(stored.sourceMetadata.intakeId,intakeId);

  const repeatCreate=await api(`/api/v1/email-intake/${intakeId}/create-job`,{method:'POST',body:'{}'});
  assert.equal(repeatCreate.status,200);
  assert.equal(repeatCreate.body.alreadyCreated,true);

  const duplicate=await api('/api/v1/email-intake/test-ingest',{method:'POST',body:JSON.stringify({...structured,providerEmailId:'em_api_2'})});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.body.duplicate,true);

  const vague=await api('/api/v1/email-intake/test-ingest',{method:'POST',body:JSON.stringify({provider:'resend',providerEmailId:'em_vague_1',messageId:'<vague-1@example.net>',from:'unknown@example.net',subject:'AC issue',text:'Hi, AC is broken at Kings House. Can someone attend ASAP?'})});
  assert.equal(vague.status,202);
  assert.equal(vague.body.intake.status,'needs_review');
  const vagueId=vague.body.intake.id;

  const blocked=await api(`/api/v1/email-intake/${vagueId}/create-job`,{method:'POST',body:'{}'});
  assert.equal(blocked.status,422,'incomplete intake must not create a job');

  const reviewed=await api(`/api/v1/email-intake/${vagueId}`,{method:'PATCH',body:JSON.stringify({fields:{customerName:'Kings House Management',siteName:'Kings House',siteAddress:'1 King Street, London EC2V 8AA',serviceType:'Reactive AC Callout',requestedDate:'2026-09-23',requestedTime:'14:30',contactName:'Site Reception'}})});
  assert.equal(reviewed.status,200);
  assert.equal(reviewed.body.status,'ready');

  const createdAfterReview=await api(`/api/v1/email-intake/${vagueId}/create-job`,{method:'POST',body:'{}'});
  assert.equal(createdAfterReview.status,201);
  assert.equal(createdAfterReview.body.job.customer.address,'1 King Street, London EC2V 8AA');
  assert.equal(createdAfterReview.body.job.scheduledStart,'2026-09-23T13:30:00.000Z');

  const rejectIngest=await api('/api/v1/email-intake/test-ingest',{method:'POST',body:JSON.stringify({provider:'resend',providerEmailId:'em_reject_1',messageId:'<reject-1@example.net>',from:'unknown@example.net',subject:'FYI only',text:'This is not a job request.'})});
  const rejected=await api(`/api/v1/email-intake/${rejectIngest.body.intake.id}/reject`,{method:'POST',body:'{}'});
  assert.equal(rejected.status,200);
  assert.equal(rejected.body.status,'rejected');
  const rejectedCreate=await api(`/api/v1/email-intake/${rejectIngest.body.intake.id}/create-job`,{method:'POST',body:JSON.stringify({fields:{customerName:'Should Not Create',siteName:'Blocked Site',serviceType:'Boiler Service',requestedDate:'2026-09-24',requestedTime:'09:00'}})});
  assert.equal(rejectedCreate.status,409);

  const createdReject=await api(`/api/v1/email-intake/${intakeId}/reject`,{method:'POST',body:'{}'});
  assert.equal(createdReject.status,409);
  const createdEdit=await api(`/api/v1/email-intake/${intakeId}`,{method:'PATCH',body:JSON.stringify({fields:{customerName:'Tampered'}})});
  assert.equal(createdEdit.status,409);

  const poBase={provider:'resend',from:'dispatch@trustedfm.co.uk',to:'jobs@ops.example',subject:'Boiler service request',text:'Customer: Example Estates\nSite: Block A\nAddress: 12 High Street, London SW1A 1AA\nJob Type: Boiler Service\nAttendance: 25/09/2026\nTime: 10:00\nPO: PO-REUSED'};
  const po1=await api('/api/v1/email-intake/test-ingest',{method:'POST',body:JSON.stringify({...poBase,providerEmailId:'em_po_1',messageId:'<po-1@trustedfm.co.uk>'})});
  const po2=await api('/api/v1/email-intake/test-ingest',{method:'POST',body:JSON.stringify({...poBase,providerEmailId:'em_po_2',messageId:'<po-2@trustedfm.co.uk>',text:poBase.text.replace('25/09/2026','26/09/2026')})});
  assert.equal(po1.body.duplicate,false);
  assert.equal(po2.body.duplicate,false,'reused PO alone must not suppress a new job request');

  console.log(JSON.stringify({ok:true,dataDir,structuredJobId:create.body.job.id,reviewedJobId:createdAfterReview.body.job.id,summary:(await api('/api/v1/email-intake/summary')).body},null,2));
} finally {
  await new Promise(resolve=>server.close(resolve));
}
