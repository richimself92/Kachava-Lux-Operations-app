# Handoff — Kachava Lux Maintenance

Status as of **2026-11-06**. Covers OpenSpec change `firebase-backend-and-workflow` (archived) and the
follow-up UI/feature rounds done in the same session.

## 1. Where things are

| Item | Value |
| --- | --- |
| Repository | https://github.com/richimself92/Kachava-Lux-Operations-app (branch `spec-backend`, not yet merged to `main`) |
| Production URL | https://kachava-lux-ops.web.app |
| Firebase project ID | `kachava-lux-ops` (project number 146497773004), Blaze plan |
| Firestore location | `nam5` → Cloud Functions in `us-central1` |
| Auth | Microsoft (Entra ID, single tenant `kachavalux.com`) + `users/{email}` allowlist |
| Deploy guide | [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) |
| Specs | `openspec/specs/` (access-control, maintenance-requests, request-lifecycle, operational-kpis) |

## 2. Security rules

- `firestore.rules` and `storage.rules` are the only authorization boundary; the UI only hides controls.
- The first production release deployed rules, functions and hosting (done by the owner; sign-in with
  Microsoft, creating and editing a request were confirmed working).
- **Pending:** the latest rules (admin-only request deletion, new facilities, optional legacy location detail,
  10,000-char rich-text notes, required pending reason, supervisor priority edits) and functions (default supervisor, cleanup on delete, ticket backfill, SLA recompute on priority change) are **not
  deployed yet**. Deploy order in §6 below.
- Automated coverage: 55 rules tests (Firestore + Storage), 13 functions tests, 58 unit tests — all passing on
  2026-11-06.

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
| 9 | Whole flow on an iPhone | ⏳ |
| 10 | Default supervisor = Randel on new requests | 🧪 |
| 11 | Only admins see/use delete; history and photos removed | 🧪 |

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
3. Run the ⏳ rows of §5 and record the results here.
4. Merge `spec-backend` into `main` once the checklist passes.
5. Rotate the Microsoft client secret before it expires (DEPLOYMENT §8).
6. Known limitations: no "recompute KPIs" admin action; orphan Storage objects from failed uploads are not
   cleaned up; deletion is permanent with no undo.
