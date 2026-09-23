import { expect, test } from '@playwright/test';

const readyEmail = {
  provider: 'resend',
  providerEmailId: 'e2e-ready-email',
  messageId: '<e2e-ready@trustedfm.co.uk>',
  from: 'dispatch@trustedfm.co.uk',
  to: 'jobs@ops.example',
  subject: 'Work Order: E2E-473923 - Emergency Lighting Test',
  text: [
    'Customer: Travelodge',
    'Site: Manchester Central',
    'Address: 27 Dale Street, Manchester M1 1JA',
    'Job Type: Emergency Lighting Test',
    'Attendance: 22/09/2026',
    'Time: 09:00',
    'Contact: Sarah Williams',
    'Telephone: 0161 555 0199',
    'Work Order: E2E-473923',
  ].join('\n'),
};

const reviewEmail = {
  provider: 'resend',
  providerEmailId: 'e2e-review-email',
  messageId: '<e2e-review@example.net>',
  from: 'unknown@example.net',
  to: 'jobs@ops.example',
  subject: 'E2E AC issue',
  text: 'Hi, the AC is broken at Kings House. Can someone attend ASAP?',
};

async function ingest(request, email) {
  const response = await request.post('/api/v1/email-intake/test-ingest', { data: email });
  expect(response.status()).toBe(202);
  return response.json();
}

async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('email intake renders, supports review, and creates a workflow job', async ({ page, request }, testInfo) => {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  const runId = `${Date.now()}-${testInfo.retry}`;
  const readyReference = `E2E-${runId}`;
  const reviewedReference = `E2E-AC-${runId}`;
  const ready = await ingest(request, {
    ...readyEmail,
    providerEmailId: `e2e-ready-${runId}`,
    messageId: `<e2e-ready-${runId}@trustedfm.co.uk>`,
    subject: readyEmail.subject.replace('E2E-473923', readyReference),
    text: readyEmail.text.replaceAll('E2E-473923', readyReference),
  });
  const review = await ingest(request, {
    ...reviewEmail,
    providerEmailId: `e2e-review-${runId}`,
    messageId: `<e2e-review-${runId}@example.net>`,
  });
  expect(ready.intake.status).toBe('ready');
  expect(review.intake.status).toBe('needs_review');

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const emailNav = page.getByRole('button', { name: 'Email Intake', exact: true });
  await expect(emailNav).toBeVisible();
  const [emailNavBox, liveStatusBox] = await Promise.all([
    emailNav.boundingBox(),
    page.locator('.top-actions .pill.live').boundingBox(),
  ]);
  expect(emailNavBox).not.toBeNull();
  expect(liveStatusBox).not.toBeNull();
  expect(emailNavBox.x + emailNavBox.width).toBeLessThanOrEqual(liveStatusBox.x);
  const panel = page.locator('#email-intake');
  await expect(panel.getByRole('heading', { name: 'Email Intake' })).toBeVisible();
  await panel.getByRole('button', { name: 'All', exact: true }).click();

  const readyCard = panel.locator('.email-intake-card').filter({ hasText: 'Travelodge' });
  await expect(readyCard.getByText('Ready', { exact: true })).toBeVisible();
  await expect(readyCard).toContainText('Manchester Central');
  await expect(readyCard).toContainText('Emergency Lighting Test');
  await expect(readyCard).toContainText('2026-09-22');
  await expect(readyCard).toContainText(`Ref ${readyReference}`);

  const reviewCard = panel.locator('.email-intake-card').filter({ hasText: 'E2E AC issue' });
  await expect(reviewCard.getByText('Needs review', { exact: true })).toBeVisible();
  await expect(reviewCard).toContainText('Reactive AC Callout');
  await capture(page, testInfo, 'email-intake-queue');

  await reviewCard.getByRole('button', { name: 'Review', exact: true }).click();
  const drawer = page.locator('#emailReviewForm');
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Customer').fill('Kings House Management');
  await drawer.getByLabel('Site', { exact: true }).fill('Kings House');
  await drawer.getByLabel('Address').fill('1 King Street, London EC2V 8AA');
  await drawer.getByLabel('Work order / reference').fill(reviewedReference);
  await drawer.getByLabel('Attendance date').fill('2026-09-23');
  await drawer.getByLabel('Attendance time').fill('14:30');

  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/v1/email-intake/${review.intake.id}`) && response.request().method() === 'PATCH'),
    drawer.getByRole('button', { name: 'Save review', exact: true }).click(),
  ]);
  await page.locator('#drawerBackdrop .close').click();

  const reviewedCard = panel.locator('.email-intake-card').filter({ hasText: 'Kings House Management' });
  await expect(reviewedCard.getByText('Ready', { exact: true })).toBeVisible();
  await reviewedCard.getByRole('button', { name: 'Review', exact: true }).click();
  const reviewedDrawer = page.locator('#emailReviewForm');
  await expect(reviewedDrawer.getByLabel('Work order / reference')).toHaveValue(reviewedReference);

  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/v1/email-intake/${review.intake.id}/create-job`) && response.request().method() === 'POST'),
    reviewedDrawer.getByRole('button', { name: 'Create job', exact: true }).click(),
  ]);

  const createdCard = panel.locator('.email-intake-card').filter({ hasText: 'Kings House Management' });
  await expect(createdCard.getByText('Created', { exact: true })).toBeVisible();

  const jobsResponse = await request.get('/api/v1/workflow/jobs');
  expect(jobsResponse.ok()).toBeTruthy();
  const jobs = await jobsResponse.json();
  const createdJob = jobs.find((job) => job.sourceMetadata?.intakeId === review.intake.id);
  expect(createdJob).toMatchObject({
    source: 'email',
    serviceType: 'Reactive AC Callout',
    customer: {
      name: 'Kings House Management',
      address: '1 King Street, London EC2V 8AA',
    },
    sourceMetadata: {
      intakeId: review.intake.id,
      externalReference: reviewedReference,
    },
  });

  await capture(page, testInfo, 'email-intake-created');
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});


test('guided Email Intake demo walks through the safe prospect story', async ({ page }, testInfo) => {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  await page.goto('/?demo=email-intake', { waitUntil: 'domcontentloaded' });

  const demo = page.locator('#emailIntakeDemo');
  await expect(demo.getByRole('heading', { name: 'From inbox to scheduled work' })).toBeVisible();
  await expect(demo).not.toContainText('Sales story');
  await expect(demo).toContainText('Work Order 473923');
  await capture(page, testInfo, 'email-intake-demo-step-1');

  await demo.getByRole('button', { name: 'Next step' }).click();
  await expect(demo).toContainText('Turn the email into structured job information');
  await expect(demo).toContainText('98% confidence');

  await demo.getByRole('button', { name: 'Next step' }).click();
  await expect(demo).toContainText('Review anything that needs attention');
  await demo.getByRole('button', { name: 'Confirm extracted details' }).click();
  await expect(demo).toContainText('Details confirmed');

  await demo.getByRole('button', { name: 'Next step' }).click();
  await demo.getByRole('button', { name: 'Create job' }).click();
  await expect(demo).toContainText('Created as J-2014');

  await demo.getByRole('button', { name: 'Next step' }).click();
  await expect(demo).toContainText('Move straight into scheduling and delivery');
  await expect(demo).toContainText('One system');
  await capture(page, testInfo, 'email-intake-demo-outcome');

  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
