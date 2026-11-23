# Design

## Context

See proposal.md for motivation and specs/ for the required behavior. Current state that shapes the approach:

- **Backend:** the only backend is the 2nd-gen Cloud Functions codebase in `functions/` (Node 22, esbuild bundle, region parameter `LOCATION`, default `us-central1`). 2nd-gen functions are Cloud Run services. The original backend design rejected a separate Express/Cloud Run API so that authorization would not be duplicated. The old AI Studio Cloud Run prototype is being decommissioned and is not reused.
- **Authorization:** lives in `firestore.rules`: `hasCompanyIdentity()` (provider `microsoft.com`, `@kachavalux.com` email), `isApproved()` (`users/{email}.active == true`), and request read access for the submitter or supervisor/admin. Functions run with the Admin SDK, which bypasses the rules, so any callable must re-apply these checks itself.
- **Where user-typed text lives:**
  - `maintenanceRequests/{id}.notes`: sanitized HTML, ≤ 10,000 characters, editable by the submitter while `sin_revisar`.
  - `.supervisorNotes`: ≤ 2,000 characters, set on completion and cleared on reopen.
  - `.../audit/{auditId}.details`: ≤ 2,000 characters, immutable. User-typed for `note_added` and for `status_changed` (pending reason, completion notes, reopen reason). Other actions store codes rendered by `src/lib/auditText.ts`.
- **Language:** `AuthContext` holds `language: 'en' | 'es'` and `setLanguage`. Fixed text comes from `translations[language]`. No source language is stored for any comment.
- **Tests:** functions tests call `functions/src/logic.ts` directly against the Firestore emulator with injected side effects (for example, the `deletePhotos` callback). The rules tests use the emulator. Unit tests run in Node.

## Goals / Non-Goals

**Goals:**
- One backend entry point, in the existing functions codebase, that translates a batch of a request's comments in a single round trip.
- Authorization identical in effect to the rules for reading a request.
- Zero long-lived credentials: ADC through a dedicated runtime service account.
- Testable without calling Google: pure logic with an injected translator.

**Non-Goals:**
- Translating at write time (eagerly) or translating into languages other than `es` and `en`.
- Storing a source language on new audit entries. That would need a rules and schema change, and the UI language is a poor proxy for the language the author actually wrote in.
- App Check, per-user rate limiting, or translation glossaries. These can be added later without changing the specs.
- Translating the work-orders list or the dashboard previews. Only the request detail view shows translations.

## Decisions

### D1. Callable function (`onCall`) in the existing codebase, not a new Cloud Run service
`export const translateComments = onCall({ region: LOCATION, serviceAccount: TRANSLATE_SERVICE_ACCOUNT, maxInstances: 5, timeoutSeconds: 30, memory: '256MiB' }, handler)`.
- `onCall` verifies the Firebase ID token and exposes `request.auth.token`, the same claims the rules see. The client SDK (`httpsCallable`) attaches the token automatically.
- Deployed with `firebase deploy --only functions`, the same pipeline as today, and it runs on Cloud Run.
- *Alternative:* a standalone Cloud Run Express service, rejected because it adds a second deploy pipeline and manual token verification. *Alternative:* `onRequest`, rejected because it needs hand-rolled auth and CORS.

### D2. Client sends references, server reads the originals
Request: `{ reqId: string, target: 'es'|'en', items: Array<{ kind: 'audit', id: string } | { kind: 'description' } | { kind: 'supervisorNotes' }> }`.
Response: `{ results: Array<{ key, status: 'translated'|'same'|'error', text?, detectedSource?, errorCode? }> }`, where `key = "<kind>:<id|field>"`.
- This prevents using the endpoint as a free translation proxy, guarantees the text that gets translated is the stored original (the source of truth), and bounds input size by what the rules already allow.
- The handler loads `users/{email}`, the request, and the referenced audit docs (`getAll`).

### D3. Authorization mirrors the rules
A pure function `authorize(token, userDoc, requestDoc)`:
1. `token.firebase.sign_in_provider === 'microsoft.com'`, the email matches `^[^@]+@kachavalux\.com$` (lowercased), and `userDoc` exists with `active === true`. Otherwise `permission-denied`. No auth at all gives `unauthenticated`.
2. The request exists and `submittedBy.uid === auth.uid` or the role is `supervisor` or `admin`. Otherwise `not-found`, so the existence of other users' requests is not revealed.

