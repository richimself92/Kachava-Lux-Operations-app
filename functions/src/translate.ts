import { createHash } from 'node:crypto';
import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';

/**
 * Machine translation of a request's user-typed text (description, completion notes, and the
 * details of note / status-change audit entries) for the `translateComments` callable.
 *
 * Pure logic: the translation service is injected (`Translator`), so tests and the local
 * emulators never call Google. The originals are only read, never written; results are cached
 * in `maintenanceRequests/{reqId}/translations/{kind}_{id}_{target}` keyed by a SHA-256 of the
 * original, so an edited description is translated again. Nothing here logs comment text.
 */

export const TARGET_LANGUAGES = ['es', 'en'] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

export const MAX_ITEMS = 50;
export const MAX_CHARS = 30_000;

const ID_RE = /^[A-Za-z0-9]{1,64}$/;
const COMPANY_EMAIL_RE = /^[^@]+@kachavalux[.]com$/;
/** Audit actions whose `details` are typed by a user. Others store codes rendered by the UI. */
export const TRANSLATABLE_AUDIT_ACTIONS = ['note_added', 'status_changed'] as const;
/** Same tag list the client sanitizer allows (src/lib/richText.ts); used to pick text/html. */
const HTML_TAG = /<\/?(b|strong|i|em|u|s|strike|span|font|ol|ul|li|p|div|br|blockquote|a)\b[^>]*>/i;

export type CommentRef = { kind: 'audit'; id: string } | { kind: 'description' } | { kind: 'supervisorNotes' };

export interface TranslateInput {
  reqId: string;
  target: TargetLanguage;
  items: CommentRef[];
}

export type TranslateErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'not-found'
  | 'invalid-argument'
  | 'resource-exhausted'
  | 'unavailable';

/** Mapped to an HttpsError by the callable wrapper. Messages never contain comment text. */
export class TranslateError extends Error {
  constructor(
    readonly code: TranslateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TranslateError';
  }
}

export interface AuthInfo {
  uid: string;
  token: { email?: unknown; firebase?: { sign_in_provider?: unknown } };
}

export interface ItemResult {
  /** `audit:<id>`, `description` or `supervisorNotes`. */
  key: string;
  status: 'translated' | 'same' | 'error';
  text?: string;
  detectedSource?: string | null;
  errorCode?: 'failed';
}

export interface TranslateGroup {
  mimeType: 'text/plain' | 'text/html';
  /** Known source language, or null to let the service detect it. */
  source: string | null;
  target: TargetLanguage;
  contents: string[];
}

/** Returns one result per content, in order. `detectedSource` is null when the source was given. */
export type Translator = (group: TranslateGroup) => Promise<Array<{ text: string; detectedSource: string | null }>>;

export interface TranslateStats {
  items: number;
  cacheHits: number;
  apiCalls: number;
  apiChars: number;
}

export interface TranslateOutput {
  results: ItemResult[];
  stats: TranslateStats;
}

export const commentKey = (ref: CommentRef): string => (ref.kind === 'audit' ? `audit:${ref.id}` : ref.kind);
const cacheDocId = (ref: CommentRef, target: string): string =>
  ref.kind === 'audit' ? `audit_${ref.id}_${target}` : `${ref.kind}_${target}`;

export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** `es-419` → `es`. */
export const baseLanguage = (code: string | null | undefined): string | null =>
  code ? code.toLowerCase().split(/[-_]/)[0] || null : null;

const isTarget = (v: unknown): v is TargetLanguage => (TARGET_LANGUAGES as readonly unknown[]).includes(v);

function invalid(message: string): never {
  throw new TranslateError('invalid-argument', message);
}

/** Validates the callable payload. */
export function parseInput(data: unknown): TranslateInput {
  if (!data || typeof data !== 'object') invalid('Payload must be an object');
  const { reqId, target, items } = data as Record<string, unknown>;
  if (typeof reqId !== 'string' || !ID_RE.test(reqId)) invalid('Invalid reqId');
  if (!isTarget(target)) invalid('Target must be es or en');
  if (!Array.isArray(items) || items.length === 0) invalid('items must be a non-empty array');
  if (items.length > MAX_ITEMS) invalid(`At most ${MAX_ITEMS} items`);

  const refs: CommentRef[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') invalid('Invalid item');
    const { kind, id } = raw as Record<string, unknown>;
    let ref: CommentRef;
    if (kind === 'audit') {
      if (typeof id !== 'string' || !ID_RE.test(id)) invalid('Invalid audit id');
      ref = { kind, id };
    } else if (kind === 'description' || kind === 'supervisorNotes') {
      ref = { kind };
    } else {
      invalid('Invalid item kind');
    }
    const key = commentKey(ref);
    if (seen.has(key)) invalid('Duplicate item');
    seen.add(key);
    refs.push(ref);
  }
  return { reqId, target, items: refs };
}

