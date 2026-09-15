import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addFormTypeVersion, attachExtraForm, configureJobCompliance, createFormType, createJobTemplate,
  createSite, createSiteAsset, createSiteAssignment, deleteSite, deleteSiteAsset, deleteSiteAssignment,
  getComplianceForms, getComplianceOverview, getFormCatalogue, getFormHistory, getFormTypeDetail,
  getPersistenceInfo, getSubmissions, runComplianceSelfTest, saveFormInstance, updateFormType,
  updateJobTemplate, updateSite, updateSiteAsset, updateSiteAssignment,
} from './compliance-engine.mjs';
import { generateComplianceExport, listExports, resolveExport } from './compliance-exports.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..','dist');
const port=Number(process.env.PORT||3000);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pdf':'application/pdf'};
function setCors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');}
function json(res,status,payload){setCors(res);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(payload));}
async function readJson(req){const chunks=[];for await(const c of req)chunks.push(c);if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON body'),{statusCode:400});}}
function q(url,key){return url.searchParams.get(key)||undefined;}

async function handleApi(req,res,url){const p=decodeURIComponent(url.pathname);if(req.method==='OPTIONS'){setCors(res);res.writeHead(204);res.end();return true;}
  if(req.method==='GET'&&p==='/api/v1/compliance/overview'){json(res,200,getComplianceOverview());return true;}
  if(req.method==='GET'&&p==='/api/v1/compliance/self-test'){const r=runComplianceSelfTest();json(res,r.ok?200:500,r);return true;}
  if(req.method==='GET'&&p==='/api/v1/compliance/persistence'){json(res,200,getPersistenceInfo());return true;}
  if(req.method==='GET'&&p==='/api/v1/form-types'){json(res,200,getFormCatalogue());return true;}
  if(req.method==='GET'&&p==='/api/v1/sites'){json(res,200,getComplianceOverview().sites);return true;}
  if(req.method==='GET'&&p==='/api/v1/submissions'){json(res,200,getSubmissions({siteId:q(url,'siteId'),formTypeId:q(url,'formTypeId'),status:q(url,'status'),year:q(url,'year')}));return true;}
  if(req.method==='GET'&&p==='/api/v1/exports'){json(res,200,listExports());return true;}

  let m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms$/);
  if(req.method==='GET'&&m){const r=getComplianceForms(m[1]);json(res,r?200:404,r||{message:'Job has no compliance setup'});return true;}
  m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms\/([^/]+)$/);
  if(req.method==='GET'&&m){const r=getFormTypeDetail(m[1],m[2]);json(res,r?200:404,r||{message:'Compliance form not found for this job'});return true;}
  m=p.match(/^\/api\/v1\/sites\/([^/]+)\/form-types\/([^/]+)\/history$/);
  if(req.method==='GET'&&m){json(res,200,getFormHistory(m[1],m[2],Number(q(url,'year')||new Date().getFullYear())));return true;}

  if(req.method==='POST'&&p==='/api/v1/sites'){json(res,201,createSite(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/sites\/([^/]+)$/);if(m&&(req.method==='PATCH'||req.method==='DELETE')){json(res,200,req.method==='DELETE'?deleteSite(m[1]):updateSite(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/site-assets'){json(res,201,createSiteAsset(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/site-assets\/([^/]+)$/);if(m&&(req.method==='PATCH'||req.method==='DELETE')){json(res,200,req.method==='DELETE'?deleteSiteAsset(m[1]):updateSiteAsset(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/site-assignments'){json(res,201,createSiteAssignment(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/site-assignments\/([^/]+)$/);if(m&&(req.method==='PATCH'||req.method==='DELETE')){json(res,200,req.method==='DELETE'?deleteSiteAssignment(m[1]):updateSiteAssignment(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/form-types'){json(res,201,createFormType(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/form-types\/([^/]+)$/);if(m&&req.method==='PATCH'){json(res,200,updateFormType(m[1],await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/form-types\/([^/]+)\/versions$/);if(m&&req.method==='POST'){json(res,201,addFormTypeVersion(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/job-templates'){json(res,201,createJobTemplate(await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/job-templates\/([^/]+)$/);if(m&&req.method==='PATCH'){json(res,200,updateJobTemplate(m[1],await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-setup$/);if(m&&req.method==='PATCH'){json(res,200,configureJobCompliance(m[1],await readJson(req)));return true;}
  m=p.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms\/([^/]+)\/attach$/);if(m&&req.method==='POST'){json(res,200,attachExtraForm(m[1],m[2]));return true;}
  m=p.match(/^\/api\/v1\/form-instances\/([^/]+)$/);if(m&&req.method==='POST'){json(res,200,saveFormInstance(m[1],await readJson(req)));return true;}
  if(req.method==='POST'&&p==='/api/v1/exports'){const body=await readJson(req);if(!body.siteId||!body.formTypeId||!body.year)throw Object.assign(new Error('siteId, formTypeId and year are required'),{statusCode:422});json(res,201,await generateComplianceExport(body.siteId,body.formTypeId,body.year,body.format||'both'));return true;}
  return false;
}

const server=http.createServer(async(req,res)=>{const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);const p=decodeURIComponent(url.pathname);try{
  if(p==='/health'){json(res,200,{ok:true,service:'opsboard',complianceApi:true,persistence:getPersistenceInfo()});return;}
  if(p.startsWith('/api/')){if(!(await handleApi(req,res,url)))json(res,404,{message:'API route not found'});return;}
  if(p.startsWith('/exports/')){const name=p.slice('/exports/'.length);const file=resolveExport(name);if(!file){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','content-disposition':`attachment; filename="${path.basename(file)}"`,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);return;}
  let file=path.join(root,(p==='/'?'index.html':p.replace(/^\/+/,'')));if(!file.startsWith(root)){res.writeHead(403);res.end('Forbidden');return;}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(error){json(res,Number(error?.statusCode||500),{message:error?.message||'Internal server error',...(error?.details?{details:error.details}:{})});}});
server.listen(port,'0.0.0.0',()=>console.log(`OPSBOARD listening on ${port}`));
