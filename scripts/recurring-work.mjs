import { createWorkflowComplianceJob, getComplianceOverview, updateSiteAssignment } from './compliance-engine-v2.mjs';
import { createWorkflowJob, getWorkflowJob, listWorkflowJobs, updateWorkflowJob } from './workflow-store.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_FREQUENCIES = new Set(['weekly', 'monthly', 'quarterly', 'biannual', 'annual']);
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

function basisOf(assignment) {
  return assignment.scheduleBasis === 'usage' || assignment.frequency === 'usage' ? 'usage' : 'time';
}

function usageWindow(assignment, today) {
  const currentUsageHours = Math.max(0, Number(assignment.currentUsageHours ?? 0) || 0);
  const nextDueUsageHours = Math.max(0, Number(assignment.nextDueUsageHours ?? 0) || 0);
  const usageIntervalHours = Math.max(1, Number(assignment.usageIntervalHours ?? 500) || 500);
  const usageLeadHours = Math.max(0, Number(assignment.usageLeadHours ?? 25) || 0);
  const usageDailyHours = Math.max(0, Number(assignment.usageDailyHours ?? 0) || 0);
  const usageRemainingHours = nextDueUsageHours ? Math.max(0, nextDueUsageHours - currentUsageHours) : null;
  const projectedDays = nextDueUsageHours && usageDailyHours > 0
    ? Math.max(0, Math.ceil((nextDueUsageHours - currentUsageHours) / usageDailyHours))
    : null;
  const calendarDate = projectedDays !== null
    ? addDays(today, projectedDays)
    : assignment.nextDueDate
      ? dateOnly(assignment.nextDueDate)
      : null;
  const daysUntilDue = calendarDate ? Math.round((asDate(calendarDate) - asDate(today)) / DAY_MS) : null;
  return {
    currentUsageHours,
    nextDueUsageHours,
    usageIntervalHours,
    usageLeadHours,
    usageDailyHours,
    usageRemainingHours,
    projectedIntervalDays: usageDailyHours > 0 ? Math.max(1, Math.ceil(usageIntervalHours / usageDailyHours)) : null,
    calendarDate,
    daysUntilDue,
  };
}

function timeWindow(assignment, today) {
  const nextDueDate = dateOnly(assignment.nextDueDate);
  const leadDays = Math.max(0, Math.min(90, Number(assignment.leadDays ?? 21) || 21));
  const generationDate = nextDueDate ? addDays(nextDueDate, -leadDays) : null;
  const daysUntilDue = nextDueDate ? Math.round((asDate(nextDueDate) - asDate(today)) / DAY_MS) : null;
  return { nextDueDate, leadDays, generationDate, calendarDate: nextDueDate || null, daysUntilDue };
}

function scheduleWindow(assignment, today) {
  return basisOf(assignment) === 'usage' ? usageWindow(assignment, today) : timeWindow(assignment, today);
}

function assignmentJob(assignment, jobs) {
  if (assignment.lastGeneratedJobId) {
    const exact = jobs.find((job) => job.id === assignment.lastGeneratedJobId);
    if (exact) return exact;
  }
  if (basisOf(assignment) === 'usage') {
    const target = Number(assignment.nextDueUsageHours || 0);
    return jobs.find((job) =>
      job.recurringAssignmentId === assignment.id &&
      Number(job.recurringDueUsageHours || 0) === target &&
      job.status !== 'cancelled'
    ) || null;
  }
  return jobs.find((job) =>
    job.recurringAssignmentId === assignment.id &&
    job.recurringDueDate === assignment.nextDueDate &&
    job.status !== 'cancelled'
  ) || null;
}

function scheduleState(assignment, today, generatedJob) {
  if (assignment.active === false) return 'inactive';
  if (generatedJob && !['completed', 'cancelled'].includes(generatedJob.status)) return 'job_created';
  if (generatedJob?.status === 'completed') return 'awaiting_rollover';

  const basis = basisOf(assignment);
  if (basis === 'usage') {
    const window = usageWindow(assignment, today);
    if (!window.nextDueUsageHours) return 'needs_usage_target';
    if (window.currentUsageHours >= window.nextDueUsageHours) return 'usage_due';
    if (window.currentUsageHours >= Math.max(0, window.nextDueUsageHours - window.usageLeadHours)) return 'ready_to_generate';
    return 'upcoming';
  }

  if (!TIME_FREQUENCIES.has(assignment.frequency)) return 'manual';
  if (!assignment.nextDueDate) return 'needs_due_date';
  const { generationDate, nextDueDate } = timeWindow(assignment, today);
  if (nextDueDate < today) return 'overdue';
  if (generationDate && generationDate <= today) return 'ready_to_generate';
  return 'upcoming';
}

