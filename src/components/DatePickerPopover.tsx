import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKey, parseDateKey } from '../lib/time';
import type { Language } from '../types';

/**
 * Month calendar popover for picking a single day (`YYYY-MM-DD`, Cancun calendar).
 * Days that have requests are marked with a dot; future days are disabled.
 */

interface DatePickerPopoverProps {
  value: string | null;
  /** Today's key in Cancun; later days are disabled and the view starts here when no value. */
  todayKey: string;
  /** Day keys that have at least one request. */
  markedDays: ReadonlySet<string>;
  language: Language;
  onSelect: (key: string) => void;
  onClose: () => void;
}

const LABELS = {
  en: { prev: 'Previous month', next: 'Next month', today: 'Today', hint: 'Days with work orders are marked' },
  es: { prev: 'Mes anterior', next: 'Mes siguiente', today: 'Hoy', hint: 'Los días con órdenes están marcados' },
} as const;

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  value,
  todayKey,
  markedDays,
  language,
  onSelect,
  onClose,
}) => {
  const L = LABELS[language];
  const locale = language === 'es' ? 'es-MX' : 'en-US';
  const start = parseDateKey(value ?? todayKey) ?? parseDateKey(todayKey)!;
  const [view, setView] = useState({ year: start.year, month: start.month });

  const monthTitle = new Date(Date.UTC(view.year, view.month - 1, 15)).toLocaleDateString(locale, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

  // Monday-first week header (Mon … Sun).
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'narrow' }),
      ),
    [locale],
  );

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.year, view.month - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // blanks before day 1 (Monday-first)
    const days = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
    const out: (number | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    return out;
  }, [view]);

  const today = parseDateKey(todayKey)!;
  const isCurrentMonth = view.year === today.year && view.month === today.month;
  const shift = (delta: number) =>
    setView((v) => {
      const m = v.month - 1 + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 };
    });

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={monthTitle}
        className="absolute left-0 top-full mt-1.5 z-40 w-72 bg-white border border-[#DADCE0] rounded-lg shadow-xl p-3"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label={L.prev}
            className="p-1 rounded hover:bg-[#F3F3F1] text-[#5F6368] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="inline-block text-sm font-semibold text-[#202124] first-letter:uppercase">{monthTitle}</span>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={isCurrentMonth}
            aria-label={L.next}
            className="p-1 rounded hover:bg-[#F3F3F1] text-[#5F6368] cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {weekdays.map((w, i) => (
            <span key={i} className="text-[10px] font-semibold text-[#70757A] uppercase py-1">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`b${i}`} />;
            const key = dateKey(view.year, view.month, d);
            const selected = key === value;
            const isToday = key === todayKey;
            const future = key > todayKey;
            const marked = markedDays.has(key);
            return (
              <button
                key={key}
                type="button"
                disabled={future}
                onClick={() => onSelect(key)}
                aria-pressed={selected}
                className={`relative h-8 rounded-md text-xs tabular-nums transition-colors cursor-pointer disabled:cursor-default disabled:text-[#C4C7C5] ${
                  selected
                    ? 'bg-[#6D4627] text-white font-semibold'
                    : isToday
                      ? 'border border-[#6D4627] text-[#6D4627] font-semibold hover:bg-[#F4EFEA]'
                      : 'text-[#202124] hover:bg-[#F3F3F1]'
                }`}
              >
                {d}
                {marked && !future && (
                  <span
                    className={`absolute left-1/2 -translate-x-1/2 bottom-0.5 w-1 h-1 rounded-full ${
                      selected ? 'bg-white' : 'bg-[#E37400]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 pt-2 border-t border-[#DADCE0] flex items-center justify-between">
          <span className="text-[10px] text-[#70757A] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E37400]" />
            {L.hint}
          </span>
          <button
            type="button"
            onClick={() => onSelect(todayKey)}
            className="text-xs font-medium text-[#6D4627] hover:underline cursor-pointer"
          >
            {L.today}
          </button>
        </div>
      </div>
    </>
  );
};
