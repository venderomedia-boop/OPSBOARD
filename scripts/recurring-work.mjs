import { createWorkflowComplianceJob, getComplianceOverview, updateSiteAssignment } from './compliance-engine-v2.mjs';
import { createWorkflowJob, getWorkflowJob, listWorkflowJobs } from './workflow-store.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORTED = new Set(['weekly', 'monthly', 'quarterly', 'biannual', 'annual']);
const dateOnly = (value = new Date()) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const asDate = (value) => new Date(`${dateOnly(value)}T12:00:00.000Z`);
const addDays = (value, days) => new Date(asDate(value).getTime() + Number(days || 0) * DAY_MS).toISOString().slice(0, 10);

function addMonthsClamped(value, months) {
  const source = asDate(value);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function advanceRecurringDueDate(value, frequency) {
  if (!value) return null;
  if (frequency === 'weekly') return addDays(value, 7);
  if (frequency === 'monthly') return addMonthsClamped(value, 1);
  if (frequency === 'quarterly') return addMonthsClamped(value, 3);
  if (frequency === 'biannual') return addMonthsClamped(value, 6);
  if (frequency === 'annual') return addMonthsClamped(value, 12);
  return null;
}

function scheduleWindow(assignment, today) {
  const nextDueDate = dateOnly(assignment.nextDueDate);
  const leadDays = Math.max(0, Math.min(90, Number(assignment.leadDays ?? 21) || 21));
  const generationDate = nextDueDate ? addDays(nextDueDate, -leadDays) : null;
  const daysUntilDue = nextDueDate ? Math.round((asDate(nextDueDate) - asDate(today)) / DAY_MS) : null;
  return { nextDueDate, leadDays, generationDate, daysUntilDue };
}

function scheduleState(assignment, today, generatedJob) {
  if (assignment.active === false) return 'inactive';
  if (!SUPPORTED.has(assignment.frequency)) return 'manual';
  if (!assignment.nextDueDate) return 'needs_due_date';
  if (generatedJob && !['completed', 'cancelled'].includes(generatedJob.status)) return 'job_created';
  if (generatedJob?.status === 'completed') return 'awaiting_rollover';
  const { generationDate, nextDueDate } = scheduleWindow(assignment, today);
  if (nextDueDate < today) return 'overdue';
  if (generationDate && generationDate <= today) return 'ready_to_generate';
  return 'upcoming';
}

function assignmentJob(assignment, jobs) {
  if (assignment.lastGeneratedJobId) {
    const exact = jobs.find((job) => job.id === assignment.lastGeneratedJobId);
    if (exact) return exact;
  }
  return jobs.find((job) => job.recurringAssignmentId === assignment.id && job.recurringDueDate === assignment.nextDueDate && job.status !== 'cancelled') || null;
}

export function getRecurringWorkOverview({ today = dateOnly() } = {}) {
  const data = getComplianceOverview();
  const jobs = listWorkflowJobs({});
  const schedules = (data.siteAssignments || []).map((assignment) => {
    const site = data.sites.find((item) => item.id === assignment.siteId);
    const formType = data.formTypes.find((item) => item.id === assignment.formTypeId);
    const template = data.jobTemplates.find((item) => item.id === assignment.jobTemplateId);
    const generatedJob = assignmentJob(assignment, jobs);
    const window = scheduleWindow(assignment, today);
    return {
      ...assignment,
      siteName: site?.name || assignment.siteId,
      formTypeName: formType?.name || assignment.formTypeId,
      jobTemplateName: template?.name || '',
      serviceType: assignment.serviceType || template?.name || formType?.name || 'Planned maintenance visit',
      autoCreate: assignment.autoCreate !== false,
      durationMinutes: Math.max(15, Number(assignment.durationMinutes ?? 90) || 90),
      priority: assignment.priority === 'urgent' ? 'urgent' : 'normal',
      ...window,
      state: scheduleState(assignment, today, generatedJob),
      generatedJob: generatedJob ? {
        id: generatedJob.id,
        displayId: generatedJob.displayId,
        status: generatedJob.status,
        scheduledStart: generatedJob.scheduledStart,
        assignedTechnicianId: generatedJob.assignedTechnicianId || null,
      } : null,
    };
  });
  return {
    today,
    schedules,
    counts: {
      total: schedules.filter((row) => row.active !== false).length,
      upcoming: schedules.filter((row) => row.state === 'upcoming').length,
      ready: schedules.filter((row) => ['ready_to_generate', 'overdue'].includes(row.state)).length,
      jobsCreated: schedules.filter((row) => row.state === 'job_created').length,
      needsDueDate: schedules.filter((row) => row.state === 'needs_due_date').length,
    },
  };
}

export function reconcileRecurringCompletions({ today = dateOnly() } = {}) {
  const data = getComplianceOverview();
  const completed = [];
  for (const assignment of data.siteAssignments || []) {
    if (!assignment.lastGeneratedJobId || !assignment.nextDueDate) continue;
    const job = getWorkflowJob(assignment.lastGeneratedJobId);
    if (!job) {
      updateSiteAssignment(assignment.id, { lastGeneratedJobId: null, lastGeneratedDueDate: null });
      continue;
    }
    if (job.status === 'cancelled') {
      updateSiteAssignment(assignment.id, { lastGeneratedJobId: null, lastGeneratedDueDate: null });
      continue;
    }
    if (job.status !== 'completed') continue;
    const due = assignment.lastGeneratedDueDate || assignment.nextDueDate;
    const next = advanceRecurringDueDate(due, assignment.frequency);
    if (!next) continue;
    updateSiteAssignment(assignment.id, {
      nextDueDate: next,
      lastCompletedJobId: job.id,
      lastCompletedAt: job.completedAt || new Date().toISOString(),
      lastGeneratedJobId: null,
      lastGeneratedDueDate: null,
    });
    completed.push({ assignmentId: assignment.id, completedJobId: job.id, previousDueDate: due, nextDueDate: next, reconciledOn: today });
  }
  return completed;
}

export function runRecurringScheduler({ today = dateOnly(), assignmentId = null, force = false } = {}) {
  const rolledForward = reconcileRecurringCompletions({ today });
  const data = getComplianceOverview();
  const jobs = listWorkflowJobs({});
  const generated = [];
  const skipped = [];

  for (const assignment of data.siteAssignments || []) {
    if (assignmentId && assignment.id !== assignmentId) continue;
    if (assignment.active === false || assignment.autoCreate === false) { skipped.push({ assignmentId: assignment.id, reason: 'inactive' }); continue; }
    if (!SUPPORTED.has(assignment.frequency)) { skipped.push({ assignmentId: assignment.id, reason: 'manual_frequency' }); continue; }
    if (!assignment.jobTemplateId) { skipped.push({ assignmentId: assignment.id, reason: 'missing_job_template' }); continue; }
    if (!assignment.nextDueDate) { skipped.push({ assignmentId: assignment.id, reason: 'missing_due_date' }); continue; }

    const site = data.sites.find((item) => item.id === assignment.siteId && item.active !== false);
    const template = data.jobTemplates.find((item) => item.id === assignment.jobTemplateId);
    const formType = data.formTypes.find((item) => item.id === assignment.formTypeId);
    if (!site || !template) { skipped.push({ assignmentId: assignment.id, reason: 'missing_site_or_template' }); continue; }

    const due = dateOnly(assignment.nextDueDate);
    const { generationDate } = scheduleWindow(assignment, today);
    if (!force && generationDate > today) { skipped.push({ assignmentId: assignment.id, reason: 'outside_lead_window' }); continue; }

    let existing = assignmentJob(assignment, jobs);
    if (existing?.status === 'cancelled') existing = null;
    if (existing) {
      if (assignment.lastGeneratedJobId !== existing.id || assignment.lastGeneratedDueDate !== due) {
        updateSiteAssignment(assignment.id, { lastGeneratedJobId: existing.id, lastGeneratedDueDate: due });
      }
      skipped.push({ assignmentId: assignment.id, reason: 'already_generated', jobId: existing.id });
      continue;
    }

    const durationMinutes = Math.max(15, Number(assignment.durationMinutes ?? 90) || 90);
    const start = new Date(`${due}T09:00:00.000Z`);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const serviceType = assignment.serviceType || template.name || formType?.name || 'Planned maintenance visit';
    const job = createWorkflowJob({
      customerId: site.customerId,
      customerName: site.name,
      siteAddress: site.address,
      city: site.city,
      postcode: site.postcode,
      serviceType,
      description: `Planned ${String(assignment.frequency).replaceAll('_', ' ')} visit. Due ${due}.`,
      notes: 'Automatically generated from the site planned-maintenance schedule.',
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
      priority: assignment.priority === 'urgent' ? 'urgent' : 'normal',
      assignedTechnicianId: null,
      siteId: assignment.siteId,
      jobTemplateId: assignment.jobTemplateId,
      recurringAssignmentId: assignment.id,
      recurringDueDate: due,
      plannedMaintenance: true,
    });
    createWorkflowComplianceJob({
      id: job.id,
      displayId: job.displayId,
      customerId: job.customerId,
      customer: job.customer?.name,
      siteId: job.siteId,
      jobTemplateId: job.jobTemplateId,
      serviceType: job.serviceType,
      status: job.status,
    });
    updateSiteAssignment(assignment.id, {
      lastGeneratedJobId: job.id,
      lastGeneratedDueDate: due,
      lastGeneratedAt: new Date().toISOString(),
    });
    generated.push({ assignmentId: assignment.id, dueDate: due, jobId: job.id, displayId: job.displayId });
    jobs.push(job);
  }

  return { today, generated, rolledForward, skipped, overview: getRecurringWorkOverview({ today }) };
}
