# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
# auction-dashoard

## Deployment

The frontend (`src/`, built to `dist/`) is a static Vite SPA. The API
(`api/*.js`) is a set of plain `(req, res)` handlers, framework-agnostic —
they are hosted two ways, both from this same repo:

### Vercel (existing)

Unchanged. `api/*.js` deploys as-is via Vercel's file-based `/api` routing.
`vercel dev` runs both frontend and API locally (see `.vercel/project.json`
for the linked project).

### Firebase Hosting + Cloud Run (added)

- `dist/` is served by Firebase Hosting (site `hmr-auction-dashboard`,
  project `hmr-solutions` — see `.firebaserc`/`firebase.json`).
- `/api/**` is rewritten to a Cloud Run service (`serviceId:
  auction-dashboard-api`, region `asia-southeast1` in `firebase.json` —
  change the region there if a different one is preferred).
- `server/index.js` is the ONLY deployment-specific code: it imports every
  handler in `api/*.js` unmodified and mounts each under its existing
  `/api/...` path with Express. No handler logic, SQL, or response shape
  is touched — Express's `req.query`/`res.status().json()`/`res.setHeader()`
  are what every handler already used under Vercel.

Build and deploy:

```sh
npm run build            # -> dist/

# Cloud Run (requires gcloud, authenticated, billing/Cloud Run API enabled
# on the hmr-solutions project):
gcloud run deploy auction-dashboard-api \
  --source . \
  --region asia-southeast1 \
  --project hmr-solutions \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --concurrency 40 \
  --set-env-vars CLICKHOUSE_HOST=...,CLICKHOUSE_USER=...,CLICKHOUSE_PASSWORD=...,CLICKHOUSE_DATABASE=...,HMR_API_TOKEN=...
  # (prefer --set-secrets with Secret Manager over --set-env-vars for the
  # password/token in a real deploy)

# Firebase Hosting (only after the Cloud Run service above exists):
firebase deploy --only hosting
```

Run the API locally without Vercel (frontend still runs separately via
`npm run dev`):

```sh
npm run server   # node server/index.js, listens on PORT (default 8080)
```

### Environment variables (server-side only, never committed)

| Variable | Used by |
|---|---|
| `CLICKHOUSE_HOST` | every `api/*.js` handler (ClickHouse client) |
| `CLICKHOUSE_USER` | same |
| `CLICKHOUSE_PASSWORD` | same |
| `CLICKHOUSE_DATABASE` | same |
| `HMR_API_TOKEN` | `api/_hmrApi.js` (cms.hmr.ph live-bidding proxy, used by the Online Bidding endpoints) |

Same variable names as the existing Vercel project — set them as Cloud Run
environment variables or, preferably, Secret Manager secrets. Nothing
locally changes: `.env.local` keeps working for `vercel dev` exactly as
before.
