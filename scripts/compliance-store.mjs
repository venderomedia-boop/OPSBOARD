const FORM_LEVEL_ASSET_ID = '__form_level__';
const ALLOWED_SECTION_KINDS = new Set(['fields', 'asset_matrix', 'asset_checklist', 'text_area']);
const ALLOWED_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'boolean', 'select', 'pass_fail', 'date', 'signature', 'photo']);
const ALLOWED_ASSET_TYPES = new Set(['tap', 'shower', 'luminaire', 'tank', 'boiler', 'other']);
const ALLOWED_STATUSES = new Set(['not_started', 'in_progress', 'completed']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const periodNow = () => new Date().toISOString().slice(0, 7);
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

const sites = [
  { id: 'site-1', customerId: 'cust-1', name: 'C233 - Meridian Office Park, Block A', address: '14 Meridian Way', city: 'Manchester', postcode: 'M1 4BT', active: true },
  { id: 'site-2', customerId: 'cust-7', name: 'Arden House', address: '31 King Street', city: 'Manchester', postcode: 'M2 6AA', active: true },
];

const siteAssets = [
  { id: 'asset-1', siteId: 'site-1', type: 'tap', label: '5th Floor WC - WHB 1', floor: '5', active: true, metadata: { tmvFitted: false } },
  { id: 'asset-2', siteId: 'site-1', type: 'tap', label: '5th Floor WC - WHB 2', floor: '5', active: true, metadata: { tmvFitted: false } },
  { id: 'asset-3', siteId: 'site-1', type: 'tap', label: '4th Floor WC - WHB (TMV Fitted)', floor: '4', active: true, metadata: { tmvFitted: true } },
  { id: 'asset-4', siteId: 'site-1', type: 'shower', label: 'Lower Mezz Shower 1', floor: 'LG', active: true },
  { id: 'asset-5', siteId: 'site-1', type: 'luminaire', label: 'Luminaire 1 - Main Stairwell', floor: 'G', active: true },
  { id: 'asset-6', siteId: 'site-1', type: 'luminaire', label: 'Luminaire 2 - Main Stairwell', floor: 'G', active: true },
  { id: 'asset-7', siteId: 'site-2', type: 'luminaire', label: 'East Stairwell - L1', floor: 'G', active: true },
  { id: 'asset-8', siteId: 'site-2', type: 'luminaire', label: 'East Stairwell - L2', floor: '1', active: true },
  { id: 'asset-9', siteId: 'site-2', type: 'luminaire', label: 'Reception - L3', floor: 'G', active: true },
];

const formTypes = [
  {
    id: 'ft-water-temps', name: 'Water Temperatures', category: 'water_hygiene', assetScope: 'asset',
    appliesToAssetTypes: ['tap'], frequency: 'monthly', regulatoryTag: 'L8 ACoP', active: true, currentVersion: 1,
    versions: [{ version: 1, createdAt: '2026-09-15T00:00:00+01:00', schema: { sections: [
      { id: 'outlets', label: 'Outlets', kind: 'asset_matrix', matrixColumns: ['HWS', 'CWS'], matrixPeriod: 'monthly', appliesToAssetTypes: ['tap'] },
      { id: 'notes', label: 'Notes', kind: 'text_area', defaultText: 'Temperatures in °C. CWS should be below 20°C within 1 minute. HWS should be 50-60°C within 1 minute.' },
      { id: 'engineer', label: 'Engineer', kind: 'fields', fields: [
        { id: 'initials', label: 'Initials', type: 'text', required: true },
        { id: 'date', label: 'Date of test', type: 'date', required: true },
      ] },
    ] } }],
  },
  {
    id: 'ft-shower-descale', name: 'Shower Head Disinfection', category: 'water_hygiene', assetScope: 'asset',
    appliesToAssetTypes: ['shower'], frequency: 'quarterly', regulatoryTag: 'L8 ACoP', active: true, currentVersion: 1,
    versions: [{ version: 1, createdAt: '2026-09-15T00:00:00+01:00', schema: { sections: [
      { id: 'showers', label: 'Showers', kind: 'asset_checklist', appliesToAssetTypes: ['shower'] },
      { id: 'notes', label: 'Notes', kind: 'text_area' },
    ] } }],
  },
  {
    id: 'ft-emergency-lights', name: 'Emergency Light Monthly Flash Test', category: 'emergency_lighting', assetScope: 'asset',
    appliesToAssetTypes: ['luminaire'], frequency: 'monthly', regulatoryTag: 'BS 5266', active: true, currentVersion: 1,
    versions: [{ version: 1, createdAt: '2026-09-15T00:00:00+01:00', schema: { sections: [
      { id: 'luminaires', label: 'Luminaires', kind: 'asset_checklist', appliesToAssetTypes: ['luminaire'] },
      { id: 'notes', label: 'Notes', kind: 'text_area' },
    ] } }],
  },
];

const jobTemplates = [
  { id: 'jt-monthly-water-hygiene', name: 'Monthly Water Hygiene Visit', category: 'water_hygiene', requiredFormTypeIds: ['ft-water-temps'] },
  { id: 'jt-quarterly-water-hygiene', name: 'Quarterly Water Hygiene Visit', category: 'water_hygiene', requiredFormTypeIds: ['ft-water-temps', 'ft-shower-descale'] },
  { id: 'jt-monthly-emergency-lighting', name: 'Emergency Light Monthly Test', category: 'emergency_lighting', requiredFormTypeIds: ['ft-emergency-lights'] },
];

const jobs = [
  { id: 'job-1', displayId: 'J-1046', customerId: 'cust-1', customer: 'Meridian Office Park', siteId: 'site-1', jobTemplateId: 'jt-monthly-water-hygiene', serviceType: 'Water Hygiene Monthly Visit', status: 'completed' },
  { id: 'job-7', displayId: 'J-1055', customerId: 'cust-1', customer: 'Meridian Office Park', siteId: 'site-1', jobTemplateId: 'jt-quarterly-water-hygiene', serviceType: 'Water Hygiene Compliance Visit', status: 'scheduled' },
  { id: 'job-emergency-1', displayId: 'J-1052', customerId: 'cust-7', customer: 'Arden House', siteId: 'site-2', jobTemplateId: 'jt-monthly-emergency-lighting', serviceType: 'Emergency Lighting Test', status: 'en_route' },
];

const formInstances = [
  { id: 'fi-1', jobId: 'job-1', siteId: 'site-1', formTypeId: 'ft-water-temps', formTypeVersion: 1, assetId: 'asset-1', period: '2026-09', status: 'completed', answers: { HWS: 60, CWS: 11 }, submittedBy: 'user-1', submittedAt: '2026-09-15T09:00:00+01:00' },
  { id: 'fi-2', jobId: 'job-1', siteId: 'site-1', formTypeId: 'ft-water-temps', formTypeVersion: 1, assetId: 'asset-2', period: '2026-09', status: 'not_started', answers: {} },
];

function getSite(siteId) { return sites.find((s) => s.id === siteId); }
function getJob(jobId) { return jobs.find((j) => j.id === jobId); }
function getFormType(formTypeId) { return formTypes.find((f) => f.id === formTypeId); }
function getJobTemplate(templateId) { return jobTemplates.find((t) => t.id === templateId); }
function getSiteAssets(siteId) { return siteAssets.filter((a) => a.siteId === siteId && a.active); }
function getJobInstances(jobId) { return formInstances.filter((i) => i.jobId === jobId); }

function effectiveAssetTypes(formType, schema) {
  const direct = Array.isArray(formType.appliesToAssetTypes) ? formType.appliesToAssetTypes : [];
  if (direct.length) return [...new Set(direct)];
  return [...new Set((schema.sections || []).flatMap((s) => Array.isArray(s.appliesToAssetTypes) ? s.appliesToAssetTypes : []))];
}

export function validateFormSchema(schema, options = {}) {
  const errors = [];
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.sections) || schema.sections.length === 0) {
    return { ok: false, errors: ['schema.sections must contain at least one section'] };
  }

  const sectionIds = new Set();
  const fieldIds = new Set();
  const matrixKeys = new Set();
  let assetChecklistCount = 0;

  for (const section of schema.sections) {
    if (!section || typeof section !== 'object') { errors.push('every section must be an object'); continue; }
    if (!section.id || typeof section.id !== 'string') errors.push('every section requires a string id');
    else if (sectionIds.has(section.id)) errors.push(`duplicate section id: ${section.id}`);
    else sectionIds.add(section.id);

    if (!ALLOWED_SECTION_KINDS.has(section.kind)) errors.push(`unsupported section kind: ${section.kind}`);

    if (Array.isArray(section.appliesToAssetTypes)) {
      for (const type of section.appliesToAssetTypes) if (!ALLOWED_ASSET_TYPES.has(type)) errors.push(`unsupported asset type: ${type}`);
    }

    if (section.kind === 'fields') {
      if (!Array.isArray(section.fields) || section.fields.length === 0) errors.push(`fields section ${section.id || '(unknown)'} must contain fields`);
      for (const field of section.fields || []) {
        if (!field.id || typeof field.id !== 'string') errors.push(`field in ${section.id || '(unknown)'} requires an id`);
        else if (fieldIds.has(field.id)) errors.push(`duplicate field id across form: ${field.id}`);
        else fieldIds.add(field.id);
        if (!ALLOWED_FIELD_TYPES.has(field.type)) errors.push(`unsupported field type: ${field.type}`);
        if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) errors.push(`select field ${field.id || '(unknown)'} requires options`);
      }
    }

    if (section.kind === 'asset_matrix') {
      if (!Array.isArray(section.matrixColumns) || section.matrixColumns.length === 0) errors.push(`asset_matrix ${section.id || '(unknown)'} requires matrixColumns`);
      for (const key of section.matrixColumns || []) {
        if (!key || typeof key !== 'string') errors.push(`asset_matrix ${section.id || '(unknown)'} contains an invalid column key`);
        else if (matrixKeys.has(key)) errors.push(`duplicate matrix answer key across form: ${key}`);
        else matrixKeys.add(key);
      }
    }

    if (section.kind === 'asset_checklist') assetChecklistCount += 1;
  }

  // Current mobile renderer stores checklist answers as pass/comment on one asset instance.
  // Reject ambiguous schemas now rather than silently overwriting one checklist section with another.
  if (assetChecklistCount > 1) errors.push('current renderer supports one asset_checklist section per form; split additional checklists into another FormType');

  if (options.assetScope === 'asset') {
    const pseudoForm = { appliesToAssetTypes: options.appliesToAssetTypes || [] };
    if (effectiveAssetTypes(pseudoForm, schema).length === 0) errors.push('asset-scoped forms require appliesToAssetTypes on the FormType or at least one section');
  }

  return { ok: errors.length === 0, errors };
}

