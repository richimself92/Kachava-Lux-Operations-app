# Deployment — Kachava Lux Maintenance

Target: Firebase project **`kachava-lux-ops`** (Blaze plan), served at
**https://kachava-lux-ops.web.app**. Firestore, Storage, Auth, Cloud Functions and Hosting all
live in this one project.

Run every command from the repository root unless noted. Steps 1–3 are one-time console setup;
steps 4–8 repeat for each release (skip the seed step once the roster exists).

---

## 0. Prerequisites

| Tool | Why | Check |
| --- | --- | --- |
| Node.js 22 | app build, functions runtime | `node -v` |
| Firebase CLI ≥ 14 | deploys | `npx firebase --version` |
| Google Cloud SDK | seeding the allowlist (Application Default Credentials) | `gcloud --version` |
| Temurin/HotSpot JDK 21 | **only** for local emulators/tests, not needed to deploy. OpenJ9 builds (IBM Semeru) crash the Firestore emulator | `java -version` must not say OpenJ9 |

Accounts you need:
- A Google account with **Owner** (or Firebase Admin + Service Usage Admin) on `kachava-lux-ops`.
- A Microsoft Entra ID account in the **kachavalux.com** tenant allowed to register applications
  (Application Administrator or Global Administrator).

```bash
npx firebase login
npx firebase use kachava-lux-ops     # .firebaserc already defaults to it
npm ci && npm --prefix functions ci
```

---

## 1. Microsoft Entra ID — app registration (one-time)

1. Open https://entra.microsoft.com → **Identity › Applications › App registrations › New registration**.
2. Name: `Kachava Lux Maintenance`.
3. Supported account types: **Accounts in this organizational directory only (kachavalux.com — Single tenant)**.
4. Redirect URI — platform **Web**:
   - `https://kachava-lux-ops.firebaseapp.com/__/auth/handler`
5. Register. Then in **Authentication › Web › Redirect URIs** add a second one:
   - `https://kachava-lux-ops.web.app/__/auth/handler`

   The app uses `authDomain = kachava-lux-ops.web.app` (so iOS Safari keeps the sign-in on the
   same site); the `firebaseapp.com` URI is the one the Firebase console displays and is kept as a
   fallback. Local development uses the popup on the same handler, so **no `localhost` redirect
   URI is required**.
6. **Certificates & secrets › New client secret**. Copy the secret **Value** immediately (it is
   shown once). Record its expiry date in `docs/HANDOFF.md` — sign-in stops working when it
   expires; rotate it before then (step 2 again with the new value).
7. From **Overview**, copy:
   - **Application (client) ID** → Firebase provider config (step 2).
   - **Directory (tenant) ID** → `VITE_MS_TENANT_ID` (step 5).
8. **API permissions**: the default `Microsoft Graph › User.Read` (delegated) is enough. Grant
   admin consent for the tenant so staff don't see a consent prompt.

> Every staff member's Entra account must have a mail address (`mail` attribute) equal to the
> address in the allowlist, e.g. `randel@kachavalux.com`. The app matches on the token's `email`.

Do **not** paste the client secret into any file in this repo, chat, or ticket.

---

## 2. Firebase Authentication (one-time)

Firebase console → **Authentication**:

1. **Sign-in method › Add new provider › Microsoft** → enable, paste the **Application (client)
   ID** and **client secret** from step 1. Save.
2. Make sure **every other provider is disabled** (Email/Password, Google, Anonymous, Phone…).
   Microsoft must be the only enabled provider.
3. There is no public registration: the app has no sign-up screen, and any Microsoft user who
   signs in gets an Auth record but **no access** unless an admin has added them to the allowlist
   (see below). Leave **Settings › User actions › Email enumeration protection** on.
4. **Settings › Authorized domains**: keep `localhost`, `kachava-lux-ops.firebaseapp.com`,
   `kachava-lux-ops.web.app`. Remove anything else.

How access is decided (enforced in `firestore.rules` and `storage.rules`, not in the UI):
`sign_in_provider == microsoft.com` **and** email ends in `@kachavalux.com` **and**
`users/{email}` exists with `active == true`. A Microsoft user who is not on the roster
authenticates but gets the "Not authorized" screen and every read is denied.

---

## 3. Confirm Firestore, Storage and the region (one-time)

1. Firebase console → **Firestore Database**: the `(default)` database must exist in **Native
   mode**. Note its **location** (e.g. `nam5`, `us-central1`, `us-east1`). The location is
   permanent.
