const REPORTS_YEAR_ALL = 'all';
const REPORTS_STATUS_ALL = 'all';

const reportsState = {
  overview: null,
  exports: [],
  submissions: [],
  filters: { siteId:'all', formTypeId:'all', year:REPORTS_YEAR_ALL, status:REPORTS_STATUS_ALL },
  loading: false,
};

function reportsEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

async function reportsFetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache:'no-store',
    headers:{ 'Content-Type':'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

function reportsEnsureShell() {
  let shell = document.getElementById('complianceReportsShell');
  if (shell) return shell;
  shell = document.createElement('section');
  shell.id = 'complianceReportsShell';
  shell.className = 'compliance-reports-shell';
  shell.setAttribute('aria-hidden','true');
  shell.innerHTML = `
    <div class="reports-page">
      <header class="reports-header">
        <div>
          <div class="reports-eyebrow">Compliance administration</div>
          <h1>Compliance Reports</h1>
          <p>Find, review and export annual compliance records across every customer and site.</p>
        </div>
        <button class="reports-close" type="button" data-reports-close aria-label="Close compliance reports">×</button>
      </header>
      <div class="reports-content">
        <section class="reports-kpis" id="reportsKpis"></section>
        <section class="reports-filter-card">
          <div class="reports-filter-head">
            <div><h2>Report library</h2><p>Filter the shared compliance record, then export the exact site and form set you need.</p></div>
            <button class="reports-refresh" type="button" data-reports-refresh>Refresh</button>
          </div>
          <div class="reports-filters" id="reportsFilters"></div>
        </section>
        <section class="reports-table-card">
          <div class="reports-table-head"><div><h2>Available report groups</h2><p id="reportsResultSummary">Loading compliance records…</p></div></div>
          <div class="reports-table-wrap" id="reportsTableWrap"></div>
        </section>
        <section class="reports-files-card">
          <div class="reports-table-head"><div><h2>Recently generated files</h2><p>Previously generated PDF and Excel files remain available from one place.</p></div></div>
          <div id="reportsFiles"></div>
        </section>
      </div>
    </div>`;
  document.body.appendChild(shell);
  return shell;
}

function reportsCustomerForSite(overview, siteId) {
  const names = [...new Set((overview.jobs || []).filter(j => j.siteId === siteId && j.customer).map(j => j.customer))];
  return names[0] || overview.sites?.find(s => s.id === siteId)?.name || 'Customer';
}

function reportsYears(overview) {
  const years = [...new Set((overview.formInstances || []).map(i => String(i.period || i.submittedAt || '').slice(0,4)).filter(y => /^\d{4}$/.test(y)))];
  return years.sort((a,b) => Number(b) - Number(a));
}

function reportsFilterOptions() {
  const o = reportsState.overview;
  if (!o) return '';
  const f = reportsState.filters;
  const sites = (o.sites || []).filter(s => s.active !== false).sort((a,b) => a.name.localeCompare(b.name));
  const forms = (o.formTypes || []).filter(x => x.active !== false).sort((a,b) => a.name.localeCompare(b.name));
  const years = reportsYears(o);
  return `
    <label class="reports-filter"><span>Customer / site</span><select data-report-filter="siteId"><option value="all">All customers & sites</option>${sites.map(site => `<option value="${reportsEscape(site.id)}" ${f.siteId===site.id?'selected':''}>${reportsEscape(reportsCustomerForSite(o, site.id))} — ${reportsEscape(site.name)}</option>`).join('')}</select></label>
    <label class="reports-filter"><span>Form type</span><select data-report-filter="formTypeId"><option value="all">All form types</option>${forms.map(form => `<option value="${reportsEscape(form.id)}" ${f.formTypeId===form.id?'selected':''}>${reportsEscape(form.name)}</option>`).join('')}</select></label>
    <label class="reports-filter"><span>Year</span><select data-report-filter="year"><option value="all">All years</option>${years.map(year => `<option value="${year}" ${f.year===year?'selected':''}>${year}</option>`).join('')}</select></label>
    <label class="reports-filter"><span>Status</span><select data-report-filter="status"><option value="all">All statuses</option><option value="completed" ${f.status==='completed'?'selected':''}>Completed</option><option value="in_progress" ${f.status==='in_progress'?'selected':''}>In progress</option><option value="not_started" ${f.status==='not_started'?'selected':''}>Not started</option></select></label>`;
}

function reportsQuery() {
  const params = new URLSearchParams();
  const f = reportsState.filters;
  if (f.siteId !== 'all') params.set('siteId', f.siteId);
  if (f.formTypeId !== 'all') params.set('formTypeId', f.formTypeId);
  if (f.year !== REPORTS_YEAR_ALL) params.set('year', f.year);
  if (f.status !== REPORTS_STATUS_ALL) params.set('status', f.status);
  const query = params.toString();
  return `/api/v1/submissions${query ? `?${query}` : ''}`;
}

function reportsFullCounts(siteId, formTypeId, year) {
  const rows = (reportsState.overview?.formInstances || []).filter(i => i.siteId === siteId && i.formTypeId === formTypeId && String(i.period || '').startsWith(`${year}-`));
  return {
    total: rows.length,
    completed: rows.filter(i => i.status === 'completed').length,
    inProgress: rows.filter(i => i.status === 'in_progress').length,
    notStarted: rows.filter(i => i.status === 'not_started').length,
  };
}

function reportsGroups() {
  const o = reportsState.overview;
  if (!o) return [];
  const siteMap = new Map((o.sites || []).map(s => [s.id,s]));
  const formMap = new Map((o.formTypes || []).map(f => [f.id,f]));
  const groups = new Map();
  for (const row of reportsState.submissions) {
    const year = String(row.period || row.submittedAt || '').slice(0,4);
    if (!/^\d{4}$/.test(year)) continue;
    const key = `${row.siteId}|${row.formTypeId}|${year}`;
    if (!groups.has(key)) groups.set(key, { siteId:row.siteId, formTypeId:row.formTypeId, year, matches:[], latest:null });
    const group = groups.get(key);
    group.matches.push(row);
    const stamp = row.submittedAt || `${row.period || `${year}-01`}-01T00:00:00Z`;
    if (!group.latest || String(stamp) > String(group.latest)) group.latest = stamp;
  }
  return [...groups.values()].map(group => {
    const site = siteMap.get(group.siteId) || { id:group.siteId, name:group.siteId };
    const form = formMap.get(group.formTypeId) || { id:group.formTypeId, name:group.formTypeId, regulatoryTag:'' };
    const counts = reportsFullCounts(group.siteId, group.formTypeId, group.year);
    return { ...group, site, form, customer:reportsCustomerForSite(o, group.siteId), counts };
  }).sort((a,b) => a.customer.localeCompare(b.customer) || a.site.name.localeCompare(b.site.name) || a.form.name.localeCompare(b.form.name) || Number(b.year)-Number(a.year));
}

function reportsGroupStatus(counts) {
  if (!counts.total) return { label:'No records', tone:'neutral' };
  if (counts.completed === counts.total) return { label:'Complete', tone:'complete' };
  if (counts.inProgress > 0) return { label:'In progress', tone:'progress' };
  if (counts.completed > 0) return { label:'Part complete', tone:'progress' };
  return { label:'Not started', tone:'outstanding' };
}

function reportsDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return reportsEscape(String(value));
  return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(date);
}

