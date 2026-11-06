import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  baseRequest,
  createBatch,
  createRequestAs,
  dbFor,
  firstResponseFields,
  me,
  meWithRole,
  seedUsers,
  setupEnv,
  statusBatch,
  updateBatch,
  type TestUser,
  UNLISTED,
  USERS,
} from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await setupEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedUsers(env);
});

/** Moves a fresh request to `reconocida` via the supervisor. */
async function toReconocida(reqId: string) {
  const db = dbFor(env, USERS.sup);
  await assertSucceeds(
    statusBatch(db, USERS.sup, reqId, 'sin_revisar', 'reconocida', firstResponseFields(USERS.sup)).batch.commit(),
  );
}

describe('access control', () => {
  it('lets an allowlisted Microsoft user create a request', async () => {
    const db = dbFor(env, USERS.staff);
    await assertSucceeds(createBatch(db, USERS.staff).batch.commit());
  });

  it('denies a tenant user who is not on the allowlist', async () => {
    const db = dbFor(env, UNLISTED);
    await assertFails(createBatch(db, UNLISTED).batch.commit());
    const id = await createRequestAs(env, USERS.staff);
    await assertFails(getDoc(doc(db, 'maintenanceRequests', id)));
  });

  it('denies a deactivated user', async () => {
    const db = dbFor(env, USERS.inactive);
    await assertFails(createBatch(db, USERS.inactive).batch.commit());
  });

  it('denies a non-Microsoft sign-in provider even for an allowlisted email', async () => {
    const db = dbFor(env, USERS.staff, 'password');
    await assertFails(createBatch(db, USERS.staff).batch.commit());
    await assertFails(getDoc(doc(db, 'users', USERS.staff.email)));
  });

  it('lets an unlisted tenant user read only their own (missing) user doc', async () => {
    const db = dbFor(env, UNLISTED);
    await assertSucceeds(getDoc(doc(db, 'users', UNLISTED.email)));
    await assertFails(getDoc(doc(db, 'users', USERS.staff.email)));
  });

  it('rejects a forged submitter identity', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(createBatch(db, USERS.staff, { submittedBy: me(USERS.staff2) }).batch.commit());
  });

  it('only admins manage users', async () => {
    const newUser = {
      email: 'new@kachavalux.com',
      displayName: 'New Person',
      role: 'staff',
      title: 'Housekeeping',
      active: true,
      createdAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(dbFor(env, USERS.sup), 'users', newUser.email), newUser));
    await assertFails(setDoc(doc(dbFor(env, USERS.staff), 'users', newUser.email), newUser));
    await assertSucceeds(setDoc(doc(dbFor(env, USERS.admin), 'users', newUser.email), newUser));

    await assertFails(
      updateDoc(doc(dbFor(env, USERS.staff), 'users', USERS.staff.email), { role: 'admin' }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(env, USERS.admin), 'users', USERS.staff.email), {
        role: 'supervisor',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('rejects admin-created users outside the company domain', async () => {
    await assertFails(
      setDoc(doc(dbFor(env, USERS.admin), 'users', 'someone@gmail.com'), {
        email: 'someone@gmail.com',
        displayName: 'Outsider',
        role: 'admin',
        title: 'x',
        active: true,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('lets a user record only their own uid and sign-in time', async () => {
    const db = dbFor(env, USERS.staff);
    await assertSucceeds(
      updateDoc(doc(db, 'users', USERS.staff.email), { uid: USERS.staff.uid, lastSignInAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(db, 'users', USERS.staff.email), { uid: 'someone-else', lastSignInAt: serverTimestamp() }),
    );
  });

  it('never allows deleting users', async () => {
    await assertFails(deleteDoc(doc(dbFor(env, USERS.admin), 'users', USERS.staff.email)));
  });

  it('lets only admins delete requests (not supervisors, staff or the submitter)', async () => {
    const a = await createRequestAs(env, USERS.staff);
    await assertFails(deleteDoc(doc(dbFor(env, USERS.staff), 'maintenanceRequests', a)));
    await assertFails(deleteDoc(doc(dbFor(env, USERS.staff2), 'maintenanceRequests', a)));
    await assertFails(deleteDoc(doc(dbFor(env, USERS.inactive), 'maintenanceRequests', a)));
    await assertFails(deleteDoc(doc(dbFor(env, UNLISTED), 'maintenanceRequests', a)));
    await assertFails(deleteDoc(doc(dbFor(env, USERS.sup), 'maintenanceRequests', a)));
    await assertSucceeds(deleteDoc(doc(dbFor(env, USERS.admin), 'maintenanceRequests', a)));
  });
});

describe('visibility', () => {
  it('staff see only their own requests; supervisors see all', async () => {
    const mine = await createRequestAs(env, USERS.staff);
    const theirs = await createRequestAs(env, USERS.staff2);

    const staffDb = dbFor(env, USERS.staff);
    await assertSucceeds(getDoc(doc(staffDb, 'maintenanceRequests', mine)));
    await assertFails(getDoc(doc(staffDb, 'maintenanceRequests', theirs)));
    await assertSucceeds(
      getDocs(query(collection(staffDb, 'maintenanceRequests'), where('submittedBy.uid', '==', USERS.staff.uid))),
    );
    await assertFails(getDocs(collection(staffDb, 'maintenanceRequests')));

    await assertSucceeds(getDocs(collection(dbFor(env, USERS.sup), 'maintenanceRequests')));
  });
});

describe('request creation', () => {
  it('rejects the removed spa category', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(createBatch(db, USERS.staff, { category: 'spa' }).batch.commit());
  });

  it('accepts jacuzzi and fauna_nociva', async () => {
    const db = dbFor(env, USERS.staff);
    await assertSucceeds(createBatch(db, USERS.staff, { category: 'jacuzzi' }).batch.commit());
    await assertSucceeds(createBatch(db, USERS.staff, { category: 'fauna_nociva' }).batch.commit());
  });

  it('requires a sublocation only for common areas', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(createBatch(db, USERS.staff, { category: 'common_areas' }).batch.commit());
    await assertSucceeds(
      createBatch(db, USERS.staff, { category: 'common_areas', commonAreaSubLocation: 'parking' }).batch.commit(),
    );
  });

  it('rejects a facility classified as a villa', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(
      createBatch(db, USERS.staff, { location: { code: 'gym', name: 'Gym', type: 'villa' } }).batch.commit(),
    );
  });

  it('rejects a client-supplied submission time', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(createBatch(db, USERS.staff, { createdAt: new Date('2026-01-01') }).batch.commit());
  });

  it('rejects client-written ticketId or kpi on create', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(createBatch(db, USERS.staff, { ticketId: 'KLM-2026-0001' }).batch.commit());
    await assertFails(createBatch(db, USERS.staff, { kpi: { workMs: 1 } }).batch.commit());
  });

  it('rejects a non-initial status on create', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(createBatch(db, USERS.staff, { status: 'completada' }).batch.commit());
  });

  it('accepts a request without locationDetail (no longer collected) and rich-text notes up to 10000 chars', async () => {
    const db = dbFor(env, USERS.staff);
    const { locationDetail: _omitted, ...withoutDetail } = baseRequest(USERS.staff);
    const reqRef = doc(collection(db, 'maintenanceRequests'));
    const auditRef = doc(collection(db, 'maintenanceRequests', reqRef.id, 'audit'));
    const batch = writeBatch(db);
    batch.set(reqRef, { ...withoutDetail, notes: `<div>${'x'.repeat(9980)}</div>`, lastAuditId: auditRef.id });
    batch.set(auditRef, { action: 'created', at: serverTimestamp(), by: meWithRole(USERS.staff), details: 'created' });
    await assertSucceeds(batch.commit());
  });

  it('still validates locationDetail when present, and caps notes at 10000 chars', async () => {
    const db = dbFor(env, USERS.staff);
    await assertFails(createBatch(db, USERS.staff, { locationDetail: '' }).batch.commit());
    await assertFails(createBatch(db, USERS.staff, { notes: 'x'.repeat(10001) }).batch.commit());
  });

  it('accepts the new facilities and rejects unknown ones', async () => {
    const db = dbFor(env, USERS.staff);
    for (const [code, name] of [['warehouse_office', 'Warehouse Office'], ['kitchen', 'Kitchen'], ['bodega', 'Storeroom']]) {
      await assertSucceeds(
        createBatch(db, USERS.staff, { location: { code, name, type: 'facility' } }).batch.commit(),
      );
    }
    await assertFails(
      createBatch(db, USERS.staff, { location: { code: 'spa', name: 'Spa', type: 'facility' } }).batch.commit(),
    );
  });

  it('rejects a create without its paired audit entry', async () => {
    const db = dbFor(env, USERS.staff);
    const { reqRef } = createBatch(db, USERS.staff);
    await assertFails(setDoc(reqRef, { ...baseRequest(USERS.staff), lastAuditId: 'missing' }));
  });
});

describe('lifecycle transitions', () => {
  it('lets a supervisor run the full lifecycle with pause/resume', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.sup);
    await assertSucceeds(
      statusBatch(db, USERS.sup, id, 'sin_revisar', 'pendiente', firstResponseFields(USERS.sup)).batch.commit(),
    );
    await assertSucceeds(statusBatch(db, USERS.sup, id, 'pendiente', 'reconocida').batch.commit());
    await assertSucceeds(statusBatch(db, USERS.sup, id, 'reconocida', 'pendiente').batch.commit());
    await assertSucceeds(statusBatch(db, USERS.sup, id, 'pendiente', 'reconocida').batch.commit());
    await assertSucceeds(
      statusBatch(db, USERS.sup, id, 'reconocida', 'completada', {
        completedAt: serverTimestamp(),
        completedBy: me(USERS.sup),
        supervisorNotes: 'Replaced cartridge',
      }).batch.commit(),
    );
  });

  it('auto-assigns the first handling supervisor', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.sup);
    await assertFails(
      statusBatch(db, USERS.sup, id, 'sin_revisar', 'reconocida', {
        firstResponseAt: serverTimestamp(),
        firstResponseBy: me(USERS.sup),
        assignedTo: { email: USERS.sup2.email, name: USERS.sup2.displayName },
      }).batch.commit(),
    );
    await assertFails(
      statusBatch(db, USERS.sup, id, 'sin_revisar', 'reconocida', firstResponseFields(USERS.sup, false)).batch.commit(),
    );
    await toReconocida(id);
  });

  it('rejects staff state changes, even on their own request', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.staff);
    await assertFails(
      statusBatch(db, USERS.staff, id, 'sin_revisar', 'reconocida', firstResponseFields(USERS.staff)).batch.commit(),
    );
  });

  it('rejects skipping work (sin_revisar or pendiente -> completada)', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.sup);
    const completion = {
      completedAt: serverTimestamp(),
      completedBy: me(USERS.sup),
      supervisorNotes: 'done',
    };
    await assertFails(
      statusBatch(db, USERS.sup, id, 'sin_revisar', 'completada', {
        ...firstResponseFields(USERS.sup),
        ...completion,
      }).batch.commit(),
    );
    await assertSucceeds(
      statusBatch(db, USERS.sup, id, 'sin_revisar', 'pendiente', firstResponseFields(USERS.sup)).batch.commit(),
    );
    await assertFails(statusBatch(db, USERS.sup, id, 'pendiente', 'completada', completion).batch.commit());
  });

  it('requires a reason when moving to pendiente', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.sup);
    const noReason = (details: string) =>
      updateBatch(
        db,
        USERS.sup,
        id,
        { status: 'pendiente', statusChangedAt: serverTimestamp(), statusChangedBy: me(USERS.sup), ...firstResponseFields(USERS.sup) },
        { action: 'status_changed', fromStatus: 'sin_revisar', toStatus: 'pendiente', details },
      ).batch.commit();
    await assertFails(noReason(''));
    await assertFails(noReason('   '));
    await assertSucceeds(noReason('Waiting for the replacement pump'));
  });

  it('requires a completion note', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await toReconocida(id);
    const db = dbFor(env, USERS.sup);
    await assertFails(
      statusBatch(db, USERS.sup, id, 'reconocida', 'completada', {
        completedAt: serverTimestamp(),
        completedBy: me(USERS.sup),
        supervisorNotes: '',
      }).batch.commit(),
    );
  });

  it('treats completada as final', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await toReconocida(id);
    const db = dbFor(env, USERS.sup);
    await assertSucceeds(
      statusBatch(db, USERS.sup, id, 'reconocida', 'completada', {
        completedAt: serverTimestamp(),
        completedBy: me(USERS.sup),
        supervisorNotes: 'done',
      }).batch.commit(),
    );
    await assertFails(statusBatch(db, USERS.sup, id, 'completada', 'reconocida').batch.commit());
    await assertFails(
      updateBatch(db, USERS.sup, id, { supervisorNotes: 'edit' }, { action: 'note_added' }).batch.commit(),
    );
    await assertFails(
      statusBatch(dbFor(env, USERS.admin), USERS.admin, id, 'completada', 'pendiente').batch.commit(),
    );
  });

  it('rejects a forged transition timestamp', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.sup);
    await assertFails(
      statusBatch(db, USERS.sup, id, 'sin_revisar', 'pendiente', {
        ...firstResponseFields(USERS.sup),
        statusChangedAt: new Date('2026-01-01'),
      }).batch.commit(),
    );
    await assertFails(
      statusBatch(db, USERS.sup, id, 'sin_revisar', 'pendiente', {
        ...firstResponseFields(USERS.sup),
        firstResponseAt: new Date('2026-01-01'),
      }).batch.commit(),
    );
  });

  it('rejects a status change whose audit entry does not match', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.sup);
    const mismatched = updateBatch(
      db,
      USERS.sup,
      id,
      {
        status: 'pendiente',
        statusChangedAt: serverTimestamp(),
        statusChangedBy: me(USERS.sup),
        ...firstResponseFields(USERS.sup),
      },
      { action: 'status_changed', fromStatus: 'sin_revisar', toStatus: 'reconocida' },
    );
    await assertFails(mismatched.batch.commit());
  });

  it('rejects client writes to kpi and ticketId, including by admins', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.admin);
    await assertFails(
      updateBatch(db, USERS.admin, id, { kpi: { workMs: 999 } }, { action: 'note_added' }).batch.commit(),
    );
    await assertFails(
      updateBatch(db, USERS.admin, id, { ticketId: 'KLM-2026-9999' }, { action: 'note_added' }).batch.commit(),
    );
  });
});