/**
 * Same checks as firestore.rules `hasCompanyIdentity()`.
 * Returns the caller's lowercase email.
 */
export function checkCompanyIdentity(auth: AuthInfo | null | undefined): string {
  if (!auth?.uid) throw new TranslateError('unauthenticated', 'Sign-in required');
  const provider = auth.token?.firebase?.sign_in_provider;
  const email = typeof auth.token?.email === 'string' ? auth.token.email.toLowerCase() : '';
  if (provider !== 'microsoft.com' || !COMPANY_EMAIL_RE.test(email)) {
    throw new TranslateError('permission-denied', 'Company Microsoft account required');
  }
  return email;
}

/** Mirrors `isApproved()` plus the request read rule (submitter, supervisor or admin). */
export function canReadRequest(
  uid: string,
  user: Record<string, unknown> | undefined,
  request: Record<string, unknown> | undefined,
): 'ok' | 'not-approved' | 'not-found' {
  if (!user || user.active !== true) return 'not-approved';
  if (!request) return 'not-found';
  const role = user.role;
  const submitter = (request.submittedBy as { uid?: unknown } | undefined)?.uid;
  return submitter === uid || role === 'supervisor' || role === 'admin' ? 'ok' : 'not-found';
}

interface Source {
  ref: CommentRef;
  key: string;
  text: string;
  hash: string;
  mimeType: TranslateGroup['mimeType'];
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Maps a translation-service error to how it is reported (gRPC or HTTP codes). */
export function classifyTranslatorError(err: unknown): 'resource-exhausted' | 'invalid-argument' | 'unavailable' {
  const e = err as { code?: unknown; status?: unknown } | null;
  const code = e?.code ?? e?.status;
  if (code === 8 || code === 429 || code === 'RESOURCE_EXHAUSTED') return 'resource-exhausted';
  if (code === 3 || code === 400 || code === 'INVALID_ARGUMENT') return 'invalid-argument';
  return 'unavailable';
}

export interface TranslateOptions {
  /** Recorded on cache entries for traceability. */
  model?: string;
  location?: string;
}

export async function translateComments(
  db: Firestore,
  auth: AuthInfo | null | undefined,
  data: unknown,
  translator: Translator,
  opts: TranslateOptions = {},
): Promise<TranslateOutput> {
  const email = checkCompanyIdentity(auth);
  const input = parseInput(data);
  const uid = auth!.uid;
  const { target } = input;
  const other: TargetLanguage = target === 'es' ? 'en' : 'es';

  const reqRef = db.collection('maintenanceRequests').doc(input.reqId);
  const auditRefs = input.items.flatMap((r) => (r.kind === 'audit' ? [reqRef.collection('audit').doc(r.id)] : []));
  const [userSnap, reqSnap, ...auditSnaps] = await db.getAll(db.doc(`users/${email}`), reqRef, ...auditRefs);

  const access = canReadRequest(uid, userSnap.data(), reqSnap.exists ? reqSnap.data() : undefined);
  if (access === 'not-approved') throw new TranslateError('permission-denied', 'User is not approved');
  if (access === 'not-found') throw new TranslateError('not-found', 'Request not found');
  const req = reqSnap.data()!;
  const audits = new Map<string, DocumentSnapshot>(auditSnaps.map((s) => [s.id, s]));

  // Resolve the originals (source of truth) from Firestore.
  const results = new Map<string, ItemResult>();
  const sources: Source[] = [];
  for (const ref of input.items) {
    const key = commentKey(ref);
    let text: string;
    if (ref.kind === 'audit') {
      const snap = audits.get(ref.id);
      if (!snap?.exists) invalid('Unknown audit entry');
      if (!(TRANSLATABLE_AUDIT_ACTIONS as readonly unknown[]).includes(snap.get('action'))) {
        invalid('Audit entry is not translatable');
      }
      text = asText(snap.get('details'));
    } else {
      text = asText(req[ref.kind === 'description' ? 'notes' : 'supervisorNotes']);
    }
    if (!text.trim()) {
      results.set(key, { key, status: 'same' });
      continue;
    }
    const mimeType = ref.kind === 'description' && HTML_TAG.test(text) ? 'text/html' : 'text/plain';
    sources.push({ ref, key, text, hash: sha256(text), mimeType });
  }

  // Cache lookup: this target (the answer) and the other target (a known source language).
  const cacheCol = reqRef.collection('translations');
  const cacheSnaps = sources.length
    ? await db.getAll(
        ...sources.flatMap((s) => [cacheCol.doc(cacheDocId(s.ref, target)), cacheCol.doc(cacheDocId(s.ref, other))]),
      )
    : [];

  const stats: TranslateStats = { items: input.items.length, cacheHits: 0, apiCalls: 0, apiChars: 0 };
  const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
  const pending: Array<Source & { source: string | null }> = [];

  sources.forEach((s, i) => {
    const hit = cacheSnaps[i * 2];
    const sibling = cacheSnaps[i * 2 + 1];
    const valid = (snap: DocumentSnapshot | undefined): snap is DocumentSnapshot =>
      !!snap?.exists && snap.get('sourceHash') === s.hash;

    if (valid(hit)) {
      stats.cacheHits++;
      const detectedSource = (hit.get('detectedSource') as string | null) ?? null;
      results.set(
        s.key,
        hit.get('status') === 'translated'
          ? { key: s.key, status: 'translated', text: String(hit.get('text') ?? ''), detectedSource }
          : { key: s.key, status: 'same', detectedSource },
      );
      return;
    }
    const known = valid(sibling) ? baseLanguage(sibling.get('detectedSource') as string | null) : null;
    if (known === target) {
      // Already in the requested language: no API call needed.
      stats.cacheHits++;
      results.set(s.key, { key: s.key, status: 'same', detectedSource: known });
      writes.push({ id: cacheDocId(s.ref, target), data: cacheEntry(s.hash, 'same', null, known, opts) });
      return;
    }
    pending.push({ ...s, source: known });
  });

  const pendingChars = pending.reduce((n, s) => n + s.text.length, 0);
  if (pendingChars > MAX_CHARS) invalid(`At most ${MAX_CHARS} characters per call`);

  // One API call per (mimeType, known source) group.
  const groups = new Map<string, typeof pending>();
  for (const s of pending) {
    const g = `${s.mimeType}|${s.source ?? ''}`;
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  for (const members of groups.values()) {
    const { mimeType, source } = members[0];
    stats.apiCalls++;
    stats.apiChars += members.reduce((n, s) => n + s.text.length, 0);
    let translated: Awaited<ReturnType<Translator>>;
    try {
      translated = await translator({ mimeType, source, target, contents: members.map((s) => s.text) });
    } catch (err) {
      const kind = classifyTranslatorError(err);
      if (kind === 'invalid-argument') {
        // The service refused this content: report it per item and keep the other groups.
        for (const s of members) results.set(s.key, { key: s.key, status: 'error', errorCode: 'failed' });
        continue;
      }
      throw new TranslateError(
        kind,
        kind === 'resource-exhausted' ? 'Translation quota exhausted' : 'Translation service unavailable',
      );
    }
    members.forEach((s, i) => {
      const r = translated[i];
      if (!r) {
        results.set(s.key, { key: s.key, status: 'error', errorCode: 'failed' });
        return;
      }
      const detected = baseLanguage(r.detectedSource) ?? s.source;
      const same = detected === target;
      results.set(
        s.key,
        same
          ? { key: s.key, status: 'same', detectedSource: detected }
          : { key: s.key, status: 'translated', text: r.text, detectedSource: detected },
      );
      writes.push({
        id: cacheDocId(s.ref, target),
        data: cacheEntry(s.hash, same ? 'same' : 'translated', same ? null : r.text, detected, opts),
      });
    });
  }

  if (writes.length) {
    const batch = db.batch();
    for (const w of writes) batch.set(cacheCol.doc(w.id), w.data);
    await batch.commit();
  }

  return { results: input.items.map((r) => results.get(commentKey(r))!), stats };
}

function cacheEntry(
  sourceHash: string,
  status: 'translated' | 'same',
  text: string | null,
  detectedSource: string | null,
  opts: TranslateOptions,
): Record<string, unknown> {
  return {
    sourceHash,
    status,
    text,
    detectedSource,
    model: opts.model ?? 'nmt',
    location: opts.location ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** The only fields ever logged for a translation call (no comment text, no emails). */
export function translationLogEntry(
  target: string | null,
  stats: TranslateStats | null,
  durationMs: number,
  outcome: 'ok' | 'error',
  code?: string,
): Record<string, string | number | null> {
  return {
    target,
    items: stats?.items ?? null,
    cacheHits: stats?.cacheHits ?? null,
    apiCalls: stats?.apiCalls ?? null,
    apiChars: stats?.apiChars ?? null,
    durationMs,
    outcome,
    code: code ?? null,
  };
}

const SPANISH_HINT = /[áéíóúñ¿¡]|\b(el|la|los|las|de|que|no|por|para|con|una|del|hay)\b/i;

/**
 * Stand-in used on the local emulators: tags the text with the target language and guesses the
 * source with a trivial Spanish heuristic. Never used in production.
 */
export const fakeTranslator: Translator = async ({ contents, source, target }) =>
  contents.map((text) => {
    const detected = source ?? (SPANISH_HINT.test(text) ? 'es' : 'en');
    return { text: detected === target ? text : `[${target}] ${text}`, detectedSource: source ? null : detected };
  });