function reportsRenderKpis(groups) {
  const o = reportsState.overview;
  const totalInstances = (o?.formInstances || []).length;
  const completed = (o?.formInstances || []).filter(i => i.status === 'completed').length;
  const activeSites = new Set(groups.map(g => g.siteId)).size;
  const completion = totalInstances ? Math.round(completed / totalInstances * 100) : 0;
  document.getElementById('reportsKpis').innerHTML = `
    <article><span>Visible report groups</span><strong>${groups.length}</strong><small>After current filters</small></article>
    <article><span>Sites represented</span><strong>${activeSites}</strong><small>Customer / site records</small></article>
    <article><span>Compliance completion</span><strong>${completion}%</strong><small>${completed} of ${totalInstances} instances complete</small></article>
    <article><span>Generated files</span><strong>${reportsState.exports.length}</strong><small>PDF and Excel archive</small></article>`;
}

function reportsRenderTable(groups) {
  const wrap = document.getElementById('reportsTableWrap');
  const summary = document.getElementById('reportsResultSummary');
  if (!groups.length) {
    summary.textContent = 'No report groups match the selected filters.';
    wrap.innerHTML = '<div class="reports-empty">No compliance records match this filter combination.</div>';
    return;
  }
  summary.textContent = `${groups.length} report group${groups.length===1?'':'s'} available. Exporting always uses the complete annual record for that site and form.`;
  wrap.innerHTML = `<table class="reports-table"><thead><tr><th>Customer / site</th><th>Form type</th><th>Year</th><th>Status</th><th>Records</th><th>Last activity</th><th>Export</th></tr></thead><tbody>${groups.map(group => {
    const status = reportsGroupStatus(group.counts);
    return `<tr>
      <td><div class="reports-primary"><b>${reportsEscape(group.customer)}</b><span>${reportsEscape(group.site.name)}</span></div></td>
      <td><div class="reports-primary"><b>${reportsEscape(group.form.name)}</b><span>${reportsEscape(group.form.regulatoryTag || group.form.category?.replaceAll('_',' ') || 'Compliance')}</span></div></td>
      <td><strong>${group.year}</strong></td>
      <td><span class="reports-status ${status.tone}">${status.label}</span><small class="reports-counts">${group.counts.completed}/${group.counts.total} complete</small></td>
      <td><strong>${group.matches.length}</strong><small class="reports-counts">matching current filters</small></td>
      <td>${reportsDate(group.latest)}</td>
      <td><div class="reports-actions"><button type="button" class="reports-export pdf" data-report-export="pdf" data-site="${reportsEscape(group.siteId)}" data-form="${reportsEscape(group.formTypeId)}" data-year="${group.year}">PDF</button><button type="button" class="reports-export xlsx" data-report-export="xlsx" data-site="${reportsEscape(group.siteId)}" data-form="${reportsEscape(group.formTypeId)}" data-year="${group.year}">Excel</button></div></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function reportsFileSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(1)} MB`;
}

function reportsRenderFiles() {
  const host = document.getElementById('reportsFiles');
  const files = reportsState.exports.slice(0,10);
  if (!files.length) {
    host.innerHTML = '<div class="reports-empty compact">No files have been generated yet. Use a PDF or Excel action above.</div>';
    return;
  }
  host.innerHTML = `<div class="reports-file-list">${files.map(file => `<a href="${reportsEscape(file.url)}" class="reports-file" download><span class="reports-file-icon">${/\.pdf$/i.test(file.name)?'PDF':'XLS'}</span><span><b>${reportsEscape(file.name)}</b><small>${reportsDate(file.modifiedAt)} · ${reportsFileSize(file.size)}</small></span><span class="reports-file-arrow">↓</span></a>`).join('')}</div>`;
}

function reportsRender() {
  const groups = reportsGroups();
  document.getElementById('reportsFilters').innerHTML = reportsFilterOptions();
  reportsRenderKpis(groups);
  reportsRenderTable(groups);
  reportsRenderFiles();
}

async function reportsLoad({ refreshOverview = false } = {}) {
  if (reportsState.loading) return;
  reportsState.loading = true;
  const summary = document.getElementById('reportsResultSummary');
  if (summary) summary.textContent = 'Loading compliance records…';
  try {
    if (!reportsState.overview || refreshOverview) reportsState.overview = await reportsFetchJson('/api/v1/compliance/overview');
    const [submissions, exports] = await Promise.all([
      reportsFetchJson(reportsQuery()),
      reportsFetchJson('/api/v1/exports'),
    ]);
    reportsState.submissions = Array.isArray(submissions) ? submissions : [];
    reportsState.exports = Array.isArray(exports) ? exports : [];
    reportsRender();
  } catch (error) {
    if (summary) summary.textContent = error.message || 'Unable to load compliance reports.';
    const wrap = document.getElementById('reportsTableWrap');
    if (wrap) wrap.innerHTML = `<div class="reports-error">${reportsEscape(error.message || 'Unable to load compliance reports.')}</div>`;
  } finally {
    reportsState.loading = false;
  }
}

async function reportsOpen() {
  const shell = reportsEnsureShell();
  shell.classList.add('open');
  shell.setAttribute('aria-hidden','false');
  document.body.classList.add('reports-open');
  await reportsLoad({ refreshOverview:true });
}

function reportsClose() {
  const shell = document.getElementById('complianceReportsShell');
  if (!shell) return;
  shell.classList.remove('open');
  shell.setAttribute('aria-hidden','true');
  document.body.classList.remove('reports-open');
}

function reportsDownload(url) {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function reportsExport(button) {
  const format = button.dataset.reportExport;
  const siteId = button.dataset.site;
  const formTypeId = button.dataset.form;
  const year = button.dataset.year;
  if (!format || !siteId || !formTypeId || !year) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const result = await reportsFetchJson('/api/v1/exports', {
      method:'POST',
      body:JSON.stringify({ siteId, formTypeId, year:Number(year), format }),
    });
    const file = format === 'pdf' ? result.pdf : result.xlsx;
    if (!file?.url) throw new Error(`${format.toUpperCase()} export was not returned`);
    reportsDownload(file.url);
    reportsState.exports = await reportsFetchJson('/api/v1/exports');
    reportsRenderFiles();
    reportsRenderKpis(reportsGroups());
  } catch (error) {
    button.textContent = 'Failed';
    setTimeout(() => { button.textContent = original; }, 1500);
    return;
  } finally {
    button.disabled = false;
    if (button.textContent !== 'Failed') button.textContent = original;
  }
}

function reportsEnhanceNav() {
  document.querySelectorAll('[data-nav="reports"]').forEach(button => {
    if (button.textContent !== 'Compliance Reports') button.textContent = 'Compliance Reports';
    button.setAttribute('title','Open the central compliance report library');
  });
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-nav="reports"]');
  if (!nav) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  reportsOpen();
}, true);

document.addEventListener('click', event => {
  const close = event.target.closest('[data-reports-close]');
  if (close) return reportsClose();
  const refresh = event.target.closest('[data-reports-refresh]');
  if (refresh) return reportsLoad({ refreshOverview:true });
  const exportButton = event.target.closest('[data-report-export]');
  if (exportButton) return reportsExport(exportButton);
});

document.addEventListener('change', event => {
  const filter = event.target.closest('[data-report-filter]');
  if (!filter) return;
  reportsState.filters[filter.dataset.reportFilter] = filter.value;
  reportsLoad();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('complianceReportsShell')?.classList.contains('open')) reportsClose();
});

reportsEnhanceNav();
const reportsApp = document.getElementById('app');
if (reportsApp) new MutationObserver(reportsEnhanceNav).observe(reportsApp,{childList:true,subtree:true});
