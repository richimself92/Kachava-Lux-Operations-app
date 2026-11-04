import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  ArrowRight,
  ShieldAlert,
  Calendar,
  Filter,
  Building2
} from 'lucide-react';
import { MaintenanceRequest } from '../types';

interface DashboardProps {
  onSelectTab: (tab: string) => void;
  onOpenNewRequest: () => void;
  onSelectRequest: (req: MaintenanceRequest) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onSelectTab,
  onOpenNewRequest,
  onSelectRequest,
}) => {
  const { language, currentUser } = useAuth();
  const { 
    requests, 
    residences, 
    setFilterOptions, 
    activeTicketCountsByVilla 
  } = useRequests();
  const t = translations[language];

  // Metrics calculations
  const totalRequests = requests.length;
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const acknowledgedRequests = requests.filter((r) => r.status === 'acknowledged');
  const completedRequests = requests.filter((r) => r.status === 'completed');
  const urgentRequests = requests.filter(
    (r) => r.priority === 'urgent' && r.status !== 'completed'
  );

  const completedWithTime = completedRequests.filter((r) => r.resolutionTimeHours !== undefined);
  const avgResolutionHours =
    completedWithTime.length > 0
      ? (
          completedWithTime.reduce((sum, r) => sum + (r.resolutionTimeHours || 0), 0) /
          completedWithTime.length
        ).toFixed(1)
      : '3.4';

  const categoryCounts = requests.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleFilterAndNavigate = (status: 'all' | 'pending' | 'acknowledged' | 'completed') => {
    setFilterOptions((prev) => ({
      ...prev,
      status,
      searchQuery: '',
    }));
    onSelectTab('requests');
  };

  const handleLocationFilterAndNavigate = (locationCode: string) => {
    setFilterOptions((prev) => ({
      ...prev,
      villaNumber: locationCode,
      status: 'all',
      searchQuery: '',
    }));
    onSelectTab('requests');
  };

  const todayFormatted = new Date().toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  const getCategoryTitle = (catKey: string) => {
    const key = `cat${catKey.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
    return (t as any)[key] || catKey.replace('_', ' ');
  };

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#DADCE0]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
            {t.overviewTitle}
          </h1>
          <p className="text-xs text-[#5F6368] flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            <span className="capitalize">{todayFormatted}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleFilterAndNavigate('all')}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#DADCE0] hover:bg-[#F3F3F1] text-[#202124] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Filter className="w-3.5 h-3.5 text-[#5F6368]" />
            <span>{t.viewAllRequests}</span>
          </button>
        </div>
      </div>

      {/* Urgent Alerts Banner */}
      {urgentRequests.length > 0 && (
        <div className="bg-[#FCE8E6] border border-[#FAD2CF] rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#D93025] text-white rounded-md shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold text-[#D93025]">
                {t.kpiUrgentAlerts}: {urgentRequests.length}
              </div>
              <div className="text-xs text-[#5F6368]">
                {urgentRequests.map((u) => `${u.ticketId} (${u.villaName})`).join(' • ')}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setFilterOptions((prev) => ({ ...prev, priority: 'urgent', status: 'all' }));
              onSelectTab('requests');
            }}
            className="px-2.5 py-1 bg-[#D93025] hover:bg-[#B3261E] text-white text-xs font-medium rounded-md shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
          >
            {language === 'es' ? 'Ver Urgentes' : 'Review'}
          </button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div 
          onClick={() => handleFilterAndNavigate('pending')}
          className="bg-white border border-[#DADCE0] hover:border-[#E37400] p-3.5 rounded-lg shadow-2xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5F6368] uppercase tracking-wider">
              {t.kpiPending}
            </span>
            <div className="w-7 h-7 rounded-full bg-[#FEF7E0] text-[#E37400] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#202124]">
            {pendingRequests.length}
          </div>
          <div className="mt-1 text-[11px] text-[#E37400] font-medium flex items-center gap-1">
            <span>{language === 'es' ? 'Pendientes de asignar' : 'Awaiting action'}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        <div 
          onClick={() => handleFilterAndNavigate('acknowledged')}
          className="bg-white border border-[#DADCE0] hover:border-[#1A73E8] p-3.5 rounded-lg shadow-2xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5F6368] uppercase tracking-wider">
              {t.kpiAcknowledged}
            </span>
            <div className="w-7 h-7 rounded-full bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#202124]">
            {acknowledgedRequests.length}
          </div>
          <div className="mt-1 text-[11px] text-[#1A73E8] font-medium flex items-center gap-1">
            <span>{language === 'es' ? 'En proceso' : 'In repair'}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        <div 
          onClick={() => handleFilterAndNavigate('completed')}
          className="bg-white border border-[#DADCE0] hover:border-[#137333] p-3.5 rounded-lg shadow-2xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5F6368] uppercase tracking-wider">
              {t.kpiCompleted}
            </span>
            <div className="w-7 h-7 rounded-full bg-[#E6F4EA] text-[#137333] flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#202124]">
            {completedRequests.length}
          </div>
          <div className="mt-1 text-[11px] text-[#137333] font-medium flex items-center gap-1">
            <span>{language === 'es' ? 'Completadas' : 'Resolved'}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        <div className="bg-white border border-[#DADCE0] p-3.5 rounded-lg shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5F6368] uppercase tracking-wider">
              {t.kpiAvgResolution}
            </span>
            <div className="w-7 h-7 rounded-full bg-[#F4EFEA] text-[#6D4627] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#202124]">
            {avgResolutionHours} <span className="text-sm font-normal text-[#5F6368]">{t.hoursUnit}</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5F6368]">
            {language === 'es' ? 'Promedio general' : 'Average time'}
          </div>
        </div>
      </div>

      {/* Middle Section: Location Status & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 cols: Property Locations Grid */}
        <div className="lg:col-span-2 bg-white border border-[#DADCE0] rounded-lg p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-semibold text-[#202124]">
              {t.residenceDistribution}
            </h2>
            <button
              onClick={() => onSelectTab('residences')}
              className="text-xs text-[#6D4627] hover:underline font-medium cursor-pointer"
            >
              {language === 'es' ? 'Ver Todas →' : 'View All →'}
            </button>
          </div>

          {/* Villas Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {villasList.map((villa) => {
              const activeCount = activeTicketCountsByVilla[villa.code] || 0;
              const hasIssues = activeCount > 0;

              return (
                <button
                  key={villa.id}
                  onClick={() => handleLocationFilterAndNavigate(villa.code)}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    hasIssues
                      ? 'border-[#E37400]/40 bg-[#FEF7E0]/30 hover:bg-[#FEF7E0]/60'
                      : 'border-[#DADCE0] bg-white hover:bg-[#F3F3F1]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#6D4627]">
                      {villa.name}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        hasIssues ? 'bg-[#E37400] animate-pulse' : 'bg-[#137333]'
                      }`}
                    />
                  </div>

                  <div className="text-[10px] text-[#5F6368] mb-1.5">
                    {villa.bedrooms} BR • {villa.bathrooms} BA
                  </div>

                  <div className="text-xs font-medium">
                    {hasIssues ? (
                      <span className="text-[#E37400] font-semibold">
                        {activeCount} {language === 'es' ? 'activas' : 'open'}
                      </span>
                    ) : (
                      <span className="text-[#137333]">
                        {language === 'es' ? 'Operativa' : 'Operational'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Other Property Facilities Grid */}
          <div className="pt-2 border-t border-[#F3F3F1]">
            <div className="text-[11px] font-semibold text-[#5F6368] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#6D4627]" />
              <span>{t.locGroupOther}</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {otherLocationsList.map((facility) => {
                const activeCount = activeTicketCountsByVilla[facility.code] || 0;
                const hasIssues = activeCount > 0;
                const facilityDisplayName =
                  facility.name === 'Office'
                    ? t.locOffice
                    : facility.name === 'Gym'
                    ? t.locGym
                    : facility.name === 'Storage'
                    ? t.locStorage
                    : facility.name;

                return (
                  <button
                    key={facility.id}
                    onClick={() => handleLocationFilterAndNavigate(facility.code)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      hasIssues
                        ? 'border-[#E37400]/40 bg-[#FEF7E0]/30 hover:bg-[#FEF7E0]/60'
                        : 'border-[#DADCE0] bg-white hover:bg-[#F3F3F1]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-[#202124]">
                        {facilityDisplayName}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          hasIssues ? 'bg-[#E37400] animate-pulse' : 'bg-[#137333]'
                        }`}
                      />
                    </div>
                    <div className="text-xs font-medium">
                      {hasIssues ? (
                        <span className="text-[#E37400] font-semibold">
                          {activeCount} {language === 'es' ? 'activas' : 'open'}
                        </span>
                      ) : (
                        <span className="text-[#137333]">
                          {language === 'es' ? 'Operativa' : 'Operational'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right col: 13-Category Breakdown */}
        <div className="bg-white border border-[#DADCE0] rounded-lg p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-[#202124] mb-3">
              {t.categoryBreakdown}
            </h2>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {Object.entries(categoryCounts).map(([catKey, count]) => {
                const percentage = Math.round((count / totalRequests) * 100) || 0;
                const catLabel = getCategoryTitle(catKey);

                return (
                  <div key={catKey} className="text-xs">
                    <div className="flex justify-between font-medium text-[#202124] mb-0.5">
                      <span>{catLabel}</span>
                      <span className="text-[#5F6368]">{count}</span>
                    </div>
                    <div className="w-full bg-[#F3F3F1] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#6D4627] h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#DADCE0] text-xs text-[#5F6368]">
            <div className="flex items-center justify-between">
              <span>{language === 'es' ? 'Usuario actual:' : 'Active profile:'}</span>
              <span className="font-medium text-[#202124]">{currentUser?.displayName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Work Orders */}
      <div className="bg-white border border-[#DADCE0] rounded-lg shadow-2xs overflow-hidden">
        <div className="p-3.5 border-b border-[#DADCE0] flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-semibold text-[#202124]">
            {t.recentActivity}
          </h2>
          <button
            onClick={() => onSelectTab('requests')}
            className="text-xs text-[#6D4627] hover:underline font-semibold cursor-pointer flex items-center gap-1"
          >
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
                <th className="px-4 py-2.5">{t.submittedByLabel}</th>
                <th className="px-4 py-2.5">{t.assignedSupervisorLabel}</th>
                <th className="px-4 py-2.5 text-right">{t.submissionTimeLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DADCE0]">
              {requests.slice(0, 6).map((req) => {
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

                return (
                  <tr
                    key={req.id}
                    onClick={() => onSelectRequest(req)}
                    className="hover:bg-[#F3F3F1] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-[#202124] whitespace-nowrap">
                      {req.ticketId}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-[#6D4627] whitespace-nowrap">
                      {req.villaName}
                    </td>
                    <td className="px-4 py-2.5 text-[#202124] whitespace-nowrap">
                      {getCategoryTitle(req.category)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase ${priorityColor}`}>
                        {priorityBadgeText}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#5F6368] whitespace-nowrap">
                      {req.submittedBy.name}
                    </td>
                    <td className="px-4 py-2.5 text-[#5F6368] whitespace-nowrap">
                      {req.assignedSupervisorName || (
                        <span className="italic text-[#70757A]">{t.notAssignedYet}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[#5F6368] text-right whitespace-nowrap font-mono text-xs">
                      {new Date(req.createdAt).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
