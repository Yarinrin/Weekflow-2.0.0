/**
 * First run. Shown once, to someone with no name set and nothing in the app.
 *
 * Deliberately one screen and two fields. This is a local-first app with no account,
 * so there is nothing to set up — the only thing WeekFlow genuinely needs is what to
 * call you, and the only thing worth asking is what this week is about. Both are
 * skippable, and skipping lands you somewhere that still makes sense.
 */
import { useState } from 'react';
import { formatRange, greeting, startOfWeek, weekDates } from '@/domain/dates';
import { useStore } from '@/store/store';

export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const [name, setName] = useState(store.settings.name);
  const [intention, setIntention] = useState('');
  const [step, setStep] = useState<'name' | 'intention'>('name');

  const weekStart = startOfWeek(store.today, store.settings.weekStartsOn);
  const days = weekDates(weekStart);

  const finish = async () => {
    const clean = name.trim();
    if (clean) await store.updateSettings({ name: clean });
    if (intention.trim()) await store.setIntention(weekStart, intention.trim());
    await store.completeWelcome();
    onDone();
  };

  return (
    <div className="screen__pad" style={{ paddingTop: 'var(--sp-9)' }}>
      <div className="hero">
        <p className="label" style={{ color: 'var(--ink-2)' }}>
          WeekFlow
        </p>

        {step === 'name' ? (
          <>
            <h1 className="display d1" style={{ marginTop: 'var(--sp-5)' }}>
              Let&rsquo;s start with
              <br />
              <span className="it">your name.</span>
            </h1>
            <p className="body" style={{ marginTop: 'var(--sp-6)', color: 'var(--ink)' }}>
              It is only ever used in the greeting, and it never leaves this phone. There is no
              account to make.
            </p>
            <input
              className="field"
              style={{ marginTop: 'var(--sp-8)' }}
              value={name}
              autoFocus
              placeholder="What should WeekFlow call you?"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setStep('intention');
              }}
              enterKeyHint="next"
              autoComplete="given-name"
              aria-label="Your name"
            />
            <button
              type="button"
              className="btn"
              style={{ marginTop: 'var(--sp-7)' }}
              onClick={() => setStep('intention')}
            >
              {name.trim() ? 'Continue' : 'Skip for now'}
            </button>
          </>
        ) : (
          <>
            <h1 className="display d1" style={{ marginTop: 'var(--sp-5)' }}>
              {greeting()},
              <br />
              <span className="it">{name.trim() || 'there'}.</span>
            </h1>
            <p className="body" style={{ marginTop: 'var(--sp-6)', color: 'var(--ink)' }}>
              This week runs {formatRange(days[0]!, days[6]!)}. One line — what is it about?
              You can change it any time, or leave it blank.
            </p>
            <input
              className="field"
              style={{ marginTop: 'var(--sp-8)' }}
              value={intention}
              autoFocus
              placeholder="Fewer things, finished."
              onChange={(e) => setIntention(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void finish();
              }}
              enterKeyHint="done"
              aria-label="This week's intention"
            />
            <button
              type="button"
              className="btn"
              style={{ marginTop: 'var(--sp-7)' }}
              onClick={() => void finish()}
            >
              Start the week
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setStep('name')}
            >
              Back
            </button>
          </>
        )}
      </div>

      <div className="section">
        <h2 className="label">How WeekFlow works</h2>
        <div className="group" style={{ marginTop: 'var(--sp-5)' }}>
          {[
            ['Tasks', 'Things to do, on a day.', 'Work'],
            ['Habits', 'Things to do repeatedly. WeekFlow tracks how consistently you show up.', 'Health'],
            ['Goals', 'Things to work toward. Tasks and habits can point at one, so you can see whether your week is actually moving it.', 'Learning'],
          ].map(([title, body, area]) => (
            <div key={title} className="row" data-area={area}>
              <span className="row__body">
                <span className="row__title">{title}</span>
                <span className="body" style={{ display: 'block', marginTop: 4, fontSize: 12.5 }}>
                  {body}
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="body" style={{ marginTop: 'var(--sp-6)', fontSize: 12.5 }}>
          Everything stays on this phone. No sync, no analytics, and it works with the network
          switched off.
        </p>
      </div>
    </div>
  );
}
