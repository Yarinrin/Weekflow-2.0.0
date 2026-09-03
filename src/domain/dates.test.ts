import { describe, expect, it } from 'vitest';
import {
  addDays,
  atTime,
  diffDays,
  dayIndex,
  fromKey,
  isDateKey,
  parseTime,
  recentWeekStarts,
  relativeDay,
  startOfWeek,
  toKey,
  weekDates,
} from './dates';

describe('key parsing', () => {
  it('parses to local midnight, not UTC', () => {
    // The classic bug: new Date('2026-09-03') is UTC midnight, which is Sep 2 in the
    // Americas. fromKey must give Sep 3 whatever the host timezone is.
    const d = fromKey('2026-09-03');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
  });

  it('round-trips through toKey', () => {
    for (const k of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
      expect(toKey(fromKey(k))).toBe(k);
    }
  });

  it('rejects malformed keys instead of guessing', () => {
    expect(() => fromKey('2026-9-3')).toThrow();
    expect(() => fromKey('not a date')).toThrow();
    expect(isDateKey('2026-09-03')).toBe(true);
    expect(isDateKey('')).toBe(false);
    // Out-of-range parts must be rejected, not silently rolled into another date.
    expect(isDateKey('2026-13-01')).toBe(false); // would become Jan 2027
    expect(isDateKey('2026-02-30')).toBe(false); // would become Mar 2
    expect(isDateKey('2026-00-10')).toBe(false);
    expect(isDateKey('2025-02-29')).toBe(false); // 2025 is not a leap year
    expect(isDateKey('2024-02-29')).toBe(true);
  });
});

describe('arithmetic', () => {
  it('rolls over months and years', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('measures whole days regardless of DST', () => {
    // Spans the northern spring-forward and autumn-back windows. A naive
    // millisecond division gives 6.958 or 7.042 days here and rounds wrong
    // without care; diffDays must be exact.
    expect(diffDays('2026-03-05', '2026-03-12')).toBe(7);
    expect(diffDays('2026-10-25', '2026-11-01')).toBe(7);
    expect(diffDays('2026-09-03', '2026-09-03')).toBe(0);
    expect(diffDays('2026-09-05', '2026-09-03')).toBe(-2);
  });

  it('knows the day of week', () => {
    expect(dayIndex('2026-09-03')).toBe(4); // a Thursday
    expect(dayIndex('2026-08-30')).toBe(0); // a Sunday
  });
});

describe('weeks', () => {
  it('anchors a Sunday-start week', () => {
    expect(startOfWeek('2026-09-03', 0)).toBe('2026-08-30');
    expect(startOfWeek('2026-08-30', 0)).toBe('2026-08-30');
    expect(startOfWeek('2026-09-05', 0)).toBe('2026-08-30');
    expect(startOfWeek('2026-09-06', 0)).toBe('2026-09-06');
  });

  it('anchors a Monday-start week', () => {
    expect(startOfWeek('2026-09-03', 1)).toBe('2026-08-31');
    // Sunday belongs to the week that began the previous Monday.
    expect(startOfWeek('2026-08-30', 1)).toBe('2026-08-24');
  });

  it('lists seven consecutive days', () => {
    const days = weekDates('2026-08-30');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-08-30');
    expect(days[6]).toBe('2026-09-05');
  });

  it('lists recent week starts oldest first, ending with the current one', () => {
    const weeks = recentWeekStarts('2026-09-03', 4, 0);
    expect(weeks).toEqual(['2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30']);
  });
});

describe('formatting', () => {
  it('describes nearby days in words', () => {
    const today = '2026-09-03';
    expect(relativeDay('2026-09-03', today)).toBe('Today');
    expect(relativeDay('2026-09-04', today)).toBe('Tomorrow');
    expect(relativeDay('2026-09-02', today)).toBe('Yesterday');
    expect(relativeDay('2026-09-06', today)).toBe('in 3 days');
    expect(relativeDay('2026-08-31', today)).toBe('3 days ago');
    expect(relativeDay('2026-11-20', today)).toBe('Nov 20');
  });

  it('parses times and rejects nonsense', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('7:05')).toBe(425);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('09:60')).toBeNull();
    expect(parseTime('half nine')).toBeNull();
  });

  it('builds a local Date for a day and time', () => {
    const d = atTime('2026-09-03', '07:15')!;
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(15);
    expect(atTime('2026-09-03', 'nope')).toBeNull();
  });
});
