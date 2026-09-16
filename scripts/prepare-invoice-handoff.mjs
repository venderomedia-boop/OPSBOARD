import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('scripts/server-v2.mjs');
let source = fs.readFileSync(file, 'utf8');
let changed = false;

const importMarker = "import { generateComplianceExport, listExports, resolveExport } from './compliance-exports-v2.mjs';";
const invoiceImport = "import { createInvoiceStub, getInvoiceQueueInfo, listInvoiceStubs, resetInvoiceQueue, updateInvoiceStub } from './invoice-queue.mjs';";
if (!source.includes(invoiceImport)) {
  source = source.replace(importMarker, `${importMarker}\n${invoiceImport}`);
  changed = true;
}

const resetOriginal = "if(req.method==='POST'&&p==='/api/v1/demo/reset'){json(res,200,resetDemo());return true;}";
const resetReplacement = "if(req.method==='POST'&&p==='/api/v1/demo/reset'){resetInvoiceQueue();json(res,200,resetDemo());return true;}";
if (source.includes(resetOriginal)) {
  source = source.replace(resetOriginal, resetReplacement);
  changed = true;
}

const routeMarker = "  if(req.method==='GET'&&p==='/api/v1/exports'){json(res,200,listExports());return true;}";
const invoiceRoutes = `${routeMarker}\n  if(req.method==='GET'&&p==='/api/v1/invoice-stubs'){json(res,200,listInvoiceStubs({status:q(url,'status'),from:q(url,'from'),to:q(url,'to')}));return true;}\n  if(req.method==='POST'&&p==='/api/v1/invoice-stubs'){json(res,201,createInvoiceStub(await readJson(req)));return true;}\n  let invoiceMatch=p.match(/^\\/api\\/v1\\/invoice-stubs\\/([^/]+)$/);\n  if(invoiceMatch&&req.method==='PATCH'){const body=await readJson(req);json(res,200,updateInvoiceStub(invoiceMatch[1],body.status));return true;}`;
if (!source.includes("p==='/api/v1/invoice-stubs'")) {
  source = source.replace(routeMarker, invoiceRoutes);
  changed = true;
}

const healthOriginal = "persistence:getPersistenceInfo(),demo:getDemoStatus()";
const healthReplacement = "persistence:getPersistenceInfo(),invoiceQueue:getInvoiceQueueInfo(),demo:getDemoStatus()";
if (source.includes(healthOriginal)) {
  source = source.replace(healthOriginal, healthReplacement);
  changed = true;
}

if (changed) fs.writeFileSync(file, source);
console.log(`Prepared shared invoice handoff${changed ? ' (routes enabled)' : ''}.`);
