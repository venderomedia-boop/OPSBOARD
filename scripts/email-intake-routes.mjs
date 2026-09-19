import { getEmailIntake, getEmailIntakeSummary, listEmailIntakes, rejectEmailIntake } from './email-intake-store.mjs';
import { ingestInboundEmail, promoteEmailIntakeToJob, reviewEmailIntake } from './email-intake-service.mjs';
import { receiveResendInbound } from './email-provider-resend.mjs';
import { createWorkflowJob } from './workflow-store.mjs';

function q(url,key){return url.searchParams.get(key)||undefined;}
async function readJson(req){
  const chunks=[];
  let size=0;
  const maxBytes=Number(process.env.EMAIL_INTAKE_MAX_BODY_BYTES||1048576);
  for await(const c of req){ size+=c.length; if(size>maxBytes) throw Object.assign(new Error('Email intake request body is too large'),{statusCode:413}); chunks.push(c); }
  if(!chunks.length) return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Object.assign(new Error('Invalid JSON body'),{statusCode:400});}
}

export async function handleEmailIntakeApi(req,url,{json}){
  const p=decodeURIComponent(url.pathname);

  // Production provider route. It reads the raw body internally for signature verification.
  if(req.method==='POST' && p==='/api/v1/email/inbound'){
    const received=await receiveResendInbound(req);
    if(received.ignored){json(200,received);return true;}
    const result=ingestInboundEmail(received.email);
    json(result.duplicate?200:202,{duplicate:result.duplicate,intake:result.record});
    return true;
  }

  // Development-only endpoint. Never enable this in production.
  if(req.method==='POST' && p==='/api/v1/email-intake/test-ingest'){
    if(process.env.EMAIL_INTAKE_TEST_MODE!=='1') throw Object.assign(new Error('Email intake test mode is disabled'),{statusCode:404});
    const result=ingestInboundEmail(await readJson(req));
    json(result.duplicate?200:202,{duplicate:result.duplicate,intake:result.record});
    return true;
  }

  if(req.method==='GET' && p==='/api/v1/email-intake/summary'){
    json(200,getEmailIntakeSummary());return true;
  }
  if(req.method==='GET' && p==='/api/v1/email-intake'){
    json(200,listEmailIntakes({status:q(url,'status'),from:q(url,'from')}));return true;
  }

  let m=p.match(/^\/api\/v1\/email-intake\/([^/]+)$/);
  if(m && req.method==='GET'){
    const row=getEmailIntake(m[1]);
    json(row?200:404,row||{message:'Email intake not found'});return true;
  }
  if(m && req.method==='PATCH'){
    const body=await readJson(req);
    json(200,reviewEmailIntake(m[1],body.fields||body.candidate?.fields||{},body.reviewedBy||'office'));
    return true;
  }

  m=p.match(/^\/api\/v1\/email-intake\/([^/]+)\/create-job$/);
  if(m && req.method==='POST'){
    const body=await readJson(req);
    const result=promoteEmailIntakeToJob(m[1],{
      createWorkflowJob,
      edits:body.fields||body.edits||{},
      reviewedBy:body.reviewedBy||'office',
    });
    json(result.alreadyCreated?200:201,result);return true;
  }

  m=p.match(/^\/api\/v1\/email-intake\/([^/]+)\/reject$/);
  if(m && req.method==='POST'){
    const body=await readJson(req);
    json(200,rejectEmailIntake(m[1],body.reviewedBy||'office'));return true;
  }

  return false;
}
