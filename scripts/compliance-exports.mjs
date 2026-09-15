import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getExportDataset } from './compliance-engine.mjs';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const exportDir = process.env.COMPLIANCE_EXPORT_DIR || '/data/exports';
fs.mkdirSync(exportDir,{recursive:true});
const safe = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);

function currentSchema(ft){ return ft.versions.find(v=>v.version===ft.currentVersion)?.schema || ft.versions.at(-1)?.schema || {sections:[]}; }
function assetRows(data){ const schema=currentSchema(data.formType); const types=new Set((schema.sections||[]).flatMap(s=>s.appliesToAssetTypes||[])); return data.assets.filter(a=>a.active!==false && (!types.size || types.has(a.type))); }
function latestByAssetMonth(instances){ const map=new Map(); for(const i of instances){ const key=`${i.assetId || '__form_level__'}:${String(i.period||'').slice(5,7)}`; const prev=map.get(key); if(!prev || String(i.submittedAt||i.period)>String(prev.submittedAt||prev.period))map.set(key,i); } return map; }
function displayAnswer(v){ if(v===true)return '✓'; if(v===false)return '✕'; if(v===null||v===undefined)return ''; if(typeof v==='object')return JSON.stringify(v); return String(v); }

export async function generateXlsx(siteId,formTypeId,year){
  const data=getExportDataset(siteId,formTypeId,year); const schema=currentSchema(data.formType); const rows=assetRows(data); const lookup=latestByAssetMonth(data.instances);
  const wb=new ExcelJS.Workbook(); wb.creator='Vendero Ops Hub'; wb.subject='Annual compliance record';
  const ws=wb.addWorksheet('Annual Record',{views:[{state:'frozen',xSplit:1,ySplit:5}]});
  ws.mergeCells('A1:H1'); ws.getCell('A1').value=`${data.formType.name} — ${year}`; ws.getCell('A1').font={bold:true,size:16};
  ws.mergeCells('A2:H2'); ws.getCell('A2').value=`${data.site.name} · ${data.site.address}, ${data.site.city} ${data.site.postcode}`;
  ws.mergeCells('A3:H3'); ws.getCell('A3').value=[data.formType.regulatoryTag,data.formType.frequency].filter(Boolean).join(' · ');
  const matrix=(schema.sections||[]).find(s=>s.kind==='asset_matrix'); const checklist=(schema.sections||[]).find(s=>s.kind==='asset_checklist');
  let columns=[{header:'Asset / location',key:'asset',width:34}];
  if(matrix){ for(let m=1;m<=12;m++) for(const c of matrix.matrixColumns||[])columns.push({header:`${MONTHS[m-1]} ${c}`,key:`m${m}-${c}`,width:12}); }
  else { for(let m=1;m<=12;m++)columns.push({header:MONTHS[m-1],key:`m${m}`,width:12}); }
  ws.columns=columns; ws.getRow(5).font={bold:true}; ws.getRow(5).alignment={horizontal:'center',vertical:'middle',wrapText:true};
  for(const a of rows){ const row={asset:a.label}; for(let m=1;m<=12;m++){const mm=String(m).padStart(2,'0');const inst=lookup.get(`${a.id}:${mm}`);if(matrix){for(const c of matrix.matrixColumns||[])row[`m${m}-${c}`]=displayAnswer(inst?.answers?.[c]);}else if(checklist){row[`m${m}`]=inst?.status==='completed'?displayAnswer(inst?.answers?.pass):'';} } ws.addRow(row); }
  const log=wb.addWorksheet('Submissions'); log.columns=[{header:'Period',key:'period',width:12},{header:'Job',key:'job',width:14},{header:'Asset',key:'asset',width:30},{header:'Status',key:'status',width:14},{header:'Submitted',key:'submitted',width:22},{header:'Answers',key:'answers',width:70}];
  for(const i of data.instances){log.addRow({period:i.period,job:data.jobsById[i.jobId]?.displayId||i.jobId,asset:data.assets.find(a=>a.id===i.assetId)?.label||'Form level',status:i.status,submitted:i.submittedAt||'',answers:JSON.stringify(i.answers||{})});}
  [ws,log].forEach(s=>{s.eachRow(r=>r.eachCell(c=>{c.border={top:{style:'thin',color:{argb:'FFE2E8F0'}},left:{style:'thin',color:{argb:'FFE2E8F0'}},bottom:{style:'thin',color:{argb:'FFE2E8F0'}},right:{style:'thin',color:{argb:'FFE2E8F0'}}};c.alignment={...c.alignment,vertical:'middle',wrapText:true};}));});
  const name=`${safe(data.site.name)}-${safe(data.formType.name)}-${year}.xlsx`; const file=path.join(exportDir,name); await wb.xlsx.writeFile(file); return {file,name,data};
}

