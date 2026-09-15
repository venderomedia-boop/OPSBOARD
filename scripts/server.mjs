import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addFormTypeVersion,
  configureJobCompliance,
  createFormType,
  createJobTemplate,
  getComplianceForms,
  getComplianceOverview,
  getFormTypeDetail,
  getPersistenceInfo,
  hydratePersistentState,
  runComplianceSelfTest,
  saveFormInstance,
} from './persistent-compliance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 3000);
const persistence = hydratePersistentState();
console.log(`Compliance persistence: ${persistence.engine} ${persistence.path} volume=${persistence.persistentVolume}`);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, status, payload) {
  setCors(res);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }); }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { setCors(res); res.writeHead(204); res.end(); return true; }

  if (req.method === 'GET' && pathname === '/api/v1/compliance/overview') {
    json(res, 200, getComplianceOverview()); return true;
  }
  if (req.method === 'GET' && pathname === '/api/v1/compliance/self-test') {
    const result = runComplianceSelfTest();
    json(res, result.ok ? 200 : 500, result); return true;
  }
  if (req.method === 'GET' && pathname === '/api/v1/compliance/persistence') {
    json(res, 200, getPersistenceInfo()); return true;
  }

  let match = pathname.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms$/);
  if (req.method === 'GET' && match) {
    const result = getComplianceForms(decodeURIComponent(match[1]));
    if (!result) json(res, 404, { message: 'Job has no compliance setup' });
    else json(res, 200, result);
    return true;
  }

  match = pathname.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-forms\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const result = getFormTypeDetail(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    if (!result) json(res, 404, { message: 'Compliance form not found for this job' });
    else json(res, 200, result);
    return true;
  }

  match = pathname.match(/^\/api\/v1\/form-instances\/([^/]+)$/);
  if (req.method === 'POST' && match) {
    const body = await readJson(req);
    json(res, 200, saveFormInstance(decodeURIComponent(match[1]), body));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/v1/form-types') {
    const body = await readJson(req);
    json(res, 201, createFormType(body));
    return true;
  }

  match = pathname.match(/^\/api\/v1\/form-types\/([^/]+)\/versions$/);
  if (req.method === 'POST' && match) {
    const body = await readJson(req);
    json(res, 201, addFormTypeVersion(decodeURIComponent(match[1]), body));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/v1/job-templates') {
    const body = await readJson(req);
    json(res, 201, createJobTemplate(body));
    return true;
  }

  match = pathname.match(/^\/api\/v1\/jobs\/([^/]+)\/compliance-setup$/);
  if (req.method === 'PATCH' && match) {
    const body = await readJson(req);
    json(res, 200, configureJobCompliance(decodeURIComponent(match[1]), body));
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/health') {
      json(res, 200, { ok: true, service: 'opsboard', complianceApi: true, persistence: getPersistenceInfo() });
      return;
    }

    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) json(res, 404, { message: 'API route not found' });
      return;
    }

    let filePath = pathname === '/' ? '/index.html' : pathname;
    let file = path.join(root, filePath.replace(/^\/+/, ''));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    json(res, status, { message: error?.message || 'Internal server error', ...(error?.details ? { details: error.details } : {}) });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`OPSBOARD listening on ${port}`));
