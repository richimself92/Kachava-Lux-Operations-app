import React, { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Camera, CalendarDays, ExternalLink, Loader2, Pencil, RotateCcw, Search, Trash2, User, X } from 'lucide-react';
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
    'w-full bg-white border border-[#DADCE0] rounded-md px-2 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]';
  const labelClass = 'block text-[10px] font-semibold text-[#5F6368] uppercase mb-1';

  const emptyState = loading ? (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      {t.loading}
    </span>
  ) : loadError ? (
    <span className="text-[#D93025]">{es ? 'No se pudieron cargar las solicitudes.' : 'Could not load requests.'}</span>
  ) : (
    t.noDataYet
  );

  const ticketCell = (req: MaintenanceRequest) => (
    <span className={req.ticketId ? '' : 'italic text-[#70757A] font-normal'}>{ticketLabel(t, req)}</span>
  );

  const overdueBadge = (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#D93025]" title={t.timerOverdue}>
      <AlertTriangle className="w-3 h-3" />
      {t.timerOverdue}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#DADCE0]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">{t.navRequests}</h1>
          <p className="text-xs text-[#5F6368]">
            {t.filteredResultsCount.replace('{count}', String(filteredRequests.length)).replace('{total}', String(requests.length))}
            {!isSupervisor && <span className="ml-1 text-[#6D4627] font-medium">({es ? 'Tus solicitudes' : 'Your submissions'})</span>}
          </p>
        </div>
        <button
          onClick={onOpenNewRequest}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md bg-[#6D4627] hover:bg-[#55361D] text-white transition-colors cursor-pointer shadow-xs"
        >
          <span>+ {t.navNewRequest}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[#F3F3F1] p-3 rounded-lg border border-[#DADCE0] space-y-2.5">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#5F6368]" />
            <input
              type="text"
              value={filterOptions.searchQuery}
              onChange={(e) => setFilter('searchQuery', e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#DADCE0] rounded-md text-xs sm:text-sm focus:outline-hidden focus:border-[#1A73E8]"
            />
          </div>
          <div className="flex items-center gap-1">
          <div className="relative shrink-0">
            <div
              className={`flex items-center rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                selectedDay
                  ? 'bg-[#6D4627] text-white font-semibold'
                  : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <button
                type="button"
                onClick={() => setDatePickerOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={datePickerOpen}
                className="flex items-center gap-1 px-2.5 py-1 cursor-pointer"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {selectedDay ? formatDateKey(selectedDay, language) : t.filterDate}
              </button>
              {selectedDay && (
                <button
                  type="button"
                  onClick={() => setFilter('createdOn', null)}
                  title={t.clearDate}
                  aria-label={t.clearDate}
                  className="pr-1.5 pl-0.5 py-1 cursor-pointer opacity-80 hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
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
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {timeFilters.map((tf) => (
              <button
                key={tf.key}
                onClick={() => setFilterOptions((prev) => ({ ...prev, timeFilter: tf.key, createdOn: null }))}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  !selectedDay && filterOptions.timeFilter === tf.key
                    ? 'bg-[#6D4627] text-white font-semibold'
                    : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          </div>
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-4 ${isSupervisor ? 'lg:grid-cols-5' : ''} gap-2 text-xs`}>
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
              className="px-2 py-1.5 bg-white border border-[#DADCE0] hover:bg-gray-100 rounded-md text-[#5F6368] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-[#DADCE0] rounded-lg shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-[#F3F3F1] border-b border-[#DADCE0] text-[#5F6368] uppercase text-[11px] font-semibold tracking-wider">
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
          <tbody className="divide-y divide-[#DADCE0]">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={isSupervisor ? 10 : 9} className="px-4 py-10 text-center text-[#5F6368]">
                  <AlertCircle className="w-7 h-7 text-[#989166] mx-auto mb-1.5" />
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
                    className={`hover:bg-[#F3F3F1] cursor-pointer transition-colors group ${overdue(req) ? 'bg-[#FCE8E6]/40' : ''}`}
                  >
                    <td className="px-3 py-2.5 font-semibold text-[#202124] whitespace-nowrap group-hover:text-[#6D4627]">
                      <span className="flex items-center gap-1.5">
                        {ticketCell(req)}
                        <ExternalLink className="w-3 h-3 text-[#5F6368] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-[#6D4627] whitespace-nowrap">
                      {locationLabel(t, req.location.code, req.location.name)}
                    </td>
                    <td className="px-3 py-2.5 text-[#202124] whitespace-nowrap">{requestCategoryLabel(t, req)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase ${PRIORITY_STYLE[req.priority]}`}>
                        {priorityBadge(t, req.priority)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLE[req.status]}`} title={statusHelp(t, req.status)}>
                          {statusLabel(t, req.status)}
                        </span>
                        {overdue(req) && overdueBadge}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {totalPhotos > 0 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F3F3F1] text-[#202124] text-[11px] font-medium border border-[#DADCE0]">
                          <Camera className="w-3 h-3 text-[#6D4627]" />
                          <span>{req.beforePhotos.length}</span>
                          {req.afterPhotos.length > 0 && <span className="text-[10px] text-[#137333] font-bold">(+{req.afterPhotos.length})</span>}
                        </span>
                      ) : (
                        <span className="text-[#BDC1C6] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#5F6368] whitespace-nowrap">{req.submittedBy.name}</td>
                    <td className="px-3 py-2.5 text-[#5F6368] whitespace-nowrap">
                      {req.assignedTo?.name ?? <span className="italic text-[#70757A]">{t.notAssignedYet}</span>}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[#5F6368] text-right whitespace-nowrap tabular-nums text-xs"
                      title={formatCancunDateTime(req.createdAt, language)}
                    >
                      {formatCancunShort(req.createdAt, language)}
                    </td>
                    {isSupervisor && (
                      <td className="w-20 pl-1 pr-2 py-1.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          {canEdit(req) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(req);
                              }}
                              title={t.editRequest}
                              aria-label={`${t.editRequest} ${ticketLabel(t, req)}`}
                              className="p-1.5 rounded-md text-[#5F6368] hover:text-[#6D4627] hover:bg-[#F4EFEA] cursor-pointer"
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
                              className="p-1.5 rounded-md text-[#5F6368] hover:text-[#D93025] hover:bg-[#FCE8E6] cursor-pointer"
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

      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5">
        {filteredRequests.length === 0 ? (
          <div className="bg-white border border-[#DADCE0] p-6 text-center rounded-lg text-[#5F6368]">
            <AlertCircle className="w-6 h-6 text-[#989166] mx-auto mb-1" />
            <div className="font-medium text-xs">{emptyState}</div>
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div
              key={req.id}
              onClick={() => onSelectRequest(req)}
              className={`bg-white border rounded-lg p-3 shadow-2xs space-y-1.5 cursor-pointer active:bg-gray-50 transition-colors ${
                overdue(req) ? 'border-[#D93025]' : 'border-[#DADCE0]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs text-[#202124]">{ticketCell(req)}</span>
                <div className="flex items-center gap-1.5">
                  {overdue(req) && overdueBadge}
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLE[req.status]}`}>
                    {statusLabel(t, req.status)}
                  </span>
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${PRIORITY_STYLE[req.priority]}`}>
                    {priorityBadge(t, req.priority)}
                  </span>
                </div>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <div className="font-bold text-[#6D4627]">{locationLabel(t, req.location.code, req.location.name)}</div>
                <div className="text-[#5F6368]">{requestCategoryLabel(t, req)}</div>
              </div>
              <div className="text-xs text-[#5F6368] line-clamp-2">
                {req.locationDetail && <span className="font-medium text-[#202124]">{req.locationDetail}: </span>}
                {richTextToPlain(req.notes)}
              </div>
              <div className="pt-1.5 border-t border-[#DADCE0] flex items-center justify-between text-[11px] text-[#5F6368]">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>{req.submittedBy.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {req.beforePhotos.length + req.afterPhotos.length > 0 && (
                    <span className="flex items-center gap-0.5 font-medium text-[#202124]">
                      <Camera className="w-3 h-3 text-[#6D4627]" />
                      <span>{req.beforePhotos.length + req.afterPhotos.length}</span>
                    </span>
                  )}
                  <span className="font-mono">{formatCancunDate(req.createdAt, language)}</span>
                </div>
              </div>
            </div>
          ))
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
