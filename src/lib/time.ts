import { TIMEZONE } from '../../shared/domain';
import type { Language, TimeFilter } from '../types';

/**
 * All operational dates are shown and bucketed in America/Cancun, regardless of the
 * device's time zone. Uses Intl so it stays correct even if Quintana Roo changes rules.
 */

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function cancunParts(date: Date): ZonedParts {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(date)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

/** Converts a Cancun wall-clock time to the corresponding instant. */
export function cancunWallTimeToDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const p = cancunParts(new Date(guess));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
  return new Date(guess - offset);
}

export function startOfCancunDay(now: Date): Date {
  const p = cancunParts(now);
  return cancunWallTimeToDate(p.year, p.month, p.day);
}

export function startOfCancunMonth(now: Date): Date {
  const p = cancunParts(now);
  return cancunWallTimeToDate(p.year, p.month, 1);
}

export function startOfCancunYear(now: Date): Date {
  const p = cancunParts(now);
  return cancunWallTimeToDate(p.year, 1, 1);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Start instant of a period ending now; `null` for 'all'. Weekly = last 7 days. */
export function periodStart(period: TimeFilter, now: Date): Date | null {
  switch (period) {
    case 'daily':
      return startOfCancunDay(now);
    case 'weekly':
      return new Date(now.getTime() - WEEK_MS);
    case 'monthly':
      return startOfCancunMonth(now);
    case 'yearly':
      return startOfCancunYear(now);
    default:
      return null;
  }
}

/** Whether `date` (submission time) falls in `period` as of `now`. */
export function isInPeriod(date: Date, period: TimeFilter, now: Date): boolean {
  const start = periodStart(period, now);
  return start === null || (date.getTime() >= start.getTime() && date.getTime() <= now.getTime());
}

const locale = (lang: Language) => (lang === 'es' ? 'es-MX' : 'en-US');

export function formatCancunDateTime(date: Date, lang: Language): string {
  return date.toLocaleString(locale(lang), {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCancunDate(date: Date, lang: Language): string {
  return date.toLocaleDateString(locale(lang), { timeZone: TIMEZONE, year: 'numeric', month: 'short', day: 'numeric' });
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Calendar day (`YYYY-MM-DD`) of an instant, in Cancun time. */
export function cancunDateKey(date: Date): string {
  const p = cancunParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Builds a `YYYY-MM-DD` key from calendar parts (month 1-12). */
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Parses a `YYYY-MM-DD` key; null when malformed. */
export function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Compact Cancun date-time for tables, 24 h: `06/11/26 14:05` (es, day first) or
 * `11/06/26 14:05` (en, month first).
 */
export function formatCancunShort(date: Date, lang: Language): string {
  const p = cancunParts(date);
  const yy = pad2(p.year % 100);
  const d = lang === 'es' ? `${pad2(p.day)}/${pad2(p.month)}/${yy}` : `${pad2(p.month)}/${pad2(p.day)}/${yy}`;
  return `${d} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Human label for a `YYYY-MM-DD` key, e.g. "6 nov 2026" / "Nov 6, 2026". */
export function formatDateKey(key: string, lang: Language): string {
  const p = parseDateKey(key);
  if (!p) return key;
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).toLocaleDateString(locale(lang), {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCancunTime(date: Date, lang: Language, withSeconds = false): string {
  return date.toLocaleTimeString(locale(lang), {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

/** `H:MM:SS` (hours unbounded, e.g. `27:04:09`). Negative input clamps to zero. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Compact human duration for KPI cards, e.g. `45m`, `3h 20m`, `2d 4h`. */
export function formatDurationShort(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
