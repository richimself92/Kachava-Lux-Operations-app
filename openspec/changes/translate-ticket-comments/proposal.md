# Proposal

## Why

Staff and supervisors write ticket descriptions, notes, pending reasons and completion notes in either Spanish or English, but the ESP|ENG switch only translates the app's fixed labels. A supervisor who reads English cannot follow a note written in Spanish (and vice versa), so they copy text into outside translators, which leaks operational data and slows the response.

## What Changes

- The ESP|ENG switch keeps translating fixed labels through the existing i18n dictionary, and in addition shows ticket comments in the selected language (`es` or `en`) using Google Cloud Translation Advanced (v3).
- "Comments" covers the user-typed text of a request:
  - the description (`notes`, sanitized HTML)
  - supervisor completion notes (`supervisorNotes`)
  - user-typed audit details: notes (`note_added`) and the reasons/notes on status changes (pending reason, reopen reason, completion notes)
- A comment already in the selected language is shown as written. Each translated comment is labelled as a machine translation and has a per-comment "View original" toggle. While translating, a loading state is shown; on failure, an error message is shown and the original stays visible.
- A new authenticated callable Cloud Function (`translateComments`, 2nd gen, which runs on Cloud Run) in the existing `functions/` codebase. The client sends references to comments, never the text. The function reads the originals from Firestore, applies the same access checks as the security rules, and calls Translation v3 with Application Default Credentials of a dedicated service account. No API keys or service-account keys exist anywhere, in the frontend or in the repo.
- Translations are cached server-side per comment, target language and a SHA-256 fingerprint of the original, so the same comment is not translated twice and a cache entry is invalidated when the original changes. Originals are never modified. Cached translations are removed when an admin deletes the request.
- Logs record only technical metadata (target language, item count, cache hits, duration, outcome), never comment text.
- Secret Manager is wired through `defineSecret` conventions for any future real secret. No secret is created for Translation, because ADC needs none.

## Capabilities

### New Capabilities
- `comment-translation`: on-demand machine translation of a request's user-typed text into the UI language, including the backend endpoint, its authorization and validation, the translation cache, and how translations are shown alongside the originals.

### Modified Capabilities
- `maintenance-requests`: "Append-only audit history" currently requires user-typed text to be shown only as written; it will allow a labelled machine translation with the original available. "Request deletion" also removes the request's cached translations.

## Impact

- **Backend:** `functions/src/index.ts` (new export), new `functions/src/translate.ts` (handler plus pure logic), `functions/src/logic.ts` (`purgeRequestArtifacts` also deletes `translations`), `functions/package.json` (adds `@google-cloud/translate`).
- **Data:** new admin-only subcollection `maintenanceRequests/{reqId}/translations`. `firestore.rules` adds an explicit client deny (the default deny already covers it).
- **Frontend:** `src/services/firebase.ts` (Functions instance and emulator connection), new `src/services/translations.ts`, new hook and `TranslatableText` component, `src/components/RequestDetailModal.tsx`, `src/i18n/translations.ts`, `.env.example` (`VITE_FUNCTIONS_REGION`). The `firebase` package already includes `firebase/functions`.
- **GCP:** enable `translate.googleapis.com`; new service account `translate-fn` with `roles/cloudtranslate.user` and `roles/datastore.user`; the deployer needs `roles/iam.serviceAccountUser` on it. New function parameters `TRANSLATE_LOCATION` and `TRANSLATE_SERVICE_ACCOUNT`.
- **Cost:** Translation is billed per character. The cache and the "already in target language" short-circuit keep repeat views free.
- **Docs:** `docs/DEPLOYMENT.md`, `functions/README.md`, `docs/HANDOFF.md`. Nothing is deployed as part of this change.
