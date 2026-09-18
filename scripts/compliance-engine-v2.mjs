import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ppmDemoSeed } from './ppm-demo-seed.mjs';

export const FORM_LEVEL_ASSET_ID = '__form_level__';
const SECTION_KINDS = new Set(['fields','asset_matrix','asset_checklist','text_area']);
const FIELD_TYPES = new Set(['text','textarea','number','boolean','select','pass_fail','date','signature','photo']);
const ASSET_TYPES = new Set(['tap','shower','luminaire','tank','boiler','other']);
const LOCATION_KINDS = new Set(['floor','room','area','zone']);
const STATUSES = new Set(['not_started','in_progress','completed']);
const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const periodNow = () => new Date().toISOString().slice(0,7);
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
const makeId = (prefix,label='') => `${prefix}-${slug(label) || Date.now()}-${Math.random().toString(36).slice(2,7)}`;

const seedLocations = [
  {id:'loc-s1-5',siteId:'site-1',parentLocationId:null,kind:'floor',name:'5th Floor',sortOrder:50,active:true},
  {id:'loc-s1-5-wc',siteId:'site-1',parentLocationId:'loc-s1-5',kind:'room',name:'WC',sortOrder:1,active:true},
  {id:'loc-s1-4',siteId:'site-1',parentLocationId:null,kind:'floor',name:'4th Floor',sortOrder:40,active:true},
  {id:'loc-s1-4-wc',siteId:'site-1',parentLocationId:'loc-s1-4',kind:'room',name:'WC',sortOrder:1,active:true},
  {id:'loc-s1-4-disabled',siteId:'site-1',parentLocationId:'loc-s1-4',kind:'room',name:'Disabled WC',sortOrder:2,active:true},
  {id:'loc-s1-3',siteId:'site-1',parentLocationId:null,kind:'floor',name:'3rd Floor',sortOrder:30,active:true},
  {id:'loc-s1-3-wc',siteId:'site-1',parentLocationId:'loc-s1-3',kind:'room',name:'WC',sortOrder:1,active:true},
  {id:'loc-s1-2',siteId:'site-1',parentLocationId:null,kind:'floor',name:'2nd Floor',sortOrder:20,active:true},
  {id:'loc-s1-2-wc',siteId:'site-1',parentLocationId:'loc-s1-2',kind:'room',name:'WC',sortOrder:1,active:true},
  {id:'loc-s1-2-disabled',siteId:'site-1',parentLocationId:'loc-s1-2',kind:'room',name:'Disabled WC',sortOrder:2,active:true},
  {id:'loc-s1-1',siteId:'site-1',parentLocationId:null,kind:'floor',name:'1st Floor',sortOrder:10,active:true},
  {id:'loc-s1-1-wc',siteId:'site-1',parentLocationId:'loc-s1-1',kind:'room',name:'WC',sortOrder:1,active:true},
  {id:'loc-s1-g',siteId:'site-1',parentLocationId:null,kind:'floor',name:'Ground Floor',sortOrder:0,active:true},
  {id:'loc-s1-g-wc',siteId:'site-1',parentLocationId:'loc-s1-g',kind:'room',name:'WC',sortOrder:1,active:true},
  {id:'loc-s1-g-disabled',siteId:'site-1',parentLocationId:'loc-s1-g',kind:'room',name:'Disabled WC',sortOrder:2,active:true},
  {id:'loc-s1-g-stair',siteId:'site-1',parentLocationId:'loc-s1-g',kind:'area',name:'Main Stairwell',sortOrder:3,active:true},
  {id:'loc-s1-lm',siteId:'site-1',parentLocationId:null,kind:'floor',name:'Lower Mezzanine',sortOrder:-10,active:true},
  {id:'loc-s1-lm-showers',siteId:'site-1',parentLocationId:'loc-s1-lm',kind:'room',name:'Showers',sortOrder:1,active:true},
  {id:'loc-s2-g',siteId:'site-2',parentLocationId:null,kind:'floor',name:'Ground Floor',sortOrder:0,active:true},
  {id:'loc-s2-g-east-stair',siteId:'site-2',parentLocationId:'loc-s2-g',kind:'area',name:'East Stairwell',sortOrder:1,active:true},
  {id:'loc-s2-g-reception',siteId:'site-2',parentLocationId:'loc-s2-g',kind:'room',name:'Reception',sortOrder:2,active:true},
  {id:'loc-s2-1',siteId:'site-2',parentLocationId:null,kind:'floor',name:'1st Floor',sortOrder:10,active:true},
  {id:'loc-s2-1-east-stair',siteId:'site-2',parentLocationId:'loc-s2-1',kind:'area',name:'East Stairwell',sortOrder:1,active:true},
];