2. **Storage**: the default bucket must exist — `kachava-lux-ops.firebasestorage.app`.
3. Pick the Cloud Functions region to match Firestore:

   | Firestore location | `LOCATION` for functions |
   | --- | --- |
   | `nam5` (US multi-region) | `us-central1` |
   | `eur3` (EU multi-region) | `europe-west1` |
   | a single region, e.g. `us-east1` | the same region |

4. Create `functions/.env.kachava-lux-ops` (gitignored by `.env*`):

   ```
   LOCATION=us-central1
   ```

   (Replace with the value from the table.) Without this file the CLI prompts on first deploy.

---

## 4. Frontend environment file (per machine that builds)

Copy `.env.example` → **`.env.production`** and fill it from Firebase console › Project
settings › Your apps › Web app (create a Web app if none exists; no Hosting link needed):

```
VITE_FIREBASE_API_KEY="…"
VITE_FIREBASE_AUTH_DOMAIN="kachava-lux-ops.web.app"
VITE_FIREBASE_PROJECT_ID="kachava-lux-ops"
VITE_FIREBASE_STORAGE_BUCKET="kachava-lux-ops.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="…"
VITE_FIREBASE_APP_ID="…"
VITE_MS_TENANT_ID="<Directory (tenant) ID from step 1>"
VITE_USE_EMULATORS="false"
```

These web-config values are not secrets (they ship in the bundle) but the file stays out of git.
If any required value is missing, the built app shows a configuration error instead of running.

For a local check against production Auth, the same values go in `.env.local` and `npm run dev`
(port 3000). Use this only to verify sign-in (task 10.2) — it reads and writes **production** data.

---

## 5. Deploy order

Run the checks first:

```bash
npm run lint && npm test
npm run test:rules && npm run test:functions   # need a HotSpot JDK; both stop early with instructions if `java` is OpenJ9
```

Then deploy in this order (each step depends on the previous one):

```bash
# a) Security rules + indexes + storage rules
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```
On the first Storage deploy the CLI asks to grant the Storage service agent permission to read
Firestore (the Storage rules look up `users/{email}`). Answer **yes**.

```bash
# b) Cloud Functions (ticket IDs, default supervisor, KPI recomputation, cleanup on delete,
#    comment translation — do §9 first, once)
npx firebase deploy --only functions
npx firebase functions:list   # expect onMaintenanceRequestCreated, onMaintenanceRequestUpdated, onMaintenanceRequestDeleted, translateComments
```

Function parameters (the CLI asks for them on the first deploy and saves the answers in
`functions/.env.kachava-lux-ops`; you can also create that file yourself — it holds no secrets):

| Parameter | Default | Meaning |
| --- | --- | --- |
| `LOCATION` | `us-central1` | Region; must match the Firestore location (`nam5` → `us-central1`). |
| `DEFAULT_ASSIGNEE_EMAIL` | `randel@kachavalux.com` | Supervisor assigned to every new request. Must be an active supervisor/admin in `users`; otherwise requests stay unassigned. |
| `TRANSLATE_LOCATION` | `global` | Cloud Translation location (`global`, or `us-central1` to keep processing in the US region). See §9. |
| `TRANSLATE_SERVICE_ACCOUNT` | `translate-fn@` | Runtime service account of `translateComments` only (`translate-fn@kachava-lux-ops.iam.gserviceaccount.com`). It must exist before the deploy. See §9. |

First deploy enables Cloud Functions, Cloud Build, Artifact Registry, Eventarc, Cloud Run and
Pub/Sub. If it fails with an Eventarc/service-agent permission error, wait 2–3 minutes and
re-run — new service agents take a moment to propagate.

New Google Cloud projects no longer give the default compute service account broad roles, so
grant these once (PowerShell; `$PN` is the project number). Without `datastore.user` the
functions deploy fine but fail at runtime with `PERMISSION_DENIED`, and tickets stay on
"Assigning…".

```powershell
$PN = gcloud projects describe kachava-lux-ops --format="value(projectNumber)"
$SA = "serviceAccount:$PN-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding kachava-lux-ops --member=$SA --role="roles/cloudbuild.builds.builder"  # build
gcloud projects add-iam-policy-binding kachava-lux-ops --member=$SA --role="roles/datastore.user"             # runtime: read/write Firestore
gcloud projects add-iam-policy-binding kachava-lux-ops --member=$SA --role="roles/storage.objectAdmin"        # runtime: delete photos of deleted requests
gcloud projects add-iam-policy-binding kachava-lux-ops --member=$SA --role="roles/eventarc.eventReceiver"
gcloud projects add-iam-policy-binding kachava-lux-ops --member=$SA --role="roles/run.invoker"
gcloud projects add-iam-policy-binding kachava-lux-ops `
  --member="serviceAccount:service-$PN@gcp-sa-eventarc.iam.gserviceaccount.com" --role="roles/eventarc.serviceAgent"
