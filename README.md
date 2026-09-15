# OPSBOARD

Owner/director Ops Hub for field-service exception management.

## What is now source-controlled

The live app source is in `src/` rather than being hidden inside the legacy `ops-hub-mvp.zip` archive. The archive remains in the repository only as a historical backup and is no longer used by the deployment.

Current Ops Hub capabilities include:
- KPI / director question header
- Exception dashboard across Scheduling, Visibility, Handover, Billing and Compliance
- Cross-job visibility and job drawer
- Job-to-cash / unbilled WIP aging from job completion timestamps
- Subcontractor coordination
- FSM risk scorecard
- Compliance control view covering sites, assets, form catalogue, job templates and form submissions

## Deploy

Railway reads `railway.json`, runs `npm run build`, then starts `npm start` on Railway's assigned `PORT`.

- Build: `npm run build`
- Start: `npm start`
- Health check: `/health`

The build copies the source-controlled files from `src/` into `dist/`.
