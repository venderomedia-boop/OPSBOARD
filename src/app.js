const DEMO_NOW = new Date('2026-09-15T14:30:00+01:00');
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const hours = (ms) => Math.max(0, ms / 36e5);
const days = (ms) => Math.max(0, ms / 864e5);
const ageLabel = (d) => {
  const h = hours(DEMO_NOW - new Date(d));
  return h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
};
const dateLabel = (d) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

const jobs = [
  { id: 'J-1048', customer: 'Riverside Dental Practice', service: 'Heat Pump Inspection', status: 'completed', owner: 'James', sub: false, scheduledEnd: '2026-09-15T09:30:00+01:00', completedAt: '2026-09-15T09:42:00+01:00', invoiceStatus: 'pending', value: 295, handoverMissing: true, events: [['09:03', 'Engineer arrived'], ['09:42', 'Job completed'], ['10:04', 'Handover flagged incomplete']] },
  { id: 'J-1047', customer: 'Northgate Retail Park', service: 'PPM HVAC Visit', status: 'completed', owner: 'Alicia', sub: false, scheduledEnd: '2026-09-15T10:00:00+01:00', completedAt: '2026-09-15T10:12:00+01:00', invoiceStatus: 'pending', value: 480, handoverMissing: false, events: [['08:58', 'Engineer arrived'], ['10:12', 'Job completed']] },
  { id: 'J-1046', customer: 'Meridian Office Park', service: 'Water Hygiene Monthly Visit', status: 'completed', owner: 'Martin', sub: false, scheduledEnd: '2026-09-15T10:45:00+01:00', completedAt: '2026-09-15T11:02:00+01:00', invoiceStatus: 'pending', value: 365, handoverMissing: false, events: [['09:20', 'Engineer arrived'], ['11:02', 'Job completed'], ['11:08', 'Compliance forms submitted']] },
  { id: 'J-1033', customer: 'Hillside Care Centre', service: 'Boiler Service', status: 'completed', owner: 'James', sub: false, scheduledEnd: '2026-09-10T13:00:00+01:00', completedAt: '2026-09-10T13:15:00+01:00', invoiceStatus: 'pending', value: 1380, handoverMissing: true, events: [['10 Sep', 'Job completed'], ['12 Sep', 'Office chased job notes']] },
  { id: 'J-1038', customer: 'Kingston Pharmacy Group', service: 'AC Remedial Works', status: 'completed', owner: 'Alicia', sub: false, scheduledEnd: '2026-09-12T14:00:00+01:00', completedAt: '2026-09-12T14:10:00+01:00', invoiceStatus: 'pending', value: 940, handoverMissing: false, events: [['12 Sep', 'Job completed'], ['14 Sep', 'Invoice still pending']] },
  { id: 'J-1041', customer: 'Beacon Student Living', service: 'Ventilation Repair', status: 'completed', owner: 'SUB · Apex M&E', sub: true, scheduledEnd: '2026-09-13T12:00:00+01:00', completedAt: '2026-09-13T13:10:00+01:00', invoiceStatus: 'pending', value: 310, handoverMissing: true, events: [['13 Sep', 'Subcontractor completed work'], ['13 Sep', 'Photos missing']] },
  { id: 'J-1051', customer: 'Central Foods Distribution', service: 'Cold Room Breakdown', status: 'in_progress', owner: 'Martin', sub: false, scheduledEnd: '2026-09-15T12:30:00+01:00', completedAt: null, invoiceStatus: null, value: 850, handoverMissing: false, events: [['11:04', 'Engineer en route'], ['11:42', 'Work started']] },
  { id: 'J-1052', customer: 'Arden House', service: 'Emergency Lighting Test', status: 'en_route', owner: 'SUB · BrightSpark', sub: true, scheduledEnd: '2026-09-15T13:30:00+01:00', completedAt: null, invoiceStatus: null, value: 420, handoverMissing: false, events: [['12:30', 'Job assigned'], ['13:05', 'Subcontractor en route']] },
  { id: 'J-1053', customer: 'Oakwood Medical Centre', service: 'AHU Filter Change', status: 'not_started', owner: 'Alicia', sub: false, scheduledEnd: '2026-09-15T13:45:00+01:00', completedAt: null, invoiceStatus: null, value: 260, handoverMissing: false, events: [['11:45', 'Job scheduled']] },
  { id: 'J-1054', customer: 'Riverside Dental Practice', service: 'Reactive Callout', status: 'scheduled', owner: 'James', sub: false, scheduledEnd: '2026-09-15T16:30:00+01:00', completedAt: null, invoiceStatus: null, value: 520, handoverMissing: false, events: [['12:12', 'Job booked']] },
  { id: 'J-1055', customer: 'Meridian Office Park', service: 'Water Hygiene Compliance Visit', status: 'scheduled', owner: 'Martin', sub: false, scheduledEnd: '2026-09-15T19:45:00+01:00', completedAt: null, invoiceStatus: null, value: 450, handoverMissing: false, events: [['14:05', 'Quarterly compliance visit scheduled']] },
];

