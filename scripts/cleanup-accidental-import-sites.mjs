import {
  getComplianceOverview,
  deleteSite,
  deleteSiteAsset,
  deleteSiteLocation,
} from './compliance-engine-v2.mjs';

const TARGET_NAMES = new Set([
  'INFREQUENTLY USED OUTLET FLUSHING RECORD - 2026',
  'JAN',
  '1',
]);

const before = getComplianceOverview();
const targets = before.sites.filter(site => TARGET_NAMES.has(site.name));

console.log(`Accidental import cleanup: found ${targets.length} matching site record(s).`);

for (const site of targets) {
  const activeAssets = before.siteAssets.filter(item => item.siteId === site.id && item.active !== false);
  const activeLocations = before.siteLocations.filter(item => item.siteId === site.id && item.active !== false);
  const counts = {
    locations: activeLocations.length,
    assets: activeAssets.length,
    assignments: before.siteAssignments.filter(item => item.siteId === site.id && item.active !== false).length,
    jobs: before.jobs.filter(item => item.siteId === site.id).length,
    submissions: before.formInstances.filter(item => item.siteId === site.id).length,
  };

  console.log(`Cleaning accidental site ${JSON.stringify(site.name)} (${site.id}) dependencies=${JSON.stringify(counts)}`);
  for (const asset of activeAssets) deleteSiteAsset(asset.id);
  for (const location of activeLocations) deleteSiteLocation(location.id);
  if (site.active !== false) deleteSite(site.id);
}

const after = getComplianceOverview();
const stillActiveSites = after.sites.filter(site => site.active !== false && TARGET_NAMES.has(site.name));
const targetIds = new Set(after.sites.filter(site => TARGET_NAMES.has(site.name)).map(site => site.id));
const stillActiveLocations = after.siteLocations.filter(item => targetIds.has(item.siteId) && item.active !== false);
const stillActiveAssets = after.siteAssets.filter(item => targetIds.has(item.siteId) && item.active !== false);

if (stillActiveSites.length || stillActiveLocations.length || stillActiveAssets.length) {
  throw new Error('Accidental import cleanup left active site/location/asset records');
}

console.log('Accidental import cleanup complete: sites, locations and assets are inactive.');
