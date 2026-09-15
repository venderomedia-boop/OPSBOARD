import fs from 'node:fs';
import path from 'node:path';
import { runDynamicFormBuildTest } from './dynamic-form-selftest.mjs';
import { runComplianceSelfTest } from './compliance-engine.mjs';

const legacy = runDynamicFormBuildTest();
if (!legacy?.ok || !legacy?.createdFormType || legacy?.pinnedRendererVersion !== 2 || !legacy?.overviewReflectsSave || !legacy?.invalidSchemaRejected) {
  throw new Error(`Legacy dynamic form lifecycle test failed: ${JSON.stringify(legacy)}`);
}
const full = runComplianceSelfTest();
if (!full.ok) throw new Error(`Full compliance engine self-test failed: ${JSON.stringify(full)}`);

const exportTestDir = '/tmp/opsboard-export-build-test';
fs.rmSync(exportTestDir, { recursive: true, force: true });
fs.mkdirSync(exportTestDir, { recursive: true });
process.env.COMPLIANCE_EXPORT_DIR = exportTestDir;
const { generateComplianceExport } = await import(`./compliance-exports.mjs?build=${Date.now()}`);
const exported = await generateComplianceExport('site-1', 'ft-water-temps', 2026, 'both');
const xlsxPath = exported.xlsx?.name ? path.join(exportTestDir, exported.xlsx.name) : '';
const pdfPath = exported.pdf?.name ? path.join(exportTestDir, exported.pdf.name) : '';
const xlsxOk = Boolean(xlsxPath && fs.existsSync(xlsxPath) && fs.statSync(xlsxPath).size > 0);
const pdfOk = Boolean(pdfPath && fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0);
if (!xlsxOk || !pdfOk) throw new Error(`Compliance export build test failed: ${JSON.stringify({ exported, xlsxOk, pdfOk })}`);
console.log(`Compliance build gates passed: legacy=${JSON.stringify(legacy)} full=${JSON.stringify(full)} export=${JSON.stringify({ xlsxOk, pdfOk, pdfEngine: exported.pdfEngine })}`);
fs.rmSync(exportTestDir, { recursive: true, force: true });

const src = path.resolve('src');
const dist = path.resolve('dist');
if (!fs.existsSync(src)) throw new Error(`Missing source directory: ${src}`);
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(src, dist, { recursive: true });
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build completed without dist/index.html');
console.log('OPSBOARD source build completed.');
