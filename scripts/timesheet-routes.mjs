import {
  createTimesheet,
  getTimesheet,
  listTimesheets,
  markTimesheetEmailed,
  reviewTimesheet,
  getTimesheetDraft,
  saveTimesheetDay,
  clockTimesheetDay,
} from './timesheet-store.mjs';
import {
  renderTimesheetPdf,
  renderTimesheetText,
  sendTimesheetEmail,
  timesheetFileBase,
} from './timesheet-output.mjs';

function q(url,key){return url.searchParams.get(key)||undefined;}
function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
}
function sendFile(res,{contentType,filename,body}){
  cors(res);
  res.writeHead(200,{
    'content-type':contentType,
    'content-disposition':`attachment; filename="${filename}"`,
    'cache-control':'no-store',
  });
  res.end(body);
}

export async function handleTimesheetApi(req,res,url,{json,readJson}){
  const p=decodeURIComponent(url.pathname);


  if(req.method==='GET'&&p==='/api/v1/workflow/timesheets/draft'){
    json(200,getTimesheetDraft({
      technicianId:q(url,'technicianId'),
      weekEnding:q(url,'weekEnding'),
    }));
    return true;
  }

  if(req.method==='POST'&&p==='/api/v1/workflow/timesheets/day'){
    json(200,saveTimesheetDay(await readJson(req)));
    return true;
  }

  if(req.method==='POST'&&p==='/api/v1/workflow/timesheets/day/clock'){
    json(200,clockTimesheetDay(await readJson(req)));
    return true;
  }

  if(req.method==='GET'&&p==='/api/v1/workflow/timesheets'){
    json(200,listTimesheets({
      technicianId:q(url,'technicianId'),
      status:q(url,'status'),
      from:q(url,'from'),
      to:q(url,'to'),
    }));
    return true;
  }

  if(req.method==='POST'&&p==='/api/v1/workflow/timesheets'){
    json(201,createTimesheet(await readJson(req)));
    return true;
  }

  let match=p.match(/^\/api\/v1\/workflow\/timesheets\/([^/]+)$/);
  if(match&&req.method==='GET'){
    const item=getTimesheet(match[1]);
    json(item?200:404,item||{message:'Timesheet not found'});
    return true;
  }
  if(match&&req.method==='PATCH'){
    json(200,reviewTimesheet(match[1],await readJson(req)));
    return true;
  }

  match=p.match(/^\/api\/v1\/workflow\/timesheets\/([^/]+)\/export\.(txt|pdf)$/);
  if(match&&req.method==='GET'){
    const item=getTimesheet(match[1]);
    if(!item){json(404,{message:'Timesheet not found'});return true;}
    const base=timesheetFileBase(item);
    if(match[2]==='txt'){
      sendFile(res,{contentType:'text/plain; charset=utf-8',filename:`${base}.txt`,body:renderTimesheetText(item)});
    }else{
      const pdf=await renderTimesheetPdf(item);
      sendFile(res,{contentType:'application/pdf',filename:`${base}.pdf`,body:pdf});
    }
    return true;
  }

  match=p.match(/^\/api\/v1\/workflow\/timesheets\/([^/]+)\/email$/);
  if(match&&req.method==='POST'){
    const item=getTimesheet(match[1]);
    if(!item){json(404,{message:'Timesheet not found'});return true;}
    if(item.status!=='approved'&&item.status!=='emailed'){
      json(409,{message:'Approve the timesheet before emailing it'});
      return true;
    }
    const body=await readJson(req);
    const sent=await sendTimesheetEmail(item,{recipientEmail:body.recipientEmail});
    const updated=markTimesheetEmailed(item.id,{recipientEmail:sent.recipientEmail,emailId:sent.id});
    json(200,{timesheet:updated,email:sent});
    return true;
  }

  return false;
}
