# Design

## Context

The app is a React 19 + Vite + Tailwind SPA exported from AI Studio. Current state relevant to this design:

- `src/services/firebase.ts` initializes Firebase only when `VITE_FIREBASE_*` env vars exist. Today none exist, so everything runs on mock data and localStorage.
- `AuthContext` uses email/password or a demo user switcher (`Navbar.tsx`). Unknown users are auto-promoted to `staff`, and a personal Gmail account is hardcoded as admin in both `AuthContext` and `firestore.rules`.
- `RequestContext` subscribes to the entire `requests` collection. That query is denied for staff by the existing rules, which require `submittedBy.uid == auth.uid`. Ticket IDs come from `requests.length + 1`. `resolutionTimeHours` is computed and written by the client. Reassignment and audit entries only update local state.
- Rules look up roles by UID in `admins/` and `supervisors/`, so an employee can't be authorized before their first sign-in.
- Express and `@google/genai` dependencies are unused leftovers.

Constraints:
- Firebase/GCP project `kachava-lux-ops` on the Blaze plan.
- All staff have `@kachavalux.com` Microsoft 365 accounts.
- Display timezone is America/Cancun (UTC−5, no DST).
- The frontend's look and feel must be preserved (URD).

## Goals / Non-Goals

**Goals:**
- A fully serverless Firebase backend in which **Security Rules are the authorization boundary**.
- Lifecycle timestamps that can't be forged, and KPI durations that only trusted code computes.
- KPI computation that is idempotent and order-independent.
- The smallest frontend diff that meets the specs: rewrite the two contexts, add a timer and KPIs, and leave the rest of the UI alone.

**Non-Goals:**
- Identity Platform blocking functions (`beforeUserSignedIn`). Rules plus the "not authorized" screen are enough. Non-allowlisted tenant users may get an Auth record, but they can read nothing.
- Offline persistence, pagination, and server-side KPI aggregation. Expected volume is hundreds of requests per year, so client-side aggregation is fine.
- Notifications (WhatsApp/email), reopening completed requests, and a custom domain (can be added later without design changes).

## Decisions

### D1. Serverless Firebase with no app server
Firebase Hosting serves the static Vite build. Firestore and Storage are accessed directly from the client and protected by rules. Two Cloud Functions (2nd gen, Node 22) handle only what rules can't do safely: ticket numbering and KPI math.
*Alternative:* keep an Express/Cloud Run API in front of Firestore. Rejected because it adds a service to operate and duplicates authorization that rules already provide, and the URD requires rules-based enforcement anyway.

### D2. Microsoft sign-in, restricted to the tenant
- **Azure side:** an Entra ID app registration configured as **single-tenant** (Kachava Lux directory only). Its redirect URI is `https://<authDomain>/__/auth/handler`.
- **Firebase side:** only the Microsoft provider is enabled; email/password is disabled.
- **Client:** `new OAuthProvider('microsoft.com')` with `setCustomParameters({ tenant: VITE_MS_TENANT_ID, prompt: 'select_account' })`, using `signInWithPopup`. If the popup is blocked (e.g. some iOS cases), it falls back to `signInWithRedirect`.
- **`authDomain`:** set to the Hosting domain (`kachava-lux-ops.web.app`). Hosting serves `/__/auth/*` on that domain, so the redirect flow works under Safari's third-party storage restrictions.

The `tenant` parameter is a client hint and can be removed by an attacker. The real guarantees are:
1. The single-tenant app registration, which Microsoft enforces.
2. The rules check `sign_in_provider == 'microsoft.com'` and that the email ends in `@kachavalux.com`.

*Alternative:* the `common`/`organizations` tenant plus allowlist only. Rejected because tenant restriction is free defense in depth now that we know every employee has a tenant account.

### D3. Allowlist keyed by lowercase email
The allowlist lives at `users/{emailLower}` with fields `{ email, displayName, role, title, active, uid?, lastSignInAt? }`.

Rule helpers:
```
me()         = get(/users/$(request.auth.token.email.lower())).data
isApproved() = signedIn && provider == 'microsoft.com'
               && email.matches('.*@kachavalux[.]com$')
               && exists(users/emailLower) && me().active == true
isSupervisor() = isApproved() && me().role in ['supervisor','admin']
isAdmin()      = isApproved() && me().role == 'admin'
```
- Keying by email lets admins pre-approve people who haven't signed in yet.
- On sign-in, a user may write only `uid` (which must equal `request.auth.uid`) and `lastSignInAt` (which must equal `request.time`) on their own doc.
- Only admins can create or edit users or change a user's `role` or `active`.
- `admins/` and `supervisors/` are removed.

