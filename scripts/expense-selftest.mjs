import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jps-expense-'));
process.env.OPSBOARD_DATA_DIR=temp;

const store=await import('./expense-store.mjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
const receipt={
  name:'receipt-test.png',
  mimeType:'image/png',
  dataUrl:`data:image/png;base64,${png}`,
};

const created=store.createExpense({
  submitterName:'Receipt Test Engineer',
  technicianId:'tech-test',
  category:'materials',
  incurredDate:'2026-10-02',
  description:'Test materials expense',
  gross:12.34,
  jobRef:'J-TEST',
  receipt,
  status:'submitted',
});

assert.equal(created.status,'submitted');
assert.equal(created.hasReceipt,true);
assert.equal(created.receiptName,'receipt-test.png');
assert(created.receiptSizeBytes>0);

const listed=store.listExpenses({technicianId:'tech-test'});
assert.equal(listed.length,1);
assert.equal(listed[0].id,created.id);
assert.equal(listed[0].hasReceipt,true);

const file=store.getExpenseReceipt(created.id);
assert(file);
assert.equal(file.mimeType,'image/png');
assert.equal(file.name,'receipt-test.png');
assert(file.buffer.length>0);

const info=store.getExpenseStoreInfo();
assert.equal(info.withReceipts,1);
assert(fs.existsSync(path.join(info.receiptDir,`${created.id}.png`)));

const draft=store.createExpense({
  submitterName:'Draft Test Engineer',
  technicianId:'tech-draft',
  category:'parking',
  incurredDate:'2026-10-02',
  description:'Draft before edit',
  gross:5,
  receipt,
  status:'draft',
});
const updated=store.updateExpense(draft.id,{description:'Updated draft'});
assert.equal(updated.description,'Updated draft');
assert.equal(store.getExpense(draft.id)?.description,'Updated draft');
const submitted=store.transitionExpense(draft.id,{status:'submitted'});
assert.equal(submitted.status,'submitted');
assert.equal(submitted.hasReceipt,true);

console.log('Expense receipt self-test passed: binary storage, listing, update, transition and full receipt retrieval verified.');
