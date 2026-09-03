import { describe, expect, it } from 'vitest';
import { buildSummary, generateLocalReview, generateReview } from './review';
import { computeWeekStats } from '@/domain/stats';
import { DEFAULT_SETTINGS } from '@/domain/types';
import type { Area, Settings, Task, WeekStats } from '@/domain/types';

const WEEK_START = '2026-08-30';
const TODAY = '2026-09-03';

let n = 0;
const task = (date: string, done: boolean, area: Area = 'Work', important = false): Task => ({
  id: `t${n++}`,
  title: `Task ${n}`,
  area,
  date,
  important,
  done,
  createdAt: '2026-08-01T00:00:00.000Z',
});

const statsFor = (tasks: Task[]): WeekStats =>
  computeWeekStats(WEEK_START, TODAY, tasks, [], []);

const summaryFor = (tasks: Task[], prev: number | null = null, avg: number | null = null) =>
  buildSummary(statsFor(tasks), prev, avg);

describe('buildSummary — the privacy boundary', () => {
  it('carries counts and percentages only, never any content', () => {
    const tasks = [
      task('2026-09-01', true, 'Work', true),
      task('2026-09-02', false, 'Health'),
    ];
    const summary = summaryFor(tasks, 74, 71);
    const serialised = JSON.stringify(summary);

    // The one thing this must never leak: what the tasks actually were.
    expect(serialised).not.toContain('Task');
    for (const t of tasks) expect(serialised).not.toContain(t.title);

    // Only day names and the five fixed area labels are carried.
    expect(summary.byDay.map((d) => d.day)).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    expect(summary.byArea.every((a) => ['Work', 'Health', 'Learning', 'Personal', 'Other'].includes(a.area))).toBe(true);

    // Every remaining value is a number or null.
    const scalars = [
      summary.completionPct, summary.planned, summary.done, summary.remaining,
      summary.importantPlanned, summary.importantDone,
      summary.habitTarget, summary.habitDone, summary.habitPct,
    ];
    expect(scalars.every((v) => typeof v === 'number')).toBe(true);
    expect(summary.previousWeekPct).toBe(74);
    expect(summary.averagePct).toBe(71);
  });

  it('carries no dates at all — a week is described, not located', () => {
    const serialised = JSON.stringify(summaryFor([task('2026-09-01', true)]));
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('generateLocalReview', () => {
  const review = (tasks: Task[], prev: number | null = null, avg: number | null = null) =>
    generateLocalReview(summaryFor(tasks, prev, avg), statsFor(tasks));

  it('fills all four sections, always', () => {
    for (const tasks of [
      [] as Task[],
      [task('2026-09-01', true)],
      [task('2026-09-01', false), task('2026-09-02', false)],
      Array.from({ length: 9 }, (_, i) => task('2026-09-03', i < 2, 'Work', i < 4)),
    ]) {
      const r = review(tasks);
      for (const section of [r.wentWell, r.gotInTheWay, r.pattern, r.nextFocus]) {
        expect(section.trim().length).toBeGreaterThan(10);
      }
      expect(r.source).toBe('local');
    }
  });

  it('is honest about a week where nothing was finished, without scolding', () => {
    const r = review([task('2026-09-01', false), task('2026-09-02', false)]);
    expect(r.wentWell).toContain('nothing was pretended');
    // No praise the data does not support.
    expect(r.wentWell).not.toMatch(/great|amazing|well done|fantastic/i);
  });

  it('reports the real numbers rather than rounding them into a mood', () => {
    const tasks = [
      task('2026-08-30', true),
      task('2026-08-31', true),
      task('2026-09-01', true),
      task('2026-09-02', false),
    ];
    const r = review(tasks);
    expect(r.wentWell).toContain('3 tasks');
    expect(r.wentWell).toContain('of the 4 you planned');
    expect(r.gotInTheWay).toContain('1 task did not get done');
  });

  it('singularises counts properly', () => {
    const r = review([task('2026-09-01', true), task('2026-09-02', false)]);
    expect(r.wentWell).toContain('1 task ');
    expect(r.gotInTheWay).toContain('1 task did not get done');
    expect(r.gotInTheWay).not.toContain('1 tasks');
  });

  it('names an overloaded day in what got in the way', () => {
    const tasks = [...Array.from({ length: 6 }, () => task('2026-09-03', false)), task('2026-08-31', true)];
    const r = review(tasks);
    expect(r.gotInTheWay).toContain('Thursday');
    expect(r.nextFocus).toContain('Thursday');
  });

  it('compares against the recent average when there is one', () => {
    const tasks = [task('2026-09-01', true), task('2026-09-02', true)];
    expect(review(tasks, 60, 55).pattern).toContain('above your recent average');
    const weak = [task('2026-09-01', false), task('2026-09-02', false), task('2026-09-03', false)];
    expect(review(weak, 80, 85).pattern).toContain('below your recent average');
  });

  it('admits when there is not enough history for a pattern', () => {
    expect(review([task('2026-09-01', true)]).pattern).toContain('Not enough weeks');
  });

  it('gives one concrete next step, not advice', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task('2026-09-01', i < 2));
    const r = review(tasks);
    expect(r.nextFocus).toContain('Plan fewer tasks');
    expect(r.nextFocus).not.toMatch(/you should try|remember to|stay positive/i);
  });

  it('says to keep the shape of a week that worked', () => {
    const tasks = [task('2026-08-31', true), task('2026-09-01', true), task('2026-09-02', true)];
    expect(review(tasks).nextFocus).toContain('Keep the shape');
  });

  it('snapshots the stats onto the review so it stays explicable later', () => {
    const tasks = [task('2026-09-01', true)];
    expect(review(tasks).stats?.weekStart).toBe(WEEK_START);
  });
});

describe('generateReview — routing and fallback', () => {
  const tasks = [task('2026-09-01', true), task('2026-09-02', false)];
  const settings = (over: Partial<Settings['ai']>): Settings => ({
    ...DEFAULT_SETTINGS,
    ai: { ...DEFAULT_SETTINGS.ai, ...over },
  });
  const ctx = { previousWeekPct: null, averagePct: null };

  it('writes on-device when that is the mode, and never touches the network', async () => {
    const fetchSpy = () => {
      throw new Error('fetch must not be called in local mode');
    };
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const { review, notice } = await generateReview(
        statsFor(tasks),
        settings({ mode: 'local' }),
        ctx,
      );
      expect(review.source).toBe('local');
      expect(notice).toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('stays local when relay mode is set but no URL is configured', async () => {
    const { review } = await generateReview(statsFor(tasks), settings({ mode: 'relay' }), ctx);
    expect(review.source).toBe('local');
  });

  it('uses the relay when it answers, and keeps the stats snapshot', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          wentWell: 'Relay went well',
          gotInTheWay: 'Relay obstacle',
          pattern: 'Relay pattern',
          nextFocus: 'Relay focus',
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    try {
      const { review, notice } = await generateReview(
        statsFor(tasks),
        settings({ mode: 'relay', relayUrl: 'https://relay.example/review' }),
        ctx,
      );
      expect(review.source).toBe('ai');
      expect(review.wentWell).toBe('Relay went well');
      expect(review.stats?.weekStart).toBe(WEEK_START);
      expect(notice).toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('falls back to the local review, with a reason, when the relay is unreachable', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    try {
      const { review, notice } = await generateReview(
        statsFor(tasks),
        settings({ mode: 'relay', relayUrl: 'https://relay.example/review' }),
        ctx,
      );
      // The user is never left without a review.
      expect(review.source).toBe('local');
      expect(review.wentWell.length).toBeGreaterThan(10);
      expect(notice).toContain('could not reach');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('falls back when the relay answers with an error status', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    try {
      const { review, notice } = await generateReview(
        statsFor(tasks),
        settings({ mode: 'relay', relayUrl: 'https://relay.example/review' }),
        ctx,
      );
      expect(review.source).toBe('local');
      expect(notice).toContain('500');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('falls back when the relay returns four empty strings', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ wentWell: '', gotInTheWay: '', pattern: '', nextFocus: '' }), {
        status: 200,
      })) as unknown as typeof fetch;
    try {
      const { review, notice } = await generateReview(
        statsFor(tasks),
        settings({ mode: 'relay', relayUrl: 'https://relay.example/review' }),
        ctx,
      );
      expect(review.source).toBe('local');
      expect(notice).toContain('empty');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('falls back when the relay sends unparseable JSON', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('<html>oops', { status: 200 })) as unknown as typeof fetch;
    try {
      const { review, notice } = await generateReview(
        statsFor(tasks),
        settings({ mode: 'relay', relayUrl: 'https://relay.example/review' }),
        ctx,
      );
      expect(review.source).toBe('local');
      expect(notice).toContain('could not read');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('sends only the summary envelope, and no key of any kind', async () => {
    const original = globalThis.fetch;
    let sentBody = '';
    let sentHeaders: Record<string, string> = {};
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      sentHeaders = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ wentWell: 'ok' }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await generateReview(
        statsFor(tasks),
        settings({ mode: 'relay', relayUrl: 'https://relay.example/review' }),
        ctx,
      );
      const parsed = JSON.parse(sentBody);
      expect(Object.keys(parsed).sort()).toEqual(['summary', 'version']);
      // No authorization of any kind leaves the device.
      const headerNames = Object.keys(sentHeaders).map((h) => h.toLowerCase());
      expect(headerNames).not.toContain('authorization');
      expect(headerNames).not.toContain('x-api-key');
      expect(sentBody).not.toMatch(/sk-ant|api[-_]?key/i);
    } finally {
      globalThis.fetch = original;
    }
  });
});
