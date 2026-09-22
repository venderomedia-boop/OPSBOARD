import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getInvoiceStub } from './invoice-queue.mjs';

const exportDir = process.env.COMPLIANCE_EXPORT_DIR || '/data/exports';
fs.mkdirSync(exportDir, { recursive: true });

const safe = (v) => String(v || 'submission').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const answer = (v) => v === true ? 'Pass' : v === false ? 'Fail' : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

function imageData(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('data:image/')) return null;
  const m = uri.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!m) return null;
  return { extension: /^png$/i.test(m[1]) ? 'png' : 'jpeg', buffer: Buffer.from(m[2], 'base64') };
}

function svgData(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('data:image/svg+xml')) return null;
  try {
    const comma = uri.indexOf(',');
    if (comma < 0) return null;
    const svg = decodeURIComponent(uri.slice(comma + 1));
    const view = svg.match(/viewBox="([^"]+)"/i)?.[1]?.split(/\s+/).map(Number) || [0,0,320,200];
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(m => m[1]).filter(Boolean);
    return { view, paths };
  } catch { return null; }
}

function header(doc, item) {
  doc.fontSize(18).fillColor('#11115C').text('JPS Building Services Engineers');
  doc.fontSize(13).fillColor('#EF2B2D').text('Submitted Job Pack');
  doc.moveDown(.4);
  doc.fontSize(9).fillColor('#475569').text(`${item.reference || item.id} · Submitted ${new Date(item.submittedAt || item.createdAt).toLocaleString('en-GB')}`);
  doc.moveDown(.8);
}

function labelValue(doc, label, value) {
  doc.fontSize(8).fillColor('#64748B').text(label.toUpperCase(), { continued:true });
  doc.fillColor('#111827').text(`  ${value || '—'}`);
}

function ensure(doc, height=80) {
  if (doc.y + height > doc.page.height - 45) doc.addPage();
}

function drawSignature(doc, uri) {
  const svg = svgData(uri);
  if (!svg?.paths?.length) return false;
  const [vx,vy,vw,vh] = svg.view;
  const width = 300, height = 105;
  const sx = width / (vw || 1), sy = height / (vh || 1);
  const scale = Math.min(sx,sy);
  const x = doc.x, y = doc.y;
  doc.roundedRect(x,y,width,height,6).strokeColor('#CBD5E1').stroke();
  doc.save();
  doc.translate(x + 8, y + 8);
  doc.scale(scale * .94);
  doc.translate(-vx,-vy);
  for (const d of svg.paths) {
    try { doc.path(d).lineWidth(2 / Math.max(scale,.001)).strokeColor('#11115C').stroke(); } catch {}
  }
  doc.restore();
  doc.y = y + height + 6;
  return true;
}

function renderText(item) {
  const lines = [
    'SUBMITTED JOB PACK',
    '',
    `Reference: ${item.reference || item.id}`,
    `Customer: ${item.customerName || item.siteName || ''}`,
    `Contact: ${item.contactName || ''}`,
    `Phone: ${item.contactPhone || ''}`,
    `Site / location: ${item.siteAddress || item.siteName || ''}`,
    `Service: ${item.serviceType || ''}`,
    `Technician: ${item.technicianName || ''}`,
    `Submitted: ${item.submittedAt || item.createdAt || ''}`,
    `Status: ${item.jobStatus || item.status || ''}`,
    '',
    'JOB DESCRIPTION',
    item.description || 'No description entered.',
    '',
  ];

  if ((item.notes || []).length) {
    lines.push('NOTES');
    for (const note of item.notes) lines.push(`- ${note.text || ''}${note.createdAt ? ` (${note.createdAt})` : ''}`);
    lines.push('');
  }

  lines.push(`PHOTOS: ${(item.photos || []).length}`);
  for (const [index, photo] of (item.photos || []).entries()) {
    lines.push(`- Photo ${index + 1}: ${photo.caption || 'Field photo'}${photo.createdAt ? ` · ${photo.createdAt}` : ''}`);
  }
  lines.push('');
  lines.push(`CUSTOMER SIGNATURE: ${item.signature?.uri ? 'Captured' : 'Not captured'}`);
  if (item.signature?.caption) lines.push(`Signature label: ${item.signature.caption}`);
  if (item.signature?.createdAt) lines.push(`Signed at: ${item.signature.createdAt}`);
  lines.push('');

  if ((item.complianceForms || []).length) {
    lines.push('COMPLIANCE / CHECKLIST');
    for (const form of item.complianceForms) {
      lines.push(`${form.name || 'Compliance form'} — ${form.status || ''}`);
      for (const [index, check] of (form.checks || []).entries()) {
        const location = [check.location, check.assetLabel].filter(Boolean).join(' · ') || check.locationId || check.assetId || `Check ${index + 1}`;
        const answers = Object.entries(check.answers || {}).map(([key,value]) => `${key}: ${answer(value)}`).join(' · ');
        lines.push(`  - ${location}${answers ? ` — ${answers}` : ''}`);
      }
    }
    lines.push('');
  }

  if (Array.isArray(item.documents) && item.documents.length) {
    lines.push('DOCUMENTS');
    for (const document of item.documents) lines.push(`- ${document}`);
    lines.push('');
  }

  lines.push(`Generated: ${new Date().toISOString()}`);
  return lines.join('\n');
}

