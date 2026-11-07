import React, { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Camera, CalendarDays, ExternalLink, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, User, X } from 'lucide-react';
import { isResponseOverdue, isSupervisorRole } from '../../shared/domain';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { useNow } from '../hooks/useNow';
import { translations } from '../i18n/translations';
import {
  categoryOptions,
  locationLabel,
  priorityBadge,
  priorityOptions,
  PRIORITY_STYLE,
  requestCategoryLabel,
  statusHelp,
  statusLabel,
  statusOptions,
  STATUS_STYLE,
  ticketLabel,
} from '../lib/labels';
import { richTextToPlain } from '../lib/richText';
import { cancunDateKey, formatCancunDate, formatCancunDateTime, formatCancunShort, formatDateKey } from '../lib/time';
import { ConfirmDialog } from './ConfirmDialog';
import { DatePickerPopover } from './DatePickerPopover';
import { btnPrimary, PageHeader, Segmented } from './Kit';
import { EditRequestDialog } from './EditRequestDialog';
import type { FilterOptions, MaintenanceRequest, TimeFilter } from '../types';

interface RequestListProps {
  onSelectRequest: (req: MaintenanceRequest) => void;
  onOpenNewRequest: () => void;
  onNotify?: (message: string) => void;
}

export const RequestList: React.FC<RequestListProps> = ({ onSelectRequest, onOpenNewRequest, onNotify }) => {
  const { language, role } = useAuth();
  const { requests, filteredRequests, residences, filterOptions, setFilterOptions, resetFilters, assignableSupervisors, loading, loadError, deleteRequest } =
    useRequests();
  const t = translations[language];
  const es = language === 'es';
  const isSupervisor = isSupervisorRole(role);
  // Row actions (enforced in firestore.rules; these only hide the controls):
  // edit = supervisors/admins on open requests, delete = admins only.
  const canDelete = role === 'admin';
  const canEdit = (req: MaintenanceRequest) => isSupervisor && req.status !== 'completada';
  const [editing, setEditing] = useState<MaintenanceRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MaintenanceRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRequest(pendingDelete.id);
      setPendingDelete(null);
      onNotify?.(t.deleteRequestDone);
    } catch (err) {
      console.error('Could not delete request', err);
      setDeleteError(t.deleteRequestFailed);
    } finally {
      setDeleting(false);
    }
  };
  // Overdue markers refresh every 30s.
  const now = useNow(30_000);

  const timeFilters: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: t.periodAll },
    { key: 'daily', label: t.periodDaily },
    { key: 'weekly', label: t.periodWeekly },
    { key: 'monthly', label: t.periodMonthly },
    { key: 'yearly', label: t.periodYearly },
  ];

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const daysWithRequests = useMemo(() => new Set(requests.map((r) => cancunDateKey(r.createdAt))), [requests]);
  const selectedDay = filterOptions.createdOn;

  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  const setFilter = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) =>
    setFilterOptions((prev) => ({ ...prev, [key]: value }));

  const overdue = (req: MaintenanceRequest) =>
    req.status === 'sin_revisar' && isResponseOverdue(req.createdAt.getTime(), req.priority, now.getTime());

  const selectClass =
    'w-full min-h-10 bg-surface border border-line rounded-sm px-2.5 text-sm text-ink focus:outline-hidden focus:border-ink cursor-pointer';
  const labelClass = 'kl-label block mb-1.5';

  const emptyState = loading ? (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      {t.loading}
    </span>
  ) : loadError ? (
    <span className="text-danger">{es ? 'No se pudieron cargar las solicitudes.' : 'Could not load requests.'}</span>
  ) : (
    t.noDataYet
  );

  const ticketCell = (req: MaintenanceRequest) => (
    <span className={req.ticketId ? '' : 'italic text-muted font-normal'}>{ticketLabel(t, req)}</span>
  );

  const overdueBadge = (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-danger" title={t.timerOverdue}>
      <AlertTriangle className="w-3 h-3" />
      {t.timerOverdue}
    </span>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={es ? '02 — Órdenes' : '02 — Work orders'}
        title={t.navRequests}
        meta={
          <>
            {t.filteredResultsCount.replace('{count}', String(filteredRequests.length)).replace('{total}', String(requests.length))}
            {!isSupervisor && <span className="ml-1 text-brand">({es ? 'Tus solicitudes' : 'Your submissions'})</span>}
          </>
        }
        actions={
          <button onClick={onOpenNewRequest} className={btnPrimary}>
            <Plus className="w-4 h-4" />
            {t.navNewRequest}
          </button>
        }
      />

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" strokeWidth={1.5} />
            <input
              type="search"
              value={filterOptions.searchQuery}
              onChange={(e) => setFilter('searchQuery', e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              className="w-full min-h-11 pl-9 pr-3 bg-surface border border-line rounded-sm text-sm focus:outline-hidden focus:border-ink transition-colors"
            />
          </div>
          <div className="flex items-end gap-3 min-w-0">
          <div className="relative shrink-0">
            <div
              className={`flex items-center min-h-10 rounded-sm text-sm whitespace-nowrap transition-colors border ${
                selectedDay ? 'border-ink text-ink bg-surface' : 'border-line text-muted hover:text-ink bg-surface'
              }`}
            >
              <button
                type="button"
                onClick={() => setDatePickerOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={datePickerOpen}
                className="flex items-center gap-1.5 min-h-10 px-3 cursor-pointer"
              >
                <CalendarDays className="w-4 h-4" strokeWidth={1.5} />
                {selectedDay ? formatDateKey(selectedDay, language) : t.filterDate}
              </button>
              {selectedDay && (
                <button
                  type="button"
                  onClick={() => setFilter('createdOn', null)}
                  title={t.clearDate}
                  aria-label={t.clearDate}
                  className="flex items-center min-h-10 pr-2.5 pl-0.5 cursor-pointer text-muted hover:text-ink"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {datePickerOpen && (
              <DatePickerPopover
                value={selectedDay}
                todayKey={cancunDateKey(now)}
                markedDays={daysWithRequests}
                language={language}
                onSelect={(key) => {
                  setFilterOptions((prev) => ({ ...prev, createdOn: key, timeFilter: 'all' }));
                  setDatePickerOpen(false);
                }}
                onClose={() => setDatePickerOpen(false)}
              />
            )}
          </div>
          <Segmented
            label={es ? 'Periodo' : 'Period'}
            options={timeFilters}
            value={selectedDay ? null : filterOptions.timeFilter}
            onChange={(key) => setFilterOptions((prev) => ({ ...prev, timeFilter: key, createdOn: null }))}
            className="flex-1 min-w-0 !ml-0 !pl-1 sm:!pl-0"
          />
          </div>
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-4 ${isSupervisor ? 'lg:grid-cols-5' : ''} gap-x-3 gap-y-3 pt-4 border-t border-line`}>
          <div>
            <label className={labelClass}>{t.filterVilla}</label>
            <select value={filterOptions.locationCode} onChange={(e) => setFilter('locationCode', e.target.value)} className={selectClass}>
              <option value="all">{t.allVillas}</option>
              <optgroup label={t.locGroupVillas}>
                {villasList.map((v) => (
                  <option key={v.id} value={v.code}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t.locGroupOther}>
                {otherLocationsList.map((loc) => (
                  <option key={loc.id} value={loc.code}>
                    {locationLabel(t, loc.code, loc.name)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className={labelClass}>{t.filterStatus}</label>
            <select
              value={filterOptions.status}
              onChange={(e) => setFilter('status', e.target.value as FilterOptions['status'])}
              className={selectClass}
            >
              <option value="all">{t.allStatuses}</option>
              {statusOptions(t).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>{t.filterCategory}</label>
            <select
              value={filterOptions.category}
              onChange={(e) => setFilter('category', e.target.value as FilterOptions['category'])}
              className={selectClass}
            >
              <option value="all">{t.allCategories}</option>
              {categoryOptions(t).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {isSupervisor && (
            <div>
              <label className={labelClass}>{t.filterSupervisor}</label>
              <select value={filterOptions.assignee} onChange={(e) => setFilter('assignee', e.target.value)} className={selectClass}>
                <option value="all">{t.allSupervisors}</option>
                <option value="unassigned">{t.notAssignedYet}</option>
                {assignableSupervisors.map((s) => (
                  <option key={s.email} value={s.email}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className={labelClass}>{t.filterPriority}</label>
              <select
                value={filterOptions.priority}
                onChange={(e) => setFilter('priority', e.target.value as FilterOptions['priority'])}
                className={selectClass}
              >
                <option value="all">{t.allPriorities}</option>
                {priorityOptions(t).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={resetFilters}
              title={t.clearFilters}
              aria-label={t.clearFilters}
              className="inline-flex items-center justify-center w-10 h-10 shrink-0 bg-surface border border-line hover:bg-wash hover:text-ink rounded-sm text-muted cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden xl:block border-y border-line overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line [&_th]:kl-label [&_th]:font-medium">
            <tr>
              <th className="px-3 py-2.5">{t.ticketIdLabel}</th>
              <th className="px-3 py-2.5">{t.filterVilla}</th>
              <th className="px-3 py-2.5">{t.filterCategory}</th>
              <th className="px-3 py-2.5">{t.filterPriority}</th>
              <th className="px-3 py-2.5">{t.filterStatus}</th>
              <th className="px-3 py-3 text-center">{es ? 'Fotos' : 'Photos'}</th>
              <th className="px-3 py-2.5">{t.submittedByLabel}</th>
              <th className="px-3 py-2.5">{t.assignedSupervisorLabel}</th>
              <th className="px-3 py-2.5 text-right">{t.dateTimeColumn}</th>
              {isSupervisor && (
                <th className="w-20">
                  <span className="sr-only">{es ? 'Acciones' : 'Actions'}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={isSupervisor ? 10 : 9} className="px-4 py-10 text-center text-muted">
                  <AlertCircle className="w-7 h-7 text-muted mx-auto mb-1.5" />
                  <div className="font-medium text-sm">{emptyState}</div>
                </td>
              </tr>
            ) : (
              filteredRequests.map((req) => {
                const totalPhotos = req.beforePhotos.length + req.afterPhotos.length;
                return (
                  <tr
                    key={req.id}
                    onClick={() => onSelectRequest(req)}
                    className={`hover:bg-wash/60 cursor-pointer transition-colors group ${overdue(req) ? "bg-danger-wash/40" : ""}`}
                  >
                    <td className="px-3 py-3 text-ink whitespace-nowrap tabular-nums group-hover:text-brand">
                      <span className="flex items-center gap-1.5">
                        {ticketCell(req)}
                        <ExternalLink className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </td>
                    <td className="px-3 py-3 text-brand whitespace-nowrap">
                      {locationLabel(t, req.location.code, req.location.name)}
                    </td>
                    <td className="px-3 py-2.5 text-ink whitespace-nowrap">{requestCategoryLabel(t, req)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[11px] font-medium uppercase tracking-wide ${PRIORITY_STYLE[req.priority]}`}>
                        {priorityBadge(t, req.priority)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className={`px-2 py-0.5 rounded-sm text-[11px] font-medium border ${STATUS_STYLE[req.status]}`} title={statusHelp(t, req.status)}>
                          {statusLabel(t, req.status)}
                        </span>
                        {overdue(req) && overdueBadge}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {totalPhotos > 0 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-wash text-ink text-[11px] font-medium border border-line">
                          <Camera className="w-3 h-3 text-brand" />
                          <span>{req.beforePhotos.length}</span>
                          {req.afterPhotos.length > 0 && <span className="text-[10px] text-ok font-medium">(+{req.afterPhotos.length})</span>}
                        </span>
                      ) : (
                        <span className="text-line-strong text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap">{req.submittedBy.name}</td>
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap">
                      {req.assignedTo?.name ?? <span className="italic text-muted">{t.notAssignedYet}</span>}
                    </td>
                    <td
                      className="px-3 py-2.5 text-muted text-right whitespace-nowrap tabular-nums text-xs"
                      title={formatCancunDateTime(req.createdAt, language)}
                    >
                      {formatCancunShort(req.createdAt, language)}
                    </td>
                    {isSupervisor && (
                      <td className="w-20 pl-1 pr-2 py-1.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-0.5 opacity-50 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          {canEdit(req) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(req);
                              }}
                              title={t.editRequest}
                              aria-label={`${t.editRequest} ${ticketLabel(t, req)}`}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-sm text-muted hover:text-brand hover:bg-brand-wash cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteError(null);
                                setPendingDelete(req);
                              }}
                              title={t.deleteRequest}
                              aria-label={`${t.deleteRequest} ${ticketLabel(t, req)}`}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-sm text-muted hover:text-danger hover:bg-danger-wash cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Phones, tablets and small laptops: cards (1 column, 2 from 640px). */}
      <div className="xl:hidden">
        {filteredRequests.length === 0 ? (
          <div className="border-y border-line py-10 text-center text-muted">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" strokeWidth={1.5} />
            <div className="text-sm">{emptyState}</div>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-px bg-line border border-line sm:[&>li:last-child:nth-child(odd)]:col-span-2">
            {filteredRequests.map((req) => {
              const photos = req.beforePhotos.length + req.afterPhotos.length;
              const showActions = canEdit(req) || canDelete;
              return (
                <li key={req.id} className="bg-surface flex flex-col min-w-0">
                  {overdue(req) && <span className="block h-0.5 bg-danger" aria-hidden />}
                  <button
                    type="button"
                    onClick={() => onSelectRequest(req)}
                    className="flex-1 text-left p-4 space-y-2 active:bg-wash hover:bg-wash/50 transition-colors cursor-pointer min-w-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm text-ink tabular-nums pt-0.5">{ticketCell(req)}</span>
                      <span className="flex flex-wrap items-center justify-end gap-1.5">
                        <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded-sm ${PRIORITY_STYLE[req.priority]}`}>
                          {priorityBadge(t, req.priority)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-sm text-[11px] font-medium border ${STATUS_STYLE[req.status]}`}>
                          {statusLabel(t, req.status)}
                        </span>
                      </span>
                    </div>
                    <div className="text-sm min-w-0">
                      <span className="text-brand">{locationLabel(t, req.location.code, req.location.name)}</span>
                      <span className="text-muted"> · {requestCategoryLabel(t, req)}</span>
                    </div>
                    <p className="text-sm text-muted line-clamp-2 break-words">
                      {req.locationDetail && <span className="text-ink">{req.locationDetail}: </span>}
                      {richTextToPlain(req.notes)}
                    </p>
                    <div className="pt-2 flex items-center justify-between gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">{req.submittedBy.name}</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        {overdue(req) && overdueBadge}
                        {photos > 0 && (
                          <span className="flex items-center gap-1 text-ink">
                            <Camera className="w-3.5 h-3.5" strokeWidth={1.5} />
                            {photos}
                          </span>
                        )}
                        <span className="tabular-nums">{formatCancunShort(req.createdAt, language)}</span>
                      </span>
                    </div>
                  </button>
                  {isSupervisor && showActions && (
                    <div className="flex border-t border-line divide-x divide-line">
                      {canEdit(req) && (
                        <button
                          type="button"
                          onClick={() => setEditing(req)}
                          aria-label={`${t.editRequest} ${ticketLabel(t, req)}`}
                          className="flex-1 inline-flex items-center justify-center gap-2 min-h-11 text-sm text-muted hover:text-ink hover:bg-wash transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" strokeWidth={1.5} />
                          {t.editRequest}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(req);
                          }}
                          aria-label={`${t.deleteRequest} ${ticketLabel(t, req)}`}
                          className="flex-1 inline-flex items-center justify-center gap-2 min-h-11 text-sm text-muted hover:text-danger hover:bg-danger-wash transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                          {t.deleteRequest}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <EditRequestDialog
          // Latest snapshot of the request, in case it changed while the dialog was open.
          request={requests.find((r) => r.id === editing.id) ?? editing}
          onSaved={(msg) => {
            setEditing(null);
            onNotify?.(msg);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t.deleteRequestTitle}
          body={t.deleteRequestBody
            .replace('{ticket}', ticketLabel(t, pendingDelete))
            .replace('{location}', locationLabel(t, pendingDelete.location.code, pendingDelete.location.name))}
          confirmLabel={t.deleteRequestConfirm}
          cancelLabel={t.cancel}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};
