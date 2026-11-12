/**
 * Firestore/Storage operations for maintenance requests.
 *
 * Every mutation is a batch that pairs the request change with an append-only audit
 * entry (`lastAuditId`), exactly as `firestore.rules` requires. Timestamps are always
 * server timestamps; the client never writes durations, ticket IDs or KPIs.
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import {
  ALLOWED_PHOTO_TYPES,
  canReopen,
  canTransition,
  findLocation,
  INITIAL_STATUS,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_KIND,
  REOPEN_STATUS,
  type CommonAreaSubLocation,
  type MaintenanceCategory,
  type RequestPriority,
  type RequestStatus,
  type Role,
} from '../../shared/domain';
import type {
  AssigneeRef,
  AuditAction,
  AuditLogEntry,
  MaintenanceRequest,
  PersonRef,
  PhotoAttachment,
  PhotoKind,
} from '../types';

export const REQUESTS = 'maintenanceRequests';

/** The signed-in approved user performing an action (name = allowlist displayName). */
export interface Actor extends PersonRef {
  role: Role;
}

const personRef = (a: Actor): PersonRef => ({ uid: a.uid, email: a.email, name: a.name });

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function toDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

function toPhotos(v: unknown): PhotoAttachment[] {
  if (!Array.isArray(v)) return [];
  return v.map((p) => ({ ...p, uploadedAt: toDate(p.uploadedAt) }) as PhotoAttachment);
}

export function toRequest(id: string, d: DocumentData): MaintenanceRequest {
  return {
    id,
    ticketId: d.ticketId,
    location: d.location,
    category: d.category,
    commonAreaSubLocation: d.commonAreaSubLocation,
    priority: d.priority,
    locationDetail: d.locationDetail || undefined,
    notes: d.notes ?? '',
    status: d.status,
    submittedBy: d.submittedBy,
    // serverTimestamps:'estimate' fills pending writes, so createdAt is never null here.
    createdAt: toDate(d.createdAt) ?? new Date(),
    updatedAt: toDate(d.updatedAt),
    statusChangedAt: toDate(d.statusChangedAt),
    statusChangedBy: d.statusChangedBy,
    lastAuditId: d.lastAuditId,
    firstResponseAt: toDate(d.firstResponseAt),
    firstResponseBy: d.firstResponseBy,
    completedAt: toDate(d.completedAt),
    completedBy: d.completedBy,
    supervisorNotes: d.supervisorNotes,
    assignedTo: d.assignedTo ?? null,
    beforePhotos: toPhotos(d.beforePhotos),
    afterPhotos: toPhotos(d.afterPhotos),
    reopenPhotos: toPhotos(d.reopenPhotos),
    kpi: d.kpi
      ? {
          responseMs: d.kpi.responseMs ?? null,
          responseSlaMet: d.kpi.responseSlaMet ?? null,
          workMs: d.kpi.workMs ?? 0,
          blockedMs: d.kpi.blockedMs ?? 0,
          totalMs: d.kpi.totalMs ?? null,
          computedAt: toDate(d.kpi.computedAt),
        }
      : undefined,
  };
}

/** Staff see only their own submissions; supervisors and admins see all. */
export function subscribeRequests(
  db: Firestore,
  scope: { uid: string; seesAll: boolean },
  onData: (r: MaintenanceRequest[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const col = collection(db, REQUESTS);
  const q = scope.seesAll
    ? query(col, orderBy('createdAt', 'desc'))
    : query(col, where('submittedBy.uid', '==', scope.uid), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => toRequest(d.id, d.data({ serverTimestamps: 'estimate' })))),
    onError,
  );
}

export function subscribeAudit(
  db: Firestore,
  reqId: string,
  onData: (a: AuditLogEntry[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, REQUESTS, reqId, 'audit'), orderBy('at', 'asc')),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            action: x.action,
            fromStatus: x.fromStatus,
            toStatus: x.toStatus,
            at: toDate(x.at),
            by: x.by,
            details: x.details ?? '',
          };
        }),
      ),
    onError,
  );
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export class PhotoValidationError extends Error {
  constructor(
    public readonly reason: 'too_many' | 'too_large' | 'bad_type',
    public readonly fileName?: string,
  ) {
    super(`${reason}${fileName ? `: ${fileName}` : ''}`);
  }
}

