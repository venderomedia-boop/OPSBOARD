const STEPS = [
  {
    kicker:'1 · Job request arrives',
    title:'Start with the email your office already receives',
    copy:'A customer or FM company sends a work order exactly as they do today. OPSBOARD captures the request without forcing the customer into a separate portal.',
  },
  {
    kicker:'2 · Details extracted',
    title:'Turn unstructured email into usable job data',
    copy:'OPSBOARD pulls out the customer, site, service type, attendance window, contact and work-order reference, then shows confidence before anything becomes a live job.',
  },
  {
    kicker:'3 · Office review',
    title:'Keep a human in control where it matters',
    copy:'Low-confidence or incomplete fields stay in review. The office confirms or edits the details instead of silently creating the wrong job.',
  },
  {
    kicker:'4 · Create job',
    title:'One click promotes the request into the normal workflow',
    copy:'The reviewed intake becomes a standard OPSBOARD job with the original email and source reference retained for auditability.',
  },
  {
    kicker:'5 · Operational handoff',
    title:'Email stops being a separate workflow',
    copy:'The job now follows the same dispatch, diary, engineer and compliance process as every other job. No re-keying and no second system to chase.',
  },
];

const sample = {
  sender:'dispatch@trustedfm.co.uk',
  subject:'Work Order 473923 · Emergency Lighting Test',
  body:[
    'Customer: Travelodge',
    'Site: Manchester Central',
    'Address: 27 Dale Street, Manchester M1 1JA',
    'Job Type: Emergency Lighting Test',
    'Attendance: 22/09/2026',
    'Time: 09:00',
    'Contact: Sarah Williams',
    'Telephone: 0161 555 0199',
    'Work Order: 473923',
  ],
};

let step = 0;
let reviewed = false;
let created = false;

