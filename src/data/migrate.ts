/**
 * Migration from WeekFlow 1.0's localStorage into the 2.0 model.
 *
 * Principles, in order:
 *   1. Never destroy the old data. The three v1 keys are left exactly where they are,
 *      and a verbatim copy is written to `wf2-legacy-backup` before anything is read.
 *   2. Never guess. Where v1 cannot be mapped without inventing intent — see
 *      weekly goals below — the migration takes the conservative reading and
 *      *reports* the ambiguity rather than resolving it silently.
 *   3. Never fail the app. A malformed record is skipped and counted, not thrown.
 *
 * See docs/01-product-architecture.md §6 for the mapping table.
 */
import { addDays, formatShort, isDateKey, startOfWeek } from '@/domain/dates';
import { isArea } from '@/domain/types';
import type {
  Area,
  DateKey,
  DayIndex,
  Goal,
  Habit,
  HabitCompletion,
  HabitSchedule,
  Milestone,
  Task,
  Week,
} from '@/domain/types';

export const V1_KEYS = {
  weeks: 'wf-clean-v2',
  templates: 'wf-templates-v1',
  name: 'wf-name',
} as const;

export const BACKUP_KEY = 'wf2-legacy-backup';

const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type V1Day = (typeof DAY_ORDER)[number];

/* ------------------------------------------------------- v1 shapes (loose) */

interface V1Task {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  day?: unknown;
  important?: unknown;
  recur?: unknown;
  done?: unknown;
  templateId?: unknown;
}
interface V1Goal {
  id?: unknown;
  text?: unknown;
  done?: unknown;
}
interface V1WeekData {
  tasks?: unknown;
  goals?: unknown;
  conclusion?: unknown;
  materializedTemplateIds?: unknown;
}
interface V1Template {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  day?: unknown;
  important?: unknown;
  recur?: unknown;
  customDays?: unknown;
}

export interface MigrationResult {
  ran: boolean;
  tasks: Task[];
  habits: Habit[];
  completions: HabitCompletion[];
  goals: Goal[];
  milestones: Milestone[];
  weeks: Week[];
  name: string | null;
  /** Human-readable account of what happened, shown to the user afterwards. */
  report: {
    weeksFound: number;
    tasksImported: number;
    habitsImported: number;
    habitCompletionsRecovered: number;
    goalsImported: number;
    reviewsImported: number;
    skipped: number;
    /** Goal titles seen in more than one week — candidates for merging by hand. */
    possibleDuplicateGoals: { title: string; count: number }[];
    notes: string[];
  };
}

const emptyResult = (): MigrationResult => ({
  ran: false,
  tasks: [],
  habits: [],
  completions: [],
  goals: [],
  milestones: [],
  weeks: [],
  name: null,
  report: {
    weeksFound: 0,
    tasksImported: 0,
    habitsImported: 0,
    habitCompletionsRecovered: 0,
    goalsImported: 0,
    reviewsImported: 0,
    skipped: 0,
    possibleDuplicateGoals: [],
    notes: [],
  },
});

let idCounter = 0;
const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const bool = (v: unknown): boolean => v === true;

/** v1 categories map 1:1 onto areas; anything unrecognised lands in Other. */
const toArea = (v: unknown): Area => (isArea(v) ? v : 'Other');

const dayOffset = (v: unknown): number => {
  const i = DAY_ORDER.indexOf(str(v) as V1Day);
  return i === -1 ? -1 : i;
};

/** v1 `recur` + `customDays` -> a 2.0 schedule. */
function toSchedule(recur: unknown, customDays: unknown): HabitSchedule {
  switch (str(recur)) {
    case 'daily':
      return { type: 'daily' };
    case 'weekdays':
      return { type: 'weekdays' };
    case 'weekends':
      return { type: 'weekends' };
    case 'custom': {
      const days = Array.isArray(customDays)
        ? customDays
            .map((d) => (typeof d === 'number' ? d : dayOffset(d)))
            .filter((n): n is number => n >= 0 && n <= 6)
        : [];
      return days.length > 0
        ? { type: 'days', days: [...new Set(days)].sort() as DayIndex[] }
        : { type: 'daily' };
    }
    default:
      return { type: 'daily' };
  }
}