export function validatePhotos(files: File[], existingCount = 0): void {
  if (existingCount + files.length > MAX_PHOTOS_PER_KIND) throw new PhotoValidationError('too_many');
  for (const f of files) {
    if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(f.type)) throw new PhotoValidationError('bad_type', f.name);
    if (f.size > MAX_PHOTO_BYTES) throw new PhotoValidationError('too_large', f.name);
  }
}

/** Starts a batch that updates the request and appends its paired audit entry. */
function pairedBatch(
  db: Firestore,
  actor: Actor,
  reqId: string,
  changes: Record<string, unknown>,
  audit: { action: AuditAction; details: string; fromStatus?: RequestStatus; toStatus?: RequestStatus },
) {
  const reqRef = doc(db, REQUESTS, reqId);
  const auditRef = doc(collection(db, REQUESTS, reqId, 'audit'));
  const batch = writeBatch(db);
  batch.update(reqRef, { ...changes, updatedAt: serverTimestamp(), lastAuditId: auditRef.id });
  batch.set(auditRef, { ...audit, at: serverTimestamp(), by: { ...personRef(actor), role: actor.role } });
  return batch;
}

export interface NewRequestInput {
  locationCode: string;
  category: MaintenanceCategory;
  commonAreaSubLocation?: CommonAreaSubLocation;
  priority: RequestPriority;
  /** Optional legacy field; the form no longer asks for it. */
  locationDetail?: string;
  notes: string;
}

