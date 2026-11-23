import { describe, expect, it, vi } from 'vitest';
import {
  createTranslationService,
  fingerprint,
  translatableComments,
  type TranslateCall,
  type TranslatableComment,
} from './translations';

const NOTE: TranslatableComment = { ref: { kind: 'audit', id: 'n1' }, original: 'La llave gotea' };
const DESC: TranslatableComment = { ref: { kind: 'description' }, original: '<p>Fuga</p>' };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createTranslationService', () => {
  it('makes one call for repeated requests of the same comment and language', async () => {
    const d = deferred<{ results: Array<{ key: string; status: 'translated'; text: string }> }>();
    const call = vi.fn<TranslateCall>(() => d.promise);
    const svc = createTranslationService(call);

    const pending = [1, 2, 3, 4].map(() => svc.translate('r1', 'en', [NOTE]));
    d.resolve({ results: [{ key: 'audit:n1', status: 'translated', text: 'The faucet drips' }] });
    const all = await Promise.all(pending);

    expect(call).toHaveBeenCalledTimes(1);
    expect(all.every((r) => r['audit:n1'].state === 'translated')).toBe(true);
    await svc.translate('r1', 'en', [NOTE]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('requests only the comments it does not have yet, per language', async () => {
    const call = vi.fn<TranslateCall>(async ({ items }) => ({
      results: items.map((i) => ({ key: i.kind === 'audit' ? `audit:${i.id}` : i.kind, status: 'same' as const })),
    }));
    const svc = createTranslationService(call);
    await svc.translate('r1', 'en', [NOTE]);
    await svc.translate('r1', 'en', [NOTE, DESC]);
    await svc.translate('r1', 'es', [NOTE]);
    expect(call.mock.calls.map(([d]) => [d.target, d.items.length])).toEqual([
      ['en', 1],
      ['en', 1],
      ['es', 1],
    ]);
    expect(call.mock.calls[1][0].items).toEqual([{ kind: 'description' }]);
  });

  it('retries after a failure and maps quota errors to busy', async () => {
    const call = vi
      .fn<TranslateCall>()
      .mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'functions/resource-exhausted' }))
      .mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'functions/unavailable' }))
      .mockResolvedValueOnce({ results: [{ key: 'audit:n1', status: 'translated', text: 'ok' }] });
    const svc = createTranslationService(call);

    expect((await svc.translate('r1', 'en', [NOTE]))['audit:n1']).toEqual({ state: 'error', reason: 'busy' });
    expect((await svc.translate('r1', 'en', [NOTE]))['audit:n1']).toEqual({ state: 'error', reason: 'failed' });
    expect((await svc.translate('r1', 'en', [NOTE]))['audit:n1']).toEqual({ state: 'translated', text: 'ok' });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('calls again when the original text changes', async () => {
    const call = vi.fn<TranslateCall>(async () => ({ results: [{ key: 'description', status: 'translated', text: 'x' }] }));
    const svc = createTranslationService(call);
    await svc.translate('r1', 'en', [DESC]);
    await svc.translate('r1', 'en', [{ ...DESC, original: '<p>Otra fuga</p>' }]);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('never sends comment text to the backend', async () => {
    const call = vi.fn<TranslateCall>(async () => ({ results: [] }));
    await createTranslationService(call).translate('r1', 'en', [NOTE, DESC]);
    expect(JSON.stringify(call.mock.calls[0][0])).not.toContain('gotea');
  });
});

describe('translatableComments', () => {
  it('keeps the description, completion notes and user-typed audit details only', () => {
    const items = translatableComments({ notes: '<p>Fuga</p>', supervisorNotes: 'Listo' }, [
      { id: 'a', action: 'created', details: '102 · plumbing · normal' },
      { id: 'b', action: 'note_added', details: 'Nota' },
      { id: 'c', action: 'status_changed', details: '' },
      { id: 'd', action: 'status_changed', details: 'Falta pieza' },
      { id: 'e', action: 'reassigned', details: '— → Randel' },
    ]);
    expect(items.map((i) => i.ref)).toEqual([
      { kind: 'description' },
      { kind: 'supervisorNotes' },
      { kind: 'audit', id: 'b' },
      { kind: 'audit', id: 'd' },
    ]);
  });
});

describe('fingerprint', () => {
  it('differs for different texts and is stable', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
  });
});
