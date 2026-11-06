import { describe, expect, it } from 'vitest';
import type { AuditLogEntry, MaintenanceRequest } from '../types';
import { ticketTimerState } from './timer';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.parse('2026-03-10T15:00:00Z');

const base = (over: Partial<MaintenanceRequest> = {}) =>
  ({
    status: 'sin_revisar',
    priority: 'high',
    createdAt: new Date(T0),
    statusChangedAt: new Date(T0),
    firstResponseAt: null,
    completedAt: null,
    kpi: undefined,
    ...over,
  }) as MaintenanceRequest;

const ev = (toStatus: AuditLogEntry['toStatus'], atMs: number): AuditLogEntry => ({
  id: String(atMs),
  action: 'status_changed',
  toStatus,
  at: new Date(atMs),
  by: { uid: 'u', email: 'e', name: 'n', role: 'supervisor' },
  details: '',
});

describe('ticketTimerState', () => {
  it('High priority unreviewed at 2h05m is overdue (red)', () => {
    const s = ticketTimerState(base(), T0 + 2 * H + 5 * MIN);
    expect(s).toMatchObject({ mode: 'response', overdue: true, elapsedMs: 2 * H + 5 * MIN, targetMs: 2 * H });
  });

  it('Normal priority unreviewed at 1h is not overdue', () => {
    const s = ticketTimerState(base({ priority: 'normal' }), T0 + H);
    expect(s).toMatchObject({ mode: 'response', overdue: false });
  });

  it('Urgent becomes overdue after 15 minutes', () => {
    expect(ticketTimerState(base({ priority: 'urgent' }), T0 + 15 * MIN)).toMatchObject({ overdue: false });
    expect(ticketTimerState(base({ priority: 'urgent' }), T0 + 16 * MIN)).toMatchObject({ overdue: true });
  });

  it('reconocida runs: closed work + current segment', () => {
    const audit = [ev('reconocida', T0 + 10 * MIN), ev('pendiente', T0 + 40 * MIN), ev('reconocida', T0 + 2 * H)];
    const req = base({ status: 'reconocida', statusChangedAt: new Date(T0 + 2 * H) });
    const s = ticketTimerState(req, T0 + 2 * H + 20 * MIN, audit);
    expect(s).toMatchObject({ mode: 'work', running: true, workMs: 30 * MIN + 20 * MIN, responseMs: 10 * MIN, responseSlaMet: true });
  });

  it('pendiente is paused at the accumulated work time and does not advance', () => {
    const audit = [ev('reconocida', T0 + 10 * MIN), ev('pendiente', T0 + 40 * MIN)];
    const req = base({ status: 'pendiente', statusChangedAt: new Date(T0 + 40 * MIN) });
    const a = ticketTimerState(req, T0 + H, audit);
    const b = ticketTimerState(req, T0 + 5 * H, audit);
    expect(a).toMatchObject({ mode: 'work', running: false, workMs: 30 * MIN });
    expect(b).toEqual(a);
  });

  it('falls back to backend KPI when the audit is not loaded', () => {
    const req = base({
      status: 'reconocida',
      statusChangedAt: new Date(T0 + H),
      kpi: { responseMs: 5 * MIN, responseSlaMet: true, workMs: 7 * MIN, blockedMs: 0, totalMs: null },
    });
    expect(ticketTimerState(req, T0 + H + MIN)).toMatchObject({ workMs: 8 * MIN, responseMs: 5 * MIN });
  });

  it('completada shows static response, work and total', () => {
    const audit = [ev('reconocida', T0 + 3 * H), ev('completada', T0 + 4 * H)];
    const req = base({ status: 'completada', statusChangedAt: new Date(T0 + 4 * H), completedAt: new Date(T0 + 4 * H) });
    expect(ticketTimerState(req, T0 + 100 * H, audit)).toMatchObject({
      mode: 'done',
      responseMs: 3 * H,
      responseSlaMet: false,
      workMs: H,
      totalMs: 4 * H,
    });
  });
});
