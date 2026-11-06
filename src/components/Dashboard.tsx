import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Gauge,
  Hourglass,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  Timer,
} from 'lucide-react';
import { STATUSES, type RequestStatus } from '../../shared/domain';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { useNow } from '../hooks/useNow';
import { translations } from '../i18n/translations';
import { kpiBreakdown, summarizeKpis, UNASSIGNED_KEY, type KpiDimension } from '../lib/kpi-aggregate';
import {
  categoryLabel,
  locationLabel,
  priorityBadge,
  PRIORITY_STYLE,
  requestCategoryLabel,
  statusHelp,
  statusLabel,
  STATUS_STYLE,
  ticketLabel,
  type Dict,
} from '../lib/labels';
import { formatCancunDate, formatCancunDateTime, formatCancunShort, formatDurationShort, isInPeriod } from '../lib/time';
import type { FilterOptions, MaintenanceCategory, MaintenanceRequest, RequestPriority, TimeFilter } from '../types';

interface DashboardProps {
  onSelectTab: (tab: string) => void;
  onOpenNewRequest: () => void;
  onSelectRequest: (req: MaintenanceRequest) => void;
}

const STATE_CARD: Record<RequestStatus, { icon: React.ElementType; accent: string; label: keyof Dict }> = {
  sin_revisar: { icon: Clock, accent: 'text-[#E37400] bg-[#FEF7E0]', label: 'kpiSinRevisar' },
  pendiente: { icon: PauseCircle, accent: 'text-[#8430CE] bg-[#F3E8FD]', label: 'kpiPendiente' },
  reconocida: { icon: PlayCircle, accent: 'text-[#1A73E8] bg-[#E8F0FE]', label: 'kpiReconocida' },
  completada: { icon: CheckCircle2, accent: 'text-[#137333] bg-[#E6F4EA]', label: 'kpiCompletada' },
};

/** Order shown on the location tiles (as requested: acknowledged, completed, pending, unreviewed). */
const TILE_STATUS_ORDER: RequestStatus[] = ['reconocida', 'completada', 'pendiente', 'sin_revisar'];

const STATUS_DOT: Record<RequestStatus, string> = {
  sin_revisar: 'bg-[#E37400]',
  pendiente: 'bg-[#8430CE]',
  reconocida: 'bg-[#1A73E8]',
  completada: 'bg-[#137333]',
};