*Alternative:* Auth custom claims. Rejected because claims need the Admin SDK or a function to set them, and they take up to an hour to refresh. A role lookup document costs one read per evaluation and takes effect immediately, which the "deactivated user" scenario requires.

### D4. Data model

The request document `maintenanceRequests/{autoId}`:

| Field(s) | Written by | Rule constraints |
|---|---|---|
| `location{code,name,type}`, `category`, `commonAreaSubLocation?`, `priority`, `locationDetail`, `notes` | submitter on create | `notes` editable only while `sin_revisar` |
| `submittedBy{uid,email,name}` | create | `uid == auth.uid`, `email == token email` |
| `createdAt`, `updatedAt` | client | `== request.time` |
| `status`, `statusChangedAt`, `statusChangedBy{uid,email,name}`, `lastAuditId` | supervisor/admin | transition matrix (D5); `statusChangedAt == request.time` |
| `firstResponseAt`, `firstResponseBy` | set once, on the first transition out of `sin_revisar` | `== request.time`, actor == auth |
| `completedAt`, `completedBy`, `supervisorNotes` | on `→ completada` | `== request.time`, actor == auth, note is required |
| `assignedTo{email,name}?` | supervisor/admin | must reference an active supervisor/admin user |
| `beforePhotos[]` (≤5), `afterPhotos[]` (≤5) | before: submitter while `sin_revisar`; after: supervisor/admin | `size() <= 5` |
| `ticketId` | **function only** | clients must not write it |
| `kpi{responseMs, responseSlaMet, workMs, blockedMs, totalMs, computedAt}` | **function only** | clients must not write it |

The audit subcollection `maintenanceRequests/{id}/audit/{autoId}` holds `{ action, fromStatus?, toStatus?, at, by{uid,email,name,role}, details }`. Clients may create entries only, with `at == request.time` and `by.uid == auth.uid`. Update and delete are always denied. The submitter of the parent request and supervisors may read it.

The counter document `counters/ticket-{YYYY}` holds `{ next }`. Only the function can access it; clients have no access.

Photos are stored as `{ id, path, fileName, sizeBytes, mimeType, uploadedAt, uploadedBy }`. We store the **Storage path, not a download URL**: download-URL tokens bypass Storage rules, so the client resolves URLs at view time through the rules-checked `getDownloadURL` call.

The collection is renamed to `maintenanceRequests` per the URD. Status and category values use the Spanish keys from the specs (`sin_revisar`…, `fauna_nociva`), because the old English keys (`pending`) mean something different now, and reusing them invites bugs.

### D5. State transitions enforced in rules
The transition matrix (`sin_revisar→{pendiente,reconocida}`, `pendiente→reconocida`, `reconocida→{pendiente,completada}`) is a rules map lookup: `allowed[existing.status]` must contain `incoming.status`.

Every status change must be a **batched write**: the request update plus a new audit doc. The rules confirm both halves arrived together:
```
existsAfter(.../audit/$(incoming().lastAuditId))
&& getAfter(...).data.toStatus == incoming().status
```
This guarantees each transition has a server-timestamped audit record. The KPI function relies on those records (D6).

The `affectedKeys().hasOnly([...])` allowlists differ per action:
- create
- staff edit
- status change
- reassign
- add note
- add after photos

### D6. KPI computation in a Firestore-triggered function, rebuilt from the audit log
`onMaintenanceRequestUpdated` runs when `status` or `statusChangedAt` changes. It reads all status audit entries for the request, sorts them by `at`, and recomputes `kpi` **from scratch**:
- `responseMs` = first non-`sin_revisar` entry minus `createdAt`
- `workMs` = sum of the `reconocida` segments
- `blockedMs` = sum of the `pendiente` segments
- `totalMs` = `completedAt − createdAt`
- `responseSlaMet` uses the SLA table

Because the result is a pure function of immutable inputs, the at-least-once delivery of Firestore triggers and out-of-order events can't double-count. That meets the "duplicate processing" scenario. The function writes only `kpi` and skips the write if nothing changed, which prevents a trigger loop.

*Alternative A:* compute durations incrementally from `before` and `after` snapshots. Rejected because it isn't idempotent under retries.
*Alternative B:* compute in rules (timestamp arithmetic). Rejected because it's fragile and unreadable.
*Alternative C:* compute durations only on the client. Rejected because the spec forbids client-writable KPIs, and per-viewer computation would be inconsistent.

The live timer does **not** wait for the function:
- `sin_revisar`: `now − createdAt`
- `reconocida`: `kpi.workMs + (now − statusChangedAt)`
- `pendiente`: `kpi.workMs` (paused)

If the function lags by about a second right after a transition, the timer briefly shows the previous segment total. That's acceptable.

