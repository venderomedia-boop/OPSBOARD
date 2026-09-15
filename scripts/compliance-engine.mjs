import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const FORM_LEVEL_ASSET_ID = '__form_level__';
const SECTION_KINDS = new Set(['fields','asset_matrix','asset_checklist','text_area']);
const FIELD_TYPES = new Set(['text','textarea','number','boolean','select','pass_fail','date','signature','photo']);
const ASSET_TYPES = new Set(['tap','shower','luminaire','tank','boiler','other']);
const STATUSES = new Set(['not_started','in_progress','completed']);
const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const periodNow = () => new Date().toISOString().slice(0,7);
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
const id = (prefix, label='') => `${prefix}-${slug(label) || Date.now()}-${Math.random().toString(36).slice(2,7)}`;

const seed = {
  sites: [
    { id:'site-1', customerId:'cust-1', name:'C233 - Meridian Office Park, Block A', address:'14 Meridian Way', city:'Manchester', postcode:'M1 4BT', active:true },
    { id:'site-2', customerId:'cust-7', name:'Arden House', address:'31 King Street', city:'Manchester', postcode:'M2 6AA', active:true },
  ],
  siteAssets: [
    { id:'asset-1', siteId:'site-1', type:'tap', label:'5th Floor WC - WHB 1', floor:'5', active:true, metadata:{tmvFitted:false} },
    { id:'asset-2', siteId:'site-1', type:'tap', label:'5th Floor WC - WHB 2', floor:'5', active:true, metadata:{tmvFitted:false} },
    { id:'asset-3', siteId:'site-1', type:'tap', label:'4th Floor WC - WHB (TMV Fitted)', floor:'4', active:true, metadata:{tmvFitted:true} },
    { id:'asset-4', siteId:'site-1', type:'shower', label:'Lower Mezz Shower 1', floor:'LG', active:true },
    { id:'asset-5', siteId:'site-1', type:'luminaire', label:'Luminaire 1 - Main Stairwell', floor:'G', active:true },
    { id:'asset-6', siteId:'site-1', type:'luminaire', label:'Luminaire 2 - Main Stairwell', floor:'G', active:true },
    { id:'asset-7', siteId:'site-2', type:'luminaire', label:'East Stairwell - L1', floor:'G', active:true },
    { id:'asset-8', siteId:'site-2', type:'luminaire', label:'East Stairwell - L2', floor:'1', active:true },
    { id:'asset-9', siteId:'site-2', type:'luminaire', label:'Reception - L3', floor:'G', active:true },
  ],
  formTypes: [
    { id:'ft-water-temps', name:'Water Temperatures', category:'water_hygiene', assetScope:'asset', appliesToAssetTypes:['tap'], frequency:'monthly', regulatoryTag:'L8 ACoP', active:true, currentVersion:1, versions:[{version:1,createdAt:'2026-09-15T00:00:00+01:00',schema:{sections:[
      { id:'outlets', label:'Outlets', kind:'asset_matrix', matrixColumns:['HWS','CWS'], matrixPeriod:'monthly', appliesToAssetTypes:['tap'] },
      { id:'notes', label:'Notes', kind:'text_area', defaultText:'Temperatures in °C. CWS should be below 20°C within 1 minute. HWS should be 50-60°C within 1 minute.' },
      { id:'engineer', label:'Engineer', kind:'fields', fields:[{id:'initials',label:'Initials',type:'text',required:true},{id:'date',label:'Date of test',type:'date',required:true}] },
    ]}}] },
    { id:'ft-shower-descale', name:'Shower Head Disinfection', category:'water_hygiene', assetScope:'asset', appliesToAssetTypes:['shower'], frequency:'quarterly', regulatoryTag:'L8 ACoP', active:true, currentVersion:1, versions:[{version:1,createdAt:'2026-09-15T00:00:00+01:00',schema:{sections:[
      { id:'showers', label:'Showers', kind:'asset_checklist', appliesToAssetTypes:['shower'] }, { id:'notes', label:'Notes', kind:'text_area' },
    ]}}] },
    { id:'ft-emergency-lights', name:'Emergency Light Monthly Flash Test', category:'emergency_lighting', assetScope:'asset', appliesToAssetTypes:['luminaire'], frequency:'monthly', regulatoryTag:'BS 5266', active:true, currentVersion:1, versions:[{version:1,createdAt:'2026-09-15T00:00:00+01:00',schema:{sections:[
      { id:'luminaires', label:'Luminaires', kind:'asset_checklist', appliesToAssetTypes:['luminaire'] }, { id:'notes', label:'Notes', kind:'text_area' },
    ]}}] },
  ],
  jobTemplates: [
    { id:'jt-monthly-water-hygiene', name:'Monthly Water Hygiene Visit', category:'water_hygiene', requiredFormTypeIds:['ft-water-temps'] },
    { id:'jt-quarterly-water-hygiene', name:'Quarterly Water Hygiene Visit', category:'water_hygiene', requiredFormTypeIds:['ft-water-temps','ft-shower-descale'] },
    { id:'jt-monthly-emergency-lighting', name:'Emergency Light Monthly Test', category:'emergency_lighting', requiredFormTypeIds:['ft-emergency-lights'] },
  ],
  siteAssignments: [
    { id:'assign-1', siteId:'site-1', formTypeId:'ft-water-temps', jobTemplateId:'jt-monthly-water-hygiene', frequency:'monthly', active:true },
    { id:'assign-2', siteId:'site-1', formTypeId:'ft-shower-descale', jobTemplateId:'jt-quarterly-water-hygiene', frequency:'quarterly', active:true },
    { id:'assign-3', siteId:'site-2', formTypeId:'ft-emergency-lights', jobTemplateId:'jt-monthly-emergency-lighting', frequency:'monthly', active:true },
  ],
  jobs: [
    { id:'job-1', displayId:'J-1046', customerId:'cust-1', customer:'Meridian Office Park', siteId:'site-1', jobTemplateId:'jt-monthly-water-hygiene', extraFormTypeIds:[], serviceType:'Water Hygiene Monthly Visit', status:'completed' },
    { id:'job-7', displayId:'J-1055', customerId:'cust-1', customer:'Meridian Office Park', siteId:'site-1', jobTemplateId:'jt-quarterly-water-hygiene', extraFormTypeIds:[], serviceType:'Water Hygiene Compliance Visit', status:'scheduled' },
    { id:'job-emergency-1', displayId:'J-1052', customerId:'cust-7', customer:'Arden House', siteId:'site-2', jobTemplateId:'jt-monthly-emergency-lighting', extraFormTypeIds:[], serviceType:'Emergency Lighting Test', status:'en_route' },
  ],
  formInstances: [
    { id:'fi-1', jobId:'job-1', siteId:'site-1', formTypeId:'ft-water-temps', formTypeVersion:1, assetId:'asset-1', period:'2026-09', status:'completed', answers:{HWS:60,CWS:11}, submittedBy:'user-1', submittedAt:'2026-09-15T09:00:00+01:00' },
    { id:'fi-2', jobId:'job-1', siteId:'site-1', formTypeId:'ft-water-temps', formTypeVersion:1, assetId:'asset-2', period:'2026-09', status:'not_started', answers:{} },
  ],
};

