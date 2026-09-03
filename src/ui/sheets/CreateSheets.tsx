/**
 * Creation flows. One sheet per thing you can make, each asking for the least it can
 * get away with: everything but the title has a sensible default, so adding a task is
 * type-and-done.
 */
import { useState } from 'react';
import { ChipGroup, Sheet, TimePicker } from '../components';
import { HabitIcon, GoalIcon, TaskIcon } from '../Icons';
import { addDays, dayShort, weekDates } from '@/domain/dates';
import { AREAS, type Area, type DateKey, type HabitSchedule } from '@/domain/types';
import { useStore } from '@/store/store';

const areaOptions = AREAS.map((a) => ({ value: a, label: a, area: a }));

/* ------------------------------------------------------------ chooser */

export function CreateChooser({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (kind: 'task' | 'habit' | 'goal') => void;
}) {
  const options = [
    { kind: 'task', title: 'Task', body: 'Something to do, on a day', area: 'Work', Icon: TaskIcon },
    { kind: 'habit', title: 'Habit', body: 'Something to do repeatedly', area: 'Health', Icon: HabitIcon },
    { kind: 'goal', title: 'Goal', body: 'Something to work toward', area: 'Learning', Icon: GoalIcon },
  ] as const;

  return (
    <Sheet open={open} onClose={onClose} title="Create">
      {options.map(({ kind, title, body, area, Icon }) => (
        <button
          key={kind}
          type="button"
          className="optionCard"
          data-area={area}
          onClick={() => onPick(kind)}
        >
          <span className="optionCard__icon">
            <Icon />
          </span>
          <span>
            <span className="display d4" style={{ display: 'block' }}>
              {title}
            </span>
            <span className="meta" style={{ display: 'block', marginTop: 2 }}>
              {body}
            </span>
          </span>
        </button>
      ))}
    </Sheet>
  );
}

/* --------------------------------------------------------------- task */

