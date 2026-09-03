/**
 * Derived statistics, and the insight sentences built from them.
 *
 * The rule from the brief: every metric must answer a question a person would actually
 * ask. Anything that only produces a number nobody acts on is not computed here.
 */
import { addDays, dayIndex, startOfWeek, weekDates } from './dates';
import { DAY_NAMES } from './dates';
import {
  activeHabits,
  completionSet,
  consistency,
  isDone,
  isDueOn,
  weekCount,
  weeklyTarget,
} from './habits';
import { AREAS } from './types';
import type {
  Area,
  DateKey,
  DayIndex,
  Goal,
  Habit,
  HabitCompletion,
  Milestone,
  Task,
  WeekStats,
} from './types';

const pct = (done: number, total: number): number =>
  total > 0 ? Math.round((done / total) * 100) : 0;

/* ------------------------------------------------------------- week stats */

export function computeWeekStats(
  weekStart: DateKey,
  today: DateKey,
  tasks: Task[],
  habits: Habit[],
  completions: HabitCompletion[],
): WeekStats {
  const days = weekDates(weekStart);
  const inWeek = tasks.filter((t) => t.date >= days[0]! && t.date <= days[6]!);
  const set = completionSet(completions);

  const byDay = days.map((date) => {
    const on = inWeek.filter((t) => t.date === date);
    return { date, planned: on.length, done: on.filter((t) => t.done).length };
  });

  // "To date" stops at today so an unfinished week is not scored as a failure.
  const toDate = byDay.filter((d) => d.date <= today);
  const plannedToDate = toDate.reduce((n, d) => n + d.planned, 0);
  const doneToDate = toDate.reduce((n, d) => n + d.done, 0);

  const plannedTotal = inWeek.length;
  const doneTotal = inWeek.filter((t) => t.done).length;

  const byArea = AREAS.map((area) => {
    const of = inWeek.filter((t) => t.area === area);
    return {
      area,
      planned: of.length,
      done: of.filter((t) => t.done).length,
      pct: pct(of.filter((t) => t.done).length, of.length),
    };
  }).filter((a) => a.planned > 0);

  const live = activeHabits(habits, today);
  const habitTarget = live.reduce((n, h) => n + weeklyTarget(h), 0);
  const habitDone = live.reduce((n, h) => n + weekCount(h, weekStart, set), 0);

  const important = inWeek.filter((t) => t.important);

  return {
    weekStart,
    plannedToDate,
    doneToDate,
    pctToDate: pct(doneToDate, plannedToDate),
    plannedTotal,
    doneTotal,
    remaining: plannedTotal - doneTotal,
    importantPlanned: important.length,
    importantDone: important.filter((t) => t.done).length,
    byDay,
    byArea,
    habitTarget,
    habitDone,
    habitPct: pct(habitDone, habitTarget),
  };
}

/* ---------------------------------------------------------------- goals */

/** Goal progress, 0–100. Milestone goals count their checklist; manual goals their number. */
export function goalProgress(goal: Goal, milestones: Milestone[]): number {
  if (goal.progressMode === 'manual') {
    const target = goal.manualTarget ?? 0;
    if (target <= 0) return 0;
    return Math.min(100, Math.round(((goal.manualCurrent ?? 0) / target) * 100));
  }
  const mine = milestones.filter((m) => m.goalId === goal.id);
  return pct(mine.filter((m) => m.done).length, mine.length);
}

/**
 * How many things the user actually *did* for a goal this week — completed linked tasks
 * plus habit completions for linked habits. This is the number that makes a goal feel
 * connected to the week rather than a wish parked on another screen.
 */
export function goalActionsInWeek(
  goalId: string,
  weekStart: DateKey,
  tasks: Task[],
  habits: Habit[],
  completions: HabitCompletion[],
): number {
  const days = weekDates(weekStart);
  const first = days[0]!;
  const last = days[6]!;

  const taskActions = tasks.filter(
    (t) => t.goalId === goalId && t.done && t.date >= first && t.date <= last,
  ).length;

  const linked = new Set(habits.filter((h) => h.goalId === goalId).map((h) => h.id));
  const habitActions = completions.filter(
    (c) => linked.has(c.habitId) && c.date >= first && c.date <= last,
  ).length;

  return taskActions + habitActions;
}

export const activeGoals = (goals: Goal[]): Goal[] => goals.filter((g) => !g.archivedAt);

/* --------------------------------------------------------- longer trends */

