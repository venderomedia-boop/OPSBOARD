const DEMO_NOW = new Date('2026-09-15T14:30:00+01:00');
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const hours = (ms) => Math.max(0, ms / 36e5);
const days = (ms) => Math.max(0, ms / 864e5);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const app = document.querySelector('#app');

const jobs = [
  { id:'J-1048', customer:'Riverside Dental Practice', service:'Heat Pump Inspection', status:'completed', owner:'James', sub:false, scheduledEnd:'2026-09-15T09:30:00+01:00', completedAt:'2026-09-15T09:42:00+01:00', invoiceStatus:'pending', value:295, handoverMissing:true, events:[['09:03','Engineer arrived'],['09:42','Job completed'],['10:04','Handover flagged incomplete']] },
  { id:'J-1047', customer:'Northgate Retail Park', service:'PPM HVAC Visit', status:'completed', owner:'Alicia', sub:false, scheduledEnd:'2026-09-15T10:00:00+01:00', completedAt:'2026-09-15T10:12:00+01:00', invoiceStatus:'pending', value:480, handoverMissing:false, events:[['08:58','Engineer arrived'],['10:12','Job completed']] },
  { id:'J-1046', customer:'Meridian Office Park', service:'Water Hygiene Monthly Visit', status:'completed', owner:'Martin', sub:false, scheduledEnd:'2026-09-15T10:45:00+01:00', completedAt:'2026-09-15T11:02:00+01:00', invoiceStatus:'pending', value:365, handoverMissing:false, events:[['09:20','Engineer arrived'],['11:02','Job completed'],['11:08','Compliance forms submitted']] },
  { id:'J-1033', customer:'Hillside Care Centre', service:'Boiler Service', status:'completed', owner:'James', sub:false, scheduledEnd:'2026-09-10T13:00:00+01:00', completedAt:'2026-09-10T13:15:00+01:00', invoiceStatus:'pending', value:1380, handoverMissing:true, events:[['10 Sep','Job completed'],['12 Sep','Office chased job notes']] },
  { id:'J-1038', customer:'Kingston Pharmacy Group', service:'AC Remedial Works', status:'completed', owner:'Alicia', sub:false, scheduledEnd:'2026-09-12T14:00:00+01:00', completedAt:'2026-09-12T14:10:00+01:00', invoiceStatus:'pending', value:940, handoverMissing:false, events:[['12 Sep','Job completed'],['14 Sep','Invoice still pending']] },
  { id:'J-1041', customer:'Beacon Student Living', service:'Ventilation Repair', status:'completed', owner:'SUB · Apex M&E', sub:true, scheduledEnd:'2026-09-13T12:00:00+01:00', completedAt:'2026-09-13T13:10:00+01:00', invoiceStatus:'pending', value:310, handoverMissing:true, events:[['13 Sep','Subcontractor completed work'],['13 Sep','Photos missing']] },
  { id:'J-1051', customer:'Central Foods Distribution', service:'Cold Room Breakdown', status:'in_progress', owner:'Martin', sub:false, scheduledEnd:'2026-09-15T12:30:00+01:00', completedAt:null, invoiceStatus:null, value:850, handoverMissing:false, events:[['11:04','Engineer en route'],['11:42','Work started']] },
  { id:'J-1052', customer:'Arden House', service:'Emergency Lighting Test', status:'en_route', owner:'SUB · BrightSpark', sub:true, scheduledEnd:'2026-09-15T13:30:00+01:00', completedAt:null, invoiceStatus:null, value:420, handoverMissing:false, events:[['12:30','Job assigned'],['13:05','Subcontractor en route']] },
  { id:'J-1053', customer:'Oakwood Medical Centre', service:'AHU Filter Change', status:'not_started', owner:'Alicia', sub:false, scheduledEnd:'2026-09-15T13:45:00+01:00', completedAt:null, invoiceStatus:null, value:260, handoverMissing:false, events:[['11:45','Job scheduled']] },
  { id:'J-1054', customer:'Riverside Dental Practice', service:'Reactive Callout', status:'scheduled', owner:'James', sub:false, scheduledEnd:'2026-09-15T16:30:00+01:00', completedAt:null, invoiceStatus:null, value:520, handoverMissing:false, events:[['12:12','Job booked']] },
  { id:'J-1055', customer:'Meridian Office Park', service:'Water Hygiene Compliance Visit', status:'scheduled', owner:'Martin', sub:false, scheduledEnd:'2026-09-15T19:45:00+01:00', completedAt:null, invoiceStatus:null, value:450, handoverMissing:false, events:[['14:05','Quarterly compliance visit scheduled']] },
];

