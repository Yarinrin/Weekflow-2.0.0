/**
 * Application state.
 *
 * One store, loaded once at boot and kept in memory. Every mutation writes through to
 * IndexedDB and updates state optimistically; a storage failure rolls the change back
 * and surfaces a message, because silently losing a tick is worse than an error.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { repo, StorageError } from '@/data/db';
import { backupV1, buildMigration, hasV1Data, type MigrationResult } from '@/data/migrate';
import { startOfWeek, todayKey } from '@/domain/dates';
import { DEFAULT_SETTINGS } from '@/domain/types';
import type {
  Area,
  DateKey,
  Goal,
  Habit,
  HabitCompletion,
  HabitSchedule,
  Milestone,
  Review,
  Settings,
  Task,
  Week,
} from '@/domain/types';

export interface Toast {
  id: number;
  message: string;
  tone: 'normal' | 'error';
  undo?: () => void;
}

interface State {
  status: 'loading' | 'ready' | 'failed';
  error: string | null;
  settings: Settings;
  tasks: Task[];
  habits: Habit[];
  completions: HabitCompletion[];
  goals: Goal[];
  milestones: Milestone[];
  weeks: Week[];
  today: DateKey;
  toasts: Toast[];
  /** Set once after a v1 migration so the app can explain what it did. */
  migration: MigrationResult['report'] | null;
}

interface LoadedPayload {
  settings: Settings;
  tasks: Task[];
  habits: Habit[];
  completions: HabitCompletion[];
  goals: Goal[];
  milestones: Milestone[];
  weeks: Week[];
  migration: State['migration'];
}

type Action =
  | { type: 'loaded'; payload: LoadedPayload }
  | { type: 'failed'; error: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'tasks'; tasks: Task[] }
  | { type: 'habits'; habits: Habit[] }
  | { type: 'completions'; completions: HabitCompletion[] }
  | { type: 'goals'; goals: Goal[] }
  | { type: 'milestones'; milestones: Milestone[] }
  | { type: 'weeks'; weeks: Week[] }
  | { type: 'today'; today: DateKey }
  | { type: 'toast'; toast: Toast }
  | { type: 'dismissToast'; id: number }
  | { type: 'clearMigration' };

const initial: State = {
  status: 'loading',
  error: null,
  settings: DEFAULT_SETTINGS,
  tasks: [],
  habits: [],
  completions: [],
  goals: [],
  milestones: [],
  weeks: [],
  today: todayKey(),
  toasts: [],
  migration: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return { ...state, ...action.payload, status: 'ready', error: null };
    case 'failed':
      return { ...state, status: 'failed', error: action.error };
    case 'settings':
      return { ...state, settings: action.settings };
    case 'tasks':
      return { ...state, tasks: action.tasks };
    case 'habits':
      return { ...state, habits: action.habits };
    case 'completions':
      return { ...state, completions: action.completions };
    case 'goals':
      return { ...state, goals: action.goals };
    case 'milestones':
      return { ...state, milestones: action.milestones };
    case 'weeks':
      return { ...state, weeks: action.weeks };
    case 'today':
      return { ...state, today: action.today };
    case 'toast':
      return { ...state, toasts: [...state.toasts, action.toast] };
    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'clearMigration':
      return { ...state, migration: null };
  }
}

