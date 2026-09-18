import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.OPSBOARD_DATA_DIR || (fs.existsSync('/data') ? '/data' : '/tmp');
const filePath = path.join(dataDir, 'invoice-queue.json');

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readState() {
  ensureDir();
  if (!fs.existsSync(filePath)) return { nextNumber: 1006, items: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      nextNumber: Number(parsed.nextNumber) || 1006,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { nextNumber: 1006, items: [] };
  }
}

function writeState(state) {
  ensureDir();
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, filePath);
}

function arrayOr(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function objectOrNull(value, fallback = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function snapshotFields(input, existing = {}) {
  return {
    customerName: input.customerName,
    serviceType: input.serviceType,
    technicianName: input.technicianName || existing.technicianName || '',
    documents: arrayOr(input.documents, existing.documents || []),
    description: input.description || existing.description || '',
    siteName: input.siteName || existing.siteName || '',
    contactName: input.contactName || existing.contactName || '',
    contactPhone: input.contactPhone || existing.contactPhone || '',
    siteAddress: input.siteAddress || existing.siteAddress || '',
    notes: arrayOr(input.notes, existing.notes || []),
    photos: arrayOr(input.photos, existing.photos || []),
    signature: objectOrNull(input.signature, existing.signature || null),
    checklist: objectOrNull(input.checklist, existing.checklist || null),
    complianceForms: arrayOr(input.complianceForms, existing.complianceForms || []),
    jobStatus: input.jobStatus || existing.jobStatus || 'completed',
    amount: Number.isFinite(Number(input.amount)) && Number(input.amount) > 0 ? Number(input.amount) : null,
  };
}

export function listInvoiceStubs({ status = 'pending', from, to } = {}) {
  const state = readState();
  return state.items
    .filter((item) => !status || item.status === status)
    .filter((item) => {
      if (!from && !to) return true;
      const day = String(item.createdAt || '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getInvoiceStub(id) {
  const state = readState();
  return state.items.find((item) => item.id === id) || null;
}

export function createInvoiceStub(input = {}) {
  if (!input.jobId) throw Object.assign(new Error('jobId is required'), { statusCode: 422 });
  if (!input.customerName) throw Object.assign(new Error('customerName is required'), { statusCode: 422 });
  if (!input.serviceType) throw Object.assign(new Error('serviceType is required'), { statusCode: 422 });

  const state = readState();
  const existing = state.items.find((item) => item.jobId === input.jobId && item.status === 'pending');
  const now = input.submittedAt || new Date().toISOString();

  if (existing) {
    Object.assign(existing, {
      createdAt: now,
      submittedAt: now,
      ...snapshotFields(input, existing),
    });
    writeState(state);
    return existing;
  }

  const number = state.nextNumber++;
  const id = `inv-${number}`;
  const item = {
    id,
    reference: `#${number}`,
    jobId: input.jobId,
    createdAt: now,
    submittedAt: now,
    status: 'pending',
    ...snapshotFields(input),
  };
  state.items.push(item);
  writeState(state);
  return item;
}

export function deleteInvoiceStub(id) {
  const state = readState();
  const index = state.items.findIndex((row) => row.id === id);
  if (index < 0) throw Object.assign(new Error('Invoice stub not found'), { statusCode: 404 });
  const [removed] = state.items.splice(index, 1);
  writeState(state);
  return removed;
}

export function updateInvoiceStub(id, status) {
  if (!['pending', 'sent'].includes(status)) throw Object.assign(new Error('status must be pending or sent'), { statusCode: 422 });
  const state = readState();
  const item = state.items.find((row) => row.id === id);
  if (!item) throw Object.assign(new Error('Invoice stub not found'), { statusCode: 404 });
  item.status = status;
  if (status === 'sent') item.sentAt = new Date().toISOString();
  writeState(state);
  return item;
}

export function resetInvoiceQueue() {
  const state = { nextNumber: 1006, items: [] };
  writeState(state);
  return state;
}

export function getInvoiceQueueInfo() {
  const state = readState();
  return { filePath, pending: state.items.filter((item) => item.status === 'pending').length, total: state.items.length };
}
