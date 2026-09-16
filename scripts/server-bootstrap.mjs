import { getComplianceForms, getFormTypeDetail, resetDemoState } from './compliance-engine-v2.mjs';

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

  if (stale) {
    console.log('Demo schema migration: stale J-1055 form instances detected; rebuilding on current form versions.');
    resetDemoState();
  }

  const detail = getFormTypeDetail(DEMO_JOB_ID, 'ft-water-temps');
  const versions = [...new Set((detail?.instances || []).map((row) => row.formTypeVersion))];
  const showers = (detail?.instances || []).filter((row) => ['asset-4', 'asset-19'].includes(row.assetId));
  const selected = detail?.formType?.versions?.find((v) => v.version === detail.formType.currentVersion);
  const matrix = selected?.schema?.sections?.find((s) => s.kind === 'asset_matrix');
  console.log(`Demo Water Temperatures assertion: selected=v${detail?.formType?.currentVersion ?? 'none'} instanceVersions=${JSON.stringify(versions)} showerRows=${showers.length} showerVersions=${JSON.stringify(showers.map((r) => r.formTypeVersion))} assetTypes=${JSON.stringify(matrix?.appliesToAssetTypes || [])} groupBy=${matrix?.groupBy || 'none'}`);

  if (detail?.formType?.currentVersion !== 2 || showers.length !== 2 || matrix?.groupBy !== 'location' || !(matrix?.appliesToAssetTypes || []).includes('shower')) {
    throw new Error('Demo Water Temperatures schema assertion failed: J-1055 must serve schema v2 with two shower rows.');
  }
}

migrateStaleDemoInstances();
await import('./server-v2.mjs');