function normalizeNewFormType(input) {
  const schema = input?.schema ?? input?.versions?.[0]?.schema;
  const assetScope = input?.assetScope ?? 'site';
  const check = validateFormSchema(schema, { assetScope, appliesToAssetTypes: input?.appliesToAssetTypes });
  if (!check.ok) throw Object.assign(new Error(check.errors.join('; ')), { statusCode: 422, details: check.errors });
  if (!input?.name || !input?.category || !input?.frequency) throw Object.assign(new Error('name, category and frequency are required'), { statusCode: 422 });

  let id = input.id || `ft-${slug(input.name)}`;
  if (!id) id = `ft-${Date.now()}`;
  if (getFormType(id)) throw Object.assign(new Error(`FormType ${id} already exists`), { statusCode: 409 });

  return {
    id,
    name: input.name,
    category: input.category,
    assetScope,
    appliesToAssetTypes: input.appliesToAssetTypes || [],
    frequency: input.frequency,
    regulatoryTag: input.regulatoryTag,
    active: input.active !== false,
    currentVersion: 1,
    versions: [{ version: 1, createdAt: nowIso(), schema: clone(schema) }],
  };
}

export function createFormType(input) {
  const formType = normalizeNewFormType(input);
  formTypes.push(formType);
  return clone(formType);
}

