/**
 * Goal detail. The screen that answers "is what I am doing this week actually
 * moving this?" — which is the whole point of linking tasks and habits to goals.
 */
import { useState } from 'react';
import { BackButton, Check, Empty, HabitDot, Ring, Section } from '@/ui/components';
import { TaskRow } from '@/ui/TaskRow';
import { TrashIcon } from '@/ui/Icons';
import { formatWithYear, relativeDeadline, startOfWeek, weekDates } from '@/domain/dates';
import { completionSet, isDone, weekCount, weeklyTarget } from '@/domain/habits';
import { goalActionsInWeek, goalProgress } from '@/domain/stats';
import { useStore } from '@/store/store';

export function GoalDetailScreen({
  goalId,
  onBack,
  onOpenTask,
  onOpenHabit,
  onCreate,
}: {
  goalId: string;
  onBack: () => void;
  onOpenTask: (id: string) => void;
  onOpenHabit: (id: string) => void;
  onCreate: (kind: 'task') => void;
}) {
  const store = useStore();
  const { today, settings } = store;
  const goal = store.goals.find((g) => g.id === goalId);
  const [newMilestone, setNewMilestone] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!goal) {
    return (
      <div className="screen__pad">
        <BackButton label="Goals" onClick={onBack} />
        <Empty title="That goal is gone." body="It may have been deleted on another screen." />
      </div>
    );
  }

  const weekStart = startOfWeek(today, settings.weekStartsOn);
  const days = weekDates(weekStart);
  const pct = goalProgress(goal, store.milestones);
  const milestones = store.milestones
    .filter((m) => m.goalId === goal.id)
    .sort((a, b) => a.order - b.order);
  const actions = goalActionsInWeek(
    goal.id,
    weekStart,
    store.tasks,
    store.habits,
    store.completions,
  );
  const linkedTasks = store.tasks.filter(
    (t) => t.goalId === goal.id && t.date >= days[0]! && t.date <= days[6]!,
  );
  const linkedHabits = store.habits.filter((h) => h.goalId === goal.id && !h.archivedAt);
  const set = completionSet(store.completions);

  return (
    <div className="screen__pad" data-area={goal.area}>
      <BackButton label="Goals" onClick={onBack} />

      <div className="hero" style={{ background: 'linear-gradient(150deg, var(--tint), var(--surface) 82%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-8)' }}>
          <Ring
            value={pct}
            size={84}
            label={
              <>
                {pct}
                <span style={{ fontSize: 11 }}>%</span>
              </>
            }
            labelSize={24}
            title={`${goal.title}, ${pct} percent complete`}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="label" style={{ color: 'var(--deep)' }}>
              {goal.area}
              {goal.deadline ? ` · ${relativeDeadline(goal.deadline, today)}` : ''}
            </p>
            <h1 className="display d2" style={{ marginTop: 'var(--sp-3)' }}>
              {goal.title}
            </h1>
          </div>
        </div>
        {goal.description && (
          <p className="body" style={{ marginTop: 'var(--sp-7)', color: 'var(--ink)' }}>
            {goal.description}
          </p>
        )}
        {goal.deadline && (
          <p className="meta" style={{ marginTop: 'var(--sp-5)' }}>
            Target: {formatWithYear(goal.deadline)}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------- progress */}
      {goal.progressMode === 'manual' ? (
        <Section
          title="Progress"
          aside={`${goal.manualUnit ?? ''}${((goal.manualTarget ?? 0) - (goal.manualCurrent ?? 0)).toLocaleString()} to go`}
        >
          <div className="card">
            <p className="display d3">
              {goal.manualUnit ?? ''}
              {(goal.manualCurrent ?? 0).toLocaleString()}{' '}
              <span className="meta">of {goal.manualUnit ?? ''}{(goal.manualTarget ?? 0).toLocaleString()}</span>
            </p>
            <ManualProgressControls goal={goal} />
          </div>
        </Section>
      ) : (
        <Section
          title="Milestones"
          aside={milestones.length ? `${milestones.filter((m) => m.done).length} of ${milestones.length}` : undefined}
        >
          {milestones.length > 0 ? (
            <div className="group">
              {milestones.map((m) => (
                <div key={m.id} className={`row row--center${m.done ? ' row--done' : ''}`}>
                  <Check
                    checked={m.done}
                    onChange={() => void store.toggleMilestone(m.id)}
                    label={m.title}
                  />
                  <span className="row__body">
                    <span className="row__title">{m.title}</span>
                  </span>
                  <button
                    type="button"
                    className="iconBtn"
                    onClick={() => void store.deleteMilestone(m.id)}
                    aria-label={`Delete milestone ${m.title}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No milestones yet."
              body="Break the goal into a few steps and its progress starts meaning something."
            />
          )}

          <form
            style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}
            onSubmit={(e) => {
              e.preventDefault();
              void store.addMilestone(goal.id, newMilestone);
              setNewMilestone('');
            }}
          >
            <input
              className="field"
              placeholder="Add a milestone"
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              aria-label="New milestone"
              enterKeyHint="done"
            />
            <button
              type="submit"
              className="btn"
              style={{ width: 'auto', padding: '0 var(--sp-8)' }}
              disabled={!newMilestone.trim()}
            >
              Add
            </button>
          </form>
        </Section>
      )}

      {/* ------------------------------------------------------ this week */}
      <Section title="This week" aside={`${actions} action${actions === 1 ? '' : 's'}`}>
        {linkedTasks.length > 0 || linkedHabits.length > 0 ? (
          <>
            {linkedTasks.length > 0 && (
              <div className="group">
                {linkedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => void store.toggleTask(task.id)}
                    onOpen={() => onOpenTask(task.id)}
                  />
                ))}
              </div>
            )}
            {linkedHabits.length > 0 && (
              <div className="group" style={{ marginTop: 'var(--sp-3)' }}>
                {linkedHabits.map((habit) => (
                  <div key={habit.id} className="row row--center" data-area={habit.area}>
                    <button
                      type="button"
                      className="row__body"
                      onClick={() => onOpenHabit(habit.id)}
                      aria-label={`Open ${habit.name}`}
                    >
                      <span className="row__title">{habit.name}</span>
                      <span className="meta" style={{ display: 'block', marginTop: 3 }}>
                        {weekCount(habit, weekStart, set)} of {weeklyTarget(habit)} this week
                      </span>
                    </button>
                    <span className="dots">
                      {days.map((d) => (
                        <HabitDot
                          key={d}
                          size="sm"
                          done={isDone(set, habit.id, d)}
                          today={d === today}
                          label={`${habit.name} on ${d}`}
                          onClick={() => void store.toggleHabit(habit.id, d)}
                        />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="body" style={{ marginTop: 'var(--sp-5)', fontSize: 12.5 }}>
              Everything above is linked to this goal, which is how its progress is counted.
            </p>
          </>
        ) : (
          <Empty
            title="Nothing scheduled."
            body="A goal with no actions this week is just a wish. Add one task that moves it."
            action={{ label: 'Add a task', onClick: () => onCreate('task') }}
          />
        )}
      </Section>

      {/* --------------------------------------------------------- danger */}
      <div style={{ marginTop: 'var(--sp-10)' }}>
        {goal.archivedAt ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void store.updateGoal(goal.id, { archivedAt: undefined })}
          >
            Make active again
          </button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => void store.archiveGoal(goal.id)}>
            Archive this goal
          </button>
        )}

        {confirmDelete ? (
          <>
            <p className="body" style={{ marginTop: 'var(--sp-7)', textAlign: 'center' }}>
              Delete “{goal.title}” and its milestones? Tasks and habits linked to it are kept — only
              the link goes. This cannot be undone.
            </p>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                void store.deleteGoal(goal.id);
                store.toast('Goal deleted');
                onBack();
              }}
            >
              Yes, delete it
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            Delete goal
          </button>
        )}
      </div>
    </div>
  );
}

/** Numeric goals get a plus/minus rather than a checklist. */
function ManualProgressControls({ goal }: { goal: import('@/domain/types').Goal }) {
  const store = useStore();
  const [amount, setAmount] = useState('');

  const add = (delta: number) => {
    const next = Math.max(0, (goal.manualCurrent ?? 0) + delta);
    void store.updateGoal(goal.id, { manualCurrent: next });
  };

  return (
    <form
      style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-7)' }}
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(amount);
        if (Number.isFinite(n) && n !== 0) add(n);
        setAmount('');
      }}
    >
      <input
        className="field"
        inputMode="decimal"
        placeholder={`Add ${goal.manualUnit ?? ''}`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Amount to add"
      />
      <button
        type="submit"
        className="btn"
        style={{ width: 'auto', padding: '0 var(--sp-8)' }}
        disabled={!Number.isFinite(Number(amount)) || Number(amount) === 0}
      >
        Log
      </button>
    </form>
  );
}
