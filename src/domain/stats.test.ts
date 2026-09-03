import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  computeWeekStats,
  dayOfWeekStrength,
  goalActionsInWeek,
  goalProgress,
  habitsDueToday,
  overdueTasks,
  weeklyTrend,
} from './stats';
import type { Area, Goal, Habit, HabitCompletion, Milestone, Task } from './types';

/* The week of Sunday 2026-08-30, viewed on Thursday 2026-09-03. */
const WEEK_START = '2026-08-30';
const TODAY = '2026-09-03';

let n = 0;
const task = (
  date: string,
  done: boolean,
  area: Area = 'Work',
  important = false,
  goalId?: string,
): Task => ({
  id: `t${n++}`,
  title: `Task ${n}`,
  area,
  date,
  important,
  done,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...(goalId ? { goalId } : {}),
});

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: 'Habit',
  area: 'Health',
  schedule: { type: 'daily' },
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const completion = (habitId: string, date: string): HabitCompletion => ({
  id: `${habitId}|${date}`,
  habitId,
  date,
  completedAt: `${date}T09:00:00.000Z`,
});

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  title: 'Goal',
  area: 'Work',
  progressMode: 'milestones',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const milestone = (id: string, goalId: string, done: boolean, order = 0): Milestone => ({
  id,
  goalId,
  title: id,
  done,
  order,
});

describe('computeWeekStats', () => {
  it('measures "to date" only up to today, so an unfinished week is not scored as failure', () => {
    const tasks = [
      task('2026-08-30', true), // Sun
      task('2026-08-31', true), // Mon
      task('2026-09-03', false), // Thu, today
      task('2026-09-05', false), // Sat, still ahead
      task('2026-09-05', false),
    ];
    const s = computeWeekStats(WEEK_START, TODAY, tasks, [], []);
    // Through Thursday: 3 planned, 2 done.
    expect(s.plannedToDate).toBe(3);
    expect(s.doneToDate).toBe(2);
    expect(s.pctToDate).toBe(67);
    // The whole week is a separate figure.
    expect(s.plannedTotal).toBe(5);
    expect(s.doneTotal).toBe(2);
    expect(s.remaining).toBe(3);
  });

  it('ignores tasks outside the week', () => {
    const tasks = [task('2026-08-29', true), task('2026-09-06', true), task('2026-09-01', true)];
    const s = computeWeekStats(WEEK_START, TODAY, tasks, [], []);
    expect(s.plannedTotal).toBe(1);
  });

  it('lays out all seven days in order, including empty ones', () => {
    const s = computeWeekStats(WEEK_START, TODAY, [task('2026-09-02', true)], [], []);
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay[0]!.date).toBe('2026-08-30');
    expect(s.byDay[6]!.date).toBe('2026-09-05');
    expect(s.byDay[3]).toEqual({ date: '2026-09-02', planned: 1, done: 1 });
    expect(s.byDay[0]!.planned).toBe(0);
  });

  it('reports areas that were used, and omits ones that were not', () => {
    const tasks = [
      task('2026-09-01', true, 'Work'),
      task('2026-09-01', false, 'Work'),
      task('2026-09-02', true, 'Health'),
    ];
    const s = computeWeekStats(WEEK_START, TODAY, tasks, [], []);
    expect(s.byArea.map((a) => a.area).sort()).toEqual(['Health', 'Work']);
    expect(s.byArea.find((a) => a.area === 'Work')).toMatchObject({ planned: 2, done: 1, pct: 50 });
    expect(s.byArea.some((a) => a.area === 'Learning')).toBe(false);
  });

  it('counts important tasks separately', () => {
    const tasks = [
      task('2026-09-01', true, 'Work', true),
      task('2026-09-01', false, 'Work', true),
      task('2026-09-01', true, 'Work', false),
    ];
    const s = computeWeekStats(WEEK_START, TODAY, tasks, [], []);
    expect(s.importantPlanned).toBe(2);
    expect(s.importantDone).toBe(1);
  });

  it('rolls up habit target and completions across the week', () => {
    const h = habit({ id: 'h1', schedule: { type: 'timesPerWeek', target: 4 } });
    const comps = [completion('h1', '2026-08-31'), completion('h1', '2026-09-02')];
    const s = computeWeekStats(WEEK_START, TODAY, [], [h], comps);
    expect(s.habitTarget).toBe(4);
    expect(s.habitDone).toBe(2);
    expect(s.habitPct).toBe(50);
  });

  it('does not divide by zero on an empty week', () => {
    const s = computeWeekStats(WEEK_START, TODAY, [], [], []);
    expect(s.pctToDate).toBe(0);
    expect(s.habitPct).toBe(0);
    expect(s.byArea).toEqual([]);
  });
});

