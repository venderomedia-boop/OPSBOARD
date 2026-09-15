import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getExportDataset } from './compliance-engine.mjs';

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const exportDir=process.env.COMPLIANCE_EXPORT_DIR||'/data/exports';
fs.mkdirSync(exportDir,{recursive:true});
const safe=(v)=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const displayAnswer=(v)=>v===true?'✓':v===false?'✕':v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);

function schemasForData(data){
  const versions=[...new Set(data.instances.map(i=>i.formTypeVersion).filter(Boolean))];
  const selected=versions.map(v=>data.formType.versions.find(x=>x.version===v)?.schema).filter(Boolean);
  if(selected.length)return selected;
  return [data.formType.versions.find(v=>v.version===data.formType.currentVersion)?.schema||data.formType.versions.at(-1)?.schema||{sections:[]}];
}
function exportShape(data){
  const schemas=schemasForData(data);
  const matrixColumns=[...new Set(schemas.flatMap(s=>(s.sections||[]).filter(x=>x.kind==='asset_matrix').flatMap(x=>x.matrixColumns||[])))];
  const assetTypes=[...new Set(schemas.flatMap(s=>(s.sections||[]).flatMap(x=>x.appliesToAssetTypes||[])))];
  const hasChecklist=schemas.some(s=>(s.sections||[]).some(x=>x.kind==='asset_checklist'));
  const hasFields=schemas.some(s=>(s.sections||[]).some(x=>x.kind==='fields'||x.kind==='text_area'));
  return{matrixColumns,assetTypes,hasChecklist,hasFields};
}
function assetRows(data){
  const shape=exportShape(data);
  if(data.formType.assetScope!=='asset')return[{id:'__form_level__',label:'Site-wide form',type:'site',active:true}];
  return data.assets.filter(a=>a.active!==false&&(!shape.assetTypes.length||shape.assetTypes.includes(a.type)));
}
function latestByAssetMonth(instances){
  const map=new Map();
  for(const i of instances){
    const key=`${i.assetId||'__form_level__'}:${String(i.period||'').slice(5,7)}`;
    const prev=map.get(key);
    if(!prev||String(i.submittedAt||i.period)>String(prev.submittedAt||prev.period))map.set(key,i);
  }
  return map;
}
function monthValue(shape,inst){
  if(!inst)return'';
  if(shape.matrixColumns.length)return shape.matrixColumns.map(c=>`${c}: ${displayAnswer(inst.answers?.[c])}`).filter(x=>!x.endsWith(': ')).join(' · ');
  if(shape.hasChecklist&&Object.prototype.hasOwnProperty.call(inst.answers||{},'pass'))return displayAnswer(inst.answers.pass);
  const pairs=Object.entries(inst.answers||{}).filter(([k])=>!k.toLowerCase().includes('photo')&&!k.toLowerCase().includes('signature')).map(([k,v])=>`${k}: ${displayAnswer(v)}`);
  return pairs.join(' · ')||(inst.status==='completed'?'Completed':'');
}

export async function generateXlsx(siteId,formTypeId,year){
  const data=getExportDataset(siteId,formTypeId,year);
  const shape=exportShape(data),rows=assetRows(data),lookup=latestByAssetMonth(data.instances);
  const wb=new ExcelJS.Workbook();wb.creator='Vendero Ops Hub';wb.subject='Annual compliance record';wb.created=new Date();
  const ws=wb.addWorksheet('Annual Record',{views:[{state:'frozen',xSplit:1,ySplit:5}]});
  ws.mergeCells(1,1,1,Math.max(8,1+(shape.matrixColumns.length?12*shape.matrixColumns.length:12)));
  ws.getCell(1,1).value=`${data.formType.name} — ${year}`;ws.getCell(1,1).font={bold:true,size:16,color:{argb:'FF102A4C'}};
  ws.mergeCells(2,1,2,Math.max(8,1+(shape.matrixColumns.length?12*shape.matrixColumns.length:12)));ws.getCell(2,1).value=`${data.site.name} · ${data.site.address}, ${data.site.city} ${data.site.postcode}`;
  ws.mergeCells(3,1,3,Math.max(8,1+(shape.matrixColumns.length?12*shape.matrixColumns.length:12)));ws.getCell(3,1).value=[data.formType.regulatoryTag,data.formType.frequency,`Schema versions used: ${[...new Set(data.instances.map(i=>i.formTypeVersion))].filter(Boolean).join(', ')||data.formType.currentVersion}`].filter(Boolean).join(' · ');
  const headers=['Asset / location'];
  if(shape.matrixColumns.length){for(let m=0;m<12;m++)for(const c of shape.matrixColumns)headers.push(`${MONTHS[m]} ${c}`);}else headers.push(...MONTHS);
  ws.getRow(5).values=headers;ws.getRow(5).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(5).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF102A4C'}};ws.getRow(5).alignment={horizontal:'center',vertical:'middle',wrapText:true};
  ws.getColumn(1).width=34;for(let c=2;c<=headers.length;c++)ws.getColumn(c).width=shape.matrixColumns.length?12:18;
  for(const a of rows){
    const values=[a.label];
    for(let m=1;m<=12;m++){
      const mm=String(m).padStart(2,'0'),inst=lookup.get(`${a.id}:${mm}`);
      if(shape.matrixColumns.length)for(const col of shape.matrixColumns)values.push(displayAnswer(inst?.answers?.[col]));
      else values.push(monthValue(shape,inst));
    }
    ws.addRow(values);
  }
  ws.eachRow((r,rowNo)=>r.eachCell(c=>{c.border={top:{style:'thin',color:{argb:'FFE2E8F0'}},left:{style:'thin',color:{argb:'FFE2E8F0'}},bottom:{style:'thin',color:{argb:'FFE2E8F0'}},right:{style:'thin',color:{argb:'FFE2E8F0'}}};c.alignment={...c.alignment,vertical:'middle',wrapText:true};if(rowNo>5&&rowNo%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}};}));
  const log=wb.addWorksheet('Submissions');
  log.columns=[{header:'Period',key:'period',width:12},{header:'Job',key:'job',width:14},{header:'Schema v',key:'version',width:10},{header:'Asset',key:'asset',width:30},{header:'Status',key:'status',width:14},{header:'Submitted',key:'submitted',width:22},{header:'Answers',key:'answers',width:70}];
  for(const i of data.instances)log.addRow({period:i.period,job:data.jobsById[i.jobId]?.displayId||i.jobId,version:i.formTypeVersion,asset:data.assets.find(a=>a.id===i.assetId)?.label||(i.assetId==='__form_level__'?'Form level':i.assetId),status:i.status,submitted:i.submittedAt||'',answers:JSON.stringify(i.answers||{})});
  log.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};log.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF102A4C'}};log.eachRow(r=>r.eachCell(c=>{c.alignment={vertical:'top',wrapText:true};c.border={bottom:{style:'thin',color:{argb:'FFE2E8F0'}}};}));
  const name=`${safe(data.site.name)}-${safe(data.formType.name)}-${year}.xlsx`,file=path.join(exportDir,name);await wb.xlsx.writeFile(file);return{file,name,data,shape};
}

