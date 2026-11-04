export type Role = 'staff' | 'supervisor' | 'admin';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  title: string;
  phone?: string;
  active: boolean;
  isFirebaseVerified?: boolean;
  createdAt: string;
}

export type RequestStatus = 'pending' | 'acknowledged' | 'completed';

export type RequestPriority = 'urgent' | 'high' | 'normal' | 'low';

export type MaintenanceCategory =
  | 'plumbing'
  | 'hvac'
  | 'electrical'
  | 'pool'
  | 'spa'
  | 'carpentry'
  | 'appliances'
  | 'lighting'
  | 'av_tech'
  | 'structural'
  | 'glass_windows'
  | 'grounds'
  | 'common_areas';

export type CommonAreaSubLocation = 'hall' | 'parking';

export interface PhotoAttachment {
  id: string;
  url: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  uploadedByUid: string;
  uploadedByName: string;
  type: 'before' | 'after';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: 'created' | 'acknowledged' | 'reassigned' | 'completed' | 'note_added' | 'photo_added';
  performedByUid: string;
  performedByName: string;
  performedByRole: Role;
  details: string;
}

export type PropertyLocationType = 'villa' | 'facility';

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

export interface MaintenanceRequest {
  id: string;
  ticketId: string;
  villaNumber: string; // Location identifier code: "102"..."107", "office", "gym", "storage"
  villaName: string; // "Villa 102", "Office", etc.
  locationType?: PropertyLocationType;
  category: MaintenanceCategory;
  commonAreaSubLocation?: CommonAreaSubLocation;
  priority: RequestPriority;
  locationDetail: string;
  notes: string;
  status: RequestStatus;
  
  submittedBy: {
    uid: string;
    name: string;
    email: string;
    role: Role;
  };
  createdAt: string;
  
  assignedSupervisorId?: string;
  assignedSupervisorName?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: {
    uid: string;
    name: string;
  };
  
  completedAt?: string;
  completedBy?: {
    uid: string;
    name: string;
  };
  supervisorNotes?: string;
  resolutionTimeHours?: number;
  
  photos: PhotoAttachment[];
  auditTrail: AuditLogEntry[];
  updatedAt: string;
}

export type TimeFilter = 'all' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface FilterOptions {
  searchQuery: string;
  timeFilter: TimeFilter;
  status: 'all' | RequestStatus;
  villaNumber: 'all' | string;
  supervisorId: 'all' | string;
  category: 'all' | MaintenanceCategory;
  priority: 'all' | RequestPriority;
}

export type Language = 'en' | 'es';
