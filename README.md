# OPSBOARD

Railway-ready launcher for the Ops Hub MVP.

## Deploy

Railway reads `railway.json`, runs `npm run build`, unpacks `ops-hub-mvp.zip`, and starts the demo on Railway's assigned `PORT`.

- Build: `npm run build`
- Start: `npm start`
- Health check: `/health`

The deployed root route serves `ops-hub-mvp/standalone-demo.html`.