const seed = {
  sites:[
    {id:'site-1',customerId:'cust-1',name:'C233 - Meridian Office Park, Block A',address:'14 Meridian Way',city:'Manchester',postcode:'M1 4BT',active:true},
    {id:'site-2',customerId:'cust-7',name:'Arden House',address:'31 King Street',city:'Manchester',postcode:'M2 6AA',active:true},
    ...ppmDemoSeed.sites,
  ],
  siteLocations:[...seedLocations,...ppmDemoSeed.siteLocations],
  siteAssets:[
    ...ppmDemoSeed.siteAssets,
    {id:'asset-1',siteId:'site-1',locationId:'loc-s1-5-wc',type:'tap',label:'WHB 1',floor:'5',active:true,metadata:{tmvFitted:false}},
    {id:'asset-2',siteId:'site-1',locationId:'loc-s1-5-wc',type:'tap',label:'WHB 2',floor:'5',active:true,metadata:{tmvFitted:false}},
    {id:'asset-3',siteId:'site-1',locationId:'loc-s1-4-wc',type:'tap',label:'WHB (TMV Fitted)',floor:'4',active:true,metadata:{tmvFitted:true}},
    {id:'asset-10',siteId:'site-1',locationId:'loc-s1-4-disabled',type:'tap',label:'Thermostatic Tap',floor:'4',active:true,metadata:{tmvFitted:true}},
    {id:'asset-11',siteId:'site-1',locationId:'loc-s1-3-wc',type:'tap',label:'WHB 1 (TMV Fitted)',floor:'3',active:true,metadata:{tmvFitted:true}},
    {id:'asset-12',siteId:'site-1',locationId:'loc-s1-3-wc',type:'tap',label:'WHB 2 (TMV Fitted)',floor:'3',active:true,metadata:{tmvFitted:true}},
    {id:'asset-13',siteId:'site-1',locationId:'loc-s1-2-wc',type:'tap',label:'WHB (TMV Fitted)',floor:'2',active:true,metadata:{tmvFitted:true}},
    {id:'asset-14',siteId:'site-1',locationId:'loc-s1-2-disabled',type:'tap',label:'Thermostatic Tap',floor:'2',active:true,metadata:{tmvFitted:true}},
    {id:'asset-15',siteId:'site-1',locationId:'loc-s1-1-wc',type:'tap',label:'WHB 1 (TMV Fitted)',floor:'1',active:true,metadata:{tmvFitted:true}},
    {id:'asset-16',siteId:'site-1',locationId:'loc-s1-1-wc',type:'tap',label:'WHB 2 (TMV Fitted)',floor:'1',active:true,metadata:{tmvFitted:true}},
    {id:'asset-17',siteId:'site-1',locationId:'loc-s1-g-wc',type:'tap',label:'WHB (TMV Fitted)',floor:'G',active:true,metadata:{tmvFitted:true}},
    {id:'asset-18',siteId:'site-1',locationId:'loc-s1-g-disabled',type:'tap',label:'Thermostatic Tap',floor:'G',active:true,metadata:{tmvFitted:true}},
    {id:'asset-4',siteId:'site-1',locationId:'loc-s1-lm-showers',type:'shower',label:'Shower 1',floor:'LG',active:true},
    {id:'asset-19',siteId:'site-1',locationId:'loc-s1-lm-showers',type:'shower',label:'Shower 2',floor:'LG',active:true},
    {id:'asset-5',siteId:'site-1',locationId:'loc-s1-g-stair',type:'luminaire',label:'Luminaire 1',floor:'G',active:true},
    {id:'asset-6',siteId:'site-1',locationId:'loc-s1-g-stair',type:'luminaire',label:'Luminaire 2',floor:'G',active:true},
    {id:'asset-7',siteId:'site-2',locationId:'loc-s2-g-east-stair',type:'luminaire',label:'L1',floor:'G',active:true},
    {id:'asset-8',siteId:'site-2',locationId:'loc-s2-1-east-stair',type:'luminaire',label:'L2',floor:'1',active:true},
    {id:'asset-9',siteId:'site-2',locationId:'loc-s2-g-reception',type:'luminaire',label:'L3',floor:'G',active:true},
  ],
  formTypes:[
    ...ppmDemoSeed.formTypes,
    {id:'ft-water-temps',name:'Water Temperatures',category:'water_hygiene',assetScope:'asset',appliesToAssetTypes:['tap','shower'],frequency:'monthly',regulatoryTag:'L8 ACoP',active:true,currentVersion:2,versions:[
      {version:1,createdAt:'2026-09-15T00:00:00+01:00',schema:{sections:[
        {id:'outlets',label:'Outlets',kind:'asset_matrix',matrixColumns:['HWS','CWS'],matrixPeriod:'monthly',appliesToAssetTypes:['tap']},
        {id:'notes',label:'Notes',kind:'text_area',defaultText:'Temperatures in °C. CWS should be below 20°C within 1 minute. HWS should be 50-60°C within 1 minute.'},
        {id:'engineer',label:'Engineer',kind:'fields',fields:[{id:'initials',label:'Initials',type:'text',required:true},{id:'date',label:'Date of test',type:'date',required:true}]},
      ]}},
      {version:2,createdAt:'2026-09-16T09:00:00+01:00',changeNote:'Group outlet readings by floor and room',schema:{sections:[
        {id:'outlets',label:'Outlet temperatures',kind:'asset_matrix',groupBy:'location',matrixColumns:['HWS','CWS'],matrixPeriod:'monthly',appliesToAssetTypes:['tap','shower']},
        {id:'notes',label:'Notes',kind:'text_area',defaultText:'Temperatures in °C. CWS should be below 20°C within 1 minute. HWS should be 50-60°C within 1 minute.'},
        {id:'engineer',label:'Engineer sign-off',kind:'fields',fields:[{id:'initials',label:'Initials',type:'text',required:true},{id:'date',label:'Date of test',type:'date',required:true}]},
      ]}},
    ]},
    {id:'ft-shower-descale',name:'Shower Head Disinfection',category:'water_hygiene',assetScope:'asset',appliesToAssetTypes:['shower'],frequency:'quarterly',regulatoryTag:'L8 ACoP',active:true,currentVersion:2,versions:[
      {version:1,createdAt:'2026-09-15T00:00:00+01:00',schema:{sections:[{id:'showers',label:'Showers',kind:'asset_checklist',appliesToAssetTypes:['shower']},{id:'notes',label:'Notes',kind:'text_area'}]}},
      {version:2,createdAt:'2026-09-16T09:00:00+01:00',changeNote:'Group showers by floor and room',schema:{sections:[{id:'showers',label:'Shower head cleaning',kind:'asset_checklist',groupBy:'location',appliesToAssetTypes:['shower']},{id:'notes',label:'Notes',kind:'text_area'}]}},
    ]},
    {id:'ft-emergency-lights',name:'Emergency Light Monthly Flash Test',category:'emergency_lighting',assetScope:'asset',appliesToAssetTypes:['luminaire'],frequency:'monthly',regulatoryTag:'BS 5266',active:true,currentVersion:2,versions:[
      {version:1,createdAt:'2026-09-15T00:00:00+01:00',schema:{sections:[{id:'luminaires',label:'Luminaires',kind:'asset_checklist',appliesToAssetTypes:['luminaire']},{id:'notes',label:'Notes',kind:'text_area'}]}},
      {version:2,createdAt:'2026-09-16T09:00:00+01:00',changeNote:'Group emergency lights by location',schema:{sections:[{id:'luminaires',label:'Emergency lights',kind:'asset_checklist',groupBy:'location',appliesToAssetTypes:['luminaire']},{id:'notes',label:'Notes',kind:'text_area'}]}},
    ]},
  ],
  jobTemplates:[
    ...ppmDemoSeed.jobTemplates,
    {id:'jt-monthly-water-hygiene',name:'Monthly Water Hygiene Visit',category:'water_hygiene',requiredFormTypeIds:['ft-water-temps']},
    {id:'jt-quarterly-water-hygiene',name:'Quarterly Water Hygiene Visit',category:'water_hygiene',requiredFormTypeIds:['ft-water-temps','ft-shower-descale']},
    {id:'jt-monthly-emergency-lighting',name:'Emergency Light Monthly Test',category:'emergency_lighting',requiredFormTypeIds:['ft-emergency-lights']},
  ],
  siteAssignments:[
    ...ppmDemoSeed.siteAssignments,
    {id:'assign-1',siteId:'site-1',formTypeId:'ft-water-temps',jobTemplateId:'jt-monthly-water-hygiene',frequency:'monthly',active:true},
    {id:'assign-2',siteId:'site-1',formTypeId:'ft-shower-descale',jobTemplateId:'jt-quarterly-water-hygiene',frequency:'quarterly',active:true},
    {id:'assign-3',siteId:'site-2',formTypeId:'ft-emergency-lights',jobTemplateId:'jt-monthly-emergency-lighting',frequency:'monthly',active:true},
  ],
  jobs:[
    {id:'job-1',displayId:'J-1046',customerId:'cust-1',customer:'Meridian Office Park',siteId:'site-1',jobTemplateId:'jt-monthly-water-hygiene',extraFormTypeIds:[],serviceType:'Water Hygiene Monthly Visit',status:'completed'},
    {id:'job-7',displayId:'J-1055',customerId:'cust-1',customer:'Meridian Office Park',siteId:'site-1',jobTemplateId:'jt-quarterly-water-hygiene',extraFormTypeIds:[],serviceType:'Water Hygiene Compliance Visit',status:'scheduled'},
    {id:'job-emergency-1',displayId:'J-1052',customerId:'cust-7',customer:'Arden House',siteId:'site-2',jobTemplateId:'jt-monthly-emergency-lighting',extraFormTypeIds:[],serviceType:'Emergency Lighting Test',status:'en_route'},
  ],
  formInstances:[
    {id:'fi-1',jobId:'job-1',siteId:'site-1',formTypeId:'ft-water-temps',formTypeVersion:1,assetId:'asset-1',locationId:'loc-s1-5-wc',period:'2026-09',status:'completed',answers:{HWS:60,CWS:11},submittedBy:'user-1',submittedAt:'2026-09-15T09:00:00+01:00'},
    {id:'fi-2',jobId:'job-1',siteId:'site-1',formTypeId:'ft-water-temps',formTypeVersion:1,assetId:'asset-2',locationId:'loc-s1-5-wc',period:'2026-09',status:'not_started',answers:{}},
  ],
};

