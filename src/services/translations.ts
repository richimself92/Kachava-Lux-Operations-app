import { httpsCallable } from 'firebase/functions';
import type { AuditLogEntry, Language, MaintenanceRequest } from '../types';
import { functions } from './firebase';

/**
 * Client side of comment translation (backend: functions/src/translate.ts).
 *
 * The app sends references to a request's user-typed text; the `translateComments` function
 * reads the originals, translates and caches them. Here, every (request, comment, language,
 * original text) has at most one call in flight or completed per session, so toggling ESP|ENG
 * repeatedly never re-requests. Failed calls are forgotten so a later view can retry.
 */

export type CommentRef = { kind: 'audit'; id: string } | { kind: 'description' } | { kind: 'supervisorNotes' };

export interface TranslatableComment {
  ref: CommentRef;
  /** The stored original, used to notice edits (it is never sent to the backend). */
  original: string;
}

export type TranslationOutcome =
  | { state: 'loading' }
  | { state: 'translated'; text: string }
  | { state: 'same' }
  | { state: 'error'; reason: 'busy' | 'failed' };

type Settled = Exclude<TranslationOutcome, { state: 'loading' }>;

interface ServerResult {
  key: string;
  status: 'translated' | 'same' | 'error';
  text?: string;
}

export type TranslateCall = (data: {
  reqId: string;
  target: Language;
  items: CommentRef[];
}) => Promise<{ results: ServerResult[] }>;

/** Audit actions whose details are typed by a user (the others are rendered from codes). */
const TRANSLATABLE_AUDIT_ACTIONS = new Set(['note_added', 'status_changed']);

export const commentKey = (ref: CommentRef): string => (ref.kind === 'audit' ? `audit:${ref.id}` : ref.kind);

/** Cheap, stable fingerprint of the original (FNV-1a 32-bit + length) so edits miss the cache. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}.${(h >>> 0).toString(36)}`;
}

/** The translatable comments of a request: description, completion notes, user-typed audit details. */
export function translatableComments(
  request: Pick<MaintenanceRequest, 'notes' | 'supervisorNotes'>,
  audit: Pick<AuditLogEntry, 'id' | 'action' | 'details'>[] | null,
): TranslatableComment[] {
  const out: TranslatableComment[] = [];
  if (request.notes?.trim()) out.push({ ref: { kind: 'description' }, original: request.notes });
  if (request.supervisorNotes?.trim()) out.push({ ref: { kind: 'supervisorNotes' }, original: request.supervisorNotes });
  for (const a of audit ?? []) {
    if (TRANSLATABLE_AUDIT_ACTIONS.has(a.action) && a.details?.trim()) {
      out.push({ ref: { kind: 'audit', id: a.id }, original: a.details });
    }
  }
  return out;
}

function errorReason(err: unknown): 'busy' | 'failed' {
  const code = String((err as { code?: unknown } | null)?.code ?? '');
  return code.endsWith('resource-exhausted') ? 'busy' : 'failed';
}

export interface TranslationService {
  /** Resolves with one settled outcome per comment key; never rejects. */
  translate(reqId: string, target: Language, comments: TranslatableComment[]): Promise<Record<string, Settled>>;
}

export function createTranslationService(call: TranslateCall): TranslationService {
  const entries = new Map<string, Promise<Settled>>();
  const entryKey = (reqId: string, target: Language, c: TranslatableComment) =>
    `${reqId}|${commentKey(c.ref)}|${target}|${fingerprint(c.original)}`;

  return {
    async translate(reqId, target, comments) {
      const missing = comments.filter((c) => !entries.has(entryKey(reqId, target, c)));
      if (missing.length) {
        const batch = call({ reqId, target, items: missing.map((c) => c.ref) });
        for (const c of missing) {
          const k = entryKey(reqId, target, c);
          const key = commentKey(c.ref);
          const p: Promise<Settled> = batch.then(
            ({ results }) => {
              const r = results.find((x) => x.key === key);
              if (r?.status === 'translated' && typeof r.text === 'string') return { state: 'translated', text: r.text };
              if (r?.status === 'same') return { state: 'same' };
              entries.delete(k);
              return { state: 'error', reason: 'failed' };
            },
            (err) => {
              entries.delete(k);
              return { state: 'error', reason: errorReason(err) };
            },
          );
          entries.set(k, p);
        }
      }
      const settled = await Promise.all(comments.map((c) => entries.get(entryKey(reqId, target, c))!));
      return Object.fromEntries(comments.map((c, i) => [commentKey(c.ref), settled[i]]));
    },
  };
}

let defaultService: TranslationService | null = null;

/** App-wide service backed by the `translateComments` callable (created on first use). */
export function translationService(): TranslationService {
  defaultService ??= createTranslationService(async (data) => {
    const fn = httpsCallable<typeof data, { results: ServerResult[] }>(functions(), 'translateComments');
    return (await fn(data)).data;
  });
  return defaultService;
}
