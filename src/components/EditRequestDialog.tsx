import React, { useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import type { MaintenanceCategory, RequestPriority } from '../../shared/domain';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { categoryOptions, locationLabel, priorityOptions, ticketLabel } from '../lib/labels';
import type { MaintenanceRequest } from '../types';

interface EditRequestDialogProps {
  request: MaintenanceRequest;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

/**
 * Supervisor/admin editor for location, category, priority and assigned supervisor of an
 * open request. Permissions are enforced by firestore.rules (isDetailsEdit).
 */
export const EditRequestDialog: React.FC<EditRequestDialogProps> = ({ request, onSaved, onCancel }) => {
  const { language } = useAuth();
  const { residences, assignableSupervisors, editDetails, isSubmitting } = useRequests();
  const t = translations[language];

  const [locationCode, setLocationCode] = useState(request.location.code);
  const [category, setCategory] = useState<MaintenanceCategory>(request.category);
  const [priority, setPriority] = useState<RequestPriority>(request.priority);
  const [assigneeEmail, setAssigneeEmail] = useState(request.assignedTo?.email ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSubmitting, onCancel]);

  const villas = residences.filter((r) => r.type === 'villa');
  const facilities = residences.filter((r) => r.type === 'facility');
  // Keep the current assignee selectable even if they are no longer an active supervisor.
  const supervisors =
    request.assignedTo && !assignableSupervisors.some((s) => s.email === request.assignedTo?.email)
      ? [{ email: request.assignedTo.email, displayName: request.assignedTo.name, title: '' }, ...assignableSupervisors]
      : assignableSupervisors;

  const assignee = supervisors.find((s) => s.email === assigneeEmail);
  const dirty =
    locationCode !== request.location.code ||
    category !== request.category ||
    priority !== request.priority ||
    assigneeEmail !== (request.assignedTo?.email ?? '');
  const canSave = dirty && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    try {
      await editDetails(request, {
        locationCode,
        category,
        priority,
        assignee: assignee ? { email: assignee.email, name: assignee.displayName } : null,
      });
      onSaved(t.editRequestDone);
    } catch (err) {
      console.error('Could not edit request', err);
      setError(t.editRequestFailed);
    }
  };

  const fieldClass =
    'w-full bg-white border border-[#DADCE0] rounded-md px-2 py-1.5 text-sm text-[#202124] focus:outline-hidden focus:border-[#1A73E8]';
  const labelClass = 'block text-xs font-semibold text-[#5F6368] mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/40" onClick={() => !isSubmitting && onCancel()} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-request-title"
        onSubmit={(e) => void handleSubmit(e)}
        className="relative w-full max-w-md bg-white rounded-lg shadow-xl border border-[#DADCE0] p-5 space-y-3.5"
      >
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-[#F4EFEA] text-[#6D4627] shrink-0">
            <Pencil className="w-4 h-4" />
          </div>
          <h2 id="edit-request-title" className="text-base font-semibold text-[#202124]">
            {t.editRequestTitle.replace('{ticket}', ticketLabel(t, request))}
          </h2>
        </div>

        <div>
          <label htmlFor="edit-location" className={labelClass}>
            {t.filterVilla}
          </label>
          <select id="edit-location" value={locationCode} onChange={(e) => setLocationCode(e.target.value)} className={fieldClass}>
            <optgroup label={t.locGroupVillas}>
              {villas.map((v) => (
                <option key={v.id} value={v.code}>
                  {v.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={t.locGroupOther}>
              {facilities.map((loc) => (
                <option key={loc.id} value={loc.code}>
                  {locationLabel(t, loc.code, loc.name)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div>
          <label htmlFor="edit-category" className={labelClass}>
            {t.filterCategory}
          </label>
          <select
            id="edit-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
            className={fieldClass}
          >
            {categoryOptions(t).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="edit-priority" className={labelClass}>
            {t.filterPriority}
          </label>
          <select
            id="edit-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as RequestPriority)}
            className={fieldClass}
          >
            {priorityOptions(t).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="edit-assignee" className={labelClass}>
            {t.assignedSupervisorLabel}
          </label>
          <select id="edit-assignee" value={assigneeEmail} onChange={(e) => setAssigneeEmail(e.target.value)} className={fieldClass}>
            {/* "Unassigned" only while the request has no supervisor yet; it cannot be unassigned. */}
            {!request.assignedTo && <option value="">{t.notAssignedYet}</option>}
            {supervisors.map((s) => (
              <option key={s.email} value={s.email}>
                {s.displayName}
                {s.title ? ` (${s.title})` : ''}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-[#D93025]">{error}</p>}

        <div className="pt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-[#DADCE0] text-[#202124] hover:bg-[#F3F3F1] disabled:opacity-50 cursor-pointer"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="px-3 py-1.5 text-sm font-semibold rounded-md bg-[#6D4627] hover:bg-[#55361D] text-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.saveChanges}
          </button>
        </div>
      </form>
    </div>
  );
};