describe('priority edits', () => {
  const priorityBatch = (u: TestUser, id: string, priority: string, action = 'priority_changed') =>
    updateBatch(dbFor(env, u), u, id, { priority }, { action, details: `high → ${priority}` }).batch.commit();

  it('lets a supervisor or admin change the priority of an open request', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await assertSucceeds(priorityBatch(USERS.sup, id, 'normal'));
    await assertSucceeds(priorityBatch(USERS.admin, id, 'urgent'));
  });

  it('rejects priority edits by staff, invalid values, mislabeled audits and completed requests', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await assertFails(priorityBatch(USERS.staff, id, 'low'));
    await assertFails(priorityBatch(USERS.sup, id, 'critical'));
    await assertFails(priorityBatch(USERS.sup, id, 'low', 'note_added'));

    await toReconocida(id);
    const db = dbFor(env, USERS.sup);
    await assertSucceeds(
      statusBatch(db, USERS.sup, id, 'reconocida', 'completada', {
        completedAt: serverTimestamp(),
        completedBy: me(USERS.sup),
        supervisorNotes: 'Fixed',
      }).batch.commit(),
    );
    await assertFails(priorityBatch(USERS.sup, id, 'low'));
  });
});

describe('supervisor edits', () => {
  it('reassigns to an active supervisor', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await toReconocida(id);
    const db = dbFor(env, USERS.admin);
    await assertSucceeds(
      updateBatch(
        db,
        USERS.admin,
        id,
        { assignedTo: { email: USERS.sup2.email, name: USERS.sup2.displayName } },
        { action: 'reassigned' },
      ).batch.commit(),
    );
  });

  it('rejects reassignment to staff or inactive users', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await toReconocida(id);
    const db = dbFor(env, USERS.sup);
    await assertFails(
      updateBatch(
        db,
        USERS.sup,
        id,
        { assignedTo: { email: USERS.staff2.email, name: USERS.staff2.displayName } },
        { action: 'reassigned' },
      ).batch.commit(),
    );
    await assertFails(
      updateBatch(
        db,
        USERS.sup,
        id,
        { assignedTo: { email: USERS.inactive.email, name: USERS.inactive.displayName } },
        { action: 'reassigned' },
      ).batch.commit(),
    );
  });
});