function tryLibreOffice(xlsxPath){
  const bin=['libreoffice','soffice'].find(cmd=>spawnSync('which',[cmd],{encoding:'utf8'}).status===0);if(!bin)return null;
  const out=spawnSync(bin,['--headless','--convert-to','pdf','--outdir',exportDir,xlsxPath],{encoding:'utf8',timeout:120000});if(out.status!==0)return null;
  const pdf=path.join(exportDir,path.basename(xlsxPath,'.xlsx')+'.pdf');return fs.existsSync(pdf)?pdf:null;
}
function fallbackPdf(data,shape,pdfPath){
  return new Promise((resolve,reject)=>{
    const rows=assetRows(data),lookup=latestByAssetMonth(data.instances),doc=new PDFDocument({size:'A4',layout:'landscape',margin:28}),stream=fs.createWriteStream(pdfPath);
    stream.on('finish',()=>resolve(pdfPath));stream.on('error',reject);doc.pipe(stream);
    doc.fontSize(16).fillColor('#102A4C').text(`${data.formType.name} — ${data.year}`);doc.fontSize(9).fillColor('#475569').text(`${data.site.name} · ${data.site.address}, ${data.site.city} ${data.site.postcode}`);doc.moveDown(.4).fillColor('#111827');
    let y=78;const x0=28,assetW=155,usable=785-assetW,monthW=usable/12;doc.fontSize(7).text('Asset / location',x0,y,{width:assetW});MONTHS.forEach((m,idx)=>doc.text(m,x0+assetW+idx*monthW,y,{width:monthW,align:'center'}));y+=16;
    for(const a of rows){if(y>540){doc.addPage({size:'A4',layout:'landscape',margin:28});y=40;}doc.fontSize(6.5).fillColor('#111827').text(a.label,x0,y,{width:assetW-4});for(let m=1;m<=12;m++){const mm=String(m).padStart(2,'0'),inst=lookup.get(`${a.id}:${mm}`),value=monthValue(shape,inst);doc.fontSize(5.8).text(value,x0+assetW+(m-1)*monthW,y,{width:monthW-2,align:'center',height:16,ellipsis:true});}y+=18;}
    doc.fontSize(7).fillColor('#64748b').text(`Generated by Vendero Ops Hub. Schema versions represented: ${[...new Set(data.instances.map(i=>i.formTypeVersion))].filter(Boolean).join(', ')||data.formType.currentVersion}.`,28,560,{width:780});doc.end();
  });
}

export async function generateComplianceExport(siteId,formTypeId,year,format='both'){
  const x=await generateXlsx(siteId,formTypeId,year),result={siteId,formTypeId,year:Number(year),generatedAt:new Date().toISOString(),xlsx:null,pdf:null,pdfEngine:null};
  if(format==='xlsx'||format==='both')result.xlsx={name:x.name,url:`/exports/${encodeURIComponent(x.name)}`};
  if(format==='pdf'||format==='both'){
    let pdf=tryLibreOffice(x.file),engine='libreoffice';
    if(!pdf){pdf=path.join(exportDir,path.basename(x.file,'.xlsx')+'.pdf');await fallbackPdf(x.data,x.shape,pdf);engine='pdfkit-fallback';}
    result.pdf={name:path.basename(pdf),url:`/exports/${encodeURIComponent(path.basename(pdf))}`};result.pdfEngine=engine;
  }
  return result;
}
export function listExports(){if(!fs.existsSync(exportDir))return[];return fs.readdirSync(exportDir).filter(n=>/\.(xlsx|pdf)$/i.test(n)).map(name=>{const st=fs.statSync(path.join(exportDir,name));return{name,url:`/exports/${encodeURIComponent(name)}`,size:st.size,modifiedAt:st.mtime.toISOString()};}).sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));}
export function resolveExport(name){const clean=path.basename(name),file=path.join(exportDir,clean);return file.startsWith(exportDir)&&fs.existsSync(file)?file:null;}
