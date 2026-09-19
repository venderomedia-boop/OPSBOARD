const SERVICE_PATTERNS = [
  { id: 'water_hygiene_monthly', serviceType: 'Water Hygiene Visit', re: /water\s+hygiene|temperature\s+monitoring/i },
  { id: 'emergency_lighting', serviceType: 'Emergency Lighting Test', re: /emergency\s+light(?:ing)?|emergency\s+lights?/i },
  { id: 'reactive_ac', serviceType: 'Reactive AC Callout', re: /(?:broken|fault(?:y)?|issue|problem).{0,30}(?:ac|air\s*con)|(?:ac|air\s*con).{0,30}(?:broken|fault|issue|problem)/i },
  { id: 'hvac_ppm', serviceType: 'PPM HVAC Visit', re: /\bppm\b.*\bhvac\b|\bhvac\b.*\bppm\b/i },
  { id: 'boiler_service', serviceType: 'Boiler Service', re: /boiler\s+(?:service|maintenance|inspection)/i },
];

const LABELS = {
  customerName: ['customer', 'client', 'company'],
  siteName: ['site', 'site name', 'location'],
  siteAddress: ['address', 'site address'],
  contactName: ['contact', 'contact name'],
  contactPhone: ['telephone', 'phone', 'mobile', 'contact number'],
  contactEmail: ['contact email', 'email'],
  externalReference: ['work order', 'work order number', 'wo', 'reference', 'job ref', 'job reference', 'po'],
  requestedDate: ['attendance', 'visit date', 'date', 'requested date'],
  requestedTime: ['time', 'visit time', 'attendance time'],
  description: ['description', 'details', 'job details', 'works required'],
};

function clean(value='') {
  return String(value).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
function firstMatch(text, re) {
  const match = String(text || '').match(re);
  return match?.[1] ? clean(match[1]) : '';
}
function escapeRe(value){ return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function fieldByLabel(text, labels) {
  const source = String(text || '');
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n)\\s*${escapeRe(label)}\\s*[:#-]\\s*([^\\n\\r]+)`, 'im');
    const value = firstMatch(source, re);
    if (value) return value;
  }
  return '';
}
function parseUkPostcode(text) {
  return firstMatch(text, /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i).toUpperCase();
}
function parseEmail(text) {
  return firstMatch(text, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i).toLowerCase();
}
function normalizeEmailAddress(value='') {
  return parseEmail(String(value||'')) || clean(value).toLowerCase();
}
function parsePhone(text) {
  return firstMatch(text, /\b((?:\+44\s?\d{2,4}|0\d{2,4})[\s()-]*(?:\d[\s()-]*){6,10})\b/);
}
function parseDate(value) {
  const input = clean(value);
  if (!input) return '';
  const iso = input.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = input.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/);
  if (uk) return `${uk[3]}-${String(uk[2]).padStart(2,'0')}-${String(uk[1]).padStart(2,'0')}`;
  return '';
}
function parseTime(value) {
  const input = clean(value);
  const match = input.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return match ? `${String(match[1]).padStart(2,'0')}:${match[2]}` : '';
}
function serviceFromText(text) {
  for (const rule of SERVICE_PATTERNS) {
    if (rule.re.test(text)) return { jobTemplateId: rule.id, serviceType: rule.serviceType, confidence: 0.95, source:'rule' };
  }
  const labelled = fieldByLabel(text, ['job type','service','service type','works']);
  if (labelled) return { jobTemplateId:'', serviceType:labelled, confidence:0.75, source:'label' };
  return { jobTemplateId:'', serviceType:'', confidence:0, source:'none' };
}

export function normalizeInboundEmail(input={}) {
  const from = typeof input.from === 'string' ? input.from : input.from?.email || input.from?.text || '';
  const to = Array.isArray(input.to) ? input.to.join(', ') : (input.to || '');
  return {
    provider: clean(input.provider || 'unknown'),
    providerEmailId: clean(input.providerEmailId || input.emailId || input.id || ''),
    messageId: clean(input.messageId || input.message_id || ''),
    from: normalizeEmailAddress(from),
    to: clean(to).toLowerCase(),
    subject: clean(input.subject || ''),
    text: String(input.text || input.textBody || ''),
    html: String(input.html || input.htmlBody || ''),
    attachments: Array.isArray(input.attachments) ? input.attachments.map((a, i) => ({
      id: clean(a.id || `attachment-${i+1}`),
      filename: clean(a.filename || a.name || `attachment-${i+1}`),
      contentType: clean(a.contentType || a.content_type || 'application/octet-stream'),
      size: Number(a.size || 0) || 0,
      providerAttachmentId: clean(a.providerAttachmentId || a.id || ''),
    })) : [],
    receivedAt: input.receivedAt ? new Date(input.receivedAt).toISOString() : new Date().toISOString(),
  };
}