describe('staff edits', () => {
  it('lets the submitter edit notes while sin_revisar only', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.staff);
    await assertSucceeds(
      updateBatch(db, USERS.staff, id, { notes: 'More detail' }, { action: 'note_added' }).batch.commit(),
    );
    await assertSucceeds(
      statusBatch(dbFor(env, USERS.sup), USERS.sup, id, 'sin_revisar', 'pendiente', firstResponseFields(USERS.sup))
        .batch.commit(),
    );
    await assertFails(
      updateBatch(db, USERS.staff, id, { notes: 'Too late' }, { action: 'note_added' }).batch.commit(),
    );
  });

  it('rejects staff edits to supervisor-only fields', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.staff);
    await assertFails(
      updateBatch(db, USERS.staff, id, { supervisorNotes: 'x' }, { action: 'note_added' }).batch.commit(),
    );
    await assertFails(
      updateBatch(
        db,
        USERS.staff,
        id,
        { assignedTo: { email: USERS.sup.email, name: USERS.sup.displayName } },
        { action: 'reassigned' },
      ).batch.commit(),
    );
  });

  it('rejects edits by another staff member', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.staff2);
    await assertFails(
      updateBatch(db, USERS.staff2, id, { notes: 'hijack' }, { action: 'note_added' }).batch.commit(),
    );
  });
});

