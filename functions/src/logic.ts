import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  computeKpi,
  formatTicketId,
  PRIORITIES,
  STATUSES,
  TIMEZONE,
  type KpiResult,
  type RequestPriority,
  type RequestStatus,
  type StatusEvent,
} from '../../shared/domain';

/** Calendar year of `d` in America/Cancun. */
export function cancunYear(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric' }).format(d));
}

/**
 * Assigns the next sequential ticket id (KLM-YYYY-NNNN) for the request's Cancun year.
 * Idempotent: does nothing if the request already has a ticketId.
 */
export async function assignTicketId(db: Firestore, ref: DocumentReference): Promise<string | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const existing = snap.get('ticketId');
    if (typeof existing === 'string' && existing) return existing;

    const createdAt = snap.get('createdAt') as Timestamp | undefined;
    const year = cancunYear(createdAt ? createdAt.toDate() : new Date());
    const counterRef = db.doc(`counters/ticket-${year}`);
    const counter = await tx.get(counterRef);
    const seq = counter.exists ? Number(counter.get('next')) || 1 : 1;

    const ticketId = formatTicketId(year, seq);
    tx.set(counterRef, { next: seq + 1, year, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(ref, { ticketId });
    return ticketId;
  });
}

const KPI_FIELDS: (keyof KpiResult)[] = ['responseMs', 'responseSlaMet', 'workMs', 'blockedMs', 'totalMs'];

function isStatus(v: unknown): v is RequestStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

function isPriority(v: unknown): v is RequestPriority {
  return typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v);
}

/**
 * Recomputes the request's KPI block from scratch, from its immutable status audit entries.
 * Pure function of stored inputs => safe under at-least-once / out-of-order trigger delivery.
 * Writes only when a value changed (prevents trigger loops).
 */
export async function recomputeKpi(ref: DocumentReference): Promise<KpiResult | null> {
  const [snap, audits] = await Promise.all([
    ref.get(),
    ref.collection('audit').where('action', '==', 'status_changed').get(),
  ]);
  const data = snap.data();
  const createdAt = data?.createdAt as Timestamp | undefined;
  if (!data || !createdAt || !isPriority(data.priority)) return null;

  const events: StatusEvent[] = [];
  for (const a of audits.docs) {
    const at = a.get('at') as Timestamp | undefined;
    const to = a.get('toStatus');
    if (at && isStatus(to)) events.push({ toStatus: to, atMs: at.toMillis() });
  }

  const completedAt = data.completedAt as Timestamp | undefined;
  const kpi = computeKpi(createdAt.toMillis(), data.priority, events, completedAt ? completedAt.toMillis() : null);

  const prev = (data.kpi ?? {}) as Partial<KpiResult>;
  const unchanged = KPI_FIELDS.every((k) => (prev[k] ?? null) === (kpi[k] ?? null));
  if (unchanged) return kpi;

  await ref.update({ kpi: { ...kpi, computedAt: FieldValue.serverTimestamp() } });
  return kpi;
}

function sameTimestamp(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b);
  return a === b;
}

/** True when an update changed the lifecycle state (and thus may change KPIs). */
export function isLifecycleChange(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!before || !after) return false;
  return before.status !== after.status || !sameTimestamp(before.statusChangedAt, after.statusChangedAt);
}

/**
 * Cleans up after a deleted request: its audit subcollection and its Storage photos
 * (`maintenanceRequests/{reqId}/...`). Photo deletion is injected so tests and environments
 * without Storage can stub it; a failure there is reported but does not block the audit purge.
 */
export async function purgeRequestArtifacts(
  db: Firestore,
  reqId: string,
  deletePhotos: (prefix: string) => Promise<void>,
): Promise<{ photosError: unknown }> {
  await db.recursiveDelete(db.collection('maintenanceRequests').doc(reqId).collection('audit'));
  try {
    await deletePhotos(`maintenanceRequests/${reqId}/`);
    return { photosError: null };
  } catch (err) {
    return { photosError: err };
  }
}

/**
 * Assigns the default supervisor to a new, unassigned request (business rule: Randel by default).
 * The configured user must exist, be active and be a supervisor or admin; otherwise the request
 * stays unassigned and the first supervisor who handles it is auto-assigned as before.
 * Idempotent (never overrides an existing assignee) and recorded in the audit history.
 */
export async function assignDefaultSupervisor(
  db: Firestore,
  ref: DocumentReference,
  email: string,
): Promise<{ email: string; name: string } | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('assignedTo')) return null;
    const user = await tx.get(db.doc(`users/${target}`));
    if (!user.exists || user.get('active') !== true || !['supervisor', 'admin'].includes(user.get('role'))) {
      return null;
    }
    const assignee = { email: target, name: String(user.get('displayName')) };
    const auditRef = ref.collection('audit').doc();
    tx.set(auditRef, {
      action: 'reassigned',
      at: FieldValue.serverTimestamp(),
      by: { uid: 'system', email: 'system', name: 'Kachava Lux', role: 'system' },
      details: `— → ${assignee.name} (default)`,
    });
    tx.update(ref, { assignedTo: assignee });
    return assignee;
  });
}
