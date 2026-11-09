/**
 * Photo uploads per role, through the real client paths (src/services/requests.ts)
 * against the emulator's Firestore and Storage rules.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { getBytes, getMetadata, ref, type FirebaseStorage } from 'firebase/storage';
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_KIND } from '../../shared/domain';
import { preparePhoto } from '../../src/lib/photoPrep';
import {
  attachPhotos,
  changeStatus,
  createRequestDoc,
  toRequest,
  uploadPhotos,
  type Actor,
} from '../../src/services/requests';
import type { MaintenanceRequest, PhotoKind } from '../../src/types';
import { ctxFor, dbFor, seedUsers, setupEnv, UNLISTED, USERS, type TestUser } from './helpers';

let env: RulesTestEnvironment;

const actor = (u: TestUser): Actor => ({ uid: u.uid, email: u.email, name: u.displayName, role: u.role });
const storageFor = (u: TestUser, provider?: string) => ctxFor(env, u, provider).storage() as unknown as FirebaseStorage;
const jpeg = (name: string, size = 1024) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

const input = {
  locationCode: '104',
  category: 'jacuzzi' as const,
  priority: 'urgent' as const,
  locationDetail: 'Terrace jacuzzi',
  notes: 'Heater not working',
};

async function load(db: Firestore, id: string): Promise<MaintenanceRequest> {
  const snap = await getDoc(doc(db, 'maintenanceRequests', id));
  return toRequest(snap.id, snap.data()!);
}

const createAs = (u: TestUser) => createRequestDoc(dbFor(env, u), actor(u), input);

async function expectUploadDenied(u: TestUser, id: string, kind: PhotoKind, storage = storageFor(u)) {
  const file = jpeg('denied.jpg');
  await expect(uploadPhotos(storage, actor(u), id, kind, [file])).resolves.toEqual({ uploaded: [], failed: [file.name] });
}

/** Acknowledges the request so it can be completed. */
async function acknowledge(u: TestUser, id: string) {
  const db = dbFor(env, u);
  await changeStatus(db, actor(u), await load(db, id), 'reconocida');
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

describe.each([
  ['staff', USERS.staff],
  ['supervisor', USERS.sup],
  ['admin', USERS.admin],
] as const)('before photos as %s', (_role, user) => {
  it('uploads, attaches and reads back photos on their own request', async () => {
    const db = dbFor(env, user);
    const id = await createAs(user);

    const { uploaded, failed } = await uploadPhotos(storageFor(user), actor(user), id, 'before', [jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(failed).toEqual([]);
    await attachPhotos(db, actor(user), await load(db, id), 'before', uploaded);

    const req = await load(db, id);
    expect(req.beforePhotos.map((p) => p.fileName)).toEqual(['a.jpg', 'b.jpg']);
    expect(req.beforePhotos[0].uploadedBy?.uid).toBe(user.uid);
    const stored = await getBytes(ref(storageFor(user), uploaded[0].path));
    expect(stored.byteLength).toBe(1024);
  });

  it('accepts a phone photo reported with no content type once prepared', async () => {
    const id = await createAs(user);
    const prepared = await preparePhoto(new File([new Uint8Array(1024)], 'camera.jpg', { type: '' }));

    const { uploaded, failed } = await uploadPhotos(storageFor(user), actor(user), id, 'before', [prepared]);

    expect(failed).toEqual([]);
    const metadata = await getMetadata(ref(storageFor(user), uploaded[0].path));
    expect(metadata.contentType).toBe('image/jpeg');
  });

  it('accepts a photo at exactly the size limit and refuses one byte more', async () => {
    const id = await createAs(user);
    const atLimit = jpeg('limit.jpg', MAX_PHOTO_BYTES);
    const overLimit = jpeg('over.jpg', MAX_PHOTO_BYTES + 1);

    const result = await uploadPhotos(storageFor(user), actor(user), id, 'before', [atLimit, overLimit]);

    expect(result.uploaded.map((p) => p.fileName)).toEqual(['limit.jpg']);
    expect(result.failed).toEqual(['over.jpg']);
  });

  it('cannot add before photos to a request submitted by someone else', async () => {
    const id = await createAs(USERS.staff2);
    await expectUploadDenied(user, id, 'before');
  });
});

describe.each([
  ['supervisor', USERS.sup],
  ['admin', USERS.admin],
] as const)('after photos as %s', (_role, user) => {
  it('completes a staff request with after photos', async () => {
    const db = dbFor(env, user);
    const id = await createAs(USERS.staff);
    await acknowledge(user, id);

    const { uploaded, failed } = await uploadPhotos(storageFor(user), actor(user), id, 'after', [jpeg('fixed.jpg')]);
    expect(failed).toEqual([]);
    await changeStatus(db, actor(user), await load(db, id), 'completada', {
      resolutionNotes: 'Replaced heater relay',
      afterPhotos: uploaded,
    });

    const req = await load(db, id);
    expect(req.status).toBe('completada');
    expect(req.afterPhotos.map((p) => p.fileName)).toEqual(['fixed.jpg']);
    const stored = await getBytes(ref(storageFor(user), uploaded[0].path));
    expect(stored.byteLength).toBe(1024);
  });

  it('adds after photos to an open request without changing its status', async () => {
    const db = dbFor(env, user);
    const id = await createAs(USERS.staff);

    const { uploaded, failed } = await uploadPhotos(storageFor(user), actor(user), id, 'after', [jpeg('progress.jpg')]);
    expect(failed).toEqual([]);
    await attachPhotos(db, actor(user), await load(db, id), 'after', uploaded);

    const req = await load(db, id);
    expect(req.status).toBe('sin_revisar');
    expect(req.afterPhotos).toHaveLength(1);
  });

  it('cannot upload after photos once the request is completed', async () => {
    const db = dbFor(env, user);
    const id = await createAs(USERS.staff);
    await acknowledge(user, id);
    await changeStatus(db, actor(user), await load(db, id), 'completada', { resolutionNotes: 'Done' });

    await expectUploadDenied(user, id, 'after');
  });
});

describe('photo upload denials', () => {
  it('refuses after photos from staff, even on their own request', async () => {
    const id = await createAs(USERS.staff);
    await expectUploadDenied(USERS.staff, id, 'after');
  });

  it('refuses before photos once the request has left sin_revisar', async () => {
    const id = await createAs(USERS.staff);
    await acknowledge(USERS.sup, id);
    await expectUploadDenied(USERS.staff, id, 'before');
  });

  it('refuses a submitter who has since been deactivated', async () => {
    const id = await createAs(USERS.staff);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'users', USERS.staff.email), { active: false });
    });
    await expectUploadDenied(USERS.staff, id, 'before');
  });

  it('refuses users who are not on the allowlist', async () => {
    const id = await createAs(USERS.staff);
    await expectUploadDenied(UNLISTED, id, 'before');
    await expectUploadDenied(UNLISTED, id, 'after');
  });

  it('refuses sign-ins that are not Microsoft', async () => {
    const id = await createAs(USERS.sup);
    await expectUploadDenied(USERS.sup, id, 'after', storageFor(USERS.sup, 'password'));
  });

  it('refuses attaching more photos than the per-request limit', async () => {
    const db = dbFor(env, USERS.staff);
    const id = await createAs(USERS.staff);
    const files = Array.from({ length: MAX_PHOTOS_PER_KIND + 1 }, (_, i) => jpeg(`p${i}.jpg`));
    const { uploaded } = await uploadPhotos(storageFor(USERS.staff), actor(USERS.staff), id, 'before', files);

    await assertFails(attachPhotos(db, actor(USERS.staff), await load(db, id), 'before', uploaded));
  });
});
