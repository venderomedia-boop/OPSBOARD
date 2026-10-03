import fs from 'node:fs';
import path from 'node:path';

const dataDir=process.env.OPSBOARD_DATA_DIR||(fs.existsSync('/data')?'/data':'/tmp');
const filePath=path.join(dataDir,'leave-store.json');
const STATUSES=new Set(['pending','approved','rejected','cancelled']);
const TYPES=new Set(['annual','sick','unpaid','training','other']);
const DEFAULT_ALLOWANCE=25;
const clone=(value)=>JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();

function ensureDir(){fs.mkdirSync(dataDir,{recursive:true});}
function emptyState(){return{nextNumber:1001,requests:[]};}
function readState(){
  ensureDir();
  if(!fs.existsSync(filePath))return emptyState();
  try{
    const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
    return{...emptyState(),...parsed,requests:Array.isArray(parsed.requests)?parsed.requests:[]};
  }catch{return emptyState();}
}
function writeState(state){
  ensureDir();
  const tmp=`${filePath}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(state,null,2));
  fs.renameSync(tmp,filePath);
}
function required(value,label){
  const text=String(value??'').trim();
  if(!text)throw Object.assign(new Error(`${label} is required`),{statusCode:422});
  return text;
}
function dateOnly(value,label){
  const text=required(value,label);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(new Date(`${text}T12:00:00`).getTime())){
    throw Object.assign(new Error(`${label} must be YYYY-MM-DD`),{statusCode:422});
  }
  return text;
}
export function workingDays(startDate,endDate,halfDayStart=false,halfDayEnd=false){
  let cursor=new Date(`${startDate}T12:00:00`);
  const end=new Date(`${endDate}T12:00:00`);
  let days=0;
  while(cursor<=end){
    const day=cursor.getDay();
    if(day!==0&&day!==6)days+=1;
    cursor=new Date(cursor);
    cursor.setDate(cursor.getDate()+1);
  }
  if(days>0&&halfDayStart)days-=.5;
  if(days>0&&halfDayEnd&&endDate!==startDate)days-=.5;
  return Math.max(0,days);
}
function overlaps(aStart,aEnd,bStart,bEnd){return aStart<=bEnd&&bStart<=aEnd;}
function publicRecord(item){return clone(item);}
function find(state,id){
  const item=state.requests.find(row=>row.id===id);
  if(!item)throw Object.assign(new Error('Leave request not found'),{statusCode:404});
  return item;
}

export function listLeave({technicianId,status}={}){
  const state=readState();
  return state.requests
    .filter(item=>{
      if(technicianId&&String(item.technicianId)!==String(technicianId))return false;
      if(status&&item.status!==status)return false;
      return true;
    })
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(publicRecord);
}

export function getLeave(id){
  const state=readState();
  const item=state.requests.find(row=>row.id===id);
  return item?publicRecord(item):null;
}

export function createLeave(input={}){
  const state=readState();
  const technicianId=required(input.technicianId,'technicianId');
  const technicianName=required(input.technicianName,'technicianName');
  const type=TYPES.has(String(input.type))?String(input.type):'annual';
  const startDate=dateOnly(input.startDate,'startDate');
  const endDate=dateOnly(input.endDate,'endDate');
  if(endDate<startDate)throw Object.assign(new Error('End date cannot be before start date'),{statusCode:422});

  const halfDayStart=Boolean(input.halfDayStart);
  const halfDayEnd=Boolean(input.halfDayEnd);
  const days=workingDays(startDate,endDate,halfDayStart,halfDayEnd);
  if(days<=0)throw Object.assign(new Error('The selected range contains no working days'),{statusCode:422});

  const collision=state.requests.find(item=>
    item.technicianId===technicianId&&
    !['rejected','cancelled'].includes(item.status)&&
    overlaps(startDate,endDate,item.startDate,item.endDate)
  );
  if(collision)throw Object.assign(new Error(`You already have leave covering ${collision.startDate} to ${collision.endDate}`),{statusCode:409});

  const now=nowIso();
  const number=state.nextNumber++;
  const item={
    id:`leave-${number}`,
    technicianId,
    technicianName,
    type,
    startDate,
    endDate,
    halfDayStart,
    halfDayEnd,
    workingDays:days,
    notes:String(input.notes||'').trim()||undefined,
    status:'pending',
    reviewer:undefined,
    reviewNote:undefined,
    createdAt:now,
    updatedAt:now,
  };
  state.requests.unshift(item);
  writeState(state);
  return publicRecord(item);
}

export function transitionLeave(id,{status,reviewer,reviewNote}={}){
  const state=readState();
  const item=find(state,id);
  const next=String(status||'');
  if(!STATUSES.has(next))throw Object.assign(new Error('Unsupported leave status'),{statusCode:422});
  const allowed=item.status==='pending'?['approved','rejected','cancelled']
    :item.status==='approved'?['cancelled']
      :item.status==='rejected'?['pending']
        :[];
  if(!allowed.includes(next))throw Object.assign(new Error(`Cannot move ${item.status} leave to ${next}`),{statusCode:409});
  item.status=next;
  if(['approved','rejected'].includes(next))item.reviewer=String(reviewer||'Office Admin');
  item.reviewNote=next==='rejected'?String(reviewNote||'').trim()||undefined:item.reviewNote;
  item.updatedAt=nowIso();
  writeState(state);
  return publicRecord(item);
}

export function leaveEntitlement(technicianId,technicianName=''){
  const requests=listLeave({technicianId});
  const usedDays=requests
    .filter(item=>item.status==='approved'&&item.type==='annual')
    .reduce((sum,item)=>sum+Number(item.workingDays||0),0);
  const pendingDays=requests
    .filter(item=>item.status==='pending'&&item.type==='annual')
    .reduce((sum,item)=>sum+Number(item.workingDays||0),0);
  return{
    technicianId:String(technicianId||''),
    technicianName:String(technicianName||''),
    allowanceDays:DEFAULT_ALLOWANCE,
    usedDays,
    pendingDays,
    remainingDays:Math.max(0,DEFAULT_ALLOWANCE-usedDays),
  };
}

export function getLeaveStoreInfo(){
  const state=readState();
  return{filePath,count:state.requests.length,pending:state.requests.filter(item=>item.status==='pending').length};
}
