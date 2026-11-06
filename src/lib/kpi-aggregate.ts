/**
 * Aggregates per-request KPIs (written by the backend from the audit trail) into
 * dashboard metrics. Pure: no clock reads except the `nowMs` argument.
 *
 * - Response time: submission → first move out of sin_revisar (vs priority SLA).
 * - Work time: total time in reconocida (completed requests only).
 * - Total: submission → completada ("time to fully addressed"; completed only).
 *
 * Any metric over an empty set is `null` (shown as "—").
 */
import { isResponseOverdue, RESPONSE_SLA_MS, STATUSES, type RequestStatus } from '../../shared/domain';
import type { MaintenanceRequest } from '../types';

export interface KpiSummary {
  total: number;
  counts: Record<RequestStatus, number>;
  urgentOpen: number;
  overdueUnreviewed: number;
  /** Share (0..1) of responded requests whose response met the SLA. */
  slaCompliance: number | null;
  respondedCount: number;
  avgResponseMs: number | null;
  medianResponseMs: number | null;
  avgWorkMs: number | null;
  avgTotalMs: number | null;
  completedCount: number;
}

export function responseMsOf(r: MaintenanceRequest): number | null {
  if (r.kpi?.responseMs != null) return r.kpi.responseMs;
  if (r.firstResponseAt) return Math.max(0, r.firstResponseAt.getTime() - r.createdAt.getTime());
  return null;
}

/** Work time is only final once completed and the backend KPI has been computed. */
export function workMsOf(r: MaintenanceRequest): number | null {
  return r.status === 'completada' && r.kpi ? r.kpi.workMs : null;
}

export function totalMsOf(r: MaintenanceRequest): number | null {
  if (r.status !== 'completada') return null;
  if (r.kpi?.totalMs != null) return r.kpi.totalMs;
  if (r.completedAt) return Math.max(0, r.completedAt.getTime() - r.createdAt.getTime());
  return null;
}

const nonNull = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x !== null);

export function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function slaShare(rs: MaintenanceRequest[]): { share: number | null; responded: number } {
  let met = 0;
  let responded = 0;
  for (const r of rs) {
    const ms = responseMsOf(r);
    if (ms === null) continue;
    responded++;
    if (ms <= RESPONSE_SLA_MS[r.priority]) met++;
  }
  return { share: responded === 0 ? null : met / responded, responded };
}

export function summarizeKpis(requests: MaintenanceRequest[], nowMs: number): KpiSummary {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
  let urgentOpen = 0;
  let overdueUnreviewed = 0;
  for (const r of requests) {
    counts[r.status]++;
    if (r.priority === 'urgent' && r.status !== 'completada') urgentOpen++;
    if (r.status === 'sin_revisar' && isResponseOverdue(r.createdAt.getTime(), r.priority, nowMs)) overdueUnreviewed++;
  }
  const responses = nonNull(requests.map(responseMsOf));
  const { share, responded } = slaShare(requests);
  return {
    total: requests.length,
    counts,
    urgentOpen,
    overdueUnreviewed,
    slaCompliance: share,
    respondedCount: responded,
    avgResponseMs: mean(responses),
    medianResponseMs: median(responses),
    avgWorkMs: mean(nonNull(requests.map(workMsOf))),
    avgTotalMs: mean(nonNull(requests.map(totalMsOf))),
    completedCount: counts.completada,
  };
}

export type KpiDimension = 'priority' | 'category' | 'location' | 'assignee' | 'completedBy';

export interface BreakdownRow {
  key: string;
  /** Display hint for keys that are not translated (people, villa names). */
  name: string;
  count: number;
  slaCompliance: number | null;
  avgResponseMs: number | null;
  avgWorkMs: number | null;
  avgTotalMs: number | null;
}

export const UNASSIGNED_KEY = '__none__';

function groupKey(r: MaintenanceRequest, dim: KpiDimension): { key: string; name: string } {
  switch (dim) {
    case 'priority':
      return { key: r.priority, name: r.priority };
    case 'category':
      return { key: r.category, name: r.category };
    case 'location':
      return { key: r.location.code, name: r.location.name };
    case 'assignee':
      return r.assignedTo ? { key: r.assignedTo.email, name: r.assignedTo.name } : { key: UNASSIGNED_KEY, name: '' };
    case 'completedBy':
      return r.completedBy ? { key: r.completedBy.email, name: r.completedBy.name } : { key: UNASSIGNED_KEY, name: '' };
  }
}

/** Groups requests by a dimension; rows sorted by count (desc), then name. */
export function kpiBreakdown(requests: MaintenanceRequest[], dim: KpiDimension): BreakdownRow[] {
  const groups = new Map<string, { name: string; items: MaintenanceRequest[] }>();
  for (const r of requests) {
    if (dim === 'completedBy' && r.status !== 'completada') continue;
    const { key, name } = groupKey(r, dim);
    const g = groups.get(key) ?? { name, items: [] };
    g.items.push(r);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, { name, items }]) => ({
      key,
      name,
      count: items.length,
      slaCompliance: slaShare(items).share,
      avgResponseMs: mean(nonNull(items.map(responseMsOf))),
      avgWorkMs: mean(nonNull(items.map(workMsOf))),
      avgTotalMs: mean(nonNull(items.map(totalMsOf))),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
