import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('scripts/compliance-engine-v2.mjs');
let source = fs.readFileSync(file, 'utf8');
const replacements = [
  ["Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'));persist();", "Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id')));persist();"],
  ["Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId'));persist();", "Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId')));persist();"],
  ["const schema=input?.schema??input?.versions?.[0]?.schema;const assetScope=input?.assetScope||'site';", "const rawSchema=input?.schema??input?.versions?.[0]?.schema;const assetScope=input?.assetScope||'site';const schema=clone(rawSchema);if(assetScope==='asset')for(const s of schema?.sections||[])if((s.kind==='asset_matrix'||s.kind==='asset_checklist')&&!s.groupBy)s.groupBy='location';"],
];
let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) { source = source.replaceAll(from, to); changed = true; }
}

const upgradeFn = `
function isCompatibleLocationUpgrade(previousSchema,nextSchema){
  if(!previousSchema||!nextSchema)return false;
  const prev=(previousSchema.sections||[]),next=(nextSchema.sections||[]);
  if(prev.length!==next.length)return false;
  const nextById=new Map(next.map(s=>[s.id,s]));
  for(const oldSection of prev){
    const newer=nextById.get(oldSection.id);if(!newer||newer.kind!==oldSection.kind)return false;
    if(oldSection.kind==='asset_matrix'&&JSON.stringify(oldSection.matrixColumns||[])!==JSON.stringify(newer.matrixColumns||[]))return false;
    if(oldSection.kind==='fields'){
      const a=(oldSection.fields||[]).map(f=>[f.id,f.type,Boolean(f.required)]),b=(newer.fields||[]).map(f=>[f.id,f.type,Boolean(f.required)]);
      if(JSON.stringify(a)!==JSON.stringify(b))return false;
    }
  }
  return true;
}
function upgradeActiveJobPins(state){
  const activeJobs=new Set(state.jobs.filter(j=>!['completed','cancelled'].includes(j.status)).map(j=>j.id));
  for(const ft of state.formTypes){
    const current=ft.versions?.find(v=>v.version===ft.currentVersion);if(!current)continue;
    const grouped=(current.schema?.sections||[]).some(s=>(s.kind==='asset_matrix'||s.kind==='asset_checklist')&&s.groupBy==='location');if(!grouped)continue;
    const byJob=new Map();
    for(const inst of state.formInstances.filter(i=>i.formTypeId===ft.id&&activeJobs.has(i.jobId))){const rows=byJob.get(inst.jobId)||[];rows.push(inst);byJob.set(inst.jobId,rows);}
    for(const rows of byJob.values()){
      const pinnedVersion=rows[0]?.formTypeVersion;if(!pinnedVersion||pinnedVersion===ft.currentVersion)continue;
      const previous=ft.versions.find(v=>v.version===pinnedVersion);if(!previous||!isCompatibleLocationUpgrade(previous.schema,current.schema))continue;
      for(const inst of rows){inst.formTypeVersion=ft.currentVersion;if(inst.assetId&&inst.assetId!==FORM_LEVEL_ASSET_ID)inst.locationId=state.siteAssets.find(a=>a.id===inst.assetId)?.locationId||inst.locationId||null;}
    }
  }
}
`;

if (!source.includes('function upgradeActiveJobPins(state)')) {
  const marker = 'function normalize(saved){';
  if (source.includes(marker)) { source = source.replace(marker, `${upgradeFn}\n${marker}`); changed = true; }
}
if (source.includes('ensureLegacyLocations(s);upgradeBaselineForms(s);') && !source.includes('ensureLegacyLocations(s);upgradeBaselineForms(s);upgradeActiveJobPins(s);')) {
  source = source.replace('ensureLegacyLocations(s);upgradeBaselineForms(s);', 'ensureLegacyLocations(s);upgradeBaselineForms(s);upgradeActiveJobPins(s);');
  changed = true;
}

if (changed) fs.writeFileSync(file, source);
console.log(`Prepared location-aware compliance engine${changed ? ' (syntax/grouping/schema pins normalized)' : ''}.`);
