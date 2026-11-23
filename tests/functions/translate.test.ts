/**
 * translateComments: logic tests against the Firestore emulator with an injected translator,
 * plus one call through the Functions emulator (which wires the fake translator).
 * Runs inside `npm run test:functions`.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import {
  fakeTranslator,
  MAX_ITEMS,
  translateComments,
  translationLogEntry,
  type AuthInfo,
  type TranslateGroup,
  type Translator,
} from '../../functions/src/translate';

const requireFromFunctions = createRequire(resolve(__dirname, '../../functions/package.json'));
const { deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore, Timestamp } = requireFromFunctions(
  'firebase-admin/firestore',
) as typeof import('firebase-admin/firestore');

const PROJECT_ID = 'demo-kachava';
let app: App;
let db: Firestore;

/**
 * The Firestore triggers are not under test here. Pause them while this file seeds and clears
 * requests: otherwise onMaintenanceRequestCreated would consume the shared ticket counter and the
 * trigger backlog would slow down the trigger tests in functions.test.ts.
 */
async function setBackgroundTriggers(enabled: boolean) {
  const hub = process.env.FIREBASE_EMULATOR_HUB;
  if (!hub) return;
  const path = enabled ? 'enableBackgroundTriggers' : 'disableBackgroundTriggers';
  const res = await fetch(`http://${hub}/functions/${path}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Could not ${path}: ${res.status}`);
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run via npm run test:functions (needs emulators).');
  app = initializeApp({ projectId: PROJECT_ID }, 'translate-test');
  db = getFirestore(app);
  await setBackgroundTriggers(false);
});

afterAll(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  await setBackgroundTriggers(true);
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
});

const SPANISH_NOTE = 'La llave del lavabo sigue goteando';
const ENGLISH_NOTE = 'The sink faucet is still leaking';
const DESCRIPTION = '<p>Fuga de agua en el <b>baño</b> principal</p>';

const auth = (uid: string, email: string, provider = 'microsoft.com'): AuthInfo => ({
  uid,
  token: { email, firebase: { sign_in_provider: provider } },
});
const STAFF = auth('u-staff', 'bianca@kachavalux.com');
const OTHER_STAFF = auth('u-other', 'dina@kachavalux.com');
const SUPERVISOR = auth('u-sup', 'randel@kachavalux.com');

/**
 * Each test uses its own request id: clearing the emulator fires onMaintenanceRequestDeleted for
 * the previous test's request, whose async purge would otherwise remove a reused id's audit docs.
 */
let REQ = 'req1';

/** Calls the logic, mapping the placeholder reqId `req1` to this test's request. */
const run = (who: AuthInfo | null, data: Record<string, unknown>, translator: Translator) =>
  translateComments(db, who, data.reqId === 'req1' ? { ...data, reqId: REQ } : data, translator);

