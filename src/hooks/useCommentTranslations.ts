import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  commentKey,
  fingerprint,
  translationService,
  type CommentRef,
  type TranslatableComment,
  type TranslationOutcome,
  type TranslationService,
} from '../services/translations';
import type { Language } from '../types';

const resultKey = (language: Language, key: string, original: string) => `${language}|${key}|${fingerprint(original)}`;

/**
 * Translations of a request's comments into the UI language. Results are kept per language and
 * original text, so switching ESP|ENG back and forth shows what is already known immediately and
 * a late response for the previous language is simply stored for later. Requests are deduplicated
 * by the service. Returns a lookup: a comment without a result yet is `loading`.
 */
export function useCommentTranslations(
  reqId: string | undefined,
  comments: TranslatableComment[],
  language: Language,
  service: TranslationService = translationService(),
): (ref: CommentRef, original: string) => TranslationOutcome {
  const [results, setResults] = useState<Record<string, TranslationOutcome>>({});

  // Re-run only when the set of comments (or their text) actually changes.
  const signature = comments.map((c) => `${commentKey(c.ref)}:${fingerprint(c.original)}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => comments, [signature]);

  useEffect(() => {
    if (!reqId || stable.length === 0) return;
    let alive = true;
    service.translate(reqId, language, stable).then((byKey) => {
      if (!alive) return;
      setResults((prev) => {
        const next = { ...prev };
        for (const c of stable) {
          const outcome = byKey[commentKey(c.ref)];
          if (outcome) next[resultKey(language, commentKey(c.ref), c.original)] = outcome;
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [reqId, language, stable, service]);

  return useCallback(
    (ref: CommentRef, original: string) => results[resultKey(language, commentKey(ref), original)] ?? { state: 'loading' },
    [results, language],
  );
}
