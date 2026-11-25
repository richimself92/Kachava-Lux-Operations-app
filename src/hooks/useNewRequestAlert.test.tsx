// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { email: 'randel@kachavalux.com', title: 'maintenance_manager' } as { email: string; title: string } | null,
  requests: [] as unknown[],
  loading: false,
}));
const chime = vi.hoisted(() => ({ playChime: vi.fn(), unlockChimeOnFirstGesture: vi.fn(() => () => undefined) }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: state.user }) }));
vi.mock('../context/RequestContext', () => ({
  useRequests: () => ({ requests: state.requests, loading: state.loading }),
}));
vi.mock('../lib/chime', () => chime);

import { useNewRequestAlert } from './useNewRequestAlert';

const req = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  ticketId: `KLM-2026-${id}`,
  location: { code: '102', name: 'Villa 102', type: 'villa' },
  createdAt: new Date(),
  submittedBy: { uid: 'u', email: 'bianca@kachavalux.com', name: 'Bianca' },
  assignedTo: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { email: 'randel@kachavalux.com', title: 'maintenance_manager' };
  state.requests = [];
  state.loading = false;
});

describe('useNewRequestAlert', () => {
  it('stays silent on the initial load and chimes once for a new request', () => {
    const onAlert = vi.fn();
    state.requests = [req('0001')];
    const { rerender } = renderHook(() => useNewRequestAlert(onAlert));
    expect(chime.playChime).not.toHaveBeenCalled();

    state.requests = [req('0002'), req('0001')];
    rerender();
    expect(chime.playChime).toHaveBeenCalledTimes(1);
    expect(onAlert).toHaveBeenCalledWith(expect.objectContaining({ id: '0002', ticketId: 'KLM-2026-0002' }));

    // The same request updated again (e.g. the assignee arrives) is not announced twice.
    state.requests = [req('0002', { assignedTo: { email: 'randel@kachavalux.com', name: 'Randel' } }), req('0001')];
    rerender();
    expect(chime.playChime).toHaveBeenCalledTimes(1);
  });

  it('waits for the first load to finish before taking the baseline', () => {
    state.loading = true;
    const { rerender } = renderHook(() => useNewRequestAlert(vi.fn()));
    state.loading = false;
    state.requests = [req('0001')];
    rerender();
    expect(chime.playChime).not.toHaveBeenCalled();
  });

  it('does not alert users who are neither the Maintenance Manager nor the assignee', () => {
    state.user = { email: 'carla.r@kachavalux.com', title: 'administrative_manager' };
    const { rerender } = renderHook(() => useNewRequestAlert(vi.fn()));
    state.requests = [req('0003')];
    rerender();
    expect(chime.playChime).not.toHaveBeenCalled();

    // ...until the request is assigned to them.
    state.requests = [req('0003', { assignedTo: { email: 'carla.r@kachavalux.com', name: 'Carla' } })];
    rerender();
    expect(chime.playChime).toHaveBeenCalledTimes(1);
  });
});
