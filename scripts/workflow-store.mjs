import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.OPSBOARD_DATA_DIR || (fs.existsSync('/data') ? '/data' : '/tmp');
const filePath = path.join(dataDir, 'workflow-store.json');
const STATUSES = new Set(['scheduled','en_route','in_progress','completed','cancelled','skipped']);
const PRIORITIES = new Set(['normal','urgent']);
const DEFAULT_TECHNICIANS = [
  { id:'user-1', name:'Marcus Reed', email:'marcus@apexclimate.co.uk', phone:'', role:'lead_engineer', avatarInitials:'MR', accentColor:'#2563EB', dailyCapacity:6, active:true },
  { id:'tech-priya', name:'Priya Shah', email:'priya@apexclimate.co.uk', phone:'', role:'engineer', avatarInitials:'PS', accentColor:'#7C3AED', dailyCapacity:6, active:true },
  { id:'tech-daniel', name:"Daniel O'Connor", email:'daniel@apexclimate.co.uk', phone:'', role:'engineer', avatarInitials:'DO', accentColor:'#0891B2', dailyCapacity:5, active:true },
  { id:'tech-sofia', name:'Sofia Martins', email:'sofia@apexclimate.co.uk', phone:'', role:'engineer', avatarInitials:'SM', accentColor:'#DB2777', dailyCapacity:5, active:true },
  { id:'tech-james', name:'James Whitfield', email:'james@apexclimate.co.uk', phone:'', role:'engineer', avatarInitials:'JW', accentColor:'#D97706', dailyCapacity:6, active:true },
];
const TECHNICIAN_COLORS=['#2563EB','#7C3AED','#0891B2','#DB2777','#D97706','#059669','#DC2626'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();

function ensureDir(){ fs.mkdirSync(dataDir,{recursive:true}); }
function emptyState(){ return { nextJobNumber:2001, nextAssignmentNumber:3001, nextEventNumber:4001, nextMediaNumber:5001, nextTechnicianNumber:6001, technicians:clone(DEFAULT_TECHNICIANS), jobs:[], assignments:[], events:[], media:[] }; }
function readState(){
  ensureDir();
  if(!fs.existsSync(filePath)) return emptyState();
  try{
    const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
    const base=emptyState();
    return {
      ...base,
      ...parsed,
      technicians:Array.isArray(parsed.technicians)
        ? parsed.technicians.map((t,index)=>({
            ...t,
            phone:String(t.phone||''),
            role:t.role==='lead_engineer'?'lead_engineer':'engineer',
            avatarInitials:String(t.avatarInitials||initials(t.name)),
            accentColor:String(t.accentColor||TECHNICIAN_COLORS[index%TECHNICIAN_COLORS.length]),
            dailyCapacity:Math.max(1,Math.min(20,Number(t.dailyCapacity)||6)),
            active:t.active!==false,
          }))
        : clone(DEFAULT_TECHNICIANS),
      jobs:Array.isArray(parsed.jobs)?parsed.jobs:[],
      assignments:Array.isArray(parsed.assignments)?parsed.assignments:[],
      events:Array.isArray(parsed.events)?parsed.events:[],
      media:Array.isArray(parsed.media)?parsed.media:[],
    };
  }catch{return emptyState();}
}
function writeState(state){ ensureDir(); const temp=`${filePath}.tmp`; fs.writeFileSync(temp,JSON.stringify(state,null,2)); fs.renameSync(temp,filePath); }
function required(value,label){ if(!String(value||'').trim()) throw Object.assign(new Error(`${label} is required`),{statusCode:422}); return String(value).trim(); }
function initials(name){ return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'EN'; }
function technicianEmail(value){ const email=String(value||'').trim().toLowerCase(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error('email must be valid'),{statusCode:422}); return email; }
function technicianById(state,id){ return state.technicians.find(t=>t.id===id); }
function activeTechnician(state,id){ const tech=technicianById(state,id); return tech&&tech.active!==false?tech:null; }
function asIso(value,label){ const d=new Date(value); if(Number.isNaN(d.getTime())) throw Object.assign(new Error(`${label} must be a valid date/time`),{statusCode:422}); return d.toISOString(); }
function dayOf(value){ return String(value||'').slice(0,10); }
function customerSnapshot(input,number){
  const name=required(input.customerName||input.customer?.name,'customerName');
  return {
    id:input.customerId||input.customer?.id||`cust-live-${number}`,
    name,
    contactName:String(input.contactName||input.customer?.contactName||''),
    contactPhone:String(input.contactPhone||input.customer?.contactPhone||''),
    address:String(input.siteAddress||input.customer?.address||''),
    city:String(input.city||input.customer?.city||''),
    postcode:String(input.postcode||input.customer?.postcode||''),
  };
}
function techName(id){ return readState().technicians.find(t=>t.id===id)?.name||''; }
function findJob(state,id){ const job=state.jobs.find(j=>j.id===id); if(!job) throw Object.assign(new Error(`Job ${id} not found`),{statusCode:404}); return job; }
function addEventToState(state,jobId,type,payload={},createdBy='office'){ const event={id:`evt-live-${state.nextEventNumber++}`,jobId,type,createdAt:nowIso(),createdBy,payload}; state.events.push(event); return event; }
function normalizeTechnicianIds(value,state=readState()){
  const raw=Array.isArray(value)?value:(value?[value]:[]);
  const ids=[...new Set(raw.map(id=>String(id||'').trim()).filter(Boolean))];
  for(const id of ids) if(!activeTechnician(state,id)) throw Object.assign(new Error(`technicianId ${id} is not an active technician`),{statusCode:422});
  return ids;
}
function assignedIdsForJob(job){
  const ids=Array.isArray(job.assignedTechnicianIds)&&job.assignedTechnicianIds.length?job.assignedTechnicianIds:(job.assignedTechnicianId?[job.assignedTechnicianId]:[]);
  return [...new Set(ids.filter(Boolean))];
}
function syncJobAssignmentFields(state,job,date){
  const day=date||dayOf(job.scheduledStart);
  const ids=[...new Set(state.assignments.filter(a=>a.jobId===job.id&&a.date===day).map(a=>a.technicianId))];
  job.assignedTechnicianIds=ids;
  job.assignedTechnicianId=ids[0]||null;
  job.updatedAt=nowIso();
  return ids;
}
function ensureAssignmentsForJob(state,job,date){
  const day=date||dayOf(job.scheduledStart);
  const ids=assignedIdsForJob(job);
  const created=[];
  for(const technicianId of ids){
    let assignment=state.assignments.find(a=>a.jobId===job.id&&a.date===day&&a.technicianId===technicianId);
    if(!assignment){
      assignment={id:`asn-live-${state.nextAssignmentNumber++}`,jobId:job.id,technicianId,date:day,plannedStartAt:job.scheduledStart,plannedEndAt:job.scheduledEnd,sequenceIndex:state.assignments.filter(a=>a.date===day&&a.technicianId===technicianId).length};
      state.assignments.push(assignment);
    }
    created.push(assignment);
  }
  return created;
}

export function listWorkflowTechnicians({includeInactive=false}={}){
  const state=readState();
  return clone(state.technicians.filter(t=>includeInactive||t.active!==false));
}
export function createWorkflowTechnician(input={}){
  const state=readState();
  const name=required(input.name,'name');
  const email=technicianEmail(input.email);
  if(state.technicians.some(t=>String(t.email||'').toLowerCase()===email)) throw Object.assign(new Error('A user with this email already exists'),{statusCode:409});
  const id=input.id||`tech-live-${state.nextTechnicianNumber++}`;
  if(state.technicians.some(t=>t.id===id)) throw Object.assign(new Error(`Technician ${id} already exists`),{statusCode:409});
  const item={
    id,
    name,
    email,
    phone:String(input.phone||'').trim(),
    role:input.role==='lead_engineer'?'lead_engineer':'engineer',
    avatarInitials:String(input.avatarInitials||initials(name)).slice(0,3).toUpperCase(),
    accentColor:String(input.accentColor||TECHNICIAN_COLORS[state.technicians.length%TECHNICIAN_COLORS.length]),
    dailyCapacity:Math.max(1,Math.min(20,Number(input.dailyCapacity)||6)),
    active:input.active!==false,
    createdAt:nowIso(),
    updatedAt:nowIso(),
  };
  state.technicians.push(item);
  writeState(state);
  return clone(item);
}
export function updateWorkflowTechnician(technicianId,patch={}){
  const state=readState();
  const item=technicianById(state,technicianId);
  if(!item) throw Object.assign(new Error('Technician not found'),{statusCode:404});
  if('name' in patch){ item.name=required(patch.name,'name'); if(!('avatarInitials' in patch)) item.avatarInitials=initials(item.name); }
  if('email' in patch){
    const email=technicianEmail(patch.email);
    if(state.technicians.some(t=>t.id!==item.id&&String(t.email||'').toLowerCase()===email)) throw Object.assign(new Error('A user with this email already exists'),{statusCode:409});
    item.email=email;
  }
  if('phone' in patch) item.phone=String(patch.phone||'').trim();
  if('role' in patch) item.role=patch.role==='lead_engineer'?'lead_engineer':'engineer';
  if('avatarInitials' in patch) item.avatarInitials=String(patch.avatarInitials||initials(item.name)).slice(0,3).toUpperCase();
  if('accentColor' in patch) item.accentColor=String(patch.accentColor||item.accentColor);
  if('dailyCapacity' in patch) item.dailyCapacity=Math.max(1,Math.min(20,Number(patch.dailyCapacity)||6));
  if('active' in patch) item.active=Boolean(patch.active);
  item.updatedAt=nowIso();
  writeState(state);
  return clone(item);
}
export function deactivateWorkflowTechnician(technicianId){
  const state=readState();
  const item=technicianById(state,technicianId);
  if(!item) throw Object.assign(new Error('Technician not found'),{statusCode:404});
  const openJobs=state.jobs.filter(job=>!['completed','cancelled','skipped'].includes(job.status)&&assignedIdsForJob(job).includes(technicianId));
  if(openJobs.length) throw Object.assign(new Error(`Reassign ${openJobs.length} open job${openJobs.length===1?'':'s'} before deactivating this engineer`),{statusCode:409,openJobs:openJobs.map(job=>job.id)});
  item.active=false;
  item.updatedAt=nowIso();
  writeState(state);
  return clone(item);
}
export function listWorkflowJobs(filters={}){
  const state=readState();
  return clone(state.jobs.filter(job=>{
    const day=dayOf(job.scheduledStart);
    if(filters.from&&day<filters.from)return false;
    if(filters.to&&day>filters.to)return false;
    if(filters.status&&job.status!==filters.status)return false;
    if(filters.technicianId&&!assignedIdsForJob(job).includes(filters.technicianId))return false;
    if(filters.customerId&&job.customerId!==filters.customerId)return false;
    return true;
  }).sort((a,b)=>String(a.scheduledStart).localeCompare(String(b.scheduledStart))));
}
export function getWorkflowJob(jobId){ const state=readState(); const job=state.jobs.find(j=>j.id===jobId); return job?clone(job):null; }
export function createWorkflowJob(input={}){
  const state=readState();
  const number=state.nextJobNumber++;
  const customer=customerSnapshot(input,number);
  const scheduledStart=asIso(input.scheduledStart,'scheduledStart');
  const scheduledEnd=asIso(input.scheduledEnd,'scheduledEnd');
  if(new Date(scheduledEnd)<=new Date(scheduledStart)) throw Object.assign(new Error('scheduledEnd must be after scheduledStart'),{statusCode:422});
  const priority=PRIORITIES.has(input.priority)?input.priority:'normal';
  const assignedTechnicianIds=normalizeTechnicianIds(input.assignedTechnicianIds ?? input.assignedTechnicianId,state);
  const assignedTechnicianId=assignedTechnicianIds[0]||null;
  const id=input.id||`job-live-${number}`;
  if(state.jobs.some(j=>j.id===id)) throw Object.assign(new Error(`Job ${id} already exists`),{statusCode:409});
  const job={
    id,
    displayId:input.displayId||`J-${number}`,
    workflowSource:'shared',
    source:String(input.source||'manual'),
    sourceMetadata:input.sourceMetadata && typeof input.sourceMetadata==='object' ? clone(input.sourceMetadata) : undefined,
    customerId:customer.id,
    customer,
    siteId:input.siteId||undefined,
    jobTemplateId:input.jobTemplateId||undefined,
    recurringAssignmentId:input.recurringAssignmentId||undefined,
    recurringDueDate:input.recurringDueDate||undefined,
    recurringDueUsageHours:Number(input.recurringDueUsageHours||0)||undefined,
    plannedMaintenance:Boolean(input.plannedMaintenance),
    ppmScheduleBasis:input.ppmScheduleBasis||undefined,
    ppmFrequency:input.ppmFrequency||undefined,
    ppmAssetIds:Array.isArray(input.ppmAssetIds)?input.ppmAssetIds:[],
    ppmChecklistNames:Array.isArray(input.ppmChecklistNames)?input.ppmChecklistNames:[],
    ppmTools:Array.isArray(input.ppmTools)?input.ppmTools:[],
    ppmSpareParts:Array.isArray(input.ppmSpareParts)?input.ppmSpareParts:[],
    serviceType:required(input.serviceType,'serviceType'),
    description:String(input.description||''),
    scheduledStart,
    scheduledEnd,
    status:STATUSES.has(input.status)?input.status:'scheduled',
    priority,
    assignedTechnicianId,
    assignedTechnicianIds,
    notes:String(input.notes||''),
    amount:Number.isFinite(Number(input.amount))&&Number(input.amount)>0?Number(input.amount):null,
    createdAt:nowIso(),
    updatedAt:nowIso(),
  };
  state.jobs.push(job);
  ensureAssignmentsForJob(state,job);
  addEventToState(state,job.id,'job_created',{text:assignedTechnicianIds.length?`Job created and assigned to ${assignedTechnicianIds.map(techName).join(', ')}`:'Job created in unassigned queue'},'office');
  writeState(state);
  return clone(job);
}
export function updateWorkflowJob(jobId,patch={}){
  const state=readState();
  const job=findJob(state,jobId);
  const before=clone(job);
  const updatedBy=String(patch.updatedBy||'office');

  if(patch.status&&STATUSES.has(patch.status)) job.status=patch.status;
  if(patch.priority&&PRIORITIES.has(patch.priority)) job.priority=patch.priority;
  if('serviceType' in patch) job.serviceType=required(patch.serviceType,'serviceType');
  if('description' in patch) job.description=String(patch.description||'');
  if('notes' in patch) job.notes=String(patch.notes||'');
  for(const key of ['siteId','jobTemplateId','invoiceStubId','recurringAssignmentId','recurringDueDate','recurringDueUsageHours','plannedMaintenance','ppmScheduleBasis','ppmFrequency','ppmAssetIds','ppmChecklistNames','ppmTools','ppmSpareParts']){
    if(key in patch) job[key]=patch[key]||undefined;
  }

  if(patch.scheduledStart) job.scheduledStart=asIso(patch.scheduledStart,'scheduledStart');
  if(patch.scheduledEnd) job.scheduledEnd=asIso(patch.scheduledEnd,'scheduledEnd');
  if(new Date(job.scheduledEnd)<=new Date(job.scheduledStart)){
    throw Object.assign(new Error('scheduledEnd must be after scheduledStart'),{statusCode:422});
  }

  if('assignedTechnicianIds' in patch||'assignedTechnicianId' in patch){
    const ids=normalizeTechnicianIds('assignedTechnicianIds' in patch?patch.assignedTechnicianIds:patch.assignedTechnicianId,state);
    job.assignedTechnicianIds=ids;
    job.assignedTechnicianId=ids[0]||null;
  }
  if(patch.customer&&typeof patch.customer==='object'){
    job.customer={...job.customer,...patch.customer};
    job.customerId=job.customer.id||job.customerId;
  }

  job.updatedAt=nowIso();

  if(before.status!==job.status){
    if(job.status==='completed')job.completedAt=nowIso();
    if(job.status==='skipped')job.skippedAt=nowIso();
    if(job.status==='cancelled')job.cancelledAt=nowIso();
    addEventToState(state,job.id,'status_change',{fromStatus:before.status,toStatus:job.status},updatedBy);
  }

  const beforeIds=assignedIdsForJob(before);
  if(before.status!==job.status&&job.status==='cancelled'){
    job.assignedTechnicianIds=[];
    job.assignedTechnicianId=null;
  }
  const afterIds=assignedIdsForJob(job);
  const assignmentChanged=JSON.stringify(beforeIds)!==JSON.stringify(afterIds);
  const scheduleChanged=before.scheduledStart!==job.scheduledStart||before.scheduledEnd!==job.scheduledEnd;

  if(assignmentChanged){
    state.assignments=state.assignments.filter(a=>a.jobId!==job.id);
    ensureAssignmentsForJob(state,job);
    addEventToState(state,job.id,'assignment_changed',{
      fromTechnicianIds:beforeIds,
      toTechnicianIds:afterIds,
      text:job.status==='cancelled'?'Assignments cleared because job was cancelled':afterIds.length?`Assigned to ${afterIds.map(techName).join(', ')}`:'Moved to unassigned queue'
    },updatedBy);
  }else if(scheduleChanged){
    const nextDate=dayOf(job.scheduledStart);
    for(const assignment of state.assignments.filter(a=>a.jobId===job.id)){
      assignment.date=nextDate;
      assignment.plannedStartAt=job.scheduledStart;
      assignment.plannedEndAt=job.scheduledEnd;
    }
  }

  if(scheduleChanged){
    const display=(value)=>new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(value));
    addEventToState(state,job.id,'note_added',{text:`Job rescheduled: ${display(before.scheduledStart)}–${display(before.scheduledEnd)} → ${display(job.scheduledStart)}–${display(job.scheduledEnd)}`},updatedBy);
  }

  const detailChanges=[];
  if(before.serviceType!==job.serviceType)detailChanges.push('service');
  if(before.priority!==job.priority)detailChanges.push('priority');
  if(before.description!==job.description)detailChanges.push('brief');
  if(before.notes!==job.notes)detailChanges.push('notes');
  if(JSON.stringify(before.customer)!==JSON.stringify(job.customer))detailChanges.push('customer/site details');
  if(detailChanges.length){
    addEventToState(state,job.id,'note_added',{text:`Job details updated: ${detailChanges.join(', ')}`},updatedBy);
  }

  writeState(state);
  return clone(job);
}