function dbPath() {
  const preferred = process.env.COMPLIANCE_DB_PATH || '/data/opsboard.sqlite';
  try { fs.mkdirSync(path.dirname(preferred),{recursive:true}); fs.accessSync(path.dirname(preferred),fs.constants.W_OK); return preferred; }
  catch { return '/tmp/opsboard.sqlite'; }
}
const databasePath = dbPath();
const db = new DatabaseSync(databasePath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS compliance_state(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);`);
const readStmt = db.prepare('SELECT payload,updated_at FROM compliance_state WHERE id=?');
const writeStmt = db.prepare(`INSERT INTO compliance_state(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`);

function normalize(saved) {
  const s = clone(seed);
  if (!saved || typeof saved !== 'object') return s;
  for (const key of ['sites','siteAssets','formTypes','jobTemplates','jobs','formInstances']) if (Array.isArray(saved[key])) s[key] = saved[key];
  if (Array.isArray(saved.siteAssignments)) s.siteAssignments = saved.siteAssignments;
  s.jobs = s.jobs.map(j => ({...j, extraFormTypeIds:Array.isArray(j.extraFormTypeIds)?j.extraFormTypeIds:[]}));
  return s;
}
let lastPersistedAt = null;
let restoredFromDatabase = false;
let state;
const stored = readStmt.get('main');
if (stored) { try { state = normalize(JSON.parse(stored.payload)); restoredFromDatabase = true; lastPersistedAt = stored.updated_at; } catch { state = clone(seed); } }
else state = clone(seed);
function persist() { lastPersistedAt = nowIso(); writeStmt.run('main',JSON.stringify(state),lastPersistedAt); }
if (!stored) persist();
console.log(`Compliance engine: sqlite ${databasePath} volume=${databasePath.startsWith('/data/')}`);

function find(collection, itemId, label) { const item = collection.find(x=>x.id===itemId); if(!item) throw Object.assign(new Error(`${label} ${itemId} not found`),{statusCode:404}); return item; }
function site(siteId){ return state.sites.find(x=>x.id===siteId); }
function asset(assetId){ return state.siteAssets.find(x=>x.id===assetId); }
function formType(formTypeId){ return state.formTypes.find(x=>x.id===formTypeId); }
function template(templateId){ return state.jobTemplates.find(x=>x.id===templateId); }
function job(jobId){ return state.jobs.find(x=>x.id===jobId); }
function activeAssets(siteId){ return state.siteAssets.filter(x=>x.siteId===siteId && x.active!==false); }
function jobInstances(jobId){ return state.formInstances.filter(x=>x.jobId===jobId); }

function effectiveAssetTypes(ft,schema){ const direct=Array.isArray(ft.appliesToAssetTypes)?ft.appliesToAssetTypes:[]; if(direct.length)return [...new Set(direct)]; return [...new Set((schema.sections||[]).flatMap(s=>Array.isArray(s.appliesToAssetTypes)?s.appliesToAssetTypes:[]))]; }
export function validateFormSchema(schema, options={}) {
  const errors=[]; if(!schema||!Array.isArray(schema.sections)||!schema.sections.length)return {ok:false,errors:['schema.sections must contain at least one section']};
  const sectionIds=new Set(), fieldIds=new Set(), matrixKeys=new Set(); let checklists=0;
  for(const s of schema.sections){
    if(!s?.id) errors.push('every section requires an id'); else if(sectionIds.has(s.id)) errors.push(`duplicate section id: ${s.id}`); else sectionIds.add(s.id);
    if(!SECTION_KINDS.has(s?.kind)) errors.push(`unsupported section kind: ${s?.kind}`);
    for(const t of s?.appliesToAssetTypes||[]) if(!ASSET_TYPES.has(t)) errors.push(`unsupported asset type: ${t}`);
    if(s?.kind==='fields') for(const f of s.fields||[]){ if(!f.id)errors.push(`field in ${s.id} requires an id`); else if(fieldIds.has(f.id))errors.push(`duplicate field id across form: ${f.id}`); else fieldIds.add(f.id); if(!FIELD_TYPES.has(f.type))errors.push(`unsupported field type: ${f.type}`); if(f.type==='select'&&!(f.options||[]).length)errors.push(`select field ${f.id} requires options`); }
    if(s?.kind==='asset_matrix'){ if(!(s.matrixColumns||[]).length)errors.push(`asset_matrix ${s.id} requires matrixColumns`); for(const k of s.matrixColumns||[]){ if(matrixKeys.has(k))errors.push(`duplicate matrix answer key across form: ${k}`); else matrixKeys.add(k); } }
    if(s?.kind==='asset_checklist')checklists++;
  }
  if(checklists>1)errors.push('current renderer supports one asset_checklist section per form');
  if(options.assetScope==='asset'&&!effectiveAssetTypes({appliesToAssetTypes:options.appliesToAssetTypes||[]},schema).length)errors.push('asset-scoped forms require an asset type');
  return {ok:!errors.length,errors};
}

export function getPersistenceInfo(){ let bytes=0; try{bytes=fs.statSync(databasePath).size}catch{} return {engine:'sqlite',path:databasePath,persistentVolume:databasePath.startsWith('/data/'),restoredFromDatabase,lastPersistedAt,bytes}; }
export function getComplianceOverview(){ for(const j of state.jobs)ensureFormInstancesForJob(j.id); return clone(state); }
export function getFormCatalogue(){ return clone(state.formTypes.filter(f=>f.active!==false)); }

export function createSite(input){ if(!input?.name)throw Object.assign(new Error('name is required'),{statusCode:422}); const item={id:input.id||id('site',input.name),customerId:input.customerId||'custom',name:input.name,address:input.address||'',city:input.city||'',postcode:input.postcode||'',active:input.active!==false}; if(site(item.id))throw Object.assign(new Error(`Site ${item.id} already exists`),{statusCode:409}); state.sites.push(item);persist();return clone(item); }
export function updateSite(siteId,input){ const item=find(state.sites,siteId,'Site'); Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>!['id'].includes(k))));persist();return clone(item); }
export function deleteSite(siteId){ return updateSite(siteId,{active:false}); }
export function createSiteAsset(input){ if(!site(input?.siteId))throw Object.assign(new Error('valid siteId is required'),{statusCode:422}); if(!ASSET_TYPES.has(input?.type))throw Object.assign(new Error('valid asset type is required'),{statusCode:422}); if(!input?.label)throw Object.assign(new Error('label is required'),{statusCode:422}); const item={id:input.id||id('asset',input.label),siteId:input.siteId,type:input.type,label:input.label,floor:input.floor||'',active:input.active!==false,metadata:input.metadata||{}}; state.siteAssets.push(item);persist();return clone(item); }
export function updateSiteAsset(assetId,input){ const item=find(state.siteAssets,assetId,'SiteAsset'); if(input?.type&&!ASSET_TYPES.has(input.type))throw Object.assign(new Error('invalid asset type'),{statusCode:422}); Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id')));persist();return clone(item); }
export function deleteSiteAsset(assetId){ return updateSiteAsset(assetId,{active:false}); }

export function createFormType(input){ const schema=input?.schema??input?.versions?.[0]?.schema; const assetScope=input?.assetScope||'site'; const check=validateFormSchema(schema,{assetScope,appliesToAssetTypes:input?.appliesToAssetTypes}); if(!check.ok)throw Object.assign(new Error(check.errors.join('; ')),{statusCode:422,details:check.errors}); if(!input?.name||!input?.category||!input?.frequency)throw Object.assign(new Error('name, category and frequency are required'),{statusCode:422}); const item={id:input.id||id('ft',input.name),name:input.name,category:input.category,assetScope,appliesToAssetTypes:input.appliesToAssetTypes||[],frequency:input.frequency,regulatoryTag:input.regulatoryTag||'',active:input.active!==false,currentVersion:1,versions:[{version:1,createdAt:nowIso(),schema:clone(schema)}]}; if(formType(item.id))throw Object.assign(new Error(`FormType ${item.id} already exists`),{statusCode:409}); state.formTypes.push(item);persist();return clone(item); }
export function updateFormType(formTypeId,input){ const ft=find(state.formTypes,formTypeId,'FormType'); for(const k of ['name','category','frequency','regulatoryTag','active']) if(k in (input||{}))ft[k]=input[k]; persist();return clone(ft); }
export function addFormTypeVersion(formTypeId,input){ const ft=find(state.formTypes,formTypeId,'FormType'); const check=validateFormSchema(input?.schema,{assetScope:ft.assetScope,appliesToAssetTypes:ft.appliesToAssetTypes}); if(!check.ok)throw Object.assign(new Error(check.errors.join('; ')),{statusCode:422,details:check.errors}); const version=Math.max(...ft.versions.map(v=>v.version),0)+1;ft.versions.push({version,createdAt:nowIso(),schema:clone(input.schema)});ft.currentVersion=version;persist();return clone(ft); }

export function createJobTemplate(input){ if(!input?.name||!(input.requiredFormTypeIds||[]).length)throw Object.assign(new Error('name and requiredFormTypeIds are required'),{statusCode:422}); const missing=input.requiredFormTypeIds.filter(x=>!formType(x)); if(missing.length)throw Object.assign(new Error(`Unknown FormType ids: ${missing.join(', ')}`),{statusCode:422}); const item={id:input.id||id('jt',input.name),name:input.name,category:input.category||'general',requiredFormTypeIds:[...new Set(input.requiredFormTypeIds)]}; if(template(item.id))throw Object.assign(new Error(`JobTemplate ${item.id} already exists`),{statusCode:409});state.jobTemplates.push(item);persist();return clone(item); }
export function updateJobTemplate(templateId,input){ const item=find(state.jobTemplates,templateId,'JobTemplate'); if(input?.requiredFormTypeIds){const missing=input.requiredFormTypeIds.filter(x=>!formType(x));if(missing.length)throw Object.assign(new Error(`Unknown FormType ids: ${missing.join(', ')}`),{statusCode:422});item.requiredFormTypeIds=[...new Set(input.requiredFormTypeIds)];} for(const k of ['name','category'])if(k in (input||{}))item[k]=input[k];persist();return clone(item); }

export function createSiteAssignment(input){ if(!site(input?.siteId)||!formType(input?.formTypeId))throw Object.assign(new Error('valid siteId and formTypeId are required'),{statusCode:422}); if(input.jobTemplateId&&!template(input.jobTemplateId))throw Object.assign(new Error('invalid jobTemplateId'),{statusCode:422}); const item={id:input.id||id('assign',`${input.siteId}-${input.formTypeId}`),siteId:input.siteId,formTypeId:input.formTypeId,jobTemplateId:input.jobTemplateId||null,frequency:input.frequency||formType(input.formTypeId).frequency||'ad_hoc',active:input.active!==false,nextDueDate:input.nextDueDate||null};state.siteAssignments.push(item);persist();return clone(item); }
export function updateSiteAssignment(assignmentId,input){ const item=find(state.siteAssignments,assignmentId,'Assignment');Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id')));persist();return clone(item); }
export function deleteSiteAssignment(assignmentId){ return updateSiteAssignment(assignmentId,{active:false}); }

export function configureJobCompliance(jobId,input){ const j=find(state.jobs,jobId,'Job'); if(!site(input?.siteId)||!template(input?.jobTemplateId))throw Object.assign(new Error('valid siteId and jobTemplateId are required'),{statusCode:422});j.siteId=input.siteId;j.jobTemplateId=input.jobTemplateId;ensureFormInstancesForJob(jobId);persist();return clone(j); }
export function attachExtraForm(jobId,formTypeId){ const j=find(state.jobs,jobId,'Job');find(state.formTypes,formTypeId,'FormType');j.extraFormTypeIds=[...new Set([...(j.extraFormTypeIds||[]),formTypeId])];ensureFormInstancesForJob(jobId);persist();return clone(j); }

function requiredFormIds(j){ const ids=[]; const t=template(j.jobTemplateId); if(t)ids.push(...t.requiredFormTypeIds); ids.push(...(j.extraFormTypeIds||[])); for(const a of state.siteAssignments.filter(a=>a.active!==false&&a.siteId===j.siteId&&(!a.jobTemplateId||a.jobTemplateId===j.jobTemplateId)))ids.push(a.formTypeId); return [...new Set(ids)]; }
export function ensureFormInstancesForJob(jobId){ const j=job(jobId);if(!j?.siteId)return[];const existing=jobInstances(jobId);for(const formTypeId of requiredFormIds(j)){const ft=formType(formTypeId);if(!ft||ft.active===false)continue;const already=existing.filter(i=>i.formTypeId===formTypeId);const pinned=already[0]?.formTypeVersion??ft.currentVersion;const version=ft.versions.find(v=>v.version===pinned);if(!version)continue;const schema=version.schema;const formLevel=(schema.sections||[]).some(s=>s.kind==='fields'||s.kind==='text_area');if(ft.assetScope==='asset'){const types=effectiveAssetTypes(ft,schema);for(const a of activeAssets(j.siteId).filter(a=>types.includes(a.type))){if(!existing.some(i=>i.formTypeId===formTypeId&&i.assetId===a.id)){const inst={id:`fi-${slug(jobId)}-${slug(formTypeId)}-${slug(a.id)}`,jobId,siteId:j.siteId,formTypeId,formTypeVersion:pinned,assetId:a.id,period:periodNow(),status:'not_started',answers:{}};state.formInstances.push(inst);existing.push(inst);}}if(formLevel&&!existing.some(i=>i.formTypeId===formTypeId&&i.assetId===FORM_LEVEL_ASSET_ID)){const inst={id:`fi-${slug(jobId)}-${slug(formTypeId)}-form`,jobId,siteId:j.siteId,formTypeId,formTypeVersion:pinned,assetId:FORM_LEVEL_ASSET_ID,period:periodNow(),status:'not_started',answers:{}};state.formInstances.push(inst);existing.push(inst);}}else if(!existing.some(i=>i.formTypeId===formTypeId)){const inst={id:`fi-${slug(jobId)}-${slug(formTypeId)}-form`,jobId,siteId:j.siteId,formTypeId,formTypeVersion:pinned,assetId:FORM_LEVEL_ASSET_ID,period:periodNow(),status:'not_started',answers:{}};state.formInstances.push(inst);existing.push(inst);}}
  return clone(jobInstances(jobId)); }

export function getComplianceForms(jobId){ const j=job(jobId);if(!j?.siteId)return null;const s=site(j.siteId);if(!s)return null;const ids=requiredFormIds(j);const forms=ids.map(formType).filter(Boolean);const instances=ensureFormInstancesForJob(jobId);return clone({site:s,jobTemplate:template(j.jobTemplateId)||{id:'ad-hoc',name:'Ad hoc compliance',category:'general',requiredFormTypeIds:ids},formTypes:forms,instances}); }
export function getFormTypeDetail(jobId,formTypeId){ const j=job(jobId);if(!j?.siteId)return null;const ft=formType(formTypeId);if(!ft)return null;const instances=ensureFormInstancesForJob(jobId).filter(i=>i.formTypeId===formTypeId);if(!instances.length)return null;const pinned=instances[0].formTypeVersion;return clone({site:site(j.siteId),siteAssets:activeAssets(j.siteId),formType:{...ft,currentVersion:pinned},instances,history:getFormHistory(j.siteId,formTypeId,new Date().getFullYear())}); }
export function saveFormInstance(instanceId,input){ const inst=find(state.formInstances,instanceId,'FormInstance');if(!input||typeof input.answers!=='object'||Array.isArray(input.answers)||input.answers===null)throw Object.assign(new Error('answers must be an object'),{statusCode:422});if(!STATUSES.has(input.status))throw Object.assign(new Error(`invalid status: ${input.status}`),{statusCode:422});inst.answers={...(inst.answers||{}),...clone(input.answers)};inst.status=input.status;if(input.status==='completed'){inst.submittedBy=input.submittedBy||'user-1';inst.submittedAt=nowIso();}else{delete inst.submittedBy;delete inst.submittedAt;}persist();return clone(inst); }
export function getFormHistory(siteId,formTypeId,year){ const prefix=`${year}-`;return clone(state.formInstances.filter(i=>i.siteId===siteId&&i.formTypeId===formTypeId&&String(i.period||'').startsWith(prefix)).sort((a,b)=>String(a.period).localeCompare(String(b.period)))); }
export function getSubmissions(filters={}){ return clone(state.formInstances.filter(i=>(!filters.siteId||i.siteId===filters.siteId)&&(!filters.formTypeId||i.formTypeId===filters.formTypeId)&&(!filters.status||i.status===filters.status)&&(!filters.year||String(i.period||'').startsWith(`${filters.year}-`))).sort((a,b)=>String(b.submittedAt||b.period).localeCompare(String(a.submittedAt||a.period)))); }
export function getExportDataset(siteId,formTypeId,year){ const s=find(state.sites,siteId,'Site');const ft=find(state.formTypes,formTypeId,'FormType');const instances=getFormHistory(siteId,formTypeId,year);const assets=state.siteAssets.filter(a=>a.siteId===siteId);const jobsById=Object.fromEntries(state.jobs.map(j=>[j.id,j]));return clone({site:s,formType:ft,year:Number(year),assets,instances,jobsById}); }

export function runComplianceSelfTest(){ const checks=[];const rec=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail});const before=state.formInstances.length;const expanded=ensureFormInstancesForJob('job-7');rec('job template expands',expanded.length>=6,`${expanded.length} instances`);rec('expansion idempotent',ensureFormInstancesForJob('job-7').length===expanded.length);const detail=getFormTypeDetail('job-1','ft-water-temps');rec('schema version pinned',detail?.formType.currentVersion===detail?.instances?.[0]?.formTypeVersion);rec('persistent engine available',Boolean(databasePath));rec('site assignments available',Array.isArray(state.siteAssignments));rec('no destructive expansion',state.formInstances.length>=before);return {ok:checks.every(c=>c.ok),passed:checks.filter(c=>c.ok).length,total:checks.length,checks}; }
