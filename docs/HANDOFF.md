# Handoff — Kachava Lux Maintenance

Status as of **2026-11-23**. Covers OpenSpec change `firebase-backend-and-workflow` (archived), the
follow-up UI/feature rounds (work-order edit/delete, MUJI redesign, phone photos, admin reopen) and the
change `translate-ticket-comments` (implemented and archived on 2026-11-23, not deployed).

## 1. Where things are

| Item | Value |
| --- | --- |
| Repository | https://github.com/richimself92/Kachava-Lux-Operations-app (`spec-backend` is merged into `main`; `design-improvements` (redesign, photos, admin reopen) is ahead of `main`; comment translation is on `translation-service`, built on top of `design-improvements`) |
| Production URL | https://kachava-lux-ops.web.app |
| Firebase project ID | `kachava-lux-ops` (project number 146497773004), Blaze plan |
| Firestore location | `nam5` → Cloud Functions in `us-central1` |
| Auth | Microsoft (Entra ID, single tenant `kachavalux.com`) + `users/{email}` allowlist |
| Deploy guide | [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) |
| Specs | `openspec/specs/` (access-control, maintenance-requests, request-lifecycle, operational-kpis, comment-translation); archived changes in `openspec/changes/archive/` |

## 2. Security rules

- `firestore.rules` and `storage.rules` are the only authorization boundary; the UI only hides controls.
- The first production release deployed rules, functions and hosting (done by the owner; sign-in with
  Microsoft, creating and editing a request were confirmed working).
- **Pending:** the latest rules (admin-only request deletion, new facilities, optional legacy location detail,
  10,000-char rich-text notes, required pending reason, supervisor detail edits — location, category, priority,
  supervisor — admin reopen of completed requests with reopen photos, explicit client deny on
  `maintenanceRequests/{id}/translations`, admin deletion of deactivated users) and functions (default supervisor, cleanup on delete including
  cached translations, ticket backfill, SLA recompute on priority change, `translateComments`) are **not
  deployed yet**. Deploy order in §6 below.
- Automated coverage: 104 rules tests (Firestore + Storage + client service + photo uploads per role + reopen),
  42 functions tests (triggers + comment translation), 97 unit tests — all passing on 2026-11-25.
  `npm run test:rules` / `test:functions` need a HotSpot JDK; a pre-check (`scripts/check-java.mjs`) stops
  with instructions when the `java` on PATH is OpenJ9 (IBM Semeru), which otherwise fails with
  `{"error":{"code":500,"status":"UNKNOWN"}}`.

## 3. Users and roles

Seeded from `scripts/initial-roster.json`; afterwards managed in the app (Personal, admin only).

| Name | Email | Role | Title |
| --- | --- | --- | --- |
| Matt Houston | matt@kachavalux.com | admin | Founder & CEO |
| Gaby Vidal | gabby@kachavalux.com | admin | Founder & CEO |
| Richard Fonbuena | richard@kachavalux.com | admin | Founder & CEO |
| Ricardo Ferrer | ricardo.f@kachavalux.com | admin | Marketing Manager |
| Eduardo Quijano | eduardo@kachavalux.com | supervisor | General Manager |
| Carla Reina | carla.r@kachavalux.com | supervisor | Administrative Manager |
| Randel Can Chuc | randel@kachavalux.com | supervisor | Maintenance Manager (default assignee) |
| Bianca Velásquez | bianca@kachavalux.com | staff | Revenue Manager |
| David Rizo Castro | david.rizo@kachavalux.com | staff | Private Chef |
| Eduardo Velazco | eduardo.v@kachavalux.com | staff | Yacht Captain |
| Dina Dominguez | dina@kachavalux.com | staff | Housekeeping |

## 4. Deviations from the URD and from the original plan (owner decisions)

- **Spa category removed** (URD §5 asked to keep Pool and Spa separate). Jacuzzi and Fauna nociva added.
- **Facilities:** Oficina → Oficina Gerencia; added Oficina Almacén, Cocina, Bodega (6 facilities in total).
- **Location detail** field removed from the form; the description has a formatting toolbar instead.
- **Request deletion:** the original design kept every record forever. Admins can now permanently delete a
  request; its audit history and photos are removed with it. There is no record of who deleted it beyond the
  function log (request ID + ticket ID).
- **Deleting users:** the original design kept every allowlist entry forever (deactivate only). Admins can now
  permanently delete a user that is already deactivated (trash icon in Personal → Actions). Requests and audit
  entries keep their own name/email snapshots, so attribution is unaffected; active users and your own entry
  cannot be deleted (enforced by the rules).
- **Job titles:** the free-text title became a fixed, translated catalog (`JOB_TITLES` in `shared/domain.ts`,
  stored as codes such as `maintenance_manager`) chosen only in the "Add user" form; the Position column is
  read-only translated text. Existing English titles are still recognised and translated; re-running
  `seed-users` normalises them to codes. `firebase.json` now builds the app (`npm run build`) before every
  hosting deploy.
