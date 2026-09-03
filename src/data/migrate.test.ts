import { beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_KEY, V1_KEYS, backupV1, buildMigration, hasV1Data, readV1 } from './migrate';

/** Minimal in-memory Storage, so these tests need no DOM. */
function makeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
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

/** A realistic v1 payload: two weeks, recurring instances, goals, a conclusion. */
const V1_WEEKS = {
  '2026-08-23': {
    tasks: [
      { id: 'a1', title: 'Ship the invoice', category: 'Work', day: 'Mon', important: true, done: true },
      { id: 'a2', title: 'Buy a birthday present', category: 'Personal', day: 'Wed', done: false },
      // materialised recurring instances
      { id: 'a3', title: 'Morning run', category: 'Health', day: 'Mon', done: true, templateId: 't1' },
      { id: 'a4', title: 'Morning run', category: 'Health', day: 'Tue', done: false, templateId: 't1' },
      { id: 'a5', title: 'Morning run', category: 'Health', day: 'Wed', done: true, templateId: 't1' },
    ],
    goals: [
      { id: 'g1', text: 'Run three times', done: true },
      { id: 'g2', text: 'Finish the report', done: false },
    ],
    conclusion: 'Busy week, but the invoice finally went out.',
    materializedTemplateIds: ['t1'],
  },
  '2026-08-30': {
    tasks: [
      { id: 'b1', title: 'Draft the case study', category: 'Work', day: 'Thu', done: false },
      { id: 'b2', title: 'Morning run', category: 'Health', day: 'Mon', done: true, templateId: 't1' },
    ],
    goals: [{ id: 'g3', text: 'Run three times', done: false }],
    conclusion: '',
  },
};

const V1_TEMPLATES = [
  { id: 't1', title: 'Morning run', category: 'Health', recur: 'daily' },
  { id: 't2', title: 'Guitar practice', category: 'Learning', recur: 'custom', customDays: [1, 3, 5] },
];

let storage: Storage;
beforeEach(() => {
  storage = makeStorage({
    [V1_KEYS.weeks]: JSON.stringify(V1_WEEKS),
    [V1_KEYS.templates]: JSON.stringify(V1_TEMPLATES),
    [V1_KEYS.name]: 'Yarin',
  });
});

describe('detection and backup', () => {
  it('detects v1 data', () => {
    expect(hasV1Data(storage)).toBe(true);
    expect(hasV1Data(makeStorage())).toBe(false);
  });

  it('backs up all three keys verbatim before touching anything', () => {
    expect(backupV1(storage)).toBe(true);
    const backup = JSON.parse(storage.getItem(BACKUP_KEY)!);
    expect(backup[V1_KEYS.weeks]).toBe(storage.getItem(V1_KEYS.weeks));
    expect(backup[V1_KEYS.templates]).toBe(storage.getItem(V1_KEYS.templates));
    expect(backup[V1_KEYS.name]).toBe('Yarin');
  });

  it('never overwrites an existing backup', () => {
    storage.setItem(BACKUP_KEY, '{"backedUpAt":"first"}');
    backupV1(storage);
    expect(JSON.parse(storage.getItem(BACKUP_KEY)!).backedUpAt).toBe('first');
  });

  it('leaves the original keys in place', () => {
    buildMigration(storage);
    expect(storage.getItem(V1_KEYS.weeks)).not.toBeNull();
    expect(storage.getItem(V1_KEYS.templates)).not.toBeNull();
    expect(storage.getItem(V1_KEYS.name)).toBe('Yarin');
  });
});

describe('tasks', () => {
  it('converts day-of-week into absolute dates', () => {
    const r = buildMigration(storage);
    const invoice = r.tasks.find((t) => t.title === 'Ship the invoice')!;
    // Week key 2026-08-23 is a Sunday; Monday is the 24th.
    expect(invoice.date).toBe('2026-08-24');
    expect(invoice.done).toBe(true);
    expect(invoice.important).toBe(true);
    expect(invoice.area).toBe('Work');

    const draft = r.tasks.find((t) => t.title === 'Draft the case study')!;
    expect(draft.date).toBe('2026-09-03'); // Thursday of the following week
  });

  it('does not import materialised recurring instances as tasks', () => {
    const r = buildMigration(storage);
    expect(r.tasks.some((t) => t.title === 'Morning run')).toBe(false);
    // Two real tasks in week one, one in week two.
    expect(r.tasks).toHaveLength(3);
  });

  it('maps an unknown category to Other rather than dropping the task', () => {
    storage.setItem(
      V1_KEYS.weeks,
      JSON.stringify({
        '2026-08-23': { tasks: [{ title: 'Odd one', category: 'Nonsense', day: 'Tue' }] },
      }),
    );
    const r = buildMigration(storage);
    expect(r.tasks[0]!.area).toBe('Other');
  });

  it('skips unreadable records and counts them instead of throwing', () => {
    storage.setItem(
      V1_KEYS.weeks,
      JSON.stringify({
        '2026-08-23': {
          tasks: [
            { title: '', day: 'Mon' }, // no title
            { title: 'No day given' }, // no day
            { title: 'Bad day', day: 'Someday' }, // unparseable day
            { title: 'Fine', day: 'Fri', category: 'Work' },
          ],
        },
      }),
    );
    const r = buildMigration(storage);
    expect(r.tasks).toHaveLength(1);
    expect(r.report.skipped).toBe(3);
  });
});

