/**
 * Week — the defining screen. Two halves of the same time unit:
 * Plan (what is ahead) and Review (what the record says about what happened).
 *
 * The old Table view is deliberately not reproduced. A 5x7 grid on a phone gives 55px
 * cells that cannot hold a task title; what the table was *for* — spotting imbalance —
 * is the per-day load bars here and the breakdowns in Review.
 */
import { useState } from 'react';
import { Bars, Empty, HabitDot, Ring, Section, Segmented } from '@/ui/components';
import { TaskRow } from '@/ui/TaskRow';
import { ChevronLeft, ChevronRight } from '@/ui/Icons';
import {
  DAY_SHORT,
  addDays,
  dayLetter,
  dayName,
  formatRange,
  fromKey,
  startOfWeek,
  weekDates,
} from '@/domain/dates';
import {
  activeHabits,
  completionSet,
  isDone,
  isDueOn,
  weekCount,
  weeklyTarget,
} from '@/domain/habits';
import { buildInsights, computeWeekStats, dayOfWeekStrength, weeklyTrend } from '@/domain/stats';
import type { DateKey } from '@/domain/types';
import { useStore } from '@/store/store';
import { ReviewPanel } from './Review';

export function WeekScreen({
  selected,
  onSelect,
  segment,
  onSegment,
  onOpenTask,
  onCreate,
}: {
  selected: DateKey;
  onSelect: (d: DateKey) => void;
  segment: 'plan' | 'review';
  onSegment: (s: 'plan' | 'review') => void;
  onOpenTask: (id: string) => void;
  onCreate: (kind: 'task') => void;
}) {
  const store = useStore();
  const { today, settings } = store;
  const weekStart = startOfWeek(selected, settings.weekStartsOn);
  const days = weekDates(weekStart);
  const isCurrentWeek = weekStart === startOfWeek(today, settings.weekStartsOn);

  const goWeek = (delta: number) => {
    const nextStart = addDays(weekStart, delta * 7);
    // Land on today when stepping back into the current week, else the first day.
    const nextDays = weekDates(nextStart);
    onSelect(nextDays.includes(today) ? today : nextStart);
  };

  return (
    <div className="screen__pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="label">{formatRange(days[0]!, days[6]!)}</p>
          <h1 className="display d1" style={{ marginTop: 'var(--sp-3)' }}>
            {isCurrentWeek ? 'Your week' : weekLabel(weekStart, today, settings.weekStartsOn)}
          </h1>
        </div>
        <button
          type="button"
          className="backBtn"
          style={{ margin: 0, padding: 10 }}
          onClick={() => goWeek(-1)}
          aria-label="Previous week"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="backBtn"
          style={{ margin: 0, padding: 10 }}
          onClick={() => goWeek(1)}
          aria-label="Next week"
          disabled={weekStart >= startOfWeek(today, settings.weekStartsOn)}
        >
          <ChevronRight />
        </button>
      </div>

      <Segmented
        label="Week view"
        value={segment}
        onChange={onSegment}
        options={[
          { value: 'plan', label: 'Plan' },
          { value: 'review', label: 'Review' },
        ]}
      />

      {segment === 'plan' ? (
        <PlanView
          weekStart={weekStart}
          selected={selected}
          onSelect={onSelect}
          onOpenTask={onOpenTask}
          onCreate={onCreate}
        />
      ) : (
        <ReviewView weekStart={weekStart} />
      )}
    </div>
  );
}

function weekLabel(weekStart: DateKey, today: DateKey, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6): string {
  const current = startOfWeek(today, weekStartsOn);
  const weeksBack = Math.round(
    (fromKey(current).getTime() - fromKey(weekStart).getTime()) / (7 * 86_400_000),
  );
  if (weeksBack === 1) return 'Last week';
  return `${weeksBack} weeks ago`;
}

/* ------------------------------------------------------------------- plan */

