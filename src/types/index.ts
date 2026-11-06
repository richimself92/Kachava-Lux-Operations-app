import type {
  CommonAreaSubLocation,
  MaintenanceCategory,
  PropertyLocationType,
  RequestPriority,
  RequestStatus,
  Role,
} from '../../shared/domain';

export type {
  CommonAreaSubLocation,
  MaintenanceCategory,
  PropertyLocationType,
  RequestPriority,
  RequestStatus,
  Role,
} from '../../shared/domain';

/** Approved user, stored at users/{emailLower}. */
export interface AppUser {
  /** Lowercase email; also the Firestore document id. */
  email: string;
  displayName: string;
  role: Role;
  title: string;
  phone?: string;
  active: boolean;
  /** Firebase Auth uid, recorded on the user's first sign-in. */
  uid?: string;
  lastSignInAt?: Date | null;
  createdAt?: Date | null;
}

/** Identity of the authenticated actor (uid is the Firebase Auth uid). */
export interface PersonRef {
  uid: string;
  email: string;
  name: string;
}

/** Assignee is referenced by email so supervisors can be assigned before first sign-in. */
export interface AssigneeRef {
  email: string;
  name: string;
}

export type PhotoKind = 'before' | 'after';

export interface PhotoAttachment {
  id: string;
  /** Cloud Storage object path; resolved to a URL at view time (rules-checked). */
  path: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: Date | null;
  uploadedBy: PersonRef;
  kind: PhotoKind;
}

export type AuditAction = 'created' | 'status_changed' | 'reassigned' | 'note_added' | 'photo_added' | 'priority_changed';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  fromStatus?: RequestStatus;
  toStatus?: RequestStatus;
  at: Date | null;
  by: PersonRef & { role: Role };
  details: string;
}

export interface RequestKpi {
  responseMs: number | null;
  responseSlaMet: boolean | null;
  workMs: number;
  blockedMs: number;
  totalMs: number | null;
  computedAt?: Date | null;
}

export interface PropertyLocation {
  id: string;
  code: string; // "102", "office", etc.
  name: string; // "Villa 102", "Office", etc.
  type: PropertyLocationType;
  bedrooms?: number;
  bathrooms?: number;
  isActive: boolean;
}

// Backward-compatible alias for existing code
export type Residence = PropertyLocation;

export interface RequestLocation {
  code: string;
  name: string;
  type: PropertyLocationType;
}

export interface MaintenanceRequest {
  id: string;
  /** Assigned by the backend shortly after creation; undefined until then. */
  ticketId?: string;
  location: RequestLocation;
  category: MaintenanceCategory;
  commonAreaSubLocation?: CommonAreaSubLocation;
  priority: RequestPriority;
  /** Legacy free-text location detail (no longer collected for new requests). */
  locationDetail?: string;
  /** Description: sanitized rich-text HTML (or plain text on older requests). */
  notes: string;
  status: RequestStatus;

  submittedBy: PersonRef;
  createdAt: Date;
  updatedAt: Date | null;

  statusChangedAt: Date | null;
  statusChangedBy?: PersonRef;
  lastAuditId?: string;

  firstResponseAt?: Date | null;
  firstResponseBy?: PersonRef;

  completedAt?: Date | null;
  completedBy?: PersonRef;
  supervisorNotes?: string;

  assignedTo?: AssigneeRef | null;

  beforePhotos: PhotoAttachment[];
  afterPhotos: PhotoAttachment[];

  /** Written only by the backend KPI function. */
  kpi?: RequestKpi;
}

export type TimeFilter = 'all' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface FilterOptions {
  searchQuery: string;
  timeFilter: TimeFilter;
  /** A specific creation day (`YYYY-MM-DD`, Cancun). When set it replaces `timeFilter`. */
  createdOn: string | null;
  status: 'all' | RequestStatus;
  locationCode: 'all' | string;
  /** Assignee email, 'unassigned', or 'all'. */
  assignee: 'all' | 'unassigned' | string;
  category: 'all' | MaintenanceCategory;
  priority: 'all' | RequestPriority;
}

export type Language = 'en' | 'es';