/** Creates the request (status sin_revisar, server-time creation). Returns its id. */
export async function createRequestDoc(db: Firestore, actor: Actor, input: NewRequestInput): Promise<string> {
  const loc = findLocation(input.locationCode);
  if (!loc) throw new Error(`Unknown location ${input.locationCode}`);
  const reqRef = doc(collection(db, REQUESTS));
  const auditRef = doc(collection(db, REQUESTS, reqRef.id, 'audit'));
  const batch = writeBatch(db);
  batch.set(reqRef, {
    location: { code: loc.code, name: loc.name, type: loc.type },
    category: input.category,
    ...(input.category === 'common_areas' && input.commonAreaSubLocation
      ? { commonAreaSubLocation: input.commonAreaSubLocation }
      : {}),
    priority: input.priority,
    ...(input.locationDetail?.trim() ? { locationDetail: input.locationDetail.trim() } : {}),
    notes: input.notes.trim(),
    status: INITIAL_STATUS,
    submittedBy: personRef(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    statusChangedAt: serverTimestamp(),
    beforePhotos: [],
    afterPhotos: [],
    lastAuditId: auditRef.id,
  });
  batch.set(auditRef, {
    action: 'created',
    // Codes, not labels: the audit view translates them (see src/lib/auditText.ts).
    details: `${loc.code} · ${input.category} · ${input.priority}`,
    at: serverTimestamp(),
    by: { ...personRef(actor), role: actor.role },
  });
  await batch.commit();
  return reqRef.id;
}

function newPhotoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Uploads files to `maintenanceRequests/{id}/{kind}/{photoId}` (no overwrites).
 * Returns attachments for those that uploaded, plus the names that failed.
 */
export async function uploadPhotos(
  storage: FirebaseStorage,
  actor: Actor,
  reqId: string,
  kind: PhotoKind,
  files: File[],
): Promise<{ uploaded: PhotoAttachment[]; failed: string[] }> {
  const uploaded: PhotoAttachment[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const id = newPhotoId();
    const path = `${REQUESTS}/${reqId}/${kind}/${id}`;
    try {
      await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      uploaded.push({
        id,
        path,
        fileName: file.name.slice(0, 200),
        sizeBytes: file.size,
        mimeType: file.type,
        uploadedAt: new Date(),
        uploadedBy: personRef(actor),
        kind,
      });
    } catch (err) {
      console.error(`Photo upload failed: ${file.name}`, err);
      failed.push(file.name);
    }
  }
  return { uploaded, failed };
}

const photoRecord = (p: PhotoAttachment) => ({
  ...p,
  uploadedAt: p.uploadedAt ? Timestamp.fromDate(p.uploadedAt) : Timestamp.now(),
});

/** Appends uploaded photos to the request (submitter: before; supervisor: after). */
export async function attachPhotos(
  db: Firestore,
  actor: Actor,
  req: Pick<MaintenanceRequest, 'id' | 'beforePhotos' | 'afterPhotos'>,
  kind: Exclude<PhotoKind, 'reopen'>,
  photos: PhotoAttachment[],
): Promise<void> {
  if (photos.length === 0) return;
  const field = kind === 'before' ? 'beforePhotos' : 'afterPhotos';
  const existing = kind === 'before' ? req.beforePhotos : req.afterPhotos;
  await pairedBatch(
    db,
    actor,
    req.id,
    { [field]: [...existing, ...photos].map(photoRecord) },
    { action: 'photo_added', details: `${photos.length} ${kind} photo(s): ${photos.map((p) => p.fileName).join(', ')}`.slice(0, 2000) },
  ).commit();
}

export interface StatusChangeOptions {
  /** Reason / note recorded in the audit trail (e.g. why it is pending). */
  note?: string;
  /** Required when completing: resolution notes stored on the request. */
  resolutionNotes?: string;
  /** Already-uploaded after photos to attach on completion. */
  afterPhotos?: PhotoAttachment[];
}

/** Supervisor/admin lifecycle transition, with first response and auto-assignment. */
export async function changeStatus(
  db: Firestore,
  actor: Actor,
  req: MaintenanceRequest,
  to: RequestStatus,
  opts: StatusChangeOptions = {},
): Promise<void> {
  if (!canTransition(req.status, to)) throw new Error(`Transition ${req.status} → ${to} not allowed`);
  if (to === 'pendiente' && !opts.note?.trim()) throw new Error('A reason is required to mark a request pending');
  const me = personRef(actor);
  const changes: Record<string, unknown> = {
    status: to,
    statusChangedAt: serverTimestamp(),
    statusChangedBy: me,
  };
  if (req.status === 'sin_revisar') {
    changes.firstResponseAt = serverTimestamp();
    changes.firstResponseBy = me;
  }
  if (!req.assignedTo) {
    changes.assignedTo = { email: actor.email, name: actor.name } satisfies AssigneeRef;
  }
  if (to === 'completada') {
    const resolution = opts.resolutionNotes?.trim() ?? '';
    if (!resolution) throw new Error('Resolution notes are required to complete a request');
    changes.completedAt = serverTimestamp();
    changes.completedBy = me;
    changes.supervisorNotes = resolution.slice(0, 2000);
    if (opts.afterPhotos?.length) {
      changes.afterPhotos = [...req.afterPhotos, ...opts.afterPhotos].map(photoRecord);
    }
  }
  const details = (to === 'completada' ? opts.resolutionNotes : opts.note)?.trim() ?? '';
  await pairedBatch(db, actor, req.id, changes, {
    action: 'status_changed',
    fromStatus: req.status,
    toStatus: to,
    details: details.slice(0, 2000),
  }).commit();
}

/**
 * Admin: returns a completed request to pending because the work was not done correctly.
 * Clears the completion record from the request; the audit history keeps the previous completion.
 */
export async function reopenRequest(
  db: Firestore,
  actor: Actor,
  req: MaintenanceRequest,
  reason: string,
  photos: PhotoAttachment[] = [],
): Promise<void> {
  if (!canReopen(actor.role, req.status)) throw new Error('Only admins can reopen a completed request');
  const details = reason.trim();
  if (!details) throw new Error('A reason is required to reopen a request');
  const changes: Record<string, unknown> = {
    status: REOPEN_STATUS,
    statusChangedAt: serverTimestamp(),
    statusChangedBy: personRef(actor),
    completedAt: deleteField(),
    completedBy: deleteField(),
    supervisorNotes: deleteField(),
  };
  if (photos.length > 0) changes.reopenPhotos = [...req.reopenPhotos, ...photos].map(photoRecord);
  await pairedBatch(db, actor, req.id, changes, {
    action: 'status_changed',
    fromStatus: req.status,
    toStatus: REOPEN_STATUS,
    details: details.slice(0, 2000),
  }).commit();
}

/** Supervisor/admin: reassign to another active supervisor/admin. */
export async function reassign(db: Firestore, actor: Actor, req: MaintenanceRequest, to: AssigneeRef): Promise<void> {
  await pairedBatch(
    db,
    actor,
    req.id,
    { assignedTo: { email: to.email, name: to.name } },
    { action: 'reassigned', details: `${req.assignedTo?.name ?? '—'} → ${to.name}` },
  ).commit();
}

export interface RequestDetailsEdit {
  locationCode: string;
  category: MaintenanceCategory;
  priority: RequestPriority;
  /** null = leave unassigned (only allowed if it already was). */
  assignee: AssigneeRef | null;
}

/**
 * Supervisor/admin: edit location, category, priority and assigned supervisor of an open
 * request in one write. Audit details list each changed field as `field: old → new`
 * (codes, or names for the assignee), separated by `; ` — translated by src/lib/auditText.ts.
 * Changing the category away from common_areas also drops the sub-location (`area`).
 * Returns false when nothing changed.
 */
export async function editRequestDetails(
  db: Firestore,
  actor: Actor,
  req: MaintenanceRequest,
  edit: RequestDetailsEdit,
): Promise<boolean> {
  if (req.status === 'completada') throw new Error('Completed requests cannot be changed');
  const loc = findLocation(edit.locationCode);
  if (!loc) throw new Error(`Unknown location ${edit.locationCode}`);
  // The editor does not ask for the common-area sub-location: an existing one is kept while the
  // category stays common_areas, and removed when the category changes.
  const subLocation = edit.category === 'common_areas' && req.category === 'common_areas' ? req.commonAreaSubLocation : undefined;

  const changes: Record<string, unknown> = {};
  const parts: string[] = [];
  if (loc.code !== req.location.code) {
    changes.location = { code: loc.code, name: loc.name, type: loc.type };
    parts.push(`location: ${req.location.code} → ${loc.code}`);
  }
  if (edit.category !== req.category) {
    changes.category = edit.category;
    parts.push(`category: ${req.category} → ${edit.category}`);
  }
  if ((subLocation ?? null) !== (req.commonAreaSubLocation ?? null)) {
    changes.commonAreaSubLocation = subLocation ?? deleteField();
    parts.push(`area: ${req.commonAreaSubLocation ?? '—'} → ${subLocation ?? '—'}`);
  }
  if (edit.priority !== req.priority) {
    changes.priority = edit.priority;
    parts.push(`priority: ${req.priority} → ${edit.priority}`);
  }
  if (edit.assignee && edit.assignee.email !== req.assignedTo?.email) {
    changes.assignedTo = { email: edit.assignee.email, name: edit.assignee.name };
    parts.push(`assignee: ${req.assignedTo?.name ?? '—'} → ${edit.assignee.name}`);
  }
  if (parts.length === 0) return false;

  await pairedBatch(db, actor, req.id, changes, { action: 'details_edited', details: parts.join('; ') }).commit();
  return true;
}

/** Adds a note to the request's audit history (staff: own unreviewed; supervisors: open requests). */
export async function addNote(db: Firestore, actor: Actor, reqId: string, note: string): Promise<void> {
  const text = note.trim();
  if (!text) return;
  await pairedBatch(db, actor, reqId, {}, { action: 'note_added', details: text.slice(0, 2000) }).commit();
}

/**
 * Supervisor/admin: permanently deletes a request. The server-side
 * onMaintenanceRequestDeleted function purges its audit history and photos.
 */
export async function deleteRequest(db: Firestore, reqId: string): Promise<void> {
  await deleteDoc(doc(db, REQUESTS, reqId));
}
