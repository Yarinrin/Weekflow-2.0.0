import { useState } from 'react';
import { Empty, Pill, Ring, Section } from '@/ui/components';
import { formatShort, relativeDeadline, startOfWeek } from '@/domain/dates';
import { activeGoals, goalActionsInWeek, goalProgress } from '@/domain/stats';
import { useStore } from '@/store/store';

export function GoalsScreen({
  onOpenGoal,
  onCreate,
}: {
  onOpenGoal: (id: string) => void;
  onCreate: (kind: 'goal') => void;
}) {
  const store = useStore();
  const { today, settings } = store;
  const weekStart = startOfWeek(today, settings.weekStartsOn);
  const [showArchived, setShowArchived] = useState(false);

  const live = activeGoals(store.goals);
  const archived = store.goals.filter((g) => g.archivedAt);

  return (
    <div className="screen__pad">
      <p className="label">{live.length ? `${live.length} active` : 'Nothing yet'}</p>
      <h1 className="display d1" style={{ marginTop: 'var(--sp-3)', marginBottom: 'var(--sp-8)' }}>
        Working toward
      </h1>

      {live.length > 0 ? (
        <div className="stagger">
          {live.map((goal) => {
            const pct = goalProgress(goal, store.milestones);
            const actions = goalActionsInWeek(
              goal.id,
              weekStart,
              store.tasks,
              store.habits,
              store.completions,
            );
            const ms = store.milestones.filter((m) => m.goalId === goal.id);
            return (
              <button
                key={goal.id}
                type="button"
                className="goalCard"
                data-area={goal.area}
                onClick={() => onOpenGoal(goal.id)}
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 'var(--sp-8)' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-7)' }}>
                  <Ring
                    value={pct}
                    size={58}
                    label={pct}
                    labelSize={16}
                    title={`${goal.title}, ${pct} percent complete`}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="goalCard__title">{goal.title}</span>
                    <span className="meta" style={{ display: 'block', marginTop: 5 }}>
                      {goal.area}
                      {goal.deadline ? ` · ${relativeDeadline(goal.deadline, today)}` : ''}
                    </span>
                  </span>
                </span>
                <span
                  style={{
                    display: 'flex',
                    gap: 7,
                    flexWrap: 'wrap',
                    marginTop: 'var(--sp-7)',
                    paddingTop: 'var(--sp-6)',
                    borderTop: '1px solid var(--ink-wash)',
                  }}
                >
                  <Pill variant="ghost">
                    {goal.progressMode === 'manual'
                      ? `${goal.manualUnit ?? ''}${(goal.manualCurrent ?? 0).toLocaleString()} of ${goal.manualUnit ?? ''}${(goal.manualTarget ?? 0).toLocaleString()}`
                      : `${ms.filter((m) => m.done).length} of ${ms.length} milestones`}
                  </Pill>
                  <Pill variant="ghost">
                    {actions} action{actions === 1 ? '' : 's'} this week
                  </Pill>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No goals yet."
          body="Choose something worth working toward. Tasks and habits can then point at it, and WeekFlow will show you whether your week is actually moving it."
          action={{ label: 'Add a goal', onClick: () => onCreate('goal') }}
        />
      )}

      {archived.length > 0 && (
        <Section title="Archived" aside={`${archived.length}`}>
          {showArchived ? (
            <div className="group">
              {archived.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  className="row row--center"
                  data-area={goal.area}
                  onClick={() => onOpenGoal(goal.id)}
                >
                  <span className="row__body">
                    <span className="row__title" style={{ color: 'var(--ink-2)' }}>
                      {goal.title}
                    </span>
                    <span className="meta" style={{ display: 'block', marginTop: 3 }}>
                      Archived {formatShort(goal.archivedAt!.slice(0, 10))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => setShowArchived(true)}>
              Show {archived.length} archived goal{archived.length === 1 ? '' : 's'}
            </button>
          )}
          <p className="body" style={{ marginTop: 'var(--sp-5)', fontSize: 12.5 }}>
            Archived goals are kept, so your history still adds up.
          </p>
        </Section>
      )}
    </div>
  );
}