async function generateText(item) {
  const name=`${safe(item.reference || item.id)}-job-pack.txt`;
  const file=path.join(exportDir,name);
  fs.writeFileSync(file,renderText(item),'utf8');
  return {name,url:`/exports/${encodeURIComponent(name)}`};
}

async function generateXlsx(item) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JPS Dispatch';
  wb.subject = 'Submitted job pack';
  const ws = wb.addWorksheet('Job Pack');
  ws.columns = [{ width:24 },{ width:64 }];
  const rows = [
    ['Reference', item.reference || item.id],
    ['Customer', item.customerName || item.siteName || ''],
    ['Contact', item.contactName || ''],
    ['Phone', item.contactPhone || ''],
    ['Site / location', item.siteAddress || item.siteName || ''],
    ['Service', item.serviceType || ''],
    ['Technician', item.technicianName || ''],
    ['Submitted', item.submittedAt || item.createdAt || ''],
    ['Status', item.jobStatus || item.status || ''],
    ['Amount', Number.isFinite(Number(item.amount)) ? Number(item.amount) : ''],
    ['Description', item.description || ''],
    ['Documents', Array.isArray(item.documents) ? item.documents.join(', ') : ''],
  ];
  for (const r of rows) ws.addRow(r);
  ws.getColumn(1).font = { bold:true, color:{argb:'FF11115C'} };
  ws.eachRow(r => { r.alignment={vertical:'top',wrapText:true}; });

  const notes = wb.addWorksheet('Notes');
  notes.columns=[{header:'Time',key:'time',width:24},{header:'Note',key:'note',width:90}];
  for (const n of item.notes || []) notes.addRow({time:n.createdAt||'',note:n.text||''});

  const forms = wb.addWorksheet('Compliance');
  forms.columns=[
    {header:'Form',key:'form',width:30},{header:'Status',key:'status',width:15},{header:'Check',key:'check',width:26},
    {header:'Location',key:'location',width:28},{header:'Asset',key:'asset',width:28},{header:'Answers',key:'answers',width:70}
  ];
  for (const form of item.complianceForms || []) {
    const checks = Array.isArray(form.checks) ? form.checks : [];
    if (!checks.length) forms.addRow({form:form.name||'',status:form.status||''});
    for (let i=0;i<checks.length;i++) {
      const ch=checks[i]||{};
      forms.addRow({
        form:i===0?(form.name||''):'',
        status:i===0?(form.status||''):'',
        check:ch.id||`Check ${i+1}`,
        location:ch.location||ch.locationId||'',
        asset:ch.assetLabel||ch.assetId||'',
        answers:Object.entries(ch.answers||{}).map(([k,v])=>`${k}: ${answer(v)}`).join(' · ')
      });
    }
  }

  const evidence = wb.addWorksheet('Evidence');
  evidence.columns=[{width:22},{width:62}];
  evidence.addRow(['Photo count', (item.photos||[]).length]);
  (item.photos||[]).forEach((p,i)=>evidence.addRow([`Photo ${i+1}`, [p.caption||'Field photo',p.createdAt||'',p.uri?'Image attached':'No portable image'].filter(Boolean).join(' · ')]));
  evidence.addRow(['Customer signature', item.signature?.uri ? 'Captured and included in PDF / office record' : 'Not included']);
  if(item.signature?.caption) evidence.addRow(['Signature label',item.signature.caption]);
  if(item.signature?.createdAt) evidence.addRow(['Signed at',item.signature.createdAt]);

  let imageRow = evidence.rowCount + 2;
  for (const p of item.photos || []) {
    const img=imageData(p.uri);
    if(!img) continue;
    const id=wb.addImage({buffer:img.buffer,extension:img.extension});
    evidence.addImage(id,{tl:{col:0,row:imageRow-1},ext:{width:260,height:180}});
    imageRow += 11;
  }

  const name=`${safe(item.reference || item.id)}-job-pack.xlsx`;
  const file=path.join(exportDir,name);
  await wb.xlsx.writeFile(file);
  return {name,url:`/exports/${encodeURIComponent(name)}`};
}