const subcontractors = [
  { name:'Apex M&E', active:6, pending:3, response:'4.2h', status:'On track' },
  { name:'BrightSpark Electrical', active:4, pending:2, response:'6.1h', status:'Attention' },
  { name:'NorthWest HVAC Services', active:3, pending:0, response:'1.8h', status:'On track' },
  { name:'Rapid Mechanical Ltd', active:2, pending:1, response:'3.5h', status:'On track' },
];

const state = { overview:null, selfTest:null, apiError:null };
const sevRank = { critical:4, high:3, medium:2, low:1 };

function icon(name) {
  const paths = {
    wallet:'<path d="M4 7h15v12H4z"/><path d="M4 9V5h12v4"/><path d="M15 12h4"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    repeat:'<path d="M4 8h13l-3-3"/><path d="m17 16H4l3 3"/>',
    alert:'<path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4"/><path d="M12 16h.01"/>',
    shield:'<path d="M12 3 5 6v5c0 4.5 2.8 7.6 7 10 4.2-2.4 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/>',
    pin:'<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
    refresh:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 11.9-1"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
    file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}

function ageLabel(value) {
  if (!value) return '—';
  const h = hours(DEMO_NOW - new Date(value));
  return h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
}

function operationalExceptions() {
  const scheduling = jobs.filter(j => ['in_progress','en_route','not_started'].includes(j.status) && new Date(j.scheduledEnd) < DEMO_NOW)
    .map(j => ({ job:j, severity:hours(DEMO_NOW-new Date(j.scheduledEnd))>1?'critical':'high', risk:'Scheduling', message:`Planned finish passed; job is ${j.status.replace('_',' ')}`, since:j.scheduledEnd }));
  const handover = jobs.filter(j => j.handoverMissing)
    .map(j => ({ job:j, severity:days(DEMO_NOW-new Date(j.completedAt))>2?'critical':'high', risk:'Handover', message:'Required handover evidence is incomplete', since:j.completedAt }));
  const billing = jobs.filter(j => j.status==='completed' && j.invoiceStatus==='pending')
    .map(j => ({ job:j, severity:days(DEMO_NOW-new Date(j.completedAt))>=3?'critical':days(DEMO_NOW-new Date(j.completedAt))>=1?'high':'medium', risk:'Billing', message:`${money.format(j.value)} completed work not yet invoiced`, since:j.completedAt }));
  const visibility = jobs.filter(j => j.status==='completed' && j.events.length<2)
    .map(j => ({ job:j, severity:'medium', risk:'Visibility', message:'Low job-event visibility', since:j.completedAt }));
  return { scheduling, handover, billing, visibility };
}

function liveComplianceExceptions() {
  const o = state.overview;
  if (!o) return [];
  const forms = new Map((o.formTypes || []).map(f => [f.id,f]));
  const apiJobs = new Map((o.jobs || []).map(j => [j.id,j]));
  const groups = new Map();
  for (const instance of o.formInstances || []) {
    const key = `${instance.jobId}:${instance.formTypeId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(instance);
  }
  const output = [];
  for (const [key, instances] of groups) {
    const [jobId, formTypeId] = key.split(':');
    const incomplete = instances.filter(i => i.status !== 'completed');
    if (!incomplete.length) continue;
    const apiJob = apiJobs.get(jobId);
    const displayId = apiJob?.displayId || jobId;
    const job = jobs.find(j => j.id === displayId) || { id:displayId, customer:apiJob?.customer || 'Compliance job', service:apiJob?.serviceType || 'Compliance visit', status:apiJob?.status || 'scheduled', owner:'Office', sub:false, scheduledEnd:DEMO_NOW.toISOString(), value:0, events:[] };
    const completed = instances.length - incomplete.length;
    output.push({
      job,
      severity:job.status==='completed'?'critical':completed>0?'high':'medium',
      risk:'Compliance',
      message:`${forms.get(formTypeId)?.name || formTypeId}: ${completed}/${instances.length} complete`,
      since:incomplete.map(i => i.submittedAt).filter(Boolean).sort()[0] || job.scheduledEnd,
    });
  }
  return output;
}

function allExceptions() {
  const op = operationalExceptions();
  return [...op.scheduling,...op.handover,...op.billing,...liveComplianceExceptions(),...op.visibility]
    .sort((a,b) => sevRank[b.severity]-sevRank[a.severity] || new Date(a.since)-new Date(b.since));
}

function ownerCell(job) {
  const raw = job.owner.replace('SUB · ','');
  const initials = raw.split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase();
  return `<div class="owner-wrap"><span class="owner-badge">${initials}</span>${job.sub?'<span class="sub-tag">SUB</span>':''}</div>`;
}

function severityCell(level) {
  const color = level==='critical'?'#e43d4e':level==='high'?'#ec9900':'#405d82';
  return `<span class="severity ${level}"><span class="sev-dot" style="background:${color}"></span>${level[0].toUpperCase()+level.slice(1)}</span>`;
}

function exceptionRows(limit = 5) {
  return allExceptions().slice(0,limit).map(e => `<tr>
    <td>${severityCell(e.severity)}</td>
    <td><div class="job-ref"><strong>${e.job.id}</strong><span>${e.job.customer}</span></div></td>
    <td><span class="risk-chip ${e.risk.toLowerCase()}">${e.risk}</span></td>
    <td>${e.message}</td>
    <td class="age-hot">${ageLabel(e.since)}</td>
    <td>${ownerCell(e.job)}</td>
    <td><button class="row-link" data-job="${e.job.id}">View ${icon('arrow')}</button></td>
    <td><button class="row-menu" data-job="${e.job.id}" aria-label="Open job">•••</button></td>
  </tr>`).join('');
}

function complianceStats() {
  const instances = state.overview?.formInstances || [];
  const completed = instances.filter(i => i.status==='completed').length;
  const inProgress = instances.filter(i => i.status==='in_progress').length;
  const notStarted = instances.filter(i => i.status==='not_started').length;
  const total = instances.length;
  const pct = total ? Math.round(completed / total * 100) : 0;
  return { completed, inProgress, notStarted, total, pct };
}

function missingForms() {
  const o = state.overview;
  if (!o) return [];
  const names = new Map((o.formTypes || []).map(f => [f.id,f.name]));
  const counts = new Map();
  for (const i of o.formInstances || []) if (i.status !== 'completed') counts.set(i.formTypeId,(counts.get(i.formTypeId)||0)+1);
  return [...counts.entries()].map(([id,count]) => ({ name:names.get(id)||id, count })).sort((a,b)=>b.count-a.count).slice(0,4);
}

function riskScore(label, score, note) {
  const tone = score>=85?'green':score>=65?'amber':'red';
  return `<div class="risk-card"><div class="risk-card-head">${icon(label==='Visibility'?'eye':label==='Compliance'?'shield':label==='Billing'?'file':label==='Scheduling'?'calendar':'repeat')}<span>${label}</span></div><div class="risk-card-score ${tone}">${score} / 100</div><small>${note}</small></div>`;
}

function render() {
  const exceptions = allExceptions();
  const op = operationalExceptions();
  const pendingWip = jobs.filter(j => j.status==='completed' && j.invoiceStatus==='pending');
  const totalWip = pendingWip.reduce((s,j)=>s+j.value,0);
  const avgAge = pendingWip.reduce((s,j)=>s+days(DEMO_NOW-new Date(j.completedAt)),0) / Math.max(1,pendingWip.length);
  const oldestAge = Math.max(...pendingWip.map(j=>days(DEMO_NOW-new Date(j.completedAt))));
  const comp = complianceStats();
  const missing = missingForms();
  const bucketDefs = [['0–2 days',0,2],['3–7 days',2,7],['8+ days',7,999]];
  const buckets = bucketDefs.map(([label,min,max]) => ({ label, value:pendingWip.filter(j=>{const d=days(DEMO_NOW-new Date(j.completedAt));return d>=min&&d<max}).reduce((s,j)=>s+j.value,0) }));
  const maxBucket = Math.max(1,...buckets.map(b=>b.value));
  const handoverCount = op.handover.length;
  const schedulingScore = clamp(100-op.scheduling.length*14,35,96);
  const visibilityScore = clamp(100-op.visibility.length*15,45,96);
  const handoverScore = clamp(100-handoverCount*11,35,96);
  const billingScore = clamp(100-op.billing.filter(e=>e.severity!=='medium').length*11,35,96);
  const complianceScore = comp.total ? comp.pct : 100;
  const apiLive = !!state.overview && !state.apiError;
  const dateText = new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(DEMO_NOW);

  app.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brandmark">V</div><div class="brand-copy"><h1>Ops Hub</h1><small>Director exception control · Apex Climate Services</small></div></div>
      <nav class="topnav" aria-label="Primary">
        <button class="nav-link active" data-nav="overview">Overview</button>
        <button class="nav-link" data-nav="jobs">Jobs</button>
        <button class="nav-link" data-nav="compliance">Compliance</button>
        <button class="nav-link" data-nav="subcontractors">Subcontractors</button>
        <button class="nav-link" data-nav="reports">Reports</button>
      </nav>
      <div class="top-actions"><span class="pill live"><span class="live-dot" style="${apiLive?'':'background:#e43d4e'}"></span>${apiLive?'LIVE · shared compliance API':'Compliance API reconnecting'}</span><span class="pill owner">Owner view</span><span class="avatar">JD</span><span class="chev">⌄</span></div>
    </header>

    <main class="dashboard" id="overview">
      <section class="hero-strip">
        <div class="hero-copy"><div class="eyebrow">Owner control centre</div><h2>Keep work moving. Close the gaps.</h2><p>Live view across scheduling, handovers, job visibility, billing and compliance.</p></div>
        <div class="hero-meta">
          <div class="meta-item"><span class="meta-icon">${icon('calendar')}</span><div><small>Today</small><strong>${dateText}</strong></div></div>
          <div class="meta-item"><span class="meta-icon">${icon('pin')}</span><div><small>Apex Climate Services</small><strong>All regions</strong></div></div>
          <div class="meta-item"><span class="meta-icon">${icon('refresh')}</span><div><small>Last updated</small><strong>14:30 demo</strong></div></div>
        </div>
      </section>

      <section class="kpi-grid">
        <article class="kpi-card"><div class="kpi-icon">${icon('wallet')}</div><div class="kpi-label">Unbilled WIP</div><div class="trend">↓ 12%<span>vs. last week</span></div><div class="kpi-value">${money.format(totalWip)}</div><div class="kpi-detail">Completed work awaiting invoice</div></article>
        <article class="kpi-card green"><div class="kpi-icon">${icon('clock')}</div><div class="kpi-label">Avg unbilled age</div><div class="trend">↓ 0.6d<span>vs. last week</span></div><div class="kpi-value">${avgAge.toFixed(1)}d</div><div class="kpi-detail">Oldest ${oldestAge.toFixed(1)}d</div></article>
        <article class="kpi-card red"><div class="kpi-icon">${icon('repeat')}</div><div class="kpi-label">Handover gaps</div><div class="trend bad">↑ 1<span>vs. last week</span></div><div class="kpi-value">${handoverCount}</div><div class="kpi-detail">Completed jobs missing evidence</div></article>
        <article class="kpi-card amber"><div class="kpi-icon">${icon('alert')}</div><div class="kpi-label">Open exceptions</div><div class="trend">↓ 3<span>vs. last week</span></div><div class="kpi-value">${exceptions.length}</div><div class="kpi-detail">Across scheduling, billing & compliance</div></article>
        <article class="kpi-card"><div class="kpi-icon">${icon('shield')}</div><div class="kpi-label">Compliance completion</div><div class="trend">${apiLive?'↑ live':'—'}<span>${state.selfTest?.ok?'engine healthy':'checking engine'}</span></div><div class="kpi-value">${comp.pct}%</div><div class="kpi-detail">${comp.completed} of ${comp.total} required instances</div></article>
      </section>

      <section class="ops-grid">
        <article class="panel exceptions-panel" id="exceptions">
          <div class="panel-head"><div class="panel-title"><span class="panel-title-icon red">${icon('alert')}</span><div><h3>Exception Dashboard</h3><p>Jobs requiring attention across scheduling, handover, billing and compliance.</p></div></div><button class="panel-action" data-action="all-exceptions">View all exceptions →</button></div>
          <div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Severity</th><th>Job / customer</th><th>Category</th><th>Issue</th><th>Age</th><th>Owner</th><th>Actions</th><th></th></tr></thead><tbody>${exceptionRows()}</tbody></table></div></div>
        </article>

        <article class="panel wip-panel" id="wip">
          <div class="panel-head"><div class="panel-title"><span class="panel-title-icon">${icon('chart')}</span><div><h3>Job to Cash / WIP</h3><p>Completed work, invoice status and aging.</p></div></div><button class="panel-action" data-action="all-jobs">View all jobs →</button></div>
          <div class="panel-body"><div class="wip-layout"><div class="wip-total"><strong>${money.format(totalWip)}</strong><span>Unbilled WIP</span></div><div class="wip-legend">${buckets.map((b,i)=>`<div class="wip-legend-row"><span class="legend-dot ${i===1?'mid':i===2?'light':''}"></span><span>${b.label}</span><strong>${money.format(b.value)}</strong></div>`).join('')}</div><div><div class="mini-chart"><span class="chart-line l1"></span><span class="chart-line l2"></span>${buckets.map(b=>`<span class="chart-bar" style="height:${Math.max(7,Math.round(b.value/maxBucket*90))}%"></span>`).join('')}</div><div class="chart-labels">${buckets.map(b=>`<span>${b.label.replace(' days','')}</span>`).join('')}</div></div></div></div>
        </article>

        <article class="panel compliance-panel" id="compliance">
          <div class="panel-head"><div class="panel-title"><span class="panel-title-icon">${icon('shield')}</span><div><h3>Compliance Control</h3><p>Required forms, completion status and open issues.</p></div></div><button class="panel-action" data-action="compliance">View compliance →</button></div>
          <div class="panel-body"><div class="compliance-layout"><div class="donut" style="--pct:${comp.pct}"><div class="donut-copy"><strong>${comp.pct}%</strong><span>Complete</span></div></div><div class="completion-legend"><div class="completion-row"><span class="legend-dot" style="background:#0da96f"></span><span>Completed</span><strong>${comp.completed}</strong></div><div class="completion-row"><span class="legend-dot mid" style="background:#e4a11b"></span><span>In progress</span><strong>${comp.inProgress}</strong></div><div class="completion-row"><span class="legend-dot light" style="background:#b4c1d0"></span><span>Not started</span><strong>${comp.notStarted}</strong></div></div><div class="top-missing"><h4>Top missing forms</h4>${missing.length?missing.map(x=>`<div class="missing-row"><span>${x.name}</span><strong>${x.count}</strong></div>`).join(''):'<div class="missing-row"><span>No outstanding forms</span><strong>0</strong></div>'}</div></div></div>
        </article>

        <article class="panel sub-panel" id="subcontractors">
          <div class="panel-head"><div class="panel-title"><span class="panel-title-icon">${icon('users')}</span><div><h3>Subcontractor Coordination</h3><p>Active subs, outstanding actions and upcoming handovers.</p></div></div><button class="panel-action" data-action="subcontractors">View subcontractors →</button></div>
          <div class="panel-body"><div class="table-wrap"><table class="data-table sub-table"><thead><tr><th>Subcontractor</th><th>Active jobs</th><th>Pending actions</th><th>Avg response</th><th>Status</th></tr></thead><tbody>${subcontractors.map(s=>`<tr><td><strong>${s.name}</strong></td><td>${s.active}</td><td class="${s.pending?'age-hot':''}">${s.pending}</td><td>${s.response}</td><td><span class="status-dot ${s.status==='Attention'?'attn':''}"></span>${s.status}</td></tr>`).join('')}</tbody></table></div></div>
        </article>

        <article class="panel risk-panel" id="reports">
          <div class="panel-head"><div class="panel-title"><span class="panel-title-icon">${icon('chart')}</span><div><h3>FSM Risk Scorecard</h3><p>Operational risk across key areas.</p></div></div><button class="panel-action" data-action="reports">View full report →</button></div>
          <div class="panel-body"><div class="risk-grid">${riskScore('Scheduling',schedulingScore,`${op.scheduling.length} at risk`)}${riskScore('Visibility',visibilityScore,'Good momentum')}${riskScore('Handover',handoverScore,`${handoverCount} gaps`)}${riskScore('Billing',billingScore,`${money.format(totalWip)} unbilled`)}${riskScore('Compliance',complianceScore,comp.pct>=85?'On track':'Needs attention')}</div></div>
        </article>
      </section>
    </main>

    <div class="drawer-backdrop" id="drawerBackdrop"><aside class="drawer"><div class="drawer-head"><div><h3 id="drawerTitle">Details</h3><p id="drawerSubtitle"></p></div><button class="close" data-action="close-drawer">×</button></div><div class="drawer-body" id="drawerBody"></div></aside></div>
  </div>`;

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
    const nav = btn.dataset.nav;
    document.querySelectorAll('.nav-link').forEach(x=>x.classList.toggle('active',x===btn));
    if (nav==='jobs') return showJobsDrawer();
    const target = nav==='overview'?'overview':nav==='reports'?'reports':nav;
    document.getElementById(target)?.scrollIntoView({ behavior:'smooth', block:'start' });
  }));
  document.querySelectorAll('[data-job]').forEach(btn => btn.addEventListener('click', () => showJobDrawer(btn.dataset.job)));
  document.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action==='close-drawer') closeDrawer();
    if (action==='all-jobs') showJobsDrawer();
    if (action==='all-exceptions') showExceptionsDrawer();
    if (action==='compliance') document.getElementById('compliance')?.scrollIntoView({ behavior:'smooth' });
    if (action==='subcontractors') document.getElementById('subcontractors')?.scrollIntoView({ behavior:'smooth' });
    if (action==='reports') document.getElementById('reports')?.scrollIntoView({ behavior:'smooth' });
  }));
  document.getElementById('drawerBackdrop')?.addEventListener('click', e => { if (e.target.id==='drawerBackdrop') closeDrawer(); });
}