const state = { overview: null, selfTest: null, error: null, filter: 'All' };
const app = document.querySelector('#app');
const sevRank = { critical: 4, high: 3, medium: 2, low: 1 };
const riskClass = (r) => r.toLowerCase();
const sev = (s) => `<span class="severity ${s}"><span class="sev-dot" style="background:${s === 'critical' ? '#c43b47' : s === 'high' ? '#d05a32' : s === 'medium' ? '#b7791f' : '#178a5b'}"></span>${s[0].toUpperCase() + s.slice(1)}</span>`;
const riskBadge = (r) => `<span class="risk ${riskClass(r)}">${r}</span>`;
const ownerBadge = (j) => `<span class="badge ${j.sub ? 'sub' : ''}">${j.owner}</span>`;

function operationalExceptions() {
  const scheduling = jobs
    .filter((j) => ['in_progress', 'en_route', 'not_started'].includes(j.status) && new Date(j.scheduledEnd) < DEMO_NOW)
    .map((j) => ({ job: j, severity: hours(DEMO_NOW - new Date(j.scheduledEnd)) > 1 ? 'critical' : 'high', risk: 'Scheduling', message: `Planned finish ${ageLabel(j.scheduledEnd)} ago but job is ${j.status.replace('_', ' ')}`, since: j.scheduledEnd }));
  const handover = jobs.filter((j) => j.handoverMissing).map((j) => ({ job: j, severity: days(DEMO_NOW - new Date(j.completedAt)) > 2 ? 'critical' : 'high', risk: 'Handover', message: 'Completed job is missing required handover evidence', since: j.completedAt }));
  const billing = jobs.filter((j) => j.status === 'completed' && j.invoiceStatus === 'pending').map((j) => ({ job: j, severity: days(DEMO_NOW - new Date(j.completedAt)) >= 3 ? 'critical' : days(DEMO_NOW - new Date(j.completedAt)) >= 1 ? 'high' : 'medium', risk: 'Billing', message: `${money.format(j.value)} completed work not yet invoiced`, since: j.completedAt }));
  const visibility = jobs.filter((j) => j.status === 'completed' && j.events.length < 2).map((j) => ({ job: j, severity: 'medium', risk: 'Visibility', message: 'Low job-event visibility', since: j.completedAt }));
  return { scheduling, handover, billing, visibility };
}

function liveComplianceExceptions() {
  const overview = state.overview;
  if (!overview) return [];
  const formMap = new Map((overview.formTypes || []).map((f) => [f.id, f]));
  const apiJobMap = new Map((overview.jobs || []).map((j) => [j.id, j]));
  const groups = new Map();

  for (const instance of overview.formInstances || []) {
    const key = `${instance.jobId}:${instance.formTypeId}`;
    const group = groups.get(key) || { jobId: instance.jobId, formTypeId: instance.formTypeId, instances: [] };
    group.instances.push(instance);
    groups.set(key, group);
  }

  const result = [];
  for (const group of groups.values()) {
    const incomplete = group.instances.filter((i) => i.status !== 'completed');
    if (incomplete.length === 0) continue;
    const apiJob = apiJobMap.get(group.jobId);
    const displayId = apiJob?.displayId || group.jobId;
    const job = jobs.find((j) => j.id === displayId) || {
      id: displayId, customer: apiJob?.customer || 'Compliance job', service: apiJob?.serviceType || 'Compliance visit',
      status: apiJob?.status || 'scheduled', owner: 'Office', sub: false, scheduledEnd: DEMO_NOW.toISOString(), value: 0, events: [],
    };
    const completed = group.instances.length - incomplete.length;
    const formName = formMap.get(group.formTypeId)?.name || group.formTypeId;
    const severity = job.status === 'completed' ? 'critical' : completed > 0 ? 'high' : 'medium';
    result.push({
      job, severity, risk: 'Compliance',
      message: `${formName}: ${completed}/${group.instances.length} instances complete`,
      since: incomplete.map((i) => i.submittedAt).filter(Boolean).sort()[0] || '2026-09-15T11:08:00+01:00',
    });
  }
  return result;
}

