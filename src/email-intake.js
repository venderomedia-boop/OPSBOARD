export const emailIntakeState={rows:[],summary:null,selected:null,filter:'needs_review'};

function esc(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function pct(value){return `${Math.round(Number(value||0)*100)}%`;}
function statusLabel(status){return ({needs_review:'Needs review',ready:'Ready',created:'Created',rejected:'Rejected'})[status]||status;}
function fmtDate(value){if(!value)return 'Not found';const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}

export async function loadEmailIntake(status=emailIntakeState.filter){
  const [rowsRes,summaryRes]=await Promise.all([
    fetch(`/api/v1/email-intake${status?`?status=${encodeURIComponent(status)}`:''}`,{cache:'no-store'}),
    fetch('/api/v1/email-intake/summary',{cache:'no-store'}),
  ]);
  if(!rowsRes.ok)throw new Error(`Email Intake HTTP ${rowsRes.status}`);
  emailIntakeState.rows=await rowsRes.json();
  emailIntakeState.summary=summaryRes.ok?await summaryRes.json():null;
  emailIntakeState.filter=status;
  return emailIntakeState;
}

export function renderEmailIntakePanel(){
  const s=emailIntakeState.summary||{};
  const rows=emailIntakeState.rows||[];
  return `<section class="panel email-intake-panel" id="email-intake">
    <div class="panel-head">
      <div class="panel-title"><div class="panel-title-icon">✉</div><div><h3>Email Intake</h3><p>Turn inbound work orders into validated OPSBOARD jobs.</p></div></div>
      <div class="email-intake-summary"><b>${Number(s.needsReview||0)}</b> need review · <b>${Number(s.ready||0)}</b> ready</div>
    </div>
    <div class="email-intake-tabs">
      ${['needs_review','ready','created','rejected',''].map(key=>`<button class="email-intake-tab ${emailIntakeState.filter===key?'active':''}" data-email-filter="${key}">${key?statusLabel(key):'All'}</button>`).join('')}
    </div>
    <div class="email-intake-list">${rows.length?rows.map(renderEmailIntakeCard).join(''):'<div class="empty-state">No email jobs in this queue.</div>'}</div>
  </section>`;
}

function renderEmailIntakeCard(row){
  const f=row.candidate?.fields||{};
  const problems=[...(row.validation?.errors||[]),...(row.validation?.warnings||[])];
  return `<article class="email-intake-card ${row.status}">
    <div class="email-intake-card-main">
      <div class="email-status-row"><span class="email-status ${row.status}">${esc(statusLabel(row.status))}</span><strong>${pct(row.candidate?.overallConfidence)} confidence</strong></div>
      <h4>${esc(f.customerName||row.email?.subject||'Unidentified request')}</h4>
      <p>${esc(f.serviceType||'Job type not identified')}</p>
      <div class="email-intake-meta"><span>${esc(f.siteName||f.siteAddress||'Site not identified')}</span><span>${esc(f.requestedDate||'Date not identified')}${f.requestedTime?` · ${esc(f.requestedTime)}`:''}</span><span>${esc(f.externalReference?`Ref ${f.externalReference}`:'No reference')}</span></div>
      ${problems.length?`<div class="email-intake-warning">${esc(problems[0].message)}</div>`:''}
    </div>
    <div class="email-intake-card-actions"><button class="panel-action" data-email-open="${esc(row.id)}">${row.status==='created'||row.status==='rejected'?'View':'Review'}</button>${row.status==='ready'?`<button type="button" class="email-create-btn" data-email-create="${esc(row.id)}">Create job</button>`:''}</div>
  </article>`;
}

export function renderEmailIntakeDrawer(row){
  const f=row.candidate?.fields||{};
  const field=(name,label,type='text')=>`<label class="email-field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(f[name]||'')}"></label>`;
  return `<div class="email-drawer">
    <div class="email-source"><strong>${esc(row.email?.subject||'(no subject)')}</strong><span>${esc(row.email?.from||'')} · ${fmtDate(row.email?.receivedAt)}</span></div>
    <div class="email-field-grid">
      ${field('customerName','Customer')}${field('siteName','Site')}${field('siteAddress','Address')}${field('postcode','Postcode')}${field('serviceType','Job type')}${field('externalReference','Work order / reference')}${field('requestedDate','Attendance date','date')}${field('requestedTime','Attendance time','time')}${field('contactName','Contact')}${field('contactPhone','Phone')}
    </div>
    <label class="email-field full"><span>Description</span><textarea name="description">${esc(f.description||'')}</textarea></label>
    <div class="email-original"><h4>Original email</h4><pre>${esc(row.email?.text||'')}</pre></div>
    ${row.status==='created'||row.status==='rejected'
      ? `<div class="email-drawer-actions"><span class="email-terminal-note">${row.status==='created'?`Created as ${esc(row.createdJobId||'job')}`:'Rejected · audit record retained'}</span></div>`
      : `<div class="email-drawer-actions"><button type="button" data-email-save="${esc(row.id)}">Save review</button><button type="button" class="email-create-btn" data-email-create="${esc(row.id)}">Create job</button><button type="button" class="email-reject-btn" data-email-reject="${esc(row.id)}">Reject</button></div>`}
  </div>`;
}

export async function saveEmailReview(id,form){
  const fields=Object.fromEntries(new FormData(form).entries());
  const res=await fetch(`/api/v1/email-intake/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields,reviewedBy:'office'})});
  if(!res.ok)throw new Error((await res.json().catch(()=>({}))).message||`Review HTTP ${res.status}`);
  return res.json();
}
export async function createJobFromEmail(id,fields={}){
  const res=await fetch(`/api/v1/email-intake/${encodeURIComponent(id)}/create-job`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fields,reviewedBy:'office'})});
  if(!res.ok)throw new Error((await res.json().catch(()=>({}))).message||`Create job HTTP ${res.status}`);
  return res.json();
}
export async function rejectEmail(id){
  const res=await fetch(`/api/v1/email-intake/${encodeURIComponent(id)}/reject`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewedBy:'office'})});
  if(!res.ok)throw new Error((await res.json().catch(()=>({}))).message||`Reject HTTP ${res.status}`);
  return res.json();
}

function emailPanelHost(){ return document.querySelector('.kpi-grid'); }
function renderMountedPanel(){
  const existing=document.getElementById('email-intake');
  const html=renderEmailIntakePanel();
  const template=document.createElement('template');
  template.innerHTML=html.trim();
  const next=template.content.firstElementChild;
  if(existing){ existing.replaceWith(next); return next; }
  const host=emailPanelHost();
  if(host){ host.insertAdjacentElement('afterend',next); return next; }
  return null;
}
function ensureEmailNav(){
  const nav=document.querySelector('.topnav');
  if(!nav || nav.querySelector('[data-email-nav]')) return;
  const button=document.createElement('button');
  button.className='nav-link';
  button.type='button';
  button.dataset.emailNav='1';
  button.textContent='Email Intake';
  nav.appendChild(button);
}
function openEmailDrawer(row){
  const title=document.getElementById('drawerTitle');
  const subtitle=document.getElementById('drawerSubtitle');
  const body=document.getElementById('drawerBody');
  const backdrop=document.getElementById('drawerBackdrop');
  if(!title||!subtitle||!body||!backdrop)return;
  title.textContent='Email Intake';
  subtitle.textContent=row.email?.subject||row.id;
  body.innerHTML=`<form id="emailReviewForm">${renderEmailIntakeDrawer(row)}</form>`;
  backdrop.classList.add('open');
}
function closeEmailDrawer(){ document.getElementById('drawerBackdrop')?.classList.remove('open'); }
async function refreshEmailPanel(status=emailIntakeState.filter){
  await loadEmailIntake(status);
  renderMountedPanel();
}
function formFields(){
  const form=document.getElementById('emailReviewForm');
  return form?Object.fromEntries(new FormData(form).entries()):{};
}
let delegated=false;
function bindEmailDelegation(){
  if(delegated)return;
  delegated=true;
  document.addEventListener('click',async event=>{
    const target=event.target.closest('button');
    if(!target)return;
    try{
      if(target.dataset.emailNav){
        document.querySelectorAll('.nav-link').forEach(x=>x.classList.toggle('active',x===target));
        document.getElementById('email-intake')?.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      if('emailFilter' in target.dataset){
        await refreshEmailPanel(target.dataset.emailFilter);
        document.getElementById('email-intake')?.scrollIntoView({block:'start'});
        return;
      }
      if(target.dataset.emailOpen){
        const row=emailIntakeState.rows.find(x=>x.id===target.dataset.emailOpen);
        if(row)openEmailDrawer(row);
        return;
      }
      if(target.dataset.emailSave){
        const form=document.getElementById('emailReviewForm');
        if(form)await saveEmailReview(target.dataset.emailSave,form);
        await refreshEmailPanel();
        return;
      }
      if(target.dataset.emailCreate){
        const inDrawer=Boolean(target.closest('#emailReviewForm'));
        await createJobFromEmail(target.dataset.emailCreate,inDrawer?formFields():{});
        if(inDrawer)closeEmailDrawer();
        await refreshEmailPanel();
        return;
      }
      if(target.dataset.emailReject){
        await rejectEmail(target.dataset.emailReject);
        closeEmailDrawer();
        await refreshEmailPanel();
      }
    }catch(error){
      console.error('Email Intake:',error);
      const body=document.getElementById('drawerBody');
      if(body && target.closest('#emailReviewForm')) body.insertAdjacentHTML('afterbegin',`<div class="email-intake-error">${esc(error.message||'Email Intake action failed')}</div>`);
    }
  });
}
let mounting=false;
async function mountEmailIntake(){
  if(mounting)return;
  mounting=true;
  try{
    ensureEmailNav();
    if(!emailIntakeState.summary){
      try{await loadEmailIntake();}catch(error){console.error('Email Intake:',error);}
    }
    if(emailPanelHost() && !document.getElementById('email-intake')) renderMountedPanel();
  }finally{mounting=false;}
}
export function initialiseEmailIntakeUI(){
  bindEmailDelegation();
  mountEmailIntake();
  const app=document.getElementById('app');
  if(app){
    const observer=new MutationObserver(()=>queueMicrotask(mountEmailIntake));
    observer.observe(app,{childList:true,subtree:true});
  }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialiseEmailIntakeUI,{once:true});
else initialiseEmailIntakeUI();
