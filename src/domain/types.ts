/** The WeekFlow 2.0 domain model. See docs/01-product-architecture.md §5. */

/** 'YYYY-MM-DD' in the device's local timezone. Never a Date, never an ISO instant. */
export type DateKey = string;

/** 0 = Sunday ... 6 = Saturday, matching Date.prototype.getDay(). */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const AREAS = ['Work', 'Health', 'Learning', 'Personal', 'Other'] as const;
export type Area = (typeof AREAS)[number];

export function isArea(v: unknown): v is Area {
  return typeof v === 'string' && (AREAS as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------ tasks */

export interface Task {
  id: string;
  title: string;
  area: Area;
  /** Absolute date, so a task is not trapped inside a week bucket. */
  date: DateKey;
  important: boolean;
  done: boolean;
  completedAt?: string;
  goalId?: string;
  milestoneId?: string;
  notes?: string;
  /** 'HH:mm' local. Presence means a reminder is scheduled. */
  remindAt?: string;
  /** The date this task was moved from, if it was. Drives the "Moved from…" pill. */
  carriedFrom?: DateKey;
  createdAt: string;
}

/* ----------------------------------------------------------------- habits */

export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekends' }
  | { type: 'days'; days: DayIndex[] }
  | { type: 'timesPerWeek'; target: number };

export interface Habit {
  id: string;
  name: string;
  area: Area;
  schedule: HabitSchedule;
  goalId?: string;
  remindAt?: string;
  createdAt: string;
  archivedAt?: string;
}

/**
 * One row per completion. Presence is truth — there is no `done` flag to drift,
 * and streak/consistency are always derived rather than stored.
 */
export interface HabitCompletion {
  /** `${habitId}|${date}` — the primary key, which makes completion idempotent. */
  id: string;
  habitId: string;
  date: DateKey;
  completedAt: string;
}

/* ------------------------------------------------------------------ goals */

export interface Goal {
  id: string;
  title: string;
  description?: string;
  area: Area;
  deadline?: DateKey;
  /** 'milestones' derives progress from the checklist; 'manual' from a number. */
  progressMode: 'milestones' | 'manual';
  manualCurrent?: number;
  manualTarget?: number;
  manualUnit?: string;
  createdAt: string;
  archivedAt?: string;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  done: boolean;
  completedAt?: string;
  order: number;
}

/* ------------------------------------------------------------- week, review */

export interface Review {
  generatedAt: string;
  source: 'ai' | 'local' | 'legacy';
  wentWell: string;
  gotInTheWay: string;
  pattern: string;
  nextFocus: string;
  /** Snapshot, so an old review stays explicable after the data moves on. */
  stats?: WeekStats;
}

export interface Week {
  /** The week's first day, per the user's weekStartsOn setting. */
  weekStart: DateKey;
  intention?: string;
  review?: Review;
}

/* --------------------------------------------------------------- settings */

export interface Settings {
  name: string;
  theme: 'light' | 'dark' | 'system';
  weekStartsOn: DayIndex;
  notifications: {
    tasks: boolean;
    habits: boolean;
    deadlines: boolean;
    weeklyReview: boolean;
  };
  ai: {
    enabled: boolean;
    /** 'relay' calls the keyless endpoint; 'local' composes the review on-device. */
    mode: 'relay' | 'local';
    relayUrl?: string;
  };
  /** Bumped by migrations. */
  schemaVersion: number;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  theme: 'system',
  weekStartsOn: 0,
  notifications: { tasks: false, habits: false, deadlines: false, weeklyReview: true },
  ai: { enabled: true, mode: 'local' },
  schemaVersion: 2,
};

/* ------------------------------------------------------------ derived stats */

export interface WeekStats {
  weekStart: DateKey;
  /** Tasks on days up to and including today — "how am I doing so far". */
  plannedToDate: number;
  doneToDate: number;
  pctToDate: number;
  /** The whole week, including days still ahead. */
  plannedTotal: number;
  doneTotal: number;
  remaining: number;
  importantPlanned: number;
  importantDone: number;
  /** Index 0..6 relative to weekStart. */
  byDay: { date: DateKey; planned: number; done: number }[];
  byArea: { area: Area; planned: number; done: number; pct: number }[];
  habitTarget: number;
  habitDone: number;
  habitPct: number;
}
