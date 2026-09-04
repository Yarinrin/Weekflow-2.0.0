import { useEffect, useRef, useState } from 'react';
import { ChipGroup, Section, Sheet } from '@/ui/components';
import { ChevronRight } from '@/ui/Icons';
import { repo } from '@/data/db';
import { ImportError, parseImport, type ImportOutcome } from '@/data/importer';
import { BACKUP_KEY } from '@/data/migrate';
import { DAY_NAMES } from '@/domain/dates';
import type { DayIndex } from '@/domain/types';
import { hasPermission, requestPermission } from '@/services/notifications';
import { useStore } from '@/store/store';

type Panel = 'name' | 'theme' | 'weekStart' | 'reminders' | 'ai' | 'data' | 'about' | null;

export function SettingsScreen() {
  const store = useStore();
  const { settings } = store;
  const [panel, setPanel] = useState<Panel>(null);

  const rows: { key: Exclude<Panel, null>; label: string; value: string }[] = [
    { key: 'name', label: 'Your name', value: settings.name || 'Not set' },
    {
      key: 'theme',
      label: 'Appearance',
      value: settings.theme === 'system' ? 'Match system' : settings.theme === 'dark' ? 'Dark' : 'Light',
    },
    { key: 'weekStart', label: 'Week starts on', value: DAY_NAMES[settings.weekStartsOn]! },
    {
      key: 'reminders',
      label: 'Reminders',
      value: `${Object.values(settings.notifications).filter(Boolean).length} on`,
    },
    {
      key: 'ai',
      label: 'Weekly review',
      value: settings.ai.mode === 'relay' && settings.ai.relayUrl ? 'Via relay' : 'On device',
    },
    { key: 'data', label: 'Your data', value: `${store.tasks.length} tasks` },
    { key: 'about', label: 'About WeekFlow', value: '2.0' },
  ];

  return (
    <div className="screen__pad">
      <div className="hero" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-7)' }}>
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--r-lg)',
            background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            fontWeight: 600,
            flex: 'none',
          }}
          aria-hidden
        >
          {(settings.name || 'W').charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="display d2">{settings.name || 'WeekFlow'}</h1>
          <p className="meta" style={{ marginTop: 4 }}>
            {store.tasks.length} tasks · {store.habits.length} habits · {store.goals.length} goals
          </p>
        </div>
      </div>

      <Section title="Settings">
        <div className="group">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className="row row--center"
              onClick={() => setPanel(row.key)}
            >
              <span className="row__body">
                <span className="row__title">{row.label}</span>
              </span>
              <span className="meta">{row.value}</span>
              <ChevronRight className="row__chevron" />
            </button>
          ))}
        </div>
      </Section>

      <p className="body" style={{ marginTop: 'var(--sp-8)', fontSize: 12.5 }}>
        WeekFlow works entirely on this phone. Nothing is uploaded, and there is no account to
        create.
      </p>

      {panel === 'name' && <NamePanel onClose={() => setPanel(null)} />}
      {panel === 'theme' && <ThemePanel onClose={() => setPanel(null)} />}
      {panel === 'weekStart' && <WeekStartPanel onClose={() => setPanel(null)} />}
      {panel === 'reminders' && <RemindersPanel onClose={() => setPanel(null)} />}
      {panel === 'ai' && <AIPanel onClose={() => setPanel(null)} />}
      {panel === 'data' && <DataPanel onClose={() => setPanel(null)} />}
      {panel === 'about' && <AboutPanel onClose={() => setPanel(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ name */

function NamePanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [name, setName] = useState(store.settings.name);
  return (
    <Sheet open onClose={onClose} title="Your name">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void store.updateSettings({ name: name.trim() });
          onClose();
        }}
      >
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should WeekFlow call you?"
          aria-label="Your name"
          enterKeyHint="done"
        />
        <p className="meta" style={{ marginTop: 'var(--sp-4)', lineHeight: 1.5 }}>
          Used in the greeting, and nowhere else. It never leaves your phone.
        </p>
        <button type="submit" className="btn">
          Save
        </button>
      </form>
    </Sheet>
  );
}

/* ----------------------------------------------------------------- theme */

function ThemePanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  return (
    <Sheet open onClose={onClose} title="Appearance">
      <ChipGroup
        legend="Appearance"
        value={store.settings.theme}
        onChange={(theme) => void store.updateSettings({ theme })}
        options={[
          { value: 'system', label: 'Match system' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <p className="meta" style={{ marginTop: 'var(--sp-6)', lineHeight: 1.5 }}>
        WeekFlow is designed light first, but the dark palette is a full one — not an inversion.
      </p>
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------ week start */

function WeekStartPanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  return (
    <Sheet open onClose={onClose} title="Week starts on">
      <ChipGroup
        legend="Week starts on"
        value={String(store.settings.weekStartsOn)}
        onChange={(v) => void store.updateSettings({ weekStartsOn: Number(v) as DayIndex })}
        options={[
          { value: '0', label: 'Sunday' },
          { value: '1', label: 'Monday' },
          { value: '6', label: 'Saturday' },
        ]}
      />
      <p className="meta" style={{ marginTop: 'var(--sp-6)', lineHeight: 1.5 }}>
        Changing this regroups your history — nothing is lost, the weeks are just drawn with
        different boundaries.
      </p>
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------- reminders */

function RemindersPanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { notifications } = store.settings;
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    void hasPermission().then(setGranted);
  }, []);

  const toggle = async (key: keyof typeof notifications) => {
    const turningOn = !notifications[key];
    if (turningOn && granted === false) {
      const result = await requestPermission();
      if (result === 'denied') {
        store.toast(
          'Android is blocking WeekFlow’s notifications. Turn them on in system settings and try again.',
          { tone: 'error' },
        );
        return;
      }
      if (result === 'granted') setGranted(true);
    }
    void store.updateSettings({ notifications: { ...notifications, [key]: turningOn } });
  };

  const items: { key: keyof typeof notifications; label: string; body: string }[] = [
    { key: 'weeklyReview', label: 'Weekly review', body: 'One nudge at the start of your week.' },
    { key: 'tasks', label: 'Task reminders', body: 'Only for tasks you give a time to.' },
    { key: 'habits', label: 'Habit reminders', body: 'Only on days a habit is due and still open.' },
    { key: 'deadlines', label: 'Goal deadlines', body: 'A week before, and on the day.' },
  ];

  return (
    <Sheet open onClose={onClose} title="Reminders">
      <div className="group">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="switch"
            aria-checked={notifications[item.key]}
            className="row row--center"
            onClick={() => void toggle(item.key)}
          >
            <span className="row__body">
              <span className="row__title">{item.label}</span>
              <span className="meta" style={{ display: 'block', marginTop: 3 }}>
                {item.body}
              </span>
            </span>
            <span
              className={`chip${notifications[item.key] ? ' chip--on' : ''}`}
              style={{ pointerEvents: 'none', minHeight: 32, padding: '6px 12px' }}
            >
              {notifications[item.key] ? 'On' : 'Off'}
            </span>
          </button>
        ))}
      </div>
      {granted === false && (
        <p className="body" style={{ marginTop: 'var(--sp-6)', color: 'var(--attention)' }}>
          Notifications are currently blocked for WeekFlow. Turning one on here will ask for
          permission.
        </p>
      )}
      <p className="meta" style={{ marginTop: 'var(--sp-6)', lineHeight: 1.5 }}>
        Reminders are scheduled on this device only, and cancelled the moment you finish the thing
        they are about.
      </p>
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

/* -------------------------------------------------------------------- ai */

function AIPanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { ai } = store.settings;
  const [url, setUrl] = useState(ai.relayUrl ?? '');

  return (
    <Sheet open onClose={onClose} title="Weekly review">
      <ChipGroup
        legend="How reviews are written"
        value={ai.mode}
        onChange={(mode) => void store.updateSettings({ ai: { ...ai, mode } })}
        options={[
          { value: 'local', label: 'On this device' },
          { value: 'relay', label: 'Via a relay' },
        ]}
      />

      {ai.mode === 'local' ? (
        <p className="body" style={{ marginTop: 'var(--sp-6)' }}>
          Your review is written on your phone from your own numbers. No network, no account, works
          offline.
        </p>
      ) : (
        <>
          <p className="body" style={{ marginTop: 'var(--sp-6)' }}>
            A relay is a small endpoint you run that holds an API key as a server secret. WeekFlow
            sends it totals and percentages only — never task titles, notes, or your name.
          </p>
          <input
            className="field"
            style={{ marginTop: 'var(--sp-6)' }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-relay.example.com/review"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Relay URL"
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              void store.updateSettings({ ai: { ...ai, relayUrl: url.trim() } });
              store.toast('Relay saved');
            }}
          >
            Save relay
          </button>
          <p className="meta" style={{ marginTop: 'var(--sp-5)', lineHeight: 1.5 }}>
            If the relay cannot be reached, WeekFlow writes the review on-device instead, so you are
            never left without one.
          </p>
        </>
      )}

      <p
        className="meta"
        style={{ marginTop: 'var(--sp-8)', lineHeight: 1.5, color: 'var(--attention)' }}
      >
        WeekFlow will never ask you to paste an API key into the app. A key stored on a phone can be
        read out of the app package, so there is nowhere safe to put one.
      </p>
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ data */

function DataPanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState<ImportOutcome | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasData = store.tasks.length + store.habits.length + store.goals.length > 0;

  const chooseFile = async (file: File | undefined) => {
    setImportError(null);
    setPending(null);
    if (!file) return;
    try {
      const text = await file.text();
      setPending(parseImport(text, store.settings.weekStartsOn));
    } catch (err) {
      setImportError(
        err instanceof ImportError
          ? err.message
          : 'That file could not be read. Try exporting it again.',
      );
    }
  };
  const hasBackup = typeof localStorage !== 'undefined' && localStorage.getItem(BACKUP_KEY) !== null;

  const exportData = async () => {
    try {
      const json = await repo.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weekflow-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      store.toast('Export saved');
    } catch {
      store.toast('Could not build the export file.', { tone: 'error' });
    }
  };

  return (
    <Sheet open onClose={onClose} title="Your data">
      <div className="group">
        {[
          ['Tasks', store.tasks.length],
          ['Habits', store.habits.length],
          ['Habit completions', store.completions.length],
          ['Goals', store.goals.length],
          ['Weeks recorded', store.weeks.length],
        ].map(([label, count]) => (
          <div key={String(label)} className="row row--center">
            <span className="row__body">
              <span className="row__title">{label}</span>
            </span>
            <span className="meta">{count}</span>
          </div>
        ))}
      </div>

      <button type="button" className="btn" onClick={() => void exportData()}>
        Export everything as JSON
      </button>

      {/* Import. The automatic migration only sees WeekFlow 1.0 data sitting on the
          same origin, which the Android app never does — so a file is the way in. */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => void chooseFile(e.target.files?.[0])}
      />
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          setPending(null);
          setImportError(null);
          fileRef.current?.click();
        }}
      >
        Import from a file
      </button>
      <p className="meta" style={{ marginTop: 'var(--sp-4)', lineHeight: 1.5 }}>
        Takes a WeekFlow 1.0 export or a WeekFlow 2.0 backup.
      </p>

      {importError && (
        <p className="body" style={{ marginTop: 'var(--sp-6)', color: 'var(--danger)' }} role="alert">
          {importError}
        </p>
      )}

      {pending && (
        <div className="card card--tint" data-area="Learning" style={{ marginTop: 'var(--sp-7)' }}>
          <h3 className="label" style={{ color: 'var(--deep)' }}>
            Ready to import
          </h3>
          <p className="body" style={{ marginTop: 'var(--sp-4)', color: 'var(--ink)' }}>
            {pending.summary}
          </p>
          {pending.report?.notes.map((note, i) => (
            <p key={i} className="body" style={{ marginTop: 'var(--sp-4)' }}>
              {note}
            </p>
          ))}
          {hasData && (
            <p className="body" style={{ marginTop: 'var(--sp-5)', color: 'var(--attention)' }}>
              This replaces everything currently in WeekFlow on this device. Export first if you
              want to keep it.
            </p>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              void store.importData(pending).then(() => {
                store.toast('Your data is in');
                setPending(null);
                onClose();
              });
            }}
          >
            {hasData ? 'Replace everything with this' : 'Import it'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}

      {hasBackup && (
        <p className="meta" style={{ marginTop: 'var(--sp-6)', lineHeight: 1.5 }}>
          Your WeekFlow 1.0 data is still on this device, untouched, alongside a backup taken before
          the upgrade. Nothing was deleted.
        </p>
      )}

      {confirmReset ? (
        <>
          <p className="body" style={{ marginTop: 'var(--sp-8)', textAlign: 'center' }}>
            Delete every task, habit, goal and week? Export first if you might want any of it back.
            This cannot be undone.
          </p>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              void repo
                .replaceAll({ tasks: [], habits: [], completions: [], goals: [], milestones: [], weeks: [] })
                .then(() => window.location.reload());
            }}
          >
            Yes, delete everything
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn--danger"
          style={{ marginTop: 'var(--sp-8)' }}
          onClick={() => setConfirmReset(true)}
        >
          Start over
        </button>
      )}
    </Sheet>
  );
}

/* ----------------------------------------------------------------- about */

function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="About">
      <p className="display d2">WeekFlow 2.0</p>
      <p className="body" style={{ marginTop: 'var(--sp-5)' }}>
        WeekFlow helps you make sense of your week — what you need to do, what you are working
        toward, how consistently you are showing up, and what to improve next.
      </p>
      <p className="body" style={{ marginTop: 'var(--sp-6)' }}>
        Everything lives on this device. There is no account, no sync, and no analytics. The app
        works with the network switched off.
      </p>
      <button type="button" className="btn" onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}