export function extractJobCandidate(emailInput={}) {
  const email = normalizeInboundEmail(emailInput);
  const body = [email.subject, email.text].filter(Boolean).join('\n');
  const service = serviceFromText(body);
  const customerName = fieldByLabel(body, LABELS.customerName);
  const siteName = fieldByLabel(body, LABELS.siteName);
  const siteAddress = fieldByLabel(body, LABELS.siteAddress);
  const contactName = fieldByLabel(body, LABELS.contactName);
  const contactPhone = fieldByLabel(body, LABELS.contactPhone) || parsePhone(body);
  const contactEmail = fieldByLabel(body, LABELS.contactEmail) || parseEmail(body);
  const externalReference = fieldByLabel(email.text, LABELS.externalReference) || firstMatch(email.subject, /(?:work\s*order|wo|reference|job\s*ref|po)\s*[:#-]\s*([A-Z0-9._\/-]+)/i);
  const rawDate = fieldByLabel(body, LABELS.requestedDate) || body;
  const rawTime = fieldByLabel(body, LABELS.requestedTime) || body;
  const requestedDate = parseDate(rawDate);
  const requestedTime = parseTime(rawTime);
  const postcode = parseUkPostcode(siteAddress || body);
  const description = fieldByLabel(body, LABELS.description) || email.subject;

  const fields = {
    customerName,
    siteName,
    siteAddress,
    city: '',
    postcode,
    contactName,
    contactPhone,
    contactEmail,
    externalReference,
    serviceType: service.serviceType,
    jobTemplateId: service.jobTemplateId,
    requestedDate,
    requestedTime,
    description,
    priority: /\burgent\b|\bemergency\b|\basap\b/i.test(body) ? 'urgent' : 'normal',
    notes: email.text.slice(0, 4000),
  };

  const confidence = {
    customerName: customerName ? 0.98 : 0,
    siteName: siteName ? 0.96 : 0,
    siteAddress: siteAddress ? 0.97 : postcode ? 0.55 : 0,
    serviceType: service.confidence,
    requestedDate: requestedDate ? 0.98 : 0,
    requestedTime: requestedTime ? 0.95 : 0,
    contactName: contactName ? 0.9 : 0,
    contactPhone: contactPhone ? 0.92 : 0,
    contactEmail: contactEmail ? 0.95 : 0,
    externalReference: externalReference ? 0.95 : 0,
  };

  const core = [confidence.customerName, Math.max(confidence.siteName, confidence.siteAddress), confidence.serviceType];
  const scheduling = [confidence.requestedDate, confidence.requestedTime];
  const overallConfidence = Number(((core.reduce((a,b)=>a+b,0)/core.length)*0.75 + (scheduling.reduce((a,b)=>a+b,0)/scheduling.length)*0.25).toFixed(2));

  return { email, fields, confidence, overallConfidence, extractorVersion:'rules-v1' };
}

export function validateJobCandidate(candidate, options={}) {
  const fields = candidate?.fields || {};
  const errors = [];
  const warnings = [];
  const requireSchedule = options.requireSchedule !== false;

  if (!fields.customerName) errors.push({field:'customerName', message:'Customer is required'});
  if (!fields.siteName && !fields.siteAddress) errors.push({field:'site', message:'Site name or site address is required'});
  if (!fields.serviceType) errors.push({field:'serviceType', message:'Service/job type is required'});
  if (requireSchedule && !fields.requestedDate) errors.push({field:'requestedDate', message:'Attendance date is required before job creation'});
  if (requireSchedule && !fields.requestedTime) warnings.push({field:'requestedTime', message:'Attendance time is missing; office scheduling is required'});
  if (!fields.contactName && !fields.contactPhone && !fields.contactEmail) warnings.push({field:'contact', message:'No site contact could be identified'});
  if (!fields.externalReference) warnings.push({field:'externalReference', message:'No work-order/reference number found'});

  return { valid: errors.length===0, errors, warnings };
}

export function decisionForCandidate(candidate, validation, options={}) {
  const trustedSender = Boolean(options.trustedSender);
  const threshold = Number(options.autoCreateThreshold ?? 0.94);
  const hasDate = Boolean(candidate?.fields?.requestedDate);
  const hasTime = Boolean(candidate?.fields?.requestedTime);
  const hasStrongSite = Boolean(candidate?.fields?.siteName || candidate?.fields?.siteAddress);
  const readyForCreation = trustedSender && validation.valid && hasDate && hasTime && hasStrongSite && candidate.overallConfidence >= threshold;
  return {
    status: readyForCreation ? 'ready' : 'needs_review',
    autoCreate:false,
    readyForCreation,
    reasons: readyForCreation ? ['Trusted sender and extraction passed ready-for-creation policy'] : [
      ...(!trustedSender ? ['Sender is not on the trusted auto-create allowlist'] : []),
      ...(!validation.valid ? validation.errors.map(e=>e.message) : []),
      ...(!hasTime ? ['Attendance time requires confirmation'] : []),
      ...(candidate.overallConfidence < threshold ? [`Confidence ${candidate.overallConfidence} is below ${threshold}`] : []),
    ],
  };
}
