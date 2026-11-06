/**
 * Runs the real client write paths (src/services/requests.ts) against the emulator rules,
 * so the app and the rules cannot drift apart.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, orderBy, type Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import {
  addNote,
  attachPhotos,
  changeStatus,
  createRequestDoc,
  reassign,
  subscribeRequests,
  toRequest,
  uploadPhotos,
  type Actor,
} from '../../src/services/requests';
import type { MaintenanceRequest } from '../../src/types';
import { ctxFor, dbFor, seedUsers, setupEnv, USERS, type TestUser } from './helpers';

let env: RulesTestEnvironment;

const actor = (u: TestUser): Actor => ({ uid: u.uid, email: u.email, name: u.displayName, role: u.role });
const storageFor = (u: TestUser) => ctxFor(env, u).storage() as unknown as FirebaseStorage;
const jpeg = (name: string) => new File([new Uint8Array(1024)], name, { type: 'image/jpeg' });

async function load(db: Firestore, id: string): Promise<MaintenanceRequest> {
  const snap = await getDoc(doc(db, 'maintenanceRequests', id));
  return toRequest(snap.id, snap.data()!);
}

function firstSnapshot(db: Firestore, u: TestUser, seesAll: boolean): Promise<MaintenanceRequest[]> {
  return new Promise((resolve, reject) => {
    const unsub = subscribeRequests(
      db,
      { uid: u.uid, seesAll },
      (r) => {
        unsub();
        resolve(r);
      },
      reject,
    );
  });
}

const input = {
  locationCode: '104',
  category: 'jacuzzi' as const,
  priority: 'urgent' as const,
  locationDetail: 'Terrace jacuzzi',
  notes: 'Heater not working',
};

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
});

describe('client request service vs rules', () => {
  it('runs the full lifecycle with photos, notes, reassignment and audit trail', async () => {
    const staffDb = dbFor(env, USERS.staff);
    const supDb = dbFor(env, USERS.sup);

    // Staff submits, then attaches before photos.
    const id = await createRequestDoc(staffDb, actor(USERS.staff), input);
    const before = await uploadPhotos(storageFor(USERS.staff), actor(USERS.staff), id, 'before', [jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(before.failed).toEqual([]);
    await attachPhotos(staffDb, actor(USERS.staff), await load(staffDb, id), 'before', before.uploaded);
    await addNote(staffDb, actor(USERS.staff), id, 'Guest arriving at 4pm');

    let req = await load(staffDb, id);
    expect(req.status).toBe('sin_revisar');
    expect(req.beforePhotos).toHaveLength(2);
    expect(req.createdAt).toBeInstanceOf(Date);

    // Supervisor: pending (blocked) → acknowledged (work) → reassign → complete with after photos.
    await changeStatus(supDb, actor(USERS.sup), await load(supDb, id), 'pendiente', { note: 'Waiting for part' });
    req = await load(supDb, id);
    expect(req.firstResponseBy?.uid).toBe(USERS.sup.uid);
    expect(req.assignedTo?.email).toBe(USERS.sup.email);

    await changeStatus(supDb, actor(USERS.sup), req, 'reconocida');
    await reassign(supDb, actor(USERS.sup), await load(supDb, id), {
      email: USERS.sup2.email,
      name: USERS.sup2.displayName,
    });
    await addNote(supDb, actor(USERS.sup), id, 'Part arrived');

    const after = await uploadPhotos(storageFor(USERS.sup), actor(USERS.sup), id, 'after', [jpeg('fixed.jpg')]);
    expect(after.failed).toEqual([]);
    await changeStatus(supDb, actor(USERS.sup), await load(supDb, id), 'completada', {
      resolutionNotes: 'Replaced heater relay',
      afterPhotos: after.uploaded,
    });

    req = await load(supDb, id);
    expect(req.status).toBe('completada');
    expect(req.completedBy?.uid).toBe(USERS.sup.uid);
    expect(req.assignedTo?.email).toBe(USERS.sup2.email);
    expect(req.afterPhotos).toHaveLength(1);
    expect(req.supervisorNotes).toBe('Replaced heater relay');

    const audit = await getDocs(query(collection(supDb, 'maintenanceRequests', id, 'audit'), orderBy('at')));
    expect(audit.docs.map((d) => d.data().action)).toEqual([
      'created',
      'photo_added',
      'note_added',
      'status_changed',
      'status_changed',
      'reassigned',
      'note_added',
      'status_changed',
    ]);
  });

  it('refuses invalid transitions and completion without notes; staff cannot change status', async () => {
    const staffDb = dbFor(env, USERS.staff);
    const id = await createRequestDoc(staffDb, actor(USERS.staff), input);
    const req = await load(staffDb, id);
    await assertFails(changeStatus(staffDb, actor(USERS.staff), req, 'reconocida'));

    const supDb = dbFor(env, USERS.sup);
    await expect(changeStatus(supDb, actor(USERS.sup), req, 'completada')).rejects.toThrow(/not allowed/);
    await changeStatus(supDb, actor(USERS.sup), req, 'reconocida');
    await expect(changeStatus(supDb, actor(USERS.sup), await load(supDb, id), 'completada')).rejects.toThrow(/Resolution/);
  });

  it('scopes the live list: staff see only their own, supervisors see all', async () => {
    await createRequestDoc(dbFor(env, USERS.staff), actor(USERS.staff), input);
    await createRequestDoc(dbFor(env, USERS.staff2), actor(USERS.staff2), { ...input, locationCode: 'gym', category: 'fauna_nociva' });

    const mine = await firstSnapshot(dbFor(env, USERS.staff), USERS.staff, false);
    expect(mine.map((r) => r.submittedBy.uid)).toEqual([USERS.staff.uid]);

    const all = await firstSnapshot(dbFor(env, USERS.sup), USERS.sup, true);
    expect(all).toHaveLength(2);

    // A staff member asking for everything is denied by the rules.
    await expect(firstSnapshot(dbFor(env, USERS.staff), USERS.staff, true)).rejects.toThrow();
  });
});