function mergeById(baseItems,savedItems){
  const map=new Map(baseItems.map(x=>[x.id,clone(x)]));
  for(const item of savedItems||[]){
    const current=map.get(item.id)||{};
    map.set(item.id,{...current,...clone(item)});
  }
  return [...map.values()];
}
function floorDisplay(code){
  const raw=String(code||'').trim().toUpperCase();
  if(raw==='G'||raw==='GF'||raw==='0')return'Ground Floor';
  if(raw==='LG'||raw==='LM'||raw==='B'||raw==='B1')return'Lower Mezzanine';
  const n=Number(raw);if(Number.isFinite(n)){const mod=n%10,suffix=(n%100>=11&&n%100<=13)?'th':mod===1?'st':mod===2?'nd':mod===3?'rd':'th';return`${n}${suffix} Floor`;}
  return raw?`${raw} Floor`:'Unspecified Floor';
}
function inferRoom(label,type){
  const text=String(label||'').replace(/\s+/g,' ').trim();
  if(/disabled wc/i.test(text))return'Disabled WC';
  if(/\bwc\b/i.test(text))return'WC';
  if(/shower/i.test(text))return'Showers';
  if(/stair/i.test(text))return text.match(/(main|east|west|north|south)?\s*stair\w*/i)?.[0]?.trim()||'Stairwell';
  if(/reception/i.test(text))return'Reception';
  return type==='luminaire'?'General Area':'General';
}
function shortAssetLabel(label){
  let text=String(label||'').trim();
  text=text.replace(/^\d+(st|nd|rd|th)\s+Floor\s*/i,'').replace(/^Ground Floor\s*/i,'').replace(/^GF\s*/i,'').replace(/^Lower Mezz(?:anine|a?ine)?\s*-?\s*/i,'');
  text=text.replace(/^Disabled WC\s*-?\s*/i,'').replace(/^WC\s*-?\s*/i,'');
  if(text.includes(' - ')){const parts=text.split(' - ');if(parts.length>1&&/stair|reception/i.test(parts.slice(1).join(' - ')))text=parts[0];}
  return text||label;
}
function ensureLegacyLocations(state){
  for(const a of state.siteAssets){
    if(a.locationId&&state.siteLocations.some(l=>l.id===a.locationId))continue;
    const floorName=floorDisplay(a.floor);
    let floor=state.siteLocations.find(l=>l.siteId===a.siteId&&l.parentLocationId==null&&l.name===floorName&&l.active!==false);
    if(!floor){floor={id:makeId('loc',`${a.siteId}-${floorName}`),siteId:a.siteId,parentLocationId:null,kind:'floor',name:floorName,sortOrder:Number(a.floor)||0,active:true};state.siteLocations.push(floor);}
    const roomName=inferRoom(a.label,a.type);
    let room=state.siteLocations.find(l=>l.siteId===a.siteId&&l.parentLocationId===floor.id&&l.name===roomName&&l.active!==false);
    if(!room){room={id:makeId('loc',`${floor.id}-${roomName}`),siteId:a.siteId,parentLocationId:floor.id,kind:'room',name:roomName,sortOrder:1,active:true};state.siteLocations.push(room);}
    a.locationId=room.id;
    if(/Floor|WC|Shower|Stair|Reception/i.test(a.label))a.label=shortAssetLabel(a.label);
  }
  for(const i of state.formInstances){if(!i.locationId&&i.assetId&&i.assetId!==FORM_LEVEL_ASSET_ID)i.locationId=state.siteAssets.find(a=>a.id===i.assetId)?.locationId;}
}
function upgradeBaselineForms(state){
  const water=state.formTypes.find(f=>f.id==='ft-water-temps');
  if(water){
    water.appliesToAssetTypes=[...new Set([...(water.appliesToAssetTypes||[]),'tap','shower'])];
    const hasLocationVersion=(water.versions||[]).some(v=>(v.schema?.sections||[]).some(s=>s.kind==='asset_matrix'&&s.groupBy==='location'));
    if(!hasLocationVersion){const current=water.versions.find(v=>v.version===water.currentVersion)||water.versions.at(-1);const version=Math.max(...water.versions.map(v=>v.version),0)+1;const schema=clone(current.schema);for(const s of schema.sections||[]){if(s.kind==='asset_matrix'){s.groupBy='location';s.appliesToAssetTypes=['tap','shower'];}}water.versions.push({version,createdAt:nowIso(),changeNote:'Add floor/room grouping',schema});water.currentVersion=version;}
  }
  for(const id of ['ft-shower-descale','ft-emergency-lights']){const ft=state.formTypes.find(f=>f.id===id);if(!ft)continue;const has=(ft.versions||[]).some(v=>(v.schema?.sections||[]).some(s=>(s.kind==='asset_checklist'||s.kind==='asset_matrix')&&s.groupBy==='location'));if(!has){const current=ft.versions.find(v=>v.version===ft.currentVersion)||ft.versions.at(-1);const version=Math.max(...ft.versions.map(v=>v.version),0)+1;const schema=clone(current.schema);for(const s of schema.sections||[])if(s.kind==='asset_checklist'||s.kind==='asset_matrix')s.groupBy='location';ft.versions.push({version,createdAt:nowIso(),changeNote:'Add floor/room grouping',schema});ft.currentVersion=version;}}
}
function normalize(saved){
  const s=clone(seed);
  if(saved&&typeof saved==='object'){
    s.sites=mergeById(seed.sites,Array.isArray(saved.sites)?saved.sites:[]);
    s.siteLocations=mergeById(seed.siteLocations,Array.isArray(saved.siteLocations)?saved.siteLocations:[]);
    s.siteAssets=mergeById(seed.siteAssets,Array.isArray(saved.siteAssets)?saved.siteAssets:[]);
    s.formTypes=mergeById(seed.formTypes,Array.isArray(saved.formTypes)?saved.formTypes:[]);
    s.jobTemplates=mergeById(seed.jobTemplates,Array.isArray(saved.jobTemplates)?saved.jobTemplates:[]);
    s.siteAssignments=mergeById(seed.siteAssignments,Array.isArray(saved.siteAssignments)?saved.siteAssignments:[]);
    s.jobs=mergeById(seed.jobs,Array.isArray(saved.jobs)?saved.jobs:[]);
    s.formInstances=mergeById(seed.formInstances,Array.isArray(saved.formInstances)?saved.formInstances:[]);
  }
  s.jobs=s.jobs.map(j=>({...j,extraFormTypeIds:Array.isArray(j.extraFormTypeIds)?j.extraFormTypeIds:[]}));
  s.siteAssignments=s.siteAssignments.map(a=>({
    ...a,
    scheduleBasis:a.scheduleBasis==='usage'?'usage':'time',
    nextDueDate:a.nextDueDate||null,
    leadDays:Math.max(0,Math.min(90,Number(a.leadDays??21)||21)),
    autoCreate:a.autoCreate!==false,
    durationMinutes:Math.max(15,Number(a.durationMinutes??90)||90),
    priority:a.priority==='urgent'?'urgent':'normal',
    serviceType:a.serviceType||'',
    usageIntervalHours:Math.max(1,Number(a.usageIntervalHours??500)||500),
    currentUsageHours:Math.max(0,Number(a.currentUsageHours??0)||0),
    nextDueUsageHours:Math.max(0,Number(a.nextDueUsageHours??0)||0),
    usageLeadHours:Math.max(0,Number(a.usageLeadHours??25)||25),
    usageDailyHours:Math.max(0,Number(a.usageDailyHours??0)||0),
    preferredTechnicianIds:Array.isArray(a.preferredTechnicianIds)?[...new Set(a.preferredTechnicianIds.filter(Boolean))]:[],
    assetIds:Array.isArray(a.assetIds)?[...new Set(a.assetIds.filter(Boolean))]:[],
    tools:Array.isArray(a.tools)?a.tools.filter(Boolean):[],
    spareParts:Array.isArray(a.spareParts)?a.spareParts.filter(Boolean):[],
    lastGeneratedJobId:a.lastGeneratedJobId||null,
    lastGeneratedDueDate:a.lastGeneratedDueDate||null,
    lastGeneratedDueUsageHours:Number(a.lastGeneratedDueUsageHours||0)||null,
    lastCompletedJobId:a.lastCompletedJobId||null,
    lastCompletedAt:a.lastCompletedAt||null,
    lastCompletedUsageHours:Number(a.lastCompletedUsageHours||0)||null,
  }));
  ensureLegacyLocations(s);upgradeBaselineForms(s);
  return s;
}

