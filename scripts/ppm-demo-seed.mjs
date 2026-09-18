import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync(new URL('./mock-ppm-dataset.json', import.meta.url), 'utf8'));
const companiesById = new Map(raw.companies.map((company) => [company.id, company]));
const technicianIdMap = new Map([
  ['user-1', 'user-1'],
  ['user-2', 'tech-priya'],
  ['user-3', 'tech-daniel'],
]);
const timeFrequencies = new Set(['weekly', 'monthly', 'quarterly', 'biannual', 'annual']);

function checklistFrequency(formTypeId) {
  const schedule = raw.ppmSchedules.find((item) => item.formTypeId === formTypeId && timeFrequencies.has(item.frequency));
  return schedule?.frequency || 'ad_hoc';
}

function normalizedSchema(schema) {
  return {
    sections: (schema?.sections || []).map((section) => ({
      ...section,
      kind: section.kind || 'fields',
      fields: Array.isArray(section.fields) ? section.fields : undefined,
    })),
  };
}

export const ppmDemoCompanies = raw.companies.map((company) => ({ ...company }));

export const ppmDemoSeed = {
  sites: raw.sites.map((site) => {
    const company = companiesById.get(site.customerId);
    return {
      ...site,
      customerName: company?.name || '',
      customerContactName: company?.contactName || '',
      customerPhone: company?.phone || '',
      customerEmail: company?.email || '',
      siteContact: site.siteContact || company?.contactName || '',
      phone: site.phone || company?.phone || '',
      postcode: site.postcode || '',
    };
  }),
  siteLocations: raw.locations.map((location) => ({
    ...location,
    parentLocationId: location.parentLocationId ?? null,
    sortOrder: Number(location.sortOrder || 0),
  })),
  siteAssets: raw.assets.map((asset) => ({
    ...asset,
    locationId: asset.locationId || null,
    floor: asset.floor || '',
    metadata: asset.metadata || {},
  })),
  formTypes: raw.formTypes.map((formType) => ({
    id: formType.id,
    name: formType.name,
    category: formType.category,
    assetScope: 'site',
    appliesToAssetTypes: [],
    frequency: checklistFrequency(formType.id),
    regulatoryTag: '',
    active: true,
    currentVersion: 1,
    versions: [{
      version: 1,
      createdAt: '2026-09-18T00:00:00.000Z',
      changeNote: 'Mock PPM dataset seed',
      schema: normalizedSchema(formType.schema),
    }],
  })),
  jobTemplates: raw.jobTemplates.map((template) => ({ ...template })),
  siteAssignments: raw.ppmSchedules.map((schedule) => ({
    ...schedule,
    priority: schedule.priority === 'high' ? 'urgent' : schedule.priority,
    preferredTechnicianIds: (schedule.preferredTechnicianIds || [])
      .map((id) => technicianIdMap.get(id))
      .filter(Boolean),
  })),
};

export const ppmDemoStats = {
  companies: raw.companies.length,
  sites: raw.sites.length,
  locations: raw.locations.length,
  formTypes: raw.formTypes.length,
  jobTemplates: raw.jobTemplates.length,
  assets: raw.assets.length,
  schedules: raw.ppmSchedules.length,
};