describe('goalProgress', () => {
  it('counts milestones for a milestone goal', () => {
    const g = goal();
    const ms = [
      milestone('m1', 'g1', true),
      milestone('m2', 'g1', true),
      milestone('m3', 'g1', false),
      milestone('m4', 'g1', false),
    ];
    expect(goalProgress(g, ms)).toBe(50);
  });

  it('ignores milestones belonging to another goal', () => {
    const g = goal();
    const ms = [milestone('m1', 'g1', true), milestone('m2', 'other', false)];
    expect(goalProgress(g, ms)).toBe(100);
  });

  it('is 0, not NaN, for a goal with no milestones', () => {
    expect(goalProgress(goal(), [])).toBe(0);
  });

  it('uses the number for a manual goal, and caps at 100', () => {
    const g = goal({ progressMode: 'manual', manualCurrent: 4900, manualTarget: 12000 });
    expect(goalProgress(g, [])).toBe(41);
    expect(goalProgress({ ...g, manualCurrent: 15000 }, [])).toBe(100);
    // A target of zero must not produce Infinity.
    expect(goalProgress({ ...g, manualTarget: 0 }, [])).toBe(0);
  });
});

describe('goalActionsInWeek', () => {
  it('counts completed linked tasks plus linked habit completions, inside the week only', () => {
    const tasks = [
      task('2026-09-01', true, 'Work', false, 'g1'), // counts
      task('2026-09-02', false, 'Work', false, 'g1'), // not done
      task('2026-09-01', true, 'Work', false, 'other'), // other goal
      task('2026-08-20', true, 'Work', false, 'g1'), // outside the week
    ];
    const habits = [habit({ id: 'h1', goalId: 'g1' }), habit({ id: 'h2' })];
    const comps = [
      completion('h1', '2026-09-01'), // counts
      completion('h1', '2026-08-20'), // outside the week
      completion('h2', '2026-09-01'), // habit not linked
    ];
    expect(goalActionsInWeek('g1', WEEK_START, tasks, habits, comps)).toBe(2);
  });

  it('is 0 for a goal nothing points at', () => {
    expect(goalActionsInWeek('nobody', WEEK_START, [task('2026-09-01', true)], [], [])).toBe(0);
  });
});

describe('weeklyTrend', () => {
  it('runs oldest first and ends with the current week', () => {
    const trend = weeklyTrend(TODAY, [], 4);
    expect(trend.map((w) => w.weekStart)).toEqual([
      '2026-08-09',
      '2026-08-16',
      '2026-08-23',
      '2026-08-30',
    ]);
  });

  it('caps the in-progress week at today rather than counting days that have not happened', () => {
    const tasks = [
      task('2026-08-31', true), // Mon, done
      task('2026-09-05', false), // Sat, still ahead — must not drag the figure down
    ];
    const trend = weeklyTrend(TODAY, tasks, 1);
    expect(trend[0]).toMatchObject({ planned: 1, done: 1, pct: 100 });
  });
});

describe('dayOfWeekStrength', () => {
  it('groups by day of week across the window', () => {
    // Three Tuesdays, all done; two Thursdays, one done.
    const tasks = [
      task('2026-08-18', true),
      task('2026-08-25', true),
      task('2026-09-01', true),
      task('2026-08-27', true),
      task('2026-09-03', false),
    ];
    const strength = dayOfWeekStrength(TODAY, tasks, 4);
    expect(strength).toHaveLength(7);
    expect(strength[2]).toMatchObject({ day: 2, planned: 3, done: 3, pct: 100 }); // Tuesday
    expect(strength[4]).toMatchObject({ day: 4, planned: 2, done: 1, pct: 50 }); // Thursday
    expect(strength[0]!.planned).toBe(0);
  });

  it('excludes tasks in the future', () => {
    const strength = dayOfWeekStrength(TODAY, [task('2026-09-05', false)], 4);
    expect(strength[6]!.planned).toBe(0);
  });
});