function openDrawer(title, subtitle, body) {
  document.getElementById('drawerTitle').textContent = title;
  document.getElementById('drawerSubtitle').textContent = subtitle || '';
  document.getElementById('drawerBody').innerHTML = body;
  document.getElementById('drawerBackdrop').classList.add('open');
  document.querySelectorAll('#drawerBody [data-job]').forEach(btn => btn.addEventListener('click', () => showJobDrawer(btn.dataset.job)));
}
function closeDrawer(){ document.getElementById('drawerBackdrop')?.classList.remove('open'); }

function showJobDrawer(id) {
  const job = jobs.find(j=>j.id===id);
  if (!job) return;
  const risks = allExceptions().filter(e=>e.job.id===id);
  openDrawer(`${job.id} · ${job.customer}`, job.service, `<div class="detail-grid">
    <div class="detail"><span>Status</span><b>${job.status.replace('_',' ')}</b></div><div class="detail"><span>Owner</span><b>${job.owner}</b></div>
    <div class="detail"><span>Planned finish</span><b>${new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(job.scheduledEnd))}</b></div><div class="detail"><span>Job value</span><b>${money.format(job.value)}</b></div>
    <div class="detail"><span>Open risks</span><b>${risks.length}</b></div><div class="detail"><span>Invoice status</span><b>${job.invoiceStatus || 'Not applicable'}</b></div>
  </div>${risks.length?`<h4>Open exceptions</h4>${risks.map(r=>`<div class="detail" style="margin-top:8px"><span>${r.risk} · ${r.severity}</span><b>${r.message}</b></div>`).join('')}`:''}<h4>Timeline</h4><div class="timeline">${job.events.map(([time,text])=>`<div class="event"><b>${time}</b><span>${text}</span></div>`).join('')}</div>`);
}