A unit test checks the same matrix that the rules tests use for request reads.

### D4. Validation
- `target ∈ {es, en}`; `reqId` and audit `id` match `^[A-Za-z0-9]{1,64}$`; 1–50 items with no duplicate keys.
- Audit items must exist and have `action ∈ {note_added, status_changed}` and non-empty `details`. Empty or missing text yields `status: 'same'` (nothing to translate) rather than an error.
- The combined length of the texts still to translate after cache hits must be ≤ 30,000 characters. Otherwise `invalid-argument`.
- Input that violates the schema gives `invalid-argument`. All errors are `HttpsError`, so no stack traces or text reach the client.

### D5. Translation v3 via `@google-cloud/translate` (`v3.TranslationServiceClient`) with ADC
- The client is created once per instance at module scope, lazily. It picks up ADC from the runtime service account, with no key files.
- `parent = projects/${process.env.GCLOUD_PROJECT}/locations/${TRANSLATE_LOCATION}`. `TRANSLATE_LOCATION` defaults to `global`; setting `us-central1` keeps processing in the US region next to the functions and Firestore. Both locations support the default NMT model, so no endpoint override is needed. An EU data-residency requirement would use the `translate-eu.googleapis.com` endpoint, which is not needed for `nam5`.
- Items are grouped by `(mimeType, sourceLanguageCode?)` and each group is one `translateText` call with `contents[]`: `text/html` for the description, `text/plain` for the rest. Typically this is 1–2 calls per request view.
- `sourceLanguageCode` is set only when the cache holds a `detectedSource` for that comment (same fingerprint, other target). Otherwise it is omitted and `detectedLanguageCode` from the response is used.
- **Same-language short-circuit:** if the detected or known source equals `target`, the result is `same` and no text is returned. On cache hits with known source == target, the API is not called at all.
- *Alternative:* REST with `google-auth-library`, equivalent but more hand-written code. *Alternative:* API key, rejected because ADC exists and keys are long-lived secrets.

### D6. Translator injected for testability and local emulators
`translate.ts` exports pure `translateCommentsLogic(db, auth, input, translator, now)` where `translator: (group) => Promise<Array<{ text, detectedSource? }>>`. `index.ts` wires the real v3 client. When `process.env.FUNCTIONS_EMULATOR === 'true'`, it wires a fake translator (it prefixes `[en]`/`[es]` and detects via a trivial heuristic) so local development and the UI work without GCP access or cost.

### D7. Cache in an admin-only subcollection
- Path `maintenanceRequests/{reqId}/translations/{docId}`, `docId = "<kind>_<id|field>_<target>"` (for example `audit_AbC123_en`, `description_en`).
- Fields `{ sourceHash, text | null, status: 'translated'|'same', detectedSource | null, model, location, createdAt }`, where `sourceHash = sha256(originalText)` as hex.
- Lookup: a hit is valid only if `sourceHash` matches the current original. Otherwise the entry is ignored and overwritten after re-translation. This handles edited descriptions and `supervisorNotes` changes. Audit entries are immutable, so their entries never go stale.
- Only successful results are written; errors are never cached. Writes are `set()` (last writer wins, which is harmless because the result is idempotent).
- Rules: an explicit nested `match /translations/{t} { allow read, write: if false; }` under `maintenanceRequests/{reqId}`, plus a rules test.
- `purgeRequestArtifacts` also runs `recursiveDelete` on `translations`.
- *Alternative:* fields on the request doc, rejected because they would trigger `onMaintenanceRequestUpdated`, bloat the doc and need rules changes. *Alternative:* a client-only cache, rejected because it would re-pay for every user and session.

