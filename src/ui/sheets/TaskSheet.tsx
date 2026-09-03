import { useState } from 'react';
import { Pill, Ring, Sheet } from '../components';
import { MoveIcon, TrashIcon } from '../Icons';
import { addDays, dayName, relativeDay } from '@/domain/dates';
import { goalProgress } from '@/domain/stats';
import type { Task } from '@/domain/types';
import { useStore } from '@/store/store';

/** Task detail: what it is, what it belongs to, and the three things you can do to it. */
export function TaskSheet({
  task,
  onClose,
  onOpenGoal,
}: {
  task: Task | null;
  onClose: () => void;
  onOpenGoal: (goalId: string) => void;
}) {
  const store = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!task) return null;
  const goal = task.goalId ? store.goals.find((g) => g.id === task.goalId) : undefined;
  const progress = goal ? goalProgress(goal, store.milestones) : 0;

  const close = () => {
    setConfirmDelete(false);
    onClose();
  };

  return (
    <Sheet open onClose={close} area={task.area}>
      <span className="pills" style={{ marginTop: 0 }}>
        <Pill>{task.area}</Pill>
        <Pill variant="plain">{dayName(task.date)}</Pill>
        {task.important && <Pill variant="plain">★ Important</Pill>}
      </span>

      <h2 className="display d2" style={{ marginTop: 'var(--sp-6)' }}>
        {task.title}
      </h2>

      {task.notes && (
        <p className="body" style={{ marginTop: 'var(--sp-5)' }}>
          {task.notes}
        </p>
      )}

      {task.carriedFrom && (
        <p className="body" style={{ marginTop: 'var(--sp-4)', color: 'var(--attention)' }}>
          Moved here from {dayName(task.carriedFrom)}.
        </p>
      )}

      {goal && (
        <div style={{ marginTop: 'var(--sp-8)' }}>
          <h3 className="label">Contributes to</h3>
          <button
            type="button"
            className="goalCard"
            data-area={goal.area}
            style={{ marginTop: 'var(--sp-4)', marginBottom: 0 }}
            onClick={() => onOpenGoal(goal.id)}
          >
            <Ring
              value={progress}
              size={50}
              label={progress}
              labelSize={14}
              title={`${goal.title}, ${progress} percent complete`}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="goalCard__title" style={{ fontSize: 17 }}>
                {goal.title}
              </span>
              {goal.deadline && (
                <span className="meta" style={{ display: 'block', marginTop: 4 }}>
                  {relativeDay(goal.deadline, store.today)}
                </span>
              )}
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        className="btn"
        style={{ marginTop: 'var(--sp-9)' }}
        onClick={() => {
          void store.toggleTask(task.id);
          close();
        }}
      >
        {task.done ? 'Mark as not done' : 'Mark as done'}
      </button>

      {!task.done && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            const to = addDays(task.date, 1);
            void store.moveTask(task.id, to);
            store.toast(`Moved to ${dayName(to)}`);
            close();
          }}
        >
          <MoveIcon style={{ width: 15, height: 15, verticalAlign: '-2px', marginRight: 6 }} />
          Move to {dayName(addDays(task.date, 1))}
        </button>
      )}

      {confirmDelete ? (
        <>
          <p className="body" style={{ marginTop: 'var(--sp-8)', textAlign: 'center' }}>
            Delete “{task.title}”? This cannot be undone.
          </p>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              void store.deleteTask(task.id);
              store.toast('Task deleted');
              close();
            }}
          >
            Yes, delete it
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => setConfirmDelete(true)}
        >
          <TrashIcon style={{ width: 15, height: 15, verticalAlign: '-2px', marginRight: 6 }} />
          Delete
        </button>
      )}
    </Sheet>
  );
}
