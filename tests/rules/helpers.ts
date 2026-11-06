import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

export const PROJECT_ID = 'demo-kachava';

export interface TestUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'staff' | 'supervisor' | 'admin';
  active: boolean;
}

export const USERS = {
  admin: { uid: 'u-matt', email: 'matt@kachavalux.com', displayName: 'Matt Houston', role: 'admin', active: true },
  sup: { uid: 'u-randel', email: 'randel@kachavalux.com', displayName: 'Randel Can Chuc', role: 'supervisor', active: true },
  sup2: { uid: 'u-carla', email: 'carla.r@kachavalux.com', displayName: 'Carla Reina', role: 'supervisor', active: true },
  staff: { uid: 'u-bianca', email: 'bianca@kachavalux.com', displayName: 'Bianca Velásquez', role: 'staff', active: true },
  staff2: { uid: 'u-dina', email: 'dina@kachavalux.com', displayName: 'Dina Dominguez', role: 'staff', active: true },
  inactive: { uid: 'u-old', email: 'old@kachavalux.com', displayName: 'Former Staff', role: 'staff', active: false },
} satisfies Record<string, TestUser>;

/** A tenant user with no allowlist entry. */
export const UNLISTED: TestUser = {
  uid: 'u-ghost',
  email: 'ghost@kachavalux.com',
  displayName: 'Ghost',
  role: 'staff',
  active: true,
};

export async function setupEnv(withStorage = false): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
    ...(withStorage ? { storage: { rules: readFileSync(resolve('storage.rules'), 'utf8') } } : {}),
  });
}

export async function seedUsers(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    for (const u of Object.values(USERS)) {
      await setDoc(doc(db, 'users', u.email), {
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        title: 'Test',
        active: u.active,
        createdAt: Timestamp.now(),
      });
    }
  });
}

export function ctxFor(
  env: RulesTestEnvironment,
  u: TestUser,
  provider = 'microsoft.com',
): RulesTestContext {
  return env.authenticatedContext(u.uid, {
    email: u.email,
    name: u.displayName,
    firebase: { sign_in_provider: provider, identities: {} },
  } as never);
}

export function dbFor(env: RulesTestEnvironment, u: TestUser, provider?: string): Firestore {
  return ctxFor(env, u, provider).firestore() as unknown as Firestore;
}

export const me = (u: TestUser) => ({ uid: u.uid, email: u.email, name: u.displayName });
export const meWithRole = (u: TestUser) => ({ ...me(u), role: u.role });

export function baseRequest(u: TestUser) {
  return {
    location: { code: '102', name: 'Villa 102', type: 'villa' },
    category: 'plumbing',
    priority: 'high',
    locationDetail: 'Master bathroom',
    notes: 'Leaking faucet',
    status: 'sin_revisar',
    submittedBy: me(u),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    statusChangedAt: serverTimestamp(),
    beforePhotos: [],
    afterPhotos: [],
  };
}

/** Builds the create batch (request + paired 'created' audit entry). */
export function createBatch(db: Firestore, u: TestUser, overrides: Record<string, unknown> = {}) {
  const reqRef = doc(collection(db, 'maintenanceRequests'));
  const auditRef = doc(collection(db, 'maintenanceRequests', reqRef.id, 'audit'));
  const batch = writeBatch(db);
  batch.set(reqRef, { ...baseRequest(u), lastAuditId: auditRef.id, ...overrides });
  batch.set(auditRef, { action: 'created', at: serverTimestamp(), by: meWithRole(u), details: 'created' });
  return { batch, reqRef, auditRef };
}

/** Builds an update batch with its paired audit entry. */
export function updateBatch(
  db: Firestore,
  u: TestUser,
  reqId: string,
  changes: Record<string, unknown>,
  audit: Record<string, unknown>,
) {
  const reqRef = doc(db, 'maintenanceRequests', reqId) as DocumentReference;
  const auditRef = doc(collection(db, 'maintenanceRequests', reqId, 'audit'));
  const batch = writeBatch(db);
  batch.update(reqRef, { ...changes, updatedAt: serverTimestamp(), lastAuditId: auditRef.id });
  batch.set(auditRef, { at: serverTimestamp(), by: meWithRole(u), details: 'x', ...audit });
  return { batch, reqRef, auditRef };
}

/** Status change batch, with first-response / auto-assign fields as the app writes them. */
export function statusBatch(
  db: Firestore,
  u: TestUser,
  reqId: string,
  from: string,
  to: string,
  extra: Record<string, unknown> = {},
) {
  const changes: Record<string, unknown> = {
    status: to,
    statusChangedAt: serverTimestamp(),
    statusChangedBy: me(u),
    ...extra,
  };
  return updateBatch(db, u, reqId, changes, { action: 'status_changed', fromStatus: from, toStatus: to });
}

/** Creates a request as `u` and returns its id. */
export async function createRequestAs(env: RulesTestEnvironment, u: TestUser, overrides = {}) {
  const db = dbFor(env, u);
  const { batch, reqRef } = createBatch(db, u, overrides);
  await batch.commit();
  return reqRef.id;
}

export function firstResponseFields(u: TestUser, assign = true) {
  return {
    firstResponseAt: serverTimestamp(),
    firstResponseBy: me(u),
    ...(assign ? { assignedTo: { email: u.email, name: u.displayName } } : {}),
  };
}
