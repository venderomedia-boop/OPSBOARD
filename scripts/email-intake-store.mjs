import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.OPSBOARD_DATA_DIR || (fs.existsSync('/data') ? '/data' : '/tmp');
const filePath = path.join(dataDir, 'email-intake-store.json');
const clone = value => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();

function emptyState(){ return {nextIntakeNumber:1, records:[]}; }
function ensureDir(){ fs.mkdirSync(dataDir,{recursive:true}); }
function readState(){
  ensureDir();
  if(!fs.existsSync(filePath)) return emptyState();
  try {
    const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
    return {...emptyState(),...parsed,records:Array.isArray(parsed.records)?parsed.records:[]};
  } catch { return emptyState(); }
}
function writeState(state){
  ensureDir();
  const tmp=`${filePath}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(state,null,2));
  fs.renameSync(tmp,filePath);
}
function duplicateKey(email, candidate){
  const providerId = String(email?.providerEmailId||'').trim();
  const messageId = String(email?.messageId||'').trim().toLowerCase();
  const externalReference = String(candidate?.fields?.externalReference||'').trim().toLowerCase();
  const referenceContext=[email?.subject||'',email?.text||''].join('\n');
  const strongExternalReference=externalReference && /(?:work\s*order|job\s*(?:ref|reference)|\bwo\b)\s*[:#-]/i.test(referenceContext) ? externalReference : '';
  return {providerId,messageId,strongExternalReference};
}
function findDuplicate(state,email,candidate){
  const key=duplicateKey(email,candidate);
  return state.records.find(r =>
    (key.providerId && r.email?.providerEmailId===key.providerId) ||
    (key.messageId && String(r.email?.messageId||'').toLowerCase()===key.messageId) ||
    (key.strongExternalReference && duplicateKey(r.email,r.candidate).strongExternalReference===key.strongExternalReference && String(r.email?.from||'').toLowerCase()===String(email?.from||'').toLowerCase())
  );
}

export function createEmailIntake({email,candidate,validation,decision,security={}}){
  const state=readState();
  const duplicate=findDuplicate(state,email,candidate);
  if(duplicate) return {record:clone(duplicate), duplicate:true};
  const number=state.nextIntakeNumber++;
  const record={
    id:`intake-${number}`,
    status:decision?.status||'needs_review',
    email:clone(email),
    candidate:clone(candidate),
    validation:clone(validation),
    decision:clone(decision),
    security:clone(security),
    createdJobId:null,
    createdAt:nowIso(),
    updatedAt:nowIso(),
    reviewedAt:null,
    reviewedBy:null,
  };
  state.records.push(record);
  writeState(state);
  return {record:clone(record),duplicate:false};
}

export function listEmailIntakes(filters={}){
  return clone(readState().records.filter(r => {
    if(filters.status && r.status!==filters.status) return false;
    if(filters.from && r.createdAt < filters.from) return false;
    return true;
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
}

export function getEmailIntake(id){
  const record=readState().records.find(r=>r.id===id);
  return record?clone(record):null;
}

export function updateEmailIntake(id, patch={}){
  const state=readState();
  const record=state.records.find(r=>r.id===id);
  if(!record) throw Object.assign(new Error(`Email intake ${id} not found`),{statusCode:404});
  if(record.createdJobId && (patch.candidate || (patch.status && patch.status!=='created'))) throw Object.assign(new Error('Created email intake is audit-only'),{statusCode:409});
  if(patch.status) record.status=String(patch.status);
  if(patch.candidate?.fields) record.candidate.fields={...record.candidate.fields,...patch.candidate.fields};
  if(patch.validation) record.validation=clone(patch.validation);
  if(patch.decision) record.decision=clone(patch.decision);
  if(patch.reviewedBy){record.reviewedBy=String(patch.reviewedBy);record.reviewedAt=nowIso();}
  record.updatedAt=nowIso();
  writeState(state);
  return clone(record);
}

export function markEmailIntakeCreated(id, jobId, reviewedBy='office'){
  const state=readState();
  const record=state.records.find(r=>r.id===id);
  if(!record) throw Object.assign(new Error(`Email intake ${id} not found`),{statusCode:404});
  if(record.createdJobId && record.createdJobId!==jobId) throw Object.assign(new Error('Email intake already created a different job'),{statusCode:409});
  record.status='created';
  record.createdJobId=jobId;
  record.reviewedBy=reviewedBy;
  record.reviewedAt=record.reviewedAt||nowIso();
  record.updatedAt=nowIso();
  writeState(state);
  return clone(record);
}

export function rejectEmailIntake(id, reviewedBy='office'){
  const record=getEmailIntake(id);
  if(!record) throw Object.assign(new Error(`Email intake ${id} not found`),{statusCode:404});
  if(record.createdJobId) throw Object.assign(new Error('Created email intake cannot be rejected'),{statusCode:409});
  return updateEmailIntake(id,{status:'rejected',reviewedBy});
}

export function getEmailIntakeSummary(){
  const rows=readState().records;
  const count=status=>rows.filter(r=>r.status===status).length;
  return {total:rows.length,needsReview:count('needs_review'),ready:count('ready'),created:count('created'),rejected:count('rejected')};
}

export function resetEmailIntakeStore(){ writeState(emptyState()); return getEmailIntakeSummary(); }
