// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTranslationService, type TranslateCall, type TranslatableComment } from '../services/translations';
import type { Language } from '../types';
import { useCommentTranslations } from './useCommentTranslations';

const NOTE: TranslatableComment = { ref: { kind: 'audit', id: 'n1' }, original: 'La llave gotea' };

describe('useCommentTranslations', () => {
  it('makes one call while the language is toggled during a pending translation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const call = vi.fn<TranslateCall>(async ({ target }) => {
      if (target === 'en') await gate;
      return {
        results: [
          target === 'en'
            ? { key: 'audit:n1', status: 'translated' as const, text: 'The faucet drips' }
            : { key: 'audit:n1', status: 'same' as const },
        ],
      };
    });
    const service = createTranslationService(call);

    const { result, rerender } = renderHook(
      ({ lang }: { lang: Language }) => useCommentTranslations('r1', [NOTE], lang, service),
      { initialProps: { lang: 'en' as Language } },
    );
    expect(result.current(NOTE.ref, NOTE.original)).toEqual({ state: 'loading' });

    // ESP → ENG → ESP → ENG while English is still loading.
    rerender({ lang: 'es' });
    rerender({ lang: 'en' });
    rerender({ lang: 'es' });
    rerender({ lang: 'en' });

    await act(async () => release());
    await waitFor(() =>
      expect(result.current(NOTE.ref, NOTE.original)).toEqual({ state: 'translated', text: 'The faucet drips' }),
    );

    expect(call.mock.calls.filter(([d]) => d.target === 'en')).toHaveLength(1);
    expect(call.mock.calls.filter(([d]) => d.target === 'es')).toHaveLength(1);

    rerender({ lang: 'es' });
    await waitFor(() => expect(result.current(NOTE.ref, NOTE.original)).toEqual({ state: 'same' }));
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does nothing without comments', () => {
    const call = vi.fn<TranslateCall>();
    renderHook(() => useCommentTranslations('r1', [], 'en', createTranslationService(call)));
    expect(call).not.toHaveBeenCalled();
  });
});
