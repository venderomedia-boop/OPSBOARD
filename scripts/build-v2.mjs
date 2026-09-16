import fs from 'node:fs';
import path from 'node:path';
import { createSiteLocation, createSiteAsset, getComplianceForms, getFormTypeDetail, runComplianceSelfTest } from './compliance-engine-v2.mjs';

const full=runComplianceSelfTest();
if(!full.ok)throw new Error(`Location-aware compliance engine self-test failed: ${JSON.stringify(full)}`);
const setup=getComplianceForms('job-7');
if(!setup?.siteLocations?.length||!setup?.siteAssets?.length)throw new Error('Location-aware compliance payload is incomplete');
const water=getFormTypeDetail('job-7','ft-water-temps');
if(!water?.instances?.some(i=>i.locationId))throw new Error('Form instances are missing location snapshots');
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
console.log(`Location hierarchy build gates passed: engine=${full.passed}/${full.total} locations=${setup.siteLocations.length} assets=${setup.siteAssets.length} export=${JSON.stringify({xlsxOk,pdfOk,pdfEngine:exported.pdfEngine})}`);
fs.rmSync(exportTestDir,{recursive:true,force:true});

const src=path.resolve('src'),dist=path.resolve('dist');if(!fs.existsSync(src))throw new Error(`Missing source directory: ${src}`);fs.rmSync(dist,{recursive:true,force:true});fs.cpSync(src,dist,{recursive:true});if(!fs.existsSync(path.join(dist,'index.html')))throw new Error('Build completed without dist/index.html');console.log('OPSBOARD v2 source build completed.');