describe('recurring tasks become habits', () => {
  it('creates one habit per template', () => {
    const r = buildMigration(storage);
    expect(r.habits).toHaveLength(2);
    expect(r.habits.map((h) => h.name).sort()).toEqual(['Guitar practice', 'Morning run']);
  });

  it('maps recurrence onto schedules', () => {
    const r = buildMigration(storage);
    expect(r.habits.find((h) => h.name === 'Morning run')!.schedule).toEqual({ type: 'daily' });
    expect(r.habits.find((h) => h.name === 'Guitar practice')!.schedule).toEqual({
      type: 'days',
      days: [1, 3, 5],
    });
  });

  it('recovers completions from ticked instances, and only those', () => {
    const r = buildMigration(storage);
    const run = r.habits.find((h) => h.name === 'Morning run')!;
    const dates = r.completions
      .filter((c) => c.habitId === run.id)
      .map((c) => c.date)
      .sort();
    // Mon 24 done, Tue 25 not, Wed 26 done, Mon 31 done.
    expect(dates).toEqual(['2026-08-24', '2026-08-26', '2026-08-31']);
  });

  it('backdates habits to the earliest week so consistency sees the real history', () => {
    const r = buildMigration(storage);
    expect(r.habits.every((h) => h.createdAt.startsWith('2026-08-23'))).toBe(true);
  });

  it('gives completions a stable habitId|date id, so re-running cannot duplicate them', () => {
    const r = buildMigration(storage);
    const ids = r.completions.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^hab_.+\|\d{4}-\d{2}-\d{2}$/);
  });
});

describe('weekly goals — the lossy case', () => {
  it('creates one goal per week the goal appeared in, without merging', () => {
    const r = buildMigration(storage);
    const runs = r.goals.filter((g) => g.title === 'Run three times');
    expect(runs).toHaveLength(2); // appeared in both weeks, kept separate
    expect(r.goals).toHaveLength(3);
  });

  it('reports duplicates so the user can merge them by hand', () => {
    const r = buildMigration(storage);
    expect(r.report.possibleDuplicateGoals).toEqual([{ title: 'Run three times', count: 2 }]);
    expect(r.report.notes.join(' ')).toContain('rather than guessing');
  });

  it('carries the done state onto a milestone', () => {
    const r = buildMigration(storage);
    const done = r.goals.find((g) => g.title === 'Run three times' && g.archivedAt);
    expect(done).toBeDefined();
    const ms = r.milestones.filter((m) => m.goalId === done!.id);
    expect(ms).toHaveLength(1);
    expect(ms[0]!.done).toBe(true);
  });
});

describe('reviews and name', () => {
  it('keeps a v1 conclusion, labelled as legacy', () => {
    const r = buildMigration(storage);
    const week = r.weeks.find((w) => w.weekStart === '2026-08-23')!;
    expect(week.review?.source).toBe('legacy');
    expect(week.review?.wentWell).toContain('invoice finally went out');
    // The other three sections did not exist in v1 and are not invented.
    expect(week.review?.pattern).toBe('');
    expect(r.report.reviewsImported).toBe(1);
  });

  it('imports the user name', () => {
    expect(buildMigration(storage).name).toBe('Yarin');
  });
});

describe('robustness', () => {
  it('treats corrupt JSON as absent rather than crashing', () => {
    storage.setItem(V1_KEYS.weeks, '{not json');
    const parsed = readV1(storage);
    expect(parsed.weeks).toBeNull();
    expect(() => buildMigration(storage)).not.toThrow();
  });

  it('ignores week keys that are not real dates', () => {
    storage.setItem(
      V1_KEYS.weeks,
      JSON.stringify({
        '2026-13-45': { tasks: [{ title: 'Impossible', day: 'Mon' }] },
        'not-a-date': { tasks: [{ title: 'Also impossible', day: 'Mon' }] },
        '2026-08-23': { tasks: [{ title: 'Real', day: 'Mon', category: 'Work' }] },
      }),
    );
    const r = buildMigration(storage);
    expect(r.report.weeksFound).toBe(1);
    expect(r.tasks.map((t) => t.title)).toEqual(['Real']);
  });

  it('does nothing at all when there is no v1 data', () => {
    const r = buildMigration(makeStorage());
    expect(r.ran).toBe(false);
    expect(r.tasks).toHaveLength(0);
    expect(r.habits).toHaveLength(0);
  });

  it('handles a v1 install with templates but no week history', () => {
    const only = makeStorage({ [V1_KEYS.templates]: JSON.stringify(V1_TEMPLATES) });
    const r = buildMigration(only);
    expect(r.ran).toBe(true);
    expect(r.habits).toHaveLength(2);
    expect(r.completions).toHaveLength(0);
  });
});
