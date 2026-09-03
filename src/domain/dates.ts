/**
 * Date handling for WeekFlow.
 *
 * Everything the app stores is a local calendar day ('YYYY-MM-DD'), never an instant.
 * A task on the 3rd is on the 3rd wherever you are; it does not shift when you fly.
 *
 * The one rule that keeps this correct: NEVER `new Date('2026-09-03')`. That is parsed
 * as UTC midnight, which is the previous day in every timezone west of Greenwich. All
 * parsing here goes through `fromKey`, which builds a local-midnight Date explicitly.
 */
import type { DateKey, DayIndex } from './types';

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * A key is valid only if it survives a round trip. The Date constructor rolls
 * out-of-range parts over silently — `new Date(2026, 12, 1)` is January 2027, and
 * '2026-02-30' becomes March 2 — so a corrupt key would otherwise be accepted as
 * a different day than it says.
 */
export function isDateKey(v: unknown): v is DateKey {
  if (typeof v !== 'string' || !KEY_RE.test(v)) return false;
  const d = fromKey(v);
  return !Number.isNaN(d.getTime()) && toKey(d) === v;
}

/** Local-midnight Date for a key. Throws on malformed input rather than guessing. */
export function fromKey(key: DateKey): Date {
  const m = KEY_RE.exec(key);
  if (!m) throw new RangeError(`Not a date key: ${JSON.stringify(key)}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

/**
 * Add days to a key. Uses setDate, which handles month and year rollover and — because
 * the Date is local — stays correct across daylight-saving boundaries where a "day"
 * is 23 or 25 hours long.
 */
export function addDays(key: DateKey, days: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

/** Whole days from `a` to `b`; negative if b is earlier. DST-safe. */
export function diffDays(a: DateKey, b: DateKey): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function dayIndex(key: DateKey): DayIndex {
  return fromKey(key).getDay() as DayIndex;
}

/** The first day of the week containing `key`, honouring the user's week start. */
export function startOfWeek(key: DateKey, weekStartsOn: DayIndex = 0): DateKey {
  const back = (dayIndex(key) - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

/** The seven day keys of a week, in order from its start. */
export function weekDates(weekStart: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isSameWeek(a: DateKey, b: DateKey, weekStartsOn: DayIndex = 0): boolean {
  return startOfWeek(a, weekStartsOn) === startOfWeek(b, weekStartsOn);
}

/** Week starts for the last `count` weeks, oldest first, ending with the one holding `key`. */
export function recentWeekStarts(
  key: DateKey,
  count: number,
  weekStartsOn: DayIndex = 0,
): DateKey[] {
  const current = startOfWeek(key, weekStartsOn);
  return Array.from({ length: count }, (_, i) => addDays(current, -7 * (count - 1 - i)));
}

/* ------------------------------------------------------------- formatting */

/** "Thursday" */
export const dayName = (key: DateKey): string => DAY_NAMES[dayIndex(key)]!;
/** "Thu" */
export const dayShort = (key: DateKey): string => DAY_SHORT[dayIndex(key)]!;
/** "T" — for the seven-across day strip. */
export const dayLetter = (key: DateKey): string => DAY_SHORT[dayIndex(key)]!.charAt(0);

/** "September 3" */
export function formatMonthDay(key: DateKey): string {
  const d = fromKey(key);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/** "Sep 3" */
export function formatShort(key: DateKey): string {
  const d = fromKey(key);
  return `${MONTH_NAMES[d.getMonth()]!.slice(0, 3)} ${d.getDate()}`;
}

/** "Sep 3, 2026" — used where the year matters, such as a distant deadline. */
export function formatWithYear(key: DateKey): string {
  return `${formatShort(key)}, ${fromKey(key).getFullYear()}`;
}

/** "Aug 30 – Sep 5" */
export function formatRange(startKey: DateKey, endKey: DateKey): string {
  return `${formatShort(startKey)} – ${formatShort(endKey)}`;
}

/**
 * Human relative day, for deadlines and carried tasks.
 * "Today", "Tomorrow", "Yesterday", "in 4 days", "3 days ago", then a date.
 */
export function relativeDay(key: DateKey, today: DateKey = todayKey()): string {
  const n = diffDays(today, key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `in ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return formatShort(key);
}

/** "in 6 weeks" / "3 weeks ago" / "in 5 months" — deliberately coarse for deadlines. */
export function relativeDeadline(key: DateKey, today: DateKey = todayKey()): string {
  const n = diffDays(today, key);
  if (n === 0) return 'due today';
  if (n < 0) return `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} overdue`;
  if (n < 14) return `${n} day${n === 1 ? '' : 's'} left`;
  if (n < 70) return `${Math.round(n / 7)} weeks left`;
  return `${Math.round(n / 30)} months left`;
}

/** Greeting band by local hour. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** '09:30' -> minutes since midnight. Returns null if unparseable. */
export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** A Date for a given day and 'HH:mm', in local time. */
export function atTime(key: DateKey, hhmm: string): Date | null {
  const mins = parseTime(hhmm);
  if (mins === null) return null;
  const d = fromKey(key);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}