export function addFormTypeVersion(formTypeId, input) {
  const formType = getFormType(formTypeId);
  if (!formType) throw Object.assign(new Error(`FormType ${formTypeId} not found`), { statusCode: 404 });
  const schema = input?.schema;
  const check = validateFormSchema(schema, { assetScope: formType.assetScope, appliesToAssetTypes: formType.appliesToAssetTypes });
  if (!check.ok) throw Object.assign(new Error(check.errors.join('; ')), { statusCode: 422, details: check.errors });
  const version = Math.max(...formType.versions.map((v) => v.version), 0) + 1;
  formType.versions.push({ version, createdAt: nowIso(), schema: clone(schema) });
  formType.currentVersion = version;
  return clone(formType);
}

export function createJobTemplate(input) {
  if (!input?.name || !Array.isArray(input.requiredFormTypeIds) || input.requiredFormTypeIds.length === 0) {
    throw Object.assign(new Error('name and requiredFormTypeIds are required'), { statusCode: 422 });
  }
  const missing = input.requiredFormTypeIds.filter((id) => !getFormType(id));
  if (missing.length) throw Object.assign(new Error(`Unknown FormType ids: ${missing.join(', ')}`), { statusCode: 422 });
  const id = input.id || `jt-${slug(input.name)}` || `jt-${Date.now()}`;
  if (getJobTemplate(id)) throw Object.assign(new Error(`JobTemplate ${id} already exists`), { statusCode: 409 });
  const template = { id, name: input.name, category: input.category || 'general', requiredFormTypeIds: [...new Set(input.requiredFormTypeIds)] };
  jobTemplates.push(template);
  return clone(template);
}

