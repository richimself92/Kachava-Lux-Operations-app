/**
 * Admin reopening of completed requests, through the real client paths and
 * directly against the emulator's Firestore and Storage rules.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import {
  changeStatus,
  createRequestDoc,
  reopenRequest,
  toRequest,
  uploadPhotos,
  type Actor,
} from '../../src/services/requests';
import type { MaintenanceRequest } from '../../src/types';
import { ctxFor, dbFor, me, seedUsers, setupEnv, updateBatch, USERS, type TestUser } from './helpers';

let env: RulesTestEnvironment;

const actor = (u: TestUser): Actor => ({ uid: u.uid, email: u.email, name: u.displayName, role: u.role });
const storageFor = (u: TestUser) => ctxFor(env, u).storage() as unknown as FirebaseStorage;
const jpeg = (name: string) => new File([new Uint8Array(1024)], name, { type: 'image/jpeg' });
const JPEG = { contentType: 'image/jpeg' };

const input = {
  locationCode: '104',
  category: 'jacuzzi' as const,
  priority: 'urgent' as const,
  notes: 'Heater not working',
};

async function load(db: Firestore, id: string): Promise<MaintenanceRequest> {
  const snap = await getDoc(doc(db, 'maintenanceRequests', id));
  return toRequest(snap.id, snap.data()!);
}

async function acknowledgeAndComplete(id: string) {
  const db = dbFor(env, USERS.sup);
  await changeStatus(db, actor(USERS.sup), await load(db, id), 'reconocida');
  await changeStatus(db, actor(USERS.sup), await load(db, id), 'completada', { resolutionNotes: 'Replaced relay' });
}

async function completedRequest(): Promise<string> {
  const id = await createRequestDoc(dbFor(env, USERS.staff), actor(USERS.staff), input);
  await acknowledgeAndComplete(id);
  return id;
}

/** Reopens as admin with one photo, as the app does: upload first, then change status. */
async function reopenWithPhoto(id: string, reason: string, photoName: string) {
  const db = dbFor(env, USERS.admin);
  const { uploaded, failed } = await uploadPhotos(storageFor(USERS.admin), actor(USERS.admin), id, 'reopen', [jpeg(photoName)]);
  expect(failed).toEqual([]);
  await reopenRequest(db, actor(USERS.admin), await load(db, id), reason, uploaded);
  return uploaded;
}

/** A raw reopen write, so each test can break exactly one requirement. */
function reopenBatch(u: TestUser, id: string, overrides: Record<string, unknown> = {}, audit: Record<string, unknown> = {}) {
  return updateBatch(
    dbFor(env, u),
    u,
    id,
    {
      status: 'pendiente',
      statusChangedAt: serverTimestamp(),
      statusChangedBy: me(u),
      completedAt: deleteField(),
      completedBy: deleteField(),
      supervisorNotes: deleteField(),
      ...overrides,
    },
    { action: 'status_changed', fromStatus: 'completada', toStatus: 'pendiente', details: 'Still leaking', ...audit },
  ).batch;
}

beforeAll(async () => {
  env = await setupEnv(true);
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seedUsers(env);
  // uploadPhotos logs each denied upload; expected here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin reopens a completed request', () => {
  it('moves it to pendiente with the note and photo, and clears the completion record', async () => {
    const id = await completedRequest();
    const db = dbFor(env, USERS.admin);

    const [photo] = await reopenWithPhoto(id, 'Faucet still leaks', 'leak.jpg');

    const req = await load(db, id);
    expect(req.status).toBe('pendiente');
    expect(req.statusChangedBy?.uid).toBe(USERS.admin.uid);
    expect(req.completedAt).toBeNull();
    expect(req.completedBy).toBeUndefined();
    expect(req.supervisorNotes).toBeUndefined();
    expect(req.reopenPhotos.map((p) => p.fileName)).toEqual(['leak.jpg']);
    expect(req.reopenPhotos[0].kind).toBe('reopen');

    const submitterCopy = await getBytes(ref(storageFor(USERS.staff), photo.path));
    expect(submitterCopy.byteLength).toBe(1024);
  });

  it('keeps the previous completion and the reopen note in the audit history', async () => {
    const id = await completedRequest();
    const db = dbFor(env, USERS.admin);
    await reopenRequest(db, actor(USERS.admin), await load(db, id), 'Faucet still leaks');

    const audit = await getDocs(query(collection(db, 'maintenanceRequests', id, 'audit'), orderBy('at')));
    const entries = audit.docs.map((d) => d.data());
    expect(entries.slice(-2).map((e) => [e.fromStatus, e.toStatus, e.details])).toEqual([
      ['reconocida', 'completada', 'Replaced relay'],
      ['completada', 'pendiente', 'Faucet still leaks'],
    ]);
    expect(entries.at(-1)?.by.role).toBe('admin');
  });

  it('does not require a photo', async () => {
    const id = await completedRequest();
    const db = dbFor(env, USERS.admin);
    await reopenRequest(db, actor(USERS.admin), await load(db, id), 'Paint is uneven');

    const req = await load(db, id);
    expect(req.status).toBe('pendiente');
    expect(req.reopenPhotos).toEqual([]);
  });

  it('lets supervisors work and complete it again', async () => {
    const id = await completedRequest();
    await reopenWithPhoto(id, 'Faucet still leaks', 'leak.jpg');

    await acknowledgeAndComplete(id);

    const req = await load(dbFor(env, USERS.sup), id);
    expect(req.status).toBe('completada');
    expect(req.completedBy?.uid).toBe(USERS.sup.uid);
    expect(req.supervisorNotes).toBe('Replaced relay');
    expect(req.reopenPhotos).toHaveLength(1);
  });

  it('accumulates photos across repeated reopens', async () => {
    const id = await completedRequest();
    await reopenWithPhoto(id, 'First problem', 'one.jpg');
    await acknowledgeAndComplete(id);
    await reopenWithPhoto(id, 'Second problem', 'two.jpg');

    const req = await load(dbFor(env, USERS.admin), id);
    expect(req.reopenPhotos.map((p) => p.fileName)).toEqual(['one.jpg', 'two.jpg']);
  });
});

