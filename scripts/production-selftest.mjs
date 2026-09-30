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
const timesheets = await import('./timesheet-store.mjs');

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

  const raisedOperationId = `raised-work-${stamp}`;
  const raisedJobId = `job-offline-${stamp}`;
  const raisedInput = {
    id: raisedJobId,
    clientOperationId: raisedOperationId,
    customerName: 'Offline Raised Customer',
    serviceType: 'Engineer Raised Callout',
    description: 'Raised with no coverage',
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    assignedTechnicianIds: [],
    priority: 'urgent',
  };
  const raisedFirst = workflow.createWorkflowJob(raisedInput);
  const raisedDuplicate = workflow.createWorkflowJob(raisedInput);
  assert.equal(raisedFirst.id, raisedDuplicate.id, 'raised-work replay must return the original job');
  assert.equal(
    workflow.listWorkflowJobs({}).filter((row) => row.id === raisedJobId).length,
    1,
    'raised-work replay must not create duplicate jobs',
  );

  const date = start.toISOString().slice(0, 10);
  const sunday = new Date(`${date}T12:00:00Z`);
  const distance = sunday.getUTCDay() === 0 ? 0 : 7 - sunday.getUTCDay();
  sunday.setUTCDate(sunday.getUTCDate() + distance);
  const weekEnding = sunday.toISOString().slice(0, 10);
  const timesheetOperationId = `timesheet-op-${stamp}`;
  const timesheetInput = {
    technicianId,
    weekEnding,
    clientOperationId: timesheetOperationId,
    entries: [{
      date,
      startTime: '08:00',
      endTime: '16:30',
      breakMinutes: 30,
      mileageMiles: 12,
      notes: 'Offline replay test',
    }],
  };
  const sheetFirst = timesheets.createTimesheet(timesheetInput);
  const sheetDuplicate = timesheets.createTimesheet(timesheetInput);
  assert.equal(sheetFirst.id, sheetDuplicate.id, 'timesheet replay must return the original timesheet');
  assert.equal(
    timesheets.listTimesheets({ technicianId, from: weekEnding, to: weekEnding }).filter((row) => row.id === sheetFirst.id).length,
    1,
    'timesheet replay must not create a duplicate weekly submission',
  );

  await flushWorkflowPersistence();

  const stored = await databaseQuery(
    `SELECT payload FROM vendero_state WHERE namespace='workflow' LIMIT 1`
  );
  assert.equal(stored.rows.length, 1);
  assert.ok(
    stored.rows[0].payload.jobs.some((row) => row.id === job.id),
    'acknowledged workflow job must exist in PostgreSQL',
  );

  console.log('Production persistence/auth/status/raised-work/timesheet replay self-test passed.');
} finally {
  try { await databaseQuery('DELETE FROM app_users WHERE id=$1', [technicianId]); } catch {}
  await closeDatabasePool();
}
