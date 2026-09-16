import { getComplianceForms, resetDemoState } from './compliance-engine-v2.mjs';

const DEMO_JOB_ID = 'job-7';
const DEMO_FORM_IDS = ['ft-water-temps', 'ft-shower-descale'];

function migrateStaleDemoInstances() {
  const setup = getComplianceForms(DEMO_JOB_ID);
  if (!setup) return { migrated: false, reason: 'demo job unavailable' };

  const formTypes = new Map(setup.formTypes.map((form) => [form.id, form]));
  const stale = DEMO_FORM_IDS.some((formTypeId) => {
    const latest = formTypes.get(formTypeId)?.currentVersion;
    const instances = setup.instances.filter((instance) => instance.formTypeId === formTypeId);
    return Boolean(latest && instances.length && instances.some((instance) => instance.formTypeVersion !== latest));
  });

  if (!stale) return { migrated: false, reason: 'already current' };

  console.log('Demo schema migration: stale J-1055 form instances detected; rebuilding on current form versions.');
  resetDemoState();

  const refreshed = getComplianceForms(DEMO_JOB_ID);
  const versions = Object.fromEntries(
    DEMO_FORM_IDS.map((formTypeId) => {
      const rows = refreshed?.instances.filter((instance) => instance.formTypeId === formTypeId) || [];
      return [formTypeId, [...new Set(rows.map((row) => row.formTypeVersion))]];
    }),
  );
  console.log(`Demo schema migration complete: ${JSON.stringify(versions)}`);
  return { migrated: true, versions };
}

migrateStaleDemoInstances();
await import('./server-v2.mjs');
