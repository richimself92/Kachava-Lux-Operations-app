import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { isCompanyEmail, ROLES } from '../../shared/domain';
import type { AppUser, Role } from '../types';
import { db } from './firebase';

export function toDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toAppUser(id: string, d: DocumentData): AppUser {
  return {
    email: id,
    displayName: String(d.displayName ?? id),
    role: (ROLES as readonly string[]).includes(d.role) ? (d.role as Role) : 'staff',
    title: String(d.title ?? ''),
    phone: d.phone,
    active: d.active === true,
    uid: d.uid,
    lastSignInAt: toDate(d.lastSignInAt),
    createdAt: toDate(d.createdAt),
  };
}

/** Live subscription to one allowlist entry; `null` when it does not exist. */
export function subscribeUser(
  email: string,
  onUser: (u: AppUser | null) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db(), 'users', normalizeEmail(email)),
    (snap) => onUser(snap.exists() ? toAppUser(snap.id, snap.data()) : null),
    onError,
  );
}

/** Live list of all approved users (supervisors and admins only, per rules). */
export function subscribeUsers(onUsers: (u: AppUser[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db(), 'users'), orderBy('displayName')),
    (snap) => onUsers(snap.docs.map((d) => toAppUser(d.id, d.data()))),
    onError,
  );
}

/** Records the caller's auth uid and sign-in time on their own allowlist entry. */
export async function recordSignIn(email: string, uid: string): Promise<void> {
  await updateDoc(doc(db(), 'users', normalizeEmail(email)), { uid, lastSignInAt: serverTimestamp() });
}

export interface NewUserInput {
  email: string;
  displayName: string;
  role: Role;
  title: string;
}

export class UserExistsError extends Error {}
export class InvalidEmailError extends Error {}

/** Admin: adds an approved user. */
export async function addUser(input: NewUserInput): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!isCompanyEmail(email)) throw new InvalidEmailError(email);
  const ref = doc(db(), 'users', email);
  if ((await getDoc(ref)).exists()) throw new UserExistsError(email);
  await setDoc(ref, {
    email,
    displayName: input.displayName.trim(),
    role: input.role,
    title: input.title.trim(),
    active: true,
    createdAt: serverTimestamp(),
  });
}

/** Admin: changes role, title, name, or active flag. */
export async function updateUser(
  email: string,
  patch: Partial<Pick<AppUser, 'displayName' | 'role' | 'title' | 'active'>>,
): Promise<void> {
  await updateDoc(doc(db(), 'users', normalizeEmail(email)), { ...patch, updatedAt: serverTimestamp() });
}