export function deleteWorkflowJob(jobId,{deletedBy='office'}={}){
  const state=readState();
  const job=findJob(state,jobId);

  if(!['scheduled','cancelled'].includes(job.status)||job.invoiceStubId){
    throw Object.assign(new Error('Only scheduled or cancelled jobs can be deleted. Jobs that have started, completed or been invoiced must be retained.'),{statusCode:409});
  }
  if(job.recurringAssignmentId){
    throw Object.assign(new Error('Recurring PPM occurrences cannot be deleted. Cancel this occurrence instead.'),{statusCode:409});
  }
  if(job.jobTemplateId){
    throw Object.assign(new Error('Jobs with compliance forms cannot be deleted. Cancel the job instead.'),{statusCode:409});
  }

  state.jobs=state.jobs.filter(item=>item.id!==jobId);
  state.assignments=state.assignments.filter(item=>item.jobId!==jobId);
  state.events=state.events.filter(item=>item.jobId!==jobId);
  state.media=state.media.filter(item=>item.jobId!==jobId);
  writeState(state);
  return clone({
    deleted:true,
    id:job.id,
    displayId:job.displayId||job.id,
    deletedBy:String(deletedBy||'office'),
  });
}

export function listWorkflowAssignments({date,technicianId}={}){
  const state=readState();
  return clone(state.assignments.filter(a=>(!date||a.date===date)&&(!technicianId||a.technicianId===technicianId)).sort((a,b)=>a.sequenceIndex-b.sequenceIndex||a.plannedStartAt.localeCompare(b.plannedStartAt)));
}
export function createWorkflowAssignment(input={}){
  const state=readState(); const job=findJob(state,required(input.jobId,'jobId')); const tech=required(input.technicianId,'technicianId');
  if(!activeTechnician(state,tech)) throw Object.assign(new Error('technicianId is not an active technician'),{statusCode:422});
  const date=input.date||dayOf(input.plannedStartAt||job.scheduledStart);
  const existing=state.assignments.find(a=>a.jobId===job.id&&a.date===date&&a.technicianId===tech);
  if(existing) return clone(existing);
  const assignment={id:`asn-live-${state.nextAssignmentNumber++}`,jobId:job.id,technicianId:tech,date,plannedStartAt:input.plannedStartAt?asIso(input.plannedStartAt,'plannedStartAt'):job.scheduledStart,plannedEndAt:input.plannedEndAt?asIso(input.plannedEndAt,'plannedEndAt'):job.scheduledEnd,sequenceIndex:Number.isFinite(Number(input.sequenceIndex))?Number(input.sequenceIndex):state.assignments.filter(a=>a.date===date&&a.technicianId===tech).length};
  state.assignments.push(assignment); job.scheduledStart=assignment.plannedStartAt; job.scheduledEnd=assignment.plannedEndAt; const ids=syncJobAssignmentFields(state,job,date);
  addEventToState(state,job.id,'assignment_changed',{toTechnicianIds:ids,text:`Assigned to ${ids.map(techName).join(', ')}`},'office'); writeState(state); return clone(assignment);
}
export function replaceWorkflowAssignments(jobId,input={}){
  const state=readState(); const job=findJob(state,required(jobId,'jobId')); const date=input.date||dayOf(job.scheduledStart); const ids=normalizeTechnicianIds(input.technicianIds,state);
  const beforeIds=[...new Set(state.assignments.filter(a=>a.jobId===job.id&&a.date===date).map(a=>a.technicianId))];
  state.assignments=state.assignments.filter(a=>!(a.jobId===job.id&&a.date===date));
  for(const technicianId of ids){
    state.assignments.push({id:`asn-live-${state.nextAssignmentNumber++}`,jobId:job.id,technicianId,date,plannedStartAt:job.scheduledStart,plannedEndAt:job.scheduledEnd,sequenceIndex:state.assignments.filter(a=>a.date===date&&a.technicianId===technicianId).length});
  }
  syncJobAssignmentFields(state,job,date);
  addEventToState(state,job.id,'assignment_changed',{fromTechnicianIds:beforeIds,toTechnicianIds:ids,text:ids.length?`Assigned to ${ids.map(techName).join(', ')}`:'Moved to unassigned queue'},input.updatedBy||'office');
  writeState(state);
  return clone({job,assignments:state.assignments.filter(a=>a.jobId===job.id&&a.date===date)});
}
export function updateWorkflowAssignment(assignmentId,patch={}){
  const state=readState(); const assignment=state.assignments.find(a=>a.id===assignmentId); if(!assignment) throw Object.assign(new Error('Assignment not found'),{statusCode:404});
  const job=findJob(state,assignment.jobId); const beforeTech=assignment.technicianId;
  if(patch.technicianId){
    if(!activeTechnician(state,patch.technicianId)) throw Object.assign(new Error('technicianId is not an active technician'),{statusCode:422});
    assignment.technicianId=patch.technicianId;
    state.assignments=state.assignments.filter(a=>a.id===assignment.id||!(a.jobId===assignment.jobId&&a.date===assignment.date&&a.technicianId===assignment.technicianId));
  }
  if(patch.plannedStartAt){ assignment.plannedStartAt=asIso(patch.plannedStartAt,'plannedStartAt'); job.scheduledStart=assignment.plannedStartAt; }
  if(patch.plannedEndAt){ assignment.plannedEndAt=asIso(patch.plannedEndAt,'plannedEndAt'); job.scheduledEnd=assignment.plannedEndAt; }
  if(Number.isFinite(Number(patch.sequenceIndex))) assignment.sequenceIndex=Number(patch.sequenceIndex);
  const ids=syncJobAssignmentFields(state,job,assignment.date);
  if(beforeTech!==assignment.technicianId)addEventToState(state,job.id,'assignment_changed',{fromTechnicianId:beforeTech,toTechnicianId:assignment.technicianId,toTechnicianIds:ids,text:`Assignments updated: ${ids.map(techName).join(', ')}`},'office');
  writeState(state); return clone(assignment);
}

