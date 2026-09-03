/**
 * Habit detail. Gamification budget, deliberately small: a streak and a consistency
 * percentage. No badges, no levels, no loss-aversion. A broken streak is shown without
 * comment — the history simply has a gap.
 */
import { useState } from 'react';
import { BackButton, Bars, Empty, HabitDot, Pill, Ring, Section, TimePicker } from '@/ui/components';
import { TrashIcon } from '@/ui/Icons';
import { DAY_SHORT, dayLetter, formatShort, startOfWeek, weekDates } from '@/domain/dates';
import {
  completionSet,
  consistency,
  currentStreak,
  daysSinceLast,
  isDone,
  isDueOn,
  streakLabel,
  weekCount,
  weeklyHistory,
  weeklyTarget,
} from '@/domain/habits';
import { goalProgress } from '@/domain/stats';
import type { Habit } from '@/domain/types';
import { useStore } from '@/store/store';

export function HabitDetailScreen({
  habitId,
  onBack,
  onOpenGoal,
}: {
  habitId: string;
  onBack: () => void;
  onOpenGoal: (id: string) => void;
}) {
  const store = useStore();
  const { today, settings } = store;
  const habit = store.habits.find((h) => h.id === habitId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!habit) {
    return (
      <div className="screen__pad">
        <BackButton label="Back" onClick={onBack} />
        <Empty title="That habit is gone." body="It may have been deleted on another screen." />
      </div>
    );
  }

  const weekStart = startOfWeek(today, settings.weekStartsOn);
  const days = weekDates(weekStart);
  const set = completionSet(store.completions);
  const count = weekCount(habit, weekStart, set);
  const target = weeklyTarget(habit);
  const pct = Math.round((count / target) * 100);
  const streak = currentStreak(habit, today, set, settings.weekStartsOn);
  const rate = consistency(habit, today, set, 8, settings.weekStartsOn);
  const history = weeklyHistory(habit, today, set, 8, settings.weekStartsOn);
  const since = daysSinceLast(habit, today, store.completions);
  const goal = habit.goalId ? store.goals.find((g) => g.id === habit.goalId) : undefined;

  return (
    <div className="screen__pad" data-area={habit.area}>
      <BackButton label="Back" onClick={onBack} />

      <div
        className="hero"
        style={{
          background: 'linear-gradient(150deg, var(--tint), var(--surface) 82%)',
          textAlign: 'center',
        }}
      >
        <span style={{ display: 'inline-block' }}>
          <Ring
            value={pct}
            size={116}
            label={
              <>
                {count}
                <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>/{target}</span>
              </>
            }
            labelSize={30}
            title={`${habit.name}, ${count} of ${target} this week`}
          />
        </span>
        <h1 className="display d2" style={{ marginTop: 'var(--sp-7)' }}>
          {habit.name}
        </h1>
        <p className="meta" style={{ marginTop: 6 }}>
          {habit.area} · {scheduleLabel(habit)}
        </p>
        <div
          style={{
            display: 'flex',
            gap: 'var(--sp-3)',
            justifyContent: 'center',
            marginTop: 'var(--sp-7)',
            flexWrap: 'wrap',
          }}
        >
          {streak > 0 && <Pill variant="ghost">{streakLabel(habit, streak)}</Pill>}
          <Pill variant="ghost">{rate}% consistency</Pill>
        </div>
      </div>

      {/* ------------------------------------------------------ this week */}
      <Section title="This week" aside={`${count} of ${target}`}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {days.map((date) => (
              <span
                key={date}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: date === today ? 'var(--deep)' : 'var(--ink-3)',
                  }}
                >
                  {dayLetter(date)}
                </span>
                <HabitDot
                  size="lg"
                  done={isDone(set, habit.id, date)}
                  today={date === today}
                  scheduled={isDueOn(habit, date)}
                  label={`${habit.name} on ${formatShort(date)}`}
                  onClick={() => void store.toggleHabit(habit.id, date)}
                />
              </span>
            ))}
          </div>
          <p className="meta" style={{ marginTop: 'var(--sp-7)', lineHeight: 1.5 }}>
            Tap any day to correct it. A gap is a gap — nothing is taken away.
          </p>
        </div>
      </Section>

      {/* -------------------------------------------------------- history */}
      <Section title="Last eight weeks" aside={`${rate}% consistency`}>
        <div className="card">
          <Bars
            data={history.map((w, i) => ({
              value: w.count,
              max: w.target,
              tick: i === history.length - 1 ? 'now' : String(i + 1),
              highlight: i === history.length - 1,
            }))}
          />
          <p className="body" style={{ marginTop: 'var(--sp-6)' }}>
            {historyNote(history, since)}
          </p>
        </div>
      </Section>

      {/* ------------------------------------------------------ reminder */}
      <Section title="Remind me">
        <div className="card">
          <TimePicker
            value={habit.remindAt}
            label="Reminder time"
            onChange={(remindAt) => {
              void store.updateHabit(habit.id, { remindAt });
              if (remindAt) void store.enableReminders('habits');
            }}
          />
          <p className="meta" style={{ marginTop: 'var(--sp-5)', lineHeight: 1.5 }}>
            {habit.remindAt
              ? `Only on days this habit is due, and never once you have already done it.`
              : 'No reminder. This habit will not notify you.'}
          </p>
        </div>
      </Section>

      {/* ---------------------------------------------------------- goal */}
      {goal && (
        <Section title="Serves">
          <button
            type="button"
            className="goalCard"
            data-area={goal.area}
            onClick={() => onOpenGoal(goal.id)}
          >
            <Ring
              value={goalProgress(goal, store.milestones)}
              size={50}
              label={goalProgress(goal, store.milestones)}
              labelSize={14}
              title={`${goal.title} progress`}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="goalCard__title" style={{ fontSize: 17 }}>
                {goal.title}
              </span>
              <span className="meta" style={{ display: 'block', marginTop: 4 }}>
                Every completion here counts toward it
              </span>
            </span>
          </button>
        </Section>
      )}

      {/* -------------------------------------------------------- danger */}
      <div style={{ marginTop: 'var(--sp-10)' }}>
        {confirmDelete ? (
          <>
            <p className="body" style={{ textAlign: 'center' }}>
              Delete “{habit.name}”? Its whole completion history goes with it. Archiving keeps the
              record and stops it appearing in your week.
            </p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                void store.updateHabit(habit.id, { archivedAt: new Date().toISOString() });
                store.toast('Habit archived');
                onBack();
              }}
            >
              Archive instead
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                void store.deleteHabit(habit.id);
                store.toast('Habit deleted');
                onBack();
              }}
            >
              Delete it and its history
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            <TrashIcon style={{ width: 15, height: 15, verticalAlign: '-2px', marginRight: 6 }} />
            Delete habit
          </button>
        )}
      </div>
    </div>
  );
}

function scheduleLabel(habit: Habit): string {
  switch (habit.schedule.type) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'days':
      return habit.schedule.days.map((d) => DAY_SHORT[d] ?? '').join(', ');
    case 'timesPerWeek':
      return `${habit.schedule.target}× a week`;
  }
}

/** One honest sentence about the history, never a scold. */
function historyNote(
  history: { count: number; target: number }[],
  daysSince: number | null,
): string {
  const past = history.slice(0, -1).filter((w) => w.target > 0);
  if (past.length < 2) return 'A couple more weeks and the shape of this becomes readable.';

  const hits = past.filter((w) => w.count >= w.target).length;
  const best = past.reduce((a, b) => (b.count > a.count ? b : a));
  const parts: string[] = [];

  parts.push(`You hit target in ${hits} of the last ${past.length} weeks.`);
  if (best.count >= best.target) parts.push(`The best run was ${best.count} in a week.`);
  if (daysSince !== null && daysSince >= 4) {
    parts.push(`It has been ${daysSince} days since the last one.`);
  }
  return parts.join(' ');
}