async function seed() {
  REQ = `req${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const users: Array<[string, string, boolean]> = [
    ['bianca@kachavalux.com', 'staff', true],
    ['dina@kachavalux.com', 'staff', true],
    ['randel@kachavalux.com', 'supervisor', true],
    ['old@kachavalux.com', 'supervisor', false],
  ];
  for (const [email, role, active] of users) {
    await db.doc(`users/${email}`).set({ email, displayName: email, role, title: '', active });
  }
  const ref = db.collection('maintenanceRequests').doc(REQ);
  await ref.set({
    notes: DESCRIPTION,
    supervisorNotes: ENGLISH_NOTE,
    status: 'completada',
    submittedBy: { uid: STAFF.uid, email: 'bianca@kachavalux.com', name: 'Bianca' },
    createdAt: Timestamp.now(),
  });
  await ref.collection('audit').doc('n1').set({ action: 'note_added', details: SPANISH_NOTE, at: Timestamp.now() });
  await ref.collection('audit').doc('n2').set({ action: 'status_changed', details: ENGLISH_NOTE, at: Timestamp.now() });
  await ref.collection('audit').doc('r1').set({ action: 'reassigned', details: '— → Randel', at: Timestamp.now() });
  await ref.collection('audit').doc('e1').set({ action: 'status_changed', details: '', at: Timestamp.now() });
  return ref;
}

/** Fake translator that records every group it receives. */
function spyTranslator(impl: Translator = fakeTranslator) {
  const calls: TranslateGroup[] = [];
  const fn: Translator = async (g) => {
    calls.push(g);
    return impl(g);
  };
  return { fn, calls };
}

const NOTE = { kind: 'audit', id: 'n1' } as const;

describe('translateComments: authentication and authorization', () => {
  it('rejects unauthenticated callers', async () => {
    await seed();
    await expect(
      run(null, { reqId: 'req1', target: 'en', items: [NOTE] }, fakeTranslator),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    ['another provider', auth('u-sup', 'randel@kachavalux.com', 'google.com')],
    ['another domain', auth('u-x', 'someone@gmail.com')],
    ['an inactive user', auth('u-old', 'old@kachavalux.com')],
    ['a user not on the allowlist', auth('u-new', 'new@kachavalux.com')],
  ])('rejects %s as permission-denied', async (_label, who) => {
    await seed();
    await expect(
      run(who, { reqId: 'req1', target: 'en', items: [NOTE] }, fakeTranslator),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it("hides another user's request from staff (not-found)", async () => {
    await seed();
    await expect(
      run(OTHER_STAFF, { reqId: 'req1', target: 'en', items: [NOTE] }, fakeTranslator),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('allows the submitter and supervisors', async () => {
    await seed();
    for (const who of [STAFF, SUPERVISOR]) {
      const out = await run(who, { reqId: 'req1', target: 'en', items: [NOTE] }, fakeTranslator);
      expect(out.results[0].status).toBe('translated');
    }
  });

  it('reports a missing request as not-found', async () => {
    await seed();
    await expect(
      run(SUPERVISOR, { reqId: 'nope', target: 'en', items: [NOTE] }, fakeTranslator),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('translateComments: validation', () => {
  const tooMany = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ kind: 'audit', id: `a${i}` }));
  it.each([
    ['target fr', { reqId: 'req1', target: 'fr', items: [NOTE] }],
    ['no items', { reqId: 'req1', target: 'en', items: [] }],
    [`${MAX_ITEMS + 1} items`, { reqId: 'req1', target: 'en', items: tooMany }],
    ['duplicate items', { reqId: 'req1', target: 'en', items: [NOTE, NOTE] }],
    ['a malformed id', { reqId: 'req1', target: 'en', items: [{ kind: 'audit', id: '../users' }] }],
    ['an unknown kind', { reqId: 'req1', target: 'en', items: [{ kind: 'title' }] }],
    ['a malformed reqId', { reqId: 'a/b', target: 'en', items: [NOTE] }],
    ['a system audit entry', { reqId: 'req1', target: 'en', items: [{ kind: 'audit', id: 'r1' }] }],
    ['an unknown audit entry', { reqId: 'req1', target: 'en', items: [{ kind: 'audit', id: 'zz' }] }],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    await seed();
    await expect(run(SUPERVISOR, data, fakeTranslator)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects more than 30,000 characters still to translate', async () => {
    const ref = await seed();
    await ref.update({ notes: 'palabra '.repeat(4000) });
    const spy = spyTranslator();
    await expect(
      run(SUPERVISOR, { reqId: 'req1', target: 'en', items: [{ kind: 'description' }] }, spy.fn),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(spy.calls).toHaveLength(0);
  });

  it('returns same for empty text without calling the service', async () => {
    await seed();
    const spy = spyTranslator();
    const out = await run(
      SUPERVISOR,
      { reqId: 'req1', target: 'en', items: [{ kind: 'audit', id: 'e1' }] },
      spy.fn,
    );
    expect(out.results).toEqual([{ key: 'audit:e1', status: 'same' }]);
    expect(spy.calls).toHaveLength(0);
  });
});

describe('translateComments: translation, grouping and cache', () => {
  it('translates, reports the detected language and groups by mime type', async () => {
    await seed();
    const spy = spyTranslator();
    const out = await run(
      SUPERVISOR,
      { reqId: 'req1', target: 'en', items: [{ kind: 'description' }, NOTE, { kind: 'audit', id: 'n2' }] },
      spy.fn,
    );
    expect(out.results).toEqual([
      { key: 'description', status: 'translated', text: `[en] ${DESCRIPTION}`, detectedSource: 'es' },
      { key: 'audit:n1', status: 'translated', text: `[en] ${SPANISH_NOTE}`, detectedSource: 'es' },
      { key: 'audit:n2', status: 'same', detectedSource: 'en' },
    ]);
    expect(spy.calls.map((c) => [c.mimeType, c.source, c.contents.length])).toEqual([
      ['text/html', null, 1],
      ['text/plain', null, 2],
    ]);
  });

  it('serves a repeat request from the cache', async () => {
    await seed();
    const spy = spyTranslator();
    const data = { reqId: 'req1', target: 'en', items: [NOTE, { kind: 'supervisorNotes' }] };
    await run(SUPERVISOR, data, spy.fn);
    const again = await run(STAFF, data, spy.fn);
    expect(spy.calls).toHaveLength(1);
    expect(again.stats.cacheHits).toBe(2);
    expect(again.results[0]).toMatchObject({ status: 'translated', text: `[en] ${SPANISH_NOTE}` });
    expect(again.results[1]).toMatchObject({ status: 'same' });
  });

  it('translates again after the original changes', async () => {
    const ref = await seed();
    const spy = spyTranslator();
    const data = { reqId: 'req1', target: 'en', items: [{ kind: 'description' }] };
    await run(SUPERVISOR, data, spy.fn);
    await ref.update({ notes: '<p>Se cambió la descripción</p>' });
    const out = await run(SUPERVISOR, data, spy.fn);
    expect(spy.calls).toHaveLength(2);
    expect(out.results[0].text).toBe('[en] <p>Se cambió la descripción</p>');
  });

  it('skips the service when the known source equals the target', async () => {
    await seed();
    const spy = spyTranslator();
    await run(SUPERVISOR, { reqId: 'req1', target: 'en', items: [NOTE] }, spy.fn); // detects es
    const out = await run(SUPERVISOR, { reqId: 'req1', target: 'es', items: [NOTE] }, spy.fn);
    expect(spy.calls).toHaveLength(1);
    expect(out.results[0]).toEqual({ key: 'audit:n1', status: 'same', detectedSource: 'es' });
  });

  it('sends a known source language instead of detecting again', async () => {
    const ref = await seed();
    await ref.collection('audit').doc('fr1').set({ action: 'note_added', details: 'Le robinet fuit', at: Timestamp.now() });
    const french: Translator = async ({ contents, source }) =>
      contents.map((t) => ({ text: `tr(${t})`, detectedSource: source ? null : 'fr' }));
    const spy = spyTranslator(french);
    const item = { kind: 'audit', id: 'fr1' };
    await run(SUPERVISOR, { reqId: 'req1', target: 'en', items: [item] }, spy.fn);
    const out = await run(SUPERVISOR, { reqId: 'req1', target: 'es', items: [item] }, spy.fn);
    expect(spy.calls.map((c) => c.source)).toEqual([null, 'fr']);
    expect(out.results[0]).toMatchObject({ status: 'translated', detectedSource: 'fr' });
  });
});

describe('translateComments: errors and integrity', () => {
  it('maps quota errors to resource-exhausted and other errors to unavailable, without caching', async () => {
    const ref = await seed();
    const data = { reqId: 'req1', target: 'en', items: [NOTE] };
    const quota: Translator = async () => {
      throw Object.assign(new Error('quota'), { code: 8 });
    };
    const down: Translator = async () => {
      throw new Error('socket hang up');
    };
    await expect(run(SUPERVISOR, data, quota)).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(run(SUPERVISOR, data, down)).rejects.toMatchObject({ code: 'unavailable' });
    expect((await ref.collection('translations').get()).size).toBe(0);
    expect((await ref.collection('audit').doc('n1').get()).get('details')).toBe(SPANISH_NOTE);
  });

  it('reports content the service refuses per item and keeps the other groups', async () => {
    await seed();
    const picky: Translator = async (g) => {
      if (g.mimeType === 'text/html') throw Object.assign(new Error('bad html'), { code: 3 });
      return fakeTranslator(g);
    };
    const out = await run(
      SUPERVISOR,
      { reqId: 'req1', target: 'en', items: [{ kind: 'description' }, NOTE] },
      picky,
    );
    expect(out.results[0]).toEqual({ key: 'description', status: 'error', errorCode: 'failed' });
    expect(out.results[1].status).toBe('translated');
  });

  it('never modifies the originals', async () => {
    const ref = await seed();
    const before = (await ref.get()).data();
    const auditBefore = (await ref.collection('audit').doc('n1').get()).data();
    await run(
      SUPERVISOR,
      { reqId: 'req1', target: 'en', items: [{ kind: 'description' }, { kind: 'supervisorNotes' }, NOTE] },
      fakeTranslator,
    );
    expect((await ref.get()).data()).toEqual(before);
    expect((await ref.collection('audit').doc('n1').get()).data()).toEqual(auditBefore);
  });

  it('logs only metadata', () => {
    const entry = translationLogEntry('en', { items: 3, cacheHits: 1, apiCalls: 1, apiChars: 42 }, 120, 'ok');
    expect(Object.keys(entry).sort()).toEqual([
      'apiCalls',
      'apiChars',
      'cacheHits',
      'code',
      'durationMs',
      'items',
      'outcome',
      'target',
    ]);
    expect(Object.values(entry).every((v) => v === null || typeof v === 'number' || ['en', 'ok'].includes(String(v)))).toBe(
      true,
    );
  });
});

describe('translateComments callable (functions emulator)', () => {
  /** Unsigned ID token: the Functions emulator skips signature verification. */
  function emulatorToken(uid: string, email: string) {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: uid,
      user_id: uid,
      email,
      aud: PROJECT_ID,
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      iat: now,
      exp: now + 3600,
      firebase: { sign_in_provider: 'microsoft.com' },
    })}.`;
  }

  it('returns fake translations for an authorized supervisor and rejects anonymous calls', async () => {
    await seed();
    const url = `http://127.0.0.1:5002/${PROJECT_ID}/us-central1/translateComments`;
    const body = JSON.stringify({ data: { reqId: REQ, target: 'en', items: [NOTE] } });

    const ok = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${emulatorToken(SUPERVISOR.uid, 'randel@kachavalux.com')}`,
      },
      body,
    });
    const raw = await ok.text();
    expect(ok.status, raw).toBe(200);
    const json = JSON.parse(raw) as { result: { results: Array<{ status: string; text?: string }> } };
    expect(json.result.results[0]).toMatchObject({ status: 'translated', text: `[en] ${SPANISH_NOTE}` });

    const anon = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(anon.status).toBe(401);
  });
});
