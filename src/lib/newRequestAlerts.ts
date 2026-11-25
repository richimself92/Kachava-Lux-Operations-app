import { toJobTitle } from '../../shared/domain';
import type { AppUser, MaintenanceRequest } from '../types';

/** Requests older than this when they reach the client are not announced (e.g. after a reconnect). */
export const ALERT_WINDOW_MS = 5 * 60_000;

type Me = Pick<AppUser, 'email' | 'title'>;
type Req = Pick<MaintenanceRequest, 'id' | 'createdAt' | 'submittedBy' | 'assignedTo'>;

/**
 * Same recipient rule as the push (functions/src/notify.ts): the Maintenance Manager, plus the
 * assigned supervisor. Nobody is alerted about a request they submitted themselves.
 */
export function isAlertRecipient(me: Me, r: Req): boolean {
  const email = me.email.toLowerCase();
  if (r.submittedBy?.email?.toLowerCase() === email) return false;
  return toJobTitle(me.title) === 'maintenance_manager' || r.assignedTo?.email?.toLowerCase() === email;
}

/**
 * Returns the requests in `list` that should trigger a new-request alert now.
 * `baseline` holds the ids present at the first load (never announced); `alerted` the ids already
 * announced. The assignee is set by a Cloud Function just after creation, so a request can become
 * relevant on a later snapshot; it is still announced once, while inside the time window.
 */
export function requestsToAlert(
  list: readonly Req[],
  me: Me,
  baseline: ReadonlySet<string>,
  alerted: ReadonlySet<string>,
  now: number,
): Req[] {
  return list.filter(
    (r) =>
      !baseline.has(r.id) &&
      !alerted.has(r.id) &&
      now - r.createdAt.getTime() < ALERT_WINDOW_MS &&
      isAlertRecipient(me, r),
  );
}
