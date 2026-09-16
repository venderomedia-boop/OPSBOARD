import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('scripts/compliance-engine-v2.mjs');
let source = fs.readFileSync(file, 'utf8');
const replacements = [
  ["Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'));persist();", "Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id')));persist();"],
  ["Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId'));persist();", "Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId')));persist();"],
  ["const schema=input?.schema??input?.versions?.[0]?.schema;const assetScope=input?.assetScope||'site';", "const schema=withLocationGrouping(input?.schema??input?.versions?.[0]?.schema);const assetScope=input?.assetScope||'site';"],
  ["export function addFormTypeVersion(formTypeId,input){const ft=find(state.formTypes,formTypeId,'FormType');const check=validateFormSchema(input?.schema,", "export function addFormTypeVersion(formTypeId,input){const ft=find(state.formTypes,formTypeId,'FormType');const schema=withLocationGrouping(input?.schema);const check=validateFormSchema(schema,"],
  ["schema:clone(input.schema)});ft.currentVersion=version;", "schema:clone(schema)});ft.currentVersion=version;"],
];
let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) { source = source.replaceAll(from, to); changed = true; }
}
const marker = 'function effectiveAssetTypes(ft,schema)';
if (!source.includes('function withLocationGrouping(schema)') && source.includes(marker)) {
  source = source.replace(marker, "function withLocationGrouping(schema){const next=clone(schema);for(const s of next?.sections||[]){if((s.kind==='asset_matrix'||s.kind==='asset_checklist')&&!s.groupBy)s.groupBy='location';}return next;}\n" + marker);
  changed = true;
}
if (changed) fs.writeFileSync(file, source);
console.log(`Prepared location-aware compliance engine${changed ? ' (syntax/grouping normalized)' : ''}.`);
