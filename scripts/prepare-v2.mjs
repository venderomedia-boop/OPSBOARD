import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('scripts/compliance-engine-v2.mjs');
let source = fs.readFileSync(file, 'utf8');
const replacements = [
  ["Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'));persist();", "Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id')));persist();"],
  ["Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId'));persist();", "Object.assign(item,Object.fromEntries(Object.entries(input||{}).filter(([k])=>k!=='id'&&k!=='siteId')));persist();"],
];
let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) { source = source.replaceAll(from, to); changed = true; }
}
if (changed) fs.writeFileSync(file, source);
console.log(`Prepared location-aware compliance engine${changed ? ' (syntax normalized)' : ''}.`);
