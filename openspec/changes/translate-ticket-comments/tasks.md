# Tasks

## 1. Setup

- [x] 1.1 Add `@google-cloud/translate` to `functions/package.json` (dependencies) and verify `npm --prefix functions install` and `npm --prefix functions run build` succeed and the esbuild bundle still produces `functions/lib/index.js`
- [x] 1.2 Add `TRANSLATE_LOCATION` (default `global`) and `TRANSLATE_SERVICE_ACCOUNT` (default `translate-fn@`, shorthand for translate-fn@<project>.iam.gserviceaccount.com) as `defineString` params in `functions/src/index.ts`, and verify `npm --prefix functions run typecheck` passes

## 2. Backend translation logic (pure, injected translator)

- [x] 2.1 Create `functions/src/translate.ts` with input validation (target `es|en`, ID format, 1–50 unique items, kinds `audit|description|supervisorNotes`) and `authorize()` mirroring `hasCompanyIdentity`/`isApproved`/request-read rules (D3, D4). Verify with new cases in `tests/functions/functions.test.ts` (or a sibling `translate.test.ts`) covering: no auth → `unauthenticated`; wrong provider, wrong domain or inactive user → `permission-denied`; staff on another user's request → `not-found`; target `fr` and 51 items → `invalid-argument`
- [x] 2.2 Implement source loading: the request doc, `getAll` of the referenced audit docs, rejecting audit actions other than `note_added`/`status_changed`, empty text → `same`, and the 30,000-character cap on uncached text. Verify with tests that a `reassigned` entry is rejected and an oversize batch fails
- [x] 2.3 Implement the cache (D7): `sha256` fingerprint, doc ID `<kind>_<id|field>_<target>`, hit only when the hash matches, write only successful results, reuse a cached `detectedSource` as `sourceLanguageCode`. Verify with a fake translator: a second call makes 0 translator calls; editing the description makes 1 new call; the second target sends the known source
- [x] 2.4 Implement grouping by `(mimeType, source)` and the same-language short-circuit (D5), with per-item results `translated|same|error`. Verify that the fake translator receives `text/html` for the description and `text/plain` for notes, and that a Spanish note with target `es` returns `same` without text
- [x] 2.5 Implement error mapping (D10) and metadata-only logging (D9). Verify that a translator throwing gRPC code 8 → `resource-exhausted` and other errors → `unavailable`, that the cache and originals are unchanged after the failure, and that a log spy asserts no comment text appears in any log payload
- [x] 2.6 Verify the originals are untouched: a test asserts that the request `notes`/`supervisorNotes` and the audit `details` are byte-identical after a successful translation run

## 3. Backend wiring, rules and purge

- [x] 3.1 Export `translateComments` as `onCall` in `functions/src/index.ts` with `region`, `serviceAccount`, `maxInstances: 5`, `timeoutSeconds: 30` (D1, D12), wiring the real `v3.TranslationServiceClient` (lazy singleton, ADC, `parent` from `GCLOUD_PROJECT` + `TRANSLATE_LOCATION`) and the fake translator when `FUNCTIONS_EMULATOR === 'true'` (D6). Verify that `npm run test:functions` passes and that one emulator test calls the callable through the Functions emulator and gets fake translations back
- [x] 3.2 Extend `purgeRequestArtifacts` in `functions/src/logic.ts` to `recursiveDelete` the `translations` subcollection. Verify by extending the existing purge test to seed a translation doc and assert it is gone
- [x] 3.3 Add an explicit `match /translations/{t} { allow read, write: if false; }` under `maintenanceRequests/{reqId}` in `firestore.rules`. Verify with a new case in `tests/rules/firestore.rules.test.ts` that a supervisor and the submitter can neither read nor write a translation doc (`npm run test:rules`, with the HotSpot JDK)
- [x] 3.4 Update `functions/README.md` (new function, params, emulator fake translator, no-text logging) and verify the documented build and test commands run as written

## 4. Frontend service and hook

- [x] 4.1 Add `functions()` to `src/services/firebase.ts` (`getFunctions` with `VITE_FUNCTIONS_REGION`, default `us-central1`; `connectFunctionsEmulator` on port 5002 when emulators are used) and `VITE_FUNCTIONS_REGION` to `.env.example`. Verify with `npm run lint`
- [x] 4.2 Create `src/services/translations.ts` (`httpsCallable` wrapper, module-level in-flight/result `Map` keyed by `reqId|key|target|fingerprint`, evict on rejection, map error codes to `busy|failed`). Verify with a unit test (mocked callable) that 4 rapid calls for the same key make 1 call, that a rejection allows a retry, and that a changed original makes a new call
- [x] 4.3 Create `useCommentTranslations(request, audit, language)` building items from the description, `supervisorNotes` and user-typed audit entries only, with state keyed by language so stale responses are ignored. Verify with a `@testing-library/react` test: switching ESP→ENG→ESP→ENG during a pending call yields one call and the final state shows the English result

## 5. Frontend UI

- [x] 5.1 Add bilingual strings to `src/i18n/translations.ts` (machine translation, view original, view translation, translating…, could not translate, busy try later). Verify that `npm run lint` passes and both dictionaries contain the keys
- [x] 5.2 Create the `TranslatableText` component (loading / translated with label and per-item toggle / error with original visible / same), running HTML translations through `sanitizeRichText()`. Verify with component tests for each state and a test that a translated `<script>`/`onerror` payload is stripped
- [x] 5.3 Use `TranslatableText` in `src/components/RequestDetailModal.tsx` for the description, `supervisorNotes`, the reopen note and user-typed audit details (keeping `auditDetailsText` for system entries). Verify in the emulator UI (`npm run dev` with emulators) that switching ENG shows `[en]` fake translations with the label, that "View original" toggles one item, and that the Navbar labels still switch as before
- [x] 5.4 Verify `npm run build` and confirm with a search of `dist/` and the repo for `translate.googleapis`, `AIza` and `private_key` that no translation credential or API key is in the bundle

## 6. Deployment docs and specs consistency

- [x] 6.1 Add a "Comment translation" section to `docs/DEPLOYMENT.md`: enable `translate.googleapis.com`; create the `translate-fn` service account; grant `roles/cloudtranslate.user` and `roles/datastore.user`; grant the deployer `roles/iam.serviceAccountUser` on it; set `TRANSLATE_LOCATION`/`TRANSLATE_SERVICE_ACCOUNT` in `functions/.env.kachava-lux-ops`; the Secret Manager convention for future secrets (`defineSecret`, per-secret `secretAccessor`); the deploy order and rollback. Verify that each `gcloud` command is syntactically valid with `--help`/dry reading and uses the PowerShell style of §5b
- [x] 6.2 Update `docs/HANDOFF.md` (pending deploy items, new smoke-test row: a Spanish note shown in English with label and original toggle) and `README.md` stack notes. Verify that the links resolve
- [x] 6.3 Run the full suite: `npm run lint && npm test && npm run test:rules && npm run test:functions`, and `openspec validate translate-ticket-comments --strict`. Verify all pass

## Workflow follow-up

- Owner deploys following DEPLOYMENT.md (rules → functions → hosting) and records the smoke test in HANDOFF.md.
- Archive the change with `/opsx:archive` after review and a production check.
