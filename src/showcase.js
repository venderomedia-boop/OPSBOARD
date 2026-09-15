const OPS_DEMO_KEY = 'ops-hub-showcase-v1';
const REOPEN_KEY = 'ops-hub-reopen';
const DEMO_NOW = new Date('2026-09-15T14:30:00+01:00');
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

const jobMeta = [
  { id:'J-1048', apiId:null, customer:'Riverside Dental Practice', service:'Heat Pump Inspection', status:'completed', owner:'James', sub:false, scheduledEnd:'2026-09-15T09:30:00+01:00', completedAt:'2026-09-15T09:42:00+01:00', invoiceStatus:'pending', value:295, handoverMissing:true },
  { id:'J-1047', apiId:null, customer:'Northgate Retail Park', service:'PPM HVAC Visit', status:'completed', owner:'Alicia', sub:false, scheduledEnd:'2026-09-15T10:00:00+01:00', completedAt:'2026-09-15T10:12:00+01:00', invoiceStatus:'pending', value:480, handoverMissing:false },
  { id:'J-1046', apiId:'job-1', customer:'Meridian Office Park', service:'Water Hygiene Monthly Visit', status:'completed', owner:'Martin', sub:false, scheduledEnd:'2026-09-15T10:45:00+01:00', completedAt:'2026-09-15T11:02:00+01:00', invoiceStatus:'pending', value:365, handoverMissing:false },
  { id:'J-1033', apiId:null, customer:'Hillside Care Centre', service:'Boiler Service', status:'completed', owner:'James', sub:false, scheduledEnd:'2026-09-10T13:00:00+01:00', completedAt:'2026-09-10T13:15:00+01:00', invoiceStatus:'pending', value:1380, handoverMissing:true },
  { id:'J-1038', apiId:null, customer:'Kingston Pharmacy Group', service:'AC Remedial Works', status:'completed', owner:'Alicia', sub:false, scheduledEnd:'2026-09-12T14:00:00+01:00', completedAt:'2026-09-12T14:10:00+01:00', invoiceStatus:'pending', value:940, handoverMissing:false },
  { id:'J-1041', apiId:null, customer:'Beacon Student Living', service:'Ventilation Repair', status:'completed', owner:'SUB · Apex M&E', sub:true, scheduledEnd:'2026-09-13T12:00:00+01:00', completedAt:'2026-09-13T13:10:00+01:00', invoiceStatus:'pending', value:310, handoverMissing:true },
  { id:'J-1051', apiId:null, customer:'Central Foods Distribution', service:'Cold Room Breakdown', status:'in_progress', owner:'Martin', sub:false, scheduledEnd:'2026-09-15T12:30:00+01:00', completedAt:null, invoiceStatus:null, value:850, handoverMissing:false },
  { id:'J-1052', apiId:'job-emergency-1', customer:'Arden House', service:'Emergency Lighting Test', status:'en_route', owner:'SUB · BrightSpark', sub:true, scheduledEnd:'2026-09-15T13:30:00+01:00', completedAt:null, invoiceStatus:null, value:420, handoverMissing:false },
  { id:'J-1053', apiId:null, customer:'Oakwood Medical Centre', service:'AHU Filter Change', status:'not_started', owner:'Alicia', sub:false, scheduledEnd:'2026-09-15T13:45:00+01:00', completedAt:null, invoiceStatus:null, value:260, handoverMissing:false },
  { id:'J-1054', apiId:null, customer:'Riverside Dental Practice', service:'Reactive Callout', status:'scheduled', owner:'James', sub:false, scheduledEnd:'2026-09-15T16:30:00+01:00', completedAt:null, invoiceStatus:null, value:520, handoverMissing:false },
  { id:'J-1055', apiId:'job-7', customer:'Meridian Office Park', service:'Water Hygiene Compliance Visit', status:'scheduled', owner:'Martin', sub:false, scheduledEnd:'2026-09-15T19:45:00+01:00', completedAt:null, invoiceStatus:null, value:450, handoverMissing:false },
];

const subcontractorBase = [
  { name:'Apex M&E', active:6, pending:3, response:'4.2h', status:'On track' },
  { name:'BrightSpark Electrical', active:4, pending:2, response:'6.1h', status:'Attention' },
  { name:'NorthWest HVAC Services', active:3, pending:0, response:'1.8h', status:'On track' },
  { name:'Rapid Mechanical Ltd', active:2, pending:1, response:'3.5h', status:'On track' },
];

let activeFormDetail = null;
let activeComplianceOverview = null;
let workspaceTab = 'jobs';

function readDemoState() {
  try {
    return { invoiced:[], handoverResolved:[], subPending:{}, notes:{}, ...(JSON.parse(sessionStorage.getItem(OPS_DEMO_KEY) || '{}')) };
  } catch {
    return { invoiced:[], handoverResolved:[], subPending:{}, notes:{} };
  }
}

function writeDemoState(next) {
  sessionStorage.setItem(OPS_DEMO_KEY, JSON.stringify(next));
  enhanceSurface();
}