function allExceptions() {
  const op = operationalExceptions();
  return [...op.scheduling, ...op.handover, ...op.billing, ...liveComplianceExceptions(), ...op.visibility]
    .sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || new Date(a.since) - new Date(b.since));
}

function exceptionRows(filter = 'All') {
  return allExceptions().filter((e) => filter === 'All' || e.risk === filter).map((e) => `
    <tr><td>${sev(e.severity)}</td><td>${riskBadge(e.risk)}</td><td><b>${e.job.id}</b><div class="muted" style="font-size:11px">${e.job.customer}</div></td><td>${e.message}</td><td>${ownerBadge(e.job)}</td><td>${ageLabel(e.since)}</td><td><button class="link" data-job="${e.job.id}">View</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No exceptions in this category.</td></tr>';
}

function compliancePanel() {
  if (state.error) return `<div class="panel"><div class="panel-head"><div><h3>Compliance Control</h3><p>Shared API unavailable.</p></div><span class="badge">Offline</span></div><div class="panel-body"><div class="muted">${state.error}</div></div></div>`;
  if (!state.overview) return `<div class="panel"><div class="panel-head"><div><h3>Compliance Control</h3><p>Loading shared compliance data…</p></div></div></div>`;

  const o = state.overview;
  const completed = (o.formInstances || []).filter((i) => i.status === 'completed').length;
  const total = (o.formInstances || []).length;
  const test = state.selfTest;
  return `<div class="panel">
    <div class="panel-head"><div><h3>Compliance Control</h3><p>Live shared data used by Ops Hub, Dispatch Board and engineer mobile.</p></div><span class="badge">${completed}/${total} instances complete</span></div>
    <div class="panel-body">
      <div class="kpis" style="margin:0 0 16px">
        <div class="kpi"><div class="label">Sites</div><div class="value">${o.sites.length}</div><div class="detail">${o.siteAssets.length} active assets</div></div>
        <div class="kpi"><div class="label">Form catalogue</div><div class="value">${o.formTypes.length}</div><div class="detail">Versioned dynamic schemas</div></div>
        <div class="kpi"><div class="label">Job templates</div><div class="value">${o.jobTemplates.length}</div><div class="detail">Automatic form attachment</div></div>
        <div class="kpi"><div class="label">Dynamic engine</div><div class="value">${test ? `${test.passed}/${test.total}` : '…'}</div><div class="detail">${test?.ok ? 'Self-test passing' : 'Checking schema engine'}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Form type</th><th>Category</th><th>Frequency</th><th>Version</th><th>Required by</th></tr></thead><tbody>
        ${o.formTypes.map((f) => `<tr><td><b>${f.name}</b><div class="muted" style="font-size:11px">${f.regulatoryTag || 'No regulatory tag'}</div></td><td>${f.category.replaceAll('_', ' ')}</td><td>${f.frequency}</td><td>v${f.currentVersion}</td><td>${o.jobTemplates.filter((t) => t.requiredFormTypeIds.includes(f.id)).map((t) => t.name).join(', ') || '—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
  </div>`;
}

function render() {
  const exceptions = allExceptions();
  const op = operationalExceptions();
  const critical = exceptions.filter((e) => e.severity === 'critical').length;
  const breached = op.scheduling.length;
  const atRisk = jobs.filter((j) => ['in_progress', 'en_route'].includes(j.status) && new Date(j.scheduledEnd) >= DEMO_NOW).length;
  const onTrack = jobs.length - breached - atRisk;
  const riskCounts = exceptions.reduce((m, e) => (m[e.job.id] = (m[e.job.id] || 0) + 1, m), {});
  const pendingWip = jobs.filter((j) => j.status === 'completed' && j.invoiceStatus === 'pending');
  const totalWip = pendingWip.reduce((s, j) => s + j.value, 0);
  const avgWipAge = pendingWip.reduce((s, j) => s + days(DEMO_NOW - new Date(j.completedAt)), 0) / Math.max(1, pendingWip.length);
  const oldestWip = Math.max(...pendingWip.map((j) => days(DEMO_NOW - new Date(j.completedAt))));
  const bucketDefs = [['0–1d', 0, 1], ['1–2d', 1, 2], ['2–3d', 2, 3], ['3d+', 3, 999]];
  const buckets = bucketDefs.map(([label, min, max]) => ({ label, value: pendingWip.filter((j) => { const d = days(DEMO_NOW - new Date(j.completedAt)); return d >= min && d < max; }).reduce((s, j) => s + j.value, 0) }));
  const complianceGaps = liveComplianceExceptions().length;

  app.innerHTML = `<div class="shell">
    <header class="topbar"><div class="brand"><div class="brandmark">V</div><div><h1>Ops Hub</h1><small>Director exception control · Apex Climate Services</small></div></div><div class="top-actions"><span class="pill live"><span class="dot"></span>LIVE · shared compliance API</span><span class="pill owner">Owner view</span></div></header>
    <main>
      <section class="hero"><div class="hero-copy"><div class="eyebrow">Owner control centre</div><h2>Know what needs intervention before the office starts chasing it.</h2><p>One view across scheduling, handovers, job visibility, billing and compliance. Compliance status now comes from the same API used by the engineer workflow.</p><div class="director-qs"><div class="q"><b>01</b> Which jobs are slipping right now?</div><div class="q"><b>02</b> What completed work is still waiting to become cash?</div><div class="q"><b>03</b> Which required forms are incomplete right now?</div></div></div><div class="hero-side panel"><div><div class="eyebrow">Open exceptions</div><div class="metric-big">${exceptions.length}</div><div class="muted">${critical} critical · ${exceptions.filter((e) => e.severity === 'high').length} high</div></div><div><div class="eyebrow">Schedule adherence</div><div class="metric-big">${onTrack} / ${jobs.length}</div><div class="muted">${atRisk} at risk · ${breached} breached</div></div></div></section>
      <section class="kpis"><div class="kpi"><div class="label">Unbilled WIP</div><div class="value">${money.format(totalWip)}</div><div class="detail">Completed work awaiting invoice</div></div><div class="kpi"><div class="label">Avg unbilled age</div><div class="value">${avgWipAge.toFixed(1)}d</div><div class="detail">Oldest ${oldestWip.toFixed(1)}d</div></div><div class="kpi"><div class="label">Handover gaps</div><div class="value">${op.handover.length}</div><div class="detail">Completed jobs missing evidence</div></div><div class="kpi"><div class="label">Compliance gaps</div><div class="value">${complianceGaps}</div><div class="detail">Live required forms incomplete</div></div><div class="kpi"><div class="label">Subcontractor jobs</div><div class="value">${jobs.filter((j) => j.sub).length}</div><div class="detail">Live cross-party coordination</div></div></section>
      <section class="section panel"><div class="panel-head"><div><h3>Exception Dashboard</h3><p>One row per operational risk. Compliance rows refresh from the shared backend.</p></div><div class="tabs"><button class="tab ${state.filter === 'All' ? 'active' : ''}" data-filter="All">All</button>${['Scheduling', 'Visibility', 'Handover', 'Billing', 'Compliance'].map((r) => `<button class="tab ${state.filter === r ? 'active' : ''}" data-filter="${r}">${r}</button>`).join('')}</div></div><div class="panel-body table-wrap"><table><thead><tr><th>Severity</th><th>Risk</th><th>Job</th><th>Exception</th><th>Owner</th><th>Age</th><th></th></tr></thead><tbody id="exceptionRows">${exceptionRows(state.filter)}</tbody></table></div></section>
      <section class="section panel"><div class="panel-head"><div><h3>All Jobs</h3><p>Cross-job visibility without opening the dispatch board.</p></div></div><div class="panel-body table-wrap"><table><thead><tr><th>Job</th><th>Customer</th><th>Status</th><th>Owner</th><th>Planned finish</th><th>Value</th><th>Risks</th><th></th></tr></thead><tbody>${jobs.map((j) => `<tr><td><b>${j.id}</b></td><td>${j.customer}<div class="muted" style="font-size:11px">${j.service}</div></td><td>${j.status.replace('_', ' ')}</td><td>${ownerBadge(j)}</td><td>${dateLabel(j.scheduledEnd)}</td><td>${money.format(j.value)}</td><td><span class="badge">${riskCounts[j.id] || 0} risk${(riskCounts[j.id] || 0) === 1 ? '' : 's'}</span></td><td><button class="link" data-job="${j.id}">View</button></td></tr>`).join('')}</tbody></table></div></section>
      <section class="section split"><div class="panel"><div class="panel-head"><div><h3>Job-to-Cash</h3><p>Age completed work from job completion, not invoice creation.</p></div></div><div class="panel-body"><div class="buckets">${buckets.map((b) => `<div class="bucket"><small>${b.label}</small><strong>${money.format(b.value)}</strong><div class="bar"><span style="width:${totalWip ? Math.max(5, b.value / totalWip * 100) : 0}%"></span></div></div>`).join('')}</div><div style="margin-top:14px" class="muted">Average unbilled age <b style="color:var(--ink)">${avgWipAge.toFixed(1)} days</b> · oldest <b style="color:var(--ink)">${oldestWip.toFixed(1)} days</b></div></div></div><div class="panel"><div class="panel-head"><div><h3>Subcontractor Control</h3><p>Externally-owned work that still needs internal visibility.</p></div></div><div class="panel-body">${jobs.filter((j) => j.sub).map((j) => `<div class="sub-row"><div><b>${j.id} · ${j.customer}</b><div class="muted">${j.service}</div></div>${ownerBadge(j)}</div>`).join('')}</div></div></section>
      <section class="section">${compliancePanel()}</section>
      <section class="section panel"><div class="panel-head"><div><h3>FSM Risk Scorecard</h3><p>Operational risk areas mapped to the intervention that removes the failure point.</p></div></div><div class="panel-body score-grid">${[
        ['Scheduling', breached ? 'CRITICAL' : 'LOW', 'Exception-led scheduling and dispatch'],
        ['Visibility', op.visibility.length ? 'HIGH' : 'LOW', 'Single live job record'],
        ['Handover', op.handover.length ? 'CRITICAL' : 'LOW', 'Mandatory field capture before completion'],
        ['Billing', totalWip > 2500 ? 'CRITICAL' : 'MEDIUM', 'Completed-job readiness and invoice handoff'],
        ['Compliance', complianceGaps ? 'CRITICAL' : 'LOW', 'Dynamic required forms + live completion control'],
      ].map(([r, level, fix]) => `<div class="score"><div>${riskBadge(r)}</div><strong>${level}</strong><p>${fix}</p></div>`).join('')}</div></section>
    </main><div id="drawer" class="drawer"></div></div>`;

  bind();
}

function bind() {
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; render(); }));
  document.querySelectorAll('[data-job]').forEach((button) => button.addEventListener('click', () => openJob(button.dataset.job)));
}

