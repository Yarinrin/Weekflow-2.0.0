import { Check, Pill } from './components';
import { dayName } from '@/domain/dates';
import type { Goal, Task } from '@/domain/types';

/**
 * A task in a list. Two independent targets: the check completes it, the body opens
 * its detail. Status is carried by the check, the strikethrough and the row tint —
 * never by colour alone.
 */
export function TaskRow({
  task,
  goal,
  onToggle,
  onOpen,
}: {
  task: Task;
  goal?: Goal | undefined;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  return (
    <div className={`row${task.done ? ' row--done' : ''}`} data-area={task.area}>
      <Check checked={task.done} onChange={onToggle} label={task.title} />
      <button
        type="button"
        className="row__body"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={onOpen ? `Open ${task.title}` : undefined}
      >
        <span className="row__title">
          {task.important && (
            <span className="star" aria-label="Important">
              ★{' '}
            </span>
          )}
          {task.title}
        </span>
        <span className="pills">
          <Pill>{task.area}</Pill>
          {task.carriedFrom && (
            <Pill variant="attention">Moved from {dayName(task.carriedFrom)}</Pill>
          )}
          {goal && <Pill variant="plain">{goal.title}</Pill>}
        </span>
      </button>
    </div>
  );
}
