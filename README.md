# Breathe ESG Ingestion Prototype

Compact Node.js REST API + React prototype for ingesting messy enterprise activity data, normalizing it into emissions records, and letting analysts review rows before audit lock.

## What It Does

- Uploads CSV exports for SAP fuel/procurement, utility electricity, and corporate travel.
- Stores every source row unchanged in `RawRecord`.
- Normalizes rows into `EmissionRecord` with Scope 1, Scope 2, or Scope 3 categorization.
- Flags suspicious rows such as negative fuel, huge electricity usage, unknown plant codes, and unknown airport pairs.
- Lets an analyst approve or reject records, then bulk-lock approved records for audit.
- Writes audit logs for uploads, edits, review decisions, and locking.

## Local Setup

```bash
cd node-backend
npm install
npm run seed
npm run dev
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

The React app defaults to `http://127.0.0.1:8001/api`. For deployment, set `VITE_API_URL=https://<backend-host>/api`.

## Demo Data

Sample files are in `samples/`. They intentionally include realistic breakage:

- an SAP export with German technical headers, gallons, reversals, unknown plant code, and unsupported material group
- utility rows with billing periods, MWh, invalid dates, and high usage
- travel rows with airport-code-derived distances, hotel nights, taxis, and an unknown airport pair

## Deployment Notes

Recommended deployment:

- Backend: Render web service using `node-backend/render.yaml`
- Database: Render PostgreSQL
- Frontend: Vercel with `VITE_API_URL=https://<backend-host>/api`

For a production-grade submission, replace JSON-file persistence with a managed database. The current Node backend keeps the data model and API understandable for the prototype.
