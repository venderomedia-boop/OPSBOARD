import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-intake-'));
process.env.OPSBOARD_DATA_DIR=dir;
process.env.EMAIL_INTAKE_ALLOWED_DOMAINS='trustedfm.co.uk';

const store = await import('../scripts/email-intake-store.mjs');
const service = await import('../scripts/email-intake-service.mjs');
store.resetEmailIntakeStore();

const structured={
  provider:'resend',providerEmailId:'em_123',messageId:'<wo-473923@trustedfm.co.uk>',
  from:'dispatch@trustedfm.co.uk',to:'jobs@ops.example',subject:'Work Order: 473923 - Emergency Lighting Test',
  text:`Customer: Travelodge\nSite: Manchester Central\nAddress: 27 Dale Street, Manchester M1 1JA\nJob Type: Emergency Lighting Test\nAttendance: 22/09/2026\nTime: 09:00\nContact: Sarah Williams\nTelephone: 0161 555 0199\nWork Order: 473923`,
};
const first=service.ingestInboundEmail(structured);
assert.equal(first.duplicate,false);
assert.equal(first.record.candidate.fields.customerName,'Travelodge');
assert.equal(first.record.candidate.fields.postcode,'M1 1JA');
assert.equal(first.record.candidate.fields.requestedDate,'2026-09-22');
assert.equal(first.record.candidate.fields.requestedTime,'09:00');
assert.equal(first.record.status,'ready');

const dup=service.ingestInboundEmail({...structured,providerEmailId:'em_124'});
assert.equal(dup.duplicate,true,'message id / external ref should prevent duplicate intake');
assert.equal(store.getEmailIntakeSummary().total,1);

const vague=service.ingestInboundEmail({provider:'resend',providerEmailId:'em_200',messageId:'<vague@example.net>',from:'unknown@example.net',subject:'AC issue',text:'Hi, AC is broken at Kings House. Can someone attend ASAP?'});
assert.equal(vague.record.status,'needs_review');
assert.ok(vague.record.validation.errors.length>0);

const createdJobs=[];
const promoted=service.promoteEmailIntakeToJob(first.record.id,{createWorkflowJob:(payload)=>{const job={id:'job-live-test',...payload};createdJobs.push(job);return job;}});
assert.equal(promoted.job.id,'job-live-test');
assert.equal(promoted.job.source,'email');
assert.equal(promoted.job.sourceMetadata.externalReference,'473923');
assert.equal(promoted.job.scheduledStart,'2026-09-22T08:00:00.000Z','BST schedule must convert to UTC correctly');
const winterPayload=service.buildWorkflowJobPayload(first.record,{requestedDate:'2026-12-01',requestedTime:'09:00'});
assert.equal(winterPayload.scheduledStart,'2026-12-01T09:00:00.000Z','GMT schedule must convert to UTC correctly');
assert.equal(store.getEmailIntake(first.record.id).status,'created');

console.log(JSON.stringify({ok:true,summary:store.getEmailIntakeSummary(),createdJob:createdJobs[0]},null,2));