gcloud projects add-iam-policy-binding kachava-lux-ops `
  --member="serviceAccount:service-$PN@gcp-sa-pubsub.iam.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator"
```

If a deploy fails half-way and the next one says *"Changing from an HTTPS function to a
background triggered function is not allowed"*, delete the half-created functions and redeploy:
`npx firebase functions:delete onMaintenanceRequestCreated onMaintenanceRequestUpdated onMaintenanceRequestDeleted --region us-central1 --force`.

```bash
# c) Allowlist (first release only — afterwards admins manage users in the app)
gcloud auth application-default login
npm run seed:users -- scripts/initial-roster.json --project kachava-lux-ops --dry-run
npm run seed:users -- scripts/initial-roster.json --project kachava-lux-ops
```
Check Firestore › `users`: 11 docs, IDs are lowercase emails, roles as in the roster.

```bash
# d) Hosting
npm run build
npx firebase deploy --only hosting
```

Open https://kachava-lux-ops.web.app — you should see only **Sign in with Microsoft**.

---

## 6. Smoke test after each release

1. Staff account: sign in, submit a request with a photo → ticket number appears within seconds.
2. Supervisor account (another browser/device): the request is on the dashboard; Start work →
   timer runs; Mark pending → timer pauses; Resume → Complete with notes + photo.
3. Dashboard KPIs update; the ticket shows response / work / total times.
4. A Microsoft account that is not on the roster sees **Not authorized**.
5. Comment translation: with the app in **EN**, open a request whose note was written in Spanish →
   the note shows in English with "Machine translation · View original"; "View original" shows the
   Spanish text. Switch to **ES** (close the request first) → the same note shows as written.

The full URD §9 checklist and its results go in `docs/HANDOFF.md`.

---

## 7. Rollback

| Part | How |
| --- | --- |
| Hosting | Firebase console › Hosting › release history › **Rollback**, or `npx firebase hosting:rollback` |
| Firestore / Storage rules | Console › Firestore (or Storage) › **Rules** › history › pick previous ruleset › Publish. Or check out the previous commit and redeploy step 5a. |
| Indexes | Redeploy from the previous commit. Removing an index is not destructive to data. |
| Functions | Check out the previous commit and `npx firebase deploy --only functions`. |
| Comment translation | Roll back Hosting first (the UI stops calling it), then `npx firebase functions:delete translateComments --region us-central1 --force` if needed. Originals are never modified, so there is nothing to restore; cached translations under `maintenanceRequests/*/translations` are inert. |
| Allowlist | Deactivate/reactivate users in the app (Staff Roster). The seed script never deletes. |

Data is never deleted by a deploy. Deleting a request (admin only, in the app) is permanent:
the backend also removes its audit history and photos, and no rollback restores them. KPIs are recomputed from the audit trail on the next status
change, so a functions rollback does not lose information.

---

## 8. Operations

- **Add / remove staff:** admin › Staff Roster › Add user / Deactivate. Deactivation takes effect
  immediately; Microsoft account removal in Entra is still recommended when someone leaves.
- **Client-secret rotation:** before expiry, create a new secret in Entra, paste it in Firebase ›
  Authentication › Microsoft, then delete the old secret.
- **Logs:** `npx firebase functions:log` or Cloud Console › Logging.
- **Costs:** Blaze plan; at this volume usage stays within the free tier. Consider a budget alert
  in Cloud Billing. Cloud Translation is billed per character translated (cache hits and comments
  already in the selected language cost nothing).
- **Translation logs:** `translateComments` logs only the target language, counts, duration and
  outcome — never comment text. Filter by `message="translateComments"` in Logging.

---

## 9. Comment translation (Cloud Translation v3) — one-time setup

`translateComments` (a callable 2nd-gen function, i.e. a Cloud Run service) translates ticket
comments with **Cloud Translation Advanced (v3)** using **Application Default Credentials** of a
dedicated service account. There is **no API key and no service-account key file**: do not create
one, and do not put any translation credential in `.env*` files or in the repository.

Run once, before the first functions deploy that includes `translateComments` (bash; on Windows
use Git Bash or WSL):

> **Several gcloud projects on one machine?** `--project` only changes the target project, not
> the *quota project* that Google bills API calls to. If your active gcloud configuration has
> `billing/quota_project` set to another project, these commands fail with
> `PERMISSION_DENIED … USER_PROJECT_DENIED` naming that other project. The two `export` lines
> at the top of the script override the project and quota project **for the current terminal
> only**. Your active configuration is not changed, and other terminals are not affected.
> Alternatives: add `--billing-project="$P"` to each command, or, if you keep a gcloud
> configuration for this project, use `export CLOUDSDK_ACTIVE_CONFIG_NAME=<that-config>`.
> Check what gcloud will use with `gcloud config list`.

