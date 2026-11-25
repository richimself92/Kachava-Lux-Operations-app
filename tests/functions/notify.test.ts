/**
 * New-request push notifications: recipient rule and sending, against the Firestore emulator
 * with an injected fake FCM sender. Runs inside `npm run test:functions`.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { notificationRecipients, sendNewRequestPush, type PushSender } from '../../functions/src/notify';

const requireFromFunctions = createRequire(resolve(__dirname, '../../functions/package.json'));
const { deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore') as typeof import('firebase-admin/firestore');

const PROJECT_ID = 'demo-kachava';
let app: App;
let db: Firestore;

/** Seeding requests here must not fire the real creation trigger (see translate.test.ts). */
async function setBackgroundTriggers(enabled: boolean) {
  const hub = process.env.FIREBASE_EMULATOR_HUB;
  if (!hub) return;
  const path = enabled ? 'enableBackgroundTriggers' : 'disableBackgroundTriggers';
  const res = await fetch(`http://${hub}/functions/${path}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Could not ${path}: ${res.status}`);
}

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run via npm run test:functions (needs emulators).');
  await setBackgroundTriggers(false);
  app = initializeApp({ projectId: PROJECT_ID }, 'notify-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await clearFirestore();
  await setBackgroundTriggers(true);
  await deleteApp(app);
});

beforeEach(clearFirestore);

const user = (title: string, active = true, role = 'supervisor') => ({ displayName: 'X', role, title, active });

async function seed(assignee = 'randel@kachavalux.com', submitter = 'bianca@kachavalux.com') {
  await Promise.all([
    db.doc('users/randel@kachavalux.com').set(user('maintenance_manager')),
    db.doc('users/old.mm@kachavalux.com').set(user('Maintenance Manager', false)),
    db.doc('users/carla.r@kachavalux.com').set(user('administrative_manager')),
    db.doc('users/eduardo@kachavalux.com').set(user('general_manager')),
    db.doc('users/bianca@kachavalux.com').set(user('revenue_manager', true, 'staff')),
    db.doc('maintenanceRequests/r1').set({
      ticketId: 'KLM-2026-0007',
      location: { code: '102', name: 'Villa 102', type: 'villa' },
      submittedBy: { uid: 'u1', email: submitter, name: 'Someone' },
      ...(assignee ? { assignedTo: { email: assignee, name: 'Assignee' } } : {}),
    }),
  ]);
}

function fakeSender(deadTokens: string[] = []) {
  const calls: MulticastMessage[] = [];
  const sender: PushSender = {
    async sendEachForMulticast(m) {
      calls.push(m);
      const responses = m.tokens.map((t) =>
        deadTokens.includes(t)
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true, messageId: `id-${t}` },
      );
      const ok = responses.filter((r) => r.success).length;
      return { responses, successCount: ok, failureCount: responses.length - ok } as unknown as BatchResponse;
    },
  };
  return { sender, calls };
}

describe('notificationRecipients', () => {
  it('is the active Maintenance Manager when they are also the assignee', async () => {
    await seed();
    expect(await notificationRecipients(db, await db.doc('maintenanceRequests/r1').get())).toEqual([
      'randel@kachavalux.com',
    ]);
  });

  it('adds a different assignee, and ignores inactive users', async () => {
    await seed('carla.r@kachavalux.com');
    expect(await notificationRecipients(db, await db.doc('maintenanceRequests/r1').get())).toEqual([
      'carla.r@kachavalux.com',
      'randel@kachavalux.com',
    ]);
    await db.doc('users/carla.r@kachavalux.com').update({ active: false });
    expect(await notificationRecipients(db, await db.doc('maintenanceRequests/r1').get())).toEqual([
      'randel@kachavalux.com',
    ]);
  });

  it('never notifies the submitter of their own request', async () => {
    await seed('carla.r@kachavalux.com', 'randel@kachavalux.com');
    expect(await notificationRecipients(db, await db.doc('maintenanceRequests/r1').get())).toEqual([
      'carla.r@kachavalux.com',
    ]);
  });
});

describe('sendNewRequestPush', () => {
  it('sends one message per language to the recipients only and removes dead tokens', async () => {
    await seed('carla.r@kachavalux.com');
    await Promise.all([
      db.doc('users/randel@kachavalux.com/pushTokens/a').set({ token: 'tok-es', language: 'es' }),
      db.doc('users/randel@kachavalux.com/pushTokens/b').set({ token: 'tok-dead', language: 'es' }),
      db.doc('users/carla.r@kachavalux.com/pushTokens/c').set({ token: 'tok-en', language: 'en' }),
      db.doc('users/eduardo@kachavalux.com/pushTokens/d').set({ token: 'tok-other', language: 'es' }),
    ]);
    const { sender, calls } = fakeSender(['tok-dead']);
    const res = await sendNewRequestPush(db, sender, 'r1');

    expect(calls).toHaveLength(2);
    const es = calls.find((c) => c.notification?.title === 'Nueva orden de mantenimiento');
    const en = calls.find((c) => c.notification?.title === 'New work order');
    expect(es?.tokens.sort()).toEqual(['tok-dead', 'tok-es']);
    expect(en?.tokens).toEqual(['tok-en']);
    expect(es?.notification?.body).toBe('KLM-2026-0007 · Villa 102');
    expect(es?.webpush?.fcmOptions?.link).toBe('/?request=r1');
    expect(res).toMatchObject({ sent: 2, failed: 1, removedTokens: 1 });
    expect((await db.doc('users/randel@kachavalux.com/pushTokens/b').get()).exists).toBe(false);
    expect((await db.doc('users/randel@kachavalux.com/pushTokens/a').get()).exists).toBe(true);
  });

  it('sends nothing when no recipient has a registered device', async () => {
    await seed();
    const { sender, calls } = fakeSender();
    expect(await sendNewRequestPush(db, sender, 'r1')).toMatchObject({ sent: 0, recipients: ['randel@kachavalux.com'] });
    expect(calls).toHaveLength(0);
  });
});