function tryLibreOffice(xlsxPath){ const bin=['libreoffice','soffice'].find(cmd=>spawnSync('which',[cmd],{encoding:'utf8'}).status===0); if(!bin)return null; const out=spawnSync(bin,['--headless','--convert-to','pdf','--outdir',exportDir,xlsxPath],{encoding:'utf8',timeout:120000}); if(out.status!==0)return null; const pdf=path.join(exportDir,path.basename(xlsxPath,'.xlsx')+'.pdf'); return fs.existsSync(pdf)?pdf:null; }
function fallbackPdf(data,pdfPath){ const schema=currentSchema(data.formType); const rows=assetRows(data); const lookup=latestByAssetMonth(data.instances); const matrix=(schema.sections||[]).find(s=>s.kind==='asset_matrix'); const doc=new PDFDocument({size:'A4',layout:'landscape',margin:28}); doc.pipe(fs.createWriteStream(pdfPath)); doc.fontSize(16).text(`${data.formType.name} — ${data.year}`); doc.fontSize(9).fillColor('#475569').text(`${data.site.name} · ${data.site.address}, ${data.site.city} ${data.site.postcode}`); doc.moveDown(.4).fillColor('#111827'); let y=78; const x0=28, assetW=155, usable=785-assetW, monthW=usable/12; doc.fontSize(7).text('Asset / location',x0,y,{width:assetW}); MONTHS.forEach((m,idx)=>doc.text(m,x0+assetW+idx*monthW,y,{width:monthW,align:'center'})); y+=16; for(const a of rows){ if(y>540){doc.addPage({size:'A4',layout:'landscape',margin:28});y=40;} doc.fontSize(6.5).text(a.label,x0,y,{width:assetW-4}); for(let m=1;m<=12;m++){const mm=String(m).padStart(2,'0');const inst=lookup.get(`${a.id}:${mm}`);let value='';if(matrix)value=(matrix.matrixColumns||[]).map(c=>`${c}:${displayAnswer(inst?.answers?.[c])}`).join(' ');else value=inst?.status==='completed'?displayAnswer(inst?.answers?.pass):'';doc.text(value,x0+assetW+(m-1)*monthW,y,{width:monthW-2,align:'center'});} y+=18;} doc.moveDown(); doc.fontSize(7).fillColor('#64748b').text('Generated by Vendero Ops Hub. Historical values are generated from the schema version pinned to each submitted form instance.',28,560,{width:780}); doc.end(); }

export async function generateComplianceExport(siteId,formTypeId,year,format='both'){
  const x=await generateXlsx(siteId,formTypeId,year); const result={siteId,formTypeId,year:Number(year),generatedAt:new Date().toISOString(),xlsx:null,pdf:null,pdfEngine:null};
  if(format==='xlsx'||format==='both')result.xlsx={name:x.name,url:`/exports/${encodeURIComponent(x.name)}`};
  if(format==='pdf'||format==='both'){ let pdf=tryLibreOffice(x.file); let engine='libreoffice'; if(!pdf){pdf=path.join(exportDir,path.basename(x.file,'.xlsx')+'.pdf');fallbackPdf(x.data,pdf);engine='pdfkit-fallback';} result.pdf={name:path.basename(pdf),url:`/exports/${encodeURIComponent(path.basename(pdf))}`};result.pdfEngine=engine; }
  return result;
}
export function listExports(){ if(!fs.existsSync(exportDir))return[]; return fs.readdirSync(exportDir).filter(n=>/\.(xlsx|pdf)$/i.test(n)).map(name=>{const st=fs.statSync(path.join(exportDir,name));return{name,url:`/exports/${encodeURIComponent(name)}`,size:st.size,modifiedAt:st.mtime.toISOString()};}).sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)); }
export function resolveExport(name){ const clean=path.basename(name); const file=path.join(exportDir,clean); return file.startsWith(exportDir)&&fs.existsSync(file)?file:null; }
