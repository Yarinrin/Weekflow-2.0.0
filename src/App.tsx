import { useCallback, useEffect, useRef, useState } from 'react';
import { GoalIcon, HomeIcon, PlusIcon, WeekIcon, YouIcon } from '@/ui/Icons';
import { OVERLAY_ROOT_ID, Sheet } from '@/ui/components';
import { CreateChooser, NewGoalSheet, NewHabitSheet, NewTaskSheet } from '@/ui/sheets/CreateSheets';
import { TaskSheet } from '@/ui/sheets/TaskSheet';
import { GoalDetailScreen } from '@/screens/GoalDetail';
import { GoalsScreen } from '@/screens/Goals';
import { HabitDetailScreen } from '@/screens/HabitDetail';
import { HomeScreen } from '@/screens/Home';
import { SettingsScreen } from '@/screens/Settings';
import { WeekScreen } from '@/screens/Week';
import { startOfWeek } from '@/domain/dates';
import { syncReminders } from '@/services/notifications';
import { useStore } from '@/store/store';
import type { DateKey } from '@/domain/types';

type Route =
  | { name: 'home' }
  | { name: 'week' }
  | { name: 'goals' }
  | { name: 'you' }
  | { name: 'goal'; id: string }
  | { name: 'habit'; id: string };

type Creating = 'chooser' | 'task' | 'habit' | 'goal' | null;

const TABS = [
  { name: 'home', label: 'Home', Icon: HomeIcon },
  { name: 'week', label: 'Week', Icon: WeekIcon },
  { name: 'goals', label: 'Goals', Icon: GoalIcon },
  { name: 'you', label: 'You', Icon: YouIcon },
] as const;

export function App() {
  const store = useStore();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [creating, setCreating] = useState<Creating>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DateKey>(store.today);
  const [weekSegment, setWeekSegment] = useState<'plan' | 'review'>('plan');
  const scrollRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: Route, dir: 'forward' | 'back' = 'forward') => {
    setDirection(dir);
    setRoute(next);
  }, []);

  /* Reset scroll on navigation — a new screen always starts at the top. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [route]);

  /* Keep the selected day inside the current week as days roll over. */
  useEffect(() => {
    setSelectedDay((d) => (d > store.today && store.today !== d ? store.today : d));
  }, [store.today]);

  /* Android hardware Back: unwind sheets, then details, then leave the app. */
  useEffect(() => {
    let remove: (() => void) | undefined;
    void (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const handle = await CapApp.addListener('backButton', ({ canGoBack: _ }) => {
          if (openTaskId) return setOpenTaskId(null);
          if (creating) return setCreating(null);
          if (route.name === 'goal' || route.name === 'habit') return go({ name: 'home' }, 'back');
          if (route.name !== 'home') return go({ name: 'home' }, 'back');
          void CapApp.exitApp();
        });
        remove = () => void handle.remove();
      } catch {
        /* web build — the browser's own back behaviour is fine */
      }
    })();
    return () => remove?.();
  }, [route, creating, openTaskId, go]);

  /* Rebuild the reminder schedule whenever the things it depends on change. */
  useEffect(() => {
    if (store.status !== 'ready') return;
    const done = new Set(store.completions.map((c) => `${c.habitId}|${c.date}`));
    void syncReminders(
      store.settings,
      store.tasks,
      store.habits,
      (habitId, date) => done.has(`${habitId}|${date}`),
      store.today,
    );
  }, [
    store.status,
    store.settings,
    store.tasks,
    store.habits,
    store.completions,
    store.today,
  ]);

  if (store.status === 'loading') return <Splash />;
  if (store.status === 'failed') return <FailedToLoad message={store.error} />;

  const openTask = store.tasks.find((t) => t.id === openTaskId) ?? null;
  const weekStart = startOfWeek(selectedDay, store.settings.weekStartsOn);

  const startCreate = (kind: 'task' | 'habit' | 'goal') => setCreating(kind);

  return (
    <div className="app">
      <div className="app__wash" aria-hidden />

      <div className="app__viewport">
        <div
          ref={scrollRef}
          className={`screen screen--${direction === 'back' ? 'enter-back' : 'enter'}`}
          key={routeKey(route)}
        >
          {route.name === 'home' && (
            <HomeScreen
              onOpenTask={setOpenTaskId}
              onOpenGoal={(id) => go({ name: 'goal', id })}
              onOpenHabit={(id) => go({ name: 'habit', id })}
              onCreate={startCreate}
              onOpenWeek={() => go({ name: 'week' })}
            />
          )}
          {route.name === 'week' && (
            <WeekScreen
              selected={selectedDay}
              onSelect={setSelectedDay}
              segment={weekSegment}
              onSegment={setWeekSegment}
              onOpenTask={setOpenTaskId}
              onCreate={startCreate}
            />
          )}
          {route.name === 'goals' && (
            <GoalsScreen onOpenGoal={(id) => go({ name: 'goal', id })} onCreate={startCreate} />
          )}
          {route.name === 'goal' && (
            <GoalDetailScreen
              goalId={route.id}
              onBack={() => go({ name: 'goals' }, 'back')}
              onOpenTask={setOpenTaskId}
              onOpenHabit={(id) => go({ name: 'habit', id })}
              onCreate={startCreate}
            />
          )}
          {route.name === 'habit' && (
            <HabitDetailScreen
              habitId={route.id}
              onBack={() => go({ name: 'home' }, 'back')}
              onOpenGoal={(id) => go({ name: 'goal', id })}
            />
          )}
          {route.name === 'you' && <SettingsScreen />}
        </div>
        <div className="app__fade" aria-hidden />
      </div>

      <Toasts />

      <nav className="nav" aria-label="Main">
        {TABS.slice(0, 2).map((tab) => (
          <TabButton key={tab.name} tab={tab} route={route} go={go} />
        ))}
        <span className="nav__create">
          <button
            type="button"
            className="nav__createBtn"
            aria-label={creating ? 'Close create menu' : 'Create'}
            aria-expanded={creating !== null}
            onClick={() => setCreating((c) => (c ? null : 'chooser'))}
          >
            <PlusIcon />
          </button>
        </span>
        {TABS.slice(2).map((tab) => (
          <TabButton key={tab.name} tab={tab} route={route} go={go} />
        ))}
      </nav>

      <CreateChooser
        open={creating === 'chooser'}
        onClose={() => setCreating(null)}
        onPick={startCreate}
      />
      <NewTaskSheet
        open={creating === 'task'}
        onClose={() => setCreating(null)}
        defaultDate={route.name === 'week' ? selectedDay : store.today}
        weekStart={weekStart}
      />
      <NewHabitSheet open={creating === 'habit'} onClose={() => setCreating(null)} />
      <NewGoalSheet
        open={creating === 'goal'}
        onClose={() => setCreating(null)}
        today={store.today}
      />
      <TaskSheet
        task={openTask}
        onClose={() => setOpenTaskId(null)}
        onOpenGoal={(id) => {
          setOpenTaskId(null);
          go({ name: 'goal', id });
        }}
      />

      <MigrationReport />

      {/* Sheets portal in here, so one opened from inside a screen still floats
          above the nav instead of being trapped in the screen's stacking context. */}
      <div id={OVERLAY_ROOT_ID} />
    </div>
  );
}

