import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { MaintenanceRequest, MaintenanceCategory, RequestPriority, RequestStatus, TimeFilter } from '../types';
import { 
  Search, 
  RotateCcw, 
  Camera, 
  AlertCircle,
  User,
  ExternalLink,
  Download
} from 'lucide-react';

interface RequestListProps {
  onSelectRequest: (req: MaintenanceRequest) => void;
  onOpenNewRequest: () => void;
}

export const RequestList: React.FC<RequestListProps> = ({
  onSelectRequest,
  onOpenNewRequest,
}) => {
  const { language, currentUser } = useAuth();
  const { 
    requests, 
    filteredRequests, 
    residences, 
    filterOptions, 
    setFilterOptions, 
    resetFilters, 
    usersList 
  } = useRequests();
  const t = translations[language];

  const supervisors = usersList.filter((u) => u.role === 'supervisor' || u.role === 'admin');

  // 13 Categories
  const categories: { key: MaintenanceCategory; label: string }[] = [
    { key: 'plumbing', label: t.catPlumbing },
    { key: 'hvac', label: t.catHvac },
    { key: 'electrical', label: t.catElectrical },
    { key: 'pool', label: t.catPool },
    { key: 'spa', label: t.catSpa },
    { key: 'carpentry', label: t.catCarpentry },
    { key: 'appliances', label: t.catAppliances },
    { key: 'lighting', label: t.catLighting },
    { key: 'av_tech', label: t.catAvTech },
    { key: 'structural', label: t.catStructural },
    { key: 'glass_windows', label: t.catGlassWindows },
    { key: 'grounds', label: t.catGrounds },
    { key: 'common_areas', label: t.catCommonAreas },
  ];

  const priorities: { key: RequestPriority; label: string }[] = [
    { key: 'urgent', label: t.priorityUrgent },
    { key: 'high', label: t.priorityHigh },
    { key: 'normal', label: t.priorityNormal },
    { key: 'low', label: t.priorityLow },
  ];

  const statuses: { key: RequestStatus; label: string }[] = [
    { key: 'pending', label: t.statusPending },
    { key: 'acknowledged', label: t.statusAcknowledged },
    { key: 'completed', label: t.statusCompleted },
  ];

  const timeFilters: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: t.periodAll },
    { key: 'daily', label: t.periodDaily },
    { key: 'weekly', label: t.periodWeekly },
    { key: 'monthly', label: t.periodMonthly },
    { key: 'yearly', label: t.periodYearly },
  ];

  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  const getCategoryLabel = (req: MaintenanceRequest) => {
    const base = (t as any)[`cat${req.category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`] || req.category;
    if (req.category === 'common_areas' && req.commonAreaSubLocation) {
      const sub = req.commonAreaSubLocation === 'hall' ? t.subLocHall : t.subLocParking;
      return `${base} (${sub})`;
    }
    return base;
  };

  const handleExportCSV = () => {
    const headers = [
      'Ticket ID',
      'Location Code',
      'Location Name',
      'Category',
      'Common Area Sub-Location',
      'Priority',
      'Priority SLA',
      'Status',
      'Specific Location Detail',
      'Description / Notes',
      'Submitted By Name',
      'Submitted By Email',
      'Submission Timestamp',
      'Assigned Supervisor',
      'Acknowledged Timestamp',
      'Completed Timestamp',
      'Work Performed By',
      'Supervisor Resolution Notes',
      'Resolution Time (Hours)',
      'Photo Attachments Count'
    ];

    const escapeCSV = (value: any) => {
      if (value === null || value === undefined) return '""';
      const str = String(value).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredRequests.map((req) => {
      const slaMap: Record<string, string> = {
        urgent: 'Immediate',
        high: '2 hours',
        normal: '4 hours',
        low: '24 hours'
      };

      return [
        escapeCSV(req.ticketId),
        escapeCSV(req.villaNumber),
        escapeCSV(req.villaName),
        escapeCSV(req.category),
        escapeCSV(req.commonAreaSubLocation || ''),
        escapeCSV(req.priority.toUpperCase()),
        escapeCSV(slaMap[req.priority] || ''),
        escapeCSV(req.status.toUpperCase()),
        escapeCSV(req.locationDetail),
        escapeCSV(req.notes),
        escapeCSV(req.submittedBy.name),
        escapeCSV(req.submittedBy.email),
        escapeCSV(req.createdAt),
        escapeCSV(req.assignedSupervisorName || 'Unassigned'),
        escapeCSV(req.acknowledgedAt || ''),
        escapeCSV(req.completedAt || ''),
        escapeCSV(req.completedBy?.name || ''),
        escapeCSV(req.supervisorNotes || ''),
        escapeCSV(req.resolutionTimeHours ?? ''),
        escapeCSV(req.photos.length)
      ].join(',');
    });

    // Add UTF-8 BOM (\uFEFF) for Excel compatibility with international characters & Spanish accents
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kachava_lux_maintenance_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#DADCE0]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
            {t.navRequests}
          </h1>
          <p className="text-xs text-[#5F6368]">
            {t.filteredResultsCount
              .replace('{count}', String(filteredRequests.length))
              .replace('{total}', String(requests.length))}
            {currentUser?.role === 'staff' && (
              <span className="ml-1 text-[#6D4627] font-medium">
                ({language === 'es' ? 'Tus solicitudes' : 'Your submissions'})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            title={t.exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md bg-white border border-[#DADCE0] hover:bg-[#F3F3F1] text-[#202124] transition-colors cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-[#5F6368]" />
            <span>{t.exportCsv}</span>
          </button>

          <button
            onClick={onOpenNewRequest}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md bg-[#6D4627] hover:bg-[#55361D] text-white transition-colors cursor-pointer shadow-xs"
          >
            <span>+ {t.navNewRequest}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#F3F3F1] p-3 rounded-lg border border-[#DADCE0] space-y-2.5">
        {/* Row 1: Search + Time Filter */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#5F6368]" />
            <input
              type="text"
              value={filterOptions.searchQuery}
              onChange={(e) =>
                setFilterOptions((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#DADCE0] rounded-md text-xs sm:text-sm focus:outline-hidden focus:border-[#1A73E8]"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {timeFilters.map((tf) => (
              <button
                key={tf.key}
                onClick={() => setFilterOptions((prev) => ({ ...prev, timeFilter: tf.key }))}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  filterOptions.timeFilter === tf.key
                    ? 'bg-[#6D4627] text-white font-semibold'
                    : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 text-xs">
          {/* Location Selector (Villas + Other Locations) */}
          <div>
            <label className="block text-[10px] font-semibold text-[#5F6368] uppercase mb-1">
              {t.filterVilla}
            </label>
            <select
              value={filterOptions.villaNumber}
              onChange={(e) =>
                setFilterOptions((prev) => ({
                  ...prev,
                  villaNumber: e.target.value,
                }))
              }
              className="w-full bg-white border border-[#DADCE0] rounded-md px-2 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
            >
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
                    {loc.name === 'Office'
                      ? t.locOffice
                      : loc.name === 'Gym'
                      ? t.locGym
                      : loc.name === 'Storage'
                      ? t.locStorage
                      : loc.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[#5F6368] uppercase mb-1">
              {t.filterStatus}
            </label>
            <select
              value={filterOptions.status}
              onChange={(e) =>
                setFilterOptions((prev) => ({
                  ...prev,
                  status: e.target.value as any,
                }))
              }
              className="w-full bg-white border border-[#DADCE0] rounded-md px-2 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
            >
              <option value="all">{t.allStatuses}</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[#5F6368] uppercase mb-1">
              {t.filterCategory}
            </label>
            <select
              value={filterOptions.category}
              onChange={(e) =>
                setFilterOptions((prev) => ({
                  ...prev,
                  category: e.target.value as any,
                }))
              }
              className="w-full bg-white border border-[#DADCE0] rounded-md px-2 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
            >
              <option value="all">{t.allCategories}</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[#5F6368] uppercase mb-1">
              {t.filterSupervisor}
            </label>
            <select
              value={filterOptions.supervisorId}
              onChange={(e) =>
                setFilterOptions((prev) => ({
                  ...prev,
                  supervisorId: e.target.value,
                }))
              }
              className="w-full bg-white border border-[#DADCE0] rounded-md px-2 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
            >
              <option value="all">{t.allSupervisors}</option>
              <option value="unassigned">{t.notAssignedYet}</option>
              {supervisors.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-[#5F6368] uppercase mb-1">
                {t.filterPriority}
              </label>
              <select
                value={filterOptions.priority}
                onChange={(e) =>
                  setFilterOptions((prev) => ({
                    ...prev,
                    priority: e.target.value as any,
                  }))
                }
                className="w-full bg-white border border-[#DADCE0] rounded-md px-2 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
              >
                <option value="all">{t.allPriorities}</option>
                {priorities.map((p) => (
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

      {/* Operational Table */}
      <div className="hidden md:block bg-white border border-[#DADCE0] rounded-lg shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-[#F3F3F1] border-b border-[#DADCE0] text-[#5F6368] uppercase text-[11px] font-semibold tracking-wider">
            <tr>
              <th className="px-4 py-3">{t.ticketIdLabel}</th>
              <th className="px-4 py-3">{t.filterVilla}</th>
              <th className="px-4 py-3">{t.filterCategory}</th>
              <th className="px-4 py-3">{t.locationDetailLabel}</th>
              <th className="px-4 py-3">{t.filterPriority}</th>
              <th className="px-4 py-3">{t.filterStatus}</th>
              <th className="px-3 py-3 text-center">Photos</th>
              <th className="px-4 py-3">{t.submittedByLabel}</th>
              <th className="px-4 py-3">{t.assignedSupervisorLabel}</th>
              <th className="px-4 py-3 text-right">{t.submissionTimeLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DADCE0]">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-[#5F6368]">
                  <AlertCircle className="w-7 h-7 text-[#989166] mx-auto mb-1.5" />
                  <div className="font-medium text-sm">{t.noDataYet}</div>
                </td>
              </tr>
            ) : (
              filteredRequests.map((req) => {
                const statusColor =
                  req.status === 'completed'
                    ? 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]'
                    : req.status === 'acknowledged'
                    ? 'bg-[#E8F0FE] text-[#1A73E8] border-[#D2E3FC]'
                    : 'bg-[#FEF7E0] text-[#E37400] border-[#FEEFC3]';

                const priorityColor =
                  req.priority === 'urgent'
                    ? 'bg-[#FCE8E6] text-[#D93025]'
                    : req.priority === 'high'
                    ? 'bg-[#FEF7E0] text-[#E37400]'
                    : 'bg-[#F1F3F4] text-[#5F6368]';

                const priorityBadgeText =
                  req.priority === 'urgent'
                    ? t.pBadgeUrgent
                    : req.priority === 'high'
                    ? t.pBadgeHigh
                    : req.priority === 'normal'
                    ? t.pBadgeNormal
                    : t.pBadgeLow;

                const statusLabel =
                  req.status === 'completed'
                    ? t.statusCompleted
                    : req.status === 'acknowledged'
                    ? t.statusAcknowledged
                    : t.statusPending;

                const afterPhotosCount = req.photos.filter((p) => p.type === 'after').length;
                const totalPhotos = req.photos.length;

                return (
                  <tr
                    key={req.id}
                    onClick={() => onSelectRequest(req)}
                    className="hover:bg-[#F3F3F1] cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 font-semibold text-[#202124] whitespace-nowrap group-hover:text-[#6D4627] flex items-center gap-1.5">
                      <span>{req.ticketId}</span>
                      <ExternalLink className="w-3 h-3 text-[#5F6368] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>

                    <td className="px-4 py-3 font-bold text-[#6D4627] whitespace-nowrap">
                      {req.villaName}
                    </td>

                    <td className="px-4 py-3 text-[#202124] whitespace-nowrap">
                      {getCategoryLabel(req)}
                    </td>

                    <td className="px-4 py-3 text-[#5F6368] max-w-xs truncate" title={req.locationDetail}>
                      {req.locationDetail}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase ${priorityColor}`}>
                        {priorityBadgeText}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {totalPhotos > 0 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F3F3F1] text-[#202124] text-[11px] font-medium border border-[#DADCE0]">
                          <Camera className="w-3 h-3 text-[#6D4627]" />
                          <span>{totalPhotos}</span>
                          {afterPhotosCount > 0 && (
                            <span className="text-[10px] text-[#137333] font-bold">
                              (+{afterPhotosCount})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[#BDC1C6] text-xs">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-[#5F6368] whitespace-nowrap">
                      {req.submittedBy.name}
                    </td>

                    <td className="px-4 py-3 text-[#5F6368] whitespace-nowrap">
                      {req.assignedSupervisorName || (
                        <span className="italic text-[#70757A]">{t.notAssignedYet}</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-[#5F6368] text-right whitespace-nowrap font-mono text-xs">
                      {new Date(req.createdAt).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List (< md breakpoint) */}
      <div className="md:hidden space-y-2.5">
        {filteredRequests.length === 0 ? (
          <div className="bg-white border border-[#DADCE0] p-6 text-center rounded-lg text-[#5F6368]">
            <AlertCircle className="w-6 h-6 text-[#989166] mx-auto mb-1" />
            <div className="font-medium text-xs">{t.noDataYet}</div>
          </div>
        ) : (
          filteredRequests.map((req) => {
            const statusColor =
              req.status === 'completed'
                ? 'bg-[#E6F4EA] text-[#137333]'
                : req.status === 'acknowledged'
                ? 'bg-[#E8F0FE] text-[#1A73E8]'
                : 'bg-[#FEF7E0] text-[#E37400]';

            const statusLabel =
              req.status === 'completed'
                ? t.statusCompleted
                : req.status === 'acknowledged'
                ? t.statusAcknowledged
                : t.statusPending;

            const priorityBadgeText =
              req.priority === 'urgent'
                ? t.pBadgeUrgent
                : req.priority === 'high'
                ? t.pBadgeHigh
                : req.priority === 'normal'
                ? t.pBadgeNormal
                : t.pBadgeLow;

            return (
              <div
                key={req.id}
                onClick={() => onSelectRequest(req)}
                className="bg-white border border-[#DADCE0] rounded-lg p-3 shadow-2xs space-y-1.5 cursor-pointer active:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[#202124]">
                    {req.ticketId}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-[#F1F3F4] text-[#5F6368]">
                      {priorityBadgeText}
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline justify-between text-xs">
                  <div className="font-bold text-[#6D4627]">
                    {req.villaName}
                  </div>
                  <div className="capitalize text-[#5F6368]">
                    {getCategoryLabel(req)}
                  </div>
                </div>

                <div className="text-xs text-[#5F6368] line-clamp-2">
                  <span className="font-medium text-[#202124]">{req.locationDetail}: </span>
                  {req.notes}
                </div>

                <div className="pt-1.5 border-t border-[#DADCE0] flex items-center justify-between text-[11px] text-[#5F6368]">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>{req.submittedBy.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {req.photos.length > 0 && (
                      <span className="flex items-center gap-0.5 font-medium text-[#202124]">
                        <Camera className="w-3 h-3 text-[#6D4627]" />
                        <span>{req.photos.length}</span>
                      </span>
                    )}
                    <span className="font-mono">
                      {new Date(req.createdAt).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
