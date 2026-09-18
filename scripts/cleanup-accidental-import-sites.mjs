import { getComplianceOverview, deleteSite } from './compliance-engine-v2.mjs';

const TARGET_NAMES = new Set([
  'INFREQUENTLY USED OUTLET FLUSHING RECORD - 2026',
  'JAN',
  '1',
]);

const before = getComplianceOverview();
const targets = before.sites.filter(site => site.active !== false && TARGET_NAMES.has(site.name));

console.log(`Accidental import cleanup: found ${targets.length} matching active site(s).`);

for (const site of targets) {
  const counts = {
    locations: before.siteLocations.filter(item => item.siteId === site.id && item.active !== false).length,
    assets: before.siteAssets.filter(item => item.siteId === site.id && item.active !== false).length,
    assignments: before.siteAssignments.filter(item => item.siteId === site.id && item.active !== false).length,
    jobs: before.jobs.filter(item => item.siteId === site.id).length,
    submissions: before.formInstances.filter(item => item.siteId === site.id).length,
  };

  console.log(`Deactivating accidental site ${JSON.stringify(site.name)} (${site.id}) dependencies=${JSON.stringify(counts)}`);
  deleteSite(site.id);
}

const after = getComplianceOverview();
const remaining = after.sites.filter(site => site.active !== false && TARGET_NAMES.has(site.name));
if (remaining.length) {
  throw new Error(`Accidental import cleanup failed; still active: ${remaining.map(site => site.name).join(', ')}`);
}
console.log('Accidental import cleanup complete.');
