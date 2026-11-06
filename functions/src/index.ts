import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import {
  assignDefaultSupervisor,
  assignTicketId,
  isLifecycleChange,
  purgeRequestArtifacts,
  recomputeKpi,
} from './logic';

initializeApp();
const db = getFirestore();

/**
 * Deploy region. Must match the Firestore database location
 * (e.g. us-central1 for nam5, or the database's regional location).
 * Set in functions/.env.<projectId> as LOCATION=..., or answer the prompt on first deploy.
 */
const LOCATION = defineString('LOCATION', { default: 'us-central1' });

setGlobalOptions({ region: LOCATION, maxInstances: 10 });

/**
 * Supervisor assigned to every new request by default (set in functions/.env.<projectId>
 * as DEFAULT_ASSIGNEE_EMAIL=...). Empty disables default assignment.
 */
const DEFAULT_ASSIGNEE_EMAIL = defineString('DEFAULT_ASSIGNEE_EMAIL', { default: 'randel@kachavalux.com' });

/** Assigns the server-side sequential ticket id (KLM-YYYY-NNNN) and the default supervisor. */
export const onMaintenanceRequestCreated = onDocumentCreated('maintenanceRequests/{reqId}', async (event) => {
  if (!event.data) return;
  const ticketId = await assignTicketId(db, event.data.ref);
  logger.info('ticket assigned', { reqId: event.params.reqId, ticketId });
  const assignee = await assignDefaultSupervisor(db, event.data.ref, DEFAULT_ASSIGNEE_EMAIL.value());
  if (assignee) logger.info('default supervisor assigned', { reqId: event.params.reqId, assignee: assignee.email });
  else logger.warn('default supervisor not assigned', { reqId: event.params.reqId, configured: DEFAULT_ASSIGNEE_EMAIL.value() });
});

/**
 * Recomputes KPI durations whenever the lifecycle state changes.
 * Also self-heals requests whose creation trigger failed (no ticketId / no kpi yet):
 * the next update to such a request assigns the ticket id and fills the KPI block.
 * Both helpers are idempotent and only write when something changes, so this cannot loop.
 */
export const onMaintenanceRequestUpdated = onDocumentUpdated('maintenanceRequests/{reqId}', async (event) => {
  const change = event.data;
  if (!change) return;
  const after = change.after.data();
  if (!after) return;

  if (!after.ticketId) {
    const ticketId = await assignTicketId(db, change.after.ref);
    logger.info('ticket assigned (backfill)', { reqId: event.params.reqId, ticketId });
  }

  // Priority sets the response target, so a priority edit also re-evaluates the SLA.
  const priorityChanged = change.before.data()?.priority !== after.priority;
  if (isLifecycleChange(change.before.data(), after) || priorityChanged || !after.kpi) {
    const kpi = await recomputeKpi(change.after.ref);
    logger.info('kpi recomputed', { reqId: event.params.reqId, kpi });
  }
});

/**
 * A supervisor/admin deleted a request: remove its audit history and photos,
 * which clients are not allowed to delete themselves.
 */
export const onMaintenanceRequestDeleted = onDocumentDeleted('maintenanceRequests/{reqId}', async (event) => {
  const reqId = event.params.reqId;
  const { photosError } = await purgeRequestArtifacts(db, reqId, (prefix) =>
    getStorage().bucket().deleteFiles({ prefix }),
  );
  if (photosError) logger.error('could not delete request photos', { reqId, error: String(photosError) });
  logger.info('request deleted; artifacts purged', { reqId, ticketId: event.data?.data()?.ticketId ?? null });
});
