import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { locationLabel } from '../lib/labels';
import { BedDouble, Bath, CheckCircle2, Clock, Building2, Home } from 'lucide-react';

interface ResidencesViewProps {
  onSelectVilla: (locationCode: string) => void;
  onOpenNewRequestForVilla: (locationCode: string) => void;
}

export const ResidencesView: React.FC<ResidencesViewProps> = ({
  onSelectVilla,
  onOpenNewRequestForVilla,
}) => {
  const { language } = useAuth();
  const { residences, activeTicketCountsByVilla } = useRequests();
  const t = translations[language];

  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-[#DADCE0]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
            {t.residencesTitle}
          </h1>
        </div>
        <div className="text-xs text-[#5F6368] font-medium">
          {t.locationSummary
            .replace('{villas}', String(villasList.length))
            .replace('{facilities}', String(otherLocationsList.length))}
        </div>
      </div>

      {/* Section 1: Private Villas (8 Villas in exact order) */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#6D4627] uppercase tracking-wider">
          <Home className="w-4 h-4" />
          <span>{t.villasSectionTitle} (8)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {villasList.map((villa) => {
            const activeCount = activeTicketCountsByVilla[villa.code] || 0;
            const hasIssues = activeCount > 0;

            return (
              <div
                key={villa.id}
                className={`bg-white border rounded-lg p-3.5 shadow-2xs flex flex-col justify-between transition-all ${
                  hasIssues
                    ? 'border-[#E37400]/40 ring-1 ring-[#E37400]/20'
                    : 'border-[#DADCE0] hover:border-[#6D4627]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-[#6D4627]">
                      {villa.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        hasIssues
                          ? 'bg-[#FEF7E0] text-[#E37400] border border-[#FEEFC3]'
                          : 'bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]'
                      }`}
                    >
                      {hasIssues ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>{t.hasIssuesStatus}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{t.operationalStatus}</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#5F6368] mb-3">
                    <div className="flex items-center gap-1">
                      <BedDouble className="w-3.5 h-3.5 text-[#6D4627]" />
                      <span>{villa.bedrooms} {t.bedroomsLabel}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Bath className="w-3.5 h-3.5 text-[#6D4627]" />
                      <span>{villa.bathrooms} {t.bathroomsLabel}</span>
                    </div>
                  </div>

                  <div className="bg-[#F3F3F1] rounded p-2 text-xs flex items-center justify-between">
                    <span className="text-[#5F6368]">{t.openRequestsLabel}:</span>
                    <span className={`font-semibold ${hasIssues ? 'text-[#E37400]' : 'text-[#202124]'}`}>
                      {activeCount}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-3 mt-3 border-t border-[#DADCE0]">
                  <button
                    onClick={() => onSelectVilla(villa.code)}
                    className="w-full py-1.5 px-2 bg-white hover:bg-[#F3F3F1] border border-[#DADCE0] text-[#202124] text-xs font-medium rounded transition-colors cursor-pointer text-center"
                  >
                    {t.viewRequestsBtn}
                  </button>

                  <button
                    onClick={() => onOpenNewRequestForVilla(villa.code)}
                    className="w-full py-1.5 px-2 bg-[#6D4627] hover:bg-[#55361D] text-white text-xs font-medium rounded transition-colors cursor-pointer text-center"
                  >
                    {t.newRequestBtn}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Other Property Locations (facilities) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#5F6368] uppercase tracking-wider">
          <Building2 className="w-4 h-4 text-[#6D4627]" />
          <span>{t.facilitiesSectionTitle} ({otherLocationsList.length})</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {otherLocationsList.map((facility) => {
            const activeCount = activeTicketCountsByVilla[facility.code] || 0;
            const hasIssues = activeCount > 0;
            const facilityDisplayName = locationLabel(t, facility.code, facility.name);

            return (
              <div
                key={facility.id}
                className={`bg-white border rounded-lg p-3.5 shadow-2xs flex flex-col justify-between transition-all ${
                  hasIssues
                    ? 'border-[#E37400]/40 ring-1 ring-[#E37400]/20'
                    : 'border-[#DADCE0] hover:border-[#6D4627]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-bold text-[#202124]">
                      {facilityDisplayName}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        hasIssues
                          ? 'bg-[#FEF7E0] text-[#E37400] border border-[#FEEFC3]'
                          : 'bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]'
                      }`}
                    >
                      {hasIssues ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>{t.hasIssuesStatus}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{t.operationalStatus}</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="bg-[#F3F3F1] rounded p-2 text-xs flex items-center justify-between mb-3">
                    <span className="text-[#5F6368]">{t.openRequestsLabel}:</span>
                    <span className={`font-semibold ${hasIssues ? 'text-[#E37400]' : 'text-[#202124]'}`}>
                      {activeCount}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-3 border-t border-[#DADCE0]">
                  <button
                    onClick={() => onSelectVilla(facility.code)}
                    className="w-full py-1.5 px-2 bg-white hover:bg-[#F3F3F1] border border-[#DADCE0] text-[#202124] text-xs font-medium rounded transition-colors cursor-pointer text-center"
                  >
                    {t.viewRequestsBtn}
                  </button>

                  <button
                    onClick={() => onOpenNewRequestForVilla(facility.code)}
                    className="w-full py-1.5 px-2 bg-[#6D4627] hover:bg-[#55361D] text-white text-xs font-medium rounded transition-colors cursor-pointer text-center"
                  >
                    {t.newRequestBtn}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
