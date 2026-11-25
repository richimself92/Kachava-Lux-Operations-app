import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { toJobTitle } from '../../shared/domain';

/** The part of firebase-admin Messaging this module uses (injectable for tests). */
export interface PushSender {
  sendEachForMulticast(message: MulticastMessage): Promise<BatchResponse>;
}

type Lang = 'es' | 'en';

const TEXT: Record<Lang, { title: string }> = {
  es: { title: 'Nueva orden de mantenimiento' },
  en: { title: 'New work order' },
};

/** FCM error codes meaning the token will never work again. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Who is notified about a new request: every active user whose job title is Maintenance Manager,
 * plus the assigned supervisor if different. The submitter is never notified of their own request.
 */
export async function notificationRecipients(db: Firestore, req: DocumentSnapshot): Promise<string[]> {
  const users = await db.collection('users').where('active', '==', true).get();
  const managers = users.docs.filter((u) => toJobTitle(u.get('title')) === 'maintenance_manager').map((u) => u.id);
  const assignee = String(req.get('assignedTo.email') ?? '').toLowerCase();
  const isActive = (email: string) => users.docs.some((u) => u.id === email);
  const submitter = String(req.get('submittedBy.email') ?? '').toLowerCase();
  const all = new Set([...managers, ...(assignee && isActive(assignee) ? [assignee] : [])]);
  all.delete(submitter);
  return [...all].sort();
}

export interface PushResult {
  recipients: string[];
  sent: number;
  failed: number;
  removedTokens: number;
}

/**
 * Sends the "new work order" web push to the recipients' registered devices
 * (`users/{email}/pushTokens/*`), in the language saved with each token.
 * Tokens FCM reports as dead are deleted.
 */
export async function sendNewRequestPush(db: Firestore, sender: PushSender, reqId: string): Promise<PushResult> {
  const snap = await db.doc(`maintenanceRequests/${reqId}`).get();
  const result: PushResult = { recipients: [], sent: 0, failed: 0, removedTokens: 0 };
  if (!snap.exists) return result;
  result.recipients = await notificationRecipients(db, snap);

  const byLang: Record<Lang, { token: string; path: string }[]> = { es: [], en: [] };
  for (const email of result.recipients) {
    const tokens = await db.collection(`users/${email}/pushTokens`).get();
    for (const t of tokens.docs) {
      const token = t.get('token');
      if (typeof token !== 'string' || !token) continue;
      byLang[t.get('language') === 'es' ? 'es' : 'en'].push({ token, path: t.ref.path });
    }
  }

  const ticket = String(snap.get('ticketId') ?? '');
  const location = String(snap.get('location.name') ?? '');
  const body = [ticket, location].filter(Boolean).join(' · ');
  const link = `/?request=${encodeURIComponent(reqId)}`;

  for (const lang of ['es', 'en'] as const) {
    const targets = byLang[lang];
    if (targets.length === 0) continue;
    const res = await sender.sendEachForMulticast({
      tokens: targets.map((t) => t.token),
      notification: { title: TEXT[lang].title, body },
      data: { requestId: reqId, link },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { tag: `request-${reqId}`, renotify: true, icon: '/icons/icon-192.png' },
        fcmOptions: { link },
      },
    });
    result.sent += res.successCount;
    result.failed += res.failureCount;
    await Promise.all(
      res.responses.map(async (r, i) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
          await db.doc(targets[i].path).delete();
          result.removedTokens += 1;
        }
      }),
    );
  }
  return result;
}
