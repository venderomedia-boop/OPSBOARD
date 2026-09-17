import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createSiteLocation, createSiteAsset, getComplianceForms, getFormTypeDetail, runComplianceSelfTest, saveFormInstance } from './compliance-engine-v2.mjs';

const full=runComplianceSelfTest();
if(!full.ok)throw new Error(`Location-aware compliance engine self-test failed: ${JSON.stringify(full)}`);
const setup=getComplianceForms('job-7');
if(!setup?.siteLocations?.length||!setup?.siteAssets?.length)throw new Error('Location-aware compliance payload is incomplete');
const water=getFormTypeDetail('job-7','ft-water-temps');
if(!water?.instances?.some(i=>i.locationId))throw new Error('Form instances are missing location snapshots');
const showerInstances=(setup.instances||[]).filter(i=>i.formTypeId==='ft-shower-descale'&&i.assetId&&i.assetId!=='__form_level__');
if(showerInstances.length<2)throw new Error(`Expected at least two shower form instances, found ${showerInstances.length}`);
saveFormInstance(showerInstances[0].id,{answers:{pass:true},status:'completed',submittedBy:'build-test'});
saveFormInstance(showerInstances[1].id,{answers:{pass:false},status:'completed',submittedBy:'build-test'});
const testFloor=createSiteLocation({siteId:'site-2',name:'Build Test Floor',kind:'floor',sortOrder:99});
const testRoom=createSiteLocation({siteId:'site-2',name:'Build Test Room',kind:'room',parentLocationId:testFloor.id});
const testAsset=createSiteAsset({siteId:'site-2',locationId:testRoom.id,type:'luminaire',label:'Build Test Luminaire'});
if(!testAsset.locationId)throw new Error('New asset did not retain locationId');

const exportTestDir='/tmp/opsboard-export-build-test-v2';
fs.rmSync(exportTestDir,{recursive:true,force:true});fs.mkdirSync(exportTestDir,{recursive:true});process.env.COMPLIANCE_EXPORT_DIR=exportTestDir;
const{generateComplianceExport}=await import(`./compliance-exports-v2.mjs?build=${Date.now()}`);
const exported=await generateComplianceExport('site-1','ft-water-temps',2026,'both');
const xlsxPath=exported.xlsx?.name?path.join(exportTestDir,exported.xlsx.name):'',pdfPath=exported.pdf?.name?path.join(exportTestDir,exported.pdf.name):'';
const xlsxOk=Boolean(xlsxPath&&fs.existsSync(xlsxPath)&&fs.statSync(xlsxPath).size>0),pdfOk=Boolean(pdfPath&&fs.existsSync(pdfPath)&&fs.statSync(pdfPath).size>0);
if(!xlsxOk||!pdfOk)throw new Error(`Location-aware compliance export test failed: ${JSON.stringify({exported,xlsxOk,pdfOk})}`);

const showerExport=await generateComplianceExport('site-1','ft-shower-descale',2026,'both');
const showerXlsxPath=showerExport.xlsx?.name?path.join(exportTestDir,showerExport.xlsx.name):'',showerPdfPath=showerExport.pdf?.name?path.join(exportTestDir,showerExport.pdf.name):'';
if(!showerXlsxPath||!fs.existsSync(showerXlsxPath)||!showerPdfPath||!fs.existsSync(showerPdfPath))throw new Error('Shower compliance export did not produce both Excel and PDF');
const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(showerXlsxPath);const annual=wb.getWorksheet('Annual Record');
if(!annual)throw new Error('Shower compliance export missing Annual Record sheet');
const rows=[];for(let rowNo=6;rowNo<=annual.rowCount;rowNo++){const row=annual.getRow(rowNo);rows.push({asset:String(row.getCell(1).value||''),sep:String(row.getCell(10).value||'')});}
const shower1=rows.find(r=>/shower 1/i.test(r.asset)),shower2=rows.find(r=>/shower 2/i.test(r.asset));
if(!shower1||!shower2)throw new Error(`Shower export missing rows: ${JSON.stringify(rows)}`);
const values=[shower1.sep,shower2.sep].sort();if(values.join('|')!=='No|Yes')throw new Error(`Shower export returned incorrect September values: ${JSON.stringify({shower1,shower2})}`);
console.log(`Location hierarchy build gates passed: engine=${full.passed}/${full.total} locations=${setup.siteLocations.length} assets=${setup.siteAssets.length} export=${JSON.stringify({xlsxOk,pdfOk,pdfEngine:exported.pdfEngine})} shower=${JSON.stringify({rows:[shower1,shower2],pdfEngine:showerExport.pdfEngine})}`);
fs.rmSync(exportTestDir,{recursive:true,force:true});

const src=path.resolve('src'),dist=path.resolve('dist');if(!fs.existsSync(src))throw new Error(`Missing source directory: ${src}`);fs.rmSync(dist,{recursive:true,force:true});fs.cpSync(src,dist,{recursive:true});if(!fs.existsSync(path.join(dist,'index.html')))throw new Error('Build completed without dist/index.html');console.log('OPSBOARD v2 source build completed.');