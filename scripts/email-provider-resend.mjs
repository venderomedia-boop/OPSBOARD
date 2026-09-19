/**
 * Production Resend adapter.
 * Requires `resend >= 6.9.2` when enabled in the real OPSBOARD package.
 * It intentionally owns provider-specific verification/retrieval so the
 * rest of email intake remains provider-independent.
 */

let clientPromise;
async function getClient(){
  if(!clientPromise){
    clientPromise=import('resend').then(({Resend})=>{
      if(!process.env.RESEND_API_KEY) throw Object.assign(new Error('RESEND_API_KEY is not configured'),{statusCode:503});
      return new Resend(process.env.RESEND_API_KEY);
    }).catch(error=>{ clientPromise=null; throw error; });
  }
  return clientPromise;
}

async function readRaw(req){
  const chunks=[];
  let size=0;
  const maxBytes=Number(process.env.EMAIL_INTAKE_MAX_BODY_BYTES||1048576);
  for await (const chunk of req){
    size+=chunk.length;
    if(size>maxBytes) throw Object.assign(new Error('Inbound email webhook body is too large'),{statusCode:413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function requiredHeader(req,name){
  const value=req.headers[name];
  if(!value) throw Object.assign(new Error(`Missing ${name} webhook header`),{statusCode:400});
  return Array.isArray(value)?value[0]:String(value);
}

export async function receiveResendInbound(req){
  if(!process.env.RESEND_WEBHOOK_SECRET) throw Object.assign(new Error('RESEND_WEBHOOK_SECRET is not configured'),{statusCode:503});
  const resend=await getClient();
  const payload=await readRaw(req);
  let event;
  try{
    event=resend.webhooks.verify({
      payload,
      headers:{
        'svix-id':requiredHeader(req,'svix-id'),
        'svix-timestamp':requiredHeader(req,'svix-timestamp'),
        'svix-signature':requiredHeader(req,'svix-signature'),
      },
      secret:process.env.RESEND_WEBHOOK_SECRET,
    });
  }catch{
    throw Object.assign(new Error('Invalid inbound email webhook signature'),{statusCode:401});
  }

  if(event.type!=='email.received') return {ignored:true,eventType:event.type};
  const emailId=event.data?.email_id;
  if(!emailId) throw Object.assign(new Error('Inbound email event did not contain email_id'),{statusCode:422});
  const result=await resend.emails.receiving.get(emailId);
  if(result?.error) throw Object.assign(new Error(`Unable to retrieve inbound email: ${result.error.message||'provider error'}`),{statusCode:502});
  const email=result?.data||result;
  const attachments=Array.isArray(email?.attachments)?email.attachments:[];

  return {
    ignored:false,
    email:{
      provider:'resend',
      providerEmailId:emailId,
      messageId:email?.message_id||email?.messageId||'',
      from:event.data?.from||email?.from||'',
      to:event.data?.to||email?.to||[],
      subject:event.data?.subject||email?.subject||'',
      text:email?.text||'',
      html:email?.html||'',
      receivedAt:event.data?.created_at||event.data?.createdAt||new Date().toISOString(),
      attachments:attachments.map((item,index)=>({
        id:item.id||item.attachment_id||`attachment-${index+1}`,
        providerAttachmentId:item.id||item.attachment_id||'',
        filename:item.filename||item.name||`attachment-${index+1}`,
        contentType:item.content_type||item.contentType||'application/octet-stream',
        size:item.size||0,
      })),
    },
  };
}