export function NewTaskSheet({
  open,
  onClose,
  defaultDate,
  weekStart,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: DateKey;
  weekStart: DateKey;
}) {
  const store = useStore();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<Area>('Work');
  const [date, setDate] = useState<DateKey>(defaultDate);
  const [goalId, setGoalId] = useState<string>('');
  const [important, setImportant] = useState(false);
  const [remindAt, setRemindAt] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const days = weekDates(weekStart);
  const goals = store.goals.filter((g) => !g.archivedAt);

  const reset = () => {
    setTitle('');
    setArea('Work');
    setDate(defaultDate);
    setGoalId('');
    setImportant(false);
    setRemindAt(undefined);
  };

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    const task = await store.addTask({
      title,
      area,
      date,
      important,
      ...(goalId ? { goalId } : {}),
      ...(remindAt ? { remindAt } : {}),
    });
    setBusy(false);
    if (task) {
      if (remindAt) await store.enableReminders('tasks');
      store.toast(`Added to ${dayShort(date)}`);
      reset();
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New task" area={area}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="field"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="done"
          autoComplete="off"
          aria-label="Task title"
        />

        <h3 className="label" style={{ marginTop: 'var(--sp-9)' }}>
          Area
        </h3>
        <ChipGroup options={areaOptions} value={area} onChange={setArea} areaStyled legend="Area" />

        <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
          Day
        </h3>
        <ChipGroup
          options={days.map((d) => ({ value: d, label: dayShort(d) }))}
          value={date}
          onChange={setDate}
          legend="Day"
        />

        {goals.length > 0 && (
          <>
            <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
              Link to a goal <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional</span>
            </h3>
            <ChipGroup
              options={[
                { value: '', label: 'None' },
                ...goals.map((g) => ({ value: g.id, label: g.title })),
              ]}
              value={goalId}
              onChange={setGoalId}
              legend="Linked goal"
            />
          </>
        )}

        <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
          Remind me <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional</span>
        </h3>
        <TimePicker value={remindAt} onChange={setRemindAt} label="Reminder time" />

        <div className="chips" style={{ marginTop: 'var(--sp-8)' }}>
          <button
            type="button"
            role="switch"
            aria-checked={important}
            className={`chip${important ? ' chip--on' : ''}`}
            onClick={() => setImportant((v) => !v)}
          >
            ★ Important
          </button>
        </div>

        <button type="submit" className="btn" disabled={!title.trim() || busy}>
          Add to {dayShort(date)}
        </button>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------- habit */

const SCHEDULES: { value: string; label: string; schedule: HabitSchedule }[] = [
  { value: 'daily', label: 'Every day', schedule: { type: 'daily' } },
  { value: 'weekdays', label: 'Weekdays', schedule: { type: 'weekdays' } },
  { value: 'weekends', label: 'Weekends', schedule: { type: 'weekends' } },
  { value: '2x', label: '2× a week', schedule: { type: 'timesPerWeek', target: 2 } },
  { value: '3x', label: '3× a week', schedule: { type: 'timesPerWeek', target: 3 } },
  { value: '4x', label: '4× a week', schedule: { type: 'timesPerWeek', target: 4 } },
  { value: '5x', label: '5× a week', schedule: { type: 'timesPerWeek', target: 5 } },
];

export function NewHabitSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const [name, setName] = useState('');
  const [area, setArea] = useState<Area>('Health');
  const [schedule, setSchedule] = useState('daily');
  const [goalId, setGoalId] = useState('');
  const [remindAt, setRemindAt] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const goals = store.goals.filter((g) => !g.archivedAt);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const picked = SCHEDULES.find((s) => s.value === schedule)!.schedule;
    const habit = await store.addHabit({
      name,
      area,
      schedule: picked,
      ...(goalId ? { goalId } : {}),
      ...(remindAt ? { remindAt } : {}),
    });
    setBusy(false);
    if (habit) {
      if (remindAt) await store.enableReminders('habits');
      store.toast(`${habit.name} added`);
      setName('');
      setGoalId('');
      setRemindAt(undefined);
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New habit" area={area}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="field"
          placeholder="What do you want to do consistently?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          enterKeyHint="done"
          autoComplete="off"
          aria-label="Habit name"
        />

        <h3 className="label" style={{ marginTop: 'var(--sp-9)' }}>
          Area
        </h3>
        <ChipGroup options={areaOptions} value={area} onChange={setArea} areaStyled legend="Area" />

        <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
          How often
        </h3>
        <ChipGroup
          options={SCHEDULES.map((s) => ({ value: s.value, label: s.label }))}
          value={schedule}
          onChange={setSchedule}
          legend="How often"
        />

        {goals.length > 0 && (
          <>
            <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
              Serves a goal <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional</span>
            </h3>
            <ChipGroup
              options={[
                { value: '', label: 'None' },
                ...goals.map((g) => ({ value: g.id, label: g.title })),
              ]}
              value={goalId}
              onChange={setGoalId}
              legend="Linked goal"
            />
          </>
        )}

        <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
          Remind me <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional</span>
        </h3>
        <TimePicker value={remindAt} onChange={setRemindAt} label="Reminder time" />
        <p className="meta" style={{ marginTop: 'var(--sp-3)', lineHeight: 1.5 }}>
          Only on days this habit is due, and never once you have already done it.
        </p>

        <button type="submit" className="btn" disabled={!name.trim() || busy}>
          Add habit
        </button>
      </form>
    </Sheet>
  );
}

/* --------------------------------------------------------------- goal */

export function NewGoalSheet({
  open,
  onClose,
  today,
}: {
  open: boolean;
  onClose: () => void;
  today: DateKey;
}) {
  const store = useStore();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<Area>('Work');
  const [description, setDescription] = useState('');
  const [horizon, setHorizon] = useState('90');
  const [milestones, setMilestones] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    const goal = await store.addGoal({
      title,
      area,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(horizon !== 'none' ? { deadline: addDays(today, Number(horizon)) } : {}),
      milestones: milestones.split('\n').filter((l) => l.trim()),
    });
    setBusy(false);
    if (goal) {
      store.toast(`${goal.title} added`);
      setTitle('');
      setDescription('');
      setMilestones('');
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New goal" area={area}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="field"
          placeholder="What are you working toward?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="next"
          autoComplete="off"
          aria-label="Goal title"
        />

        <textarea
          className="field"
          style={{ marginTop: 'var(--sp-4)' }}
          placeholder="Why does it matter? (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Goal description"
        />

        <h3 className="label" style={{ marginTop: 'var(--sp-9)' }}>
          Area
        </h3>
        <ChipGroup options={areaOptions} value={area} onChange={setArea} areaStyled legend="Area" />

        <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
          By when
        </h3>
        <ChipGroup
          options={[
            { value: '30', label: 'A month' },
            { value: '90', label: 'Three months' },
            { value: '180', label: 'Six months' },
            { value: '365', label: 'A year' },
            { value: 'none', label: 'No deadline' },
          ]}
          value={horizon}
          onChange={setHorizon}
          legend="By when"
        />

        <h3 className="label" style={{ marginTop: 'var(--sp-8)' }}>
          Milestones{' '}
          <span style={{ textTransform: 'none', letterSpacing: 0 }}>— one per line, optional</span>
        </h3>
        <textarea
          className="field"
          style={{ marginTop: 'var(--sp-4)' }}
          rows={4}
          placeholder={'Learn three songs\nPractise ten hours\nRecord a cover'}
          value={milestones}
          onChange={(e) => setMilestones(e.target.value)}
          aria-label="Milestones, one per line"
        />
        <p className="meta" style={{ marginTop: 'var(--sp-3)', lineHeight: 1.5 }}>
          Progress is counted from these. You can add more later.
        </p>

        <button type="submit" className="btn" disabled={!title.trim() || busy}>
          Add goal
        </button>
      </form>
    </Sheet>
  );
}