function showJobsDrawer() {
  openDrawer('All Jobs','Cross-job operational visibility',`<table class="drawer-table"><thead><tr><th>Job</th><th>Customer</th><th>Status</th><th>Owner</th><th>Value</th></tr></thead><tbody>${jobs.map(j=>`<tr><td><button class="row-link" data-job="${j.id}">${j.id}</button></td><td>${j.customer}<br><span style="color:#64748b">${j.service}</span></td><td>${j.status.replace('_',' ')}</td><td>${j.owner}</td><td>${money.format(j.value)}</td></tr>`).join('')}</tbody></table>`);
}

function showExceptionsDrawer() {
  const rows = allExceptions();
  openDrawer('All Exceptions',`${rows.length} open operational exceptions`,`<table class="drawer-table"><thead><tr><th>Severity</th><th>Job</th><th>Risk</th><th>Issue</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${e.severity}</td><td><button class="row-link" data-job="${e.job.id}">${e.job.id}</button></td><td>${e.risk}</td><td>${e.message}</td></tr>`).join('')}</tbody></table>`);
}

async function loadCompliance() {
  try {
    const [overviewRes,testRes] = await Promise.all([
      fetch('/api/v1/compliance/overview',{cache:'no-store'}),
      fetch('/api/v1/compliance/self-test',{cache:'no-store'}),
    ]);
    if (!overviewRes.ok) throw new Error(`Compliance overview HTTP ${overviewRes.status}`);
    state.overview = await overviewRes.json();
    if (testRes.ok) state.selfTest = await testRes.json();
    state.apiError = null;
  } catch (error) {
    state.apiError = error.message || 'Shared compliance API unavailable';
  }
  render();
}

render();
loadCompliance();
