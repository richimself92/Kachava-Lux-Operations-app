import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupervisorRole } from '../../shared/domain';
import { INITIAL_LOCATIONS } from '../data/initialData';
import { richTextToPlain } from '../lib/richText';
import { cancunDateKey, isInPeriod } from '../lib/time';
import { db, storage } from '../services/firebase';
import {
  addNote as addNoteOp,
  deleteRequest as deleteRequestOp,
  attachPhotos,
  changeStatus as changeStatusOp,
  createRequestDoc,
  editRequestDetails as editRequestDetailsOp,
  type RequestDetailsEdit,
  subscribeRequests,
  uploadPhotos,
  validatePhotos,
  type Actor,
  type NewRequestInput,
} from '../services/requests';
import { subscribeUsers } from '../services/users';
import type {
  AppUser,
  FilterOptions,
  MaintenanceRequest,
  PhotoKind,
  RequestStatus,
  Residence,
} from '../types';
import { useAuth } from './AuthContext';

interface RequestContextType {
  requests: MaintenanceRequest[];
  filteredRequests: MaintenanceRequest[];
  loading: boolean;
  loadError: boolean;
  residences: Residence[];
  filterOptions: FilterOptions;
  setFilterOptions: React.Dispatch<React.SetStateAction<FilterOptions>>;
  resetFilters: () => void;
  /** Creates the request, then uploads before photos. Returns the id and any photo names that failed. */
  createRequest: (input: NewRequestInput, photoFiles: File[]) => Promise<{ id: string; failedPhotos: string[] }>;
  /** Lifecycle transition (supervisors/admins). After photos are uploaded before completing. */
  changeStatus: (
    req: MaintenanceRequest,
    to: RequestStatus,
    opts?: { note?: string; resolutionNotes?: string; afterPhotoFiles?: File[] },
  ) => Promise<{ failedPhotos: string[] }>;
  /** Supervisor/admin: edit location, category, priority and assignee. Resolves false if nothing changed. */
  editDetails: (req: MaintenanceRequest, edit: RequestDetailsEdit) => Promise<boolean>;
  addNote: (reqId: string, note: string) => Promise<void>;
  deleteRequest: (reqId: string) => Promise<void>;
  addPhotos: (req: MaintenanceRequest, kind: PhotoKind, files: File[]) => Promise<{ failedPhotos: string[] }>;
  /** Active supervisors/admins (loaded for supervisors only) for reassignment and filters. */
  assignableSupervisors: AppUser[];
  isSubmitting: boolean;
  activeTicketCountsByVilla: Record<string, number>;
}

export const DEFAULT_FILTERS: FilterOptions = {
  searchQuery: '',
  timeFilter: 'all',
  createdOn: null,
  status: 'all',
  locationCode: 'all',
  assignee: 'all',
  category: 'all',
  priority: 'all',
};

const RequestContext = createContext<RequestContextType | undefined>(undefined);

