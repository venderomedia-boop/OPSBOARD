import fs from 'node:fs';
import path from 'node:path';
import { runDynamicFormBuildTest } from './dynamic-form-selftest.mjs';
import { runComplianceSelfTest } from './compliance-engine.mjs';

const legacy = runDynamicFormBuildTest();
if (!legacy?.createdFormType || !legacy?.versionPinningPreserved || !legacy?.saveVisibleInOverview) {
  throw new Error(`Legacy dynamic form lifecycle test failed: ${JSON.stringify(legacy)}`);
}
const full = runComplianceSelfTest();
if (!full.ok) throw new Error(`Full compliance engine self-test failed: ${JSON.stringify(full)}`);
console.log(`Compliance build gates passed: legacy=${JSON.stringify(legacy)} full=${JSON.stringify(full)}`);

const src = path.resolve('src');
const dist = path.resolve('dist');
if (!fs.existsSync(src)) throw new Error(`Missing source directory: ${src}`);
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(src, dist, { recursive: true });
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build completed without dist/index.html');
console.log('OPSBOARD source build completed.');
