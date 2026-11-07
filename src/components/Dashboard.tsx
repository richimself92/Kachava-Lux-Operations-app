import React, { useMemo, useState } from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
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
import { btnQuiet, btnSecondary, HairlineGrid, PageHeader, SectionHead, Segmented } from './Kit';
import type { FilterOptions, MaintenanceCategory, MaintenanceRequest, RequestPriority, TimeFilter } from '../types';

interface DashboardProps {
  onSelectTab: (tab: string) => void;
  onOpenNewRequest: () => void;
  onSelectRequest: (req: MaintenanceRequest) => void;
}

const STATE_LABEL: Record<RequestStatus, keyof Dict> = {
  sin_revisar: 'kpiSinRevisar',
  pendiente: 'kpiPendiente',
  reconocida: 'kpiReconocida',
  completada: 'kpiCompletada',
};

/** Order shown on the location tiles (as requested: acknowledged, completed, pending, unreviewed). */
const TILE_STATUS_ORDER: RequestStatus[] = ['reconocida', 'completada', 'pendiente', 'sin_revisar'];

const STATUS_DOT: Record<RequestStatus, string> = {
  sin_revisar: 'bg-pending',
  pendiente: 'bg-plum',
  reconocida: 'bg-info',
  completada: 'bg-ok',
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

  const MetricCell: React.FC<{
    label: string;
    value: string;
    sub?: string;
    tone?: 'bad' | 'normal';
    className?: string;
  }> = ({ label, value, sub, tone = 'normal', className = '' }) => (
    <div className={`bg-surface p-4 sm:p-5 min-w-0 ${className}`}>
      <div className={`kl-label lg:min-h-[2.8em] ${tone === 'bad' ? '!text-danger' : ''}`}>{label}</div>
      <div
        className={`mt-3 font-display text-[1.75rem] sm:text-[2rem] leading-none tabular-nums ${
          tone === 'bad' ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  );

  const LocationTile: React.FC<{ code: string; name: string }> = ({ code, name }) => {
    const counts = statusCountsByLocation[code];
    const active = activeTicketCountsByVilla[code] || 0;
    return (
      <button
        onClick={() => goToList({ locationCode: code, status: 'all', timeFilter: 'all' })}
        className="group flex flex-col justify-start bg-surface hover:bg-wash p-3.5 sm:p-4 text-left transition-colors cursor-pointer min-w-0"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-ink truncate group-hover:text-brand transition-colors">{locationLabel(t, code, name)}</span>
          {active > 0 && (
            <span className="text-[11px] tabular-nums text-pending shrink-0">
              {active} {es ? 'abiertas' : 'open'}
            </span>
          )}
        </div>
        <dl className="mt-2.5 space-y-1 text-xs">
          {TILE_STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center justify-between gap-1 min-w-0">
              <dt className="flex items-center gap-1.5 text-muted truncate">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
                <span className="truncate">{statusLabel(t, s)}</span>
              </dt>
              <dd className={`tabular-nums ${counts?.[s] ? 'text-ink' : 'text-faint'}`}>{counts?.[s] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </button>
    );
  };

  const statusBadge = (s: RequestStatus) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium border ${STATUS_STYLE[s]}`}>
      {statusLabel(t, s)}
    </span>
  );

  return (
    <div className="space-y-10 sm:space-y-14">
      <div>
        <PageHeader
          eyebrow={es ? '01 — Resumen' : '01 — Overview'}
          title={t.overviewTitle}
          meta={<span className="capitalize">{formatCancunDate(now, language)} · Cancún</span>}
          actions={
            <button onClick={() => goToList({ status: 'all' })} className={btnSecondary}>
              {t.viewAllRequests}
              <ArrowRight className="w-4 h-4" />
            </button>
          }
        />
        <Segmented
          label={es ? 'Periodo' : 'Period'}
          options={periods}
          value={period}
          onChange={setPeriod}
          className="border-b border-line"
        />

        {/* Urgent alerts (all open urgent work, regardless of period) */}
        {urgentOpen.length > 0 && (
          <div className="mt-5 border-t-2 border-danger bg-danger-wash/60 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <ShieldAlert className="w-4 h-4 mt-0.5 text-danger shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-danger">
                  {t.kpiUrgentAlerts}: {urgentOpen.length}
                </div>
                <div className="mt-0.5 text-xs text-muted break-words">
                  {urgentOpen
                    .slice(0, 6)
                    .map((u) => `${ticketLabel(t, u)} (${locationLabel(t, u.location.code, u.location.name)})`)
                    .join(' · ')}
                </div>
              </div>
            </div>
            <button
              onClick={() => goToList({ priority: 'urgent', status: 'all', timeFilter: 'all' })}
              className="self-start sm:self-auto shrink-0 min-h-10 px-4 border border-danger text-danger hover:bg-danger hover:text-surface text-sm rounded-sm transition-colors cursor-pointer"
            >
              {es ? 'Ver urgentes' : 'Review'}
            </button>
          </div>
        )}
      </div>

      {/* State counts */}
      <section>
        <SectionHead index={es ? '02 — Estado' : '02 — Status'} title={es ? 'Órdenes por estado' : 'Work orders by status'} />
        <HairlineGrid className="grid-cols-2 lg:grid-cols-4">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => goToList({ status: s })}
              title={statusHelp(t, s)}
              className="group flex flex-col justify-start bg-surface hover:bg-wash p-4 sm:p-5 text-left cursor-pointer transition-colors min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
                <span className="kl-label truncate">{t[STATE_LABEL[s]] as string}</span>
              </div>
              <div className="mt-3 font-display text-[2.5rem] sm:text-5xl leading-none text-ink tabular-nums">
                {loading ? '…' : summary.counts[s]}
              </div>
              <div className="mt-3 text-xs text-muted flex items-start gap-1">
                <span className="line-clamp-2">{statusHelp(t, s)}</span>
                <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </HairlineGrid>
      </section>

      {/* Time KPIs */}
      <section>
        <SectionHead index={es ? '03 — Tiempos' : '03 — Timing'} title={es ? 'Tiempos de respuesta' : 'Response and work times'} />
        <HairlineGrid className="grid-cols-2 lg:grid-cols-5">
          <MetricCell
            label={t.kpiOverdueUnreviewed}
            value={String(summary.overdueUnreviewed)}
            tone={summary.overdueUnreviewed > 0 ? 'bad' : 'normal'}
          />
          <MetricCell
            label={t.kpiSlaCompliance}
            value={pct(summary.slaCompliance)}
            sub={summary.respondedCount ? `${summary.respondedCount} ${es ? 'atendidas' : 'responded'}` : undefined}
          />
          <MetricCell
            label={t.kpiAvgResponse}
            value={dur(summary.avgResponseMs)}
            sub={summary.medianResponseMs !== null ? `${t.kpiMedianResponse}: ${dur(summary.medianResponseMs)}` : undefined}
          />
          <MetricCell label={t.kpiAvgWork} value={dur(summary.avgWorkMs)} />
          <MetricCell
            className="col-span-2 lg:col-span-1"
            label={t.kpiAvgTotal}
            value={dur(summary.avgTotalMs)}
            sub={summary.completedCount ? `${summary.completedCount} ${es ? 'completadas' : 'completed'}` : undefined}
          />
        </HairlineGrid>
      </section>

      {/* KPI breakdown */}
      <section>
        <SectionHead
          index={es ? '04 — Desglose' : '04 — Breakdown'}
          title={t.kpiBreakdownTitle}
          action={
            <label className="flex items-center gap-2 text-xs text-muted shrink-0">
              <span className="hidden sm:inline">{t.kpiBreakdownBy}</span>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value as KpiDimension)}
                aria-label={t.kpiBreakdownBy}
                className="min-h-10 bg-surface border border-line rounded-sm px-2.5 text-sm text-ink cursor-pointer"
              >
                {dimensions.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        {rows.length === 0 ? (
          <div className="border-y border-line py-8 text-center text-sm text-muted">{t.noDataYet}</div>
        ) : (
          <>
            {/* Phones: one block per group */}
            <ul className="sm:hidden border-y border-line divide-y divide-line">
              {rows.map((r) => (
                <li key={r.key} className="py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink truncate">{groupLabel(r.key, r.name)}</span>
                    <span className="text-sm tabular-nums text-ink shrink-0">{r.count}</span>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs">
                    {(
                      [
                        [t.kpiSlaCompliance, pct(r.slaCompliance)],
                        [t.kpiAvgResponse, dur(r.avgResponseMs)],
                        [t.kpiAvgWork, dur(r.avgWorkMs)],
                        [t.kpiAvgTotal, dur(r.avgTotalMs)],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 min-w-0">
                        <dt className="text-muted truncate">{k}</dt>
                        <dd className="tabular-nums text-ink whitespace-nowrap">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            {/* Tablet / desktop: table */}
            <div className="hidden sm:block overflow-x-auto border-y border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="kl-label font-medium py-3 pr-4">{t.kpiColGroup}</th>
                    <th className="kl-label font-medium py-3 px-4 text-right">{t.kpiColCount}</th>
                    <th className="kl-label font-medium py-3 px-4 text-right">{t.kpiSlaCompliance}</th>
                    <th className="kl-label font-medium py-3 px-4 text-right">{t.kpiAvgResponse}</th>
                    <th className="kl-label font-medium py-3 px-4 text-right">{t.kpiAvgWork}</th>
                    <th className="kl-label font-medium py-3 pl-4 text-right">{t.kpiAvgTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="py-3 pr-4 text-ink whitespace-nowrap">{groupLabel(r.key, r.name)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{r.count}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{pct(r.slaCompliance)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{dur(r.avgResponseMs)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{dur(r.avgWorkMs)}</td>
                      <td className="py-3 pl-4 text-right tabular-nums">{dur(r.avgTotalMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Locations */}
      <section>
        <SectionHead
          index={es ? '05 — Ubicaciones' : '05 — Locations'}
          title={t.residenceDistribution}
          action={
            <button onClick={() => onSelectTab('residences')} className={btnQuiet}>
              {es ? 'Ver todas' : 'View all'}
            </button>
          }
        />
        <HairlineGrid className="grid-cols-2 sm:grid-cols-4">
          {villasList.map((v) => (
            <LocationTile key={v.id} code={v.code} name={v.name} />
          ))}
        </HairlineGrid>
        <div className="kl-label mt-6 mb-3">{t.locGroupOther}</div>
        <HairlineGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {otherLocationsList.map((f) => (
            <LocationTile key={f.id} code={f.code} name={f.name} />
          ))}
        </HairlineGrid>
      </section>

      {/* Recent activity */}
      <section>
        <SectionHead
          index={es ? '06 — Recientes' : '06 — Recent'}
          title={t.recentActivity}
          action={
            <button onClick={() => onSelectTab('requests')} className={btnQuiet}>
              {t.viewAllRequests}
            </button>
          }
        />
        {requests.length === 0 ? (
          <div className="border-y border-line py-8 text-center text-sm text-muted">{loading ? t.loading : t.noDataYet}</div>
        ) : (
          <>
            {/* Phones / tablets: list */}
            <ul className="lg:hidden border-y border-line divide-y divide-line">
              {requests.slice(0, 6).map((req) => (
                <li key={req.id}>
                  <button
                    onClick={() => onSelectRequest(req)}
                    className="w-full text-left py-3.5 active:bg-wash hover:bg-wash/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm tabular-nums ${req.ticketId ? 'text-ink' : 'italic text-muted'}`}>{ticketLabel(t, req)}</span>
                      {statusBadge(req.status)}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-brand truncate">
                        {locationLabel(t, req.location.code, req.location.name)}
                        <span className="text-muted"> · {requestCategoryLabel(t, req)}</span>
                      </span>
                      <span className="text-muted tabular-nums shrink-0">{formatCancunShort(req.createdAt, language)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {/* Desktop: table */}
            <div className="hidden lg:block border-y border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="kl-label font-medium py-3 pr-4">{t.ticketIdLabel}</th>
                    <th className="kl-label font-medium py-3 px-4">{t.filterVilla}</th>
                    <th className="kl-label font-medium py-3 px-4">{t.filterCategory}</th>
                    <th className="kl-label font-medium py-3 px-4">{t.filterPriority}</th>
                    <th className="kl-label font-medium py-3 px-4">{t.filterStatus}</th>
                    <th className="kl-label font-medium py-3 px-4">{t.assignedSupervisorLabel}</th>
                    <th className="kl-label font-medium py-3 pl-4 text-right">{t.dateTimeColumn}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {requests.slice(0, 6).map((req) => (
                    <tr key={req.id} onClick={() => onSelectRequest(req)} className="hover:bg-wash/60 cursor-pointer transition-colors">
                      <td className={`py-3 pr-4 whitespace-nowrap tabular-nums ${req.ticketId ? 'text-ink' : 'italic text-muted'}`}>
                        {ticketLabel(t, req)}
                      </td>
                      <td className="py-3 px-4 text-brand whitespace-nowrap">{locationLabel(t, req.location.code, req.location.name)}</td>
                      <td className="py-3 px-4 text-ink whitespace-nowrap">{requestCategoryLabel(t, req)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded-sm text-[11px] font-medium uppercase tracking-wide ${PRIORITY_STYLE[req.priority]}`}>
                          {priorityBadge(t, req.priority)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{statusBadge(req.status)}</td>
                      <td className="py-3 px-4 text-muted whitespace-nowrap">
                        {req.assignedTo?.name ?? <span className="italic">{t.notAssignedYet}</span>}
                      </td>
                      <td
                        className="py-3 pl-4 text-muted text-right whitespace-nowrap tabular-nums text-xs"
                        title={formatCancunDateTime(req.createdAt, language)}
                      >
                        {formatCancunShort(req.createdAt, language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
