import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes, deleteObject, type FirebaseStorage } from 'firebase/storage';
import {
  createRequestAs,
  ctxFor,
  dbFor,
  firstResponseFields,
  seedUsers,
  setupEnv,
  statusBatch,
  UNLISTED,
  USERS,
  type TestUser,
} from './helpers';

let env: RulesTestEnvironment;

const storageFor = (u: TestUser) => ctxFor(env, u).storage() as unknown as FirebaseStorage;

const bytes = (n: number) => new Uint8Array(n);
const JPEG = { contentType: 'image/jpeg' };
const MB = 1024 * 1024;

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

const photoPath = (reqId: string, kind: 'before' | 'after', name = 'p1.jpg') =>
  `maintenanceRequests/${reqId}/${kind}/${name}`;

describe('storage rules', () => {
  it('lets the submitter upload a valid before photo while sin_revisar', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await assertSucceeds(uploadBytes(ref(storageFor(USERS.staff), photoPath(id, 'before')), bytes(1024), JPEG));
  });

  it('rejects a photo over 5 MB', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await assertFails(
      uploadBytes(ref(storageFor(USERS.staff), photoPath(id, 'before')), bytes(6 * MB), JPEG),
    );
  });

  it('rejects non-image types (PDF, HEIC)', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const s = storageFor(USERS.staff);
    await assertFails(uploadBytes(ref(s, photoPath(id, 'before', 'a.pdf')), bytes(10), { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(s, photoPath(id, 'before', 'a.heic')), bytes(10), { contentType: 'image/heic' }));
  });

  it('accepts png and webp', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const s = storageFor(USERS.staff);
    await assertSucceeds(uploadBytes(ref(s, photoPath(id, 'before', 'a.png')), bytes(10), { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(ref(s, photoPath(id, 'before', 'a.webp')), bytes(10), { contentType: 'image/webp' }));
  });

  it('denies reads by another staff member and by unlisted users', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await assertSucceeds(uploadBytes(ref(storageFor(USERS.staff), photoPath(id, 'before')), bytes(10), JPEG));

    await assertSucceeds(getBytes(ref(storageFor(USERS.staff), photoPath(id, 'before'))));
    await assertSucceeds(getBytes(ref(storageFor(USERS.sup), photoPath(id, 'before'))));
    await assertFails(getBytes(ref(storageFor(USERS.staff2), photoPath(id, 'before'))));
    await assertFails(getBytes(ref(storageFor(UNLISTED), photoPath(id, 'before'))));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage() as unknown as FirebaseStorage, photoPath(id, 'before'))));
  });

  it('denies before photos once the request left sin_revisar', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await assertSucceeds(
      statusBatch(dbFor(env, USERS.sup), USERS.sup, id, 'sin_revisar', 'pendiente', firstResponseFields(USERS.sup))
        .batch.commit(),
    );
    await assertFails(uploadBytes(ref(storageFor(USERS.staff), photoPath(id, 'before', 'late.jpg')), bytes(10), JPEG));
  });

  it('allows after photos only for supervisors', async () => {
    const id = await createRequestAs(env, USERS.staff);
    await assertFails(uploadBytes(ref(storageFor(USERS.staff), photoPath(id, 'after')), bytes(10), JPEG));
    await assertSucceeds(uploadBytes(ref(storageFor(USERS.sup), photoPath(id, 'after')), bytes(10), JPEG));
  });

  it('makes evidence immutable (no overwrite or delete)', async () => {
    const id = await createRequestAs(env, USERS.staff);
    const s = storageFor(USERS.staff);
    await assertSucceeds(uploadBytes(ref(s, photoPath(id, 'before')), bytes(10), JPEG));
    await assertFails(uploadBytes(ref(s, photoPath(id, 'before')), bytes(20), JPEG));
    await assertFails(deleteObject(ref(storageFor(USERS.admin), photoPath(id, 'before'))));
  });

  it('denies uploads for a request that does not exist', async () => {
    await assertFails(uploadBytes(ref(storageFor(USERS.sup), photoPath('nope', 'after')), bytes(10), JPEG));
  });
});