function esc(value=''){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function root(){return document.getElementById('emailIntakeDemo');}
function stepButton(item,index){
  const active=index===step;
  const complete=index<step || created && index===4;
  return `<button type="button" class="eid-step ${active?'active':''} ${complete?'complete':''}" data-eid-step="${index}"><span>${complete?'✓':index+1}</span><b>${esc(item.title.split(' ').slice(0,4).join(' '))}</b></button>`;
}
function rawEmail(){
  return `<div class="eid-email-card">
    <div class="eid-email-head"><span class="eid-avatar">TF</span><div><b>Trusted FM Dispatch</b><small>${esc(sample.sender)}</small></div><span class="eid-tag">Inbound email</span></div>
    <div class="eid-subject">${esc(sample.subject)}</div>
    <pre>${esc(sample.body.join('\n'))}</pre>
  </div>`;
}
function field(label,value,confidence='98%'){
  return `<div class="eid-field"><span>${esc(label)}</span><b>${esc(value)}</b><small>${confidence} confidence</small></div>`;
}
function extraction(){
  return `<div class="eid-extract-grid">
    ${field('Customer','Travelodge')}
    ${field('Site','Manchester Central')}
    ${field('Service','Emergency Lighting Test','96%')}
    ${field('Attendance','22 Sep 2026 · 09:00','95%')}
    ${field('Contact','Sarah Williams','91%')}
    ${field('Work order','473923','99%')}
  </div><div class="eid-proof"><b>Why this matters</b><span>The office sees what OPSBOARD understood before the request moves any further.</span></div>`;
}
function review(){
  return `<div class="eid-review">
    <div class="eid-review-top"><span class="eid-status needs">Needs review</span><b>One field requires confirmation</b></div>
    <div class="eid-review-grid">
      <label><span>Customer</span><input value="Travelodge" readonly></label>
      <label><span>Site</span><input value="Manchester Central" readonly></label>
      <label><span>Attendance time</span><input value="09:00" readonly></label>
      <label><span>Contact phone</span><input value="0161 555 0199" readonly></label>
      <label class="wide"><span>Service description</span><input value="Emergency Lighting Test" readonly></label>
      <label class="wide warning"><span>Office confirmation</span><input value="${reviewed?'Confirmed from work order':'Check service category'}" readonly></label>
    </div>
    <button type="button" class="eid-primary" data-eid-review ${reviewed?'disabled':''}>${reviewed?'✓ Details confirmed':'Confirm extracted details'}</button>
  </div>`;
}
function createJob(){
  return `<div class="eid-create-card">
    <div class="eid-create-head"><span class="eid-status ${created?'created':'ready'}">${created?'Created':'Ready'}</span><span>Work Order 473923</span></div>
    <h4>Travelodge · Manchester Central</h4>
    <p>Emergency Lighting Test · 22 Sep 2026 · 09:00</p>
    <div class="eid-create-meta"><span>Source: Email</span><span>Reference: 473923</span><span>Original request retained</span></div>
    <button type="button" class="eid-primary" data-eid-create ${created?'disabled':''}>${created?'✓ Created as J-DEMO-2014':'Create job'}</button>
  </div>`;
}
function handoff(){
  const nodes=[
    ['Email','Request captured','done'],
    ['OPSBOARD','Validated job','done'],
    ['Engineer Diary','Scheduled for 09:00',created?'done':''],
    ['Field team','Ready for dispatch',created?'done':''],
  ];
  return `<div class="eid-flow">${nodes.map(([a,b,t],i)=>`<div class="eid-flow-node ${t}"><span>${t?'✓':i+1}</span><div><b>${a}</b><small>${b}</small></div></div>${i<nodes.length-1?'<div class="eid-flow-line"></div>':''}`).join('')}</div>
    <div class="eid-outcome"><div><small>Manual re-keying</small><strong>Removed</strong></div><div><small>Source traceability</small><strong>Retained</strong></div><div><small>Workflow handoff</small><strong>One system</strong></div></div>`;
}
function visual(){
  if(step===0)return rawEmail();
  if(step===1)return extraction();
  if(step===2)return review();
  if(step===3)return createJob();
  return handoff();
}
function render(){
  const el=root();
  if(!el)return;
  const info=STEPS[step];
  el.innerHTML=`<div class="eid-backdrop" data-eid-close></div>
    <section class="eid-shell" role="dialog" aria-modal="true" aria-labelledby="eidTitle">
      <header class="eid-header">
        <div><span class="eid-eyebrow">Guided Email Intake demo</span><h2 id="eidTitle">From inbox to scheduled work</h2><p>Sample data only · no live jobs or emails are changed.</p></div>
        <div class="eid-header-actions"><button type="button" data-eid-reset>Restart demo</button><button type="button" class="eid-close" data-eid-close aria-label="Close demo">×</button></div>
      </header>
      <div class="eid-body">
        <nav class="eid-steps">${STEPS.map(stepButton).join('')}</nav>
        <div class="eid-stage">
          <div class="eid-copy"><span class="eid-kicker">${esc(info.kicker)}</span><h3>${esc(info.title)}</h3><p>${esc(info.copy)}</p>
            <div class="eid-story"><b>Sales story</b><span>${step===0?'Keep the customer’s existing behaviour. Change the office workflow behind it.':step===1?'The system turns an email into structured operational data before anyone starts typing it into another screen.':step===2?'Automation handles the repetitive work while the office keeps control of exceptions.':step===3?'The intake is promoted into the same canonical job workflow rather than becoming a side database.':'This is the key point: email becomes just another intake channel feeding dispatch, diary and field execution.'}</span></div>
          </div>
          <div class="eid-visual">${visual()}</div>
        </div>
      </div>
      <footer class="eid-footer">
        <button type="button" class="eid-secondary" data-eid-back ${step===0?'disabled':''}>Back</button>
        <div><button type="button" class="eid-secondary" data-eid-live>View live Email Intake</button>
        ${step<STEPS.length-1?'<button type="button" class="eid-primary" data-eid-next>Next step</button>':'<button type="button" class="eid-primary" data-eid-close>Finish demo</button>'}</div>
      </footer>
    </section>`;
}
export function openEmailIntakeDemo(initialStep=0){
  step=Math.max(0,Math.min(STEPS.length-1,Number(initialStep)||0));
  reviewed=false; created=false;
  let el=root();
  if(!el){el=document.createElement('div');el.id='emailIntakeDemo';document.body.appendChild(el);}
  el.classList.add('open');render();
}
export function closeEmailIntakeDemo(){root()?.remove();}
function onClick(event){
  const target=event.target.closest('button,[data-eid-close]');
  if(!target)return;
  if(target.matches('[data-email-demo]')) return openEmailIntakeDemo();
  if(target.matches('[data-eid-close]')) return closeEmailIntakeDemo();
  if(target.matches('[data-eid-reset]')) return openEmailIntakeDemo();
  if(target.matches('[data-eid-step]')){step=Number(target.dataset.eidStep);return render();}
  if(target.matches('[data-eid-back]')){step=Math.max(0,step-1);return render();}
  if(target.matches('[data-eid-next]')){step=Math.min(STEPS.length-1,step+1);return render();}
  if(target.matches('[data-eid-review]')){reviewed=true;return render();}
  if(target.matches('[data-eid-create]')){created=true;return render();}
  if(target.matches('[data-eid-live]')){closeEmailIntakeDemo();document.getElementById('email-intake')?.scrollIntoView({behavior:'smooth',block:'start'});}
}
document.addEventListener('click',onClick);
const params=new URLSearchParams(location.search);
if(params.get('demo')==='email-intake'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>openEmailIntakeDemo(),{once:true});
  else openEmailIntakeDemo();
}