export function readV1(storage: Storage): {
  weeks: Record<string, V1WeekData> | null;
  templates: V1Template[] | null;
  name: string | null;
} {
  const parse = <T>(key: string): T | null => {
    try {
      const raw = storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null; // corrupt JSON is treated as absent, never as a crash
    }
  };
  return {
    weeks: parse<Record<string, V1WeekData>>(V1_KEYS.weeks),
    templates: parse<V1Template[]>(V1_KEYS.templates),
    name: storage.getItem(V1_KEYS.name),
  };
}

export function hasV1Data(storage: Storage): boolean {
  return Object.values(V1_KEYS).some((k) => storage.getItem(k) !== null);
}

/**
 * Build the 2.0 dataset from v1 storage. Pure apart from reading `storage` —
 * it writes nothing, so it can be run and inspected before anything is committed.
 */
export function buildMigration(storage: Storage, weekStartsOn: DayIndex = 0): MigrationResult {
  const result = emptyResult();
  if (!hasV1Data(storage)) return result;
  result.ran = true;

  const { weeks: v1Weeks, templates: v1Templates, name } = readV1(storage);
  result.name = name && name.trim() ? name.trim() : null;
  const now = new Date().toISOString();

  /* ---- 1. Templates become habits. -------------------------------------- */
  const habitByTemplateId = new Map<string, Habit>();
  if (Array.isArray(v1Templates)) {
    for (const t of v1Templates) {
      const title = str(t.title);
      if (!title) {
        result.report.skipped++;
        continue;
      }
      const habit: Habit = {
        id: newId('hab'),
        name: title,
        area: toArea(t.category),
        schedule: toSchedule(t.recur, t.customDays),
        // Dated to the epoch of the user's history so consistency counts the
        // whole record rather than treating every habit as brand new.
        createdAt: now,
      };
      habitByTemplateId.set(str(t.id) || habit.id, habit);
      result.habits.push(habit);
    }
  }
  result.report.habitsImported = result.habits.length;

  /* ---- 2. Weeks: tasks, habit completions, goals, conclusions. ----------- */
  const goalTitleCounts = new Map<string, number>();
  let earliest: DateKey | null = null;

  const weekKeys = Object.keys(v1Weeks ?? {})
    .filter(isDateKey)
    .sort();
  result.report.weeksFound = weekKeys.length;

  for (const weekKey of weekKeys) {
    const wd = v1Weeks![weekKey] ?? {};
    if (!earliest || weekKey < earliest) earliest = weekKey;

    // v1 anchored weeks to Sunday. Re-anchor to the user's setting so the key is
    // meaningful under a Monday start too.
    const weekStart = startOfWeek(weekKey, weekStartsOn);
    const week: Week = { weekStart };

    /* tasks */
    if (Array.isArray(wd.tasks)) {
      for (const raw of wd.tasks as V1Task[]) {
        const title = str(raw.title);
        const offset = dayOffset(raw.day);
        if (!title || offset < 0) {
          result.report.skipped++;
          continue;
        }
        const date = addDays(weekKey, offset);
        const templateId = str(raw.templateId);

        if (templateId) {
          /* A materialised recurring instance. It was never real data — only a
             rendering of a template — so it becomes a habit completion if it was
             ticked, and is dropped otherwise. */
          const habit = habitByTemplateId.get(templateId);
          if (habit && bool(raw.done)) {
            result.completions.push({
              id: `${habit.id}|${date}`,
              habitId: habit.id,
              date,
              completedAt: `${date}T12:00:00.000Z`,
            });
          }
          continue;
        }

        result.tasks.push({
          id: newId('tsk'),
          title,
          area: toArea(raw.category),
          date,
          important: bool(raw.important),
          done: bool(raw.done),
          ...(bool(raw.done) ? { completedAt: `${date}T12:00:00.000Z` } : {}),
          createdAt: `${weekKey}T00:00:00.000Z`,
        });
      }
    }

    /* weekly goals — the lossy case, see the note pushed below */
    if (Array.isArray(wd.goals)) {
      for (const raw of wd.goals as V1Goal[]) {
        const text = str(raw.text);
        if (!text) {
          result.report.skipped++;
          continue;
        }
        goalTitleCounts.set(text, (goalTitleCounts.get(text) ?? 0) + 1);

        const goal: Goal = {
          id: newId('goa'),
          title: text,
          description: `Carried over from your week of ${formatShort(weekKey)}.`,
          area: 'Personal',
          deadline: addDays(weekKey, 6),
          progressMode: 'milestones',
          createdAt: `${weekKey}T00:00:00.000Z`,
          // Weeks that are already over get archived, so the Goals screen is not
          // buried under a year of one-week goals on first launch.
          ...(bool(raw.done) || weekKey < startOfWeek(new Date().toISOString().slice(0, 10))
            ? { archivedAt: `${addDays(weekKey, 6)}T23:59:59.000Z` }
            : {}),
        };
        result.goals.push(goal);
        result.milestones.push({
          id: newId('mil'),
          goalId: goal.id,
          title: text,
          done: bool(raw.done),
          ...(bool(raw.done) ? { completedAt: `${weekKey}T12:00:00.000Z` } : {}),
          order: 0,
        });
      }
    }

    /* conclusion -> a legacy review, honestly labelled */
    const conclusion = str(wd.conclusion);
    if (conclusion) {
      week.review = {
        generatedAt: `${weekKey}T23:00:00.000Z`,
        source: 'legacy',
        wentWell: conclusion,
        gotInTheWay: '',
        pattern: '',
        nextFocus: '',
      };
      result.report.reviewsImported++;
    }

    // `materializedTemplateIds` is deliberately dropped — it has no meaning once
    // habits track their own completions.
    result.weeks.push(week);
  }

  /* ---- 3. Backdate habits so consistency reflects the real history. ------ */
  if (earliest) {
    for (const h of result.habits) h.createdAt = `${earliest}T00:00:00.000Z`;
  }

  result.report.tasksImported = result.tasks.length;
  result.report.habitCompletionsRecovered = result.completions.length;
  result.report.goalsImported = result.goals.length;
  result.report.possibleDuplicateGoals = [...goalTitleCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count);

  /* ---- 4. Notes the user should actually see. ---------------------------- */
  const r = result.report;
  if (r.habitsImported > 0) {
    r.notes.push(
      `${r.habitsImported} recurring task${r.habitsImported === 1 ? '' : 's'} became habits, ` +
        `with ${r.habitCompletionsRecovered} past completion${
          r.habitCompletionsRecovered === 1 ? '' : 's'
        } recovered from your old weeks.`,
    );
  }
  if (r.goalsImported > 0) {
    r.notes.push(
      `Your ${r.goalsImported} weekly goal${r.goalsImported === 1 ? '' : 's'} became goals, one ` +
        `per week they appeared in. Past ones are archived so they stay out of your way.`,
    );
  }
  if (r.possibleDuplicateGoals.length > 0) {
    r.notes.push(
      `${r.possibleDuplicateGoals.length} goal${
        r.possibleDuplicateGoals.length === 1 ? '' : 's'
      } appeared in several weeks — for example “${r.possibleDuplicateGoals[0]!.title}” in ` +
        `${r.possibleDuplicateGoals[0]!.count} of them. WeekFlow kept them separate rather ` +
        `than guessing they were the same goal. You can merge them yourself.`,
    );
  }
  if (r.reviewsImported > 0) {
    r.notes.push(
      `${r.reviewsImported} weekly review${r.reviewsImported === 1 ? '' : 's'} were kept as ` +
        `written. Old reviews were a single paragraph, so they appear without the four sections.`,
    );
  }
  if (r.skipped > 0) {
    r.notes.push(`${r.skipped} incomplete record${r.skipped === 1 ? '' : 's'} could not be read and were skipped.`);
  }
  r.notes.push('Your old data is untouched, and a full backup was saved before anything changed.');

  return result;
}

/** Writes the verbatim backup. Called before any migration is committed. */
export function backupV1(storage: Storage): boolean {
  try {
    if (storage.getItem(BACKUP_KEY)) return true; // never overwrite an existing backup
    const payload = {
      backedUpAt: new Date().toISOString(),
      [V1_KEYS.weeks]: storage.getItem(V1_KEYS.weeks),
      [V1_KEYS.templates]: storage.getItem(V1_KEYS.templates),
      [V1_KEYS.name]: storage.getItem(V1_KEYS.name),
    };
    storage.setItem(BACKUP_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Out of quota, or storage disabled. The caller must not proceed without this.
    return false;
  }
}