function resourceText(assignment) {
  const parts = [];
  if (Array.isArray(assignment.tools) && assignment.tools.length) parts.push(`Tools: ${assignment.tools.join(', ')}`);
  if (Array.isArray(assignment.spareParts) && assignment.spareParts.length) parts.push(`Spares: ${assignment.spareParts.join(', ')}`);
  return parts.join(' · ');
}

function customerSnapshotForSite(site) {
  return {
    id: site.customerId || 'custom',
    name: site.customerName || site.name || 'Customer',
    contactName: site.siteContact || site.customerContactName || '',
    contactPhone: site.phone || site.customerPhone || '',
    address: site.address || '',
    city: site.city || '',
    postcode: site.postcode || '',
  };
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

    const activeSiteAssets = data.siteAssets.filter((asset) => asset.siteId === assignment.siteId && asset.active !== false);
    const scopedAssets = Array.isArray(assignment.assetIds) && assignment.assetIds.length
      ? activeSiteAssets.filter((asset) => assignment.assetIds.includes(asset.id))
      : activeSiteAssets;
    const checklistIds = [...new Set([
      ...(template?.requiredFormTypeIds || []),
      ...(assignment.formTypeId ? [assignment.formTypeId] : []),
    ])];
    const checklistNames = checklistIds
      .map((id) => data.formTypes.find((item) => item.id === id)?.name)
      .filter(Boolean);

    return {
      ...assignment,
      scheduleBasis: basisOf(assignment),
      companyName: site?.customerName || '',
      siteName: site?.name || assignment.siteId,
      siteAddress: site ? [site.address, site.city, site.postcode].filter(Boolean).join(', ') : '',
      formTypeName: formType?.name || assignment.formTypeId,
      jobTemplateName: template?.name || '',
      serviceType: assignment.serviceType || template?.name || formType?.name || 'Planned maintenance visit',
      autoCreate: assignment.autoCreate !== false,
      durationMinutes: Math.max(15, Number(assignment.durationMinutes ?? 90) || 90),
      priority: assignment.priority === 'urgent' ? 'urgent' : 'normal',
      preferredTechnicianIds: Array.isArray(assignment.preferredTechnicianIds) ? assignment.preferredTechnicianIds : [],
      tools: Array.isArray(assignment.tools) ? assignment.tools : [],
      spareParts: Array.isArray(assignment.spareParts) ? assignment.spareParts : [],
      assets: scopedAssets.map((asset) => ({ id: asset.id, label: asset.label, type: asset.type, floor: asset.floor || '' })),
      assetCount: scopedAssets.length,
      checklistNames,
      checklistCount: checklistNames.length,
      ...window,
      state: scheduleState(assignment, today, generatedJob),
      generatedJob: generatedJob ? {
        id: generatedJob.id,
        displayId: generatedJob.displayId,
        status: generatedJob.status,
        scheduledStart: generatedJob.scheduledStart,
        assignedTechnicianId: generatedJob.assignedTechnicianId || null,
        assignedTechnicianIds: generatedJob.assignedTechnicianIds || [],
      } : null,
    };
  });

  return {
    today,
    schedules,
    counts: {
      total: schedules.filter((row) => row.active !== false).length,
      upcoming: schedules.filter((row) => row.state === 'upcoming').length,
      ready: schedules.filter((row) => ['ready_to_generate', 'overdue', 'usage_due'].includes(row.state)).length,
      jobsCreated: schedules.filter((row) => row.state === 'job_created').length,
      needsDueDate: schedules.filter((row) => row.state === 'needs_due_date').length,
      needsUsageTarget: schedules.filter((row) => row.state === 'needs_usage_target').length,
      usageDue: schedules.filter((row) => row.state === 'usage_due').length,
    },
  };
}