- **Reopening completed requests:** the original lifecycle made `completada` final. Admins can now reopen a
  completed request back to `pendiente` with a required note and up to 5 photos; the previous completion stays
  in the audit history and KPI work time continues.
- **Comment translation** (not in the URD): user-typed text is machine-translated to the selected UI language
  on demand (Cloud Translation v3); originals are stored unchanged and always one click away.
- **Default supervisor:** every new request is assigned to Randel (`DEFAULT_ASSIGNEE_EMAIL`). Supervisors
  therefore no longer become the assignee automatically on first handling unless the default could not be applied.

## 5. URD §9 production checklist

Legend: ✅ confirmed on production · 🧪 verified on the local emulators only · ⏳ to run on production

| # | Check | Status |
| --- | --- | --- |
| 1 | Microsoft sign-in with a `@kachavalux.com` account; ID token has `email` and provider `microsoft.com` (task 10.2) | ✅ sign-in works (owner); ⏳ claims check with Randel's account |
| 2 | Staff signs in and submits a request with a photo | ✅ request created by owner; ⏳ with photo, as staff |
| 3 | Request appears in Firestore and on the supervisor dashboard with a ticket ID | 🧪 (production ticket stayed on "Assigning…" until `roles/datastore.user` is granted — see §6) |
| 4 | Supervisor: pendiente → reconocida (timer runs) → completada with note and photo | 🧪 |
| 5 | `kpi` populated; completion time and completed-by correct | 🧪 |
| 6 | Data persists after logout / refresh / another device | ✅ request editable after sign-in (owner); ⏳ second device |
| 7 | Non-allowlisted tenant user sees "Not authorized" and reads are denied | 🧪 (rules tests) |
| 8 | Dashboard filters reflect real records | 🧪 |
| 9 | Whole flow on an iPhone, including a camera photo over 5 MB | ⏳ |
| 10 | Default supervisor = Randel on new requests | 🧪 |
| 11 | Only admins see/use delete; history and photos removed | 🧪 |
| 12 | Comment translation: a Spanish note shows in English with "Machine translation · View original"; in ES it shows as written (DEPLOYMENT §6.5) | 🧪 (emulators, fake translator) · ⏳ with Cloud Translation |
| 13 | Admin reopens a completed request with a note and a photo; it returns to `pendiente` and the earlier completion stays in the history | 🧪 (rules tests) |
| 14 | New request: the Maintenance Manager (and the assignee) gets a push with sound on a locked Android phone and on an iPhone with the app added to the Home Screen; with the app open, a chime and a notice (DEPLOYMENT §10) | 🧪 (rules + functions tests, fake FCM) · ⏳ on devices |

Fill in the ⏳ rows (date, account used, result) after the next production deploy.

## 6. Unresolved items / next steps

1. **Grant runtime roles** to `146497773004-compute@developer.gserviceaccount.com`: `roles/datastore.user`
   (ticket IDs, KPIs, default supervisor) and `roles/storage.objectAdmin` (photo cleanup on delete).
   Commands in `docs/DEPLOYMENT.md` §5b.
2. **Deploy the pending release**, in this order:
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes,storage
   npx firebase deploy --only functions      # asks for DEFAULT_ASSIGNEE_EMAIL on first deploy
   npm run build && npx firebase deploy --only hosting
   ```
   Requests created before this deploy keep their state; the ticket backfill assigns missing IDs on their next update.
3. **Comment translation (change `translate-ticket-comments`)**: before the next functions deploy, run the
   one-time setup in `docs/DEPLOYMENT.md` §9 (enable `translate.googleapis.com`, create `translate-fn`, grant
   `roles/cloudtranslate.user` + `roles/datastore.user`, give the deployer `roles/iam.serviceAccountUser`,
   add `TRANSLATE_LOCATION` / `TRANSLATE_SERVICE_ACCOUNT` to `functions/.env.kachava-lux-ops`). If your
   gcloud has another project active, keep the two `export CLOUDSDK_*` lines at the top of that script.
   Then deploy rules → functions → hosting and run checklist row 12. Not deployed yet.
4. **New-request notifications:** generate the Web Push key, enable `fcm.googleapis.com`, grant
   `roles/firebasecloudmessaging.admin` (DEPLOYMENT §10); deploy rules → functions → hosting; each
   recipient taps "Turn on notifications" once per device (iPhone: from the Home Screen app). Run row 14.
5. Run the ⏳ rows of §5 and record the results here.
6. Merge `design-improvements` into `main`, then `translation-service`, once the checklist passes.
7. Rotate the Microsoft client secret before it expires (DEPLOYMENT §8).
8. Known limitations: no "recompute KPIs" admin action; orphan Storage objects from failed uploads are not
   cleaned up; deletion is permanent with no undo; translations are shown only in the request detail (not in
   lists or previews), and the language switch is not reachable while a request is open.
