/**
 * Runs inside `firebase emulators:exec --only firestore,functions` (see `npm run test:functions`).
 * - logic tests call functions/src/logic.ts directly against the Firestore emulator;
 * - trigger tests verify the deployed-style wiring through the Functions emulator.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import {
  assignDefaultSupervisor,
  assignTicketId,
  cancunYear,
  isLifecycleChange,
  purgeRequestArtifacts,
  recomputeKpi,
} from '../../functions/src/logic';

// Load firebase-admin from functions/node_modules: the same copy functions/src/logic.ts uses.
const requireFromFunctions = createRequire(resolve(__dirname, '../../functions/package.json'));
const { deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore, Timestamp } = requireFromFunctions(
  'firebase-admin/firestore',
) as typeof import('firebase-admin/firestore');
type Timestamp = InstanceType<typeof Timestamp>;

const PROJECT_ID = 'demo-kachava';
const H = 3_600_000;
// 2026-11-05 09:00 America/Cancun
const T0 = Date.UTC(2026, 10, 5, 14, 0, 0);

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run via npm run test:functions (needs emulators).');
  app = initializeApp({ projectId: PROJECT_ID }, 'functions-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

beforeEach(clearFirestore);

function requestDoc(createdAtMs: number, extra: Record<string, unknown> = {}) {
  return {
    location: { code: '102', name: 'Villa 102', type: 'villa' },
    category: 'plumbing',
    priority: 'normal',
    locationDetail: 'Kitchen',
    notes: 'Test',
    status: 'sin_revisar',
    submittedBy: { uid: 'u1', email: 'bianca@kachavalux.com', name: 'Bianca' },
    createdAt: Timestamp.fromMillis(createdAtMs),
    updatedAt: Timestamp.fromMillis(createdAtMs),
    statusChangedAt: Timestamp.fromMillis(createdAtMs),
    beforePhotos: [],
    afterPhotos: [],
    ...extra,
  };
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for trigger');
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe('pure helpers', () => {
  it('computes the Cancun year at the UTC boundary', () => {
    // 2027-01-01 03:00 UTC is still 2026-12-31 22:00 in Cancun.
    expect(cancunYear(new Date(Date.UTC(2027, 0, 1, 3)))).toBe(2026);
  });

  it('detects lifecycle changes only', () => {
    const ts = Timestamp.fromMillis(T0);
    expect(isLifecycleChange({ status: 'a', statusChangedAt: ts }, { status: 'a', statusChangedAt: ts })).toBe(false);
    expect(isLifecycleChange({ status: 'a', statusChangedAt: ts }, { status: 'b', statusChangedAt: ts })).toBe(true);
    expect(
      isLifecycleChange({ status: 'a', statusChangedAt: ts }, { status: 'a', statusChangedAt: Timestamp.fromMillis(T0 + 1) }),
    ).toBe(true);
  });
});

describe('assignTicketId (logic)', () => {
  it('gives 20 concurrent requests 20 distinct sequential ids', async () => {
    const refs = await Promise.all(
      Array.from({ length: 20 }, () => db.collection('maintenanceRequests').add(requestDoc(T0))),
    );
    // Clear any ids the trigger may already have assigned, then race the logic directly.
    const ids = await Promise.all(refs.map((r) => assignTicketId(db, r)));
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
    const seqs = [...unique].map((id) => Number(id!.slice(-4))).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect([...unique].every((id) => id!.startsWith('KLM-2026-'))).toBe(true);
  });

  it('is idempotent', async () => {
    const ref = await db.collection('maintenanceRequests').add(requestDoc(T0));
    const a = await assignTicketId(db, ref);
    const b = await assignTicketId(db, ref);
    expect(a).toBe(b);
  });
});

describe('recomputeKpi (logic)', () => {
  async function seedWorkedExample() {
    const ref = await db.collection('maintenanceRequests').add(
      requestDoc(T0, { status: 'completada', completedAt: Timestamp.fromMillis(T0 + 4.5 * H) }),
    );
    const transitions: [string, string, number][] = [
      ['sin_revisar', 'reconocida', 1],
      ['reconocida', 'pendiente', 2],
      ['pendiente', 'reconocida', 4],
      ['reconocida', 'completada', 4.5],
    ];
    for (const [from, to, h] of transitions) {
      await ref.collection('audit').add({
        action: 'status_changed',
        fromStatus: from,
        toStatus: to,
        at: Timestamp.fromMillis(T0 + h * H),
        by: { uid: 'u2', email: 'randel@kachavalux.com', name: 'Randel', role: 'supervisor' },
        details: '',
      });
    }
    // A non-status audit entry must be ignored.
    await ref.collection('audit').add({ action: 'note_added', at: Timestamp.fromMillis(T0 + 3 * H), details: 'x' });
    return ref;
  }

  it('produces the spec worked-example values', async () => {
    const ref = await seedWorkedExample();
    await recomputeKpi(ref);
    const kpi = (await ref.get()).get('kpi');
    expect(kpi).toMatchObject({
      responseMs: 1 * H,
      responseSlaMet: true,
      workMs: 1.5 * H,
      blockedMs: 2 * H,
      totalMs: 4.5 * H,
    });
  });

  it('re-processing the same state leaves kpi unchanged (no rewrite)', async () => {
    const ref = await seedWorkedExample();
    await recomputeKpi(ref);
    const first = (await ref.get()).get('kpi');
    await recomputeKpi(ref);
    await recomputeKpi(ref);
    const again = (await ref.get()).get('kpi');
    expect(again).toEqual(first);
    expect((again.computedAt as Timestamp).isEqual(first.computedAt as Timestamp)).toBe(true);
  });
});

describe('assignDefaultSupervisor (logic)', () => {
  const RANDEL = 'randel@kachavalux.com';
  const seedUser = (email: string, data: Record<string, unknown>) =>
    db.doc(`users/${email}`).set({ email, displayName: 'Randel Can Chuc', role: 'supervisor', title: '', active: true, ...data });

  it('assigns the active default supervisor once, with an audit entry', async () => {
    await seedUser(RANDEL, {});
    const ref = await db.collection('maintenanceRequests').add(requestDoc(T0));
    const first = await assignDefaultSupervisor(db, ref, 'Randel@KachavaLux.com');
    expect(first).toEqual({ email: RANDEL, name: 'Randel Can Chuc' });
    expect((await ref.get()).get('assignedTo')).toEqual({ email: RANDEL, name: 'Randel Can Chuc' });
    const audit = await ref.collection('audit').where('action', '==', 'reassigned').get();
    expect(audit.size).toBe(1);

    // Idempotent: never overrides an existing assignee.
    expect(await assignDefaultSupervisor(db, ref, RANDEL)).toBeNull();
    expect((await ref.collection('audit').get()).size).toBe(1);
  });

  it('leaves the request unassigned when the default user is missing, inactive or staff', async () => {
    const ref = await db.collection('maintenanceRequests').add(requestDoc(T0));
    expect(await assignDefaultSupervisor(db, ref, RANDEL)).toBeNull();
    await seedUser(RANDEL, { active: false });
    expect(await assignDefaultSupervisor(db, ref, RANDEL)).toBeNull();
    await seedUser(RANDEL, { role: 'staff' });
    expect(await assignDefaultSupervisor(db, ref, RANDEL)).toBeNull();
    expect(await assignDefaultSupervisor(db, ref, '')).toBeNull();
    expect((await ref.get()).get('assignedTo')).toBeUndefined();
  });
});

describe('purgeRequestArtifacts (logic)', () => {
  it('removes the audit subcollection and the photo prefix, tolerating a photo failure', async () => {
    const ref = await db.collection('maintenanceRequests').add(requestDoc(T0));
    await ref.collection('audit').add({ action: 'created', at: Timestamp.fromMillis(T0), details: '' });
    await ref.collection('audit').add({ action: 'note_added', at: Timestamp.fromMillis(T0 + H), details: 'x' });
    await ref.delete();

    const prefixes: string[] = [];
    const ok = await purgeRequestArtifacts(db, ref.id, async (p) => {
      prefixes.push(p);
    });
    expect(ok.photosError).toBeNull();
    expect(prefixes).toEqual([`maintenanceRequests/${ref.id}/`]);
    expect((await ref.collection('audit').get()).size).toBe(0);

    const failed = await purgeRequestArtifacts(db, ref.id, async () => {
      throw new Error('storage down');
    });
    expect(String(failed.photosError)).toContain('storage down');
  });
});

describe('triggers (functions emulator)', () => {
  it('assigns Randel as the default supervisor on create', async () => {
    await db.doc('users/randel@kachavalux.com').set({
      email: 'randel@kachavalux.com',
      displayName: 'Randel Can Chuc',
      role: 'supervisor',
      title: 'Maintenance Manager',
      active: true,
    });
    const ref = await db.collection('maintenanceRequests').add(requestDoc(Date.now()));
    const assignee = await waitFor(async () => (await ref.get()).get('assignedTo') as { email: string } | undefined);
    expect(assignee).toEqual({ email: 'randel@kachavalux.com', name: 'Randel Can Chuc' });
  });

  it('purges the audit history when a request is deleted', async () => {
    const ref = await db.collection('maintenanceRequests').add(requestDoc(Date.now()));
    await ref.collection('audit').add({ action: 'created', at: Timestamp.now(), details: '' });
    await ref.delete();
    await waitFor(async () => ((await ref.collection('audit').get()).empty ? true : undefined));
  });

  it('assigns a ticket id on create and recomputes kpi on status change, without looping', async () => {
    const now = Date.now();
    const ref = await db.collection('maintenanceRequests').add(requestDoc(now));

    const ticketId = await waitFor(async () => (await ref.get()).get('ticketId') as string | undefined);
    expect(ticketId).toMatch(/^KLM-\d{4}-\d{4}$/);

    const at = Timestamp.fromMillis(now + 60_000);
    await ref.collection('audit').add({
      action: 'status_changed',
      fromStatus: 'sin_revisar',
      toStatus: 'pendiente',
      at,
      details: '',
    });
    await ref.update({ status: 'pendiente', statusChangedAt: at, firstResponseAt: at });

    const kpi = await waitFor(async () => {
      const k = (await ref.get()).get('kpi');
      return k?.responseMs != null ? k : undefined;
    });
    expect(kpi.responseMs).toBe(60_000);
    expect(kpi.responseSlaMet).toBe(true);

    // Bounded writes: kpi.computedAt stays stable once settled (no trigger loop).
    await new Promise((r) => setTimeout(r, 3000));
    const settled = (await ref.get()).get('kpi');
    await new Promise((r) => setTimeout(r, 2000));
    const later = (await ref.get()).get('kpi');
    expect((later.computedAt as Timestamp).isEqual(settled.computedAt as Timestamp)).toBe(true);
  });

  it('backfills a missing ticket id on the next update (creation trigger failed)', async () => {
    const { FieldValue } = requireFromFunctions('firebase-admin/firestore') as typeof import('firebase-admin/firestore');
    const ref = await db.collection('maintenanceRequests').add(requestDoc(Date.now()));
    const first = await waitFor(async () => (await ref.get()).get('ticketId') as string | undefined);

    // Simulate a request whose creation trigger never ran.
    await ref.update({ ticketId: FieldValue.delete() });
    // Any later write (e.g. a note) repairs it.
    await ref.update({ updatedAt: Timestamp.now() });

    const repaired = await waitFor(async () => (await ref.get()).get('ticketId') as string | undefined);
    expect(repaired).toMatch(/^KLM-\d{4}-\d{4}$/);
    expect(repaired).not.toBe(first); // counter moved on; ids are never reused
  });
});
