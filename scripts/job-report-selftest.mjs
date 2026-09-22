import { renderJobReportPdf, jobReportFileName } from './job-report-output.mjs';

const checks=[];
const assert=(name,condition,detail='')=>{
  checks.push({name,ok:Boolean(condition),detail});
  if(!condition)throw new Error(`${name}${detail?`: ${detail}`:''}`);
};

const snapshot={
  job:{
    id:'job-report-test',
    displayId:'J-9001',
    customer:{name:'Albion Leisure Centre',contactName:'Mark Ellison',contactPhone:'0161 445 7720',address:'5 Wilmslow Road',city:'Manchester',postcode:'M14 5TP'},
    serviceType:'AC Unit Maintenance',
    description:'Pool plant room AC servicing — humidity control critical.',
    notes:'Two ceiling cassettes plus dehumidifier check.',
    scheduledStart:'2026-09-21T10:00:00Z',
    scheduledEnd:'2026-09-21T12:00:00Z',
    status:'completed',
    priority:'normal',
    plannedMaintenance:true,
    ppmScheduleBasis:'time',
    ppmFrequency:'quarterly',
    ppmChecklistNames:['AC service checklist'],
    ppmTools:['Pressure gauges'],
    ppmSpareParts:['Filter F7'],
  },
  engineerNames:['Priya Shah'],
  media:[{
    id:'m1',
    type:'photo',
    caption:'Filter F7 fitted',
    uri:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9t8AAAAASUVORK5CYII=',
    createdAt:'2026-09-21T11:35:00Z',
  }],
  events:[
    {id:'e1',type:'status_change',payload:{toStatus:'completed'},createdAt:'2026-09-21T12:02:00Z'},
  ],
};

const pdf=await renderJobReportPdf(snapshot);
assert('job report pdf generated',Buffer.isBuffer(pdf)&&pdf.length>1200,`${pdf.length} bytes`);
assert('job report filename generated',jobReportFileName(snapshot)==='job-report-albion-leisure-centre-j-9001.pdf',jobReportFileName(snapshot));

let missingJobBlocked=false;
try{await renderJobReportPdf({});}catch(error){missingJobBlocked=error?.statusCode===422;}
assert('missing job id blocked',missingJobBlocked);

console.log(`Job report build gate passed: ${checks.filter(check=>check.ok).length}/${checks.length} checks`);
