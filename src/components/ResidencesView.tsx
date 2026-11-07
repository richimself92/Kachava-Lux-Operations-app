import React from 'react';
import { Bath, BedDouble, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { locationLabel } from '../lib/labels';
import { HairlineGrid, PageHeader, SectionHead } from './Kit';
import type { PropertyLocation } from '../types';

interface ResidencesViewProps {
  onSelectVilla: (locationCode: string) => void;
  onOpenNewRequestForVilla: (locationCode: string) => void;
}

export const ResidencesView: React.FC<ResidencesViewProps> = ({ onSelectVilla, onOpenNewRequestForVilla }) => {
  const { language } = useAuth();
  const { residences, activeTicketCountsByVilla } = useRequests();
  const t = translations[language];
  const es = language === 'es';

  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  const LocationCard: React.FC<{ loc: PropertyLocation; villa: boolean }> = ({ loc, villa }) => {
    const activeCount = activeTicketCountsByVilla[loc.code] || 0;
    const hasIssues = activeCount > 0;
    return (
      <article className="bg-surface flex flex-col min-w-0">
        <div className="flex-1 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg leading-snug text-ink min-w-0 break-words">{villa ? loc.name : locationLabel(t, loc.code, loc.name)}</h3>
            <span className={`flex items-center gap-1.5 text-xs shrink-0 pt-1.5 ${hasIssues ? 'text-pending' : 'text-ok'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${hasIssues ? 'bg-pending' : 'bg-ok'}`} aria-hidden />
              {hasIssues ? t.hasIssuesStatus : t.operationalStatus}
            </span>
          </div>

          {villa && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <BedDouble className="w-3.5 h-3.5" strokeWidth={1.5} />
                {loc.bedrooms} {t.bedroomsLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <Bath className="w-3.5 h-3.5" strokeWidth={1.5} />
                {loc.bathrooms} {t.bathroomsLabel}
              </span>
            </div>
          )}

          <div className="mt-5 flex items-baseline justify-between gap-3">
            <span className="kl-label">{t.openRequestsLabel}</span>
            <span className={`font-display text-3xl leading-none tabular-nums ${hasIssues ? 'text-pending' : 'text-faint'}`}>
              {activeCount}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-line divide-x divide-line">
          <button
            onClick={() => onSelectVilla(loc.code)}
            className="min-h-11 px-2 text-sm text-ink hover:bg-wash transition-colors cursor-pointer"
          >
            {t.viewRequestsBtn}
          </button>
          <button
            onClick={() => onOpenNewRequestForVilla(loc.code)}
            className="min-h-11 px-2 inline-flex items-center justify-center gap-1.5 text-sm text-brand hover:bg-brand-wash transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            {t.newRequestBtn}
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-10 sm:space-y-14">
      <PageHeader
        eyebrow={es ? '03 — Ubicaciones' : '03 — Locations'}
        title={t.residencesTitle}
        meta={t.locationSummary
          .replace('{villas}', String(villasList.length))
          .replace('{facilities}', String(otherLocationsList.length))}
      />

      <section>
        <SectionHead index={es ? 'Villas' : 'Villas'} title={`${t.villasSectionTitle} (${villasList.length})`} />
        <HairlineGrid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {villasList.map((villa) => (
            <LocationCard key={villa.id} loc={villa} villa />
          ))}
        </HairlineGrid>
      </section>

      <section>
        <SectionHead
          index={es ? 'Instalaciones' : 'Facilities'}
          title={`${t.facilitiesSectionTitle} (${otherLocationsList.length})`}
        />
        <HairlineGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {otherLocationsList.map((facility) => (
            <LocationCard key={facility.id} loc={facility} villa={false} />
          ))}
        </HairlineGrid>
      </section>
    </div>
  );
};