### D7. Ticket IDs assigned by an onCreate function
`onMaintenanceRequestCreated` runs a transaction on `counters/ticket-{YYYY}` (year in America/Cancun), then sets `ticketId = KLM-YYYY-NNNN`. The UI shows "Assigning…" until the ID arrives in the snapshot. The new-request form drops its predicted ID preview.

*Alternative:* a client transaction on the counter plus rules validation via `getAfter`. Rejected because it needs counter read/write rules for all staff and is more complex.

### D8. One shared domain module
`shared/domain.ts` is the single source for the status list, transition map, categories, locations, the SLA table (`urgent: 15m, high: 2h, normal: 4h, low: 24h`), and the KPI math (`computeKpi(createdAt, completedAt?, statusEvents[])`). Both the frontend and `functions/` import it (functions bundle it with esbuild), so the dashboard's open-ticket overdue logic and the backend KPI math can't drift. Rules can't import TypeScript, so the rules restate the enum lists, and a unit test asserts that the rules text contains every enum value.

### D9. Frontend data access
- **Staff:** `query(maintenanceRequests, where('submittedBy.uid','==',uid), orderBy('createdAt','desc'))`.
- **Supervisors/admins:** `query(maintenanceRequests, orderBy('createdAt','desc'))`.
- Both use `onSnapshot`. Audit entries are loaded lazily when the detail modal opens.
- Mock `INITIAL_REQUESTS`, `INITIAL_USERS`, the localStorage request cache, and `switchDemoUser` are deleted. `INITIAL_LOCATIONS` stays as static config.
- **Request creation order:** create the doc first (empty `beforePhotos`), then upload photos to `maintenanceRequests/{id}/before/{photoId}`, then update `beforePhotos`. If an upload fails, the request still exists and the user is told which photo failed.
- **Time utilities:** `src/lib/time.ts` uses `Intl.DateTimeFormat` with `timeZone: 'America/Cancun'` for display and for period boundaries. A `useNow(1000)` hook drives the modal timer and the form's live "submitted at" clock. The interval runs only while the modal is mounted.
- **KPI aggregation:** `src/lib/kpi-aggregate.ts` holds pure functions (counts, averages, medians, SLA %, group-by) over the in-memory request list.

### D10. Storage rules use cross-service Firestore lookups
`match /maintenanceRequests/{reqId}/{kind}/{photoId}`:
- **read:** an approved user who is a supervisor, or the request's `submittedBy.uid == auth.uid`, checked via `firestore.get`.
- **create:**
  - content type matches `image/(jpeg|png|webp)`
  - size < 5 MB
  - `kind == 'before'`: requires the submitter and status `sin_revisar`
  - `kind == 'after'`: requires a supervisor or admin
- **update/delete:** denied.

The 5-photo count is enforced on the Firestore arrays. Storage can't count objects, so a crafted client could upload orphan objects, but they wouldn't be referenced. Size and type limits still apply.

### D11. Configuration and secrets
- `.firebaserc` sets the default project `kachava-lux-ops`.
- `firebase.json` configures:
  - hosting: `dist`, SPA rewrite to `/index.html`, long cache for `/assets/**`, no-cache for `index.html`
  - firestore rules and indexes
  - storage rules
  - functions (source `functions`)
  - emulators
- Web config goes in `.env.production` / `.env.local`. These files are already gitignored by `.env*`; `.env.example` documents the keys: `VITE_FIREBASE_*`, `VITE_MS_TENANT_ID`.
- The Azure client secret is stored only in the Firebase console provider config, never in the repo.
- The user seed script `scripts/seed-users.ts` uses the Admin SDK with Application Default Credentials (`gcloud auth application-default login`), not a key file. It reads a roster JSON passed by path, which stays outside the repo.