const dur = (ms: number | null) => (ms === null ? '—' : formatDurationShort(ms));
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export const Dashboard: React.FC<DashboardProps> = ({ onSelectTab, onSelectRequest }) => {
  const { language } = useAuth();
  const { requests, residences, setFilterOptions, activeTicketCountsByVilla, loading } = useRequests();
  // All-time status counts per location code, for the location tiles.
  const statusCountsByLocation = useMemo(() => {
    const out: Record<string, Record<RequestStatus, number>> = {};
    for (const r of requests) {
      const c = (out[r.location.code] ??= { sin_revisar: 0, pendiente: 0, reconocida: 0, completada: 0 });
      c[r.status] += 1;
    }
    return out;
  }, [requests]);
  const t = translations[language];
  const es = language === 'es';
  const now = useNow(30_000);

  const [period, setPeriod] = useState<TimeFilter>('monthly');
  const [dimension, setDimension] = useState<KpiDimension>('priority');

  const inPeriod = useMemo(
    () => requests.filter((r) => isInPeriod(r.createdAt, period, now)),
    [requests, period, now],
  );
  const summary = useMemo(() => summarizeKpis(inPeriod, now.getTime()), [inPeriod, now]);
  const rows = useMemo(() => kpiBreakdown(inPeriod, dimension), [inPeriod, dimension]);

  // Urgent alerts look at all open requests, regardless of period.
  const urgentOpen = requests.filter((r) => r.priority === 'urgent' && r.status !== 'completada');

  const goToList = (patch: Partial<FilterOptions>) => {
    setFilterOptions((prev) => ({ ...prev, searchQuery: '', timeFilter: period, createdOn: null, ...patch }));
    onSelectTab('requests');
  };

  const periods: { key: TimeFilter; label: string }[] = [
    { key: 'daily', label: t.periodDaily },
    { key: 'weekly', label: t.periodWeekly },
    { key: 'monthly', label: t.periodMonthly },
    { key: 'yearly', label: t.periodYearly },
    { key: 'all', label: t.periodAll },
  ];

  const dimensions: { key: KpiDimension; label: string }[] = [
    { key: 'priority', label: t.kpiDimPriority },
    { key: 'category', label: t.kpiDimCategory },
    { key: 'location', label: t.kpiDimLocation },
    { key: 'assignee', label: t.kpiDimSupervisor },
    { key: 'completedBy', label: t.kpiDimCompletedBy },
  ];

  const groupLabel = (key: string, name: string) => {
    if (key === UNASSIGNED_KEY) return t.notAssignedYet;
    if (dimension === 'priority') return priorityBadge(t, key as RequestPriority);
    if (dimension === 'category') return categoryLabel(t, key as MaintenanceCategory);
    if (dimension === 'location') return locationLabel(t, key, name);
    return name;
  };

  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  const MetricCard: React.FC<{
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
    tone?: 'bad' | 'normal';
  }> = ({ icon: Icon, label, value, sub, tone = 'normal' }) => (
    <div className={`bg-white border p-3.5 rounded-lg shadow-2xs ${tone === 'bad' ? 'border-[#D93025]' : 'border-[#DADCE0]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[#5F6368] uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 shrink-0 ${tone === 'bad' ? 'text-[#D93025]' : 'text-[#6D4627]'}`} />
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-[#D93025]' : 'text-[#202124]'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#5F6368]">{sub}</div>}
    </div>
  );

  const LocationTile: React.FC<{ code: string; name: string }> = ({ code, name }) => {
    const counts = statusCountsByLocation[code];
    const hasIssues = (activeTicketCountsByVilla[code] || 0) > 0;
    return (
      <button
        onClick={() => goToList({ locationCode: code, status: 'all', timeFilter: 'all' })}
        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
          hasIssues ? 'border-[#E37400]/40 bg-[#FEF7E0]/30 hover:bg-[#FEF7E0]/60' : 'border-[#DADCE0] bg-white hover:bg-[#F3F3F1]'
        }`}
      >
        <div className="text-xs font-bold text-[#6D4627] mb-1.5 truncate">{locationLabel(t, code, name)}</div>
        <dl className="space-y-0.5 text-[11px]">
          {TILE_STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center justify-between gap-1 min-w-0">
              <dt className="flex items-center gap-1 text-[#5F6368] truncate">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
                <span className="truncate">{statusLabel(t, s)}</span>
              </dt>
              <dd className={`tabular-nums font-semibold ${counts?.[s] ? 'text-[#202124]' : 'text-[#B0B3B8]'}`}>
                {counts?.[s] ?? 0}
              </dd>
            </div>
          ))}
        </dl>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-2 border-b border-[#DADCE0]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">{t.overviewTitle}</h1>
          <p className="text-xs text-[#5F6368] flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            <span className="capitalize">{formatCancunDate(now, language)} · Cancún</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {periods.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  period === p.key ? 'bg-[#6D4627] text-white font-semibold' : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => goToList({ status: 'all' })}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#DADCE0] hover:bg-[#F3F3F1] text-[#202124] cursor-pointer flex items-center gap-1.5"
          >
            <span>{t.viewAllRequests}</span>
          </button>
        </div>
      </div>

      {/* Urgent alerts */}
      {urgentOpen.length > 0 && (
        <div className="bg-[#FCE8E6] border border-[#FAD2CF] rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#D93025] text-white rounded-md shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold text-[#D93025]">
                {t.kpiUrgentAlerts}: {urgentOpen.length}
              </div>
              <div className="text-xs text-[#5F6368]">
                {urgentOpen
                  .slice(0, 6)
                  .map((u) => `${ticketLabel(t, u)} (${locationLabel(t, u.location.code, u.location.name)})`)
                  .join(' • ')}
              </div>
            </div>
          </div>
          <button
            onClick={() => goToList({ priority: 'urgent', status: 'all', timeFilter: 'all' })}
            className="px-2.5 py-1 bg-[#D93025] hover:bg-[#B3261E] text-white text-xs font-medium rounded-md shrink-0 cursor-pointer self-start sm:self-auto"
          >
            {es ? 'Ver urgentes' : 'Review'}
          </button>
        </div>
      )}

      {/* State counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATUSES.map((s) => {
          const card = STATE_CARD[s];
          const Icon = card.icon;
          return (
            <button
              key={s}
              onClick={() => goToList({ status: s })}
              title={statusHelp(t, s)}
              className="bg-white border border-[#DADCE0] hover:border-[#6D4627]/50 p-3.5 rounded-lg shadow-2xs text-left cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#5F6368] uppercase tracking-wider">{t[card.label] as string}</span>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${card.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#202124] tabular-nums">{loading ? '…' : summary.counts[s]}</div>
              <div className="mt-1 text-[11px] text-[#5F6368] flex items-center gap-1">
                <span>{statusHelp(t, s)}</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Time KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          icon={AlertTriangle}
          label={t.kpiOverdueUnreviewed}
          value={String(summary.overdueUnreviewed)}
          tone={summary.overdueUnreviewed > 0 ? 'bad' : 'normal'}
        />
        <MetricCard
          icon={Gauge}
          label={t.kpiSlaCompliance}
          value={pct(summary.slaCompliance)}
          sub={summary.respondedCount ? `${summary.respondedCount} ${es ? 'atendidas' : 'responded'}` : undefined}
        />
        <MetricCard
          icon={Clock}
          label={t.kpiAvgResponse}
          value={dur(summary.avgResponseMs)}
          sub={summary.medianResponseMs !== null ? `${t.kpiMedianResponse}: ${dur(summary.medianResponseMs)}` : undefined}
        />
        <MetricCard icon={Timer} label={t.kpiAvgWork} value={dur(summary.avgWorkMs)} />
        <MetricCard
          icon={Hourglass}
          label={t.kpiAvgTotal}
          value={dur(summary.avgTotalMs)}
          sub={summary.completedCount ? `${summary.completedCount} ${es ? 'completadas' : 'completed'}` : undefined}
        />
      </div>

      {/* KPI breakdown */}
      <div className="bg-white border border-[#DADCE0] rounded-lg shadow-2xs overflow-hidden">
        <div className="p-3.5 border-b border-[#DADCE0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-sm sm:text-base font-semibold text-[#202124]">{t.kpiBreakdownTitle}</h2>
          <label className="flex items-center gap-2 text-xs text-[#5F6368]">
            {t.kpiBreakdownBy}
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as KpiDimension)}
              className="bg-white border border-[#DADCE0] rounded-md px-2 py-1 text-xs text-[#202124]"
            >
              {dimensions.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#F3F3F1] border-b border-[#DADCE0] text-[#5F6368] uppercase text-[11px] font-semibold">
              <tr>
                <th className="px-4 py-2.5">{t.kpiColGroup}</th>
                <th className="px-4 py-2.5 text-right">{t.kpiColCount}</th>
                <th className="px-4 py-2.5 text-right">{t.kpiSlaCompliance}</th>
                <th className="px-4 py-2.5 text-right">{t.kpiAvgResponse}</th>
                <th className="px-4 py-2.5 text-right">{t.kpiAvgWork}</th>
                <th className="px-4 py-2.5 text-right">{t.kpiAvgTotal}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DADCE0]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5F6368]">
                    {t.noDataYet}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-2.5 font-medium text-[#202124] whitespace-nowrap">{groupLabel(r.key, r.name)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pct(r.slaCompliance)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{dur(r.avgResponseMs)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{dur(r.avgWorkMs)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{dur(r.avgTotalMs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Locations */}
      <div className="bg-white border border-[#DADCE0] rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-semibold text-[#202124]">{t.residenceDistribution}</h2>
          <button onClick={() => onSelectTab('residences')} className="text-xs text-[#6D4627] hover:underline font-medium cursor-pointer">
            {es ? 'Ver todas →' : 'View all →'}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {villasList.map((v) => (
            <LocationTile key={v.id} code={v.code} name={v.name} />
          ))}
        </div>
        <div className="pt-2 border-t border-[#F3F3F1]">
          <div className="text-[11px] font-semibold text-[#5F6368] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#6D4627]" />
            <span>{t.locGroupOther}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {otherLocationsList.map((f) => (
              <LocationTile key={f.id} code={f.code} name={f.name} />
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white border border-[#DADCE0] rounded-lg shadow-2xs overflow-hidden">
        <div className="p-3.5 border-b border-[#DADCE0] flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-semibold text-[#202124]">{t.recentActivity}</h2>
          <button onClick={() => onSelectTab('requests')} className="text-xs text-[#6D4627] hover:underline font-semibold cursor-pointer flex items-center gap-1">
            <span>{t.viewAllRequests}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#F3F3F1] border-b border-[#DADCE0] text-[#5F6368] uppercase text-[11px] font-semibold">
              <tr>
                <th className="px-4 py-2.5">{t.ticketIdLabel}</th>
                <th className="px-4 py-2.5">{t.filterVilla}</th>
                <th className="px-4 py-2.5">{t.filterCategory}</th>
                <th className="px-4 py-2.5">{t.filterPriority}</th>
                <th className="px-4 py-2.5">{t.filterStatus}</th>
                <th className="px-4 py-2.5">{t.assignedSupervisorLabel}</th>
                <th className="px-4 py-2.5 text-right">{t.dateTimeColumn}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DADCE0]">
              {requests.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-[#5F6368]">
                    {loading ? t.loading : t.noDataYet}
                  </td>
                </tr>
              )}
              {requests.slice(0, 6).map((req) => (
                <tr key={req.id} onClick={() => onSelectRequest(req)} className="hover:bg-[#F3F3F1] cursor-pointer">
                  <td className={`px-4 py-2.5 font-medium whitespace-nowrap ${req.ticketId ? 'text-[#202124]' : 'italic text-[#70757A]'}`}>
                    {ticketLabel(t, req)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-[#6D4627] whitespace-nowrap">{locationLabel(t, req.location.code, req.location.name)}</td>
                  <td className="px-4 py-2.5 text-[#202124] whitespace-nowrap">{requestCategoryLabel(t, req)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase ${PRIORITY_STYLE[req.priority]}`}>{priorityBadge(t, req.priority)}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[req.status]}`}>{statusLabel(t, req.status)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[#5F6368] whitespace-nowrap">
                    {req.assignedTo?.name ?? <span className="italic text-[#70757A]">{t.notAssignedYet}</span>}
                  </td>
                  <td
                    className="px-4 py-2.5 text-[#5F6368] text-right whitespace-nowrap tabular-nums text-xs"
                    title={formatCancunDateTime(req.createdAt, language)}
                  >
                    {formatCancunShort(req.createdAt, language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
