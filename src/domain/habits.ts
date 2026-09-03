/**
 * Habit scheduling and the numbers derived from completion history.
 *
 * Nothing here is stored. Streak and consistency are computed from the completion rows
 * every time they are shown, so they can never disagree with the record — which is the
 * whole reason habits stopped being materialised tasks.
 */
import { addDays, dayIndex, diffDays, startOfWeek, weekDates } from './dates';
import type { DateKey, DayIndex, Habit, HabitCompletion } from './types';

/** Is this habit meant to be done on this day? */
export function isDueOn(habit: Habit, date: DateKey): boolean {
  const d = dayIndex(date);
  switch (habit.schedule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return d >= 1 && d <= 5;
    case 'weekends':
      return d === 0 || d === 6;
    case 'days':
      return habit.schedule.days.includes(d);
    case 'timesPerWeek':
      // No specific days — it is due whenever the user likes, so it is offered daily
      // until the week's target is met. `weeklyTarget` is what actually judges it.
      return true;
  }
}

/**
 * How many completions count as a full week for this habit.
 * These are counts rather than day positions, so the user's week start does not
 * change them.
 */
export function weeklyTarget(habit: Habit): number {
  switch (habit.schedule.type) {
    case 'daily':
      return 7;
    case 'weekdays':
      return 5;
    case 'weekends':
      return 2;
    case 'days':
      return habit.schedule.days.length || 1;
    case 'timesPerWeek':
      return Math.max(1, habit.schedule.target);
  }
}

/** Does a habit with specific days have this day among them? Used for the day strip. */
export function isScheduledDay(habit: Habit, date: DateKey): boolean {
  return habit.schedule.type === 'timesPerWeek' ? false : isDueOn(habit, date);
}

/** Fast lookup set of 'habitId|date' keys. */
export function completionSet(completions: HabitCompletion[]): Set<string> {
  return new Set(completions.map((c) => `${c.habitId}|${c.date}`));
}

export const isDone = (set: Set<string>, habitId: string, date: DateKey): boolean =>
  set.has(`${habitId}|${date}`);

/** Completions for one habit in one week, in day order. */
export function weekProgress(
  habit: Habit,
  weekStart: DateKey,
  set: Set<string>,
): { date: DateKey; due: boolean; done: boolean }[] {
  return weekDates(weekStart).map((date) => ({
    date,
    due: isDueOn(habit, date),
    done: isDone(set, habit.id, date),
  }));
}

export function weekCount(habit: Habit, weekStart: DateKey, set: Set<string>): number {
  return weekDates(weekStart).filter((d) => isDone(set, habit.id, d)).length;
}

/**
 * Current streak.
 *
 * For a habit with fixed days (daily, weekdays, weekends, specific days) this is
 * consecutive *scheduled* days completed — a weekday habit is not broken by Sunday.
 * For a times-per-week habit a day streak is meaningless, so it counts consecutive
 * weeks that met target instead. Callers must use `streakUnit` to label it correctly.
 *
 * Today is not counted against the user until it is over: if today is scheduled and not
 * yet done, the streak is measured up to yesterday rather than reported as broken.
 */
export function currentStreak(
  habit: Habit,
  today: DateKey,
  set: Set<string>,
  weekStartsOn: DayIndex = 0,
): number {
  if (habit.schedule.type === 'timesPerWeek') {
    const target = weeklyTarget(habit);
    let weeks = 0;
    let ws = startOfWeek(today, weekStartsOn);
    // The current week is still in progress; only count it if target is already met.
    if (weekCount(habit, ws, set) < target) ws = addDays(ws, -7);
    for (;;) {
      if (weekCount(habit, ws, set) < target) break;
      weeks++;
      ws = addDays(ws, -7);
      if (weeks > 260) break; // five years is enough
    }
    return weeks;
  }

  let cursor = today;
  // Grace for an unfinished today.
  if (isDueOn(habit, cursor) && !isDone(set, habit.id, cursor)) cursor = addDays(cursor, -1);

  let streak = 0;
  let guard = 0;
  while (guard++ < 1825) {
    if (!isDueOn(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!isDone(set, habit.id, cursor)) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function streakUnit(habit: Habit): 'day' | 'week' {
  return habit.schedule.type === 'timesPerWeek' ? 'week' : 'day';
}

/** "12-day streak" / "3 weeks at target" / "" when there is nothing to say yet. */
export function streakLabel(habit: Habit, streak: number): string {
  if (streak <= 0) return '';
  return streakUnit(habit) === 'day'
    ? `${streak}-day streak`
    : `${streak} week${streak === 1 ? '' : 's'} at target`;
}

/**
 * Consistency over a window of whole weeks ending with the week containing `today`:
 * completions achieved divided by completions expected.
 *
 * Weeks before the habit existed are excluded, and the current week is measured only
 * up to today — otherwise every habit shows a slump every Monday morning.
 */
export function consistency(
  habit: Habit,
  today: DateKey,
  set: Set<string>,
  weeks = 8,
  weekStartsOn: DayIndex = 0,
): number {
  const created = habit.createdAt.slice(0, 10);
  let expected = 0;
  let achieved = 0;
  const thisWeekStart = startOfWeek(today, weekStartsOn);

  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(thisWeekStart, -7 * w);
    for (const date of weekDates(ws)) {
      if (date < created) continue; // before the habit existed
      if (date > today) continue; // the future is not a failure
      if (habit.schedule.type === 'timesPerWeek') continue; // handled below
      if (!isDueOn(habit, date)) continue;
      expected++;
      if (isDone(set, habit.id, date)) achieved++;
    }
    if (habit.schedule.type === 'timesPerWeek') {
      const target = weeklyTarget(habit);
      const daysCounted = weekDates(ws).filter((d) => d >= created && d <= today).length;
      if (daysCounted === 0) continue;
      // Pro-rate the target for a partial week so the current week is judged fairly.
      expected += (target * daysCounted) / 7;
      achieved += weekCount(habit, ws, set);
    }
  }

  if (expected <= 0) return 0;
  return Math.min(100, Math.round((achieved / expected) * 100));
}

/** Per-week completion counts for the history chart, oldest first. */
export function weeklyHistory(
  habit: Habit,
  today: DateKey,
  set: Set<string>,
  weeks = 8,
  weekStartsOn: DayIndex = 0,
): { weekStart: DateKey; count: number; target: number }[] {
  const target = weeklyTarget(habit);
  const thisWeekStart = startOfWeek(today, weekStartsOn);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(thisWeekStart, -7 * (weeks - 1 - i));
    return { weekStart, count: weekCount(habit, weekStart, set), target };
  });
}

/** Habits that are still live (not archived) on a given day. */
export function activeHabits(habits: Habit[], onDate: DateKey): Habit[] {
  return habits.filter((h) => {
    if (h.createdAt.slice(0, 10) > onDate) return false;
    if (h.archivedAt && h.archivedAt.slice(0, 10) <= onDate) return false;
    return true;
  });
}

/** Days since a habit was last completed, or null if never. */
export function daysSinceLast(
  habit: Habit,
  today: DateKey,
  completions: HabitCompletion[],
): number | null {
  const dates = completions
    .filter((c) => c.habitId === habit.id && c.date <= today)
    .map((c) => c.date)
    .sort();
  const last = dates[dates.length - 1];
  return last ? diffDays(last, today) : null;
}