export const RequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const seesAll = isSupervisorRole(currentUser?.role);

  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);

  const uid = currentUser?.uid;
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    setLoadError(false);
    return subscribeRequests(
      db(),
      { uid, seesAll },
      (list) => {
        setRequests(list);
        setLoading(false);
      },
      (err) => {
        console.error('Could not load requests', err);
        setLoadError(true);
        setLoading(false);
      },
    );
  }, [uid, seesAll]);

  useEffect(() => {
    if (!seesAll) {
      setUsers([]);
      return;
    }
    return subscribeUsers(setUsers, (err) => console.error('Could not load users', err));
  }, [seesAll]);

  const assignableSupervisors = useMemo(
    () => users.filter((u) => u.active && isSupervisorRole(u.role)),
    [users],
  );

  const actor = useCallback((): Actor => {
    if (!currentUser) throw new Error('Not signed in');
    return { uid: currentUser.uid, email: currentUser.email, name: currentUser.displayName, role: currentUser.role };
  }, [currentUser]);

  const resetFilters = () => setFilterOptions(DEFAULT_FILTERS);

  const withSubmitting = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setIsSubmitting(true);
    try {
      return await fn();
    } finally {
      setIsSubmitting(false);
    }
  };

  const createRequest: RequestContextType['createRequest'] = (input, photoFiles) =>
    withSubmitting(async () => {
      validatePhotos(photoFiles);
      const a = actor();
      const id = await createRequestDoc(db(), a, input);
      if (photoFiles.length === 0) return { id, failedPhotos: [] };
      // The request exists now, so Storage rules can verify ownership of the upload path.
      const { uploaded, failed } = await uploadPhotos(storage(), a, id, 'before', photoFiles);
      try {
        await attachPhotos(db(), a, { id, beforePhotos: [], afterPhotos: [] }, 'before', uploaded);
      } catch (err) {
        console.error('Could not attach photos', err);
        return { id, failedPhotos: photoFiles.map((f) => f.name) };
      }
      return { id, failedPhotos: failed };
    });

  const changeStatus: RequestContextType['changeStatus'] = (req, to, opts = {}) =>
    withSubmitting(async () => {
      const a = actor();
      let failedPhotos: string[] = [];
      let afterPhotos;
      if (to === 'completada' && opts.afterPhotoFiles?.length) {
        validatePhotos(opts.afterPhotoFiles, req.afterPhotos.length);
        const res = await uploadPhotos(storage(), a, req.id, 'after', opts.afterPhotoFiles);
        afterPhotos = res.uploaded;
        failedPhotos = res.failed;
      }
      await changeStatusOp(db(), a, req, to, {
        note: opts.note,
        resolutionNotes: opts.resolutionNotes,
        afterPhotos,
      });
      return { failedPhotos };
    });


  const editDetails: RequestContextType['editDetails'] = (req, edit) =>
    withSubmitting(() => editRequestDetailsOp(db(), actor(), req, edit));

  const addNote: RequestContextType['addNote'] = (reqId, note) =>
    withSubmitting(() => addNoteOp(db(), actor(), reqId, note));

  const deleteRequest: RequestContextType['deleteRequest'] = (reqId) =>
    withSubmitting(() => deleteRequestOp(db(), reqId));

  const addPhotos: RequestContextType['addPhotos'] = (req, kind, files) =>
    withSubmitting(async () => {
      const existing = kind === 'before' ? req.beforePhotos : req.afterPhotos;
      validatePhotos(files, existing.length);
      const a = actor();
      const { uploaded, failed } = await uploadPhotos(storage(), a, req.id, kind, files);
      await attachPhotos(db(), a, req, kind, uploaded);
      return { failedPhotos: failed };
    });

  const activeTicketCountsByVilla = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of requests) {
      if (r.status !== 'completada') counts[r.location.code] = (counts[r.location.code] ?? 0) + 1;
    }
    return counts;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const now = new Date();
    const q = filterOptions.searchQuery.trim().toLowerCase();
    return requests.filter((req) => {
      if (filterOptions.status !== 'all' && req.status !== filterOptions.status) return false;
      if (filterOptions.locationCode !== 'all' && req.location.code !== filterOptions.locationCode) return false;
      if (filterOptions.assignee === 'unassigned' && req.assignedTo) return false;
      if (
        filterOptions.assignee !== 'all' &&
        filterOptions.assignee !== 'unassigned' &&
        req.assignedTo?.email !== filterOptions.assignee
      )
        return false;
      if (filterOptions.category !== 'all' && req.category !== filterOptions.category) return false;
      if (filterOptions.priority !== 'all' && req.priority !== filterOptions.priority) return false;
      if (filterOptions.createdOn) {
        if (cancunDateKey(req.createdAt) !== filterOptions.createdOn) return false;
      } else if (!isInPeriod(req.createdAt, filterOptions.timeFilter, now)) return false;
      if (q) {
        const haystack = [
          req.ticketId,
          req.location.name,
          req.location.code,
          richTextToPlain(req.notes),
          req.locationDetail,
          req.commonAreaSubLocation,
          req.submittedBy.name,
          req.assignedTo?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [requests, filterOptions]);

  return (
    <RequestContext.Provider
      value={{
        requests,
        filteredRequests,
        loading,
        loadError,
        residences: INITIAL_LOCATIONS,
        filterOptions,
        setFilterOptions,
        resetFilters,
        createRequest,
        changeStatus,
        editDetails,
        addNote,
        deleteRequest,
        addPhotos,
        assignableSupervisors,
        isSubmitting,
        activeTicketCountsByVilla,
      }}
    >
      {children}
    </RequestContext.Provider>
  );
};

export const useRequests = () => {
  const context = useContext(RequestContext);
  if (!context) throw new Error('useRequests must be used within a RequestProvider');
  return context;
};
