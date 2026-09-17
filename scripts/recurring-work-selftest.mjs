import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsboard-recurring-test-'));
process.env.OPSBOARD_DATA_DIR = dir;
process.env.COMPLIANCE_DB_PATH = path.join(dir, 'compliance.sqlite');

try {
  const compliance = await import(`./compliance-engine-v2.mjs?recurringtest=${Date.now()}`);
  const workflow = await import(`./workflow-store.mjs?recurringtest=${Date.now()}`);
  const recurring = await import(`./recurring-work.mjs?recurringtest=${Date.now()}`);
  const checks = [];
  const assert = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  };

  compliance.updateSiteAssignment('assign-1', {
    nextDueDate: '2026-10-12',
    leadDays: 30,
    autoCreate: true,
    durationMinutes: 90,
    priority: 'normal',
    serviceType: 'Monthly Water Hygiene Visit',
  });

  const first = recurring.runRecurringScheduler({ today: '2026-09-17' });
  assert('job generated inside lead window', first.generated.length === 1, JSON.stringify(first.generated));
  const generated = first.generated[0];
  const job = workflow.getWorkflowJob(generated.jobId);
  assert('planned job enters unassigned queue', job?.assignedTechnicianId === null && job?.status === 'scheduled', job?.displayId);
  assert('planned job keeps recurring source', job?.recurringAssignmentId === 'assign-1' && job?.recurringDueDate === '2026-10-12');
  assert('compliance pack attached', Boolean(compliance.getComplianceForms(job.id)?.instances?.length));

  const second = recurring.runRecurringScheduler({ today: '2026-09-17' });
  assert('scheduler is idempotent', second.generated.length === 0 && workflow.listWorkflowJobs({}).filter((row) => row.recurringAssignmentId === 'assign-1').length === 1);

  workflow.createWorkflowEvent({ jobId: job.id, type: 'status_change', toStatus: 'completed', createdBy: 'user-1' });
  const third = recurring.runRecurringScheduler({ today: '2026-10-12' });
  const assignment = compliance.getComplianceOverview().siteAssignments.find((row) => row.id === 'assign-1');
  assert('completed recurring job rolls schedule forward', assignment?.nextDueDate === '2026-11-12', assignment?.nextDueDate);
  assert('completed job reference retained', assignment?.lastCompletedJobId === job.id);
  assert('next visit not generated before new lead window', third.generated.length === 0);

  const overview = recurring.getRecurringWorkOverview({ today: '2026-10-12' });
  const row = overview.schedules.find((item) => item.id === 'assign-1');
  assert('planned work overview exposes next due date', row?.nextDueDate === '2026-11-12');

  console.log(`Recurring planned-work build gate passed: ${checks.filter((c) => c.ok).length}/${checks.length} checks job=${job.displayId}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