function dbPath(){const preferred=process.env.COMPLIANCE_DB_PATH||'/data/opsboard.sqlite';try{fs.mkdirSync(path.dirname(preferred),{recursive:true});fs.accessSync(path.dirname(preferred),fs.constants.W_OK);return preferred;}catch{return'/tmp/opsboard.sqlite';}}
const databasePath=dbPath();
const db=new DatabaseSync(databasePath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS compliance_state(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);`);
const readStmt=db.prepare('SELECT payload,updated_at FROM compliance_state WHERE id=?');
const writeStmt=db.prepare(`INSERT INTO compliance_state(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`);
let lastPersistedAt=null,restoredFromDatabase=false;
const stored=readStmt.get('main');
let state;
if(stored){try{state=normalize(JSON.parse(stored.payload));restoredFromDatabase=true;lastPersistedAt=stored.updated_at;}catch{state=normalize(null);}}else state=normalize(null);
function persist(){lastPersistedAt=nowIso();writeStmt.run('main',JSON.stringify(state),lastPersistedAt);}
persist();
console.log(`Compliance engine v2: sqlite ${databasePath} volume=${databasePath.startsWith('/data/')}`);

function find(collection,itemId,label){const item=collection.find(x=>x.id===itemId);if(!item)throw Object.assign(new Error(`${label} ${itemId} not found`),{statusCode:404});return item;}
const site=id=>state.sites.find(x=>x.id===id);
const location=id=>state.siteLocations.find(x=>x.id===id);
const asset=id=>state.siteAssets.find(x=>x.id===id);
const formType=id=>state.formTypes.find(x=>x.id===id);
const template=id=>state.jobTemplates.find(x=>x.id===id);
const job=id=>state.jobs.find(x=>x.id===id);
const activeAssets=siteId=>state.siteAssets.filter(x=>x.siteId===siteId&&x.active!==false);
const activeLocations=siteId=>state.siteLocations.filter(x=>x.siteId===siteId&&x.active!==false);
const jobInstances=jobId=>state.formInstances.filter(x=>x.jobId===jobId);

export function locationPath(locationId,locations=state.siteLocations){const map=new Map(locations.map(l=>[l.id,l]));const parts=[];let current=map.get(locationId),guard=0;while(current&&guard++<12){parts.unshift(current.name);current=current.parentLocationId?map.get(current.parentLocationId):null;}return parts.join(' › ');}
export function getSiteLocations(siteId){return clone(activeLocations(siteId).map(l=>({...l,path:locationPath(l.id)})).sort((a,b)=>(b.parentLocationId?1:0)-(a.parentLocationId?1:0)||Number(b.sortOrder||0)-Number(a.sortOrder||0)||a.path.localeCompare(b.path)));}
export function createSiteLocation(input){if(!site(input?.siteId))throw Object.assign(new Error('valid siteId is required'),{statusCode:422});if(!input?.name)throw Object.assign(new Error('name is required'),{statusCode:422});const kind=input.kind||'room';if(!LOCATION_KINDS.has(kind))throw Object.assign(new Error('invalid location kind'),{statusCode:422});if(input.parentLocationId){const p=location(input.parentLocationId);if(!p||p.siteId!==input.siteId)throw Object.assign(new Error('parentLocationId must belong to the same site'),{statusCode:422});}const item={id:input.id||makeId('loc',`${input.siteId}-${input.name}`),siteId:input.siteId,parentLocationId:input.parentLocationId||null,kind,name:input.name,sortOrder:Number(input.sortOrder||0),active:input.active!==false};state.siteLocations.push(item);persist();return clone({...item,path:locationPath(item.id)});}
export function updateSiteLocation(locationId,input){const item=find(state.siteLocations,locationId,'SiteLocation');if(input?.kind&&!LOCATION_KINDS.has(input.kind))throw Object.assign(new Error('invalid location kind'),{statusCode:422});if(input?.parentLocationId){const p=location(input.parentLocationId);if(!p||p.siteId!==item.siteId||p.id===item.id)throw Object.assign(new Error('invalid parent location'),{statusCode:422});}Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId'&&k!=='path')));persist();return clone({...item,path:locationPath(item.id)});}
export function deleteSiteLocation(locationId){const item=find(state.siteLocations,locationId,'SiteLocation');item.active=false;persist();return clone(item);}

function effectiveAssetTypes(ft,schema){const direct=Array.isArray(ft.appliesToAssetTypes)?ft.appliesToAssetTypes:[];if(direct.length)return[...new Set(direct)];return[...new Set((schema.sections||[]).flatMap(s=>Array.isArray(s.appliesToAssetTypes)?s.appliesToAssetTypes:[]))];}
export function validateFormSchema(schema,options={}){const errors=[];if(!schema||!Array.isArray(schema.sections)||!schema.sections.length)return{ok:false,errors:['schema.sections must contain at least one section']};const sectionIds=new Set(),fieldIds=new Set(),matrixKeys=new Set();let checklists=0;for(const s of schema.sections){if(!s?.id)errors.push('every section requires an id');else if(sectionIds.has(s.id))errors.push(`duplicate section id: ${s.id}`);else sectionIds.add(s.id);if(!SECTION_KINDS.has(s?.kind))errors.push(`unsupported section kind: ${s?.kind}`);if(s?.groupBy&&!['none','location'].includes(s.groupBy))errors.push(`unsupported groupBy: ${s.groupBy}`);for(const t of s?.appliesToAssetTypes||[])if(!ASSET_TYPES.has(t))errors.push(`unsupported asset type: ${t}`);if(s?.kind==='fields')for(const f of s.fields||[]){if(!f.id)errors.push(`field in ${s.id} requires an id`);else if(fieldIds.has(f.id))errors.push(`duplicate field id across form: ${f.id}`);else fieldIds.add(f.id);if(!FIELD_TYPES.has(f.type))errors.push(`unsupported field type: ${f.type}`);if(f.type==='select'&&!(f.options||[]).length)errors.push(`select field ${f.id} requires options`);}if(s?.kind==='asset_matrix'){if(!(s.matrixColumns||[]).length)errors.push(`asset_matrix ${s.id} requires matrixColumns`);for(const k of s.matrixColumns||[]){if(matrixKeys.has(k))errors.push(`duplicate matrix answer key across form: ${k}`);else matrixKeys.add(k);}}if(s?.kind==='asset_checklist')checklists++;}if(checklists>1)errors.push('current renderer supports one asset_checklist section per form');if(options.assetScope==='asset'&&!effectiveAssetTypes({appliesToAssetTypes:options.appliesToAssetTypes||[]},schema).length)errors.push('asset-scoped forms require an asset type');return{ok:!errors.length,errors};}

export function getPersistenceInfo(){let bytes=0;try{bytes=fs.statSync(databasePath).size}catch{}return{engine:'sqlite-v2',path:databasePath,persistentVolume:databasePath.startsWith('/data/'),restoredFromDatabase,lastPersistedAt,bytes};}
export function getComplianceOverview(){for(const j of state.jobs)ensureFormInstancesForJob(j.id);return clone({...state,siteLocations:state.siteLocations.map(l=>({...l,path:locationPath(l.id)}))});}
export function getFormCatalogue(){return clone(state.formTypes.filter(f=>f.active!==false));}

export function createSite(input){if(!input?.name)throw Object.assign(new Error('name is required'),{statusCode:422});const item={id:input.id||makeId('site',input.name),customerId:input.customerId||'custom',customerName:input.customerName||'',name:input.name,address:input.address||'',city:input.city||'',postcode:input.postcode||'',active:input.active!==false};if(site(item.id))throw Object.assign(new Error(`Site ${item.id} already exists`),{statusCode:409});state.sites.push(item);persist();return clone(item);}
export function updateSite(siteId,input){const item=find(state.sites,siteId,'Site');Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'));persist();return clone(item);}
export function deleteSite(siteId){return updateSite(siteId,{active:false});}
export function createSiteAsset(input){if(!site(input?.siteId))throw Object.assign(new Error('valid siteId is required'),{statusCode:422});if(!ASSET_TYPES.has(input?.type))throw Object.assign(new Error('valid asset type is required'),{statusCode:422});if(!input?.label)throw Object.assign(new Error('label is required'),{statusCode:422});if(input.locationId){const l=location(input.locationId);if(!l||l.siteId!==input.siteId)throw Object.assign(new Error('locationId must belong to the same site'),{statusCode:422});}const item={id:input.id||makeId('asset',input.label),siteId:input.siteId,locationId:input.locationId||null,type:input.type,label:input.label,floor:input.floor||'',active:input.active!==false,metadata:input.metadata||{}};state.siteAssets.push(item);persist();return clone(item);}
export function updateSiteAsset(assetId,input){const item=find(state.siteAssets,assetId,'SiteAsset');if(input?.type&&!ASSET_TYPES.has(input.type))throw Object.assign(new Error('invalid asset type'),{statusCode:422});if(input?.locationId){const l=location(input.locationId);if(!l||l.siteId!==item.siteId)throw Object.assign(new Error('locationId must belong to the same site'),{statusCode:422});}Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId'));persist();return clone(item);}
export function deleteSiteAsset(assetId){return updateSiteAsset(assetId,{active:false});}

export function createFormType(input){const schema=input?.schema??input?.versions?.[0]?.schema;const assetScope=input?.assetScope||'site';const check=validateFormSchema(schema,{assetScope,appliesToAssetTypes:input?.appliesToAssetTypes});if(!check.ok)throw Object.assign(new Error(check.errors.join('; ')),{statusCode:422,details:check.errors});if(!input?.name||!input?.category||!input?.frequency)throw Object.assign(new Error('name, category and frequency are required'),{statusCode:422});const item={id:input.id||makeId('ft',input.name),name:input.name,category:input.category,assetScope,appliesToAssetTypes:input.appliesToAssetTypes||[],frequency:input.frequency,regulatoryTag:input.regulatoryTag||'',active:input.active!==false,currentVersion:1,versions:[{version:1,createdAt:nowIso(),schema:clone(schema)}]};if(formType(item.id))throw Object.assign(new Error(`FormType ${item.id} already exists`),{statusCode:409});state.formTypes.push(item);persist();return clone(item);}
export function updateFormType(formTypeId,input){const ft=find(state.formTypes,formTypeId,'FormType');for(const k of ['name','category','frequency','regulatoryTag','active','appliesToAssetTypes'])if(k in(input||{}))ft[k]=clone(input[k]);persist();return clone(ft);}
export function addFormTypeVersion(formTypeId,input){const ft=find(state.formTypes,formTypeId,'FormType');const check=validateFormSchema(input?.schema,{assetScope:ft.assetScope,appliesToAssetTypes:ft.appliesToAssetTypes});if(!check.ok)throw Object.assign(new Error(check.errors.join('; ')),{statusCode:422,details:check.errors});const version=Math.max(...ft.versions.map(v=>v.version),0)+1;ft.versions.push({version,createdAt:nowIso(),changeNote:input.changeNote||'',schema:clone(input.schema)});ft.currentVersion=version;persist();return clone(ft);}
export function createJobTemplate(input){if(!input?.name||!(input.requiredFormTypeIds||[]).length)throw Object.assign(new Error('name and requiredFormTypeIds are required'),{statusCode:422});const missing=input.requiredFormTypeIds.filter(x=>!formType(x));if(missing.length)throw Object.assign(new Error(`Unknown FormType ids: ${missing.join(', ')}`),{statusCode:422});const item={id:input.id||makeId('jt',input.name),name:input.name,category:input.category||'general',requiredFormTypeIds:[...new Set(input.requiredFormTypeIds)]};if(template(item.id))throw Object.assign(new Error(`JobTemplate ${item.id} already exists`),{statusCode:409});state.jobTemplates.push(item);persist();return clone(item);}
export function updateJobTemplate(templateId,input){const item=find(state.jobTemplates,templateId,'JobTemplate');if(input?.requiredFormTypeIds){const missing=input.requiredFormTypeIds.filter(x=>!formType(x));if(missing.length)throw Object.assign(new Error(`Unknown FormType ids: ${missing.join(', ')}`),{statusCode:422});item.requiredFormTypeIds=[...new Set(input.requiredFormTypeIds)];}for(const k of ['name','category'])if(k in(input||{}))item[k]=input[k];persist();return clone(item);}
export function createSiteAssignment(input){if(!site(input?.siteId)||!formType(input?.formTypeId))throw Object.assign(new Error('valid siteId and formTypeId are required'),{statusCode:422});if(input.jobTemplateId&&!template(input.jobTemplateId))throw Object.assign(new Error('invalid jobTemplateId'),{statusCode:422});const basis=input.scheduleBasis==='usage'?'usage':'time';const currentUsage=Math.max(0,Number(input.currentUsageHours??0)||0);const usageInterval=Math.max(1,Number(input.usageIntervalHours??500)||500);const assetIds=Array.isArray(input.assetIds)?[...new Set(input.assetIds.filter(id=>activeAssets(input.siteId).some(a=>a.id===id)))]:[];const item={id:input.id||makeId('assign',`${input.siteId}-${input.formTypeId}`),siteId:input.siteId,formTypeId:input.formTypeId,jobTemplateId:input.jobTemplateId||null,frequency:basis==='usage'?'usage':(input.frequency||formType(input.formTypeId).frequency||'ad_hoc'),scheduleBasis:basis,active:input.active!==false,nextDueDate:input.nextDueDate||null,leadDays:Math.max(0,Math.min(90,Number(input.leadDays??21)||21)),autoCreate:input.autoCreate!==false,durationMinutes:Math.max(15,Number(input.durationMinutes??90)||90),priority:input.priority==='urgent'?'urgent':'normal',serviceType:input.serviceType||'',usageIntervalHours:usageInterval,currentUsageHours:currentUsage,nextDueUsageHours:Math.max(0,Number(input.nextDueUsageHours??(currentUsage+usageInterval))||0),usageLeadHours:Math.max(0,Number(input.usageLeadHours??25)||25),usageDailyHours:Math.max(0,Number(input.usageDailyHours??0)||0),preferredTechnicianIds:Array.isArray(input.preferredTechnicianIds)?[...new Set(input.preferredTechnicianIds.filter(Boolean))]:[],assetIds,tools:Array.isArray(input.tools)?input.tools.filter(Boolean):[],spareParts:Array.isArray(input.spareParts)?input.spareParts.filter(Boolean):[],lastGeneratedJobId:null,lastGeneratedDueDate:null,lastGeneratedDueUsageHours:null,lastCompletedJobId:null,lastCompletedAt:null,lastCompletedUsageHours:null};state.siteAssignments.push(item);persist();return clone(item);}
export function updateSiteAssignment(assignmentId,input){const item=find(state.siteAssignments,assignmentId,'Assignment');const patch=Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'));if('scheduleBasis'in patch)patch.scheduleBasis=patch.scheduleBasis==='usage'?'usage':'time';if('preferredTechnicianIds'in patch)patch.preferredTechnicianIds=Array.isArray(patch.preferredTechnicianIds)?[...new Set(patch.preferredTechnicianIds.filter(Boolean))]:[];if('assetIds'in patch)patch.assetIds=Array.isArray(patch.assetIds)?[...new Set(patch.assetIds.filter(id=>activeAssets(item.siteId).some(a=>a.id===id)))]:[];for(const key of ['tools','spareParts'])if(key in patch)patch[key]=Array.isArray(patch[key])?patch[key].filter(Boolean):[];for(const key of ['usageIntervalHours','currentUsageHours','nextDueUsageHours','usageLeadHours','usageDailyHours'])if(key in patch)patch[key]=Math.max(0,Number(patch[key])||0);if('leadDays'in patch)patch.leadDays=Math.max(0,Math.min(90,Number(patch.leadDays)||0));if('durationMinutes'in patch)patch.durationMinutes=Math.max(15,Number(patch.durationMinutes)||15);Object.assign(item,patch);persist();return clone(item);}
export function deleteSiteAssignment(assignmentId){return updateSiteAssignment(assignmentId,{active:false});}
export function configureJobCompliance(jobId,input){const j=find(state.jobs,jobId,'Job');if(!site(input?.siteId)||!template(input?.jobTemplateId))throw Object.assign(new Error('valid siteId and jobTemplateId are required'),{statusCode:422});j.siteId=input.siteId;j.jobTemplateId=input.jobTemplateId;if(Array.isArray(input.extraFormTypeIds)){const missing=input.extraFormTypeIds.filter(x=>!formType(x));if(missing.length)throw Object.assign(new Error(`Unknown FormType ids: ${missing.join(', ')}`),{statusCode:422});j.extraFormTypeIds=[...new Set(input.extraFormTypeIds)];}if(input.status)j.status=input.status;if(input.resetInstances===true)state.formInstances=state.formInstances.filter(i=>i.jobId!==jobId);ensureFormInstancesForJob(jobId);persist();return clone(j);}
export function attachExtraForm(jobId,formTypeId){const j=find(state.jobs,jobId,'Job');find(state.formTypes,formTypeId,'FormType');j.extraFormTypeIds=[...new Set([...(j.extraFormTypeIds||[]),formTypeId])];ensureFormInstancesForJob(jobId);persist();return clone(j);}
function requiredFormIds(j){const ids=[];const t=template(j.jobTemplateId);if(t)ids.push(...t.requiredFormTypeIds);ids.push(...(j.extraFormTypeIds||[]));for(const a of state.siteAssignments.filter(a=>a.active!==false&&a.siteId===j.siteId&&(!a.jobTemplateId||a.jobTemplateId===j.jobTemplateId)))ids.push(a.formTypeId);return[...new Set(ids)];}
export function ensureFormInstancesForJob(jobId){const j=job(jobId);if(!j?.siteId)return[];const existing=jobInstances(jobId);for(const formTypeId of requiredFormIds(j)){const ft=formType(formTypeId);if(!ft||ft.active===false)continue;const already=existing.filter(i=>i.formTypeId===formTypeId);const pinned=already[0]?.formTypeVersion??ft.currentVersion;const version=ft.versions.find(v=>v.version===pinned);if(!version)continue;const schema=version.schema;const formLevel=(schema.sections||[]).some(s=>s.kind==='fields'||s.kind==='text_area');if(ft.assetScope==='asset'){const types=effectiveAssetTypes(ft,schema);for(const a of activeAssets(j.siteId).filter(a=>types.includes(a.type))){if(!existing.some(i=>i.formTypeId===formTypeId&&i.assetId===a.id)){const inst={id:`fi-${slug(jobId)}-${slug(formTypeId)}-${slug(a.id)}`,jobId,siteId:j.siteId,formTypeId,formTypeVersion:pinned,assetId:a.id,locationId:a.locationId||null,period:periodNow(),status:'not_started',answers:{}};state.formInstances.push(inst);existing.push(inst);}}if(formLevel&&!existing.some(i=>i.formTypeId===formTypeId&&i.assetId===FORM_LEVEL_ASSET_ID)){const inst={id:`fi-${slug(jobId)}-${slug(formTypeId)}-form`,jobId,siteId:j.siteId,formTypeId,formTypeVersion:pinned,assetId:FORM_LEVEL_ASSET_ID,locationId:null,period:periodNow(),status:'not_started',answers:{}};state.formInstances.push(inst);existing.push(inst);}}else if(!existing.some(i=>i.formTypeId===formTypeId)){const inst={id:`fi-${slug(jobId)}-${slug(formTypeId)}-form`,jobId,siteId:j.siteId,formTypeId,formTypeVersion:pinned,assetId:FORM_LEVEL_ASSET_ID,locationId:null,period:periodNow(),status:'not_started',answers:{}};state.formInstances.push(inst);existing.push(inst);}}return clone(jobInstances(jobId));}
export function getComplianceForms(jobId){const j=job(jobId);if(!j?.siteId)return null;const s=site(j.siteId);if(!s)return null;const ids=requiredFormIds(j),forms=ids.map(formType).filter(Boolean),instances=ensureFormInstancesForJob(jobId);return clone({site:s,siteLocations:getSiteLocations(j.siteId),siteAssets:activeAssets(j.siteId),jobTemplate:template(j.jobTemplateId)||{id:'ad-hoc',name:'Ad hoc compliance',category:'general',requiredFormTypeIds:ids},formTypes:forms,instances});}
export function getFormTypeDetail(jobId,formTypeId){const j=job(jobId);if(!j?.siteId)return null;const ft=formType(formTypeId);if(!ft)return null;const instances=ensureFormInstancesForJob(jobId).filter(i=>i.formTypeId===formTypeId);if(!instances.length)return null;const pinned=instances[0].formTypeVersion;return clone({site:site(j.siteId),siteLocations:getSiteLocations(j.siteId),siteAssets:activeAssets(j.siteId),formType:{...ft,currentVersion:pinned},instances,history:getFormHistory(j.siteId,formTypeId,new Date().getFullYear())});}
export function saveFormInstance(instanceId,input){const inst=find(state.formInstances,instanceId,'FormInstance');if(!input||typeof input.answers!=='object'||Array.isArray(input.answers)||input.answers===null)throw Object.assign(new Error('answers must be an object'),{statusCode:422});if(!STATUSES.has(input.status))throw Object.assign(new Error(`invalid status: ${input.status}`),{statusCode:422});inst.answers={...(inst.answers||{}),...clone(input.answers)};inst.status=input.status;if(input.status==='completed'){inst.submittedBy=input.submittedBy||'user-1';inst.submittedAt=nowIso();}else{delete inst.submittedBy;delete inst.submittedAt;}persist();return clone(inst);}
export function getFormHistory(siteId,formTypeId,year){const prefix=`${year}-`;return clone(state.formInstances.filter(i=>i.siteId===siteId&&i.formTypeId===formTypeId&&String(i.period||'').startsWith(prefix)).sort((a,b)=>String(a.period).localeCompare(String(b.period))));}
export function getSubmissions(filters={}){return clone(state.formInstances.filter(i=>(!filters.siteId||i.siteId===filters.siteId)&&(!filters.formTypeId||i.formTypeId===filters.formTypeId)&&(!filters.status||i.status===filters.status)&&(!filters.year||String(i.period||'').startsWith(`${filters.year}-`))).sort((a,b)=>String(b.submittedAt||b.period).localeCompare(String(a.submittedAt||a.period))));}
export function getExportDataset(siteId,formTypeId,year){const s=find(state.sites,siteId,'Site'),ft=find(state.formTypes,formTypeId,'FormType'),instances=getFormHistory(siteId,formTypeId,year),assets=state.siteAssets.filter(a=>a.siteId===siteId),locations=getSiteLocations(siteId),jobsById=Object.fromEntries(state.jobs.map(j=>[j.id,j]));return clone({site:s,formType:ft,year:Number(year),assets,locations,instances,jobsById});}
export function resetDemoState(){configureJobCompliance('job-7',{siteId:'site-1',jobTemplateId:'jt-quarterly-water-hygiene',extraFormTypeIds:[],status:'scheduled',resetInstances:true});return getComplianceForms('job-7');}
export function runComplianceSelfTest(){const checks=[];const rec=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail});const locations=getSiteLocations('site-1');rec('location hierarchy available',locations.some(l=>l.name==='5th Floor')&&locations.some(l=>l.name==='WC'),`${locations.length} locations`);rec('assets linked to locations',activeAssets('site-1').every(a=>Boolean(a.locationId)));const expanded=ensureFormInstancesForJob('job-7');rec('job template expands',expanded.length>=18,`${expanded.length} instances`);rec('expansion idempotent',ensureFormInstancesForJob('job-7').length===expanded.length);const detail=getFormTypeDetail('job-7','ft-water-temps');rec('location detail returned',Array.isArray(detail?.siteLocations)&&detail.siteLocations.length>0);rec('schema version pinned',detail?.formType.currentVersion===detail?.instances?.[0]?.formTypeVersion);rec('location snapshot pinned',detail?.instances?.filter(i=>i.assetId!==FORM_LEVEL_ASSET_ID).every(i=>Boolean(i.locationId)));rec('persistent engine available',Boolean(databasePath));return{ok:checks.every(c=>c.ok),passed:checks.filter(c=>c.ok).length,total:checks.length,checks};}
