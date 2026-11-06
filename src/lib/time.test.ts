import { describe, expect, it } from 'vitest';
import {
  cancunDateKey,
  cancunParts,
  cancunWallTimeToDate,
  formatCancunShort,
  formatDateKey,
  formatDuration,
  formatDurationShort,
  isInPeriod,
  startOfCancunDay,
  startOfCancunMonth,
  startOfCancunYear,
} from './time';

// Cancun is UTC-5 year-round.
const iso = (s: string) => new Date(s);

describe('Cancun boundaries', () => {
  it('reads wall-clock parts in Cancun regardless of device zone', () => {
    expect(cancunParts(iso('2026-03-10T04:30:00Z'))).toMatchObject({ year: 2026, month: 3, day: 9, hour: 23, minute: 30 });
  });

  it('converts Cancun wall time to an instant', () => {
    expect(cancunWallTimeToDate(2026, 3, 10).toISOString()).toBe('2026-03-10T05:00:00.000Z');
  });

  it('computes day, month and year starts', () => {
    const now = iso('2026-01-01T03:00:00Z'); // Dec 31 2025, 22:00 in Cancun
    expect(startOfCancunDay(now).toISOString()).toBe('2025-12-31T05:00:00.000Z');
    expect(startOfCancunMonth(now).toISOString()).toBe('2025-12-01T05:00:00.000Z');
    expect(startOfCancunYear(now).toISOString()).toBe('2025-01-01T05:00:00.000Z');
  });

  it('excludes a request from 23:30 yesterday (Cancun) from "today", even when the device is on UTC', () => {
    const prevTz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const now = iso('2026-03-10T15:00:00Z'); // 10:00 Mar 10 Cancun
      const lateYesterday = iso('2026-03-10T04:30:00Z'); // 23:30 Mar 9 Cancun, but "today" in UTC
      const earlyToday = iso('2026-03-10T05:10:00Z'); // 00:10 Mar 10 Cancun
      expect(isInPeriod(lateYesterday, 'daily', now)).toBe(false);
      expect(isInPeriod(earlyToday, 'daily', now)).toBe(true);
      expect(isInPeriod(lateYesterday, 'weekly', now)).toBe(true);
    } finally {
      process.env.TZ = prevTz;
    }
  });

  it('handles weekly (last 7 days), monthly, yearly and all', () => {
    const now = iso('2026-03-10T15:00:00Z');
    expect(isInPeriod(iso('2026-03-03T16:00:00Z'), 'weekly', now)).toBe(true);
    expect(isInPeriod(iso('2026-03-03T14:00:00Z'), 'weekly', now)).toBe(false);
    expect(isInPeriod(iso('2026-03-01T05:00:00Z'), 'monthly', now)).toBe(true);
    expect(isInPeriod(iso('2026-03-01T04:59:59Z'), 'monthly', now)).toBe(false);
    expect(isInPeriod(iso('2026-01-01T04:59:59Z'), 'yearly', now)).toBe(false);
    expect(isInPeriod(iso('2000-01-01T00:00:00Z'), 'all', now)).toBe(true);
  });
});

describe('duration formatting', () => {
  it('formats H:MM:SS with unbounded hours', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(-5000)).toBe('0:00:00');
    expect(formatDuration((27 * 3600 + 4 * 60 + 9) * 1000 + 999)).toBe('27:04:09');
  });

  it('formats short durations', () => {
    expect(formatDurationShort(45 * 60000)).toBe('45m');
    expect(formatDurationShort(200 * 60000)).toBe('3h 20m');
    expect(formatDurationShort(52 * 3600000)).toBe('2d 4h');
  });
});

describe('cancunDateKey', () => {
  it('uses the Cancun calendar day, not the device/UTC day', () => {
    // 2026-11-06 03:30 UTC is still 2026-11-05 22:30 in Cancun (UTC-5).
    expect(cancunDateKey(new Date('2026-11-06T03:30:00Z'))).toBe('2026-11-05');
    expect(cancunDateKey(new Date('2026-11-06T05:00:00Z'))).toBe('2026-11-06');
  });

  it('formats a key without shifting the day', () => {
    expect(formatDateKey('2026-11-06', 'en')).toBe('Nov 6, 2026');
    expect(formatDateKey('2026-11-06', 'es')).toMatch(/^6 nov/);
  });
});

describe('formatCancunShort', () => {
  it('is compact, 24 h, in Cancun time', () => {
    // 2026-11-06 05:13 UTC = 2026-11-06 00:13 Cancun
    const d = new Date('2026-11-06T05:13:00Z');
    expect(formatCancunShort(d, 'es')).toBe('06/11/26 00:13');
    expect(formatCancunShort(d, 'en')).toBe('11/06/26 00:13');
  });
});
