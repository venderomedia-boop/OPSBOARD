import fs from 'node:fs';
import path from 'node:path';
import { listWorkflowTechnicians } from './workflow-store.mjs';

const dataDir=process.env.OPSBOARD_DATA_DIR||(fs.existsSync('/data')?'/data':'/tmp');
const filePath=path.join(dataDir,'timesheet-store.json');
const STATUSES=new Set(['submitted','approved','rejected','emailed']);
const clone=(value)=>JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();

function ensureDir(){fs.mkdirSync(dataDir,{recursive:true});}
function emptyState(){return{nextNumber:1,timesheets:[]};}
function readState(){
  ensureDir();
  if(!fs.existsSync(filePath))return emptyState();
  try{
    const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
    return{...emptyState(),...parsed,timesheets:Array.isArray(parsed.timesheets)?parsed.timesheets:[]};
  }catch{return emptyState();}
}
function writeState(state){ensureDir();const temp=`${filePath}.tmp`;fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,filePath);}
function required(value,label){const text=String(value||'').trim();if(!text)throw Object.assign(new Error(`${label} is required`),{statusCode:422});return text;}
function dateOnly(value,label){const text=required(value,label);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Object.assign(new Error(`${label} must be YYYY-MM-DD`),{statusCode:422});return text;}
function timeMinutes(value,label){
  const text=required(value,label);
  const match=text.match(/^(\d{2}):(\d{2})$/);
  if(!match)throw Object.assign(new Error(`${label} must be HH:MM`),{statusCode:422});
  const hour=Number(match[1]),minute=Number(match[2]);
  if(hour>23||minute>59)throw Object.assign(new Error(`${label} must be a valid time`),{statusCode:422});
  return hour*60+minute;
}
function normalizeEntry(input,index){
  const date=dateOnly(input?.date,`entries[${index}].date`);
  const startTime=required(input?.startTime,`entries[${index}].startTime`);
  const endTime=required(input?.endTime,`entries[${index}].endTime`);
  let start=timeMinutes(startTime,`entries[${index}].startTime`);
  let end=timeMinutes(endTime,`entries[${index}].endTime`);
  if(end<start)end+=24*60;
  const breakMinutes=Math.max(0,Math.min(720,Number(input?.breakMinutes)||0));
  const gross=end-start;
  if(breakMinutes>gross)throw Object.assign(new Error(`Break cannot exceed worked time for ${date}`),{statusCode:422});
  const workedMinutes=Math.max(0,gross-breakMinutes);
  const mileageMiles=Math.max(0,Math.min(2000,Number(input?.mileageMiles)||0));
  return{date,startTime,endTime,breakMinutes,workedMinutes,mileageMiles,notes:String(input?.notes||'').trim()};
}
function totals(entries){
  const workedMinutes=entries.reduce((sum,row)=>sum+row.workedMinutes,0);
  const mileageMiles=entries.reduce((sum,row)=>sum+row.mileageMiles,0);
  return{workedMinutes,hours:Number((workedMinutes/60).toFixed(2)),mileageMiles:Number(mileageMiles.toFixed(1))};
}
function find(state,id){
  const item=state.timesheets.find(row=>row.id===id);
  if(!item)throw Object.assign(new Error('Timesheet not found'),{statusCode:404});
  return item;
}
function technicianSnapshot(technicianId){
  const tech=listWorkflowTechnicians({includeInactive:true}).find(row=>row.id===technicianId);
  if(!tech)throw Object.assign(new Error('technicianId is not a known engineer'),{statusCode:422});
  return{id:tech.id,name:tech.name,email:tech.email,phone:tech.phone||''};
}

export function listTimesheets({technicianId,status,from,to}={}){
  const state=readState();
  return clone(state.timesheets.filter(row=>{
    if(technicianId&&row.technicianId!==technicianId)return false;
    if(status&&row.status!==status)return false;
    if(from&&row.weekEnding<from)return false;
    if(to&&row.weekEnding>to)return false;
    return true;
  }).sort((a,b)=>b.weekEnding.localeCompare(a.weekEnding)||b.submittedAt.localeCompare(a.submittedAt)));
}

export function getTimesheet(id){
  const state=readState();
  const item=state.timesheets.find(row=>row.id===id);
  return item?clone(item):null;
}

export function createTimesheet(input={}){
  const state=readState();
  const technicianId=required(input.technicianId,'technicianId');
  const technician=technicianSnapshot(technicianId);
  const weekEnding=dateOnly(input.weekEnding,'weekEnding');
  const rawEntries=Array.isArray(input.entries)?input.entries:[];
  if(!rawEntries.length)throw Object.assign(new Error('At least one timesheet entry is required'),{statusCode:422});
  if(rawEntries.length>7)throw Object.assign(new Error('A weekly timesheet can contain at most 7 entries'),{statusCode:422});
  const entries=rawEntries.map(normalizeEntry);
  const dates=new Set(entries.map(row=>row.date));
  if(dates.size!==entries.length)throw Object.assign(new Error('Each date can appear only once'),{statusCode:422});
  if(state.timesheets.some(row=>row.technicianId===technicianId&&row.weekEnding===weekEnding&&row.status!=='rejected')){
    throw Object.assign(new Error('A timesheet for this engineer and week already exists'),{statusCode:409});
  }
  const item={
    id:`ts-${String(state.nextNumber++).padStart(5,'0')}`,
    technicianId,
    technicianName:technician.name,
    technicianEmail:technician.email,
    technicianPhone:technician.phone,
    weekEnding,
    entries,
    totals:totals(entries),
    status:'submitted',
    submittedAt:nowIso(),
    reviewedAt:null,
    reviewedBy:null,
    reviewNote:'',
    emailedAt:null,
    emailedTo:'',
    emailId:'',
    createdAt:nowIso(),
    updatedAt:nowIso(),
  };
  state.timesheets.push(item);
  writeState(state);
  return clone(item);
}

export function reviewTimesheet(id,input={}){
  const state=readState();
  const item=find(state,id);
  const status=String(input.status||'').trim();
  if(!['approved','rejected'].includes(status))throw Object.assign(new Error('status must be approved or rejected'),{statusCode:422});
  if(item.status==='emailed')throw Object.assign(new Error('An emailed timesheet can no longer be changed'),{statusCode:409});
  item.status=status;
  item.reviewedAt=nowIso();
  item.reviewedBy=String(input.reviewedBy||'office');
  item.reviewNote=String(input.reviewNote||'').trim();
  item.updatedAt=nowIso();
  writeState(state);
  return clone(item);
}

export function markTimesheetEmailed(id,{recipientEmail,emailId}={}){
  const state=readState();
  const item=find(state,id);
  if(item.status!=='approved'&&item.status!=='emailed')throw Object.assign(new Error('Approve the timesheet before emailing it'),{statusCode:409});
  item.status='emailed';
  item.emailedAt=nowIso();
  item.emailedTo=String(recipientEmail||'');
  item.emailId=String(emailId||'');
  item.updatedAt=nowIso();
  writeState(state);
  return clone(item);
}

export function getTimesheetStoreInfo(){
  const state=readState();
  return{filePath,count:state.timesheets.length};
}

export function resetTimesheetStore(){
  writeState(emptyState());
  return getTimesheetStoreInfo();
}
