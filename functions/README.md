# Cloud Functions - Kachava Lux Maintenance

2nd-gen functions (Node 22, deployed as Cloud Run services) do the work that Security Rules can't do safely. They run with the Admin SDK, which bypasses rules, and they are the **only** writers of `ticketId`, `kpi`, `counters/*` and `maintenanceRequests/{id}/translations/*`.

| Function | Trigger | What it does |
|---|---|---|
| `onMaintenanceRequestCreated` | `maintenanceRequests/{id}` created | Transaction on `counters/ticket-{YYYY}` (Cancun year) → sets `ticketId = KLM-YYYY-NNNN`. Idempotent: skips if `ticketId` already exists. Also assigns the default supervisor. |
| `onMaintenanceRequestUpdated` | `maintenanceRequests/{id}` updated | When `status` or `statusChangedAt` changes, it rebuilds `kpi` **from scratch** from the immutable `audit` entries with `action == 'status_changed'`. It writes only when a value changed. |
| `onMaintenanceRequestDeleted` | `maintenanceRequests/{id}` deleted | Purges the request's `audit` and `translations` subcollections and its Storage photos. |
| `translateComments` | Callable (HTTPS, Firebase Auth) | Translates a request's user-typed text into `es` or `en` with Cloud Translation Advanced (v3). See below. |

KPI math lives in `../shared/domain.ts` (`computeKpi`) and is shared with the frontend. Rebuilding from immutable inputs makes the function safe under at-least-once and out-of-order delivery. Because only `kpi` is written and that doesn't change `status`, the function never retriggers itself.

## Comment translation (`translateComments`)

Code: `src/translate.ts` (pure logic, translator injected), `src/googleTranslator.ts` (v3 client), and the wiring in `src/index.ts`.

- **Input:** `{ reqId, target: 'es' | 'en', items: [{ kind: 'audit', id } | { kind: 'description' } | { kind: 'supervisorNotes' }] }`, with 1–50 items. The client sends references, never text; the function reads the originals from Firestore and **never modifies them**.
- **Access:** the same checks as `firestore.rules`:
  - the caller signs in with Microsoft and has an `@kachavalux.com` email;
  - `users/{email}` exists and has `active == true`;
  - the caller is the request's submitter, a supervisor or an admin.

  Otherwise the call fails with `unauthenticated`, `permission-denied` or `not-found`.
- **Translatable:** the description (sent as `text/html` when it contains formatting), `supervisorNotes`, and audit `details` of `note_added` / `status_changed` entries. At most 30,000 uncached characters per call.
- **Output:** `{ results: [{ key, status: 'translated' | 'same' | 'error', text?, detectedSource? }] }`. A result of `same` means the text is already in the target language.
- **Cache:** results are stored in `maintenanceRequests/{reqId}/translations/{kind}_{id}_{target}` with a SHA-256 `sourceHash` of the original:
  - a changed original is translated again;
  - a cached `detectedSource` is sent as `sourceLanguageCode` the next time;
  - clients cannot read or write the cache (rules deny it).
- **Errors:** quota errors return `resource-exhausted` and other service failures return `unavailable`. Errors are not cached.
- **Logs:** only `target`, counts, `durationMs`, `outcome` and the error code. Comment text and emails are never logged.
- **Credentials:** Application Default Credentials of the runtime service account. No API key or key file.
- **Emulator:** under `FUNCTIONS_EMULATOR=true` a fake translator is used. It prefixes the text with `[en]`/`[es]` and detects Spanish with a simple heuristic, so local development needs no GCP access.

## Parameters

Set in `functions/.env.kachava-lux-ops` (not committed). If a value is missing, `firebase deploy` prompts for it.

| Parameter | Default | Meaning |
|---|---|---|
| `LOCATION` | `us-central1` | Region. **Must match the Firestore database location**: multi-region `nam5` → `us-central1`; a regional database (e.g. `us-east1`) → that region. |
| `DEFAULT_ASSIGNEE_EMAIL` | `randel@kachavalux.com` | Supervisor assigned to new requests. |
| `TRANSLATE_LOCATION` | `global` | Cloud Translation location. Use `us-central1` to keep processing in the US region. |
| `TRANSLATE_SERVICE_ACCOUNT` | `translate-fn@` | Runtime identity of `translateComments` only. The trailing `@` is shorthand for `translate-fn@<project>.iam.gserviceaccount.com`. IAM setup: `docs/DEPLOYMENT.md` §9. |

```
LOCATION=us-central1
DEFAULT_ASSIGNEE_EMAIL=randel@kachavalux.com
TRANSLATE_LOCATION=global
TRANSLATE_SERVICE_ACCOUNT=translate-fn@
```

To check the database location, run `gcloud firestore databases list --project kachava-lux-ops`, or look in Firebase console › Firestore › Data.

## Build

```bash
npm --prefix functions install
npm --prefix functions run build      # esbuild bundles src/ + ../shared into lib/index.js
npm --prefix functions run typecheck
```

`firebase deploy --only functions` runs the build automatically (the `predeploy` step in `firebase.json`). `@google-cloud/translate` stays external to the bundle and is loaded on first use, so cold starts of the other functions are not affected.

## Tests

From the repo root (requires a **HotSpot** JDK on PATH; the script stops with instructions if `java` is
OpenJ9 — see the root README):

```bash
npm run test:functions
```