export function reconcileRecurringCompletions({ today = dateOnly() } = {}) {
  const data = getComplianceOverview();
  const completed = [];

  for (const assignment of data.siteAssignments || []) {
    if (!assignment.lastGeneratedJobId) continue;
    const job = getWorkflowJob(assignment.lastGeneratedJobId);
    if (!job) {
      updateSiteAssignment(assignment.id, {
        lastGeneratedJobId: null,
        lastGeneratedDueDate: null,
        lastGeneratedDueUsageHours: null,
      });
      continue;
    }
    if (job.status === 'cancelled') {
      updateSiteAssignment(assignment.id, {
        lastGeneratedJobId: null,
        lastGeneratedDueDate: null,
        lastGeneratedDueUsageHours: null,
      });
      continue;
    }
    if (job.status !== 'completed') continue;

    if (basisOf(assignment) === 'usage') {
      const dueUsage = Number(assignment.lastGeneratedDueUsageHours || assignment.nextDueUsageHours || 0);
      const interval = Math.max(1, Number(assignment.usageIntervalHours ?? 500) || 500);
      if (!dueUsage) continue;
      const nextDueUsageHours = dueUsage + interval;
      updateSiteAssignment(assignment.id, {
        nextDueUsageHours,
        lastCompletedJobId: job.id,
        lastCompletedAt: job.completedAt || new Date().toISOString(),
        lastCompletedUsageHours: Number(assignment.currentUsageHours || dueUsage),
        lastGeneratedJobId: null,
        lastGeneratedDueDate: null,
        lastGeneratedDueUsageHours: null,
      });
      completed.push({
        assignmentId: assignment.id,
        completedJobId: job.id,
        previousDueUsageHours: dueUsage,
        nextDueUsageHours,
        reconciledOn: today,
      });
      continue;
    }

    if (!assignment.nextDueDate) continue;
    const due = assignment.lastGeneratedDueDate || assignment.nextDueDate;
    const next = advanceRecurringDueDate(due, assignment.frequency);
    if (!next) continue;
    updateSiteAssignment(assignment.id, {
      nextDueDate: next,
      lastCompletedJobId: job.id,
      lastCompletedAt: job.completedAt || new Date().toISOString(),
      lastGeneratedJobId: null,
      lastGeneratedDueDate: null,
      lastGeneratedDueUsageHours: null,
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
    if (!assignment.jobTemplateId) { skipped.push({ assignmentId: assignment.id, reason: 'missing_job_template' }); continue; }

    const site = data.sites.find((item) => item.id === assignment.siteId && item.active !== false);
    const template = data.jobTemplates.find((item) => item.id === assignment.jobTemplateId);
    const formType = data.formTypes.find((item) => item.id === assignment.formTypeId);
    if (!site || !template) { skipped.push({ assignmentId: assignment.id, reason: 'missing_site_or_template' }); continue; }

    const basis = basisOf(assignment);
    let recurringDueDate = null;
    let recurringDueUsageHours = null;
    let scheduledDate = today;

    if (basis === 'usage') {
      const window = usageWindow(assignment, today);
      if (!window.nextDueUsageHours) { skipped.push({ assignmentId: assignment.id, reason: 'missing_usage_target' }); continue; }
      const triggerAt = Math.max(0, window.nextDueUsageHours - window.usageLeadHours);
      if (!force && window.currentUsageHours < triggerAt) { skipped.push({ assignmentId: assignment.id, reason: 'outside_usage_lead_window' }); continue; }
      recurringDueUsageHours = window.nextDueUsageHours;
      scheduledDate = window.currentUsageHours >= window.nextDueUsageHours
        ? today
        : (window.calendarDate || today);
    } else {
      if (!TIME_FREQUENCIES.has(assignment.frequency)) { skipped.push({ assignmentId: assignment.id, reason: 'manual_frequency' }); continue; }
      if (!assignment.nextDueDate) { skipped.push({ assignmentId: assignment.id, reason: 'missing_due_date' }); continue; }
      const due = dateOnly(assignment.nextDueDate);
      const { generationDate } = timeWindow(assignment, today);
      if (!force && generationDate > today) { skipped.push({ assignmentId: assignment.id, reason: 'outside_lead_window' }); continue; }
      recurringDueDate = due;
      scheduledDate = due;
    }

    let existing = assignmentJob(assignment, jobs);
    if (existing?.status === 'cancelled') existing = null;
    if (existing) {
      const customer = customerSnapshotForSite(site);
      const currentCustomer = existing.customer || {};
      if (
        currentCustomer.name !== customer.name ||
        currentCustomer.contactName !== customer.contactName ||
        currentCustomer.contactPhone !== customer.contactPhone ||
        currentCustomer.address !== customer.address ||
        currentCustomer.city !== customer.city ||
        currentCustomer.postcode !== customer.postcode
      ) {
        existing = updateWorkflowJob(existing.id, { customer });
      }

      const update = { lastGeneratedJobId: existing.id };
      if (basis === 'usage') update.lastGeneratedDueUsageHours = recurringDueUsageHours;
      else update.lastGeneratedDueDate = recurringDueDate;
      updateSiteAssignment(assignment.id, update);
      skipped.push({ assignmentId: assignment.id, reason: 'already_generated', jobId: existing.id });
      continue;
    }

    const activeSiteAssets = data.siteAssets.filter((asset) => asset.siteId === assignment.siteId && asset.active !== false);
    const scopedAssets = Array.isArray(assignment.assetIds) && assignment.assetIds.length
      ? activeSiteAssets.filter((asset) => assignment.assetIds.includes(asset.id))
      : activeSiteAssets;
    const checklistIds = [...new Set([...(template.requiredFormTypeIds || []), assignment.formTypeId].filter(Boolean))];
    const checklistNames = checklistIds.map((id) => data.formTypes.find((item) => item.id === id)?.name).filter(Boolean);
    const durationMinutes = Math.max(15, Number(assignment.durationMinutes ?? 90) || 90);
    const start = new Date(`${scheduledDate}T09:00:00.000Z`);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const serviceType = assignment.serviceType || template.name || formType?.name || 'Planned maintenance visit';
    const resourceLine = resourceText(assignment);
    const basisDescription = basis === 'usage'
      ? `Usage-based PPM visit. Service target ${recurringDueUsageHours} running hours; current reading ${Number(assignment.currentUsageHours || 0)} hours.`
      : `Planned ${String(assignment.frequency).replaceAll('_', ' ')} visit. Due ${recurringDueDate}.`;
    const assetLine = scopedAssets.length ? `Assets in scope: ${scopedAssets.map((asset) => asset.label).join(', ')}.` : '';
    const checklistLine = checklistNames.length ? `Checklists: ${checklistNames.join(', ')}.` : '';

    const preferredTechnicianIds = Array.isArray(assignment.preferredTechnicianIds)
      ? [...new Set(assignment.preferredTechnicianIds.filter(Boolean))]
      : [];

    const job = createWorkflowJob({
      customerId: site.customerId,
      customerName: site.customerName || site.name,
      contactName: site.siteContact || site.customerContactName || '',
      contactPhone: site.phone || site.customerPhone || '',
      siteAddress: site.address,
      city: site.city,
      postcode: site.postcode,
      serviceType,
      description: [basisDescription, assetLine, checklistLine].filter(Boolean).join(' '),
      notes: ['Automatically generated from the PPM schedule.', resourceLine].filter(Boolean).join(' '),
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
      priority: assignment.priority === 'urgent' ? 'urgent' : 'normal',
      assignedTechnicianIds: preferredTechnicianIds,
      siteId: assignment.siteId,
      jobTemplateId: assignment.jobTemplateId,
      recurringAssignmentId: assignment.id,
      recurringDueDate,
      recurringDueUsageHours,
      plannedMaintenance: true,
      ppmScheduleBasis: basis,
      ppmFrequency: basis === 'usage' ? 'usage' : assignment.frequency,
      ppmAssetIds: scopedAssets.map((asset) => asset.id),
      ppmChecklistNames: checklistNames,
      ppmTools: Array.isArray(assignment.tools) ? assignment.tools : [],
      ppmSpareParts: Array.isArray(assignment.spareParts) ? assignment.spareParts : [],
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
      lastGeneratedDueDate: recurringDueDate,
      lastGeneratedDueUsageHours: recurringDueUsageHours,
      lastGeneratedAt: new Date().toISOString(),
    });
    generated.push({
      assignmentId: assignment.id,
      dueDate: recurringDueDate,
      dueUsageHours: recurringDueUsageHours,
      jobId: job.id,
      displayId: job.displayId,
    });
    jobs.push(job);
  }

  return { today, generated, rolledForward, skipped, overview: getRecurringWorkOverview({ today }) };
}