function ageDays(date) {
  return date ? Math.max(0, (DEMO_NOW - new Date(date)) / 864e5) : 0;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function drawerEls() {
  return {
    backdrop: document.getElementById('drawerBackdrop'),
    title: document.getElementById('drawerTitle'),
    subtitle: document.getElementById('drawerSubtitle'),
    body: document.getElementById('drawerBody'),
  };
}

function openShowcaseDrawer(title, subtitle, html, wide = true) {
  const { backdrop, title: t, subtitle: s, body } = drawerEls();
  if (!backdrop || !t || !s || !body) return;
  t.textContent = title;
  s.textContent = subtitle || '';
  body.innerHTML = html;
  backdrop.classList.add('open');
  backdrop.querySelector('.drawer')?.classList.toggle('drawer-wide', wide);
}

function toast(message, tone = 'success') {
  let el = document.getElementById('showcaseToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'showcaseToast';
    document.body.appendChild(el);
  }
  el.className = `showcase-toast ${tone}`;
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { cache:'no-store', headers:{ 'Content-Type':'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function getOverview() {
  activeComplianceOverview = await fetchJson('/api/v1/compliance/overview');
  return activeComplianceOverview;
}

function displayJob(job) {
  const st = readDemoState();
  const status = st.statusOverrides?.[job.id] || job.status;
  const invoiceStatus = st.invoiced.includes(job.id) ? 'sent' : job.invoiceStatus;
  const handoverMissing = job.handoverMissing && !st.handoverResolved.includes(job.id);
  return { ...job, status, invoiceStatus, handoverMissing };
}

function pendingWip() {
  return jobMeta.map(displayJob).filter(j => j.status === 'completed' && j.invoiceStatus === 'pending');
}

function updateOperationalSurface() {
  const st = readDemoState();
  const cards = [...document.querySelectorAll('.kpi-card')];
  const wip = pendingWip();
  const totalWip = wip.reduce((s,j) => s + j.value, 0);
  const avgAge = wip.length ? wip.reduce((s,j) => s + ageDays(j.completedAt), 0) / wip.length : 0;
  const oldest = wip.length ? Math.max(...wip.map(j => ageDays(j.completedAt))) : 0;
  const handoverCount = jobMeta.map(displayJob).filter(j => j.handoverMissing).length;
  if (cards[0]) { cards[0].querySelector('.kpi-value')?.replaceChildren(document.createTextNode(money.format(totalWip))); cards[0].dataset.demoAction='wip'; }
  if (cards[1]) { cards[1].querySelector('.kpi-value')?.replaceChildren(document.createTextNode(`${avgAge.toFixed(1)}d`)); const d=cards[1].querySelector('.kpi-detail'); if(d)d.textContent=`Oldest ${oldest.toFixed(1)}d`; cards[1].dataset.demoAction='wip'; }
  if (cards[2]) { cards[2].querySelector('.kpi-value')?.replaceChildren(document.createTextNode(String(handoverCount))); cards[2].dataset.demoAction='handover'; }
  if (cards[3]) cards[3].dataset.demoAction='exceptions';
  if (cards[4]) cards[4].dataset.demoAction='compliance';
  cards.forEach(card => { card.classList.add('showcase-clickable'); card.tabIndex=0; card.setAttribute('role','button'); });
  const wipTotal = document.querySelector('.wip-total strong');
  if (wipTotal) wipTotal.textContent = money.format(totalWip);
  document.querySelectorAll('.exceptions-panel tbody tr').forEach(row => {
    const text = row.textContent || '';
    const job = jobMeta.find(j => text.includes(j.id));
    if (!job) return;
    const hideBilling = st.invoiced.includes(job.id) && /billing|not yet invoiced/i.test(text);
    const hideHandover = st.handoverResolved.includes(job.id) && /handover|evidence/i.test(text);
    row.classList.toggle('showcase-resolved-row', hideBilling || hideHandover);
  });
  document.querySelectorAll('.sub-table tbody tr').forEach(row => {
    const name = row.querySelector('td')?.textContent?.trim();
    if (!name || st.subPending[name] === undefined) return;
    const cells = row.querySelectorAll('td');
    if (cells[2]) { cells[2].textContent = String(st.subPending[name]); cells[2].classList.toggle('age-hot', st.subPending[name] > 0); }
  });
}

function injectShowcasePrompts() {
  const prompts = [
    ['.exceptions-panel .panel-body','Investigate an exception, then resolve its handover or billing blocker.','exceptions'],
    ['.wip-panel .panel-body','Open the WIP queue and move completed work through to invoice.','wip'],
    ['.compliance-panel .panel-body','Open a live compliance job, complete a dynamic form, and watch status update.','compliance'],
    ['.sub-panel .panel-body','Open subcontractor actions and clear an outstanding handover.','subcontractors'],
  ];
  prompts.forEach(([selector, text, action]) => {
    const body = document.querySelector(selector);
    if (!body || body.querySelector(`.showcase-prompt[data-demo-action="${action}"]`)) return;
    const el = document.createElement('button');
    el.className='showcase-prompt';
    el.dataset.demoAction=action;
    el.innerHTML=`<span class="showcase-prompt-dot"></span><span><b>Interactive demo</b>${escapeHtml(text)}</span><span class="showcase-prompt-arrow">→</span>`;
    body.appendChild(el);
  });
}

function enhanceSurface() {
  updateOperationalSurface();
  injectShowcasePrompts();
}

function jobActions(job) {
  const parts = [];
  if (job.status === 'completed' && job.invoiceStatus === 'pending') parts.push(`<button class="showcase-btn primary" data-demo-invoice="${job.id}">Mark invoice sent</button>`);
  if (job.handoverMissing) parts.push(`<button class="showcase-btn" data-demo-handover="${job.id}">Add handover evidence</button>`);
  if (job.apiId) parts.push(`<button class="showcase-btn" data-demo-compliance-job="${job.apiId}">Open required forms</button>`);
  parts.push(`<button class="showcase-btn ghost" data-demo-note="${job.id}">Add job note</button>`);
  return parts.join('');
}

function openInteractiveJob(id) {
  const raw = jobMeta.find(j => j.id === id);
  if (!raw) return;
  const job = displayJob(raw);
  const st = readDemoState();
  const note = st.notes?.[job.id];
  openShowcaseDrawer(`${job.id} · ${job.customer}`, job.service, `
    <div class="showcase-status-strip"><span class="showcase-status ${job.status}">${escapeHtml(job.status.replaceAll('_',' '))}</span><span>${money.format(job.value)}</span><span>${escapeHtml(job.owner)}</span></div>
    <div class="detail-grid showcase-detail-grid">
      <div class="detail"><span>Invoice</span><b>${escapeHtml(job.invoiceStatus || 'Not applicable')}</b></div><div class="detail"><span>Handover</span><b>${job.handoverMissing ? 'Evidence incomplete' : 'Complete'}</b></div>
      <div class="detail"><span>Planned finish</span><b>${new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(job.scheduledEnd))}</b></div><div class="detail"><span>Job owner</span><b>${escapeHtml(job.owner)}</b></div>
    </div>
    <div class="showcase-actions">${jobActions(job)}</div>
    ${note ? `<div class="showcase-note"><b>Latest office note</b><span>${escapeHtml(note)}</span></div>` : ''}
    <div class="showcase-story"><h4>Why this matters</h4><p>${job.invoiceStatus === 'pending' ? 'The work is operationally complete but cash conversion is still blocked.' : 'The billing blocker has been cleared.'} ${job.handoverMissing ? 'Handover evidence is also incomplete, creating a second exception on the same job.' : ''}</p></div>
  `);
}

function openJobsWorkspace(filter = 'all') {
  const rows = jobMeta.map(displayJob).filter(j => filter === 'all' || j.status === filter);
  openShowcaseDrawer('Jobs','Live operational drill-down',`<div class="showcase-toolbar"><div class="showcase-segmented">${['all','completed','in_progress','en_route','scheduled'].map(v=>`<button class="${filter===v?'active':''}" data-demo-jobs-filter="${v}">${v.replaceAll('_',' ')}</button>`).join('')}</div></div><div class="showcase-list">${rows.map(j=>`<button class="showcase-job-row" data-demo-job="${j.id}"><span><b>${j.id} · ${escapeHtml(j.customer)}</b><small>${escapeHtml(j.service)}</small></span><span class="showcase-status ${j.status}">${j.status.replaceAll('_',' ')}</span><strong>${money.format(j.value)}</strong><span>→</span></button>`).join('')}</div>`);
}

function operationalExceptions() {
  const out = [];
  jobMeta.map(displayJob).forEach(j => {
    if (['in_progress','en_route','not_started'].includes(j.status) && new Date(j.scheduledEnd) < DEMO_NOW) out.push({ job:j, risk:'Scheduling', severity:'high', issue:`Planned finish passed; job is ${j.status.replaceAll('_',' ')}` });
    if (j.handoverMissing) out.push({ job:j, risk:'Handover', severity:ageDays(j.completedAt)>2?'critical':'high', issue:'Required handover evidence is incomplete' });
    if (j.status==='completed' && j.invoiceStatus==='pending') out.push({ job:j, risk:'Billing', severity:ageDays(j.completedAt)>=3?'critical':ageDays(j.completedAt)>=1?'high':'medium', issue:`${money.format(j.value)} completed work not yet invoiced` });
  });
  return out;
}

async function openExceptionsWorkspace(filter='All') {
  let compliance = [];
  try {
    const o = await getOverview();
    const formMap = new Map(o.formTypes.map(f=>[f.id,f.name]));
    const jobMap = new Map(o.jobs.map(j=>[j.id,j]));
    const groups = new Map();
    o.formInstances.forEach(i=>{ const k=`${i.jobId}:${i.formTypeId}`; if(!groups.has(k))groups.set(k,[]); groups.get(k).push(i); });
    groups.forEach((instances,key)=>{ const incomplete=instances.filter(i=>i.status!=='completed'); if(!incomplete.length)return; const [jobId,formTypeId]=key.split(':'); const apiJob=jobMap.get(jobId); const displayId=apiJob?.displayId || jobId; const fallback={id:displayId,apiId:jobId,customer:apiJob?.customer||'Compliance job',service:apiJob?.serviceType||'Compliance visit',status:apiJob?.status||'scheduled',owner:'Office',sub:false,scheduledEnd:DEMO_NOW.toISOString(),completedAt:null,invoiceStatus:null,value:0,handoverMissing:false}; const found=jobMeta.find(j=>j.id===displayId); const job=displayJob(found || fallback); compliance.push({job,risk:'Compliance',severity:job.status==='completed'?'critical':'medium',issue:`${formMap.get(formTypeId)||formTypeId}: ${instances.length-incomplete.length}/${instances.length} complete`}); });
  } catch {}
  const all = [...operationalExceptions(), ...compliance];
  const rows = all.filter(e=>filter==='All'||e.risk===filter);
  openShowcaseDrawer('Exception Control',`${all.length} live operational exceptions`,`<div class="showcase-segmented showcase-filter">${['All','Scheduling','Handover','Billing','Compliance'].map(v=>`<button class="${filter===v?'active':''}" data-demo-exception-filter="${v}">${v}</button>`).join('')}</div><div class="showcase-list">${rows.map(e=>`<button class="showcase-exception-row" data-demo-job="${e.job.id}"><span class="showcase-severity ${e.severity}"></span><span><b>${e.job.id} · ${escapeHtml(e.job.customer)}</b><small>${escapeHtml(e.issue)}</small></span><span class="risk-chip ${e.risk.toLowerCase()}">${e.risk}</span><span>→</span></button>`).join('') || '<div class="showcase-empty">No open exceptions in this category.</div>'}</div>`);
}

function openWipWorkspace() {
  const wip = pendingWip();
  const total = wip.reduce((s,j)=>s+j.value,0);
  openShowcaseDrawer('Job to Cash','Completed work waiting to become cash',`<div class="showcase-workspace-kpis"><div><small>Unbilled WIP</small><strong>${money.format(total)}</strong></div><div><small>Jobs awaiting invoice</small><strong>${wip.length}</strong></div><div><small>Oldest</small><strong>${wip.length?Math.max(...wip.map(j=>ageDays(j.completedAt))).toFixed(1):'0.0'}d</strong></div></div><div class="showcase-list">${wip.map(j=>`<div class="showcase-wip-row"><button data-demo-job="${j.id}"><span><b>${j.id} · ${escapeHtml(j.customer)}</b><small>${escapeHtml(j.service)} · completed ${ageDays(j.completedAt).toFixed(1)}d ago</small></span></button><strong>${money.format(j.value)}</strong><button class="showcase-btn small primary" data-demo-invoice="${j.id}">Mark invoiced</button></div>`).join('') || '<div class="showcase-empty">No completed work is waiting for invoice.</div>'}</div><div class="showcase-story"><h4>Demo story</h4><p>Use this queue to show how Ops Hub exposes completed work that has not yet converted into an invoice. Marking a job invoiced immediately removes it from this demo queue and reduces the WIP KPI.</p></div>`);
}

function subCurrent(row) { const st = readDemoState(); return { ...row, pending: st.subPending[row.name] ?? row.pending }; }
function openSubcontractorWorkspace() {
  const rows = subcontractorBase.map(subCurrent);
  openShowcaseDrawer('Subcontractor Coordination','Outstanding actions across third-party teams',`<div class="showcase-list">${rows.map((s,i)=>`<div class="showcase-sub-row"><span><b>${escapeHtml(s.name)}</b><small>${s.active} active jobs · avg response ${s.response}</small></span><span class="showcase-status ${s.pending?'attention':'completed'}">${s.pending} pending</span>${s.pending?`<button class="showcase-btn small" data-demo-sub-complete="${i}">Complete one action</button>`:'<span class="showcase-done">✓ Clear</span>'}<button class="showcase-btn small ghost" data-demo-sub-chase="${i}">Send chase</button></div>`).join('')}</div><div class="showcase-story"><h4>What this demonstrates</h4><p>Subcontractor work is visible in the same operational control layer instead of disappearing into calls, WhatsApp threads and email chains.</p></div>`);
}

async function complianceCounts(overview) { const total=overview.formInstances.length; const completed=overview.formInstances.filter(i=>i.status==='completed').length; return {total,completed,pct:total?Math.round(completed/total*100):0}; }
async function openComplianceWorkspace(tab = workspaceTab) {
  workspaceTab = tab;
  let overview;
  try { overview = await getOverview(); }
  catch (error) { openShowcaseDrawer('Compliance Control','Shared compliance API',`<div class="showcase-error">${escapeHtml(error.message)}</div>`); return; }
  const counts = await complianceCounts(overview);
  openShowcaseDrawer('Compliance Control','Live data shared with the engineer workflow and Dispatch Board',`<div class="showcase-workspace-kpis"><div><small>Completion</small><strong>${counts.pct}%</strong></div><div><small>Form types</small><strong>${overview.formTypes.length}</strong></div><div><small>Form instances</small><strong>${overview.formInstances.length}</strong></div></div><div class="showcase-tabs"><button class="${tab==='jobs'?'active':''}" data-demo-compliance-tab="jobs">Jobs & forms</button><button class="${tab==='catalogue'?'active':''}" data-demo-compliance-tab="catalogue">Form catalogue</button><button class="${tab==='studio'?'active':''}" data-demo-compliance-tab="studio">Form Studio</button></div><div id="showcaseComplianceContent">${renderComplianceTab(overview,tab)}</div>`, true);
}

function renderComplianceTab(o, tab) {
  if (tab === 'catalogue') return `<div class="showcase-list">${o.formTypes.map(f=>`<div class="showcase-catalogue-row"><span><b>${escapeHtml(f.name)}</b><small>${escapeHtml(f.category.replaceAll('_',' '))} · ${escapeHtml(f.frequency)} · ${escapeHtml(f.regulatoryTag||'No regulatory tag')}</small></span><span class="showcase-version">v${f.currentVersion}</span></div>`).join('')}</div><button class="showcase-btn primary showcase-full" data-demo-compliance-tab="studio">Create a dynamic form</button>`;
  if (tab === 'studio') return renderFormStudio(o);
  const formNames = new Map(o.formTypes.map(f=>[f.id,f.name])); const templateNames = new Map(o.jobTemplates.map(t=>[t.id,t.name]));
  return `<div class="showcase-list">${o.jobs.filter(j=>j.siteId&&j.jobTemplateId).map(j=>{ const inst=o.formInstances.filter(i=>i.jobId===j.id); const done=inst.filter(i=>i.status==='completed').length; return `<button class="showcase-compliance-job" data-demo-compliance-job="${j.id}"><span><b>${escapeHtml(j.displayId||j.id)} · ${escapeHtml(j.customer)}</b><small>${escapeHtml(templateNames.get(j.jobTemplateId)||j.serviceType)} · ${[...new Set(inst.map(i=>formNames.get(i.formTypeId)||i.formTypeId))].join(', ')}</small></span><span class="showcase-progress"><i style="width:${inst.length?Math.round(done/inst.length*100):0}%"></i></span><strong>${done}/${inst.length}</strong><span>→</span></button>`; }).join('')}</div>`;
}

function renderFormStudio(o) {
  const job = o.jobs.find(j=>j.id==='job-7');
  return `<div class="showcase-studio"><div class="showcase-story"><h4>Dynamic Form Studio</h4><p>Create a safe schema from configuration, optionally attach it to the quarterly compliance demo job, then open it exactly as an engineer would.</p></div><div class="showcase-form-grid"><label><span>Form name</span><input id="studioName" value="Outlet Condition Check" /></label><label><span>Category</span><select id="studioCategory"><option value="water_hygiene">Water hygiene</option><option value="emergency_lighting">Emergency lighting</option><option value="general">General compliance</option></select></label><label><span>Frequency</span><select id="studioFrequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="per_visit">Per visit</option></select></label><label><span>Builder type</span><select id="studioKind"><option value="asset_checklist">Asset pass/fail checklist</option><option value="asset_matrix">Numeric asset matrix</option><option value="fields">Simple fields</option></select></label><label><span>Asset type</span><select id="studioAsset"><option value="tap">Tap / outlet</option><option value="shower">Shower</option><option value="luminaire">Luminaire</option></select></label><label><span>Regulatory tag</span><input id="studioReg" value="Client standard" /></label></div><label class="showcase-check"><input type="checkbox" id="studioAttach" ${job?'checked':''}/><span>Attach to ${escapeHtml(job?.displayId||'demo job')} so it becomes immediately testable</span></label><button class="showcase-btn primary showcase-full" data-demo-create-form>Create form & attach</button><div class="showcase-helper">The builder deliberately blocks schema patterns the current engineer renderer cannot safely store.</div></div>`;
}

async function createStudioForm() {
  const name = document.getElementById('studioName')?.value.trim(); const category=document.getElementById('studioCategory')?.value; const frequency=document.getElementById('studioFrequency')?.value; const kind=document.getElementById('studioKind')?.value; const assetType=document.getElementById('studioAsset')?.value; const regulatoryTag=document.getElementById('studioReg')?.value.trim(); const attach=document.getElementById('studioAttach')?.checked;
  if (!name) return toast('Give the form a name first.','error');
  let schema; let assetScope='asset';
  if (kind === 'asset_matrix') schema={sections:[{id:'readings',label:'Readings',kind:'asset_matrix',matrixColumns:['Reading A','Reading B'],appliesToAssetTypes:[assetType]},{id:'notes',label:'Notes',kind:'text_area'}]};
  else if (kind === 'fields') { assetScope='site'; schema={sections:[{id:'inspection',label:'Inspection',kind:'fields',fields:[{id:'result',label:'Result',type:'select',required:true,options:['Pass','Attention required']},{id:'engineer',label:'Engineer initials',type:'text',required:true}]},{id:'notes',label:'Notes',kind:'text_area'}]}; }
  else schema={sections:[{id:'checks',label:'Asset checks',kind:'asset_checklist',appliesToAssetTypes:[assetType]},{id:'notes',label:'Notes',kind:'text_area'}]};
  try {
    const created=await fetchJson('/api/v1/form-types',{method:'POST',body:JSON.stringify({name,category,frequency,regulatoryTag,assetScope,appliesToAssetTypes:assetScope==='asset'?[assetType]:[],schema})});
    if (attach) { const o=activeComplianceOverview||await getOverview(); const job=o.jobs.find(j=>j.id==='job-7'); const oldTemplate=o.jobTemplates.find(t=>t.id===job?.jobTemplateId); if(job&&oldTemplate){ const stamp=Date.now(); const template=await fetchJson('/api/v1/job-templates',{method:'POST',body:JSON.stringify({id:`jt-demo-${stamp}`,name:`${oldTemplate.name} + ${name}`,category:oldTemplate.category,requiredFormTypeIds:[...new Set([...oldTemplate.requiredFormTypeIds,created.id])]})}); await fetchJson(`/api/v1/jobs/${job.id}/compliance-setup`,{method:'PATCH',body:JSON.stringify({siteId:job.siteId,jobTemplateId:template.id})}); } }
    toast(`Created ${name}${attach?' and attached it to the demo job':''}.`); await openComplianceWorkspace('catalogue');
  } catch (error) { toast(error.message,'error'); }
}

async function openComplianceJob(jobId) {
  try {
    const data=await fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/compliance-forms`); const display=activeComplianceOverview?.jobs.find(j=>j.id===jobId)?.displayId||jobId;
    openShowcaseDrawer(`${display} · ${data.site.name}`,data.jobTemplate.name,`<button class="showcase-back" data-demo-back-compliance>← Back to compliance</button><div class="showcase-list">${data.formTypes.map(f=>{const inst=data.instances.filter(i=>i.formTypeId===f.id);const done=inst.filter(i=>i.status==='completed').length;return `<button class="showcase-form-row" data-demo-form="${jobId}|${f.id}"><span><b>${escapeHtml(f.name)}</b><small>${escapeHtml(f.regulatoryTag||f.category)} · schema v${inst[0]?.formTypeVersion||f.currentVersion}</small></span><span class="showcase-progress"><i style="width:${inst.length?Math.round(done/inst.length*100):0}%"></i></span><strong>${done}/${inst.length}</strong><span>Open →</span></button>`;}).join('')}</div><div class="showcase-story"><h4>Engineer experience</h4><p>The engineer only sees the forms attached by this job template—never the full catalogue.</p></div>`);
  } catch(error){ toast(error.message,'error'); }
}

function assetsForSection(detail,section){const types=section.appliesToAssetTypes||detail.formType.appliesToAssetTypes||[];return detail.siteAssets.filter(a=>types.includes(a.type));}
function instanceMap(detail){return new Map(detail.instances.map(i=>[i.assetId||'__form_level__',i]));}
function warningFor(key,value){const n=Number(value);if(!Number.isFinite(n))return'';if(key.toUpperCase()==='CWS'&&n>=20)return'Above 20°C limit';if(key.toUpperCase()==='HWS'&&(n<50||n>60))return'Outside 50–60°C range';return'';}
function fieldEditor(field,instance,value){const base=`data-form-instance="${instance.id}" data-form-key="${escapeHtml(field.id)}"`;if(field.type==='select')return `<label class="showcase-field"><span>${escapeHtml(field.label)}${field.required?' *':''}</span><select ${base}>${['',...(field.options||[])].map(v=>`<option value="${escapeHtml(v)}" ${String(value??'')===String(v)?'selected':''}>${escapeHtml(v||'Choose…')}</option>`).join('')}</select></label>`;if(field.type==='boolean'||field.type==='pass_fail')return `<label class="showcase-field"><span>${escapeHtml(field.label)}${field.required?' *':''}</span><select ${base}><option value="">Choose…</option><option value="true" ${value===true?'selected':''}>Yes / Pass</option><option value="false" ${value===false?'selected':''}>No / Fail</option></select></label>`;if(field.type==='textarea')return `<label class="showcase-field showcase-span-2"><span>${escapeHtml(field.label)}${field.required?' *':''}</span><textarea ${base}>${escapeHtml(value??'')}</textarea></label>`;const type=field.type==='number'?'number':field.type==='date'?'date':'text';return `<label class="showcase-field"><span>${escapeHtml(field.label)}${field.required?' *':''}</span><input type="${type}" ${base} value="${escapeHtml(value??'')}" placeholder="${field.type==='signature'||field.type==='photo'?'Demo placeholder':''}" /></label>`;}

async function openDynamicForm(jobId,formTypeId){try{const detail=await fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/compliance-forms/${encodeURIComponent(formTypeId)}`);activeFormDetail={jobId,formTypeId,detail};const schema=detail.formType.versions.find(v=>v.version===detail.formType.currentVersion)?.schema;const map=instanceMap(detail);const formLevel=map.get('__form_level__');const sections=(schema?.sections||[]).map(section=>{if(section.kind==='asset_matrix')return `<section class="showcase-dynamic-section"><h4>${escapeHtml(section.label)}</h4>${assetsForSection(detail,section).map(asset=>{const inst=map.get(asset.id);if(!inst)return'';return `<div class="showcase-asset-card"><div class="showcase-asset-title"><b>${escapeHtml(asset.label)}</b><span>${escapeHtml(asset.floor?`Floor ${asset.floor}`:asset.type)}</span></div><div class="showcase-form-grid">${(section.matrixColumns||[]).map(col=>`<label class="showcase-field"><span>${escapeHtml(col)}</span><input type="number" step="0.1" data-form-instance="${inst.id}" data-form-key="${escapeHtml(col)}" value="${escapeHtml(inst.answers?.[col]??'')}" /><small class="showcase-warning" data-warning-instance="${inst.id}" data-warning-key="${escapeHtml(col)}">${escapeHtml(warningFor(col,inst.answers?.[col]))}</small></label>`).join('')}</div></div>`;}).join('')}</section>`;if(section.kind==='asset_checklist')return `<section class="showcase-dynamic-section"><h4>${escapeHtml(section.label)}</h4>${assetsForSection(detail,section).map(asset=>{const inst=map.get(asset.id);if(!inst)return'';const pass=inst.answers?.pass;return `<div class="showcase-asset-card"><div class="showcase-asset-title"><b>${escapeHtml(asset.label)}</b><span>${escapeHtml(asset.floor?`Floor ${asset.floor}`:asset.type)}</span></div><div class="showcase-form-grid"><label class="showcase-field"><span>Result</span><select data-form-instance="${inst.id}" data-form-key="pass"><option value="">Choose…</option><option value="true" ${pass===true?'selected':''}>Pass</option><option value="false" ${pass===false?'selected':''}>Fail</option></select></label><label class="showcase-field"><span>Comment</span><input data-form-instance="${inst.id}" data-form-key="comment" value="${escapeHtml(inst.answers?.comment??'')}" /></label></div></div>`;}).join('')}</section>`;if(section.kind==='text_area'&&formLevel)return `<section class="showcase-dynamic-section"><h4>${escapeHtml(section.label)}</h4>${section.defaultText?`<p class="showcase-instruction">${escapeHtml(section.defaultText)}</p>`:''}<textarea class="showcase-textarea" data-form-instance="${formLevel.id}" data-form-key="${escapeHtml(section.id)}">${escapeHtml(formLevel.answers?.[section.id]??'')}</textarea></section>`;if(section.kind==='fields'&&formLevel)return `<section class="showcase-dynamic-section"><h4>${escapeHtml(section.label)}</h4><div class="showcase-form-grid">${(section.fields||[]).map(f=>fieldEditor(f,formLevel,formLevel.answers?.[f.id])).join('')}</div></section>`;return'';}).join('');openShowcaseDrawer(detail.formType.name,`${detail.site.name} · schema v${detail.formType.currentVersion}`,`<button class="showcase-back" data-demo-compliance-job="${jobId}">← Required forms</button><div class="showcase-form-meta"><span>${escapeHtml(detail.formType.category.replaceAll('_',' '))}</span><span>${escapeHtml(detail.formType.frequency)}</span>${detail.formType.regulatoryTag?`<span>${escapeHtml(detail.formType.regulatoryTag)}</span>`:''}</div><div class="showcase-dynamic-form">${sections}</div><div class="showcase-form-footer"><button class="showcase-btn" data-demo-prefill>Fill example values</button><button class="showcase-btn primary" data-demo-save-form="${jobId}|${formTypeId}">Save form</button></div>`,true);}catch(error){toast(error.message,'error');}}

function readControlValue(el){if(el.tagName==='SELECT'&&['true','false'].includes(el.value))return el.value==='true';if(el.type==='number')return el.value===''?'':Number(el.value);return el.value;}
function prefillDynamicForm(){document.querySelectorAll('#drawerBody [data-form-instance]').forEach(el=>{const key=el.dataset.formKey||'';if(el.tagName==='SELECT'){const options=[...el.options].filter(o=>o.value);if(options.length)el.value=options.find(o=>o.value==='true')?.value||options[0].value;}else if(el.type==='number')el.value=key.toUpperCase()==='HWS'?'55':key.toUpperCase()==='CWS'?'14':'10';else if(el.type==='date')el.value='2026-09-15';else if(/initial|engineer/i.test(key))el.value='MR';else if(el.tagName==='TEXTAREA')el.value='All checks completed. No exceptions noted.';else el.value='Demo check complete';el.dispatchEvent(new Event('input',{bubbles:true}));});toast('Example values loaded.');}
async function saveDynamicForm(jobId,formTypeId){if(!activeFormDetail||activeFormDetail.jobId!==jobId||activeFormDetail.formTypeId!==formTypeId)return;const{detail}=activeFormDetail;const schema=detail.formType.versions.find(v=>v.version===detail.formType.currentVersion)?.schema;const answersByInstance=new Map(detail.instances.map(i=>[i.id,{...(i.answers||{})}]));document.querySelectorAll('#drawerBody [data-form-instance]').forEach(el=>{const id=el.dataset.formInstance,key=el.dataset.formKey;if(!id||!key)return;answersByInstance.get(id)[key]=readControlValue(el);});const map=instanceMap(detail);const requiredIds=(schema.sections||[]).filter(s=>s.kind==='fields').flatMap(s=>(s.fields||[]).filter(f=>f.required).map(f=>f.id));const statusById=new Map();(schema.sections||[]).forEach(section=>{if(section.kind==='asset_matrix')assetsForSection(detail,section).forEach(asset=>{const inst=map.get(asset.id);if(!inst)return;const ans=answersByInstance.get(inst.id)||{};const cols=section.matrixColumns||[];const filled=cols.every(c=>ans[c]!==undefined&&ans[c]!=='');const any=cols.some(c=>ans[c]!==undefined&&ans[c]!=='');statusById.set(inst.id,filled?'completed':any?'in_progress':'not_started');});if(section.kind==='asset_checklist')assetsForSection(detail,section).forEach(asset=>{const inst=map.get(asset.id);if(!inst)return;const ans=answersByInstance.get(inst.id)||{};statusById.set(inst.id,ans.pass!==undefined&&ans.pass!==''?'completed':ans.comment?'in_progress':'not_started');});});const formLevel=map.get('__form_level__');if(formLevel){const ans=answersByInstance.get(formLevel.id)||{};const any=Object.values(ans).some(v=>v!==undefined&&v!=='');const requiredFilled=requiredIds.every(k=>ans[k]!==undefined&&ans[k]!=='');statusById.set(formLevel.id,requiredIds.length?(requiredFilled?'completed':any?'in_progress':'not_started'):(any?'completed':'not_started'));}try{const saves=detail.instances.map(inst=>fetchJson(`/api/v1/form-instances/${encodeURIComponent(inst.id)}`,{method:'POST',body:JSON.stringify({answers:answersByInstance.get(inst.id)||{},status:statusById.get(inst.id)||inst.status})}));await Promise.all(saves);toast('Form saved. Dashboard compliance state will refresh.');sessionStorage.setItem(REOPEN_KEY,jobId);setTimeout(()=>location.reload(),700);}catch(error){toast(error.message,'error');}}

function openRiskWorkspace(){const wip=pendingWip();const handovers=jobMeta.map(displayJob).filter(j=>j.handoverMissing).length;const schedule=jobMeta.map(displayJob).filter(j=>['in_progress','en_route','not_started'].includes(j.status)&&new Date(j.scheduledEnd)<DEMO_NOW).length;const cards=[['Scheduling',Math.max(42,100-schedule*14),`${schedule} jobs need intervention`,'Scheduling'],['Visibility',85,'Good job-event coverage','Visibility'],['Handover',Math.max(38,100-handovers*12),`${handovers} evidence gaps`,'Handover'],['Billing',Math.max(40,100-wip.length*6),`${money.format(wip.reduce((s,j)=>s+j.value,0))} unbilled`,'Billing'],['Compliance',82,'Open required forms visible live','Compliance']];openShowcaseDrawer('FSM Risk Scorecard','Operational risk translated into actions',`<div class="showcase-risk-list">${cards.map(([name,score,note,risk])=>`<div class="showcase-risk-row"><span><b>${name}</b><small>${note}</small></span><div class="showcase-score-bar"><i style="width:${score}%"></i></div><strong>${score}/100</strong><button class="showcase-btn small ghost" data-demo-risk="${risk}">View risks</button></div>`).join('')}</div><button class="showcase-btn showcase-full" data-demo-print>Print / save report</button>`);}
function applyInvoice(id){const st=readDemoState();if(!st.invoiced.includes(id))st.invoiced.push(id);writeDemoState(st);toast(`${id} marked invoiced.`);openWipWorkspace();}
function applyHandover(id){const st=readDemoState();if(!st.handoverResolved.includes(id))st.handoverResolved.push(id);writeDemoState(st);toast(`Handover evidence added to ${id}.`);openInteractiveJob(id);}
function addNote(id){const text=prompt('Add an office note to this job:','Customer updated; office action recorded.');if(!text)return;const st=readDemoState();st.notes[id]=text;writeDemoState(st);toast('Job note added.');openInteractiveJob(id);}
function completeSub(index){const base=subcontractorBase[index];if(!base)return;const st=readDemoState();const current=st.subPending[base.name]??base.pending;st.subPending[base.name]=Math.max(0,current-1);writeDemoState(st);toast(`One ${base.name} action cleared.`);openSubcontractorWorkspace();}

function routeClick(event){const target=event.target.closest('[data-demo-action],[data-action],[data-nav],[data-job],[data-demo-job],[data-demo-invoice],[data-demo-handover],[data-demo-note],[data-demo-jobs-filter],[data-demo-exception-filter],[data-demo-compliance-tab],[data-demo-compliance-job],[data-demo-form],[data-demo-back-compliance],[data-demo-create-form],[data-demo-prefill],[data-demo-save-form],[data-demo-sub-complete],[data-demo-sub-chase],[data-demo-risk],[data-demo-print]');if(!target)return;const demoAction=target.dataset.demoAction,appAction=target.dataset.action,nav=target.dataset.nav;const shouldIntercept=demoAction||target.dataset.demoJob||target.dataset.demoInvoice||target.dataset.demoHandover||target.dataset.demoNote||target.dataset.demoJobsFilter||target.dataset.demoExceptionFilter||target.dataset.demoComplianceTab||target.dataset.demoComplianceJob||target.dataset.demoForm||target.hasAttribute('data-demo-back-compliance')||target.hasAttribute('data-demo-create-form')||target.hasAttribute('data-demo-prefill')||target.dataset.demoSaveForm||target.dataset.demoSubComplete||target.dataset.demoSubChase||target.dataset.demoRisk||target.hasAttribute('data-demo-print')||target.dataset.job||['all-jobs','all-exceptions','compliance','subcontractors','reports'].includes(appAction)||['jobs','compliance','subcontractors','reports'].includes(nav);if(!shouldIntercept)return;event.preventDefault();event.stopImmediatePropagation();if(target.dataset.demoJob||target.dataset.job)return openInteractiveJob(target.dataset.demoJob||target.dataset.job);if(target.dataset.demoInvoice)return applyInvoice(target.dataset.demoInvoice);if(target.dataset.demoHandover)return applyHandover(target.dataset.demoHandover);if(target.dataset.demoNote)return addNote(target.dataset.demoNote);if(target.dataset.demoJobsFilter)return openJobsWorkspace(target.dataset.demoJobsFilter);if(target.dataset.demoExceptionFilter)return openExceptionsWorkspace(target.dataset.demoExceptionFilter);if(target.dataset.demoComplianceTab)return openComplianceWorkspace(target.dataset.demoComplianceTab);if(target.dataset.demoComplianceJob)return openComplianceJob(target.dataset.demoComplianceJob);if(target.dataset.demoForm){const[jobId,formTypeId]=target.dataset.demoForm.split('|');return openDynamicForm(jobId,formTypeId);}if(target.hasAttribute('data-demo-back-compliance'))return openComplianceWorkspace('jobs');if(target.hasAttribute('data-demo-create-form'))return createStudioForm();if(target.hasAttribute('data-demo-prefill'))return prefillDynamicForm();if(target.dataset.demoSaveForm){const[jobId,formTypeId]=target.dataset.demoSaveForm.split('|');return saveDynamicForm(jobId,formTypeId);}if(target.dataset.demoSubComplete)return completeSub(Number(target.dataset.demoSubComplete));if(target.dataset.demoSubChase)return toast(`Chase sent to ${subcontractorBase[Number(target.dataset.demoSubChase)]?.name||'subcontractor'}.`);if(target.dataset.demoRisk)return openExceptionsWorkspace(target.dataset.demoRisk);if(target.hasAttribute('data-demo-print'))return window.print();const action=demoAction||appAction||nav;if(action==='wip'||(appAction==='all-jobs'&&target.closest('.wip-panel')))return openWipWorkspace();if(action==='handover')return openExceptionsWorkspace('Handover');if(action==='exceptions'||appAction==='all-exceptions')return openExceptionsWorkspace('All');if(action==='jobs'||appAction==='all-jobs')return openJobsWorkspace();if(action==='compliance')return openComplianceWorkspace('jobs');if(action==='subcontractors')return openSubcontractorWorkspace();if(action==='reports')return openRiskWorkspace();}
function routeKey(event){if((event.key==='Enter'||event.key===' ')&&event.target.matches('.kpi-card[data-demo-action]')){event.preventDefault();event.target.click();}}
function updateWarnings(event){const el=event.target.closest('[data-form-instance][data-form-key]');if(!el)return;const warning=[...document.querySelectorAll('[data-warning-instance][data-warning-key]')].find(w=>w.dataset.warningInstance===el.dataset.formInstance&&w.dataset.warningKey===el.dataset.formKey);if(warning)warning.textContent=warningFor(el.dataset.formKey,el.value);}
document.addEventListener('click',routeClick,true);document.addEventListener('keydown',routeKey,true);document.addEventListener('input',updateWarnings,true);new MutationObserver(()=>enhanceSurface()).observe(document.documentElement,{childList:true,subtree:true});setTimeout(async()=>{enhanceSurface();const reopen=sessionStorage.getItem(REOPEN_KEY);if(reopen){sessionStorage.removeItem(REOPEN_KEY);try{await getOverview();await openComplianceJob(reopen);}catch{}}},150);
