import { describe, expect, it } from 'vitest';
import type { MaintenanceRequest } from '../types';
import { kpiBreakdown, median, summarizeKpis, UNASSIGNED_KEY } from './kpi-aggregate';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.parse('2026-03-10T15:00:00Z');
let n = 0;

function req(over: Partial<MaintenanceRequest>): MaintenanceRequest {
  n++;
  return {
    id: `r${n}`,
    location: { code: '102', name: 'Villa 102', type: 'villa' },
    category: 'plumbing',
    priority: 'normal',
    locationDetail: 'x',
    notes: 'y',
    status: 'sin_revisar',
    submittedBy: { uid: 'u', email: 'u@kachavalux.com', name: 'U' },
    createdAt: new Date(T0),
    updatedAt: null,
    statusChangedAt: null,
    beforePhotos: [],
    afterPhotos: [],
    ...over,
  } as MaintenanceRequest;
}

const randel = { email: 'randel@kachavalux.com', name: 'Randel Can Chuc' };

const completed = (responseMs: number, workMs: number, totalMs: number, over: Partial<MaintenanceRequest> = {}) =>
  req({
    status: 'completada',
    assignedTo: randel,
    completedBy: { uid: 'r', ...randel },
    kpi: { responseMs, responseSlaMet: null, workMs, blockedMs: 0, totalMs },
    ...over,
  });

describe('summarizeKpis', () => {
  it('returns nulls ("—") for empty sets', () => {
    const s = summarizeKpis([], T0);
    expect(s.total).toBe(0);
    expect(s.slaCompliance).toBeNull();
    expect(s.avgResponseMs).toBeNull();
    expect(s.medianResponseMs).toBeNull();
    expect(s.avgWorkMs).toBeNull();
    expect(s.avgTotalMs).toBeNull();
  });

  it('counts states, urgent open and overdue unreviewed', () => {
    const rs = [
      req({ priority: 'urgent' }), // overdue at T0+20m
      req({ priority: 'high' }), // not overdue at T0+20m
      req({ status: 'pendiente', priority: 'urgent', firstResponseAt: new Date(T0 + 5 * MIN) }),
      req({ status: 'reconocida', firstResponseAt: new Date(T0 + 10 * MIN) }),
      completed(30 * MIN, H, 2 * H, { priority: 'urgent' }),
    ];
    const s = summarizeKpis(rs, T0 + 20 * MIN);
    expect(s.counts).toEqual({ sin_revisar: 2, pendiente: 1, reconocida: 1, completada: 1 });
    expect(s.urgentOpen).toBe(2);
    expect(s.overdueUnreviewed).toBe(1);
  });

  it('computes SLA compliance and response/work/total averages', () => {
    const rs = [
      completed(1 * H, 2 * H, 4 * H, { priority: 'normal' }), // met (4h)
      completed(3 * H, 4 * H, 8 * H, { priority: 'high' }), // missed (2h)
      req({ status: 'reconocida', priority: 'low', firstResponseAt: new Date(T0 + 2 * H) }), // met (24h), no work/total yet
      req({ status: 'sin_revisar' }), // not responded: excluded from SLA
    ];
    const s = summarizeKpis(rs, T0 + 10 * H);
    expect(s.respondedCount).toBe(3);
    expect(s.slaCompliance).toBeCloseTo(2 / 3);
    expect(s.avgResponseMs).toBe(2 * H);
    expect(s.medianResponseMs).toBe(2 * H);
    expect(s.avgWorkMs).toBe(3 * H);
    expect(s.avgTotalMs).toBe(6 * H);
  });

  it('excludes completed requests without backend KPI from average work time', () => {
    const rs = [completed(H, 2 * H, 3 * H), req({ status: 'completada', completedAt: new Date(T0 + 5 * H), firstResponseAt: new Date(T0 + H) })];
    const s = summarizeKpis(rs, T0 + 10 * H);
    expect(s.avgWorkMs).toBe(2 * H);
    expect(s.avgTotalMs).toBe(4 * H); // falls back to completedAt − createdAt
  });
});

describe('kpiBreakdown', () => {
  it('groups by priority with per-group metrics, sorted by count', () => {
    const rows = kpiBreakdown(
      [completed(H, H, 2 * H, { priority: 'high' }), completed(3 * H, H, 4 * H, { priority: 'high' }), completed(H, 3 * H, 6 * H, { priority: 'low' })],
      'priority',
    );
    expect(rows.map((r) => [r.key, r.count])).toEqual([
      ['high', 2],
      ['low', 1],
    ]);
    expect(rows[0].slaCompliance).toBe(0.5);
    expect(rows[0].avgTotalMs).toBe(3 * H);
    expect(rows[1].avgWorkMs).toBe(3 * H);
  });

  it('groups unassigned requests and limits completedBy to completed requests', () => {
    const rows = kpiBreakdown([req({}), completed(H, H, H)], 'assignee');
    expect(rows.map((r) => r.key).sort()).toEqual([UNASSIGNED_KEY, randel.email].sort());
    expect(kpiBreakdown([req({}), completed(H, H, H)], 'completedBy')).toHaveLength(1);
  });
});

describe('median', () => {
  it('handles odd and even sizes', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
