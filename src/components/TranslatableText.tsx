import React, { useState } from 'react';
import { Languages } from 'lucide-react';
import type { Dict } from '../lib/labels';
import { notesToHtml } from '../lib/richText';
import type { TranslationOutcome } from '../services/translations';

interface TranslatableTextProps {
  original: string;
  outcome: TranslationOutcome;
  t: Dict;
  /** Render as rich text (the description). Translations go through the same sanitizer as originals. */
  html?: boolean;
  className?: string;
}

/**
 * Shows a comment in the UI language. The original is never replaced: while translating or when
 * translation fails it stays visible; a translation is labelled and can be switched back to the
 * original, per comment.
 */
export const TranslatableText: React.FC<TranslatableTextProps> = ({ original, outcome, t, html = false, className = '' }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = outcome.state === 'translated';
  const text = translated && !showOriginal ? outcome.text : original;

  return (
    <div className="space-y-1">
      {html ? (
        <div className={className} dangerouslySetInnerHTML={{ __html: notesToHtml(text) }} />
      ) : (
        <div className={className}>{text}</div>
      )}

      {outcome.state === 'loading' && (
        <div className="text-[11px] text-faint" role="status">
          {t.translating}
        </div>
      )}

      {outcome.state === 'error' && (
        <div className="text-[11px] text-danger" role="status">
          {outcome.reason === 'busy' ? t.translationBusy : t.translationFailed}
        </div>
      )}

      {translated && (
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted print:hidden">
          <span className="inline-flex items-center gap-1">
            <Languages className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
            {t.machineTranslation}
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            aria-pressed={showOriginal}
            className="underline underline-offset-2 hover:text-ink cursor-pointer"
          >
            {showOriginal ? t.viewTranslation : t.viewOriginal}
          </button>
        </div>
      )}
    </div>
  );
};