```bash
P="kachava-lux-ops"
SA="translate-fn@${P}.iam.gserviceaccount.com"
DEPLOYER="<deployer-email>"   # the Google account that runs `firebase deploy`

# 0. Use this project for this terminal only (see the note above)
export CLOUDSDK_CORE_PROJECT="$P"
export CLOUDSDK_BILLING_QUOTA_PROJECT="$P"

# 1. Enable the API
gcloud services enable translate.googleapis.com --project "$P"

# 2. Dedicated runtime identity for translateComments only (the triggers keep the default account)
gcloud iam service-accounts create translate-fn --project "$P" \
  --display-name "Kachava Lux - comment translation"

# 3. Minimum runtime roles
gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:${SA}" --role="roles/cloudtranslate.user"  # call Translation v3
gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:${SA}" --role="roles/datastore.user"       # read requests/users, read+write the translation cache

# 4. Let the person who deploys attach that service account to the function
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$P" \
  --member="user:${DEPLOYER}" --role="roles/iam.serviceAccountUser"
```

Then add to `functions/.env.kachava-lux-ops`:

```
TRANSLATE_LOCATION=global
TRANSLATE_SERVICE_ACCOUNT=translate-fn@
```

Notes:
- `roles/cloudtranslate.user` is the narrowest predefined role that can call `translateText`.
  `roles/datastore.user` is project-wide, as Firestore has no per-collection IAM; the function
  itself only reads `users`, `maintenanceRequests` (+ `audit`) and writes `.../translations`.
- Callable functions are publicly invocable at the Cloud Run level (Firebase manages
  `run.invoker`); the function checks the Firebase ID token, the `@kachavalux.com` Microsoft
  identity, the active allowlist entry and the request's read permission before doing anything.
- The frontend needs no new secret. Optional `VITE_FUNCTIONS_REGION` (default `us-central1`)
  in `.env.production` must match `LOCATION`.
- **Secrets, if one is ever needed** (Translation does not need any): store it in Secret Manager
  with `npx firebase functions:secrets:set NAME`, declare it with `defineSecret('NAME')` from
  `firebase-functions/params` and list it in that function's `secrets: [...]` option, so it is
  injected only into that function. Grant `roles/secretmanager.secretAccessor` **on that secret
  only** to the function's service account, never project-wide:
  `gcloud secrets add-iam-policy-binding NAME --project "$P" --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor"`.
- Deploy order stays §5: rules (the explicit deny on `translations`) → functions → hosting.

## 10. New-request notifications (Web Push via FCM) — one-time setup

When a request is created, `onMaintenanceRequestCreated` sends a push to the **Maintenance Manager**
(every active user whose title is `maintenance_manager`) plus the **assigned supervisor**, never to
the submitter. While the app is open, those users also hear a chime and see a notice (no setup needed).

1. **Web Push key:** Firebase console → Project settings → **Cloud Messaging** → *Web Push certificates*
   → **Generate key pair**. Copy the public key into `.env.production` (and `.env.local` if you test push
   locally against production) as `VITE_FIREBASE_VAPID_KEY="…"`. It is a public value. Without it the
   "Turn on notifications" button is hidden.
2. **API and permission** (bash; keep the two `export CLOUDSDK_*` lines of §9 if gcloud has another project active):
   ```bash
   P=kachava-lux-ops
   gcloud services enable fcm.googleapis.com --project "$P"
   gcloud projects add-iam-policy-binding "$P" \
     --member="serviceAccount:146497773004-compute@developer.gserviceaccount.com" \
     --role="roles/firebasecloudmessaging.admin"
   ```
3. **Deploy** in the §5 order: rules (`users/{email}/pushTokens`) → functions → hosting.
4. **Turn it on per device** (each recipient, once): open the app → menu → **Turn on notifications** → Allow.
   - **iPhone/iPad (iOS 16.4+):** open the site in Safari → Share → **Add to Home Screen**, open the app
     from that icon, then tap the button. Push does not work from a normal Safari tab.
   - **Android:** Chrome works directly; installing ("Add to Home screen") is optional.
   - The notification sound is the device's notification tone (web push cannot set a custom sound);
     the phone must not be in silent / Do Not Disturb mode.
5. **Check:** from another account (staff), create a request with the recipient's phone locked → a
   "New work order · KLM-… · Villa …" notification arrives; tapping it opens that request.
   Function logs show `new request push` with `recipients`, `sent`, `failed`.