/** Completion percentage per week over a window, oldest first. */
export function weeklyTrend(
  today: DateKey,
  tasks: Task[],
  weeks = 8,
  weekStartsOn: DayIndex = 0,
): { weekStart: DateKey; pct: number; planned: number; done: number }[] {
  const current = startOfWeek(today, weekStartsOn);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(current, -7 * (weeks - 1 - i));
    const days = weekDates(weekStart);
    // Cap at today so the in-progress week is measured on the days that have happened.
    const inWeek = tasks.filter(
      (t) => t.date >= days[0]! && t.date <= days[6]! && t.date <= today,
    );
    const done = inWeek.filter((t) => t.done).length;
    return { weekStart, pct: pct(done, inWeek.length), planned: inWeek.length, done };
  });
}

/** Completion rate per day of week over a window — "when do I actually follow through". */
export function dayOfWeekStrength(
  today: DateKey,
  tasks: Task[],
  weeks = 8,
  weekStartsOn: DayIndex = 0,
): { day: DayIndex; planned: number; done: number; pct: number }[] {
  const from = addDays(startOfWeek(today, weekStartsOn), -7 * (weeks - 1));
  const window = tasks.filter((t) => t.date >= from && t.date <= today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = i as DayIndex;
    const on = window.filter((t) => dayIndex(t.date) === day);
    return {
      day,
      planned: on.length,
      done: on.filter((t) => t.done).length,
      pct: pct(on.filter((t) => t.done).length, on.length),
    };
  });
}

/* ------------------------------------------------------------- insights */

export interface Insight {
  /** Stable id so the UI can key and order them. */
  id: string;
  /** One sentence, the finding itself. Shown large. */
  headline: string;
  /** The evidence. Shown as body copy beneath. */
  detail: string;
  tone: 'neutral' | 'good' | 'watch';
}

/**
 * Build the insight list for a week. Every entry is gated on having enough data to be
 * true — an app that tells you your strongest day after four tasks is lying to you.
 */
