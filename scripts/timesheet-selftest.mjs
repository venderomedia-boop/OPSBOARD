import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-timesheet-test-'));
process.env.OPSBOARD_DATA_DIR=dir;

try{
  const workflow=await import(`./workflow-store.mjs?timesheettest=${Date.now()}`);
  const timesheets=await import(`./timesheet-store.mjs?timesheettest=${Date.now()}`);
  const output=await import(`./timesheet-output.mjs?timesheettest=${Date.now()}`);
  const checks=[];
  const assert=(name,condition,detail='')=>{checks.push({name,ok:Boolean(condition),detail});if(!condition)throw new Error(`${name}${detail?`: ${detail}`:''}`);};

  workflow.resetWorkflowStore();
  const tech=workflow.listWorkflowTechnicians().find(row=>row.id==='user-1');
  assert('test engineer available',Boolean(tech));

  const day=timesheets.saveTimesheetDay({
    technicianId:'user-1',
    date:'2026-09-21',
    startTime:'07:45',
    endTime:'17:15',
    breakMinutes:30,
    mileageMiles:42.5,
    notes:'PPM visits',
  });
  assert('daily capture persisted',day.workedMinutes===540&&day.mileageMiles===42.5,String(day.workedMinutes));

  const draft=timesheets.getTimesheetDraft({technicianId:'user-1',weekEnding:'2026-09-27'});
  assert('weekly draft uses daily capture',draft.entries.find(row=>row.date==='2026-09-21')?.startTime==='07:45');
  assert('weekly draft totals calculated',draft.totals.hours===9,String(draft.totals.hours));

  const sheet=timesheets.createTimesheet({
    technicianId:'user-1',
    weekEnding:'2026-09-27',
    entries:[
      {date:'2026-09-21',startTime:'08:00',endTime:'17:00',breakMinutes:30,mileageMiles:42.5,notes:'PPM visits'},
      {date:'2026-09-22',startTime:'08:15',endTime:'16:45',breakMinutes:30,mileageMiles:31,notes:'Reactive callouts'},
    ],
  });
  assert('timesheet created',sheet.id.startsWith('ts-')&&sheet.status==='submitted',sheet.id);
  assert('worked hours calculated',sheet.totals.workedMinutes===990&&sheet.totals.hours===16.5,String(sheet.totals.hours));
  assert('mileage calculated',sheet.totals.mileageMiles===73.5,String(sheet.totals.mileageMiles));
  assert('timesheet listed for engineer',timesheets.listTimesheets({technicianId:'user-1'}).some(row=>row.id===sheet.id));

  let duplicateBlocked=false;
  try{
    timesheets.createTimesheet({
      technicianId:'user-1',
      weekEnding:'2026-09-27',
      entries:[{date:'2026-09-23',startTime:'08:00',endTime:'12:00',breakMinutes:0,mileageMiles:5}],
    });
  }catch(error){duplicateBlocked=error?.statusCode===409;}
  assert('duplicate active week blocked',duplicateBlocked);

  const approved=timesheets.reviewTimesheet(sheet.id,{status:'approved',reviewedBy:'Office Admin',reviewNote:'Checked against diary'});
  assert('office approval persisted',approved.status==='approved'&&approved.reviewedBy==='Office Admin');

  const text=output.renderTimesheetText(approved);
  assert('plain text export includes totals',text.includes('16.50 hours')&&text.includes('73.5 miles'));

  const csv=output.renderTimesheetCsv(approved);
  assert('csv export includes engineer data',csv.includes('Demo')===false&&csv.includes('2026-09-21')&&csv.includes('42.5'));

  const xlsx=await output.renderTimesheetXlsx(approved);
  assert('xlsx generated',Buffer.isBuffer(xlsx)&&xlsx.length>1000,`${xlsx.length} bytes`);

  const pdf=await output.renderTimesheetPdf(approved);
  assert('pdf generated',Buffer.isBuffer(pdf)&&pdf.length>800,`${pdf.length} bytes`);

  const returned=timesheets.createTimesheet({
    technicianId:'tech-priya',
    weekEnding:'2026-09-27',
    entries:[{date:'2026-09-21',startTime:'08:00',endTime:'16:00',breakMinutes:30,mileageMiles:12,notes:'Original entry'}],
  });
  timesheets.reviewTimesheet(returned.id,{status:'rejected',reviewedBy:'Office Admin',reviewNote:'Check mileage'});
  const returnedDraft=timesheets.getTimesheetDraft({technicianId:'tech-priya',weekEnding:'2026-09-27'});
  assert('rejected week prefilled for resubmission',returnedDraft.entries.find(row=>row.date==='2026-09-21')?.notes==='Original entry');
  assert('return note preserved in draft',returnedDraft.returnedFrom?.reviewNote==='Check mileage');

  const emailed=timesheets.markTimesheetEmailed(sheet.id,{recipientEmail:'payroll@example.com',emailId:'email-test-1'});
  assert('email audit status persisted',emailed.status==='emailed'&&emailed.emailedTo==='payroll@example.com');

  let reviewAfterEmailBlocked=false;
  try{timesheets.reviewTimesheet(sheet.id,{status:'rejected'});}catch(error){reviewAfterEmailBlocked=error?.statusCode===409;}
  assert('emailed sheet locked from later review',reviewAfterEmailBlocked);

  console.log(`Timesheet build gate passed: ${checks.filter(check=>check.ok).length}/${checks.length} checks sheet=${sheet.id}`);
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}
