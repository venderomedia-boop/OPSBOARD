import { renderJobReportPdf, jobReportFileName } from './job-report-output.mjs';

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
}

export async function handleJobReportApi(req,res,url,{json,readJson}){
  const p=decodeURIComponent(url.pathname);
  if(req.method==='POST'&&p==='/api/v1/workflow/job-report/pdf'){
    const snapshot=await readJson(req);
    if(!snapshot?.job?.id){
      json(422,{message:'job.id is required'});
      return true;
    }
    const pdf=await renderJobReportPdf(snapshot);
    cors(res);
    res.writeHead(200,{
      'content-type':'application/pdf',
      'content-disposition':`attachment; filename="${jobReportFileName(snapshot)}"`,
      'content-length':String(pdf.length),
      'cache-control':'no-store',
    });
    res.end(pdf);
    return true;
  }
  return false;
}
