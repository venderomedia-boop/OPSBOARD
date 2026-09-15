const STUDIO_JOB_ID = 'job-7';
let studioState = null;
let studioCounter = 0;

const palette = [
  { type:'text', label:'Short text', group:'field', icon:'Aa' },
  { type:'number', label:'Number', group:'field', icon:'#' },
  { type:'select', label:'Select', group:'field', icon:'⌄' },
  { type:'pass_fail', label:'Pass / fail', group:'field', icon:'✓' },
  { type:'date', label:'Date', group:'field', icon:'◷' },
  { type:'notes', label:'Notes', group:'section', icon:'≡' },
  { type:'asset_checklist', label:'Asset checklist', group:'asset', icon:'☑' },
  { type:'asset_matrix', label:'Asset matrix', group:'asset', icon:'▦' },
];

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function slug(value) {
  return String(value || 'field').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48) || 'field';
}

function uid(prefix='block') {
  studioCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${studioCounter}`;
}

function initialStudioState() {
  return {
    name:'Outlet Condition Check',
    category:'water_hygiene',
    frequency:'quarterly',
    regulatoryTag:'Client standard',
    attach:true,
    selectedId:null,
    blocks:[
      { id:uid('asset'), type:'asset_checklist', label:'Outlet condition', assetType:'tap' },
      { id:uid('notes'), type:'notes', label:'Notes', defaultText:'' },
      { id:uid('field'), type:'text', label:'Engineer initials', required:true },
    ],
  };
}

function ensureStudio() {
  const host = document.querySelector('.showcase-studio');
  if (!host || host.dataset.enhanced === 'true') return;
  host.dataset.enhanced = 'true';
  studioState = initialStudioState();
  renderStudio(host);
}

function paletteMarkup() {
  return palette.map(item => `<button class="studio-palette-item" draggable="true" data-studio-palette="${item.type}"><span>${item.icon}</span><b>${item.label}</b><small>${item.group === 'asset' ? 'Uses site assets' : item.group === 'field' ? 'Form-level field' : 'Form section'}</small></button>`).join('');
}

function blockMarkup(block, index) {
  const selected = studioState.selectedId === block.id ? ' selected' : '';
  const meta = block.type === 'asset_checklist' ? `Checklist · ${block.assetType}` : block.type === 'asset_matrix' ? `Matrix · ${block.assetType}` : block.type === 'notes' ? 'Long notes section' : `${block.type.replace('_',' ')}${block.required ? ' · required' : ''}`;
  return `<div class="studio-block${selected}" draggable="true" data-studio-block="${block.id}" data-studio-index="${index}">
    <button class="studio-drag" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</button>
    <button class="studio-block-main" data-studio-select="${block.id}"><span class="studio-block-type">${esc(block.type.replaceAll('_',' '))}</span><b>${esc(block.label)}</b><small>${esc(meta)}</small></button>
    <button class="studio-block-delete" data-studio-delete="${block.id}" aria-label="Remove">×</button>
  </div>`;
}

function selectedBlock() {
  return studioState.blocks.find(block => block.id === studioState.selectedId) || null;
}

function settingsMarkup() {
  const block = selectedBlock();
  if (!block) return `<div class="studio-empty-settings"><b>Block settings</b><p>Select a block on the canvas to edit its label, validation and asset behaviour.</p></div>`;
  const required = ['text','number','select','pass_fail','date'].includes(block.type);
  const asset = ['asset_checklist','asset_matrix'].includes(block.type);
  return `<div class="studio-settings-card">
    <div class="studio-settings-title"><span>Selected block</span><b>${esc(block.type.replaceAll('_',' '))}</b></div>
    <label><span>Label</span><input data-studio-prop="label" value="${esc(block.label)}" /></label>
    ${required ? `<label class="studio-toggle"><input type="checkbox" data-studio-prop="required" ${block.required ? 'checked':''}/><span>Required before submission</span></label>` : ''}
    ${block.type === 'select' ? `<label><span>Options</span><input data-studio-prop="options" value="${esc((block.options || ['Pass','Attention required']).join(', '))}" /><small>Comma-separated</small></label>` : ''}
    ${asset ? `<label><span>Asset type</span><select data-studio-prop="assetType"><option value="tap" ${block.assetType==='tap'?'selected':''}>Tap / outlet</option><option value="shower" ${block.assetType==='shower'?'selected':''}>Shower</option><option value="luminaire" ${block.assetType==='luminaire'?'selected':''}>Luminaire</option><option value="tank" ${block.assetType==='tank'?'selected':''}>Tank</option><option value="boiler" ${block.assetType==='boiler'?'selected':''}>Boiler</option><option value="other" ${block.assetType==='other'?'selected':''}>Other</option></select></label>` : ''}
    ${block.type === 'asset_matrix' ? `<label><span>Matrix columns</span><input data-studio-prop="columns" value="${esc((block.columns || ['Reading A','Reading B']).join(', '))}" /><small>Each column becomes an answer key.</small></label>` : ''}
    ${block.type === 'notes' ? `<label><span>Instruction text</span><textarea data-studio-prop="defaultText">${esc(block.defaultText || '')}</textarea></label>` : ''}
  </div>`;
}

function previewControl(block) {
  if (block.type === 'asset_checklist') return `<div class="studio-preview-asset"><span>5th Floor WC - WHB 1</span><div><button>Pass</button><button>Fail</button></div></div>`;
  if (block.type === 'asset_matrix') return `<div class="studio-preview-asset"><span>5th Floor WC - WHB 1</span><div class="studio-preview-matrix">${(block.columns || ['Reading A','Reading B']).map(col=>`<label><small>${esc(col)}</small><input placeholder="0" disabled /></label>`).join('')}</div></div>`;
  if (block.type === 'notes') return `<label class="studio-preview-field"><span>${esc(block.label)}</span>${block.defaultText ? `<small>${esc(block.defaultText)}</small>`:''}<textarea disabled></textarea></label>`;
  if (block.type === 'select' || block.type === 'pass_fail') return `<label class="studio-preview-field"><span>${esc(block.label)}${block.required?' *':''}</span><select disabled><option>Choose…</option></select></label>`;
  return `<label class="studio-preview-field"><span>${esc(block.label)}${block.required?' *':''}</span><input type="${block.type==='number'?'number':block.type==='date'?'date':'text'}" disabled /></label>`;
}

function previewMarkup() {
  return `<div class="studio-preview-shell"><div class="studio-phone"><div class="studio-phone-top"><span>Engineer mobile preview</span><b>${esc(studioState.name || 'Untitled form')}</b></div><div class="studio-phone-body">${studioState.blocks.length ? studioState.blocks.map(previewControl).join('') : '<div class="studio-preview-empty">Drop blocks onto the canvas to build the engineer form.</div>'}</div><button class="studio-preview-save" disabled>Save form</button></div></div>`;
}

function validationErrors() {
  const errors = [];
  if (!studioState.name.trim()) errors.push('Form name is required.');
  if (!studioState.blocks.length) errors.push('Add at least one block.');
  const assetBlocks = studioState.blocks.filter(block => ['asset_checklist','asset_matrix'].includes(block.type));
  if (assetBlocks.length > 1) errors.push('Use one asset block per form for the current engineer renderer.');
  const labels = studioState.blocks.map(block => block.label.trim()).filter(Boolean);
  if (labels.length !== studioState.blocks.length) errors.push('Every block needs a label.');
  const matrix = studioState.blocks.find(block => block.type === 'asset_matrix');
  if (matrix && !(matrix.columns || []).filter(Boolean).length) errors.push('Asset matrix needs at least one column.');
  return errors;
}

function renderStudio(host) {
  if (!host || !studioState) return;
  const errors = validationErrors();
  host.innerHTML = `<div class="studio-pro">
    <div class="studio-pro-head"><div><span class="studio-kicker">Dynamic Form Studio</span><h4>Build the form visually</h4><p>Drag blocks onto the canvas, configure them, preview the engineer experience, then publish to the live compliance catalogue.</p></div><div class="studio-persist-pill"><span></span>Saved forms persist across deploys</div></div>
    <div class="studio-meta-grid">
      <label><span>Form name</span><input data-studio-meta="name" value="${esc(studioState.name)}" /></label>
      <label><span>Category</span><select data-studio-meta="category"><option value="water_hygiene" ${studioState.category==='water_hygiene'?'selected':''}>Water hygiene</option><option value="emergency_lighting" ${studioState.category==='emergency_lighting'?'selected':''}>Emergency lighting</option><option value="general" ${studioState.category==='general'?'selected':''}>General compliance</option></select></label>
      <label><span>Frequency</span><select data-studio-meta="frequency"><option value="per_visit" ${studioState.frequency==='per_visit'?'selected':''}>Per visit</option><option value="monthly" ${studioState.frequency==='monthly'?'selected':''}>Monthly</option><option value="quarterly" ${studioState.frequency==='quarterly'?'selected':''}>Quarterly</option><option value="annual" ${studioState.frequency==='annual'?'selected':''}>Annual</option></select></label>
      <label><span>Regulatory tag</span><input data-studio-meta="regulatoryTag" value="${esc(studioState.regulatoryTag)}" /></label>
    </div>
    <div class="studio-builder-grid">
      <aside class="studio-palette"><div class="studio-column-head"><b>Blocks</b><small>Drag onto canvas</small></div>${paletteMarkup()}</aside>
      <section class="studio-canvas-wrap"><div class="studio-column-head"><b>Form canvas</b><small>${studioState.blocks.length} block${studioState.blocks.length===1?'':'s'}</small></div><div class="studio-canvas ${studioState.blocks.length?'':'empty'}" data-studio-dropzone>${studioState.blocks.length ? studioState.blocks.map(blockMarkup).join('') : '<div class="studio-drop-empty"><b>Drop a block here</b><span>Start with an asset checklist, matrix, or field.</span></div>'}</div><button class="studio-add-notes" data-studio-quick="notes">+ Add notes section</button></section>
      <aside class="studio-properties"><div class="studio-column-head"><b>Properties</b><small>Selected block</small></div>${settingsMarkup()}</aside>
    </div>
    <div class="studio-preview-section"><div class="studio-column-head"><b>Live engineer preview</b><small>Updates as you edit</small></div>${previewMarkup()}</div>
    <div class="studio-publish-bar"><label class="studio-attach"><input type="checkbox" data-studio-meta="attach" ${studioState.attach?'checked':''}/><span>Attach to J-1055 quarterly compliance visit after publishing</span></label><div class="studio-publish-status">${errors.length ? `<span class="studio-errors">${errors.map(esc).join(' ')}</span>` : '<span class="studio-valid">Ready to publish</span>'}</div><button class="showcase-btn primary" data-studio-publish ${errors.length?'disabled':''}>Publish form</button></div>
  </div>`;
  bindDragHandles(host);
}

function addBlock(type, index = studioState.blocks.length) {
  const defaults = {
    text:{ type:'text', label:'Short text', required:false },
    number:{ type:'number', label:'Numeric reading', required:false },
    select:{ type:'select', label:'Select result', required:true, options:['Pass','Attention required'] },
    pass_fail:{ type:'pass_fail', label:'Pass / fail', required:true },
    date:{ type:'date', label:'Date', required:true },
    notes:{ type:'notes', label:'Notes', defaultText:'' },
    asset_checklist:{ type:'asset_checklist', label:'Asset checks', assetType:'tap' },
    asset_matrix:{ type:'asset_matrix', label:'Readings', assetType:'tap', columns:['Reading A','Reading B'] },
  };
  if (!defaults[type]) return;
  if (['asset_checklist','asset_matrix'].includes(type) && studioState.blocks.some(block => ['asset_checklist','asset_matrix'].includes(block.type))) {
    flashStudio('The current engineer renderer supports one asset-oriented block per form.', 'error');
    return;
  }
  const block = { id:uid(type), ...defaults[type] };
  studioState.blocks.splice(Math.max(0,Math.min(index,studioState.blocks.length)),0,block);
  studioState.selectedId = block.id;
  renderStudio(document.querySelector('.showcase-studio'));
}

function bindDragHandles(host) {
  host.querySelectorAll('[data-studio-palette]').forEach(el => el.addEventListener('dragstart', event => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-studio-palette', el.dataset.studioPalette);
  }));
  host.querySelectorAll('[data-studio-block]').forEach(el => el.addEventListener('dragstart', event => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-studio-block', el.dataset.studioBlock);
    el.classList.add('dragging');
  }));
  const drop = host.querySelector('[data-studio-dropzone]');
  if (!drop) return;
  drop.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/x-studio-block') ? 'move' : 'copy'; drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', event => {
    event.preventDefault(); drop.classList.remove('drag-over');
    const rect = drop.getBoundingClientRect();
    const children = [...drop.querySelectorAll('[data-studio-block]')];
    let index = children.findIndex(child => event.clientY < child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2);
    if (index < 0) index = studioState.blocks.length;
    const existingId = event.dataTransfer.getData('application/x-studio-block');
    const paletteType = event.dataTransfer.getData('application/x-studio-palette');
    if (existingId) {
      const from = studioState.blocks.findIndex(block => block.id === existingId);
      if (from < 0) return;
      const [block] = studioState.blocks.splice(from,1);
      if (from < index) index -= 1;
      studioState.blocks.splice(index,0,block);
      studioState.selectedId = block.id;
      renderStudio(host);
    } else if (paletteType) addBlock(paletteType,index);
  });
}

function updateProperty(input) {
  const block = selectedBlock();
  if (!block) return;
  const prop = input.dataset.studioProp;
  if (prop === 'required') block.required = input.checked;
  else if (prop === 'options') block.options = input.value.split(',').map(v=>v.trim()).filter(Boolean);
  else if (prop === 'columns') block.columns = input.value.split(',').map(v=>v.trim()).filter(Boolean);
  else block[prop] = input.value;
}

function buildSchema() {
  const sections = [];
  for (const block of studioState.blocks) {
    const id = `${slug(block.label)}-${slug(block.id).slice(-8)}`;
    if (block.type === 'asset_checklist') sections.push({ id, label:block.label, kind:'asset_checklist', appliesToAssetTypes:[block.assetType] });
    else if (block.type === 'asset_matrix') sections.push({ id, label:block.label, kind:'asset_matrix', matrixColumns:block.columns || ['Reading A','Reading B'], appliesToAssetTypes:[block.assetType] });
    else if (block.type === 'notes') sections.push({ id, label:block.label, kind:'text_area', ...(block.defaultText ? { defaultText:block.defaultText } : {}) });
    else sections.push({ id:`section-${id}`, label:block.label, kind:'fields', fields:[{ id, label:block.label, type:block.type, required:Boolean(block.required), ...(block.type==='select' ? { options:block.options || ['Pass','Attention required'] } : {}) }] });
  }
  return { sections };
}

async function api(url, options={}) {
  const res = await fetch(url,{ cache:'no-store', headers:{'Content-Type':'application/json'}, ...options });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

function flashStudio(message,tone='success') {
  let el = document.getElementById('studioFlash');
  if (!el) { el=document.createElement('div'); el.id='studioFlash'; document.body.appendChild(el); }
  el.className=`studio-flash ${tone}`;
  el.textContent=message;
  requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(flashStudio.timer);
  flashStudio.timer=setTimeout(()=>el.classList.remove('show'),2800);
}

async function publishStudio() {
  const errors = validationErrors();
  if (errors.length) return flashStudio(errors[0],'error');
  const assetBlocks = studioState.blocks.filter(block => ['asset_checklist','asset_matrix'].includes(block.type));
  const assetScope = assetBlocks.length ? 'asset' : 'site';
  const appliesToAssetTypes = [...new Set(assetBlocks.map(block=>block.assetType))];
  try {
    const created = await api('/api/v1/form-types',{ method:'POST', body:JSON.stringify({
      name:studioState.name.trim(), category:studioState.category, frequency:studioState.frequency,
      regulatoryTag:studioState.regulatoryTag.trim(), assetScope, appliesToAssetTypes, schema:buildSchema(),
    }) });
    if (studioState.attach) {
      const overview = await api('/api/v1/compliance/overview');
      const job = overview.jobs.find(item=>item.id===STUDIO_JOB_ID);
      const currentTemplate = overview.jobTemplates.find(item=>item.id===job?.jobTemplateId);
      if (job && currentTemplate) {
        const template = await api('/api/v1/job-templates',{ method:'POST', body:JSON.stringify({
          id:`jt-studio-${Date.now()}`, name:`${currentTemplate.name} + ${studioState.name.trim()}`,
          category:currentTemplate.category, requiredFormTypeIds:[...new Set([...currentTemplate.requiredFormTypeIds,created.id])],
        }) });
        await api(`/api/v1/jobs/${STUDIO_JOB_ID}/compliance-setup`,{ method:'PATCH', body:JSON.stringify({ siteId:job.siteId, jobTemplateId:template.id }) });
      }
    }
    flashStudio(`Published ${studioState.name}${studioState.attach ? ' and attached it to J-1055' : ''}.`);
    if (studioState.attach) {
      sessionStorage.setItem('ops-hub-reopen',STUDIO_JOB_ID);
      setTimeout(()=>location.reload(),700);
    } else {
      setTimeout(()=>document.querySelector('[data-demo-compliance-tab="catalogue"]')?.click(),500);
    }
  } catch (error) { flashStudio(error.message,'error'); }
}

function studioClick(event) {
  const select = event.target.closest('[data-studio-select]');
  if (select) { studioState.selectedId=select.dataset.studioSelect; return renderStudio(document.querySelector('.showcase-studio')); }
  const del = event.target.closest('[data-studio-delete]');
  if (del) { studioState.blocks=studioState.blocks.filter(block=>block.id!==del.dataset.studioDelete); if(studioState.selectedId===del.dataset.studioDelete)studioState.selectedId=null; return renderStudio(document.querySelector('.showcase-studio')); }
  const quick = event.target.closest('[data-studio-quick]');
  if (quick) return addBlock(quick.dataset.studioQuick);
  if (event.target.closest('[data-studio-publish]')) return publishStudio();
}

function studioInput(event) {
  const meta = event.target.dataset.studioMeta;
  if (meta) {
    studioState[meta] = event.target.type==='checkbox' ? event.target.checked : event.target.value;
    return renderStudio(document.querySelector('.showcase-studio'));
  }
  if (event.target.dataset.studioProp) {
    updateProperty(event.target);
    return renderStudio(document.querySelector('.showcase-studio'));
  }
}

document.addEventListener('click',studioClick);
document.addEventListener('change',studioInput);
document.addEventListener('input',event=>{
  if (event.target.matches('[data-studio-meta="name"],[data-studio-meta="regulatoryTag"],[data-studio-prop="label"],[data-studio-prop="options"],[data-studio-prop="columns"],[data-studio-prop="defaultText"]')) studioInput(event);
});
new MutationObserver(ensureStudio).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(ensureStudio,200);
