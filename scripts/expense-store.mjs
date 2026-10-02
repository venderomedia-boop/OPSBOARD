import fs from 'node:fs';
import path from 'node:path';

const dataDir=process.env.OPSBOARD_DATA_DIR||(fs.existsSync('/data')?'/data':'/tmp');
const filePath=path.join(dataDir,'expense-store.json');
const receiptDir=path.join(dataDir,'expense-receipts');
const STATUSES=new Set(['draft','submitted','approved','rejected','reimbursed']);
const CATEGORIES=new Set(['travel','materials','parking','meals','accommodation','tools','other']);
const ALLOWED_RECEIPT_TYPES=new Map([
  ['image/jpeg','jpg'],
  ['image/png','png'],
  ['image/webp','webp'],
]);
const MAX_RECEIPT_BYTES=6*1024*1024;
const clone=(value)=>JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();

const seeds=[
  {
    id:'exp-2041',reference:'EXP-2041',submitterName:'Marcus Reed',technicianId:'user-1',category:'parking',incurredDate:'2026-09-29',
    description:'City centre parking while attending J-1061',net:18,tax:0,gross:18,paymentMethod:'Personal card',jobRef:'J-1061',siteName:'Westbrook Business Centre',
    receiptName:'parking-29-sep.jpg',receipt:null,status:'submitted',createdAt:'2026-09-29T17:15:00.000Z',updatedAt:'2026-09-29T17:15:00.000Z'
  },
  {
    id:'exp-2040',reference:'EXP-2040',submitterName:'Priya Shah',technicianId:'tech-priya',category:'materials',incurredDate:'2026-09-27',
    description:'Emergency valve and fittings',net:64.5,tax:12.9,gross:77.4,paymentMethod:'Company card',jobRef:'J-1059',purchaseOrderRef:'PO-1024',siteName:'Harrison Court',
    receiptName:'merchant-receipt.pdf',receipt:null,status:'approved',reviewer:'Office Admin',createdAt:'2026-09-27T14:20:00.000Z',updatedAt:'2026-09-28T09:10:00.000Z'
  },
];

