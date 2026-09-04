import { describe, expect, it } from 'vitest';
import { ImportError, parseImport, V1_EXPORT_FORMAT } from './importer';

/** Exactly what the console snippet in docs/03 writes. */
const v1Bundle = (over: Record<string, unknown> = {}) => ({
  format: V1_EXPORT_FORMAT,
  exportedAt: '2026-09-03T12:00:00.000Z',
  'wf-clean-v2': JSON.stringify({
    '2026-08-23': {
      tasks: [
        { id: 'a1', title: 'Ship the invoice', category: 'Work', day: 'Mon', important: true, done: true },
        { id: 'a2', title: 'Morning run', category: 'Health', day: 'Mon', done: true, templateId: 't1' },
        { id: 'a3', title: 'Morning run', category: 'Health', day: 'Tue', done: false, templateId: 't1' },
      ],
      goals: [{ id: 'g1', text: 'Run three times', done: true }],
      conclusion: 'Busy week.',
    },
  }),
  'wf-templates-v1': JSON.stringify([
    { id: 't1', title: 'Morning run', category: 'Health', recur: 'daily' },
  ]),
  'wf-name': 'Yarin',
  ...over,
});

const v2Export = (over: Record<string, unknown> = {}) => ({
  format: 'weekflow-export',
  version: 2,
  settings: { name: 'Yarin' },
  tasks: [
    {
      id: 't1',
      title: 'Finish the case study',
      area: 'Work',
      date: '2026-09-03',
      important: false,
      done: false,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  habits: [
    {
      id: 'h1',
      name: 'Morning run',
      area: 'Health',
      schedule: { type: 'daily' },
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  completions: [
    { id: 'h1|2026-09-02', habitId: 'h1', date: '2026-09-02', completedAt: '2026-09-02T09:00:00.000Z' },
  ],
  goals: [
    { id: 'g1', title: 'Build the portfolio', area: 'Work', progressMode: 'milestones', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  milestones: [{ id: 'm1', goalId: 'g1', title: 'Pick projects', done: true, order: 0 }],
  weeks: [{ weekStart: '2026-08-30', intention: 'Fewer things, finished.' }],
  ...over,
});

describe('v1 bundles', () => {
  it('runs the same migration as the automatic path', () => {
    const out = parseImport(JSON.stringify(v1Bundle()));
    expect(out.source).toBe('v1');
    expect(out.name).toBe('Yarin');

    // One real task; the materialised run instances are not imported as tasks.
    expect(out.data.tasks.map((t) => t.title)).toEqual(['Ship the invoice']);
    expect(out.data.tasks[0]!.date).toBe('2026-08-24'); // Monday of that week

    // The ticked instance became a habit completion; the unticked one did not.
    expect(out.data.habits.map((h) => h.name)).toEqual(['Morning run']);
    expect(out.data.completions.map((c) => c.date)).toEqual(['2026-08-24']);

    expect(out.report).toBeDefined();
    // Counts of one read as singulars, everywhere the user sees them.
    expect(out.summary).toBe('1 week, 1 task, 1 habit and 1 goal from WeekFlow 1.0.');
    expect(out.report!.notes.join(' ')).toContain('became a habit');
    expect(out.report!.notes.join(' ')).toContain('review was kept');
    // No backup is written when importing a file — only the automatic path does that.
    expect(out.report!.notes.join(' ')).not.toContain('backup');
  });

  it('is recognised without the format field, by its keys alone', () => {
    const bundle = v1Bundle();
    delete (bundle as Record<string, unknown>).format;
    expect(parseImport(JSON.stringify(bundle)).source).toBe('v1');
  });

  it('honours the week-start setting when re-anchoring weeks', () => {
    const sunday = parseImport(JSON.stringify(v1Bundle()), 0);
    const monday = parseImport(JSON.stringify(v1Bundle()), 1);
    expect(sunday.data.weeks[0]!.weekStart).toBe('2026-08-23');
    expect(monday.data.weeks[0]!.weekStart).toBe('2026-08-17');
  });

  it('refuses a file with none of the three keys, and says why', () => {
    expect(() => parseImport(JSON.stringify({ format: V1_EXPORT_FORMAT }))).toThrow(ImportError);
    try {
      parseImport(JSON.stringify({ format: V1_EXPORT_FORMAT }));
    } catch (err) {
      expect((err as Error).message).toContain('none of the three');
    }
  });

  it('survives a corrupt inner payload rather than throwing', () => {
    const out = parseImport(JSON.stringify(v1Bundle({ 'wf-clean-v2': '{not json' })));
    // Templates still import even when the week history is unreadable.
    expect(out.data.habits).toHaveLength(1);
    expect(out.data.tasks).toHaveLength(0);
  });
});

describe('v2 exports', () => {
  it('round-trips a healthy export', () => {
    const out = parseImport(JSON.stringify(v2Export()));
    expect(out.source).toBe('v2');
    expect(out.name).toBe('Yarin');
    expect(out.data.tasks).toHaveLength(1);
    expect(out.data.habits).toHaveLength(1);
    expect(out.data.completions).toHaveLength(1);
    expect(out.data.milestones).toHaveLength(1);
    expect(out.summary).toBe('1 task, 1 habit, 1 goal and 1 week.');
  });

  it('drops records that are structurally wrong, and counts them', () => {
    const out = parseImport(
      JSON.stringify(
        v2Export({
          tasks: [
            { id: 't1', title: 'Good', area: 'Work', date: '2026-09-03', done: false, createdAt: 'x' },
            { id: 't2', title: 'Bad date', area: 'Work', date: '2026-13-45', done: false },
            { id: 't3', title: 'Bad area', area: 'Nonsense', date: '2026-09-03', done: false },
            { title: 'No id', area: 'Work', date: '2026-09-03', done: false },
          ],
        }),
      ),
    );
    expect(out.data.tasks.map((t) => t.title)).toEqual(['Good']);
    expect(out.summary).toContain('3 unreadable records skipped');
  });

  it('drops completions whose habit is missing, and rebuilds the composite key', () => {
    const out = parseImport(
      JSON.stringify(
        v2Export({
          completions: [
            { id: 'WRONG', habitId: 'h1', date: '2026-09-02', completedAt: 'x' },
            { id: 'x', habitId: 'ghost', date: '2026-09-02', completedAt: 'x' },
          ],
        }),
      ),
    );
    expect(out.data.completions).toHaveLength(1);
    // The id is derived, never trusted from the file.
    expect(out.data.completions[0]!.id).toBe('h1|2026-09-02');
  });

  it('drops milestones orphaned from their goal', () => {
    const out = parseImport(
      JSON.stringify(
        v2Export({ milestones: [{ id: 'm1', goalId: 'ghost', title: 'Orphan', done: false, order: 0 }] }),
      ),
    );
    expect(out.data.milestones).toHaveLength(0);
  });

  it('unlinks a task pointing at a goal that did not come across', () => {
    const out = parseImport(
      JSON.stringify(
        v2Export({
          tasks: [
            {
              id: 't1',
              title: 'Orphan link',
              area: 'Work',
              date: '2026-09-03',
              done: false,
              createdAt: 'x',
              goalId: 'ghost',
            },
          ],
        }),
      ),
    );
    expect(out.data.tasks).toHaveLength(1);
    expect(out.data.tasks[0]!.goalId).toBeUndefined();
  });

  it('refuses an export with nothing in it', () => {
    expect(() =>
      parseImport(
        JSON.stringify(v2Export({ tasks: [], habits: [], goals: [], weeks: [], milestones: [], completions: [] })),
      ),
    ).toThrow(/empty/);
  });
});

describe('bad input', () => {
  it('rejects non-JSON with a sentence a person can act on', () => {
    try {
      parseImport('not json at all');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
      expect((err as Error).message).toContain('not readable JSON');
    }
  });

  it('rejects JSON that is not a WeekFlow export', () => {
    expect(() => parseImport(JSON.stringify({ hello: 'world' }))).toThrow(/not a WeekFlow export/);
  });

  it('rejects a JSON array', () => {
    expect(() => parseImport('[1,2,3]')).toThrow(ImportError);
  });

  it('rejects JSON null', () => {
    expect(() => parseImport('null')).toThrow(ImportError);
  });
});