export function listWorkflowEvents(jobId){ return clone(readState().events.filter(e=>e.jobId===jobId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))); }
export function createWorkflowEvent(input={}){
  const state=readState(); const job=findJob(state,required(input.jobId,'jobId')); const type=required(input.type,'type'); const payload=input.payload&&typeof input.payload==='object'?clone(input.payload):{};
  if(type==='status_change'&&input.toStatus){
    if(!STATUSES.has(input.toStatus))throw Object.assign(new Error('invalid toStatus'),{statusCode:422});
    payload.fromStatus=job.status;
    payload.toStatus=input.toStatus;
    job.status=input.toStatus;
    job.updatedAt=nowIso();
    if(job.status==='completed')job.completedAt=nowIso();
    if(job.status==='skipped')job.skippedAt=nowIso();
  }
  const event=addEventToState(state,job.id,type,payload,input.createdBy||'user-1'); writeState(state); return clone(event);
}
export function listWorkflowMedia(jobId){ return clone(readState().media.filter(m=>m.jobId===jobId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))); }
export function createWorkflowMedia(jobId,input={}){
  const state=readState(); findJob(state,jobId); if(!['photo','signature'].includes(input.type))throw Object.assign(new Error('type must be photo or signature'),{statusCode:422});
  const item={id:`media-live-${state.nextMediaNumber++}`,jobId,type:input.type,caption:String(input.caption||''),uri:String(input.uri||''),createdAt:nowIso()}; state.media.push(item); addEventToState(state,jobId,input.type==='photo'?'photo_added':'signature_added',{caption:item.caption,mediaId:item.id},input.createdBy||'user-1'); writeState(state); return clone(item);
}

