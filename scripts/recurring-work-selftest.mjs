import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsboard-recurring-test-'));
process.env.OPSBOARD_DATA_DIR = dir;
process.env.COMPLIANCE_DB_PATH = path.join(dir, 'compliance.sqlite');

try {
  const compliance = await import('./compliance-engine-v2.mjs');
  const workflow = await import('./workflow-store.mjs');
  const recurring = await import('./recurring-work.mjs');
  const checks = [];
  const assert = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  };

  const demo = compliance.getComplianceOverview();
  assert('mock PPM sites seeded', demo.sites.filter((site) => site.id.startsWith('site-') && ['customer-acme','customer-northstar','customer-apex','customer-greenfield','customer-titan'].includes(site.customerId)).length === 8);
  assert('mock PPM assets seeded', demo.siteAssets.filter((asset) => asset.id.startsWith('ast-')).length === 34);
  assert('mock PPM schedules seeded', demo.siteAssignments.filter((assignment) => assignment.id.startsWith('ppm-')).length === 15);
  assert('mock PPM company name retained', demo.sites.find((site) => site.id === 'site-apex-trafford')?.customerName === 'Apex Manufacturing Ltd');
  assert('mock site contact retained', demo.sites.find((site) => site.id === 'site-apex-trafford')?.siteContact === 'Sarah Jenkins');
  assert('mock site phone retained', demo.sites.find((site) => site.id === 'site-apex-trafford')?.phone === '+44 7700 900461');
  assert('mock engineer ids normalized', demo.siteAssignments.find((assignment) => assignment.id === 'ppm-state2-lead-window')?.preferredTechnicianIds?.includes('tech-priya'));

  const contactRun = recurring.runRecurringScheduler({ today: '2026-09-18', assignmentId: 'ppm-state6-usage-overdue' });
  assert('mock overdue PPM job generated for contact test', contactRun.generated.length === 1, JSON.stringify(contactRun.generated));
  const contactJobId = contactRun.generated[0].jobId;
  let contactJob = workflow.getWorkflowJob(contactJobId);
  assert('generated PPM job carries contact name', contactJob?.customer?.contactName === 'Sarah Jenkins', JSON.stringify(contactJob?.customer));
  assert('generated PPM job carries contact phone', contactJob?.customer?.contactPhone === '+44 7700 900461', JSON.stringify(contactJob?.customer));
  workflow.updateWorkflowJob(contactJobId, { customer: { contactName: '', contactPhone: '' } });
  recurring.runRecurringScheduler({ today: '2026-09-18', assignmentId: 'ppm-state6-usage-overdue' });
  contactJob = workflow.getWorkflowJob(contactJobId);
  assert('existing PPM job repairs missing contact data', contactJob?.customer?.contactName === 'Sarah Jenkins' && contactJob?.customer?.contactPhone === '+44 7700 900461', JSON.stringify(contactJob?.customer));

  compliance.updateSiteAssignment('assign-1', {
    nextDueDate: '2026-10-12',
    leadDays: 30,
    autoCreate: true,
    durationMinutes: 90,
    priority: 'normal',
    serviceType: 'Monthly Water Hygiene Visit',
  });

  const first = recurring.runRecurringScheduler({ today: '2026-09-17', assignmentId: 'assign-1' });
  assert('job generated inside lead window', first.generated.length === 1, JSON.stringify(first.generated));
  const generated = first.generated[0];
  const job = workflow.getWorkflowJob(generated.jobId);
  assert('planned job enters unassigned queue', job?.assignedTechnicianId === null && job?.status === 'scheduled', job?.displayId);
  assert('planned job keeps recurring source', job?.recurringAssignmentId === 'assign-1' && job?.recurringDueDate === '2026-10-12');
  assert('compliance pack attached', Boolean(compliance.getComplianceForms(job.id)?.instances?.length));

  const second = recurring.runRecurringScheduler({ today: '2026-09-17', assignmentId: 'assign-1' });
  assert('scheduler is idempotent', second.generated.length === 0 && workflow.listWorkflowJobs({}).filter((row) => row.recurringAssignmentId === 'assign-1').length === 1);

  workflow.createWorkflowEvent({ jobId: job.id, type: 'status_change', toStatus: 'completed', createdBy: 'user-1' });
  const third = recurring.runRecurringScheduler({ today: '2026-10-12', assignmentId: 'assign-1' });
  const assignment = compliance.getComplianceOverview().siteAssignments.find((row) => row.id === 'assign-1');
  assert('completed recurring job rolls schedule forward', assignment?.nextDueDate === '2026-11-12', assignment?.nextDueDate);
  assert('completed job reference retained', assignment?.lastCompletedJobId === job.id);
  assert('next visit not generated before new lead window', third.generated.length === 0);

  const overview = recurring.getRecurringWorkOverview({ today: '2026-10-12' });
  const row = overview.schedules.find((item) => item.id === 'assign-1');
  assert('planned work overview exposes next due date', row?.nextDueDate === '2026-11-12');
  assert('PPM overview exposes assets and checklists', Number(row?.assetCount || 0) > 0 && Number(row?.checklistCount || 0) > 0);

  const usageAssignment = compliance.createSiteAssignment({
    id: 'assign-usage-test',
    siteId: 'site-1',
    formTypeId: 'ft-water-temps',
    jobTemplateId: 'jt-quarterly-water-hygiene',
    scheduleBasis: 'usage',
    frequency: 'usage',
    autoCreate: true,
    currentUsageHours: 480,
    usageIntervalHours: 500,
    nextDueUsageHours: 500,
    usageLeadHours: 25,
    usageDailyHours: 8,
    durationMinutes: 120,
    preferredTechnicianIds: ['user-1'],
    tools: ['Combustion analyser'],
    spareParts: ['Filter set'],
  });
  assert('usage-based PPM schedule created', usageAssignment.scheduleBasis === 'usage' && usageAssignment.nextDueUsageHours === 500);
  const usageRun = recurring.runRecurringScheduler({ today: '2026-10-12', assignmentId: usageAssignment.id });
  assert('usage schedule generates inside running-hour lead window', usageRun.generated.length === 1, JSON.stringify(usageRun.generated));
  const usageJob = workflow.getWorkflowJob(usageRun.generated[0].jobId);
  assert('PPM resources carry into generated job', usageJob?.plannedMaintenance === true && usageJob?.assignedTechnicianIds?.includes('user-1') && usageJob?.ppmTools?.includes('Combustion analyser'));
  assert('usage target retained on generated job', Number(usageJob?.recurringDueUsageHours || 0) === 500);

  workflow.createWorkflowEvent({ jobId: usageJob.id, type: 'status_change', toStatus: 'completed', createdBy: 'user-1' });
  recurring.runRecurringScheduler({ today: '2026-10-13', assignmentId: usageAssignment.id });
  const usageAfter = compliance.getComplianceOverview().siteAssignments.find((item) => item.id === usageAssignment.id);
  assert('usage completion advances running-hour target', usageAfter?.nextDueUsageHours === 1000, String(usageAfter?.nextDueUsageHours));

  console.log(`Recurring planned-work build gate passed: ${checks.filter((c) => c.ok).length}/${checks.length} checks job=${job.displayId}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