### D8. Frontend data flow
- `src/services/firebase.ts`: adds `functions()` = `getFunctions(app, VITE_FUNCTIONS_REGION || 'us-central1')` and `connectFunctionsEmulator(…, 'localhost', 5002)` when emulators are used.
- `src/services/translations.ts`: `translateComments(reqId, target, items)` over `httpsCallable`. It keeps a module-level `Map<string, Promise<Result>>` keyed `reqId|key|target|sourceHash?`. The client does not know the hash, so the key includes a cheap client-side fingerprint of the displayed original (the same SHA-256 via `crypto.subtle`, or the text length plus a 32-bit hash) so edits invalidate it. In-flight promises are reused, so a rapid ESP/ENG toggle never re-requests. Rejected promises are removed so a later view can retry.
- `useCommentTranslations(request, audit, language)`: builds the item list (description, supervisorNotes, user-typed audit entries) and requests only the items missing for `language`. It returns `Record<key, { state: 'loading'|'translated'|'same'|'error', text?, errorCode? }>`. Stale responses after a language switch are ignored by keying state on `language`.
- `<TranslatableText original translation html? />` renders:
  - **loading:** original plus a "Translating…" hint;
  - **translated:** translation plus a "Machine translation · View original" line, with a local toggle;
  - **error:** original plus "Could not translate" (or "Translation is busy, try later" for `resource-exhausted`);
  - **same:** original only.
- **HTML safety:** translated description HTML is passed through the existing `sanitizeRichText()` before `dangerouslySetInnerHTML`, exactly like the original.
- All new strings go in `src/i18n/translations.ts`. `Navbar`, `AccessGate` and `setLanguage` are untouched.

### D9. Logging
`logger.info('translateComments', { target, items, cacheHits, apiChars, durationMs, outcome })` and `logger.warn` with `{ target, items, durationMs, outcome: 'error', code }` on failure. No text, no emails. `reqId` is an opaque ID and is logged for correlation, like the existing triggers do.

### D10. Error mapping
- gRPC `RESOURCE_EXHAUSTED` (8) → `HttpsError('resource-exhausted')`.
- `INVALID_ARGUMENT` from the API (for example, unsupported content) → per-item `status: 'error'` where possible.
- Anything else → `HttpsError('unavailable')`.

The client maps codes to the two user messages.

### D11. Secrets
Translation needs no secret (ADC). The design records the convention for future secrets: `defineSecret('NAME')` from `firebase-functions/params`, listed in the function's `secrets: [...]` option (injected only into that function), created with `firebase functions:secrets:set NAME`, and access granted per secret to the function's service account (`roles/secretmanager.secretAccessor` on that secret only). No secret is created by this change.

### D12. Dedicated runtime service account
`translate-fn@<project>.iam.gserviceaccount.com`, set through the `TRANSLATE_SERVICE_ACCOUNT` parameter in the `serviceAccount` option. It gets only `roles/cloudtranslate.user` and `roles/datastore.user`. Existing triggers keep the default compute service account, so their permissions are unchanged. The deploying principal needs `roles/iam.serviceAccountUser` on `translate-fn`. `onCall` functions are publicly invocable at the Cloud Run level (Firebase sets `run.invoker` to `allUsers`); authentication is the ID-token check inside the handler, consistent with how Firebase callables work.

## Risks / Trade-offs

- [Machine translation quality on maintenance jargon] → The original is always one click away, and the label makes clear that the text is a machine translation.
- [Cost growth from long descriptions] → The cache keyed by fingerprint, the same-language short-circuit, the 30k-character cap, and `maxInstances: 5`. Recommend a Cloud Billing budget alert (DEPLOYMENT §8).
- [A translated HTML description containing unsafe markup] → It is re-sanitized client-side with the same allowlist as originals.
- [The callable is reachable by anyone on the internet] → The ID-token, company-identity and allowlist checks run before any read or API call. App Check is a later hardening option.
- [Cache entry not removed if the purge fails half-way] → Same behavior as audit purging today. Entries are only reachable by the Admin SDK and are keyed under the deleted request.
- [Detection error on very short notes such as "ok"] → It is shown as `same` or as a harmless translation, and the original is available.
- [Rules and function authorization drift] → A unit test matrix mirrors the rules tests for request reads.

## Migration Plan

1. Enable `translate.googleapis.com`, create `translate-fn`, grant roles, and give the deployer `serviceAccountUser` (DEPLOYMENT.md, new section).
2. Add `TRANSLATE_LOCATION` and `TRANSLATE_SERVICE_ACCOUNT` to `functions/.env.kachava-lux-ops`.
3. Deploy rules (explicit deny), then functions, then hosting, in the usual order. Hosting goes last so the UI never calls a function that does not exist yet.
4. **Rollback:** redeploy the previous hosting release (the UI stops calling the function); optionally `firebase functions:delete translateComments`. Cached translations are inert data and can be left or purged. Originals are never touched, so there is nothing to restore.

The owner performs the deploy; this change does not deploy.
