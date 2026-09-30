# Production Acceptance Checklist

Use this checklist before the client is moved onto the IONOS production environment.

## 1. Infrastructure

- [ ] IONOS VPS is running Ubuntu 24.04 LTS.
- [ ] Docker Engine and Docker Compose plugin are installed.
- [ ] Only required public ports are exposed: 80/443, plus restricted administrative access.
- [ ] Office DNS points to the VPS.
- [ ] Engineer DNS points to the VPS.
- [ ] HTTPS certificates are valid for both domains.
- [ ] PostgreSQL reports healthy.
- [ ] OPSBOARD/shared API reports healthy.
- [ ] Dispatch Board reports healthy.
- [ ] Engineer web application reports healthy.
- [ ] No database/container-internal port is publicly exposed.

## 2. Authentication and roles

- [ ] Bootstrap administrator password has been changed/secured.
- [ ] AUTH_TOKEN_SECRET is a strong unique production secret.
- [ ] Every office user has an individual account.
- [ ] Every engineer has an individual account.
- [ ] Engineer application user IDs match workflow technician IDs.
- [ ] Engineer account can see only assigned field work.
- [ ] Engineer cannot access another engineer's timesheets.
- [ ] Engineer cannot update compliance forms for an unassigned job.
- [ ] Office dispatcher can create, assign, reschedule and cancel jobs.
- [ ] Office sign-out invalidates the browser session.
- [ ] Expired sessions require re-authentication.

## 3. Offline engineer acceptance test

Perform this test on the same type of device the engineers will use.

### Prepare online

- [ ] Sign in as a named engineer.
- [ ] Confirm today's assigned jobs are visible.
- [ ] Confirm the offline status shows all changes synced.
- [ ] Open/verify the required compliance forms are available.
- [ ] Verify the current timesheet week is available.
- [ ] Confirm the application has been installed/opened online at least once so the offline shell is cached.

### Lose coverage

Enable airplane mode or otherwise block network access.

- [ ] Close and reopen the engineer application.
- [ ] Secure offline session restores without entering the password again.
- [ ] Assigned jobs remain visible.
- [ ] Job customer/site/contact details remain visible.
- [ ] Required compliance forms remain available.
- [ ] Saved site/location data remains available.

### Complete field work offline

On one assigned job:

- [ ] Start travel.
- [ ] Start the job.
- [ ] Add a note.
- [ ] Complete the service checklist.
- [ ] Complete required compliance form entries.
- [ ] Capture 1-5 photos.
- [ ] Capture customer signature.
- [ ] Save a timesheet day.
- [ ] Complete the job.
- [ ] Confirm each action immediately appears saved on the device.
- [ ] Confirm the sync banner reports offline/pending changes.

### Persistence test

While still offline:

- [ ] Force-close the app.
- [ ] Reopen it.
- [ ] Confirm the job status is retained.
- [ ] Confirm notes are retained.
- [ ] Confirm captured photos/signature remain present.
- [ ] Confirm checklist/compliance data remains present.
- [ ] Confirm the saved timesheet day remains present.
- [ ] Confirm pending sync count remains present.

### Reconnect

Restore connectivity.

- [ ] Automatic synchronization starts without manual intervention.
- [ ] Pending sync count reaches zero.
- [ ] Job status reaches the office Dispatch Board.
- [ ] Each note appears exactly once.
- [ ] Each photo appears exactly once.
- [ ] Signature appears exactly once.
- [ ] Checklist appears exactly once.
- [ ] Compliance forms show the expected completed state.
- [ ] Timesheet data appears once.
- [ ] Completed job becomes eligible for invoice handoff.
- [ ] No duplicate raised job, event, media record or weekly timesheet is created.

## 4. Engineer-raised work offline

While offline:

- [ ] Raise a reactive callout.
- [ ] Add photos.
- [ ] Raise a quoted-work request.
- [ ] Confirm both requests are locally acknowledged.

Reconnect:

- [ ] Both requests enter the office queue automatically.
- [ ] Photos attach to the correct request.
- [ ] Retrying synchronization does not create duplicate jobs.

## 5. Email intake

- [ ] Resend inbound webhook still receives email while office routes are protected.
- [ ] Unsigned/invalid webhook requests are rejected.
- [ ] Office user can search and review inbound messages after sign-in.
- [ ] Deleted/archive state persists after refresh.
- [ ] Creating a job from email creates exactly one office job.

## 6. Backup and recovery

- [ ] Restic repository on the client physical server is reachable only through the approved secure path/VPN.
- [ ] Backup encryption password is stored separately from the backup repository.
- [ ] A scheduled backup completes successfully.
- [ ] Backup contains the PostgreSQL dump.
- [ ] Backup contains OPSBOARD persistent data, including compliance data and job media.
- [ ] Backup contains Dispatch Board persistent state.
- [ ] Restic integrity check succeeds.
- [ ] PostgreSQL dump is restored into a test database.
- [ ] At least one job photo/document is restored from Restic.
- [ ] Restore procedure and credentials are documented in the handover pack.

## 7. Final cutover

- [ ] Production accounts loaded.
- [ ] Real company/domain configuration applied.
- [ ] Demo/test credentials removed.
- [ ] Test jobs clearly removed or marked non-production.
- [ ] Resend production sender/webhook configuration applied.
- [ ] Monitoring/health checks enabled.
- [ ] Backup alerts/verification enabled.
- [ ] Client confirms office workflow.
- [ ] Client confirms engineer workflow.
- [ ] Client confirms offline operation.
- [ ] Production acceptance signed off.
