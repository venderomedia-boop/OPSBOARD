import { decisionForCandidate, extractJobCandidate, normalizeInboundEmail, validateJobCandidate } from './email-extractor.mjs';
import { createEmailIntake, getEmailIntake, markEmailIntakeCreated, updateEmailIntake } from './email-intake-store.mjs';

function splitCsv(value='') { return String(value).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean); }
function senderAllowed(sender, options={}) {
  const email=String(sender||'').toLowerCase();
  const allowedSenders=options.allowedSenders || splitCsv(process.env.EMAIL_INTAKE_ALLOWED_SENDERS);
  const allowedDomains=options.allowedDomains || splitCsv(process.env.EMAIL_INTAKE_ALLOWED_DOMAINS);
  if(allowedSenders.includes(email)) return true;
  const domain=email.split('@')[1]||'';
  return Boolean(domain && allowedDomains.includes(domain));
}

export function ingestInboundEmail(input={}, options={}){
  const email=normalizeInboundEmail(input);
  const trustedSender=senderAllowed(email.from,options);
  const candidate=extractJobCandidate(email);
  const validation=validateJobCandidate(candidate,{requireSchedule:true});
  const decision=decisionForCandidate(candidate,validation,{trustedSender,autoCreateThreshold:options.autoCreateThreshold});
  const security={trustedSender,receivedFromProvider:Boolean(email.provider && email.provider!=='unknown')};
  return createEmailIntake({email,candidate,validation,decision,security});
}

function timeZoneOffsetMinutes(instant,timeZone){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone,timeZoneName:'longOffset',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(instant);
  const name=parts.find(p=>p.type==='timeZoneName')?.value||'GMT';
  if(name==='GMT'||name==='UTC') return 0;
  const match=name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if(!match) throw Object.assign(new Error(`Unable to resolve timezone offset for ${timeZone}`),{statusCode:422});
  const minutes=Number(match[2])*60+Number(match[3]);
  return match[1]==='-'?-minutes:minutes;
}
function combineDateTime(date,time,timeZone='Europe/London'){
  if(!date) return null;
  const [year,month,day]=date.split('-').map(Number);
  const [hour,minute]=(time||'09:00').split(':').map(Number);
  if(!year||!month||!day||Number.isNaN(hour)||Number.isNaN(minute)) throw Object.assign(new Error('Invalid local schedule date/time'),{statusCode:422});
  const localAsUtc=Date.UTC(year,month-1,day,hour,minute,0);
  let offset=timeZoneOffsetMinutes(new Date(localAsUtc),timeZone);
  let instant=new Date(localAsUtc-offset*60000);
  const corrected=timeZoneOffsetMinutes(instant,timeZone);
  if(corrected!==offset) instant=new Date(localAsUtc-corrected*60000);
  return instant.toISOString();
}
function plusMinutes(iso,minutes){ return new Date(new Date(iso).getTime()+minutes*60000).toISOString(); }

export function buildWorkflowJobPayload(record, edits={}){
  const f={...(record?.candidate?.fields||{}),...edits};
  if(!f.customerName) throw Object.assign(new Error('customerName is required'),{statusCode:422});
  if(!f.serviceType) throw Object.assign(new Error('serviceType is required'),{statusCode:422});
  if(!f.siteName && !f.siteAddress) throw Object.assign(new Error('siteName or siteAddress is required'),{statusCode:422});
  if(!f.requestedDate) throw Object.assign(new Error('requestedDate is required'),{statusCode:422});
  if(!f.requestedTime) throw Object.assign(new Error('requestedTime is required before job creation'),{statusCode:422});
  const scheduledStart=combineDateTime(f.requestedDate,f.requestedTime,edits.timeZone||'Europe/London');
  const durationMinutes=Math.max(15,Number(edits.durationMinutes||120));
  const scheduledEnd=plusMinutes(scheduledStart,durationMinutes);
  return {
    customerName:f.customerName,
    contactName:f.contactName||'',
    contactPhone:f.contactPhone||'',
    siteAddress:f.siteAddress||f.siteName||'',
    city:f.city||'',
    postcode:f.postcode||'',
    serviceType:f.serviceType,
    description:f.description||record.email?.subject||'',
    scheduledStart,
    scheduledEnd,
    priority:f.priority||'normal',
    assignedTechnicianIds:[],
    jobTemplateId:f.jobTemplateId||undefined,
    notes:f.notes||'',
    source:'email',
    sourceMetadata:{
      intakeId:record.id,
      provider:record.email?.provider||'',
      providerEmailId:record.email?.providerEmailId||'',
      messageId:record.email?.messageId||'',
      externalReference:f.externalReference||'',
      sender:record.email?.from||'',
      subject:record.email?.subject||'',
      receivedAt:record.email?.receivedAt||'',
      siteName:f.siteName||'',
    },
  };
}

export function promoteEmailIntakeToJob(id,{createWorkflowJob,edits={},reviewedBy='office'}={}){
  if(typeof createWorkflowJob!=='function') throw new Error('createWorkflowJob function is required');
  const record=getEmailIntake(id);
  if(!record) throw Object.assign(new Error(`Email intake ${id} not found`),{statusCode:404});
  if(record.createdJobId) return {job:null,record,alreadyCreated:true};
  if(record.status==='rejected') throw Object.assign(new Error('Rejected email intake must be reviewed before job creation'),{statusCode:409});
  const payload=buildWorkflowJobPayload(record,edits);
  const job=createWorkflowJob(payload);
  const updated=markEmailIntakeCreated(id,job.id,reviewedBy);
  return {job,record:updated,alreadyCreated:false};
}

export function reviewEmailIntake(id, fields, reviewer='office'){
  const record=getEmailIntake(id);
  if(!record) throw Object.assign(new Error(`Email intake ${id} not found`),{statusCode:404});
  if(record.createdJobId) throw Object.assign(new Error('Created email intake is audit-only'),{statusCode:409});
  const candidate={...record.candidate,fields:{...record.candidate.fields,...fields}};
  const validation=validateJobCandidate(candidate,{requireSchedule:true});
  const machineDecision=decisionForCandidate(candidate,validation,{trustedSender:Boolean(record.security?.trustedSender)});
  const decision=validation.valid && candidate.fields.requestedTime
    ? {...machineDecision,status:'ready',autoCreate:false,reasons:['Validated by office review']}
    : {...machineDecision,status:'needs_review',autoCreate:false};
  return updateEmailIntake(id,{candidate,validation,decision,status:decision.status,reviewedBy:reviewer});
}
