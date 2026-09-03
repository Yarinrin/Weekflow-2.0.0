/**
 * Local reminders. All on-device via Capacitor — no push service, no server, nothing
 * leaves the phone.
 *
 * Defaults are conservative: everything off except the Sunday review nudge. A
 * reminder for something already done is cancelled rather than fired, because being
 * nagged about a finished task is how notification permission gets revoked.
 */
import { atTime } from '@/domain/dates';
import { isDueOn } from '@/domain/habits';
import type { DateKey, Habit, Settings, Task } from '@/domain/types';

/** Deterministic small integer id, so a reminder can be rescheduled or cancelled. */
function idFor(kind: 'task' | 'habit' | 'deadline' | 'review', key: string): number {
  let h = kind.charCodeAt(0) * 7919;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 2_000_000;
  return h + 1;
}

interface PendingNotification {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; repeats?: boolean };
}

/**
 * Loaded lazily so the web build never pulls in the native plugin unless it is used.
 *
 * The result is wrapped in an object deliberately. Capacitor plugins are Proxies that
 * intercept every property, `then` included; returning one straight out of an `async`
 * function makes the runtime probe it for thenable-ness and the web shim throws
 * "LocalNotifications.then() is not implemented on web". Boxing it avoids that.
 */
type NotificationApi = typeof import('@capacitor/local-notifications')['LocalNotifications'];

async function plugin(): Promise<{ api: NotificationApi } | null> {
  // On the web there is nothing to schedule against; skip before touching the proxy.
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
  } catch {
    return null;
  }
  try {
    const mod = await import('@capacitor/local-notifications');
    return { api: mod.LocalNotifications };
  } catch {
    return null;
  }
}

export async function requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  const loaded = await plugin();
  if (!loaded) return 'unavailable';
  const { api } = loaded;
  try {
    const res = await api.requestPermissions();
    return res.display === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function hasPermission(): Promise<boolean> {
  const loaded = await plugin();
  if (!loaded) return false;
  const { api } = loaded;
  try {
    const res = await api.checkPermissions();
    return res.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Rebuild the whole schedule from current state. Cheaper and far less error-prone than
 * tracking individual reminders as things change: cancel everything, re-add what is
 * still true.
 */
export async function syncReminders(
  settings: Settings,
  tasks: Task[],
  habits: Habit[],
  isHabitDone: (habitId: string, date: DateKey) => boolean,
  today: DateKey,
): Promise<void> {
  const loaded = await plugin();
  if (!loaded) return;
  const { api } = loaded;

  try {
    const pending = await api.getPending();
    if (pending.notifications.length) {
      await api.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
  } catch {
    return; // no permission, or not a native context — nothing to do
  }

  const now = new Date();
  const queue: PendingNotification[] = [];

  if (settings.notifications.tasks) {
    for (const task of tasks) {
      if (task.done || !task.remindAt || task.date < today) continue;
      const at = atTime(task.date, task.remindAt);
      if (!at || at <= now) continue;
      queue.push({
        id: idFor('task', task.id),
        title: task.title,
        body: task.important ? 'One of this week’s important ones.' : 'Planned for today.',
        schedule: { at },
      });
    }
  }

  if (settings.notifications.habits) {
    for (const habit of habits) {
      if (habit.archivedAt || !habit.remindAt) continue;
      // Only the next seven days; the schedule is rebuilt every launch anyway.
      for (let i = 0; i < 7; i++) {
        const date = addDaysLocal(today, i);
        if (!isDueOn(habit, date)) continue;
        if (isHabitDone(habit.id, date)) continue;
        const at = atTime(date, habit.remindAt);
        if (!at || at <= now) continue;
        queue.push({
          id: idFor('habit', `${habit.id}|${date}`),
          title: habit.name,
          body: 'Still open today.',
          schedule: { at },
        });
      }
    }
  }

  if (settings.notifications.weeklyReview) {
    const at = nextWeekday(now, settings.weekStartsOn, 10);
    queue.push({
      id: idFor('review', 'weekly'),
      title: 'Your week is ready to read',
      body: 'Five minutes to see what went well and what to change.',
      schedule: { at, repeats: true },
    });
  }

  if (queue.length === 0) return;

  try {
    await api.schedule({
      notifications: queue.slice(0, 60).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: n.schedule,
        smallIcon: 'ic_stat_weekflow',
      })),
    });
  } catch {
    // Scheduling can fail on some Android builds without exact-alarm permission.
    // A missing reminder is not worth interrupting the user over.
  }
}

export async function cancelAll(): Promise<void> {
  const loaded = await plugin();
  if (!loaded) return;
  const { api } = loaded;
  try {
    const pending = await api.getPending();
    if (pending.notifications.length) {
      await api.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
  } catch {
    /* nothing scheduled */
  }
}

function addDaysLocal(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, m! - 1, d! + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** The next occurrence of `weekday` at `hour` local time, strictly in the future. */
function nextWeekday(from: Date, weekday: number, hour: number): Date {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (delta === 0 && d <= from ? 7 : delta));
  return d;
}