const routeKey = (route: Route): string =>
  'id' in route ? `${route.name}:${route.id}` : route.name;

function TabButton({
  tab,
  route,
  go,
}: {
  tab: (typeof TABS)[number];
  route: Route;
  go: (r: Route, dir?: 'forward' | 'back') => void;
}) {
  // Goal detail keeps the Goals tab lit; habit detail is reached from Home.
  const active =
    route.name === tab.name || (tab.name === 'goals' && route.name === 'goal');
  return (
    <button
      type="button"
      className="nav__tab"
      aria-current={active ? 'page' : undefined}
      onClick={() => go({ name: tab.name } as Route)}
    >
      <tab.Icon />
      <span>{tab.label}</span>
    </button>
  );
}

/* ---------------------------------------------------------------- toasts */

function Toasts() {
  const store = useStore();
  const toast = store.toasts[store.toasts.length - 1];
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setLeaving(false);
    const hide = window.setTimeout(() => setLeaving(true), 3200);
    const drop = window.setTimeout(() => store.dismissToast(toast.id), 3420);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(drop);
    };
  }, [toast, store]);

  if (!toast) return null;

  return (
    <div
      className={`toast${toast.tone === 'error' ? ' toast--error' : ''}${leaving ? ' toast--out' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            toast.undo?.();
            store.dismissToast(toast.id);
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------- migration report */

function MigrationReport() {
  const store = useStore();
  if (!store.migration) return null;
  const r = store.migration;

  return (
    <Sheet open onClose={store.dismissMigration} title="Welcome to WeekFlow 2.0">
      <p className="display d2">Your history came with you.</p>
      <div className="group" style={{ marginTop: 'var(--sp-7)' }}>
        {[
          ['Weeks found', r.weeksFound],
          ['Tasks imported', r.tasksImported],
          ['Habits from recurring tasks', r.habitsImported],
          ['Past habit completions recovered', r.habitCompletionsRecovered],
          ['Goals imported', r.goalsImported],
          ['Reviews kept', r.reviewsImported],
        ]
          .filter(([, n]) => Number(n) > 0)
          .map(([label, n]) => (
            <div key={String(label)} className="row row--center">
              <span className="row__body">
                <span className="row__title">{label}</span>
              </span>
              <span className="meta">{n}</span>
            </div>
          ))}
      </div>

      {r.notes.map((note, i) => (
        <p key={i} className="body" style={{ marginTop: 'var(--sp-6)' }}>
          {note}
        </p>
      ))}

      <button type="button" className="btn" onClick={store.dismissMigration}>
        Got it
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------ boot states */

function Splash() {
  return (
    <div className="app" style={{ display: 'grid', placeItems: 'center' }}>
      <p className="display d2 it" style={{ color: 'var(--ink-3)' }}>
        WeekFlow
      </p>
    </div>
  );
}

function FailedToLoad({ message }: { message: string | null }) {
  return (
    <div className="app" style={{ display: 'grid', placeItems: 'center', padding: 'var(--sp-9)' }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <p className="display d2">WeekFlow could not start.</p>
        <p className="body" style={{ marginTop: 'var(--sp-5)' }}>
          {message ?? 'Something went wrong opening your data on this device.'}
        </p>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 'var(--sp-8)' }}
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