function openJob(id) {
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  const drawer = document.querySelector('#drawer');
  drawer.className = 'drawer open';
  drawer.innerHTML = `<div class="drawer-backdrop" data-close></div><aside><div class="drawer-head"><div><div class="eyebrow">${job.id}</div><h3>${job.customer}</h3><p>${job.service}</p></div><button class="close" data-close>×</button></div><div class="drawer-body"><div class="detail-grid"><div><small>Status</small><b>${job.status.replace('_', ' ')}</b></div><div><small>Owner</small><b>${job.owner}</b></div><div><small>Value</small><b>${money.format(job.value)}</b></div><div><small>Risks</small><b>${allExceptions().filter((e) => e.job.id === id).length}</b></div></div><h4>Timeline</h4>${job.events.map(([time, text]) => `<div class="timeline"><b>${time}</b><span>${text}</span></div>`).join('') || '<div class="muted">No events yet.</div>'}</div></aside>`;
  drawer.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => { drawer.className = 'drawer'; drawer.innerHTML = ''; }));
}

async function loadSharedCompliance() {
  try {
    const [overviewRes, testRes] = await Promise.all([
      fetch('/api/v1/compliance/overview', { cache: 'no-store' }),
      fetch('/api/v1/compliance/self-test', { cache: 'no-store' }),
    ]);
    if (!overviewRes.ok) throw new Error(`Compliance API HTTP ${overviewRes.status}`);
    state.overview = await overviewRes.json();
    state.selfTest = testRes.ok ? await testRes.json() : null;
    state.error = null;
  } catch (error) {
    state.error = error?.message || 'Unable to load shared compliance data';
  }
  render();
}

render();
loadSharedCompliance();
setInterval(loadSharedCompliance, 15000);
