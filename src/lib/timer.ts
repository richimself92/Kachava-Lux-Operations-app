import { computeKpi, liveWorkMs, RESPONSE_SLA_MS, type StatusEvent } from '../../shared/domain';
import type { AuditLogEntry, MaintenanceRequest } from '../types';

export type TimerState =
  | { mode: 'response'; elapsedMs: number; targetMs: number; overdue: boolean }
  | {
      mode: 'work';
      running: boolean;
      workMs: number;
      responseMs: number | null;
      responseSlaMet: boolean | null;
      targetMs: number;
    }
  | {
      mode: 'done';
      responseMs: number | null;
      responseSlaMet: boolean | null;
      workMs: number;
      blockedMs: number;
      totalMs: number | null;
      targetMs: number;
    };

/** Status events from the audit trail (authoritative; pending server timestamps are estimated). */
export function statusEventsFromAudit(audit: readonly AuditLogEntry[]): StatusEvent[] {
  return audit
    .filter((a) => a.action === 'status_changed' && a.toStatus && a.at)
    .map((a) => ({ toStatus: a.toStatus!, atMs: a.at!.getTime() }));
}

type TimerInput = Pick<
  MaintenanceRequest,
  'status' | 'priority' | 'createdAt' | 'statusChangedAt' | 'firstResponseAt' | 'completedAt' | 'kpi'
>;

/**
 * What the ticket timer shows at `nowMs`.
 * - sin_revisar: response clock vs the priority target; overdue (red) past it.
 * - reconocida: running work timer (closed work + current segment). Never red.
 * - pendiente: paused accumulated work time.
 * - completada: static response / work / total.
 *
 * `audit` (when loaded) gives exact closed segments; otherwise falls back to the backend KPI.
 */
export function ticketTimerState(req: TimerInput, nowMs: number, audit?: readonly AuditLogEntry[] | null): TimerState {
  const createdMs = req.createdAt.getTime();
  const targetMs = RESPONSE_SLA_MS[req.priority];

  if (req.status === 'sin_revisar') {
    const elapsedMs = Math.max(0, nowMs - createdMs);
    return { mode: 'response', elapsedMs, targetMs, overdue: elapsedMs > targetMs };
  }

  const fromAudit =
    audit && audit.length > 0
      ? computeKpi(createdMs, req.priority, statusEventsFromAudit(audit), req.completedAt?.getTime() ?? null)
      : null;

  const responseMs =
    fromAudit?.responseMs ??
    req.kpi?.responseMs ??
    (req.firstResponseAt ? Math.max(0, req.firstResponseAt.getTime() - createdMs) : null);
  const responseSlaMet = responseMs === null ? null : responseMs <= targetMs;
  const closedWorkMs = fromAudit?.workMs ?? req.kpi?.workMs ?? 0;

  if (req.status === 'completada') {
    return {
      mode: 'done',
      responseMs,
      responseSlaMet,
      workMs: closedWorkMs,
      blockedMs: fromAudit?.blockedMs ?? req.kpi?.blockedMs ?? 0,
      totalMs:
        fromAudit?.totalMs ??
        req.kpi?.totalMs ??
        (req.completedAt ? Math.max(0, req.completedAt.getTime() - createdMs) : null),
      targetMs,
    };
  }

  return {
    mode: 'work',
    running: req.status === 'reconocida',
    workMs: liveWorkMs(req.status, closedWorkMs, req.statusChangedAt?.getTime() ?? null, nowMs),
    responseMs,
    responseSlaMet,
    targetMs,
  };
}
