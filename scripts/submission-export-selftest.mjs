import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsboard-submission-export-'));
process.env.OPSBOARD_DATA_DIR=dir;
process.env.COMPLIANCE_EXPORT_DIR=path.join(dir,'exports');

try{
  const queue=await import(`./invoice-queue.mjs?submissionexport=${Date.now()}`);
  const exports=await import(`./submission-exports.mjs?submissionexport=${Date.now()}`);

  queue.resetInvoiceQueue();
  const stub=queue.createInvoiceStub({
    jobId:'job-text-export-test',
    customerName:'Albion Leisure Centre',
    serviceType:'AC Unit Maintenance',
    technicianName:'Priya Shah',
    contactName:'Mark Ellison',
    contactPhone:'0161 445 7720',
    siteAddress:'5 Wilmslow Road, Manchester, M14 5TP',
    description:'Pool plant room AC servicing.',
    notes:[{text:'Filter replaced',createdAt:'2026-09-21T11:30:00Z'}],
    photos:[{caption:'Filter F7 fitted',createdAt:'2026-09-21T11:40:00Z',uri:'https://example.invalid/filter.jpg'}],
    signature:{uri:'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',caption:'Mark Ellison',createdAt:'2026-09-21T11:55:00Z'},
    complianceForms:[{name:'AC service checklist',status:'completed',checks:[{location:'Plant room',answers:{filter:'Pass'}}]}],
    jobStatus:'completed',
  });

  const result=await exports.generateSubmissionExport(stub.id,'txt');
  if(!result.txt?.url)throw new Error('Plain-text export URL was not returned');

  const file=path.join(process.env.COMPLIANCE_EXPORT_DIR,result.txt.name);
  const text=fs.readFileSync(file,'utf8');
  for(const required of ['SUBMITTED JOB PACK','Albion Leisure Centre','Priya Shah','Filter replaced','Filter F7 fitted','CUSTOMER SIGNATURE: Captured','AC service checklist']){
    if(!text.includes(required))throw new Error(`Text export is missing: ${required}`);
  }

  console.log(`Submission text export build gate passed: ${result.txt.name}`);
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}
