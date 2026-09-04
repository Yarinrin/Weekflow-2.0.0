/**
 * Bringing data in from somewhere else.
 *
 * The automatic migration only fires when WeekFlow 1.0's `localStorage` is on the same
 * origin as WeekFlow 2.0. That is true if you open 2.0 in the browser where you used
 * 1.0, and false everywhere else — including the Android app, whose WebView storage is
 * its own sandbox. So the phone needs a file it can be handed.
 *
 * Two shapes are accepted:
 *   'weekflow-v1-export' — the three raw v1 keys, produced by the console snippet in
 *                          docs/03-exporting-from-weekflow-1.md. Runs through exactly
 *                          the same `buildMigration` as the automatic path, so there is
 *                          one migration to trust rather than two.
 *   'weekflow-export'    — a 2.0 export, for moving between devices.
 */
import { buildMigration, V1_KEYS, type MigrationResult } from './migrate';
import { isDateKey } from '@/domain/dates';
import { isArea } from '@/domain/types';
import type {
  DayIndex,
  Goal,
  Habit,
  HabitCompletion,
  Milestone,
  Task,
  Week,
} from '@/domain/types';

export interface ImportedData {
  tasks: Task[];
  habits: Habit[];
  completions: HabitCompletion[];
  goals: Goal[];
  milestones: Milestone[];
  weeks: Week[];
}

export interface ImportOutcome {
  data: ImportedData;
  /** Set when the file was a v1 export, so the UI can show the same report. */
  report?: MigrationResult['report'];
  name?: string;
  source: 'v1' | 'v2';
  summary: string;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** An in-memory Storage, so a v1 bundle can reuse the real migration unchanged. */
function storageFrom(entries: Record<string, string | null>): Storage {
  const map = new Map(
    Object.entries(entries).filter(([, v]) => typeof v === 'string') as [string, string][],
  );
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Validate a 2.0 export. Anything malformed is dropped rather than trusted — an import
 * that half-succeeds with corrupt rows is worse than one that says what it skipped.
 */
function readV2(raw: Record<string, unknown>): { data: ImportedData; skipped: number } {
  let skipped = 0;
  const keep = <T>(items: unknown, ok: (x: never) => boolean): T[] =>
    arr<T>(items).filter((x) => {
      const good = ok(x as never);
      if (!good) skipped++;
      return good;
    });

  const tasks = keep<Task>(raw.tasks, (t: Task) => !!str(t?.id) && !!str(t?.title) && isDateKey(t?.date) && isArea(t?.area));
  const habits = keep<Habit>(raw.habits, (h: Habit) => !!str(h?.id) && !!str(h?.name) && !!h?.schedule && isArea(h?.area));
  const habitIds = new Set(habits.map((h) => h.id));
  const completions = keep<HabitCompletion>(
    raw.completions,
    (c: HabitCompletion) => !!str(c?.habitId) && isDateKey(c?.date) && habitIds.has(c.habitId),
  ).map((c) => ({ ...c, id: `${c.habitId}|${c.date}` })); // rebuild the key, never trust it
  const goals = keep<Goal>(raw.goals, (g: Goal) => !!str(g?.id) && !!str(g?.title) && isArea(g?.area));
  const goalIds = new Set(goals.map((g) => g.id));
  const milestones = keep<Milestone>(
    raw.milestones,
    (m: Milestone) => !!str(m?.id) && !!str(m?.title) && goalIds.has(m?.goalId),
  );
  const weeks = keep<Week>(raw.weeks, (w: Week) => isDateKey(w?.weekStart));

  // Drop links that point at nothing, so the UI never renders a dangling goal.
  for (const t of tasks) if (t.goalId && !goalIds.has(t.goalId)) delete t.goalId;
  for (const h of habits) if (h.goalId && !goalIds.has(h.goalId)) delete h.goalId;

  return { data: { tasks, habits, completions, goals, milestones, weeks }, skipped };
}

export function parseImport(text: string, weekStartsOn: DayIndex = 0): ImportOutcome {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ImportError(
      'That file is not readable JSON. Make sure you exported the whole file rather than copying part of it.',
    );
  }
  if (!raw || typeof raw !== 'object') {
    throw new ImportError('That file does not look like a WeekFlow export.');
  }

  const format = str(raw.format);

  /* ---- a WeekFlow 1.0 bundle ---- */
  if (format === 'weekflow-v1-export' || raw[V1_KEYS.weeks] !== undefined) {
    const storage = storageFrom({
      [V1_KEYS.weeks]: typeof raw[V1_KEYS.weeks] === 'string' ? (raw[V1_KEYS.weeks] as string) : null,
      [V1_KEYS.templates]:
        typeof raw[V1_KEYS.templates] === 'string' ? (raw[V1_KEYS.templates] as string) : null,
      [V1_KEYS.name]: typeof raw[V1_KEYS.name] === 'string' ? (raw[V1_KEYS.name] as string) : null,
    });
    const result = buildMigration(storage, weekStartsOn);
    if (!result.ran) {
      throw new ImportError(
        'That file has none of the three WeekFlow 1.0 keys in it. Re-run the export snippet on the page where you actually use WeekFlow.',
      );
    }
    const r = result.report;
    return {
      source: 'v1',
      data: {
        tasks: result.tasks,
        habits: result.habits,
        completions: result.completions,
        goals: result.goals,
        milestones: result.milestones,
        weeks: result.weeks,
      },
      report: r,
      ...(result.name ? { name: result.name } : {}),
      summary:
        `${count(r.weeksFound, 'week')}, ${count(r.tasksImported, 'task')}, ` +
        `${count(r.habitsImported, 'habit')} and ${count(r.goalsImported, 'goal')} from WeekFlow 1.0.`,
    };
  }

  /* ---- a WeekFlow 2.0 export ---- */
  if (format === 'weekflow-export' || raw.tasks !== undefined) {
    const { data, skipped } = readV2(raw);
    const total =
      data.tasks.length + data.habits.length + data.goals.length + data.weeks.length;
    if (total === 0) {
      throw new ImportError('That export is empty — there is nothing in it to bring across.');
    }
    const settings = raw.settings as { name?: unknown } | undefined;
    return {
      source: 'v2',
      data,
      ...(str(settings?.name) ? { name: str(settings?.name) } : {}),
      summary:
        `${count(data.tasks.length, 'task')}, ${count(data.habits.length, 'habit')}, ` +
        `${count(data.goals.length, 'goal')} and ${count(data.weeks.length, 'week')}.` +
        (skipped > 0 ? ` ${skipped} unreadable record${skipped === 1 ? '' : 's'} skipped.` : ''),
    };
  }

  throw new ImportError(
    'That file is not a WeekFlow export. Expected either a 1.0 bundle or a file exported from WeekFlow 2.0.',
  );
}

/** The shape the export snippet in docs/03 writes, kept next to the parser that reads it. */
export const V1_EXPORT_FORMAT = 'weekflow-v1-export';
export const V1_EXPORT_KEYS = [V1_KEYS.weeks, V1_KEYS.templates, V1_KEYS.name] as const;