let seq = 0;
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export interface Store extends State {
  /* tasks */
  addTask(input: {
    title: string;
    area: Area;
    date: DateKey;
    important?: boolean;
    goalId?: string;
    notes?: string;
    remindAt?: string;
  }): Promise<Task | null>;
  toggleTask(id: string): Promise<void>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  moveTask(id: string, to: DateKey): Promise<void>;
  deleteTask(id: string): Promise<void>;

  /* habits */
  addHabit(input: {
    name: string;
    area: Area;
    schedule: HabitSchedule;
    goalId?: string;
    remindAt?: string;
  }): Promise<Habit | null>;
  toggleHabit(habitId: string, date: DateKey): Promise<void>;
  updateHabit(id: string, patch: Partial<Habit>): Promise<void>;
  deleteHabit(id: string): Promise<void>;

  /* goals */
  addGoal(input: {
    title: string;
    area: Area;
    description?: string;
    deadline?: DateKey;
    progressMode?: Goal['progressMode'];
    manualTarget?: number;
    manualUnit?: string;
    milestones?: string[];
  }): Promise<Goal | null>;
  updateGoal(id: string, patch: Partial<Goal>): Promise<void>;
  archiveGoal(id: string): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  toggleMilestone(id: string): Promise<void>;
  addMilestone(goalId: string, title: string): Promise<void>;
  deleteMilestone(id: string): Promise<void>;

  /* week */
  setIntention(weekStart: DateKey, intention: string): Promise<void>;
  setReview(weekStart: DateKey, review: Review): Promise<void>;

  /* settings + chrome */
  updateSettings(patch: Partial<Settings>): Promise<void>;
  toast(message: string, opts?: { tone?: 'normal' | 'error'; undo?: () => void }): void;
  dismissToast(id: number): void;
  dismissMigration(): void;
  weekOf(date: DateKey): Week | undefined;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  // Kept in a ref so mutations never close over stale arrays.
  const ref = useRef(state);
  ref.current = state;

  /* ------------------------------------------------------------ boot */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let settings = await repo.getSettings();
        let migrationReport: State['migration'] = null;

        const alreadyMigrated = await repo.getMeta<boolean>('migratedV1');
        if (!alreadyMigrated && typeof localStorage !== 'undefined' && hasV1Data(localStorage)) {
          // Refuse to migrate unless the backup was actually written.
          if (!backupV1(localStorage)) {
            throw new StorageError(
              'WeekFlow could not back up your old data, so it stopped before changing anything. Free some storage and reopen the app.',
            );
          }
          const result = buildMigration(localStorage, settings.weekStartsOn);
          if (result.ran) {
            await repo.replaceAll({
              tasks: result.tasks,
              habits: result.habits,
              completions: result.completions,
              goals: result.goals,
              milestones: result.milestones,
              weeks: result.weeks,
            });
            if (result.name) settings = { ...settings, name: result.name };
            await repo.setSettings(settings);
            migrationReport = result.report;
          }
          await repo.setMeta('migratedV1', true);
        }

        const data = await repo.loadAll();
        if (cancelled) return;
        dispatch({ type: 'loaded', payload: { settings, ...data, migration: migrationReport } });
      } catch (err) {
        if (cancelled) return;
        dispatch({
          type: 'failed',
          error:
            err instanceof StorageError
              ? err.message
              : 'WeekFlow could not open its storage on this device. If you are in a private browsing window, try a normal one.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* --------------------------------------------- roll over at midnight */
  useEffect(() => {
    const tick = () => {
      const now = todayKey();
      if (now !== ref.current.today) dispatch({ type: 'today', today: now });
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  /* ------------------------------------------------------------ theme */
  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.settings.theme);
  }, [state.settings.theme]);

  const toast = useCallback<Store['toast']>((message, opts) => {
    dispatch({
      type: 'toast',
      toast: { id: ++seq, message, tone: opts?.tone ?? 'normal', undo: opts?.undo },
    });
  }, []);

  /** Runs a write, rolling local state back if storage refuses it. */
  const write = useCallback(
    async (apply: () => void, revert: () => void, persist: () => Promise<void>) => {
      apply();
      try {
        await persist();
      } catch (err) {
        revert();
        toast(
          err instanceof StorageError ? err.message : 'That change could not be saved.',
          { tone: 'error' },
        );
      }
    },
    [toast],
  );

  const store = useMemo<Store>(() => {
    const now = () => new Date().toISOString();

    return {
      ...state,

      /* ------------------------------------------------------- tasks */
      async addTask(input) {
        const task: Task = {
          id: newId('tsk'),
          title: input.title.trim(),
          area: input.area,
          date: input.date,
          important: input.important ?? false,
          done: false,
          createdAt: now(),
          ...(input.goalId ? { goalId: input.goalId } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.remindAt ? { remindAt: input.remindAt } : {}),
        };
        if (!task.title) return null;
        const before = ref.current.tasks;
        await write(
          () => dispatch({ type: 'tasks', tasks: [...before, task] }),
          () => dispatch({ type: 'tasks', tasks: before }),
          () => repo.putTask(task),
        );
        return task;
      },

      async toggleTask(id) {
        const before = ref.current.tasks;
        const task = before.find((t) => t.id === id);
        if (!task) return;
        const next: Task = task.done
          ? { ...task, done: false, completedAt: undefined }
          : { ...task, done: true, completedAt: now() };
        await write(
          () => dispatch({ type: 'tasks', tasks: before.map((t) => (t.id === id ? next : t)) }),
          () => dispatch({ type: 'tasks', tasks: before }),
          () => repo.putTask(next),
        );
      },

      async updateTask(id, patch) {
        const before = ref.current.tasks;
        const task = before.find((t) => t.id === id);
        if (!task) return;
        const next = { ...task, ...patch, id: task.id };
        await write(
          () => dispatch({ type: 'tasks', tasks: before.map((t) => (t.id === id ? next : t)) }),
          () => dispatch({ type: 'tasks', tasks: before }),
          () => repo.putTask(next),
        );
      },

      async moveTask(id, to) {
        const before = ref.current.tasks;
        const task = before.find((t) => t.id === id);
        if (!task) return;
        const next: Task = { ...task, date: to, carriedFrom: task.date };
        await write(
          () => dispatch({ type: 'tasks', tasks: before.map((t) => (t.id === id ? next : t)) }),
          () => dispatch({ type: 'tasks', tasks: before }),
          () => repo.putTask(next),
        );
      },

      async deleteTask(id) {
        const before = ref.current.tasks;
        await write(
          () => dispatch({ type: 'tasks', tasks: before.filter((t) => t.id !== id) }),
          () => dispatch({ type: 'tasks', tasks: before }),
          () => repo.deleteTask(id),
        );
      },

      /* ------------------------------------------------------ habits */
      async addHabit(input) {
        const habit: Habit = {
          id: newId('hab'),
          name: input.name.trim(),
          area: input.area,
          schedule: input.schedule,
          createdAt: now(),
          ...(input.goalId ? { goalId: input.goalId } : {}),
          ...(input.remindAt ? { remindAt: input.remindAt } : {}),
        };
        if (!habit.name) return null;
        const before = ref.current.habits;
        await write(
          () => dispatch({ type: 'habits', habits: [...before, habit] }),
          () => dispatch({ type: 'habits', habits: before }),
          () => repo.putHabit(habit),
        );
        return habit;
      },

      async toggleHabit(habitId, date) {
        const before = ref.current.completions;
        const id = `${habitId}|${date}`;
        const existing = before.find((c) => c.id === id);
        if (existing) {
          await write(
            () => dispatch({ type: 'completions', completions: before.filter((c) => c.id !== id) }),
            () => dispatch({ type: 'completions', completions: before }),
            () => repo.removeCompletion(habitId, date),
          );
        } else {
          const c: HabitCompletion = { id, habitId, date, completedAt: now() };
          await write(
            () => dispatch({ type: 'completions', completions: [...before, c] }),
            () => dispatch({ type: 'completions', completions: before }),
            () => repo.addCompletion(c),
          );
        }
      },

      async updateHabit(id, patch) {
        const before = ref.current.habits;
        const habit = before.find((h) => h.id === id);
        if (!habit) return;
        const next = { ...habit, ...patch, id: habit.id };
        await write(
          () => dispatch({ type: 'habits', habits: before.map((h) => (h.id === id ? next : h)) }),
          () => dispatch({ type: 'habits', habits: before }),
          () => repo.putHabit(next),
        );
      },

      async deleteHabit(id) {
        const beforeH = ref.current.habits;
        const beforeC = ref.current.completions;
        await write(
          () => {
            dispatch({ type: 'habits', habits: beforeH.filter((h) => h.id !== id) });
            dispatch({ type: 'completions', completions: beforeC.filter((c) => c.habitId !== id) });
          },
          () => {
            dispatch({ type: 'habits', habits: beforeH });
            dispatch({ type: 'completions', completions: beforeC });
          },
          () => repo.deleteHabit(id),
        );
      },

      /* ------------------------------------------------------- goals */
      async addGoal(input) {
        const goal: Goal = {
          id: newId('goa'),
          title: input.title.trim(),
          area: input.area,
          progressMode: input.progressMode ?? 'milestones',
          createdAt: now(),
          ...(input.description ? { description: input.description } : {}),
          ...(input.deadline ? { deadline: input.deadline } : {}),
          ...(input.manualTarget !== undefined
            ? { manualTarget: input.manualTarget, manualCurrent: 0, manualUnit: input.manualUnit ?? '' }
            : {}),
        };
        if (!goal.title) return null;
        const ms: Milestone[] = (input.milestones ?? [])
          .map((t) => t.trim())
          .filter(Boolean)
          .map((title, order) => ({ id: newId('mil'), goalId: goal.id, title, done: false, order }));

        const beforeG = ref.current.goals;
        const beforeM = ref.current.milestones;
        await write(
          () => {
            dispatch({ type: 'goals', goals: [...beforeG, goal] });
            dispatch({ type: 'milestones', milestones: [...beforeM, ...ms] });
          },
          () => {
            dispatch({ type: 'goals', goals: beforeG });
            dispatch({ type: 'milestones', milestones: beforeM });
          },
          async () => {
            await repo.putGoal(goal);
            if (ms.length) await repo.putMilestones(ms);
          },
        );
        return goal;
      },

      async updateGoal(id, patch) {
        const before = ref.current.goals;
        const goal = before.find((g) => g.id === id);
        if (!goal) return;
        const next = { ...goal, ...patch, id: goal.id };
        await write(
          () => dispatch({ type: 'goals', goals: before.map((g) => (g.id === id ? next : g)) }),
          () => dispatch({ type: 'goals', goals: before }),
          () => repo.putGoal(next),
        );
      },

      async archiveGoal(id) {
        const before = ref.current.goals;
        const goal = before.find((g) => g.id === id);
        if (!goal) return;
        const next: Goal = { ...goal, archivedAt: now() };
        await write(
          () => dispatch({ type: 'goals', goals: before.map((g) => (g.id === id ? next : g)) }),
          () => dispatch({ type: 'goals', goals: before }),
          () => repo.putGoal(next),
        );
      },

      async deleteGoal(id) {
        const beforeG = ref.current.goals;
        const beforeM = ref.current.milestones;
        const beforeT = ref.current.tasks;
        const beforeH = ref.current.habits;
        await write(
          () => {
            dispatch({ type: 'goals', goals: beforeG.filter((g) => g.id !== id) });
            dispatch({ type: 'milestones', milestones: beforeM.filter((m) => m.goalId !== id) });
            // Tasks and habits survive; only the link goes.
            dispatch({
              type: 'tasks',
              tasks: beforeT.map((t) =>
                t.goalId === id ? { ...t, goalId: undefined, milestoneId: undefined } : t,
              ),
            });
            dispatch({
              type: 'habits',
              habits: beforeH.map((h) => (h.goalId === id ? { ...h, goalId: undefined } : h)),
            });
          },
          () => {
            dispatch({ type: 'goals', goals: beforeG });
            dispatch({ type: 'milestones', milestones: beforeM });
            dispatch({ type: 'tasks', tasks: beforeT });
            dispatch({ type: 'habits', habits: beforeH });
          },
          () => repo.deleteGoal(id),
        );
      },

      async toggleMilestone(id) {
        const before = ref.current.milestones;
        const m = before.find((x) => x.id === id);
        if (!m) return;
        const next: Milestone = m.done
          ? { ...m, done: false, completedAt: undefined }
          : { ...m, done: true, completedAt: now() };
        await write(
          () =>
            dispatch({ type: 'milestones', milestones: before.map((x) => (x.id === id ? next : x)) }),
          () => dispatch({ type: 'milestones', milestones: before }),
          () => repo.putMilestone(next),
        );
      },

      async addMilestone(goalId, title) {
        const clean = title.trim();
        if (!clean) return;
        const before = ref.current.milestones;
        const order = before.filter((m) => m.goalId === goalId).length;
        const m: Milestone = { id: newId('mil'), goalId, title: clean, done: false, order };
        await write(
          () => dispatch({ type: 'milestones', milestones: [...before, m] }),
          () => dispatch({ type: 'milestones', milestones: before }),
          () => repo.putMilestone(m),
        );
      },

      async deleteMilestone(id) {
        const before = ref.current.milestones;
        await write(
          () => dispatch({ type: 'milestones', milestones: before.filter((m) => m.id !== id) }),
          () => dispatch({ type: 'milestones', milestones: before }),
          () => repo.deleteMilestone(id),
        );
      },

      /* -------------------------------------------------------- week */
      async setIntention(weekStart, intention) {
        const before = ref.current.weeks;
        const existing = before.find((w) => w.weekStart === weekStart);
        const next: Week = { ...(existing ?? { weekStart }), intention: intention.trim() };
        await write(
          () =>
            dispatch({
              type: 'weeks',
              weeks: existing
                ? before.map((w) => (w.weekStart === weekStart ? next : w))
                : [...before, next],
            }),
          () => dispatch({ type: 'weeks', weeks: before }),
          () => repo.putWeek(next),
        );
      },

      async setReview(weekStart, review) {
        const before = ref.current.weeks;
        const existing = before.find((w) => w.weekStart === weekStart);
        const next: Week = { ...(existing ?? { weekStart }), review };
        await write(
          () =>
            dispatch({
              type: 'weeks',
              weeks: existing
                ? before.map((w) => (w.weekStart === weekStart ? next : w))
                : [...before, next],
            }),
          () => dispatch({ type: 'weeks', weeks: before }),
          () => repo.putWeek(next),
        );
      },

      /* ---------------------------------------------------- settings */
      async updateSettings(patch) {
        const before = ref.current.settings;
        const next: Settings = {
          ...before,
          ...patch,
          notifications: { ...before.notifications, ...(patch.notifications ?? {}) },
          ai: { ...before.ai, ...(patch.ai ?? {}) },
        };
        await write(
          () => dispatch({ type: 'settings', settings: next }),
          () => dispatch({ type: 'settings', settings: before }),
          () => repo.setSettings(next),
        );
      },

      toast,
      dismissToast: (id) => dispatch({ type: 'dismissToast', id }),
      dismissMigration: () => dispatch({ type: 'clearMigration' }),
      weekOf: (date) => {
        const ws = startOfWeek(date, ref.current.settings.weekStartsOn);
        return ref.current.weeks.find((w) => w.weekStart === ws);
      },
    };
  }, [state, toast, write]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