### D12. Testing approach
- **Rules:** `@firebase/rules-unit-testing` with Vitest against the Firestore and Storage emulators. Covers each permission and transition scenario from the specs.
- **Domain:** pure Vitest unit tests for `shared/domain.ts` (KPI math, including the spec's worked example and duplicate or out-of-order events) and for `src/lib/time.ts` (Cancun day boundaries).
- **Functions:** tested against the emulator with Vitest: ticket uniqueness under concurrent creates, and KPI recompute.
- **End to end:** the URD §9 production checklist is run manually on deployed hosting, including on an iPhone.

## Risks / Trade-offs

- **[Microsoft token has no `email` claim]** Some Entra accounts lack the `mail` attribute, so Firebase leaves `email` empty and every rule fails.
  → Verify with Randel's account during setup. If affected, set the `mail` attribute in Entra admin for those users. The "not authorized" screen shows the signed-in identity, so this is diagnosable.
- **[`email_verified` is false for Microsoft]** → Rules deliberately rely on provider + domain + allowlist instead of `email_verified`.
- **[Popup blocked on iOS]** → Redirect fallback, plus `authDomain` on the Hosting domain (D2).
- **[A role lookup `get()` on every rule evaluation adds reads]** → It's about one extra read per operation, which is negligible at this volume.
- **[KPI function lag or failure]** → The UI timer doesn't depend on it (D6). A failed run is retried by the platform. An admin-only "recompute KPIs" callable is *not* built; it's deferred until needed.
- **[Firestore/Functions location is permanent]** → Confirm the existing Firestore database's location before deploying functions, and deploy functions in the matching region.
- **[The rules file and the TS enums can drift]** → The D8 test asserts parity.
- **[Orphan Storage objects from failed or crafted uploads]** → Low impact. A future cleanup job is possible.
- **[Spa removal contradicts the URD]** → Recorded in the proposal as an owner decision. There's no existing data to migrate.

## Migration Plan

No production data exists, so this is a greenfield deployment. Order:
1. **Entra ID:** register a single-tenant app, add the redirect URIs for the `web.app` / `firebaseapp.com` handler and `localhost`, and create a client secret.
2. **Firebase console:** enable the Microsoft provider (client ID and secret) and disable the others. Add authorized domains.
3. Confirm the Firestore database and default Storage bucket exist, and note the region.
4. `firebase deploy --only firestore:rules,firestore:indexes,storage`
5. `firebase deploy --only functions` (same region as Firestore).
6. Run `scripts/seed-users.ts` with the confirmed roster: Randel = supervisor, Dina = staff, plus the admin.
7. `npm run build && firebase deploy --only hosting`
8. Run the URD §9 checklist against production.

**Rollback:**
- Hosting: `firebase hosting:rollback`, or redeploy the previous release from the console.
- Rules: redeploy the previous ruleset from console history.
- Functions: redeploy the previous commit.

The old Cloud Run prototype stays untouched until handoff, then the owner decommissions it.

## Open Questions

- Dina's exact email and the administrator's identity (URD §3). These are needed only for the seed roster.
   Response: The pre-approved list of users is:
    - Eduardo Quijano - supervisor - eduardo@kachavalux.com
    - Carla Reina - supervisor - carla.r@kachavalux.com
    - Bianca Velásquez - staff - bianca@kachavalux.com
    - Matt Houston - admin - matt@kachavalux.com
    - Gaby Vidal - admin - gabby@kachavalux.com
    - David Rizo Castro - staff - david.rizo@kachavalux.com
    - Eduardo Velazco - staff - eduardo.v@kachavalux.com
    - Randel Can Chuc - supervisor - randel@kachavalux.com
    - Ricardo Ferrer - admin - ricardo.f@kachavalux.com
    - Richard Fonbuena - admin - richard@kachavalux.com
    - Dina Dominguez - staff - dina@kachavalux.com
- Confirm that "Urgent: Immediate" is operationalized as **15 minutes**. It's a single constant in `shared/domain.ts`.
  Response: yes, confirmed
- Use a custom domain (e.g. `mantenimiento.kachavalux.com`) or the default `kachava-lux-ops.web.app`? Hosting config is identical either way; `authDomain` follows whichever is chosen.
  Response: Let's use the default `kachava-lux-ops.web.app` for now

## Post-implementation decisions (owner requests, 2026-11-06)

- **Facilities** grow to six: Oficina Gerencia (`office`), Oficina Almacén (`warehouse_office`), Cocina (`kitchen`), Gimnasio (`gym`), Almacén (`storage`), Bodega (`bodega`).
- **Location detail** is no longer collected; rules accept it only as an optional legacy field.
- **Description** becomes sanitized rich text (DOMPurify allowlist, http/https/mailto/tel links), max 10,000 characters in rules and client.
- **Ticket backfill:** `onMaintenanceRequestUpdated` also assigns a missing ticket ID / KPI block, so requests created while the function lacked `roles/datastore.user` self-heal on their next update.
- **Request deletion** (supersedes "records are never deleted"): admins only (`allow delete: if isAdmin()`). `onMaintenanceRequestDeleted` removes the `audit` subcollection (`recursiveDelete`) and `maintenanceRequests/{id}/` photos, because clients may not delete either. Photo-deletion failures are logged and do not block the audit purge. Trade-off: no audit record of the deletion beyond function logs.
- **Default supervisor:** `onMaintenanceRequestCreated` assigns `DEFAULT_ASSIGNEE_EMAIL` (default `randel@kachavalux.com`) in a transaction, only if that user is active with role supervisor/admin and the request is unassigned, and writes a `reassigned` audit entry with a `system` actor. Done server-side because staff cannot read `users`.
- **Layout:** fixed-height shell (header + collapsible sidebar, scrolling `main` with `position: relative` so absolutely-positioned descendants do not extend the page).
