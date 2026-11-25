import { describe, expect, it } from 'vitest';
import { ALERT_WINDOW_MS, isAlertRecipient, requestsToAlert } from './newRequestAlerts';

const NOW = Date.UTC(2026, 10, 25, 15, 0, 0);
const mm = { email: 'randel@kachavalux.com', title: 'maintenance_manager' };
const carla = { email: 'carla.r@kachavalux.com', title: 'administrative_manager' };

const req = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  createdAt: new Date(NOW - 10_000),
  submittedBy: { uid: 'u', email: 'bianca@kachavalux.com', name: 'Bianca' },
  assignedTo: null as { email: string; name: string } | null,
  ...extra,
});

describe('isAlertRecipient', () => {
  it('alerts the Maintenance Manager (code or legacy title) and the assignee', () => {
    expect(isAlertRecipient(mm, req('a'))).toBe(true);
    expect(isAlertRecipient({ ...mm, title: 'Maintenance Manager' }, req('a'))).toBe(true);
    expect(isAlertRecipient(carla, req('a'))).toBe(false);
    expect(isAlertRecipient(carla, req('a', { assignedTo: { email: 'Carla.R@kachavalux.com', name: 'Carla' } }))).toBe(true);
  });

  it('never alerts the submitter', () => {
    expect(isAlertRecipient(mm, req('a', { submittedBy: { uid: 'r', email: mm.email, name: 'Randel' } }))).toBe(false);
  });
});

describe('requestsToAlert', () => {
  it('skips the initial load, already alerted and old requests', () => {
    const list = [req('base'), req('done'), req('old', { createdAt: new Date(NOW - ALERT_WINDOW_MS - 1) }), req('new')];
    const out = requestsToAlert(list, mm, new Set(['base']), new Set(['done']), NOW);
    expect(out.map((r) => r.id)).toEqual(['new']);
  });

  it('announces a request to its assignee once the assignment arrives', () => {
    const before = requestsToAlert([req('x')], carla, new Set(), new Set(), NOW);
    expect(before).toEqual([]);
    const after = requestsToAlert(
      [req('x', { assignedTo: { email: carla.email, name: 'Carla' } })],
      carla,
      new Set(),
      new Set(),
      NOW,
    );
    expect(after.map((r) => r.id)).toEqual(['x']);
  });
});