export function deleteWorkflowMedia(jobId,mediaId){
  const state=readState(); findJob(state,jobId);
  const index=state.media.findIndex(item=>item.jobId===jobId&&item.id===mediaId);
  if(index<0)throw Object.assign(new Error('Media not found'),{statusCode:404});
  const [removed]=state.media.splice(index,1);
  addEventToState(state,jobId,removed.type==='photo'?'photo_removed':'signature_removed',{caption:removed.caption,mediaId:removed.id},'user-1');
  writeState(state);
  return {ok:true,id:removed.id,type:removed.type};
}

export function getWorkflowDashboardSummary({from,to}={}){
  const jobs=listWorkflowJobs({from,to}); const state=readState(); const count=(s)=>jobs.filter(j=>j.status===s).length; const jobIds=new Set(jobs.map(j=>j.id));
  return {jobs:{scheduled:count('scheduled'),enRoute:count('en_route'),inProgress:count('in_progress'),completed:count('completed'),cancelled:count('cancelled'),skipped:count('skipped')},invoicing:{completedNotInvoiced:jobs.filter(j=>j.status==='completed'&&!j.invoiceStubId).length,avgDaysToInvoice:0},technicians:{jobsPerDay:state.technicians.filter(t=>t.active!==false).map(t=>({technicianId:t.id,count:state.assignments.filter(a=>jobIds.has(a.jobId)&&a.technicianId===t.id).length}))}};
}
export function getWorkflowServiceTypes({from,to}={}){ const map=new Map(); for(const job of listWorkflowJobs({from,to}))map.set(job.serviceType,(map.get(job.serviceType)||0)+1); return [...map.entries()].map(([serviceType,count])=>({serviceType,count})).sort((a,b)=>b.count-a.count); }
export function getWorkflowInfo(){ const state=readState(); return {filePath,jobs:state.jobs.length,assignments:state.assignments.length,events:state.events.length,media:state.media.length}; }
export function resetWorkflowStore(){ const state=emptyState(); writeState(state); return getWorkflowInfo(); }
