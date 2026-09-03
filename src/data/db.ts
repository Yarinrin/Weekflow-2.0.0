/**
 * Persistence. IndexedDB via Dexie, behind a narrow repository surface.
 *
 * Why IndexedDB and not SQLite: the architecture doc names SQLite for native with a
 * Dexie adapter for web. This is that Dexie adapter, and at WeekFlow's data scale — a
 * few thousand rows after years of use — it is also enough for the Android build, which
 * runs the same WebView. Keeping one engine avoids shipping jeep-sqlite and a native
 * plugin for no measurable gain. Everything goes through `repo` below, so swapping in
 * SQLite later touches this file and nothing else.
 */
import Dexie, { type Table } from 'dexie';
import type {
  Goal,
  Habit,
  HabitCompletion,
  Milestone,
  Settings,
  Task,
  Week,
} from '@/domain/types';
import { DEFAULT_SETTINGS } from '@/domain/types';

class WeekFlowDB extends Dexie {
  tasks!: Table<Task, string>;
  habits!: Table<Habit, string>;
  completions!: Table<HabitCompletion, string>;
  goals!: Table<Goal, string>;
  milestones!: Table<Milestone, string>;
  weeks!: Table<Week, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = 'weekflow') {
    super(name);
    this.version(1).stores({
      // Indexes chosen for the queries the app actually runs: tasks by date range,
      // completions by habit and by date range, milestones by goal.
      tasks: 'id, date, goalId, area, done, [date+done]',
      habits: 'id, goalId, archivedAt',
      completions: 'id, habitId, date, [habitId+date]',
      goals: 'id, archivedAt, area',
      milestones: 'id, goalId, order',
      weeks: 'weekStart',
      meta: 'key',
    });
  }
}

export const db = new WeekFlowDB();

/** Thrown for storage failures the UI is expected to explain to the user. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Wraps a Dexie call so quota and corruption failures surface as something sayable. */
async function guard<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const name = (err as { name?: string })?.name ?? '';
    if (name === 'QuotaExceededError') {
      throw new StorageError(
        'Your phone is out of storage, so this change was not saved. Free some space and try again.',
        err,
      );
    }
    if (name === 'InvalidStateError' || name === 'DatabaseClosedError') {
      throw new StorageError(
        'WeekFlow lost its connection to on-device storage. Reopening the app usually fixes it.',
        err,
      );
    }
    throw new StorageError(`Could not ${what}.`, err);
  }
}