export function configureJobCompliance(jobId, input) {
  const job = getJob(jobId);
  if (!job) throw Object.assign(new Error(`Job ${jobId} not found`), { statusCode: 404 });
  if (!getSite(input?.siteId)) throw Object.assign(new Error(`Site ${input?.siteId} not found`), { statusCode: 422 });
  if (!getJobTemplate(input?.jobTemplateId)) throw Object.assign(new Error(`JobTemplate ${input?.jobTemplateId} not found`), { statusCode: 422 });
  job.siteId = input.siteId;
  job.jobTemplateId = input.jobTemplateId;
  ensureFormInstancesForJob(jobId);
  return clone(job);
}

export function ensureFormInstancesForJob(jobId) {
  const job = getJob(jobId);
  if (!job || !job.siteId || !job.jobTemplateId) return [];
  const template = getJobTemplate(job.jobTemplateId);
  if (!template) return [];
  const existing = getJobInstances(jobId);

  for (const formTypeId of template.requiredFormTypeIds) {
    const formType = getFormType(formTypeId);
    if (!formType || !formType.active) continue;

    const alreadyForForm = existing.filter((i) => i.formTypeId === formTypeId);
    const pinnedVersion = alreadyForForm[0]?.formTypeVersion ?? formType.currentVersion;
    const version = formType.versions.find((v) => v.version === pinnedVersion);
    if (!version) continue;
    const schema = version.schema;
    const hasFormLevel = (schema.sections || []).some((s) => s.kind === 'fields' || s.kind === 'text_area');

    if (formType.assetScope === 'asset') {
      const types = effectiveAssetTypes(formType, schema);
      const assets = getSiteAssets(job.siteId).filter((asset) => types.includes(asset.type));
      for (const asset of assets) {
        if (!existing.some((i) => i.formTypeId === formTypeId && i.assetId === asset.id)) {
          const instance = {
            id: `fi-${slug(jobId)}-${slug(formTypeId)}-${slug(asset.id)}`,
            jobId, siteId: job.siteId, formTypeId, formTypeVersion: pinnedVersion, assetId: asset.id,
            period: periodNow(), status: 'not_started', answers: {},
          };
          formInstances.push(instance); existing.push(instance);
        }
      }
      if (hasFormLevel && !existing.some((i) => i.formTypeId === formTypeId && i.assetId === FORM_LEVEL_ASSET_ID)) {
        const instance = {
          id: `fi-${slug(jobId)}-${slug(formTypeId)}-form`,
          jobId, siteId: job.siteId, formTypeId, formTypeVersion: pinnedVersion, assetId: FORM_LEVEL_ASSET_ID,
          period: periodNow(), status: 'not_started', answers: {},
        };
        formInstances.push(instance); existing.push(instance);
      }
    } else if (!existing.some((i) => i.formTypeId === formTypeId)) {
      const instance = {
        id: `fi-${slug(jobId)}-${slug(formTypeId)}-form`,
        jobId, siteId: job.siteId, formTypeId, formTypeVersion: pinnedVersion, assetId: FORM_LEVEL_ASSET_ID,
        period: periodNow(), status: 'not_started', answers: {},
      };
      formInstances.push(instance); existing.push(instance);
    }
  }
  return clone(getJobInstances(jobId));
}

export function getComplianceForms(jobId) {
  const job = getJob(jobId);
  if (!job || !job.siteId || !job.jobTemplateId) return null;
  const site = getSite(job.siteId);
  const jobTemplate = getJobTemplate(job.jobTemplateId);
  if (!site || !jobTemplate) return null;
  const formTypesForJob = jobTemplate.requiredFormTypeIds.map(getFormType).filter(Boolean);
  const instances = ensureFormInstancesForJob(jobId);
  return clone({ site, jobTemplate, formTypes: formTypesForJob, instances });
}

