/**
 * Home — "what is happening in my life right now".
 *
 * Ordered by how much it matters and how often it changes: greeting, intention,
 * today's tasks, this week, habits, goals. Everything below Today is a summary with a
 * tap-through, never the full dataset. One primary action: complete something.
 */
import { useState } from 'react';
import { Empty, HabitDot, Ring, Section } from '@/ui/components';
import { TaskRow } from '@/ui/TaskRow';
import {
  dayName,
  formatMonthDay,
  formatRange,
  greeting,
  relativeDeadline,
  startOfWeek,
  weekDates,
} from '@/domain/dates';
import {
  activeHabits,
  completionSet,
  currentStreak,
  isDone,
  streakLabel,
  weekCount,
  weeklyTarget,
} from '@/domain/habits';
import { activeGoals, computeWeekStats, goalActionsInWeek, goalProgress } from '@/domain/stats';
import type { DateKey } from '@/domain/types';
import { useStore } from '@/store/store';

export function HomeScreen({
  onOpenTask,
  onOpenGoal,
  onOpenHabit,
  onCreate,
  onOpenWeek,
}: {
  onOpenTask: (id: string) => void;
  onOpenGoal: (id: string) => void;
  onOpenHabit: (id: string) => void;
  onCreate: (kind: 'task' | 'habit' | 'goal') => void;
  onOpenWeek: () => void;
}) {
  const store = useStore();
  const { today, settings } = store;
  const weekStart = startOfWeek(today, settings.weekStartsOn);
  const days = weekDates(weekStart);

  const stats = computeWeekStats(weekStart, today, store.tasks, store.habits, store.completions);
  const todays = store.tasks
    .filter((t) => t.date === today)
    .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.important) - Number(a.important));
  const doneToday = todays.filter((t) => t.done).length;

  const set = completionSet(store.completions);
  const habits = activeHabits(store.habits, today);
  const habitsDoneToday = habits.filter((h) => isDone(set, h.id, today)).length;
  const goals = activeGoals(store.goals);

  const week = store.weekOf(today);
  const [editingIntention, setEditingIntention] = useState(false);
  const [draft, setDraft] = useState(week?.intention ?? '');

  const saveIntention = () => {
    void store.setIntention(weekStart, draft);
    setEditingIntention(false);
  };

  return (
    <div className="screen__pad">
      {/* ------------------------------------------------------------ hero */}
      <div className="hero">
        <p className="label" style={{ color: 'var(--ink-2)' }}>
          {dayName(today)} · {formatMonthDay(today)}
        </p>
        <h1 className="display d1" style={{ marginTop: 'var(--sp-5)' }}>
          {greeting()},
          <br />
          <span className="it">{settings.name || 'there'}.</span>
        </h1>

        <div
          style={{
            marginTop: 'var(--sp-8)',
            paddingTop: 'var(--sp-7)',
            borderTop: '1px solid var(--ink-wash)',
          }}
        >
          <h2 className="label" style={{ color: 'var(--ink-2)' }}>
            This week&rsquo;s intention
          </h2>
          {editingIntention ? (
            <>
              <input
                className="field"
                style={{ marginTop: 'var(--sp-4)' }}
                autoFocus
                value={draft}
                placeholder="One line. What is this week about?"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveIntention();
                  if (e.key === 'Escape') setEditingIntention(false);
                }}
                aria-label="This week's intention"
              />
              <button
                type="button"
                className="btn"
                style={{ marginTop: 'var(--sp-4)' }}
                onClick={saveIntention}
              >
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(week?.intention ?? '');
                setEditingIntention(true);
              }}
              style={{
                display: 'block',
                background: 'none',
                border: 0,
                padding: '10px 0',
                marginTop: 0,
                minHeight: 44,
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span
                className="display d3 it"
                style={{ color: week?.intention ? 'var(--ink)' : 'var(--ink-3)' }}
              >
                {week?.intention || 'Set one line for the week.'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------- today */}
      <Section title="Today" aside={todays.length ? `${doneToday} of ${todays.length} done` : undefined}>
        {todays.length > 0 ? (
          <div className="group stagger">
            {todays.map((task) => (
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
            title="Nothing planned today."
            body="A clear day is a plan too — or add the one thing worth doing."
            action={{ label: 'Add a task', onClick: () => onCreate('task') }}
          />
        )}
      </Section>

      {/* ------------------------------------------------------- this week */}
      <Section title="This week" aside={formatRange(days[0]!, days[6]!)}>
        <button
          type="button"
          className="card"
          data-area="Work"
          onClick={onOpenWeek}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-8)',
            width: '100%',
            textAlign: 'left',
            border: 0,
          }}
        >
          <Ring
            value={stats.pctToDate}
            size={82}
            label={
              <>
                {stats.pctToDate}
                <span style={{ fontSize: 11 }}>%</span>
              </>
            }
            labelSize={24}
            title={`${stats.pctToDate} percent of this week's tasks done so far`}
          />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="display d3" style={{ display: 'block' }}>
              {stats.doneToDate} of {stats.plannedToDate} done
            </span>
            <span className="body" style={{ display: 'block', marginTop: 6 }}>
              {stats.plannedTotal === 0
                ? 'Nothing planned this week yet.'
                : stats.remaining > 0
                  ? `${stats.remaining} still ahead of you this week.`
                  : 'Everything planned this week is finished.'}
            </span>
          </span>
        </button>
      </Section>

      {/* ---------------------------------------------------------- habits */}
      {habits.length > 0 ? (
        <Section title="Habits today" aside={`${habitsDoneToday} of ${habits.length}`}>
          <div className="habitStrip">
            {habits.map((habit) => {
              const count = weekCount(habit, weekStart, set);
              const target = weeklyTarget(habit);
              const streak = currentStreak(habit, today, set, settings.weekStartsOn);
              const pct = Math.round((count / target) * 100);
              return (
                <button
                  key={habit.id}
                  type="button"
                  className="habitTile"
                  data-area={habit.area}
                  onClick={() => onOpenHabit(habit.id)}
                >
                  <Ring
                    value={pct}
                    size={38}
                    stroke={4.5}
                    label={count}
                    labelSize={12}
                    title={`${habit.name}, ${count} of ${target} this week`}
                  />
                  <span className="habitTile__name">{habit.name}</span>
                  <span className="habitTile__meta">
                    {streak > 0 ? streakLabel(habit, streak) : `${count} of ${target} this week`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tap-to-complete for today, without leaving Home. */}
          <div className="group" style={{ marginTop: 'var(--sp-4)' }}>
            {habits.map((habit) => {
              const done = isDone(set, habit.id, today);
              return (
                <div key={habit.id} className="row row--center" data-area={habit.area}>
                  <HabitDot
                    done={done}
                    today
                    label={`${habit.name}, ${done ? 'done today' : 'not done today'}`}
                    onClick={() => void store.toggleHabit(habit.id, today)}
                  />
                  <button
                    type="button"
                    className="row__body"
                    onClick={() => onOpenHabit(habit.id)}
                    aria-label={`Open ${habit.name}`}
                  >
                    <span
                      className="row__title"
                      style={
                        done
                          ? { color: 'var(--ink-3)', textDecoration: 'line-through' }
                          : undefined
                      }
                    >
                      {habit.name}
                    </span>
                  </button>
                  <span className="meta">
                    {weekCount(habit, weekStart, set)}/{weeklyTarget(habit)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      ) : (
        <Section title="Habits">
          <Empty
            title="No habits yet."
            body="Habits are the things you want to do consistently — the ones that quietly move a goal."
            action={{ label: 'Add a habit', onClick: () => onCreate('habit') }}
          />
        </Section>
      )}

      {/* ----------------------------------------------------------- goals */}
      <Section title="Working toward" aside={goals.length ? `${goals.length} active` : undefined}>
        {goals.length > 0 ? (
          <div className="stagger">
            {goals.slice(0, 3).map((goal) => {
              const pct = goalProgress(goal, store.milestones);
              const actions = goalActionsInWeek(
                goal.id,
                weekStart,
                store.tasks,
                store.habits,
                store.completions,
              );
              return (
                <button
                  key={goal.id}
                  type="button"
                  className="goalCard"
                  data-area={goal.area}
                  onClick={() => onOpenGoal(goal.id)}
                >
                  <Ring
                    value={pct}
                    size={54}
                    label={pct}
                    labelSize={15}
                    title={`${goal.title}, ${pct} percent complete`}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="goalCard__title">{goal.title}</span>
                    <span className="meta" style={{ display: 'block', marginTop: 5 }}>
                      {actions} action{actions === 1 ? '' : 's'} this week
                      {goal.deadline ? ` · ${relativeDeadline(goal.deadline, today)}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No goals yet."
            body="Choose something worth working toward, and this week's tasks can start pointing at it."
            action={{ label: 'Add a goal', onClick: () => onCreate('goal') }}
          />
        )}
      </Section>

      <ReviewNudge weekStart={weekStart} today={today} onOpenWeek={onOpenWeek} />
    </div>
  );
}

/** From Saturday, Home promotes the week's review rather than hiding it under a tab. */
function ReviewNudge({
  weekStart,
  today,
  onOpenWeek,
}: {
  weekStart: DateKey;
  today: DateKey;
  onOpenWeek: () => void;
}) {
  const store = useStore();
  const days = weekDates(weekStart);
  const isEndOfWeek = today >= days[5]!;
  const week = store.weeks.find((w) => w.weekStart === weekStart);

  if (!isEndOfWeek) {
    return (
      <p className="body" style={{ marginTop: 'var(--sp-8)', padding: '0 var(--sp-1)', fontSize: 12.5 }}>
        {dayName(days[6]!)} is review day. Your week will be ready to read then.
      </p>
    );
  }

  return (
    <div className="card card--tint" data-area="Learning" style={{ marginTop: 'var(--sp-8)' }}>
      <h2 className="label" style={{ color: 'var(--deep)' }}>
        Your week is ready
      </h2>
      <p className="display d3" style={{ marginTop: 'var(--sp-4)' }}>
        {week?.review ? 'You have a review waiting.' : 'Take five minutes to look back.'}
      </p>
      <button type="button" className="btn" style={{ marginTop: 'var(--sp-7)' }} onClick={onOpenWeek}>
        {week?.review ? 'Read it' : 'Review the week'}
      </button>
    </div>
  );
}