function ensureDir(){
  fs.mkdirSync(dataDir,{recursive:true});
  fs.mkdirSync(receiptDir,{recursive:true});
}
function emptyState(){return{nextNumber:2042,expenses:clone(seeds)};}
function readState(){
  ensureDir();
  if(!fs.existsSync(filePath))return emptyState();
  try{
    const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
    return{...emptyState(),...parsed,expenses:Array.isArray(parsed.expenses)?parsed.expenses:clone(seeds)};
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
function money(value,label){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)throw Object.assign(new Error(`${label} must be a valid non-negative amount`),{statusCode:422});
  return Math.round((n+Number.EPSILON)*100)/100;
}
function dateOnly(value,label){
  const text=required(value,label);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Object.assign(new Error(`${label} must be YYYY-MM-DD`),{statusCode:422});
  return text;
}
function sanitizeFilename(value,fallback='receipt.jpg'){
  const name=String(value||fallback).replace(/[\\/:*?"<>|\x00-\x1F]/g,'-').trim();
  return name.slice(0,180)||fallback;
}
function parseReceipt(receipt){
  if(!receipt)return null;
  const name=sanitizeFilename(required(receipt.name||'receipt.jpg','receipt.name'));
  const mimeType=String(receipt.mimeType||'image/jpeg').toLowerCase();
  const ext=ALLOWED_RECEIPT_TYPES.get(mimeType);
  if(!ext)throw Object.assign(new Error('Receipt must be a JPG, PNG or WEBP image'),{statusCode:422});
  const dataUrl=required(receipt.dataUrl,'receipt.dataUrl');
  const prefix=`data:${mimeType};base64,`;
  if(!dataUrl.startsWith(prefix))throw Object.assign(new Error('Receipt image data is invalid'),{statusCode:422});
  let buffer;
  try{buffer=Buffer.from(dataUrl.slice(prefix.length),'base64');}
  catch{throw Object.assign(new Error('Receipt image data is invalid'),{statusCode:422});}
  if(!buffer.length)throw Object.assign(new Error('Receipt image is empty'),{statusCode:422});
  if(buffer.length>MAX_RECEIPT_BYTES)throw Object.assign(new Error('Receipt image must be 6 MB or smaller'),{statusCode:413});
  return{name,mimeType,ext,buffer,sizeBytes:buffer.length};
}
function removeStoredReceipt(receipt){
  if(!receipt?.fileName)return;
  const file=path.join(receiptDir,path.basename(receipt.fileName));
  try{if(fs.existsSync(file))fs.unlinkSync(file);}catch{}
}
function persistReceipt(expenseId,receiptInput,previousReceipt){
  const parsed=parseReceipt(receiptInput);
  if(!parsed)return null;
  ensureDir();
  removeStoredReceipt(previousReceipt);
  const fileName=`${expenseId}.${parsed.ext}`;
  const file=path.join(receiptDir,fileName);
  const tmp=`${file}.tmp`;
  fs.writeFileSync(tmp,parsed.buffer);
  fs.renameSync(tmp,file);
  return{name:parsed.name,mimeType:parsed.mimeType,sizeBytes:parsed.sizeBytes,fileName};
}
function publicRecord(item){
  const {receipt,...rest}=item;
  return clone({
    ...rest,
    receiptName:receipt?.name||item.receiptName||undefined,
    hasReceipt:Boolean(receipt),
    receiptMimeType:receipt?.mimeType||undefined,
    receiptSizeBytes:receipt?.sizeBytes||undefined,
  });
}
function find(state,id){
  const item=state.expenses.find(row=>row.id===id);
  if(!item)throw Object.assign(new Error('Expense claim not found'),{statusCode:404});
  return item;
}

export function listExpenses({technicianId,status}={}){
  const state=readState();
  return state.expenses.filter(item=>{
    if(technicianId&&String(item.technicianId||'')!==String(technicianId))return false;
    if(status&&item.status!==status)return false;
    return true;
  }).sort((a,b)=>String(b.incurredDate).localeCompare(String(a.incurredDate))||String(b.createdAt).localeCompare(String(a.createdAt))).map(publicRecord);
}

export function getExpense(id){
  const state=readState();
  const item=state.expenses.find(row=>row.id===id);
  return item?publicRecord(item):null;
}

export function createExpense(input={}){
  const state=readState();
  const submitterName=required(input.submitterName,'submitterName');
  const technicianId=input.technicianId?String(input.technicianId):undefined;
  const category=CATEGORIES.has(String(input.category))?String(input.category):'other';
  const incurredDate=dateOnly(input.incurredDate,'incurredDate');
  const description=required(input.description,'description');
  const net=input.net===undefined?money(input.gross||0,'gross'):money(input.net,'net');
  const tax=input.tax===undefined?0:money(input.tax,'tax');
  const gross=input.gross===undefined?Math.round((net+tax+Number.EPSILON)*100)/100:money(input.gross,'gross');
  const status=STATUSES.has(String(input.status))?String(input.status):'submitted';
  if(status==='submitted'&&category!=='travel'&&!input.receipt&&!input.receiptName){
    throw Object.assign(new Error('Attach a receipt before submitting this expense'),{statusCode:422});
  }

  const now=nowIso();
  const number=state.nextNumber++;
  const id=`exp-${number}`;
  const storedReceipt=input.receipt?persistReceipt(id,input.receipt,null):null;
  const item={
    id,
    reference:`EXP-${number}`,
    submitterName,technicianId,category,incurredDate,description,net,tax,gross,
    paymentMethod:String(input.paymentMethod||'Personal card').trim()||'Personal card',
    jobRef:String(input.jobRef||'').trim()||undefined,
    purchaseOrderRef:String(input.purchaseOrderRef||'').trim().toUpperCase()||undefined,
    siteName:String(input.siteName||'').trim()||undefined,
    mileageMiles:input.mileageMiles===undefined?undefined:Math.max(0,Number(input.mileageMiles)||0),
    receiptName:storedReceipt?.name||String(input.receiptName||'').trim()||undefined,
    receipt:storedReceipt,
    status,reviewer:undefined,rejectionReason:undefined,createdAt:now,updatedAt:now,
  };
  state.expenses.unshift(item);
  writeState(state);
  return publicRecord(item);
}

export function updateExpense(id,patch={}){
  const state=readState();
  const index=state.expenses.findIndex(row=>row.id===id);
  if(index<0)throw Object.assign(new Error('Expense claim not found'),{statusCode:404});
  const current=state.expenses[index];
  if(!['draft','rejected'].includes(current.status))throw Object.assign(new Error('Only draft or rejected expenses can be edited'),{statusCode:409});
  const next={...current};

  if('submitterName' in patch)next.submitterName=required(patch.submitterName,'submitterName');
  if('technicianId' in patch)next.technicianId=patch.technicianId?String(patch.technicianId):undefined;
  if('category' in patch)next.category=CATEGORIES.has(String(patch.category))?String(patch.category):'other';
  if('incurredDate' in patch)next.incurredDate=dateOnly(patch.incurredDate,'incurredDate');
  if('description' in patch)next.description=required(patch.description,'description');
  if('net' in patch)next.net=money(patch.net,'net');
  if('tax' in patch)next.tax=money(patch.tax,'tax');
  if('gross' in patch)next.gross=money(patch.gross,'gross');
  else next.gross=Math.round((Number(next.net||0)+Number(next.tax||0)+Number.EPSILON)*100)/100;
  if('paymentMethod' in patch)next.paymentMethod=String(patch.paymentMethod||'').trim();
  if('jobRef' in patch)next.jobRef=String(patch.jobRef||'').trim()||undefined;
  if('purchaseOrderRef' in patch)next.purchaseOrderRef=String(patch.purchaseOrderRef||'').trim().toUpperCase()||undefined;
  if('siteName' in patch)next.siteName=String(patch.siteName||'').trim()||undefined;
  if('mileageMiles' in patch)next.mileageMiles=patch.mileageMiles===undefined?undefined:Math.max(0,Number(patch.mileageMiles)||0);
  if('receipt' in patch&&patch.receipt){
    next.receipt=persistReceipt(id,patch.receipt,current.receipt);
    next.receiptName=next.receipt?.name||undefined;
  }else if('receiptName' in patch&&!next.receipt){
    next.receiptName=String(patch.receiptName||'').trim()||undefined;
  }
  next.updatedAt=nowIso();

  state.expenses[index]=next;
  writeState(state);
  return publicRecord(next);
}

export function transitionExpense(id,{status,reviewer,reason}={}){
  const state=readState();
  const item=find(state,id);
  const next=String(status||'');
  const allowed=item.status==='draft'?['submitted']:item.status==='submitted'?['approved','rejected']:item.status==='approved'?['reimbursed']:item.status==='rejected'?['draft']:[];
  if(!allowed.includes(next))throw Object.assign(new Error(`Cannot move ${item.status} expense to ${next}`),{statusCode:409});
  if(next==='submitted'&&item.category!=='travel'&&!item.receipt&&!item.receiptName){
    throw Object.assign(new Error('Attach a receipt before submitting this expense'),{statusCode:422});
  }
  item.status=next;
  if(['approved','rejected'].includes(next))item.reviewer=String(reviewer||'Office Admin');
  item.rejectionReason=next==='rejected'?String(reason||'Rejected by reviewer'):undefined;
  item.updatedAt=nowIso();
  writeState(state);
  return publicRecord(item);
}

export function getExpenseReceipt(id){
  const state=readState();
  const item=find(state,id);
  if(!item.receipt)return null;

  // Backwards compatibility for any early data-url records created before
  // receipts moved to the persistent /data volume as binary files.
  if(item.receipt.dataUrl){
    const prefix=`data:${item.receipt.mimeType};base64,`;
    const base64=String(item.receipt.dataUrl||'').startsWith(prefix)?String(item.receipt.dataUrl).slice(prefix.length):'';
    if(!base64)return null;
    const buffer=Buffer.from(base64,'base64');
    return{name:item.receipt.name,mimeType:item.receipt.mimeType,sizeBytes:buffer.length,buffer};
  }

  const file=path.join(receiptDir,path.basename(String(item.receipt.fileName||'')));
  if(!item.receipt.fileName||!fs.existsSync(file))return null;
  const buffer=fs.readFileSync(file);
  return{name:item.receipt.name,mimeType:item.receipt.mimeType,sizeBytes:buffer.length,buffer};
}

export function getExpenseStoreInfo(){
  const state=readState();
  return{filePath,receiptDir,count:state.expenses.length,withReceipts:state.expenses.filter(item=>Boolean(item.receipt)).length};
}