export function getFormTypeDetail(jobId, formTypeId) {
  const job = getJob(jobId);
  if (!job || !job.siteId) return null;
  const site = getSite(job.siteId);
  const formType = getFormType(formTypeId);
  if (!site || !formType) return null;
  const instances = ensureFormInstancesForJob(jobId).filter((i) => i.formTypeId === formTypeId);
  if (instances.length === 0) return null;

  // Mobile renderer currently selects schema from currentVersion. Return a job-pinned
  // view of the FormType so historical jobs keep rendering their original schema.
  const pinnedVersion = instances[0].formTypeVersion;
  const pinnedFormType = { ...clone(formType), currentVersion: pinnedVersion };
  return clone({ site, siteAssets: getSiteAssets(job.siteId), formType: pinnedFormType, instances });
}

export function saveFormInstance(instanceId, input) {
  const instance = formInstances.find((i) => i.id === instanceId);
  if (!instance) throw Object.assign(new Error(`FormInstance ${instanceId} not found`), { statusCode: 404 });
  if (!input || typeof input.answers !== 'object' || Array.isArray(input.answers) || input.answers === null) {
    throw Object.assign(new Error('answers must be an object'), { statusCode: 422 });
  }
  if (!ALLOWED_STATUSES.has(input.status)) throw Object.assign(new Error(`invalid status: ${input.status}`), { statusCode: 422 });
  instance.answers = { ...(instance.answers || {}), ...clone(input.answers) };
  instance.status = input.status;
  if (input.status === 'completed') {
    instance.submittedBy = input.submittedBy || 'user-1';
    instance.submittedAt = nowIso();
  } else {
    delete instance.submittedBy;
    delete instance.submittedAt;
  }
  return clone(instance);
}

export function getComplianceOverview() {
  for (const job of jobs) ensureFormInstancesForJob(job.id);
  return clone({ sites, siteAssets, formTypes, jobTemplates, formInstances, jobs });
}

export function runComplianceSelfTest() {
  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

  const validSchema = { sections: [
    { id: 'readings', label: 'Readings', kind: 'asset_matrix', matrixColumns: ['Flow', 'Return'], appliesToAssetTypes: ['tap'] },
    { id: 'engineer', label: 'Engineer', kind: 'fields', fields: [{ id: 'initials', label: 'Initials', type: 'text', required: true }] },
  ] };
  record('valid dynamic schema accepted', validateFormSchema(validSchema, { assetScope: 'asset', appliesToAssetTypes: ['tap'] }).ok);

  const duplicateSection = { sections: [{ id: 'same', kind: 'text_area' }, { id: 'same', kind: 'text_area' }] };
  record('duplicate section ids rejected', !validateFormSchema(duplicateSection).ok);

  const checklistCollision = { sections: [{ id: 'a', kind: 'asset_checklist' }, { id: 'b', kind: 'asset_checklist' }] };
  record('ambiguous checklist schemas rejected', !validateFormSchema(checklistCollision).ok);

  const first = ensureFormInstancesForJob('job-7');
  const second = ensureFormInstancesForJob('job-7');
  record('job template expands into instances', first.length >= 6, `${first.length} instances`);
  record('instance expansion is idempotent', first.length === second.length, `${first.length} -> ${second.length}`);

  const pinned = ensureFormInstancesForJob('job-1').filter((i) => i.formTypeId === 'ft-water-temps');
  record('job instances share one pinned schema version', pinned.length > 0 && pinned.every((i) => i.formTypeVersion === pinned[0].formTypeVersion), `v${pinned[0]?.formTypeVersion ?? '?'}`);

  const detail = getFormTypeDetail('job-1', 'ft-water-temps');
  record('form detail renders pinned schema version', detail?.formType.currentVersion === pinned[0]?.formTypeVersion, `renderer v${detail?.formType.currentVersion ?? '?'}`);

  const formLevel = first.some((i) => i.formTypeId === 'ft-water-temps' && i.assetId === FORM_LEVEL_ASSET_ID);
  record('form-level fields create a dedicated instance', formLevel);

  return { ok: checks.every((c) => c.ok), passed: checks.filter((c) => c.ok).length, total: checks.length, checks };
}
