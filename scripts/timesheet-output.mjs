import PDFDocument from 'pdfkit';
import { Resend } from 'resend';

function formatDate(value){
  const d=new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime())?String(value||''):new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(d);
}
function hhmm(minutes){
  const total=Math.max(0,Number(minutes)||0);
  const h=Math.floor(total/60),m=total%60;
  return m?`${h}h ${m}m`:`${h}h`;
}
function moneyless(value){return Number(value||0).toFixed(1).replace(/\.0$/,'');}
function safeFileName(value){return String(value||'timesheet').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'timesheet';}

export function renderTimesheetText(sheet){
  const lines=[
    'TIMESHEET & MILEAGE',
    '',
    `Engineer: ${sheet.technicianName}`,
    `Email: ${sheet.technicianEmail||''}`,
    `Week ending: ${formatDate(sheet.weekEnding)}`,
    `Status: ${String(sheet.status||'').toUpperCase()}`,
    '',
    'DATE         START  FINISH  BREAK  HOURS   MILES  NOTES',
    '------------------------------------------------------------',
  ];
  for(const row of sheet.entries||[]){
    const hours=(Number(row.workedMinutes||0)/60).toFixed(2);
    lines.push(`${row.date}   ${row.startTime.padEnd(5)}  ${row.endTime.padEnd(6)}  ${String(row.breakMinutes).padStart(3)}m   ${hours.padStart(5)}   ${String(row.mileageMiles).padStart(5)}  ${row.notes||''}`);
  }
  lines.push(
    '',
    `Total worked: ${hhmm(sheet.totals?.workedMinutes)} (${Number(sheet.totals?.hours||0).toFixed(2)} hours)`,
    `Total mileage: ${moneyless(sheet.totals?.mileageMiles)} miles`,
  );
  if(sheet.reviewNote)lines.push(`Office note: ${sheet.reviewNote}`);
  if(sheet.reviewedBy)lines.push(`Reviewed by: ${sheet.reviewedBy}`);
  return lines.join('\n');
}

export async function renderTimesheetPdf(sheet){
  return await new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:42,info:{Title:`Timesheet - ${sheet.technicianName} - ${sheet.weekEnding}`}});
    const chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    doc.on('error',reject);

    doc.fontSize(18).font('Helvetica-Bold').text('Timesheet & Mileage');
    doc.moveDown(.35);
    doc.fontSize(10).font('Helvetica').fillColor('#475569')
      .text(`${sheet.technicianName} · Week ending ${formatDate(sheet.weekEnding)}`);
    doc.moveDown(1);
    doc.fillColor('#111827');

    const left=42;
    const widths=[78,48,48,48,54,48,190];
    const headers=['Date','Start','Finish','Break','Hours','Miles','Notes'];
    let y=doc.y;
    doc.rect(left,y,510,22).fill('#EAF2FF');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5);
    let x=left+5;
    headers.forEach((label,index)=>{doc.text(label,x,y+7,{width:widths[index]-8});x+=widths[index];});
    y+=22;

    doc.font('Helvetica').fontSize(8.5);
    for(const row of sheet.entries||[]){
      const rowHeight=Math.max(24,doc.heightOfString(row.notes||'',{width:widths[6]-8})+10);
      if(y+rowHeight>760){doc.addPage();y=42;}
      doc.rect(left,y,510,rowHeight).strokeColor('#E2E8F0').stroke();
      x=left+5;
      const values=[
        formatDate(row.date),
        row.startTime,
        row.endTime,
        `${row.breakMinutes}m`,
        (Number(row.workedMinutes||0)/60).toFixed(2),
        moneyless(row.mileageMiles),
        row.notes||'',
      ];
      values.forEach((value,index)=>{doc.fillColor('#334155').text(String(value),x,y+7,{width:widths[index]-8});x+=widths[index];});
      y+=rowHeight;
    }

    doc.y=y+16;
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11)
      .text(`Total hours: ${Number(sheet.totals?.hours||0).toFixed(2)}`)
      .text(`Total mileage: ${moneyless(sheet.totals?.mileageMiles)} miles`);
    if(sheet.reviewNote){
      doc.moveDown(.7).font('Helvetica-Bold').fontSize(9).text('Office note');
      doc.font('Helvetica').fillColor('#475569').text(sheet.reviewNote);
    }
    doc.moveDown(1.2).fillColor('#64748B').font('Helvetica').fontSize(8)
      .text(`Reference: ${sheet.id} · Submitted ${new Date(sheet.submittedAt).toLocaleString('en-GB')}`);

    doc.end();
  });
}

export function timesheetFileBase(sheet){
  return `timesheet-${safeFileName(sheet.technicianName)}-${sheet.weekEnding}`;
}

export async function sendTimesheetEmail(sheet,{recipientEmail}={}){
  const apiKey=String(process.env.RESEND_API_KEY||'').trim();
  const from=String(process.env.TIMESHEET_EMAIL_FROM||process.env.RESEND_FROM_EMAIL||'').trim();
  const to=String(recipientEmail||'').trim();
  if(!apiKey)throw Object.assign(new Error('RESEND_API_KEY is not configured'),{statusCode:503});
  if(!from)throw Object.assign(new Error('TIMESHEET_EMAIL_FROM is not configured'),{statusCode:503});
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))throw Object.assign(new Error('A valid recipient email is required'),{statusCode:422});

  const pdf=await renderTimesheetPdf(sheet);
  const text=renderTimesheetText(sheet);
  const resend=new Resend(apiKey);
  const subject=`Timesheet & mileage · ${sheet.technicianName} · week ending ${formatDate(sheet.weekEnding)}`;
  const result=await resend.emails.send({
    from,
    to:[to],
    subject,
    text,
    html:`<div style="font-family:Arial,sans-serif;color:#0f172a"><h2 style="margin:0 0 12px">Timesheet &amp; Mileage</h2><p><strong>${escapeHtml(sheet.technicianName)}</strong><br>Week ending ${escapeHtml(formatDate(sheet.weekEnding))}</p><p>Total hours: <strong>${Number(sheet.totals?.hours||0).toFixed(2)}</strong><br>Total mileage: <strong>${moneyless(sheet.totals?.mileageMiles)} miles</strong></p><p>The approved PDF timesheet is attached.</p></div>`,
    attachments:[{filename:`${timesheetFileBase(sheet)}.pdf`,content:pdf.toString('base64')}],
  });
  if(result.error)throw Object.assign(new Error(result.error.message||'Could not send timesheet email'),{statusCode:502});
  return{id:result.data?.id||'',recipientEmail:to,subject};
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}
