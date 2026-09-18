import { deleteInvoiceStub } from './invoice-queue.mjs';

try {
  const removed = deleteInvoiceStub('inv-1006');
  console.log(`Removed premature invoice stub ${removed.id} for ${removed.jobId}.`);
} catch (error) {
  if (error?.statusCode === 404) {
    console.log('Premature invoice stub inv-1006 already absent.');
  } else {
    throw error;
  }
}
