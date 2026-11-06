# Kachava Lux Maintenance

Bilingual (English / Spanish), mobile-friendly web app for maintenance work orders at
**Kachava Lux Private Residences & Spa**: 8 villas and 6 facilities.

- Production: https://kachava-lux-ops.web.app (Firebase project `kachava-lux-ops`)
- Deployment and operations: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Handoff status and production checklist: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- Behaviour specs: [`openspec/specs/`](openspec/specs/)

---

## 1. Stack

- **Frontend:** React 19 + TypeScript (Vite), Tailwind CSS v4.
- **Firebase Authentication:** Microsoft (Entra ID) sign-in for `@kachavalux.com` accounts only, plus an
  approved-users allowlist (`users/{email}`). No public sign-up; no hardcoded privileged accounts.
- **Cloud Firestore:** `maintenanceRequests` (with an append-only `audit` subcollection), `users`, `counters`.
  `firestore.rules` enforce every permission and validate every write.
- **Cloud Functions (2nd gen, `functions/`):**
  - `onMaintenanceRequestCreated`: assigns the ticket ID `KLM-YYYY-NNNN` and the default supervisor (Randel).
  - `onMaintenanceRequestUpdated`: recomputes KPI durations from the audit trail; backfills a missing ticket ID.
  - `onMaintenanceRequestDeleted`: removes the audit history and photos of a request deleted by an admin.
- **Cloud Storage:** request photos, JPG/PNG/WebP, max 5 MB and 5 per kind (`storage.rules`).
- **Firebase Hosting:** the single-page app.

Shared enums and domain rules (locations, categories, priorities, statuses, SLA targets, KPI math) live in
`shared/domain.ts` and are used by both the app and the functions. A parity test keeps the rules' lists in sync.

---

## 2. What the app does

### Requests
- Locations: villas 102, 104, 106, 108, 101, 103, 105, 107 and facilities Oficina Gerencia, Oficina Almacén,
  Cocina, Gimnasio, Almacén, Bodega.
- Categories: Plumbing, HVAC, Electrical, Pool, Jacuzzi, Fauna nociva, Carpentry, Appliances, Lighting,
  A/V & Tech, Structural, Glass & Windows, Grounds, Common Areas (with Hall/Parking, asked on the new-request form only). Spa was removed on purpose.
- Priorities with response targets: Urgent 15 min, High 2 h, Normal 4 h, Low 24 h.
- Description with a formatting toolbar (bold, italic, underline, strikethrough, color, lists, indent, links)
  that stays visible on long notes. Stored as sanitized HTML (DOMPurify), max 10,000 characters.
- Submission time is the server clock; all times are shown in America/Cancun.
- Up to 5 before-repair photos (submitter) and 5 after-repair photos (supervisor/admin).
- Every change is recorded in the request's audit history.

### Lifecycle
`sin_revisar` → `pendiente` ⇄ `reconocida` → `completada` (pendiente requires a reason; completion requires a note; completed is final). Supervisors/admins edit location, category, priority and supervisor of open requests from the pencil in the Work Orders table (audited; the SLA is recomputed on priority change). Only admins can delete requests (trash icon in the same table).
New requests are assigned to the default supervisor (Randel); otherwise the first supervisor who handles a
request becomes its assignee. Supervisors can reassign. The detail view shows a live timer that turns red when
the response target is overdue.

### Dashboard and lists
- KPI cards: counts per state, overdue unreviewed, SLA compliance, average/median response, average work time,
  average time to fully addressed; breakdown by priority, category, location, supervisor, completed-by.
  Durations are computed only by the backend.
- Work orders by location: one card per villa/facility with counts per state.
- Recent work orders; admins can delete one (trash icon on hover, confirmation dialog).
- Work orders list: search, filters by location/state/category/supervisor/priority, period filters
  (today/week/month/year/all) and a calendar filter for a single day.

### Roles
| Role | Can |
| --- | --- |
| Staff | Create requests; see and edit (while unreviewed) only their own. |
| Supervisor | See all requests; change status, assign, add notes and after photos. |
| Admin | Everything a supervisor can do; manage users ("Personal", visible only to admins); delete requests. |

---

## 3. Running locally

There is no demo mode or sample data: the app always talks to Firebase, either the `kachava-lux-ops` project
or the local emulators.

### Prerequisites
- Node.js 22+, `npm install` and `npm --prefix functions install`.
- A **HotSpot JDK 21** (e.g. Eclipse Temurin) on `PATH` for the emulators. OpenJ9-based JDKs (IBM Semeru)
  crash the Firestore emulator.

### Environment
Copy `.env.example` to `.env.local` and fill in the web app config from the Firebase console
(Project settings → Your apps). `.env*` files are git-ignored; never commit them or any service-account key.
Set `VITE_USE_EMULATORS=true` to use the local emulators.

### Emulators
```bash
npm --prefix functions run build
npx firebase emulators:start --only auth,firestore,storage,functions --project demo-kachava
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm run seed:users -- scripts/initial-roster.json --project demo-kachava
VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-kachava npx vite --port 3005
```
Sign in through the Auth emulator's Microsoft widget with an email from the roster (e.g. `matt@kachavalux.com`).

### Tests
```bash
npm run lint            # type-check
npm test                # unit tests (domain, time/Cancun, KPI math, rich text, rules/domain parity, roster)
npm run test:rules      # Firestore + Storage security rules against the emulators
npm run test:functions  # Cloud Functions logic and triggers against the emulators
npm run build           # production bundle
```

### Approved-users allowlist
Access requires a Microsoft `@kachavalux.com` account **and** an active entry in `users/{email}`. The initial
roster is `scripts/initial-roster.json`; afterwards admins manage users in the app (Personal).

```bash
# Preview without writing
npm run seed:users -- scripts/initial-roster.json --project kachava-lux-ops --dry-run

# Production (uses Application Default Credentials; requires a Firestore write role)
gcloud auth application-default login
npm run seed:users -- scripts/initial-roster.json --project kachava-lux-ops
```

The script refuses non-`@kachavalux.com` emails, duplicates and unknown roles. It upserts name, role, title
and `active`; `createdAt`, `uid` and `lastSignInAt` are preserved. Users absent from the roster are not
removed — deactivate them in the app.
