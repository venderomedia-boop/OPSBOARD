import fs from 'node:fs';
import path from 'node:path';
import { listWorkflowEvents, listWorkflowJobs, listWorkflowTechnicians } from './workflow-store.mjs';

const dataDir=process.env.OPSBOARD_DATA_DIR||(fs.existsSync('/data')?'/data':'/tmp');
const filePath=path.join(dataDir,'timesheet-store.json');
const STATUSES=new Set(['submitted','approved','rejected','emailed']);
const clone=(value)=>JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();

function ensureDir(){fs.mkdirSync(dataDir,{recursive:true});}
function emptyState(){return{nextNumber:1,timesheets:[],dayRecords:[]};}
function readState(){
  ensureDir();
  if(!fs.existsSync(filePath))return emptyState();
  try{
    const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
    return{...emptyState(),...parsed,timesheets:Array.isArray(parsed.timesheets)?parsed.timesheets:[],dayRecords:Array.isArray(parsed.dayRecords)?parsed.dayRecords:[]};
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

function weekDates(weekEnding){
  const end=new Date(`${weekEnding}T12:00:00Z`);
  if(Number.isNaN(end.getTime()))throw Object.assign(new Error('weekEnding must be a valid date'),{statusCode:422});
  return Array.from({length:7},(_,index)=>{
    const day=new Date(end);
    day.setUTCDate(day.getUTCDate()+index-6);
    return day.toISOString().slice(0,10);
  });
}
function partialWorkedMinutes(entry={}){
  if(!entry.startTime||!entry.endTime)return 0;
  let start=timeMinutes(entry.startTime,'startTime');
  let end=timeMinutes(entry.endTime,'endTime');
  if(end<start)end+=24*60;
  return Math.max(0,end-start-Math.max(0,Number(entry.breakMinutes)||0));
}
function activityForWeek(technicianId,weekEnding){
  const dates=weekDates(weekEnding);
  const from=dates[0],to=dates[dates.length-1];
  const byDate=Object.fromEntries(dates.map(date=>[date,[]]));
  for(const job of listWorkflowJobs({technicianId,from,to})){
    const date=String(job.scheduledStart||'').slice(0,10);
    if(!byDate[date])byDate[date]=[];
    const events=listWorkflowEvents(job.id);
    const statusTime=(status)=>events.find(event=>event.type==='status_change'&&event.payload?.toStatus===status)?.createdAt||null;
    byDate[date].push({
      jobId:job.id,
      displayId:job.displayId||job.id,
      customerName:job.customer?.name||'Customer',
      serviceType:job.serviceType||'Field service',
      status:job.status,
      scheduledStart:job.scheduledStart,
      scheduledEnd:job.scheduledEnd,
      enRouteAt:statusTime('en_route'),
      startedAt:statusTime('in_progress'),
      completedAt:statusTime('completed')||job.completedAt||null,
    });
  }
  return byDate;
}
function buildExceptions(entries=[],activityByDate={}){
  const rows=[];
  const add=(code,date,label,severity='warning')=>rows.push({code,date,label,severity});
  for(const entry of entries){
    const date=entry.date;
    const minutes=Number(entry.workedMinutes||partialWorkedMinutes(entry));
    const activity=(activityByDate?.[date]||[]);
    if(Boolean(entry.startTime)!==Boolean(entry.endTime))add('incomplete_day',date,'Start or finish time is missing','attention');
    if(minutes>=11*60)add('long_day',date,`Long day: ${(minutes/60).toFixed(2)} hours recorded`,'attention');
    if(minutes>=6*60&&Number(entry.breakMinutes||0)===0)add('no_break',date,'No break recorded for a 6+ hour day');
    if(Number(entry.mileageMiles||0)>=150)add('high_mileage',date,`High mileage: ${Number(entry.mileageMiles).toFixed(1)} miles`);
    if(minutes>=4*60&&activity.length===0)add('no_job_activity',date,'No assigned job activity found for this worked day');
  }
  return rows;
}
function normalizeDayRecord(input={}){
  const technicianId=required(input.technicianId,'technicianId');
  technicianSnapshot(technicianId);
  const date=dateOnly(input.date,'date');
  const validateOptionalTime=(value,label)=>{
    const text=String(value||'').trim();
    if(!text)return '';
    timeMinutes(text,label);
    return text;
  };
  return{
    technicianId,
    date,
    startTime:validateOptionalTime(input.startTime,'startTime'),
    endTime:validateOptionalTime(input.endTime,'endTime'),
    breakMinutes:Math.max(0,Math.min(720,Number(input.breakMinutes)||0)),
    mileageMiles:Math.max(0,Math.min(2000,Number(input.mileageMiles)||0)),
    notes:String(input.notes||'').trim(),
  };
}
function londonTime(iso){
  const d=iso?new Date(iso):new Date();
  if(Number.isNaN(d.getTime()))throw Object.assign(new Error('at must be a valid date/time'),{statusCode:422});
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  const hour=parts.find(part=>part.type==='hour')?.value||'00';
  const minute=parts.find(part=>part.type==='minute')?.value||'00';
  return `${hour}:${minute}`;
}
export function saveTimesheetDay(input={}){
  const state=readState();
  const next=normalizeDayRecord(input);
  const existing=state.dayRecords.find(row=>row.technicianId===next.technicianId&&row.date===next.date);
  if(existing)Object.assign(existing,next,{updatedAt:nowIso()});
  else state.dayRecords.push({...next,createdAt:nowIso(),updatedAt:nowIso()});
  writeState(state);
  const item=state.dayRecords.find(row=>row.technicianId===next.technicianId&&row.date===next.date);
  return clone({...item,workedMinutes:partialWorkedMinutes(item)});
}
export function clockTimesheetDay({technicianId,date,action,at}={}){
  const state=readState();
  technicianSnapshot(required(technicianId,'technicianId'));
  const day=dateOnly(date,'date');
  if(!['start','finish'].includes(action))throw Object.assign(new Error('action must be start or finish'),{statusCode:422});
  let item=state.dayRecords.find(row=>row.technicianId===technicianId&&row.date===day);
  if(!item){
    item={technicianId,date:day,startTime:'',endTime:'',breakMinutes:0,mileageMiles:0,notes:'',createdAt:nowIso(),updatedAt:nowIso()};
    state.dayRecords.push(item);
  }
  const value=londonTime(at);
  if(action==='start'){
    if(item.startTime)throw Object.assign(new Error('Day has already been started'),{statusCode:409});
    item.startTime=value;
  }else{
    if(!item.startTime)throw Object.assign(new Error('Start the day before finishing it'),{statusCode:409});
    item.endTime=value;
  }
  item.updatedAt=nowIso();
  writeState(state);
  return clone({...item,workedMinutes:partialWorkedMinutes(item)});
}
export function getTimesheetDraft({technicianId,weekEnding}={}){
  const techId=required(technicianId,'technicianId');
  technicianSnapshot(techId);
  const ending=dateOnly(weekEnding,'weekEnding');
  const state=readState();
  const dates=weekDates(ending);
  const rejected=[...state.timesheets]
    .filter(row=>row.technicianId===techId&&row.weekEnding===ending&&row.status==='rejected')
    .sort((a,b)=>String(b.updatedAt||b.submittedAt).localeCompare(String(a.updatedAt||a.submittedAt)))[0]||null;
  const rejectedByDate=new Map((rejected?.entries||[]).map(entry=>[entry.date,entry]));
  const dayByDate=new Map(state.dayRecords.filter(row=>row.technicianId===techId&&dates.includes(row.date)).map(row=>[row.date,row]));
  const entries=dates.map(date=>{
    const base=rejectedByDate.get(date)||{date,startTime:'',endTime:'',breakMinutes:0,mileageMiles:0,notes:''};
    const live=dayByDate.get(date);
    const merged={...base,...(live||{}),date};
    return{
      date,
      startTime:String(merged.startTime||''),
      endTime:String(merged.endTime||''),
      breakMinutes:Number(merged.breakMinutes||0),
      mileageMiles:Number(merged.mileageMiles||0),
      notes:String(merged.notes||''),
      workedMinutes:partialWorkedMinutes(merged),
      source:live?'daily_capture':rejectedByDate.has(date)?'returned_sheet':'blank',
    };
  });
  const activityByDate=activityForWeek(techId,ending);
  return{
    technicianId:techId,
    weekEnding:ending,
    entries,
    totals:totals(entries),
    activityByDate,
    exceptions:buildExceptions(entries,activityByDate),
    returnedFrom:rejected?{id:rejected.id,reviewNote:rejected.reviewNote||'',reviewedAt:rejected.reviewedAt||null,reviewedBy:rejected.reviewedBy||null}:null,
  };
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
  const activityByDate=activityForWeek(technicianId,weekEnding);
  const exceptions=buildExceptions(entries,activityByDate);
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
    activityByDate,
    exceptions,
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