async function generatePdf(item) {
  const name=`${safe(item.reference || item.id)}-job-pack.pdf`;
  const file=path.join(exportDir,name);
  await new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:40});
    const stream=fs.createWriteStream(file);
    stream.on('finish',resolve); stream.on('error',reject); doc.pipe(stream);
    header(doc,item);
    labelValue(doc,'Customer',item.customerName||item.siteName);
    labelValue(doc,'Contact',item.contactName);
    labelValue(doc,'Phone',item.contactPhone);
    labelValue(doc,'Location',item.siteAddress||item.siteName);
    labelValue(doc,'Service',item.serviceType);
    labelValue(doc,'Technician',item.technicianName);
    labelValue(doc,'Job status',item.jobStatus||item.status);
    doc.moveDown(.7);

    if(item.description){doc.fontSize(11).fillColor('#11115C').text('Job Description');doc.fontSize(9).fillColor('#334155').text(item.description);doc.moveDown(.8);}
    if((item.notes||[]).length){doc.fontSize(11).fillColor('#11115C').text('Notes');for(const n of item.notes){doc.fontSize(8.5).fillColor('#334155').text(`• ${n.text||''}${n.createdAt?` (${new Date(n.createdAt).toLocaleString('en-GB')})`:''}`);}doc.moveDown(.8);}

    if((item.photos||[]).length){
      doc.fontSize(11).fillColor('#11115C').text(`Photos (${item.photos.length})`); doc.moveDown(.3);
      for(const p of item.photos){
        ensure(doc,170);
        const img=imageData(p.uri);
        if(img){try{doc.image(img.buffer,{fit:[240,150],align:'left'});}catch{doc.fontSize(8).fillColor('#B91C1C').text('Photo could not be rendered');}}
        else doc.fontSize(8).fillColor('#64748B').text('Photo evidence recorded; portable image unavailable.');
        doc.fontSize(8).fillColor('#64748B').text([p.caption||'Field photo',p.createdAt?new Date(p.createdAt).toLocaleString('en-GB'):''].filter(Boolean).join(' · '));
        doc.moveDown(.6);
      }
    }

    ensure(doc,150); doc.fontSize(11).fillColor('#11115C').text('Customer Signature'); doc.moveDown(.3);
    if(item.signature?.uri){ if(!drawSignature(doc,item.signature.uri)){doc.fontSize(9).fillColor('#334155').text('Customer signature captured.');} }
    else doc.fontSize(9).fillColor('#B91C1C').text('No customer signature included.');
    if(item.signature?.createdAt) doc.fontSize(8).fillColor('#64748B').text(`Signed ${new Date(item.signature.createdAt).toLocaleString('en-GB')}`);
    doc.moveDown(.8);

    if((item.complianceForms||[]).length){
      ensure(doc,100); doc.fontSize(11).fillColor('#11115C').text('Compliance / Checklist');
      for(const form of item.complianceForms){
        ensure(doc,70); doc.moveDown(.35); doc.fontSize(9).fillColor('#111827').text(`${form.name||'Compliance form'} — ${form.status||''}`);
        for(const [i,ch] of (form.checks||[]).entries()){
          const loc=[ch.location,ch.assetLabel].filter(Boolean).join(' · ') || ch.locationId || ch.assetId || `Check ${i+1}`;
          const answers=Object.entries(ch.answers||{}).map(([k,v])=>`${k}: ${answer(v)}`).join(' · ');
          doc.fontSize(7.5).fillColor('#475569').text(`${loc}${answers?` — ${answers}`:''}`);
        }
      }
    }
    doc.end();
  });
  return {name,url:`/exports/${encodeURIComponent(name)}`};
}

export async function generateSubmissionExport(invoiceId, format='both'){
  const item=getInvoiceStub(invoiceId);
  if(!item) throw Object.assign(new Error('Submitted job pack not found'),{statusCode:404});
  const result={invoiceId,generatedAt:new Date().toISOString(),pdf:null,xlsx:null,txt:null};
  if(format==='pdf'||format==='both') result.pdf=await generatePdf(item);
  if(format==='xlsx'||format==='both') result.xlsx=await generateXlsx(item);
  if(format==='txt'||format==='both') result.txt=await generateText(item);
  return result;
}