export function buildInsights(
  weekStart: DateKey,
  today: DateKey,
  tasks: Task[],
  habits: Habit[],
  completions: HabitCompletion[],
  goals: Goal[],
  weekStartsOn: DayIndex = 0,
): Insight[] {
  const out: Insight[] = [];
  const stats = computeWeekStats(weekStart, today, tasks, habits, completions);
  const trend = weeklyTrend(today, tasks, 8, weekStartsOn);
  const priorWeeks = trend.slice(0, -1).filter((w) => w.planned > 0);

  /* 1 — the headline number, and whether it is normal for this person. */
  if (stats.plannedToDate > 0) {
    const avg =
      priorWeeks.length > 0
        ? Math.round(priorWeeks.reduce((n, w) => n + w.pct, 0) / priorWeeks.length)
        : null;
    let detail = `${stats.doneToDate} of ${stats.plannedToDate} tasks so far this week.`;
    if (avg !== null) {
      const delta = stats.pctToDate - avg;
      detail +=
        Math.abs(delta) < 5
          ? ` That is right on your ${avg}% average.`
          : ` Your recent average is ${avg}%, so you are ${Math.abs(delta)} points ${
              delta > 0 ? 'ahead of' : 'behind'
            } it.`;
    }
    out.push({
      id: 'completion',
      headline: `You finished ${stats.pctToDate}% of what you planned.`,
      detail,
      tone: stats.pctToDate >= 70 ? 'good' : 'neutral',
    });
  }

  /* 2 — best day. Needs a real sample, or it is noise dressed as a finding. */
  const strength = dayOfWeekStrength(today, tasks, 8, weekStartsOn).filter((d) => d.planned >= 4);
  if (strength.length >= 3) {
    const best = strength.reduce((a, b) => (b.pct > a.pct ? b : a));
    const worst = strength.reduce((a, b) => (b.pct < a.pct ? b : a));
    if (best.pct - worst.pct >= 15) {
      out.push({
        id: 'best-day',
        headline: `${DAY_NAMES[best.day]} is when you follow through.`,
        detail: `${best.pct}% completion on ${DAY_NAMES[best.day]}s against ${worst.pct}% on ${DAY_NAMES[worst.day]}s, over the last eight weeks. Worth putting the hard thing on a ${DAY_NAMES[best.day]}.`,
        tone: 'good',
      });
    }
  }

  /* 3 — overloaded day, the most actionable thing insights can say.
     Gated on the week's total volume rather than on how many days are populated:
     nothing is "overloaded" in a week with three tasks in it, however they fall,
     but six on one day is worth saying even if the rest of the week is empty. */
  if (stats.plannedTotal >= 6) {
    const heaviest = stats.byDay.reduce((a, b) => (b.planned > a.planned ? b : a));
    const mean = stats.plannedTotal / 7;
    if (heaviest.planned >= 4 && heaviest.planned >= mean * 1.75) {
      out.push({
        id: 'overload',
        headline: `${DAY_NAMES[dayIndex(heaviest.date)]} is carrying too much.`,
        detail: `${heaviest.planned} tasks on one day, against an average of ${mean.toFixed(1)}. Days like this are where things start sliding to the next one.`,
        tone: 'watch',
      });
    }
  }

  /* 4 — habit consistency, compared with the same window a week earlier. */
  const live = activeHabits(habits, today);
  if (live.length > 0 && stats.habitTarget > 0) {
    const now = Math.round(
      live.reduce((n, h) => n + consistency(h, today, completionSet(completions), 4, weekStartsOn), 0) /
        live.length,
    );
    const lastWeekEnd = addDays(startOfWeek(today, weekStartsOn), -1);
    const before = Math.round(
      live.reduce(
        (n, h) => n + consistency(h, lastWeekEnd, completionSet(completions), 4, weekStartsOn),
        0,
      ) / live.length,
    );
    const delta = now - before;
    out.push({
      id: 'habits',
      headline:
        Math.abs(delta) < 3
          ? `Your habits are holding steady at ${now}%.`
          : `Habit consistency is ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} points.`,
      detail: `${stats.habitDone} of ${stats.habitTarget} habit days this week, ${now}% consistency across the last month.`,
      tone: delta >= 0 ? 'good' : 'watch',
    });
  }

  /* 5 — where attention actually went, against where the goals are.
     The two branches need different evidence. Naming a neglected goal only needs
     the goal and a week that had *something* in it; claiming one area dominated
     needs at least two areas to compare. */
  const goalAreas = new Set(activeGoals(goals).map((g) => g.area));
  if (goalAreas.size > 0 && stats.byArea.length > 0) {
    const top = stats.byArea.reduce((a, b) => (b.planned > a.planned ? b : a));
    const neglected = [...goalAreas].filter(
      (a) => !stats.byArea.some((b) => b.area === a && b.done > 0),
    );
    if (neglected.length > 0) {
      out.push({
        id: 'attention',
        headline: `Nothing moved on ${listAreas(neglected)} this week.`,
        detail: `Most of your week went to ${top.area} — ${top.planned} of ${stats.plannedTotal} tasks. ${
          neglected.length === 1 ? 'That goal' : 'Those goals'
        } had no completed actions at all.`,
        tone: 'watch',
      });
    } else if (stats.byArea.length >= 2) {
      out.push({
        id: 'attention',
        headline: `${top.area} took the largest share of your week.`,
        detail: `${top.planned} of ${stats.plannedTotal} tasks, ${top.pct}% of them finished. Every active goal got at least one action.`,
        tone: 'good',
      });
    }
  }

  /* 6 — important vs ordinary, carried over from WeekFlow 1.0's analytics. */
  if (stats.importantPlanned >= 2) {
    const impPct = pct(stats.importantDone, stats.importantPlanned);
    const rest = stats.plannedTotal - stats.importantPlanned;
    const restPct = pct(stats.doneTotal - stats.importantDone, rest);
    if (rest >= 2 && Math.abs(impPct - restPct) >= 15) {
      out.push({
        id: 'important',
        headline:
          impPct > restPct
            ? 'You protect the things you mark important.'
            : 'The important things are the ones slipping.',
        detail: `${impPct}% of important tasks done against ${restPct}% of everything else. ${
          impPct > restPct
            ? 'The flag is doing its job.'
            : 'Worth asking whether they are too big to be one task.'
        }`,
        tone: impPct > restPct ? 'good' : 'watch',
      });
    }
  }

  return out;
}

function listAreas(areas: Area[]): string {
  if (areas.length === 1) return areas[0]!;
  if (areas.length === 2) return `${areas[0]} or ${areas[1]}`;
  return `${areas.slice(0, -1).join(', ')} or ${areas[areas.length - 1]}`;
}

/** Tasks not done on a past day — the ones a Monday-morning nudge should offer to move. */
export function overdueTasks(tasks: Task[], today: DateKey): Task[] {
  return tasks.filter((t) => !t.done && t.date < today).sort((a, b) => a.date.localeCompare(b.date));
}

/** Habits due today and not yet done. */
export function habitsDueToday(
  habits: Habit[],
  today: DateKey,
  completions: HabitCompletion[],
  weekStartsOn: DayIndex = 0,
): Habit[] {
  const set = completionSet(completions);
  const weekStart = startOfWeek(today, weekStartsOn);
  return activeHabits(habits, today).filter((h) => {
    if (isDone(set, h.id, today)) return false;
    if (h.schedule.type === 'timesPerWeek') {
      return weekCount(h, weekStart, set) < weeklyTarget(h);
    }
    return isDueOn(h, today);
  });
}