export const repo = {
  /* ---------------------------------------------------------------- read */

  async loadAll() {
    return guard('load your data', async () => {
      const [tasks, habits, completions, goals, milestones, weeks] = await Promise.all([
        db.tasks.toArray(),
        db.habits.toArray(),
        db.completions.toArray(),
        db.goals.toArray(),
        db.milestones.toArray(),
        db.weeks.toArray(),
      ]);
      return { tasks, habits, completions, goals, milestones, weeks };
    });
  },

  async getSettings(): Promise<Settings> {
    return guard('read your settings', async () => {
      const row = await db.meta.get('settings');
      if (!row) return { ...DEFAULT_SETTINGS };
      // Merge over defaults so a settings row written by an older build never
      // leaves a newly added field undefined.
      const stored = row.value as Partial<Settings>;
      return {
        ...DEFAULT_SETTINGS,
        ...stored,
        notifications: { ...DEFAULT_SETTINGS.notifications, ...(stored.notifications ?? {}) },
        ai: { ...DEFAULT_SETTINGS.ai, ...(stored.ai ?? {}) },
      };
    });
  },

  async setSettings(settings: Settings): Promise<void> {
    await guard('save your settings', () =>
      db.meta.put({ key: 'settings', value: settings }).then(() => undefined),
    );
  },

  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await db.meta.get(key);
    return row?.value as T | undefined;
  },

  async setMeta(key: string, value: unknown): Promise<void> {
    await guard('save app state', () => db.meta.put({ key, value }).then(() => undefined));
  },

  /* --------------------------------------------------------------- write */

  putTask: (task: Task) => guard('save that task', () => db.tasks.put(task).then(() => undefined)),
  putTasks: (tasks: Task[]) =>
    guard('save those tasks', () => db.tasks.bulkPut(tasks).then(() => undefined)),
  deleteTask: (id: string) =>
    guard('delete that task', () => db.tasks.delete(id).then(() => undefined)),

  putHabit: (habit: Habit) =>
    guard('save that habit', () => db.habits.put(habit).then(() => undefined)),
  deleteHabit: (id: string) =>
    guard('delete that habit', async () => {
      await db.transaction('rw', db.habits, db.completions, async () => {
        await db.habits.delete(id);
        await db.completions.where('habitId').equals(id).delete();
      });
    }),

  /** Completion is idempotent — the id is habitId|date, so a double tap is one row. */
  addCompletion: (c: HabitCompletion) =>
    guard('record that habit', () => db.completions.put(c).then(() => undefined)),
  removeCompletion: (habitId: string, date: string) =>
    guard('undo that habit', () =>
      db.completions.delete(`${habitId}|${date}`).then(() => undefined),
    ),

  putGoal: (goal: Goal) => guard('save that goal', () => db.goals.put(goal).then(() => undefined)),
  deleteGoal: (id: string) =>
    guard('delete that goal', async () => {
      await db.transaction('rw', db.goals, db.milestones, db.tasks, db.habits, async () => {
        await db.goals.delete(id);
        await db.milestones.where('goalId').equals(id).delete();
        // Tasks and habits outlive their goal — they are still real things the user
        // did. Only the link is removed.
        const tasks = await db.tasks.where('goalId').equals(id).toArray();
        await db.tasks.bulkPut(
          tasks.map(({ goalId: _drop, milestoneId: _drop2, ...rest }) => rest as Task),
        );
        const habits = await db.habits.where('goalId').equals(id).toArray();
        await db.habits.bulkPut(habits.map(({ goalId: _drop, ...rest }) => rest as Habit));
      });
    }),

  putMilestone: (m: Milestone) =>
    guard('save that milestone', () => db.milestones.put(m).then(() => undefined)),
  putMilestones: (ms: Milestone[]) =>
    guard('save those milestones', () => db.milestones.bulkPut(ms).then(() => undefined)),
  deleteMilestone: (id: string) =>
    guard('delete that milestone', () => db.milestones.delete(id).then(() => undefined)),

  putWeek: (week: Week) => guard('save your week', () => db.weeks.put(week).then(() => undefined)),

  /* -------------------------------------------------------------- export */

  async exportJSON(): Promise<string> {
    const data = await this.loadAll();
    const settings = await this.getSettings();
    return JSON.stringify(
      { format: 'weekflow-export', version: 2, exportedAt: new Date().toISOString(), settings, ...data },
      null,
      2,
    );
  },

  /** Replaces everything. Used by import and by "start over". */
  async replaceAll(data: {
    tasks: Task[];
    habits: Habit[];
    completions: HabitCompletion[];
    goals: Goal[];
    milestones: Milestone[];
    weeks: Week[];
  }): Promise<void> {
    await guard('replace your data', async () => {
      await db.transaction(
        'rw',
        db.tasks,
        db.habits,
        db.completions,
        db.goals,
        db.milestones,
        db.weeks,
        async () => {
          await Promise.all([
            db.tasks.clear(),
            db.habits.clear(),
            db.completions.clear(),
            db.goals.clear(),
            db.milestones.clear(),
            db.weeks.clear(),
          ]);
          await Promise.all([
            db.tasks.bulkAdd(data.tasks),
            db.habits.bulkAdd(data.habits),
            db.completions.bulkAdd(data.completions),
            db.goals.bulkAdd(data.goals),
            db.milestones.bulkAdd(data.milestones),
            db.weeks.bulkAdd(data.weeks),
          ]);
        },
      );
    });
  },
};

export type Repo = typeof repo;
