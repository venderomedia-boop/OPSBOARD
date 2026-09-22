import PDFDocument from 'pdfkit';

function text(value){ return String(value ?? '').trim(); }
function safe(value){ return text(value) || 'Not provided'; }
function formatDateTime(value){
  const d=new Date(value);
  return Number.isNaN(d.getTime()) ? text(value) : d.toLocaleString('en-GB',{
    weekday:'short',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
  });
}
function fileNamePart(value){
  return String(value||'job').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'job';
}
function statusLabel(value){ return text(value).replaceAll('_',' ').replace(/\b\w/g,(c)=>c.toUpperCase()); }
function dataImageBuffer(uri){
  const match=String(uri||'').match(/^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/=]+)$/i);
  if(!match) return null;
  try { return Buffer.from(match[1],'base64'); } catch { return null; }
}

function sectionTitle(doc,title){
  if(doc.y>700) doc.addPage();
  doc.moveDown(.8);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#475569').text(title.toUpperCase(),{characterSpacing:.7});
  doc.moveDown(.35);
}
function row(doc,label,value){
  const left=42;
  const y=doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748B').text(label,left,y,{width:110});
  doc.font('Helvetica').fontSize(10).fillColor('#0F172A').text(safe(value),left+118,y,{width:392});
  doc.y=Math.max(doc.y,y+15);
}
function pillLine(doc,label,items=[]){
  if(!items.length)return;
  row(doc,label,items.join(' · '));
}

export async function renderJobReportPdf(snapshot={}){
  const job=snapshot.job||{};
  if(!job.id) throw Object.assign(new Error('job.id is required'),{statusCode:422});
  const engineerNames=Array.isArray(snapshot.engineerNames)?snapshot.engineerNames.filter(Boolean):[];
  const media=Array.isArray(snapshot.media)?snapshot.media:[];
  const events=Array.isArray(snapshot.events)?snapshot.events:[];
  const doc=new PDFDocument({size:'A4',margin:42,info:{Title:`Job Report - ${job.id}`}});
  const chunks=[];
  const done=new Promise((resolve,reject)=>{
    doc.on('data',(chunk)=>chunks.push(chunk));
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    doc.on('error',reject);
  });

  doc.rect(0,0,595,92).fill('#0F172A');
  doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(9).text('JOB REPORT',42,28,{characterSpacing:1});
  doc.fontSize(22).text(safe(job.customer?.name||job.customerName||job.id),42,43,{width:410});
  doc.font('Helvetica').fontSize(10).fillColor('#CBD5E1')
    .text(`${safe(job.serviceType)} · ${safe(job.displayId||job.id).toUpperCase()}`,42,69,{width:420});
  doc.y=112;

  sectionTitle(doc,'Job details');
  row(doc,'Status',statusLabel(job.status));
  row(doc,'Priority',job.priority==='urgent'?'Urgent':'Normal');
  row(doc,'Contact',job.customer?.contactName||job.contactName);
  row(doc,'Phone',job.customer?.contactPhone||job.contactPhone);
  row(doc,'Location',[job.customer?.address||job.siteAddress,job.customer?.city||job.city,job.customer?.postcode||job.postcode].filter(Boolean).join(', '));
  row(doc,'Engineers',engineerNames.length?engineerNames.join(', '):'Unassigned');

  sectionTitle(doc,'Operational detail');
  row(doc,'Job ID',String(job.id).toUpperCase());
  row(doc,'Start',formatDateTime(job.scheduledStart));
  row(doc,'End',formatDateTime(job.scheduledEnd));
  row(doc,'Customer',job.customer?.name||job.customerName);
  if(job.siteId)row(doc,'Site ID',job.siteId);
  if(job.jobTemplateId)row(doc,'Template',job.jobTemplateId);
  if(job.source)row(doc,'Source',statusLabel(job.source));

  sectionTitle(doc,'Brief');
  doc.font('Helvetica').fontSize(10.5).fillColor('#1E293B').text(text(job.description)||'No job brief entered.',{lineGap:2});
  if(text(job.notes)){
    doc.moveDown(.55);
    doc.fontSize(9.5).fillColor('#475569').text(text(job.notes),{lineGap:2});
  }

  if(job.plannedMaintenance){
    sectionTitle(doc,'PPM details');
    row(doc,'Schedule',job.ppmScheduleBasis==='usage'?'Usage / running hours':statusLabel(job.ppmFrequency||'Planned maintenance'));
    if(job.recurringDueDate)row(doc,'Due',formatDateTime(`${job.recurringDueDate}T12:00:00`));
    if(job.recurringDueUsageHours)row(doc,'Target',`${Number(job.recurringDueUsageHours).toLocaleString()} running hours`);
    pillLine(doc,'Checks',Array.isArray(job.ppmChecklistNames)?job.ppmChecklistNames:[]);
    pillLine(doc,'Tools',Array.isArray(job.ppmTools)?job.ppmTools:[]);
    pillLine(doc,'Spares',Array.isArray(job.ppmSpareParts)?job.ppmSpareParts:[]);
  }

  sectionTitle(doc,'Field media');
  if(!media.length){
    doc.font('Helvetica').fontSize(9.5).fillColor('#64748B').text('No photos or signature captured.');
  }else{
    const embedded=media.slice(0,8);
    for(const [index,item] of embedded.entries()){
      if(doc.y>650)doc.addPage();
      const caption=text(item.caption)||statusLabel(item.type)||`Media ${index+1}`;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(caption);
      if(item.createdAt){
        doc.font('Helvetica').fontSize(8).fillColor('#94A3B8').text(formatDateTime(item.createdAt));
      }
      const image=dataImageBuffer(item.uri);
      if(image){
        try{
          const top=doc.y+5;
          doc.image(image,42,top,{fit:[220,150],align:'left',valign:'top'});
          doc.y=top+158;
        }catch{
          doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text('Image could not be embedded in the PDF.');
          doc.moveDown(.4);
        }
      }else{
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text('Media reference retained in the job record.');
        doc.moveDown(.4);
      }
    }
    if(media.length>embedded.length){
      doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text(`+${media.length-embedded.length} additional media item(s) retained with the job.`);
    }
  }

  sectionTitle(doc,'Field activity');
  if(!events.length){
    doc.font('Helvetica').fontSize(9.5).fillColor('#64748B').text('No field activity recorded.');
  }else{
    for(const event of events){
      if(doc.y>735)doc.addPage();
      const label=text(event.payload?.text)||statusLabel(event.type)||'Activity';
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(label,{continued:false});
      if(event.payload?.toStatus){
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text(`Status → ${statusLabel(event.payload.toStatus)}`);
      }
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8').text(formatDateTime(event.createdAt));
      doc.moveDown(.35);
    }
  }

  const generatedAt=new Date().toLocaleString('en-GB');
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8')
    .text(`Generated from Dispatch Board · ${generatedAt} · ${job.id}`,{align:'center'});

  doc.end();
  return await done;
}

export function jobReportFileName(snapshot={}){
  const job=snapshot.job||{};
  return `job-report-${fileNamePart(job.customer?.name||job.customerName||job.id)}-${fileNamePart(job.displayId||job.id)}.pdf`;
}
