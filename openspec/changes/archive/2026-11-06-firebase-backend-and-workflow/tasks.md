# Tasks

## 1. Project setup and cleanup

- [x] 1.1 Remove `express`, `@types/express`, `@google/genai`, `dotenv` from `package.json`, delete Gemini/APP_URL entries from `.env.example`, rename the package to `kachava-lux-maintenance`; verify `npm install && npm run build` succeeds.
- [x] 1.2 Add dev deps `firebase-tools`, `vitest`, `@firebase/rules-unit-testing`; add scripts `test`, `test:rules` (wrapped in `firebase emulators:exec`), `deploy`; verify `npx vitest --version` and `npx firebase --version` run.
- [x] 1.3 Create `.firebaserc` (default `kachava-lux-ops`) and `firebase.json`:
  - hosting `dist`: SPA rewrite, cache headers for `/assets/**`, no-cache for `index.html`
  - firestore rules and indexes
  - storage rules
  - functions source `functions`
  - emulators auth/firestore/storage/functions

  Verify `npx firebase emulators:start --only firestore,storage,auth` boots locally.
- [x] 1.4 Document env keys (`VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `VITE_MS_TENANT_ID`, `VITE_USE_EMULATORS`) in `.env.example`; verify `git check-ignore .env.local .env.production` reports both ignored.

## 2. Shared domain model

- [x] 2.1 Create `shared/domain.ts` with:
  - statuses `sin_revisar | pendiente | reconocida | completada` and the transition map
  - categories (add `jacuzzi`, `fauna_nociva`; remove `spa`)
  - location codes and types, priorities
  - SLA table (urgent 15m, high 2h, normal 4h, low 24h)
  - `isResponseOverdue(createdAt, priority, now)`

  Verify `tsc --noEmit` passes.
- [x] 2.2 Implement `computeKpi(createdAt, statusEvents[], completedAt?)` in `shared/domain.ts` (responseMs, responseSlaMet, workMs, blockedMs, totalMs; sorts events itself). Add `shared/domain.test.ts` covering:
  - the spec's 09:00→13:30 worked example
  - duplicate events
  - out-of-order events
  - an open request with no response

  Verify `npm test` passes.
- [x] 2.3 Update `src/types/index.ts` to import or re-export the shared enums. Replace `photos` with `beforePhotos`/`afterPhotos` (path-based), `villaNumber`/`villaName` with `location{code,name,type}`, and add `statusChangedAt`, `statusChangedBy`, `firstResponseAt/By`, `assignedTo`, `kpi`. Remove `resolutionTimeHours` and embedded `auditTrail`. Verify `npm run lint` reports errors only in files scheduled for rewrite in groups 6–8.

## 3. Firestore security rules

- [x] 3.1 Rewrite `firestore.rules`:
  - Helpers: `isApproved` (microsoft.com provider, `@kachavalux.com` email, active `users/{emailLower}`), `isSupervisor`, `isAdmin`
  - Remove the Gmail backdoor and the `admins/` and `supervisors/` collections
  - `users/{email}`: admin CRUD; self may set only `uid == auth.uid` and `lastSignInAt == request.time`
  - `counters/**`: deny all

  Verify `firebase emulators:exec` loads the rules without compile errors.
- [x] 3.2 Add `maintenanceRequests/{id}` rules:
  - **create:** status `sin_revisar`, `submittedBy` == auth, `createdAt == request.time`, enum validation, no `ticketId`/`kpi`, empty `afterPhotos`
  - **read:** submitter or supervisor
  - **staff edit:** `notes`/`beforePhotos` while `sin_revisar`
  - **status change:** transition map, `statusChangedAt == request.time`, `existsAfter`/`getAfter` audit pairing via `lastAuditId`, `firstResponseAt/By` set once, `completedAt/By` + required `supervisorNotes` on `completada`, auto-assign
  - **reassign:** to an active supervisor
  - **note / after-photos:** updates by supervisor
  - `ticketId`/`kpi` never client-writable
  - **delete:** denied

  Verify the rules compile in the emulator.
- [x] 3.3 Add `maintenanceRequests/{id}/audit/{auditId}` rules: create-only with `at == request.time` and `by.uid == auth.uid`; read for the submitter or supervisors; update/delete denied. Verify the rules compile.
- [x] 3.4 Write `tests/rules/firestore.rules.test.ts` covering every access-control, request-lifecycle, and maintenance-requests rejection scenario in the specs:
  - non-allowlisted user denied
  - deactivated user denied
  - non-Microsoft provider denied
  - forged submitter rejected
  - staff status change rejected
  - `sin_revisar→completada` rejected
  - `completada` is final
  - forged timestamp rejected
  - `spa` category rejected
  - client write to `kpi`/`ticketId` rejected
  - audit update rejected
  - staff edit after `pendiente` rejected
  - plus the happy paths

  Verify `npm run test:rules` passes.
- [x] 3.5 Add a parity test asserting `firestore.rules` contains every status, category, location, and priority value from `shared/domain.ts`; verify it fails when a value is removed from the rules and passes when restored.
- [x] 3.6 Replace `firestore.indexes.json` with the indexes for `submittedBy.uid + createdAt desc` and `status + createdAt desc` on `maintenanceRequests`; verify the staff query runs in the emulator without a missing-index error.

## 4. Storage security rules

- [x] 4.1 Rewrite `storage.rules` for `maintenanceRequests/{reqId}/{kind}/{photoId}`:
  - **read:** approved submitter or supervisor, via `firestore.get`
  - **create:** `image/(jpeg|png|webp)`, < 5 MB; `before` only by the submitter while `sin_revisar`; `after` only by a supervisor/admin
  - **update/delete:** denied
  - default deny

  Verify the rules compile in the emulator.
- [x] 4.2 Write `tests/rules/storage.rules.test.ts`:
  - 6 MB rejected
  - PDF rejected
  - another staff member's read denied
  - non-allowlisted read denied
  - staff `after` upload denied
  - valid uploads allowed

  Verify `npm run test:rules` passes.

## 5. Cloud Functions

- [x] 5.1 Scaffold `functions/` (TypeScript, Node 22, `firebase-functions` v2, `firebase-admin`, esbuild bundle that includes `../shared/domain.ts`); set the region to the Firestore database location; verify `npm --prefix functions run build` emits `lib/index.js`.
- [x] 5.2 Implement `onMaintenanceRequestCreated`: a transaction on `counters/ticket-{YYYY}` (Cancun year) sets `ticketId = KLM-YYYY-NNNN`, and skips if `ticketId` already exists. Verify with an emulator test that 20 concurrent creates yield 20 distinct sequential IDs.
- [x] 5.3 Implement `onMaintenanceRequestUpdated`: when `status` or `statusChangedAt` changes, load the status audit entries, call `computeKpi`, write `kpi` + `computedAt` only if the values changed. Verify emulator tests:
  - the worked example produces the spec values
  - re-delivering the same event leaves `kpi` unchanged
  - no infinite trigger loop (the function write count stays bounded)
- [x] 5.4 Document function behavior and the region choice in `functions/README.md`; verify the documented `npm --prefix functions run build` command runs as written.

## 6. Authentication and user management (frontend)

- [x] 6.1 Update `src/services/firebase.ts`: required env config (fail loudly when missing in production), emulator wiring when `VITE_USE_EMULATORS=true`, a Microsoft `OAuthProvider` with `tenant` + `prompt=select_account`, and `signInWithMicrosoft()` (popup with redirect fallback); verify `npm run lint` passes for this file.
- [x] 6.2 Rewrite `src/context/AuthContext.tsx`:
  - on auth change, read `users/{emailLower}`
  - expose `authState: 'loading' | 'signedOut' | 'unauthorized' | 'ready'` and role
  - write own `uid` and `lastSignInAt`
  - remove `INITIAL_USERS`, `switchDemoUser`, email/password, and the auto-staff fallback

  Verify in the emulator that an allowlisted user reaches `ready` and a non-listed user reaches `unauthorized`.
- [x] 6.3 Replace the login UI with a single "Sign in with Microsoft / Iniciar sesión con Microsoft" button and add an "Not authorized / No autorizado" screen showing the signed-in email and a sign-out button. Remove the demo user switcher from `Navbar.tsx`. Verify visually on the emulator; `grep -r switchDemoUser src` returns nothing.
- [x] 6.4 Rewire `UserManagementView.tsx` to the `users` collection (add user, change role, toggle active) via Firestore; hide it for non-admins. Verify in the emulator that an added user can sign in and a deactivated user is blocked on their next read.
- [x] 6.5 Create `scripts/seed-users.ts` (Admin SDK + ADC, takes a roster JSON path, upserts `users/{emailLower}`, refuses non-`@kachavalux.com` emails) and document its usage in `README.md`; verify it seeds the emulator when run with `FIRESTORE_EMULATOR_HOST` set.

## 7. Requests data layer and request form (frontend)

- [x] 7.1 Create `src/lib/time.ts`: Cancun formatters, `startOfCancunDay/Month/Year`, `isInPeriod(date, period, now)`, and duration formatting `H:MM:SS`. Add `src/lib/time.test.ts` including the 23:30-yesterday / UTC-device case. Verify `npm test` passes.
- [x] 7.2 Rewrite `src/context/RequestContext.tsx` around `maintenanceRequests`:
  - role-scoped `onSnapshot` queries
  - `createRequest`: doc first, then before-photo uploads to Storage paths, then a `beforePhotos` update
  - `changeStatus(id, toStatus, note?)` as a batch (request + audit with `lastAuditId`)
  - `completeRequest` with after photos
  - `reassign`, `addNote`
  - remove `INITIAL_REQUESTS`, the localStorage cache, client `resolutionTimeHours`, and client ticket numbering

  Verify in the emulator: submit → appears for a supervisor; staff sees only their own.
- [x] 7.3 Add `src/hooks/useNow.ts` (interval tick, cleared on unmount) and `src/hooks/usePhotoUrl.ts` (resolves a Storage path to a URL via `getDownloadURL`); verify `npm run lint` passes.
- [x] 7.4 Update `NewRequestModal.tsx`:
  - live Cancun "submitted at" date/time in the metadata banner (via `useNow`)
  - replace the predicted ticket ID with "Assigned on submit / Se asigna al enviar"
  - categories from `shared/domain.ts` (Jacuzzi and Fauna nociva present, Spa gone)
  - SLA labels from the shared table

  Verify in the browser that the date and time tick, and that the category list matches the spec.
- [x] 7.5 Update `src/i18n/translations.ts`: add `catJacuzzi` (Jacuzzi/Jacuzzi) and `catFaunaNociva` (Pest control/Fauna nociva), remove `catSpa`, add the four status labels (Unreviewed/Sin revisar, Pending/Pendiente, Acknowledged/Reconocida, Completed/Completada), and add the timer, KPI, and auth strings. Verify `npm run lint` passes and no `catSpa` reference remains.
- [x] 7.6 Remove mock requests and users from `src/data/initialData.ts`, keeping `INITIAL_LOCATIONS`; verify `grep -r INITIAL_REQUESTS src` returns nothing and `npm run build` succeeds.

## 8. Ticket lifecycle UI and live timer

- [x] 8.1 Update `RequestDetailModal.tsx` actions per role and state:
  - supervisor buttons: "Mark pending (blocked)", "Start work (reconocida)", "Complete" with a required note and ≤5 after photos
  - reassign dropdown of active supervisors
  - staff see no state controls
  - audit history loaded from the subcollection, in Cancun time

  Verify in the emulator: each allowed transition succeeds; invalid buttons don't render.
- [x] 8.2 Add a `TicketTimer` component in the modal:
  - `sin_revisar`: response clock vs SLA, red + "Overdue/Vencida" past target
  - `reconocida`: work timer = `kpi.workMs + (now − statusChangedAt)`
  - `pendiente`: paused accumulated work time with a "Paused/En pausa" label
  - `completada`: static response, work, and total times

  Add `TicketTimer.test.tsx` (or pure helper tests) for overdue High at 2h05m, Normal at 1h not red, and the paused state. Verify `npm test` passes.
- [x] 8.3 Update `RequestList.tsx` status badges and filters to the four states, show `ticketId` or "Assigning…", and use Cancun period filtering via `src/lib/time.ts`; verify filtering by each state and period in the browser.

## 9. KPI dashboard

- [x] 9.1 Create `src/lib/kpi-aggregate.ts`: counts per state, urgent open, overdue unreviewed (`isResponseOverdue`), average/median response, SLA compliance %, average work time, average time-to-addressed, group-by priority/category/location/assignee/completedBy. "—" for empty sets. Add unit tests. Verify `npm test` passes.
- [x] 9.2 Update `Dashboard.tsx` KPI cards: four state counts, overdue unreviewed, SLA compliance %, average response, average work, average time-to-fully-addressed. Use the time filter (daily/weekly/monthly/yearly in Cancun). Replace the client-computed `avgResolutionHours`. Verify the cards update live when a request is completed in another browser session.
- [x] 9.3 Add a breakdown table on the dashboard with a selectable dimension (priority/category/location/supervisor) showing count, SLA %, average work, and average total. Verify it in the browser with seeded emulator data.

## 10. Deployment and production verification

- [x] 10.1 Write `docs/DEPLOYMENT.md`:
  - Entra ID single-tenant app registration (redirect URIs)
  - enabling the Microsoft provider and disabling the others
  - authorized domains
  - confirming the Firestore/Storage region
  - env files
  - seed users
  - deploy order and rollback

  Update `README.md` to link it. Verify a teammate could follow it end-to-end (dry read-through against the console).
- [ ] 10.2 Configure Entra ID and Firebase Auth per the doc, then sign in with Randel's account on localhost against production Auth and confirm the ID token has `email` and `firebase.sign_in_provider == microsoft.com`. Verify by logging the decoded claims in dev.
  > Archived open (2026-11-06): Entra ID/Auth are configured and owner sign-in works in production; the claims check with Randel's account is tracked as row 1 of `docs/HANDOFF.md` §5.
- [ ] 10.3 Run the URD §9 checklist on production:
  - staff signs in and submits a request with a photo
  - the request appears in Firestore and on the supervisor dashboard with a ticket ID
  - the supervisor moves it to pendiente → reconocida (timer runs) → completada with note and photo
  - `kpi` is populated
  - completion time and completed-by are correct
  - data persists after logout/refresh/other device
  - a non-allowlisted tenant user sees "Not authorized" and gets denied reads
  - the dashboard filters reflect real records
  - the whole flow works on an iPhone

  Record the results in `docs/HANDOFF.md`.
  > Archived open (2026-11-06): every item passes on the local emulators (automated rules/functions tests and browser checks); production results that are still pending are tracked in `docs/HANDOFF.md` §5, after the pending deploy.
- [x] 10.4 Complete `docs/HANDOFF.md` per URD §10:
  - repo URL, production URL, project ID
  - confirmation that the rules are deployed
  - users and roles
  - the Spa-removal deviation
  - any unresolved issues

  Verify every URD §10 item is present.

## Workflow follow-up
- Archived on 2026-11-06 at the owner's request, with 10.2 and 10.3 handed over to `docs/HANDOFF.md` §5.