function PlanView({
  weekStart,
  selected,
  onSelect,
  onOpenTask,
  onCreate,
}: {
  weekStart: DateKey;
  selected: DateKey;
  onSelect: (d: DateKey) => void;
  onOpenTask: (id: string) => void;
  onCreate: (kind: 'task') => void;
}) {
  const store = useStore();
  const { today } = store;
  const days = weekDates(weekStart);
  const set = completionSet(store.completions);
  const stats = computeWeekStats(weekStart, today, store.tasks, store.habits, store.completions);
  const maxLoad = Math.max(1, ...stats.byDay.map((d) => d.planned));

  const dayTasks = store.tasks
    .filter((t) => t.date === selected)
    .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.important) - Number(a.important));
  const doneCount = dayTasks.filter((t) => t.done).length;
  const habits = activeHabits(store.habits, selected);

  const heaviest = stats.byDay.reduce((a, b) => (b.planned > a.planned ? b : a), stats.byDay[0]!);
  const mean = stats.plannedTotal / 7;

  return (
    <>
      <div className="days" role="tablist" aria-label="Days of the week">
        {days.map((date, i) => {
          const load = stats.byDay[i]?.planned ?? 0;
          const cls = [
            'dayChip',
            date === selected && 'dayChip--sel',
            date === today && date !== selected && 'dayChip--today',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={date === selected}
              className={cls}
              onClick={() => onSelect(date)}
              aria-label={`${dayName(date)}, ${load} task${load === 1 ? '' : 's'}`}
            >
              <span className="dayChip__letter">{dayLetter(date)}</span>
              <span className="dayChip__num">{fromKey(date).getDate()}</span>
              <span className="dayChip__load">
                <i style={{ width: `${Math.round((load / maxLoad) * 100)}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      <Section
        title={`${dayName(selected)}${selected === today ? ' · today' : ''}`}
        aside={dayTasks.length ? `${doneCount} of ${dayTasks.length}` : undefined}
      >
        {dayTasks.length > 0 ? (
          <div className="group stagger">
            {dayTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                goal={store.goals.find((g) => g.id === task.goalId)}
                onToggle={() => void store.toggleTask(task.id)}
                onOpen={() => onOpenTask(task.id)}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="Nothing planned."
            body="A clear day is a plan too — or add the one thing worth doing."
            action={{ label: 'Add a task', onClick: () => onCreate('task') }}
          />
        )}
      </Section>

      {habits.length > 0 && (
        <Section title="Habits">
          <div className="group">
            {habits.map((habit) => {
              const done = isDone(set, habit.id, selected);
              const due = isDueOn(habit, selected);
              return (
                <div key={habit.id} className="row row--center" data-area={habit.area}>
                  <HabitDot
                    done={done}
                    today={selected === today}
                    scheduled={due}
                    label={`${habit.name} on ${dayName(selected)}`}
                    onClick={() => void store.toggleHabit(habit.id, selected)}
                  />
                  <span className="row__body">
                    <span
                      className="row__title"
                      style={
                        done ? { color: 'var(--ink-3)', textDecoration: 'line-through' } : undefined
                      }
                    >
                      {habit.name}
                    </span>
                    <span className="meta" style={{ display: 'block', marginTop: 3 }}>
                      {due ? scheduleLabel(habit.schedule) : 'Not scheduled today'}
                    </span>
                  </span>
                  <span className="meta">
                    {weekCount(habit, weekStart, set)}/{weeklyTarget(habit)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {stats.plannedTotal >= 4 && heaviest.planned >= mean * 1.75 && (
        <div className="card card--tint" data-area="Other" style={{ marginTop: 'var(--sp-8)' }}>
          <h2 className="label" style={{ color: 'var(--deep)' }}>
            Week load
          </h2>
          <p className="body" style={{ marginTop: 9, color: 'var(--ink)' }}>
            {dayName(heaviest.date)} is carrying {heaviest.planned} tasks against an average of{' '}
            {mean.toFixed(1)}. Days like that are where things start sliding to the next one.
          </p>
        </div>
      )}
    </>
  );
}

function scheduleLabel(schedule: { type: string; target?: number; days?: number[] }): string {
  switch (schedule.type) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'days':
      return (schedule.days ?? []).map((d) => DAY_SHORT[d] ?? '').join(', ');
    case 'timesPerWeek':
      return `${schedule.target}× a week`;
    default:
      return '';
  }
}

/* ----------------------------------------------------------------- review */

function ReviewView({ weekStart }: { weekStart: DateKey }) {
  const store = useStore();
  const { today, settings } = store;
  const [showAllAreas, setShowAllAreas] = useState(false);

  const stats = computeWeekStats(weekStart, today, store.tasks, store.habits, store.completions);
  const insights = buildInsights(
    weekStart,
    today,
    store.tasks,
    store.habits,
    store.completions,
    store.goals,
    settings.weekStartsOn,
  );
  const trend = weeklyTrend(today, store.tasks, 8, settings.weekStartsOn);
  const strength = dayOfWeekStrength(today, store.tasks, 8, settings.weekStartsOn);
  const days = weekDates(weekStart);

  /* The charts must agree with the sentences above them, so they single out the same
     day buildInsights picked — same filter, same first-max-wins tie-break. */
  const bestDay = strength
    .filter((d) => d.planned >= 4)
    .reduce<(typeof strength)[number] | undefined>((a, b) => (a && a.pct >= b.pct ? a : b), undefined);
  const heaviestIndex = stats.byDay.reduce(
    (best, d, i) => (d.planned > stats.byDay[best]!.planned ? i : best),
    0,
  );

  if (stats.plannedTotal === 0 && insights.length === 0) {
    return (
      <Section title="Insights">
        <Empty
          title="Nothing to look back on yet."
          body="Once you have planned and finished a few things, this is where WeekFlow tells you what it noticed."
        />
      </Section>
    );
  }

  const areas = showAllAreas ? stats.byArea : stats.byArea.slice(0, 3);

  return (
    <>
      <Section title="Insights" aside="week to date">
        <div className="stagger">
          {insights.map((insight) => (
            <div key={insight.id} className="insight card" data-area={toneArea(insight.tone)}>
              <p className="insight__headline">{insight.headline}</p>
              <p className="body" style={{ marginTop: 'var(--sp-4)' }}>
                {insight.detail}
              </p>

              {insight.id === 'completion' && trend.some((w) => w.planned > 0) && (
                <Bars
                  data={trend.map((w, i) => ({
                    value: w.pct,
                    max: 100,
                    tick: i === trend.length - 1 ? 'now' : `w${i + 1}`,
                    highlight: i === trend.length - 1,
                  }))}
                />
              )}

              {insight.id === 'best-day' && (
                <Bars
                  data={strength.map((d) => ({
                    value: d.pct,
                    max: 100,
                    tick: DAY_SHORT[d.day]!.charAt(0),
                    // Exactly the day the headline names. Highlighting every day tied
                    // at the maximum would contradict the sentence above it.
                    highlight: d.day === bestDay?.day,
                  }))}
                />
              )}

              {insight.id === 'overload' && (
                <Bars
                  data={stats.byDay.map((d, i) => ({
                    value: d.planned,
                    max: Math.max(1, ...stats.byDay.map((x) => x.planned)),
                    tick: dayLetter(days[i]!),
                    highlight: i === heaviestIndex,
                  }))}
                />
              )}
            </div>
          ))}
        </div>
      </Section>

      {stats.byArea.length > 0 && (
        <Section title="Where your attention went">
          <div className="group">
            {areas.map((a) => (
              <div key={a.area} className="row row--center" data-area={a.area}>
                <Ring
                  value={a.pct}
                  size={40}
                  stroke={5}
                  label={a.pct}
                  labelSize={11}
                  title={`${a.area}, ${a.pct} percent done`}
                />
                <span className="row__body">
                  <span className="row__title">{a.area}</span>
                  <span className="meta" style={{ display: 'block', marginTop: 3 }}>
                    {a.done} of {a.planned} done
                  </span>
                </span>
              </div>
            ))}
          </div>
          {stats.byArea.length > 3 && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 'var(--sp-4)' }}
              onClick={() => setShowAllAreas((v) => !v)}
            >
              {showAllAreas ? 'Show less' : `Show all ${stats.byArea.length} areas`}
            </button>
          )}
        </Section>
      )}

      <ReviewPanel weekStart={weekStart} stats={stats} />
    </>
  );
}

/** Insight tone maps onto an existing area tint rather than a new colour. */
function toneArea(tone: 'neutral' | 'good' | 'watch'): string {
  if (tone === 'good') return 'Health';
  if (tone === 'watch') return 'Other';
  return 'Work';
}
