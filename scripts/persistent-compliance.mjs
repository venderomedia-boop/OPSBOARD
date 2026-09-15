import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as memory from './compliance-store.mjs';

function chooseDatabasePath() {
  const preferred = process.env.COMPLIANCE_DB_PATH || '/data/opsboard.sqlite';
  try {
    fs.mkdirSync(path.dirname(preferred), { recursive: true });
    fs.accessSync(path.dirname(preferred), fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.resolve('/tmp/opsboard.sqlite');
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    return fallback;
  }
}

const databasePath = chooseDatabasePath();
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS compliance_state (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const readState = db.prepare('SELECT payload, updated_at FROM compliance_state WHERE id = ?');
const writeState = db.prepare(`
  INSERT INTO compliance_state (id, payload, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
`);

let hydrated = false;
let lastPersistedAt = null;
let restoredFromDatabase = false;

function snapshot() {
  return memory.getComplianceOverview();
}

function persist() {
  const updatedAt = new Date().toISOString();
  writeState.run('main', JSON.stringify(snapshot()), updatedAt);
  lastPersistedAt = updatedAt;
  return updatedAt;
}

function restoreFormTypes(saved) {
  let current = memory.getComplianceOverview();
  for (const formType of saved.formTypes || []) {
    let live = current.formTypes.find((item) => item.id === formType.id);
    const versions = [...(formType.versions || [])].sort((a, b) => a.version - b.version);
    if (!live && versions[0]?.schema) {
      memory.createFormType({
        id: formType.id,
        name: formType.name,
        category: formType.category,
        assetScope: formType.assetScope,
        appliesToAssetTypes: formType.appliesToAssetTypes || [],
        frequency: formType.frequency,
        regulatoryTag: formType.regulatoryTag,
        active: formType.active !== false,
        schema: versions[0].schema,
      });
      current = memory.getComplianceOverview();
      live = current.formTypes.find((item) => item.id === formType.id);
    }
    if (!live) continue;
    let liveVersion = live.currentVersion || 1;
    for (const version of versions) {
      if (version.version <= liveVersion || !version.schema) continue;
      memory.addFormTypeVersion(formType.id, { schema: version.schema });
      liveVersion += 1;
    }
  }
}

function restoreTemplates(saved) {
  let current = memory.getComplianceOverview();
  for (const template of saved.jobTemplates || []) {
    if (current.jobTemplates.some((item) => item.id === template.id)) continue;
    try {
      memory.createJobTemplate({
        id: template.id,
        name: template.name,
        category: template.category,
        requiredFormTypeIds: template.requiredFormTypeIds || [],
      });
      current = memory.getComplianceOverview();
    } catch (error) {
      console.warn(`Skipping persisted JobTemplate ${template.id}: ${error.message}`);
    }
  }
}

function restoreJobConfiguration(saved) {
  const current = memory.getComplianceOverview();
  const liveJobIds = new Set(current.jobs.map((job) => job.id));
  const liveSiteIds = new Set(current.sites.map((site) => site.id));
  const liveTemplateIds = new Set(current.jobTemplates.map((template) => template.id));
  for (const job of saved.jobs || []) {
    if (!liveJobIds.has(job.id) || !job.siteId || !job.jobTemplateId) continue;
    if (!liveSiteIds.has(job.siteId) || !liveTemplateIds.has(job.jobTemplateId)) continue;
    try {
      memory.configureJobCompliance(job.id, { siteId: job.siteId, jobTemplateId: job.jobTemplateId });
    } catch (error) {
      console.warn(`Skipping persisted compliance setup for ${job.id}: ${error.message}`);
    }
  }
}

function restoreInstances(saved) {
  const current = memory.getComplianceOverview();
  const ids = new Set(current.formInstances.map((instance) => instance.id));
  for (const instance of saved.formInstances || []) {
    if (!ids.has(instance.id)) continue;
    try {
      memory.saveFormInstance(instance.id, {
        answers: instance.answers || {},
        status: instance.status || 'not_started',
        submittedBy: instance.submittedBy,
      });
    } catch (error) {
      console.warn(`Skipping persisted FormInstance ${instance.id}: ${error.message}`);
    }
  }
}

export function hydratePersistentState() {
  if (hydrated) return getPersistenceInfo();
  const row = readState.get('main');
  if (!row) {
    persist();
    hydrated = true;
    return getPersistenceInfo();
  }

  try {
    const saved = JSON.parse(row.payload);
    restoreFormTypes(saved);
    restoreTemplates(saved);
    restoreJobConfiguration(saved);
    restoreInstances(saved);
    restoredFromDatabase = true;
    lastPersistedAt = row.updated_at;
    persist();
  } catch (error) {
    console.error('Could not restore persisted compliance state; using seed state.', error);
    persist();
  }
  hydrated = true;
  return getPersistenceInfo();
}

export function getPersistenceInfo() {
  let bytes = 0;
  try { bytes = fs.statSync(databasePath).size; } catch {}
  return {
    engine: 'sqlite',
    path: databasePath,
    persistentVolume: databasePath.startsWith('/data/'),
    restoredFromDatabase,
    lastPersistedAt,
    bytes,
  };
}

export function getComplianceOverview() { return memory.getComplianceOverview(); }
export function getComplianceForms(jobId) { return memory.getComplianceForms(jobId); }
export function getFormTypeDetail(jobId, formTypeId) { return memory.getFormTypeDetail(jobId, formTypeId); }
export function runComplianceSelfTest() { return memory.runComplianceSelfTest(); }

export function saveFormInstance(instanceId, input) {
  const result = memory.saveFormInstance(instanceId, input);
  persist();
  return result;
}

export function createFormType(input) {
  const result = memory.createFormType(input);
  persist();
  return result;
}

export function addFormTypeVersion(formTypeId, input) {
  const result = memory.addFormTypeVersion(formTypeId, input);
  persist();
  return result;
}

export function createJobTemplate(input) {
  const result = memory.createJobTemplate(input);
  persist();
  return result;
}

export function configureJobCompliance(jobId, input) {
  const result = memory.configureJobCompliance(jobId, input);
  persist();
  return result;
}