describe('reopen service guards', () => {
  it('refuses supervisors and staff before writing', async () => {
    const id = await completedRequest();
    for (const u of [USERS.sup, USERS.staff]) {
      const db = dbFor(env, u);
      await expect(reopenRequest(db, actor(u), await load(db, id), 'Nope')).rejects.toThrow(/admins/);
    }
  });

  it('refuses requests that are not completed', async () => {
    const id = await createRequestDoc(dbFor(env, USERS.staff), actor(USERS.staff), input);
    const db = dbFor(env, USERS.admin);
    await expect(reopenRequest(db, actor(USERS.admin), await load(db, id), 'Nope')).rejects.toThrow(/admins/);
  });

  it('refuses a blank note', async () => {
    const id = await completedRequest();
    const db = dbFor(env, USERS.admin);
    await expect(reopenRequest(db, actor(USERS.admin), await load(db, id), '   ')).rejects.toThrow(/reason/);
  });
});

describe('reopen rules', () => {
  it('accepts a well-formed admin reopen', async () => {
    const id = await completedRequest();
    await assertSucceeds(reopenBatch(USERS.admin, id).commit());
  });

  it('rejects supervisors and staff', async () => {
    const id = await completedRequest();
    await assertFails(reopenBatch(USERS.sup, id).commit());
    await assertFails(reopenBatch(USERS.staff, id).commit());
  });

  it('rejects a blank note', async () => {
    const id = await completedRequest();
    await assertFails(reopenBatch(USERS.admin, id, {}, { details: '   ' }).commit());
  });

  it('only allows moving to pendiente', async () => {
    const id = await completedRequest();
    await assertFails(reopenBatch(USERS.admin, id, { status: 'reconocida' }, { toStatus: 'reconocida' }).commit());
    await assertFails(reopenBatch(USERS.admin, id, { status: 'sin_revisar' }, { toStatus: 'sin_revisar' }).commit());
  });

  it('requires the audit entry to match the transition', async () => {
    const id = await completedRequest();
    await assertFails(reopenBatch(USERS.admin, id, {}, { fromStatus: 'reconocida' }).commit());
  });

  it('rejects keeping any part of the completion record', async () => {
    const id = await completedRequest();
    await assertFails(reopenBatch(USERS.admin, id, { supervisorNotes: 'keep' }).commit());
  });

  it('rejects changing anything else in the same write', async () => {
    const id = await completedRequest();
    await assertFails(reopenBatch(USERS.admin, id, { priority: 'low' }).commit());
    await assertFails(reopenBatch(USERS.admin, id, { notes: 'changed' }).commit());
  });

  it('rejects a forged status time or actor', async () => {
    const id = await completedRequest();
    await assertFails(reopenBatch(USERS.admin, id, { statusChangedAt: Timestamp.fromMillis(1000) }).commit());
    await assertFails(reopenBatch(USERS.admin, id, { statusChangedBy: me(USERS.sup) }).commit());
  });

  it('rejects removing photos from an earlier reopen', async () => {
    const id = await completedRequest();
    await reopenWithPhoto(id, 'First problem', 'one.jpg');
    await acknowledgeAndComplete(id);
    await assertFails(reopenBatch(USERS.admin, id, { reopenPhotos: [] }).commit());
  });

  it('keeps other edits blocked on completed requests', async () => {
    const id = await completedRequest();
    await assertFails(
      updateBatch(dbFor(env, USERS.admin), USERS.admin, id, { priority: 'low' }, { action: 'details_edited' }).batch.commit(),
    );
  });
});

describe('reopen photo storage rules', () => {
  const path = (id: string) => `maintenanceRequests/${id}/reopen/p1.jpg`;

  it('lets admins upload while the request is completed', async () => {
    const id = await completedRequest();
    await assertSucceeds(uploadBytes(ref(storageFor(USERS.admin), path(id)), new Uint8Array(10), JPEG));
  });

  it('rejects supervisors and staff', async () => {
    const id = await completedRequest();
    await assertFails(uploadBytes(ref(storageFor(USERS.sup), path(id)), new Uint8Array(10), JPEG));
    await assertFails(uploadBytes(ref(storageFor(USERS.staff), path(id)), new Uint8Array(10), JPEG));
  });

  it('rejects admins while the request is open', async () => {
    const id = await createRequestDoc(dbFor(env, USERS.staff), actor(USERS.staff), input);
    await assertFails(uploadBytes(ref(storageFor(USERS.admin), path(id)), new Uint8Array(10), JPEG));
  });

  it('still applies the image type limit', async () => {
    const id = await completedRequest();
    await assertFails(uploadBytes(ref(storageFor(USERS.admin), path(id)), new Uint8Array(10), { contentType: 'application/pdf' }));
  });
});
