import { describe, expect, it } from 'vitest';
import {
  completionSet,
  consistency,
  currentStreak,
  isDueOn,
  streakLabel,
  weekCount,
  weeklyHistory,
  weeklyTarget,
} from './habits';
import type { Habit, HabitCompletion, HabitSchedule } from './types';

const habit = (schedule: HabitSchedule, createdAt = '2026-01-01T00:00:00.000Z'): Habit => ({
  id: 'h1',
  name: 'Test habit',
  area: 'Health',
  schedule,
  createdAt,
});

const done = (...dates: string[]): HabitCompletion[] =>
  dates.map((date) => ({
    id: `h1|${date}`,
    habitId: 'h1',
    date,
    completedAt: `${date}T09:00:00.000Z`,
  }));

describe('scheduling', () => {
  it('knows which days each schedule wants', () => {
    // 2026-08-30 is a Sunday, 2026-09-03 a Thursday, 2026-09-05 a Saturday.
    expect(isDueOn(habit({ type: 'daily' }), '2026-08-30')).toBe(true);
    expect(isDueOn(habit({ type: 'weekdays' }), '2026-08-30')).toBe(false);
    expect(isDueOn(habit({ type: 'weekdays' }), '2026-09-03')).toBe(true);
    expect(isDueOn(habit({ type: 'weekends' }), '2026-09-05')).toBe(true);
    expect(isDueOn(habit({ type: 'weekends' }), '2026-09-03')).toBe(false);
    expect(isDueOn(habit({ type: 'days', days: [1, 3, 5] }), '2026-09-02')).toBe(true);
    expect(isDueOn(habit({ type: 'days', days: [1, 3, 5] }), '2026-09-03')).toBe(false);
  });

  it('computes weekly targets', () => {
    expect(weeklyTarget(habit({ type: 'daily' }))).toBe(7);
    expect(weeklyTarget(habit({ type: 'weekdays' }))).toBe(5);
    expect(weeklyTarget(habit({ type: 'weekends' }))).toBe(2);
    expect(weeklyTarget(habit({ type: 'days', days: [1, 3, 5] }))).toBe(3);
    expect(weeklyTarget(habit({ type: 'timesPerWeek', target: 4 }))).toBe(4);
  });
});

describe('streaks', () => {
  it('counts consecutive completed days', () => {
    const h = habit({ type: 'daily' });
    const set = completionSet(done('2026-09-01', '2026-09-02', '2026-09-03'));
    expect(currentStreak(h, '2026-09-03', set)).toBe(3);
  });

  it('does not punish a today that has not happened yet', () => {
    // Three days through yesterday, today still open. The streak is 3, not 0.
    const h = habit({ type: 'daily' });
    const set = completionSet(done('2026-08-31', '2026-09-01', '2026-09-02'));
    expect(currentStreak(h, '2026-09-03', set)).toBe(3);
  });

  it('breaks on a genuinely missed day', () => {
    const h = habit({ type: 'daily' });
    // 2026-09-01 missed; only the 2nd and 3rd count.
    const set = completionSet(done('2026-08-31', '2026-09-02', '2026-09-03'));
    expect(currentStreak(h, '2026-09-03', set)).toBe(2);
  });

  it('skips unscheduled days rather than breaking on them', () => {
    // A weekday habit is not broken by the weekend it was never due on.
    const h = habit({ type: 'weekdays' });
    const set = completionSet(
      done('2026-08-27', '2026-08-28', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'),
    );
    expect(currentStreak(h, '2026-09-03', set)).toBe(6);
  });

  it('counts weeks, not days, for a times-per-week habit', () => {
    const h = habit({ type: 'timesPerWeek', target: 3 });
    const set = completionSet(
      done(
        // week of Aug 16: 3 -> hit
        '2026-08-17', '2026-08-19', '2026-08-21',
        // week of Aug 23: 3 -> hit
        '2026-08-24', '2026-08-26', '2026-08-28',
        // current week of Aug 30: only 2 so far -> not counted, but not a break
        '2026-08-31', '2026-09-02',
      ),
    );
    expect(currentStreak(h, '2026-09-03', set)).toBe(2);
  });

  it('labels streaks in the right unit', () => {
    expect(streakLabel(habit({ type: 'daily' }), 12)).toBe('12-day streak');
    expect(streakLabel(habit({ type: 'timesPerWeek', target: 4 }), 3)).toBe('3 weeks at target');
    expect(streakLabel(habit({ type: 'timesPerWeek', target: 4 }), 1)).toBe('1 week at target');
    expect(streakLabel(habit({ type: 'daily' }), 0)).toBe('');
  });
});

describe('consistency', () => {
  it('is 100% when every due day was done', () => {
    const h = habit({ type: 'daily' }, '2026-08-30T00:00:00.000Z');
    const set = completionSet(
      done('2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'),
    );
    expect(consistency(h, '2026-09-03', set, 2)).toBe(100);
  });

  it('does not count days before the habit existed', () => {
    // Created Wednesday; the Sunday-to-Tuesday of that week must not count against it.
    const h = habit({ type: 'daily' }, '2026-09-02T00:00:00.000Z');
    const set = completionSet(done('2026-09-02', '2026-09-03'));
    expect(consistency(h, '2026-09-03', set, 1)).toBe(100);
  });

  it('does not count days that have not happened yet', () => {
    const h = habit({ type: 'daily' }, '2026-08-30T00:00:00.000Z');
    // Done every day so far this week; Fri/Sat are still ahead.
    const set = completionSet(
      done('2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'),
    );
    expect(consistency(h, '2026-09-03', set, 1)).toBe(100);
  });

  it('reports a real shortfall', () => {
    const h = habit({ type: 'daily' }, '2026-08-30T00:00:00.000Z');
    // 3 of the 5 days that have happened.
    const set = completionSet(done('2026-08-30', '2026-09-01', '2026-09-03'));
    expect(consistency(h, '2026-09-03', set, 1)).toBe(60);
  });
});

describe('week rollups', () => {
  it('counts completions inside a week', () => {
    const h = habit({ type: 'timesPerWeek', target: 4 });
    const set = completionSet(done('2026-08-31', '2026-09-01', '2026-09-09'));
    expect(weekCount(h, '2026-08-30', set)).toBe(2);
  });

  it('builds history oldest first, ending with the current week', () => {
    const h = habit({ type: 'timesPerWeek', target: 4 });
    const set = completionSet(done('2026-08-24', '2026-08-31', '2026-09-01'));
    const hist = weeklyHistory(h, '2026-09-03', set, 3);
    expect(hist.map((w) => w.weekStart)).toEqual(['2026-08-16', '2026-08-23', '2026-08-30']);
    expect(hist.map((w) => w.count)).toEqual([0, 1, 2]);
    expect(hist.every((w) => w.target === 4)).toBe(true);
  });
});
