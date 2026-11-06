import { describe, expect, it } from 'vitest';
import {
  canTransition,
  computeKpi,
  formatTicketId,
  isResponseOverdue,
  liveWorkMs,
  type StatusEvent,
} from './domain';

const MIN = 60_000;
const H = 60 * MIN;
// 2026-11-05 09:00 America/Cancun (UTC-5) == 14:00 UTC
const T0 = Date.UTC(2026, 10, 5, 14, 0, 0);

const workedExample: StatusEvent[] = [
  { toStatus: 'reconocida', atMs: T0 + 1 * H }, // 10:00
  { toStatus: 'pendiente', atMs: T0 + 2 * H }, // 11:00
  { toStatus: 'reconocida', atMs: T0 + 4 * H }, // 13:00
  { toStatus: 'completada', atMs: T0 + 4.5 * H }, // 13:30
];

describe('computeKpi', () => {
  it('matches the spec worked example (09:00 -> 13:30, Normal)', () => {
    const k = computeKpi(T0, 'normal', workedExample, T0 + 4.5 * H);
    expect(k).toEqual({
      responseMs: 1 * H,
      responseSlaMet: true,
      workMs: 1.5 * H,
      blockedMs: 2 * H,
      totalMs: 4.5 * H,
    });
  });

  it('is idempotent with duplicate events', () => {
    const dup = [...workedExample, ...workedExample, workedExample[1]];
    expect(computeKpi(T0, 'normal', dup)).toEqual(computeKpi(T0, 'normal', workedExample));
  });

  it('is order-independent', () => {
    const shuffled = [workedExample[3], workedExample[0], workedExample[2], workedExample[1]];
    expect(computeKpi(T0, 'normal', shuffled)).toEqual(computeKpi(T0, 'normal', workedExample));
  });

  it('returns nulls for an open, unreviewed request', () => {
    expect(computeKpi(T0, 'high', [])).toEqual({
      responseMs: null,
      responseSlaMet: null,
      workMs: 0,
      blockedMs: 0,
      totalMs: null,
    });
  });

  it('marks SLA missed when the response exceeds the priority target', () => {
    const k = computeKpi(T0, 'urgent', [{ toStatus: 'pendiente', atMs: T0 + 16 * MIN }]);
    expect(k.responseMs).toBe(16 * MIN);
    expect(k.responseSlaMet).toBe(false);
    expect(k.totalMs).toBeNull();
  });

  it('excludes the open segment from closed work time', () => {
    const k = computeKpi(T0, 'normal', [{ toStatus: 'reconocida', atMs: T0 + 10 * MIN }]);
    expect(k.workMs).toBe(0);
    expect(liveWorkMs('reconocida', k.workMs, T0 + 10 * MIN, T0 + 20 * MIN)).toBe(10 * MIN);
  });
});

describe('liveWorkMs', () => {
  it('does not advance while pendiente (paused)', () => {
    expect(liveWorkMs('pendiente', 45 * MIN, T0, T0 + 5 * H)).toBe(45 * MIN);
  });
});

describe('transitions', () => {
  it('allows only the specified transitions', () => {
    expect(canTransition('sin_revisar', 'pendiente')).toBe(true);
    expect(canTransition('sin_revisar', 'reconocida')).toBe(true);
    expect(canTransition('pendiente', 'reconocida')).toBe(true);
    expect(canTransition('reconocida', 'pendiente')).toBe(true);
    expect(canTransition('reconocida', 'completada')).toBe(true);
    expect(canTransition('sin_revisar', 'completada')).toBe(false);
    expect(canTransition('pendiente', 'completada')).toBe(false);
    expect(canTransition('completada', 'reconocida')).toBe(false);
  });
});

describe('isResponseOverdue', () => {
  it('flags High after 2h05m and not Normal at 1h', () => {
    expect(isResponseOverdue(T0, 'high', T0 + 2 * H + 5 * MIN)).toBe(true);
    expect(isResponseOverdue(T0, 'normal', T0 + 1 * H)).toBe(false);
  });
});

describe('formatTicketId', () => {
  it('pads the sequence', () => {
    expect(formatTicketId(2026, 7)).toBe('KLM-2026-0007');
  });
});
