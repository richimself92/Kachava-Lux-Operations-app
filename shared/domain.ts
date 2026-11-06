/**
 * Single source of truth for the Kachava Lux Maintenance domain model.
 * Imported by the frontend (src/) and the Cloud Functions (functions/).
 * firestore.rules restates these enums; tests/unit/rules-parity.test.ts keeps them in sync.
 */

export const TIMEZONE = 'America/Cancun';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export const ROLES = ['staff', 'supervisor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const COMPANY_EMAIL_DOMAIN = 'kachavalux.com';

export function isCompanyEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@' + COMPANY_EMAIL_DOMAIN);
}

export function isSupervisorRole(role: Role | undefined | null): boolean {
  return role === 'supervisor' || role === 'admin';
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export const STATUSES = ['sin_revisar', 'pendiente', 'reconocida', 'completada'] as const;
export type RequestStatus = (typeof STATUSES)[number];

export const INITIAL_STATUS: RequestStatus = 'sin_revisar';

/** Allowed state transitions. `completada` is terminal. */
export const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  sin_revisar: ['pendiente', 'reconocida'],
  pendiente: ['reconocida'],
  reconocida: ['pendiente', 'completada'],
  completada: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Categories, priorities, locations
// ---------------------------------------------------------------------------
export const CATEGORIES = [
  'plumbing',
  'hvac',
  'electrical',
  'pool',
  'jacuzzi',
  'fauna_nociva',
  'carpentry',
  'appliances',
  'lighting',
  'av_tech',
  'structural',
  'glass_windows',
  'grounds',
  'common_areas',
] as const;
export type MaintenanceCategory = (typeof CATEGORIES)[number];

export const COMMON_AREA_SUBLOCATIONS = ['hall', 'parking'] as const;
export type CommonAreaSubLocation = (typeof COMMON_AREA_SUBLOCATIONS)[number];

export const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;
export type RequestPriority = (typeof PRIORITIES)[number];

export const LOCATION_TYPES = ['villa', 'facility'] as const;
export type PropertyLocationType = (typeof LOCATION_TYPES)[number];

export interface LocationDef {
  code: string;
  name: string;
  type: PropertyLocationType;
}

/**
 * Official operational order. Facilities are never villas.
 * Codes are permanent (stored on requests); display names are translated in the UI.
 */
export const LOCATIONS: readonly LocationDef[] = [
  { code: '102', name: 'Villa 102', type: 'villa' },
  { code: '104', name: 'Villa 104', type: 'villa' },
  { code: '106', name: 'Villa 106', type: 'villa' },
  { code: '108', name: 'Villa 108', type: 'villa' },
  { code: '101', name: 'Villa 101', type: 'villa' },
  { code: '103', name: 'Villa 103', type: 'villa' },
  { code: '105', name: 'Villa 105', type: 'villa' },
  { code: '107', name: 'Villa 107', type: 'villa' },
  { code: 'office', name: 'Management Office', type: 'facility' },
  { code: 'warehouse_office', name: 'Warehouse Office', type: 'facility' },
  { code: 'kitchen', name: 'Kitchen', type: 'facility' },
  { code: 'gym', name: 'Gym', type: 'facility' },
  { code: 'storage', name: 'Storage', type: 'facility' },
  { code: 'bodega', name: 'Storeroom', type: 'facility' },
];
export const LOCATION_CODES = LOCATIONS.map((l) => l.code);

export function findLocation(code: string): LocationDef | undefined {
  return LOCATIONS.find((l) => l.code === code);
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------
export const MAX_PHOTOS_PER_KIND = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// ---------------------------------------------------------------------------
// Response SLA
// ---------------------------------------------------------------------------
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Response target per priority. "Urgent: Immediate" is operationalized as 15 minutes (confirmed 2026-11-05). */
export const RESPONSE_SLA_MS: Readonly<Record<RequestPriority, number>> = {
  urgent: 15 * MINUTE,
  high: 2 * HOUR,
  normal: 4 * HOUR,
  low: 24 * HOUR,
};

/** True when a still-unreviewed request has exceeded its response target at `nowMs`. */
export function isResponseOverdue(createdAtMs: number, priority: RequestPriority, nowMs: number): boolean {
  return nowMs - createdAtMs > RESPONSE_SLA_MS[priority];
}

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------
export interface StatusEvent {
  toStatus: RequestStatus;
  atMs: number;
}

export interface KpiResult {
  /** Submission -> first transition out of sin_revisar. null while unreviewed. */
  responseMs: number | null;
  responseSlaMet: boolean | null;
  /** Total closed time spent in reconocida (open segment excluded). */
  workMs: number;
  /** Total closed time spent in pendiente (open segment excluded). */
  blockedMs: number;
  /** Submission -> completada. null while open. */
  totalMs: number | null;
}

/**
 * Pure, idempotent KPI computation from immutable status events.
 * Duplicate events and arbitrary input order produce the same result.
 */
export function computeKpi(
  createdAtMs: number,
  priority: RequestPriority,
  events: readonly StatusEvent[],
  completedAtMs?: number | null,
): KpiResult {
  const seen = new Set<string>();
  const ordered = events
    .filter((e) => {
      const key = `${e.atMs}:${e.toStatus}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.atMs - b.atMs);

  let current: RequestStatus = INITIAL_STATUS;
  let segmentStart = createdAtMs;
  let responseMs: number | null = null;
  let workMs = 0;
  let blockedMs = 0;
  let completionAt: number | null = null;

  for (const ev of ordered) {
    if (ev.toStatus === current) continue;
    const span = Math.max(0, ev.atMs - segmentStart);
    if (current === 'reconocida') workMs += span;
    if (current === 'pendiente') blockedMs += span;
    if (current === 'sin_revisar' && responseMs === null) {
      responseMs = Math.max(0, ev.atMs - createdAtMs);
    }
    current = ev.toStatus;
    segmentStart = ev.atMs;
    if (current === 'completada') {
      completionAt = ev.atMs;
      break;
    }
  }

  const end = completedAtMs ?? completionAt;
  const totalMs = current === 'completada' && end != null ? Math.max(0, end - createdAtMs) : null;

  return {
    responseMs,
    responseSlaMet: responseMs === null ? null : responseMs <= RESPONSE_SLA_MS[priority],
    workMs,
    blockedMs,
    totalMs,
  };
}

/** Live work time: closed reconocida time plus the running segment if currently reconocida. */
export function liveWorkMs(
  status: RequestStatus,
  closedWorkMs: number,
  statusChangedAtMs: number | null,
  nowMs: number,
): number {
  if (status === 'reconocida' && statusChangedAtMs != null) {
    return closedWorkMs + Math.max(0, nowMs - statusChangedAtMs);
  }
  return closedWorkMs;
}

/** Ticket ID format KLM-YYYY-NNNN. */
export function formatTicketId(year: number, seq: number): string {
  return `KLM-${year}-${String(seq).padStart(4, '0')}`;
}