describe('buildInsights — gating', () => {
  it('says nothing at all when there is no data', () => {
    expect(buildInsights(WEEK_START, TODAY, [], [], [], [])).toEqual([]);
  });

  it('always leads with the completion figure once anything is planned', () => {
    const insights = buildInsights(WEEK_START, TODAY, [task('2026-09-01', true)], [], [], []);
    expect(insights[0]!.id).toBe('completion');
    expect(insights[0]!.headline).toContain('100%');
  });

  it('withholds the best-day claim until there is a real sample', () => {
    // One task on each of three days is nowhere near enough to name a strongest day.
    const thin = [task('2026-09-01', true), task('2026-09-02', false), task('2026-09-03', true)];
    const insights = buildInsights(WEEK_START, TODAY, thin, [], [], []);
    expect(insights.some((i) => i.id === 'best-day')).toBe(false);
  });

  it('makes the best-day claim when the sample and the gap are both real', () => {
    // The claim needs at least three days each carrying a real sample, so two
    // strong days and two weak ones is still not enough to name a favourite.
    const tasks: Task[] = [];
    const push = (dates: string[], done: boolean) => {
      for (const d of dates) tasks.push(task(d, done), task(d, done));
    };
    push(['2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01'], true); // Tuesdays, all done
    push(['2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03'], false); // Thursdays, none done
    push(['2026-08-12', '2026-08-19', '2026-08-26', '2026-09-02'], true); // Wednesdays, all done

    const insights = buildInsights(WEEK_START, TODAY, tasks, [], [], []);
    const best = insights.find((i) => i.id === 'best-day');
    expect(best).toBeDefined();
    // Tuesday and Wednesday tie at 100%; first-max wins, so Tuesday is named.
    expect(best!.headline).toContain('Tuesday');
    expect(best!.detail).toContain('Thursday');
  });

  it('stays quiet when only two days carry a real sample', () => {
    const tasks: Task[] = [];
    for (const d of ['2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01']) {
      tasks.push(task(d, true), task(d, true));
    }
    for (const d of ['2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03']) {
      tasks.push(task(d, false), task(d, false));
    }
    expect(
      buildInsights(WEEK_START, TODAY, tasks, [], [], []).some((i) => i.id === 'best-day'),
    ).toBe(false);
  });

  it('flags an overloaded day only when it is genuinely lopsided', () => {
    const even = [
      task('2026-08-30', false),
      task('2026-08-31', false),
      task('2026-09-01', false),
      task('2026-09-02', false),
    ];
    expect(buildInsights(WEEK_START, TODAY, even, [], [], []).some((i) => i.id === 'overload')).toBe(
      false,
    );

    const lopsided = [
      ...Array.from({ length: 6 }, () => task('2026-09-03', false)),
      task('2026-08-31', false),
    ];
    const insights = buildInsights(WEEK_START, TODAY, lopsided, [], [], []);
    const overload = insights.find((i) => i.id === 'overload');
    expect(overload).toBeDefined();
    expect(overload!.headline).toContain('Thursday');
    expect(overload!.tone).toBe('watch');
  });

  it('names goals that received nothing this week', () => {
    const goals = [goal({ id: 'g1', area: 'Learning' })];
    const tasks = [task('2026-09-01', true, 'Work'), task('2026-09-02', true, 'Work')];
    const insights = buildInsights(WEEK_START, TODAY, tasks, [], [], goals);
    const attention = insights.find((i) => i.id === 'attention');
    expect(attention).toBeDefined();
    expect(attention!.headline).toContain('Learning');
    expect(attention!.tone).toBe('watch');
  });

  it('does not claim an important-vs-rest pattern from one flagged task', () => {
    const tasks = [task('2026-09-01', true, 'Work', true), task('2026-09-02', false, 'Work')];
    expect(
      buildInsights(WEEK_START, TODAY, tasks, [], [], []).some((i) => i.id === 'important'),
    ).toBe(false);
  });

  it('every insight carries a headline, a detail and a tone', () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      task(i < 6 ? '2026-09-03' : '2026-08-31', i % 2 === 0, 'Work', i < 3),
    );
    for (const insight of buildInsights(WEEK_START, TODAY, tasks, [], [], [])) {
      expect(insight.headline.length).toBeGreaterThan(10);
      expect(insight.detail.length).toBeGreaterThan(10);
      expect(['neutral', 'good', 'watch']).toContain(insight.tone);
    }
  });
});

describe('helpers', () => {
  it('finds overdue tasks, oldest first, excluding today and done ones', () => {
    const tasks = [
      task('2026-09-02', false),
      task('2026-08-31', false),
      task('2026-08-30', true), // done
      task(TODAY, false), // today is not overdue
    ];
    expect(overdueTasks(tasks, TODAY).map((t) => t.date)).toEqual(['2026-08-31', '2026-09-02']);
  });

  it('lists habits still open today, and drops a times-per-week habit once target is met', () => {
    const daily = habit({ id: 'h1', schedule: { type: 'daily' } });
    const weekend = habit({ id: 'h2', schedule: { type: 'weekends' } }); // Thursday: not due
    const met = habit({ id: 'h3', schedule: { type: 'timesPerWeek', target: 2 } });
    const comps = [completion('h3', '2026-08-31'), completion('h3', '2026-09-01')];
    const due = habitsDueToday([daily, weekend, met], TODAY, comps);
    expect(due.map((h) => h.id)).toEqual(['h1']);
  });

  it('drops a habit already completed today', () => {
    const daily = habit({ id: 'h1' });
    expect(habitsDueToday([daily], TODAY, [completion('h1', TODAY)])).toEqual([]);
  });
});
