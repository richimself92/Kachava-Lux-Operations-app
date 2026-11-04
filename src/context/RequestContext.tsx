import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  MaintenanceRequest, 
  Residence, 
  FilterOptions, 
  PhotoAttachment, 
  AuditLogEntry, 
  AppUser, 
  RequestStatus, 
  MaintenanceCategory, 
  RequestPriority,
  CommonAreaSubLocation
} from '../types';
import { INITIAL_REQUESTS, INITIAL_LOCATIONS } from '../data/initialData';
import { useAuth } from './AuthContext';
import { isLiveFirebase, db, storage, handleFirestoreError, OperationType } from '../services/firebase';
import { collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface RequestContextType {
  requests: MaintenanceRequest[];
  filteredRequests: MaintenanceRequest[];
  residences: Residence[];
  filterOptions: FilterOptions;
  setFilterOptions: React.Dispatch<React.SetStateAction<FilterOptions>>;
  resetFilters: () => void;
  createRequest: (
    data: {
      villaNumber: string;
      category: MaintenanceCategory;
      commonAreaSubLocation?: CommonAreaSubLocation;
      priority: RequestPriority;
      locationDetail: string;
      notes: string;
    },
    photoFiles: File[]
  ) => Promise<string>;
  acknowledgeRequest: (requestId: string, supervisorNotes?: string) => Promise<void>;
  completeRequest: (
    requestId: string,
    completedByName: string,
    supervisorNotes: string,
    afterPhotoFiles: File[]
  ) => Promise<void>;
  reassignSupervisor: (requestId: string, supervisorId: string, supervisorName: string) => Promise<void>;
  updateResidence: (residence: Residence) => void;
  addAuthorizedUser: (userData: Omit<AppUser, 'uid' | 'createdAt'>) => void;
  toggleUserActive: (uid: string) => void;
  usersList: AppUser[];
  selectedRequest: MaintenanceRequest | null;
  setSelectedRequest: (req: MaintenanceRequest | null) => void;
  isSubmitting: boolean;
  activeTicketCountsByVilla: Record<string, number>;
}

const DEFAULT_FILTERS: FilterOptions = {
  searchQuery: '',
  timeFilter: 'all',
  status: 'all',
  villaNumber: 'all',
  supervisorId: 'all',
  category: 'all',
  priority: 'all',
};

const RequestContext = createContext<RequestContextType | undefined>(undefined);

export const RequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, availableUsers } = useAuth();

  const [residences, setResidences] = useState<Residence[]>(INITIAL_LOCATIONS);

  const [requests, setRequests] = useState<MaintenanceRequest[]>(() => {
    const saved = localStorage.getItem('klm_requests_v3');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return INITIAL_REQUESTS;
  });

  const [usersList, setUsersList] = useState<AppUser[]>(availableUsers);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isLiveFirebase) {
      localStorage.setItem('klm_requests_v3', JSON.stringify(requests));
    }
  }, [requests]);

  useEffect(() => {
    if (isLiveFirebase && db && currentUser) {
      const q = collection(db, 'requests');
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const loaded: MaintenanceRequest[] = [];
          snapshot.forEach((docSnapshot) => {
            loaded.push({ id: docSnapshot.id, ...(docSnapshot.data() as any) });
          });
          setRequests(loaded);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'requests');
        }
      );
      return () => unsubscribe();
    }
  }, [currentUser]);

  const resetFilters = () => {
    setFilterOptions(DEFAULT_FILTERS);
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const uploadPhoto = async (
    file: File, 
    requestId: string, 
    type: 'before' | 'after'
  ): Promise<PhotoAttachment> => {
    const photoId = 'p-' + Math.random().toString(36).substring(2, 9);
    let finalUrl = '';

    if (isLiveFirebase && storage) {
      const storageRef = ref(storage, `requests/${requestId}/${type}/${photoId}-${file.name}`);
      const uploadResult = await uploadBytes(storageRef, file);
      finalUrl = await getDownloadURL(uploadResult.ref);
    } else {
      finalUrl = await fileToDataUrl(file);
    }

    return {
      id: photoId,
      url: finalUrl,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
      uploadedByUid: currentUser?.uid || 'anonymous',
      uploadedByName: currentUser?.displayName || 'Staff Member',
      type,
    };
  };

  const createRequest = async (
    data: {
      villaNumber: string;
      category: MaintenanceCategory;
      commonAreaSubLocation?: CommonAreaSubLocation;
      priority: RequestPriority;
      locationDetail: string;
      notes: string;
    },
    photoFiles: File[]
  ): Promise<string> => {
    if (!currentUser) throw new Error('Submitting user is not authenticated');
    setIsSubmitting(true);

    try {
      const location = residences.find((r) => r.code === data.villaNumber);
      const villaName = location ? location.name : `Villa ${data.villaNumber}`;
      const locationType = location?.type || 'villa';
      const nowIso = new Date().toISOString();
      const currentYear = new Date().getFullYear();
      
      const count = requests.length + 1;
      const ticketId = `KLM-${currentYear}-${String(count).padStart(4, '0')}`;
      const tempId = 'req-' + Date.now();

      const uploadedPhotos: PhotoAttachment[] = [];
      const photosToUpload = photoFiles.slice(0, 5);
      for (const file of photosToUpload) {
        const photo = await uploadPhoto(file, tempId, 'before');
        uploadedPhotos.push(photo);
      }

      const initialAudit: AuditLogEntry = {
        id: 'aud-' + Date.now(),
        timestamp: nowIso,
        action: 'created',
        performedByUid: currentUser.uid,
        performedByName: currentUser.displayName,
        performedByRole: currentUser.role,
        details: `Work order submitted for ${villaName} (${data.category}${data.commonAreaSubLocation ? ` - ${data.commonAreaSubLocation}` : ''}). Priority: ${data.priority.toUpperCase()}`,
      };

      const newRequest: MaintenanceRequest = {
        id: tempId,
        ticketId,
        villaNumber: data.villaNumber,
        villaName,
        locationType,
        category: data.category,
        commonAreaSubLocation: data.commonAreaSubLocation,
        priority: data.priority,
        locationDetail: data.locationDetail,
        notes: data.notes,
        status: 'pending',
        submittedBy: {
          uid: currentUser.uid,
          name: currentUser.displayName,
          email: currentUser.email,
          role: currentUser.role,
        },
        createdAt: nowIso,
        photos: uploadedPhotos,
        auditTrail: [initialAudit],
        updatedAt: nowIso,
      };

      if (isLiveFirebase && db) {
        const docRef = await addDoc(collection(db, 'requests'), {
          ...newRequest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        newRequest.id = docRef.id;
      }

      setRequests((prev) => [newRequest, ...prev]);
      return ticketId;
    } finally {
      setIsSubmitting(false);
    }
  };

  const acknowledgeRequest = async (requestId: string, supervisorNotes?: string) => {
    if (!currentUser) throw new Error('Unauthorized');
    const nowIso = new Date().toISOString();

    const auditEntry: AuditLogEntry = {
      id: 'aud-' + Date.now(),
      timestamp: nowIso,
      action: 'acknowledged',
      performedByUid: currentUser.uid,
      performedByName: currentUser.displayName,
      performedByRole: currentUser.role,
      details: supervisorNotes 
        ? `Acknowledged by ${currentUser.displayName}. Note: "${supervisorNotes}"` 
        : `Acknowledged and assigned to ${currentUser.displayName}`,
    };

    if (isLiveFirebase && db) {
      try {
        const docRef = doc(db, 'requests', requestId);
        await updateDoc(docRef, {
          status: 'acknowledged',
          assignedSupervisorId: currentUser.uid,
          assignedSupervisorName: currentUser.displayName,
          acknowledgedAt: serverTimestamp(),
          acknowledgedBy: {
            uid: currentUser.uid,
            name: currentUser.displayName,
          },
          ...(supervisorNotes ? { supervisorNotes } : {}),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
      }
    }

    setRequests((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          const updated: MaintenanceRequest = {
            ...req,
            status: 'acknowledged',
            assignedSupervisorId: currentUser.uid,
            assignedSupervisorName: currentUser.displayName,
            acknowledgedAt: nowIso,
            acknowledgedBy: {
              uid: currentUser.uid,
              name: currentUser.displayName,
            },
            supervisorNotes: supervisorNotes || req.supervisorNotes,
            auditTrail: [...req.auditTrail, auditEntry],
            updatedAt: nowIso,
          };
          if (selectedRequest?.id === requestId) {
            setSelectedRequest(updated);
          }
          return updated;
        }
        return req;
      })
    );
  };

  const completeRequest = async (
    requestId: string,
    completedByName: string,
    supervisorNotes: string,
    afterPhotoFiles: File[]
  ) => {
    if (!currentUser) throw new Error('Unauthorized');
    const target = requests.find((r) => r.id === requestId);
    if (!target) return;

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const createdDate = new Date(target.createdAt).getTime();
      const resolutionHours = Number(((Date.now() - createdDate) / (1000 * 60 * 60)).toFixed(1));

      const newAfterPhotos: PhotoAttachment[] = [];
      for (const file of afterPhotoFiles.slice(0, 5)) {
        const p = await uploadPhoto(file, requestId, 'after');
        newAfterPhotos.push(p);
      }

      const auditEntry: AuditLogEntry = {
        id: 'aud-' + Date.now(),
        timestamp: nowIso,
        action: 'completed',
        performedByUid: currentUser.uid,
        performedByName: currentUser.displayName,
        performedByRole: currentUser.role,
        details: `Work completed by ${completedByName}. Resolution: ${resolutionHours} hrs. Notes: "${supervisorNotes}"`,
      };

      const updatedPhotos = [...target.photos, ...newAfterPhotos];

      if (isLiveFirebase && db) {
        try {
          const docRef = doc(db, 'requests', requestId);
          await updateDoc(docRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
            completedBy: {
              uid: currentUser.uid,
              name: completedByName,
            },
            supervisorNotes,
            resolutionTimeHours: resolutionHours,
            photos: updatedPhotos,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
        }
      }

      setRequests((prev) =>
        prev.map((req) => {
          if (req.id === requestId) {
            const updated: MaintenanceRequest = {
              ...req,
              status: 'completed',
              completedAt: nowIso,
              completedBy: {
                uid: currentUser.uid,
                name: completedByName,
              },
              supervisorNotes,
              resolutionTimeHours: resolutionHours,
              photos: updatedPhotos,
              auditTrail: [...req.auditTrail, auditEntry],
              updatedAt: nowIso,
            };
            if (selectedRequest?.id === requestId) {
              setSelectedRequest(updated);
            }
            return updated;
          }
          return req;
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const reassignSupervisor = async (requestId: string, supervisorId: string, supervisorName: string) => {
    if (!currentUser) throw new Error('Unauthorized');
    const nowIso = new Date().toISOString();

    const auditEntry: AuditLogEntry = {
      id: 'aud-' + Date.now(),
      timestamp: nowIso,
      action: 'reassigned',
      performedByUid: currentUser.uid,
      performedByName: currentUser.displayName,
      performedByRole: currentUser.role,
      details: `Reassigned to supervisor ${supervisorName} by ${currentUser.displayName}`,
    };

    setRequests((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          const updated: MaintenanceRequest = {
            ...req,
            assignedSupervisorId: supervisorId,
            assignedSupervisorName: supervisorName,
            auditTrail: [...req.auditTrail, auditEntry],
            updatedAt: nowIso,
          };
          if (selectedRequest?.id === requestId) {
            setSelectedRequest(updated);
          }
          return updated;
        }
        return req;
      })
    );
  };

  const updateResidence = (updated: Residence) => {
    setResidences((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const addAuthorizedUser = (userData: Omit<AppUser, 'uid' | 'createdAt'>) => {
    const newUser: AppUser = {
      ...userData,
      uid: 'user-' + Date.now(),
      isFirebaseVerified: false,
      createdAt: new Date().toISOString(),
    };
    setUsersList((prev) => [newUser, ...prev]);
  };

  const toggleUserActive = (uid: string) => {
    setUsersList((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, active: !u.active } : u))
    );
  };

  const activeTicketCountsByVilla = residences.reduce((acc, loc) => {
    const count = requests.filter(
      (r) => r.villaNumber === loc.code && r.status !== 'completed'
    ).length;
    acc[loc.code] = count;
    return acc;
  }, {} as Record<string, number>);

  const filteredRequests = requests.filter((req) => {
    if (currentUser?.role === 'staff' && req.submittedBy.uid !== currentUser.uid) {
      return false;
    }

    if (filterOptions.status !== 'all' && req.status !== filterOptions.status) {
      return false;
    }

    if (filterOptions.villaNumber !== 'all' && req.villaNumber !== filterOptions.villaNumber) {
      return false;
    }

    if (filterOptions.supervisorId !== 'all') {
      if (filterOptions.supervisorId === 'unassigned') {
        if (req.assignedSupervisorId) return false;
      } else if (req.assignedSupervisorId !== filterOptions.supervisorId) {
        return false;
      }
    }

    if (filterOptions.category !== 'all' && req.category !== filterOptions.category) {
      return false;
    }

    if (filterOptions.priority !== 'all' && req.priority !== filterOptions.priority) {
      return false;
    }

    if (filterOptions.timeFilter !== 'all') {
      const reqDate = new Date(req.createdAt);
      const now = new Date();

      if (filterOptions.timeFilter === 'daily') {
        const isSameDay =
          reqDate.getFullYear() === now.getFullYear() &&
          reqDate.getMonth() === now.getMonth() &&
          reqDate.getDate() === now.getDate();
        if (!isSameDay) return false;
      } else if (filterOptions.timeFilter === 'weekly') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        if (reqDate < oneWeekAgo) return false;
      } else if (filterOptions.timeFilter === 'monthly') {
        const isSameMonth =
          reqDate.getFullYear() === now.getFullYear() &&
          reqDate.getMonth() === now.getMonth();
        if (!isSameMonth) return false;
      } else if (filterOptions.timeFilter === 'yearly') {
        if (reqDate.getFullYear() !== now.getFullYear()) return false;
      }
    }

    if (filterOptions.searchQuery.trim()) {
      const q = filterOptions.searchQuery.toLowerCase();
      const match =
        req.ticketId.toLowerCase().includes(q) ||
        req.villaName.toLowerCase().includes(q) ||
        req.villaNumber.toLowerCase().includes(q) ||
        req.notes.toLowerCase().includes(q) ||
        req.locationDetail.toLowerCase().includes(q) ||
        (req.commonAreaSubLocation && req.commonAreaSubLocation.toLowerCase().includes(q)) ||
        req.submittedBy.name.toLowerCase().includes(q) ||
        (req.assignedSupervisorName && req.assignedSupervisorName.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  return (
    <RequestContext.Provider
      value={{
        requests,
        filteredRequests,
        residences,
        filterOptions,
        setFilterOptions,
        resetFilters,
        createRequest,
        acknowledgeRequest,
        completeRequest,
        reassignSupervisor,
        updateResidence,
        addAuthorizedUser,
        toggleUserActive,
        usersList,
        selectedRequest,
        setSelectedRequest,
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
  if (!context) {
    throw new Error('useRequests must be used within a RequestProvider');
  }
  return context;
};
