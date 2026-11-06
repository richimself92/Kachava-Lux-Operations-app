# Proposal

## Why

Kachava Lux Maintenance is still an AI Studio prototype. Requests live in mock data and localStorage, anyone can pick a user from a demo switcher, and the Security Rules have a hardcoded personal-Gmail admin backdoor. The business goal is to **measure, as KPIs, how long an operational or maintenance task takes to be fully addressed**. That only works if requests persist in a company-owned backend, every lifecycle transition is stamped with a trusted server time, and only approved employees can act on the data.

## What Changes

- Connect the app to the company-owned Firebase/GCP project `kachava-lux-ops` (Blaze plan): Firebase Hosting, Authentication, Cloud Firestore, Cloud Storage, and Cloud Functions.
- **BREAKING** Replace email/password and demo-user sign-in with **Sign in with Microsoft**, restricted to the `kachavalux.com` Microsoft 365 tenant. After that, a Security-Rules-enforced allowlist (`users/{email}`) grants a role (staff / supervisor / admin). No self-registration. Remove the hardcoded Gmail admin backdoor, the demo user switcher, and the automatic "unknown user becomes staff" fallback.
- **BREAKING** Replace the status model `pending | acknowledged | completed` with the operational lifecycle:
  - `sin_revisar`: new; nobody has addressed it yet
  - `pendiente`: checked by someone, but it can't be completed yet (blocked)
  - `reconocida`: checked and under work; the work timer runs
  - `completada`: fully addressed
  `reconocida` and `pendiente` can move back and forth. Work time pauses while a ticket is in `pendiente`.
- Every transition is stamped with a server timestamp. Durations (response time, work time, time to completion) are computed by a trusted backend function. The client never writes them.
- KPI dashboard driven by persisted data:
  - response time against the priority SLA (Urgent ~immediate, High 2h, Normal 4h, Low 24h)
  - accumulated work time
  - total time to fully addressed
  - SLA compliance
  All sliced by priority, category, location, and supervisor, over daily, weekly, monthly, and yearly periods in America/Cancun time.
- Request form: the submission date/time is set automatically and shown (America/Cancun). Ticket IDs are assigned by the server, replacing the collision-prone `count + 1`.
- Ticket detail modal: a live timer. While `sin_revisar` it shows the response clock, which turns red once the response SLA is missed. While `reconocida` it shows the running work timer. While `pendiente` it shows paused work time.
- Categories: add **Jacuzzi** (`jacuzzi`) and **Fauna nociva** (`fauna_nociva`). Remove **Spa** (`spa`). **This intentionally deviates from URD §5**, which asked to keep Pool and Spa separate; the owner requested this on 2026-11-05.
- Persist what is currently local-only: audit trail (append-only), supervisor reassignment, and authorized-user management.
- Photos: uploaded to Cloud Storage only after the request exists, up to 5 before and 5 after photos, max 5 MB each, JPG/PNG/WebP. Readable only by the submitter, supervisors, and admins.
- Rename the collection `requests` to `maintenanceRequests` (URD §4). Remove mock requests from production. Remove the unused Express, `@google/genai`, and Gemini env leftovers. Add Firebase Hosting and deployment configuration.

## Capabilities

### New Capabilities
- `access-control`: Microsoft tenant sign-in, the approved-users allowlist, role permissions (staff/supervisor/admin), and admin user management. Enforced on the server.
- `maintenance-requests`: Creating, storing, and viewing work orders: required fields, locations, categories, priorities, server-assigned ticket IDs, automatic submission time, photos, audit history, and per-role visibility.
- `request-lifecycle`: The `sin_revisar → pendiente ⇄ reconocida → completada` state machine: who may perform each transition, trusted timestamps, assignment, and the live response/work timer.
- `operational-kpis`: Definitions and presentation of response time, SLA compliance, work time, and time-to-completion, with breakdowns and period filters.

### Modified Capabilities
<!-- None: the project has no existing specs. -->

## Impact

- **Code**:
  - `src/context/AuthContext.tsx` (rewritten)
  - `src/context/RequestContext.tsx` (rewritten around Firestore)
  - `src/services/firebase.ts`
  - `src/types/index.ts` (statuses, categories, KPI fields)
  - `src/components/NewRequestModal.tsx`, `RequestDetailModal.tsx`, `Dashboard.tsx`, `RequestList.tsx`, `UserManagementView.tsx`, `Navbar.tsx`/`Sidebar.tsx` (demo switcher)
  - `src/i18n/translations.ts`
  - `src/data/initialData.ts` (mock requests/users removed; locations kept)
- **Backend (new)**:
  - `firebase.json`, `.firebaserc`
  - rewritten `firestore.rules`, `storage.rules`, `firestore.indexes.json`
  - new `functions/` package (ticket IDs and KPI computation)
  - an admin seed script for the initial allowlist
- **Dependencies**:
  - Remove `express`, `@types/express`, `@google/genai`, `dotenv`
  - Add `firebase-tools` (dev), `vitest` and `@firebase/rules-unit-testing` (dev), and `firebase-functions` / `firebase-admin` in `functions/`
- **External setup**:
  - An Azure AD (Entra ID) single-tenant app registration for the Microsoft provider
  - Enable the Microsoft provider in Firebase Auth and disable all others
  - Add the authorized domain
- **Data**: There is no production data yet, so no migration is needed. The old status values and the `spa` category are not carried forward.
- **Out of scope** (per URD): UI redesign, Guest Experience App integration, WhatsApp notifications, inventory, CSV export.
