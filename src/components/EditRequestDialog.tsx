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
    'w-full min-h-11 bg-surface border border-line rounded-sm px-3 text-sm text-ink focus:outline-hidden focus:border-ink cursor-pointer';
  const labelClass = 'kl-label block mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-ink/40" onClick={() => !isSubmitting && onCancel()} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-request-title"
        onSubmit={(e) => void handleSubmit(e)}
        className="relative w-full sm:max-w-md bg-surface border-t sm:border border-line rounded-none sm:rounded-sm p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-4 max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center gap-2">
          <div className="text-brand shrink-0">
            <Pencil className="w-4 h-4" />
          </div>
          <h2 id="edit-request-title" className="text-lg text-ink">
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

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="pt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none min-h-11 px-4 text-sm rounded-sm border border-line-strong text-ink hover:bg-wash disabled:opacity-50 cursor-pointer"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex-1 sm:flex-none min-h-11 px-4 text-sm font-medium rounded-sm bg-brand hover:bg-brand-deep text-surface disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.saveChanges}
          </button>
        </div>
      </form>
    </div>
  );
};
