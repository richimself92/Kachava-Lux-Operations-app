import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { playChime, unlockChimeOnFirstGesture } from '../lib/chime';
import { requestsToAlert } from '../lib/newRequestAlerts';
import type { MaintenanceRequest } from '../types';

/**
 * While the app is open: plays a chime (and vibrates where supported) when a new request
 * reaches the Maintenance Manager or its assignee, and calls `onAlert` for the visible notice.
 * Requests already present on the first load are never announced.
 */
export function useNewRequestAlert(onAlert: (r: Pick<MaintenanceRequest, 'id' | 'ticketId' | 'location'>) => void) {
  const { currentUser } = useAuth();
  const { requests, loading } = useRequests();
  const baseline = useRef<Set<string> | null>(null);
  const alerted = useRef(new Set<string>());
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  useEffect(() => unlockChimeOnFirstGesture(), []);

  // A different signed-in user starts from a fresh baseline.
  useEffect(() => {
    baseline.current = null;
    alerted.current = new Set();
  }, [currentUser?.email]);

  useEffect(() => {
    if (!currentUser || loading) return;
    if (!baseline.current) {
      baseline.current = new Set(requests.map((r) => r.id));
      return;
    }
    const due = requestsToAlert(requests, currentUser, baseline.current, alerted.current, Date.now());
    if (due.length === 0) return;
    for (const r of due) alerted.current.add(r.id);
    playChime();
    navigator.vibrate?.([200, 100, 200]);
    const latest = requests.find((r) => r.id === due[0].id);
    if (latest) onAlertRef.current(latest);
  }, [requests, loading, currentUser]);
}
