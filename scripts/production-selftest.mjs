import assert from 'node:assert/strict';
import {
  checkDatabaseConnection,
  closeDatabasePool,
  databaseQuery,
  flushWorkflowPersistence,
  hydrateWorkflowState,
} from './postgres-state.mjs';
import {
  authenticateRequest,
  createUser,
  ensureAuthSchema,
  login,
} from './auth.mjs';

process.env.OPSBOARD_DATA_DIR ||= '/tmp/vendero-production-selftest';

const stamp = Date.now();
const technicianId = `tech-selftest-${stamp}`;
const email = `engineer-${stamp}@example.test`;
const password = 'SelfTest-Password-2026!';

const workflow = await import('./workflow-store.mjs');

try {
  const db = await checkDatabaseConnection();
  assert.equal(db.configured, true, 'DATABASE_URL must be configured');
  assert.equal(db.ok, true, 'PostgreSQL must be reachable');

  await hydrateWorkflowState();
  await ensureAuthSchema();

  const technician = workflow.createWorkflowTechnician({
    id: technicianId,
    name: 'Production Self Test',
    email,
    role: 'engineer',
  });
  assert.equal(technician.id, technicianId);

  const user = await createUser({
    id: technicianId,
    name: 'Production Self Test',
    email,
    password,
    role: 'engineer',
  });
  assert.equal(user.id, technicianId);
  assert.equal(user.accessRole, 'engineer');

  const session = await login(email, password);
  assert.ok(session.accessToken);
  assert.equal(session.user.id, technicianId);

  const auth = await authenticateRequest({
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(auth.userId, technicianId);
  assert.equal(auth.role, 'engineer');

  const start = new Date(Date.now() + 3600000);
  const end = new Date(start.getTime() + 3600000);
  const job = workflow.createWorkflowJob({
    customerName: 'Self Test Customer',
    serviceType: 'HVAC service',
    description: 'Offline replay production self-test',
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    assignedTechnicianIds: [technicianId],
  });
  assert.equal(job.assignedTechnicianId, technicianId);

  const operationId = `offline-op-${stamp}`;
  const first = workflow.createWorkflowEvent({
    jobId: job.id,
    type: 'status_change',
    toStatus: 'en_route',
    clientOperationId: operationId,
    createdBy: technicianId,
  });
  const duplicate = workflow.createWorkflowEvent({
    jobId: job.id,
    type: 'status_change',
    toStatus: 'en_route',
    clientOperationId: operationId,
    createdBy: technicianId,
  });
  assert.equal(first.id, duplicate.id, 'duplicate replay must return the original event');

  const events = workflow.listWorkflowEvents(job.id);
  assert.equal(events.filter((row) => row.id === first.id).length, 1, 'duplicate replay must not create a second event');

  await flushWorkflowPersistence();

  const stored = await databaseQuery(
    `SELECT payload FROM vendero_state WHERE namespace='workflow' LIMIT 1`
  );
  assert.equal(stored.rows.length, 1);
  assert.ok(
    stored.rows[0].payload.jobs.some((row) => row.id === job.id),
    'acknowledged workflow job must exist in PostgreSQL',
  );

  console.log('Production persistence/auth/offline replay self-test passed.');
} finally {
  try { await databaseQuery('DELETE FROM app_users WHERE id=$1', [technicianId]); } catch {}
  await closeDatabasePool();
}