describe('audit history', () => {
  it('is readable by the submitter and supervisors, never editable', async () => {
    const db = dbFor(env, USERS.staff);
    const { batch, reqRef, auditRef } = createBatch(db, USERS.staff);
    await batch.commit();

    await assertSucceeds(getDocs(collection(db, 'maintenanceRequests', reqRef.id, 'audit')));
    await assertSucceeds(getDocs(collection(dbFor(env, USERS.sup), 'maintenanceRequests', reqRef.id, 'audit')));
    await assertFails(getDocs(collection(dbFor(env, USERS.staff2), 'maintenanceRequests', reqRef.id, 'audit')));

    await assertFails(updateDoc(doc(db, auditRef.path), { details: 'tampered' }));
    await assertFails(updateDoc(doc(dbFor(env, USERS.admin), auditRef.path), { details: 'tampered' }));
    await assertFails(deleteDoc(doc(dbFor(env, USERS.admin), auditRef.path)));
  });

  it('rejects a standalone audit entry not paired with a request change', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const db = dbFor(env, USERS.sup);
    await assertFails(
      setDoc(doc(collection(db, 'maintenanceRequests', id, 'audit')), {
        action: 'note_added',
        at: serverTimestamp(),
        by: { ...me(USERS.sup), role: 'supervisor' },
        details: 'spam',
      }),
    );
  });
});

describe('counters', () => {
  it('are not client-accessible', async () => {
    const db = dbFor(env, USERS.admin);
    await assertFails(getDoc(doc(db, 'counters', 'ticket-2026')));
    await assertFails(setDoc(doc(db, 'counters', 'ticket-2026'), { next: 1 }));
  });
});
