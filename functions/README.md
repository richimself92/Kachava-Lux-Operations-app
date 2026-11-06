# Cloud Functions - Kachava Lux Maintenance

Two Firestore-triggered functions (2nd gen, Node 22) do the work that Security Rules can't do safely. They run with the Admin SDK, which bypasses rules, and they are the **only** writers of `ticketId`, `kpi`, and `counters/*`.

| Function | Trigger | What it does |
|---|---|---|
| `onMaintenanceRequestCreated` | `maintenanceRequests/{id}` created | Transaction on `counters/ticket-{YYYY}` (Cancun year) → sets `ticketId = KLM-YYYY-NNNN`. Idempotent: skips if `ticketId` already exists. |
| `onMaintenanceRequestUpdated` | `maintenanceRequests/{id}` updated | When `status` or `statusChangedAt` changes, it rebuilds `kpi` **from scratch** from the immutable `audit` entries with `action == 'status_changed'`. It writes only when a value changed. |

KPI math lives in `../shared/domain.ts` (`computeKpi`) and is shared with the frontend. Rebuilding from immutable inputs makes the function safe under at-least-once and out-of-order delivery. Because only `kpi` is written and that doesn't change `status`, the function never retriggers itself.

## Region

The region is a deploy parameter, `LOCATION` (default `us-central1`). It **must match the Firestore database location**:

- Multi-region `nam5` → `us-central1`
- Regional database (e.g. `us-east1`) → that region

Set it in `functions/.env.kachava-lux-ops` (not committed):

```
LOCATION=us-central1
```

If the file is missing, `firebase deploy` prompts for the value.

To check the database location, run `gcloud firestore databases list --project kachava-lux-ops`, or look in Firebase console › Firestore › Data.

## Build

```bash
npm --prefix functions install
npm --prefix functions run build      # esbuild bundles src/ + ../shared into lib/index.js
npm --prefix functions run typecheck
```

`firebase deploy --only functions` runs the build automatically (the `predeploy` step in `firebase.json`).

## Tests

From the repo root (requires a **HotSpot** JDK on PATH; see the root README):

```bash
npm run test:functions
```
