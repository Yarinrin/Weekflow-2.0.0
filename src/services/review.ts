/**
 * Weekly review generation.
 *
 * SECURITY: this app never holds an Anthropic API key. A key shipped in a web bundle is
 * in the network tab; a key shipped in an APK survives `unzip`. There is no client-side
 * mitigation, so the model is:
 *
 *   'local'  — the review is composed on-device from the week's own numbers. No network,
 *              works on a plane, and is the default.
 *   'relay'  — the app POSTs an *aggregate summary* to a small serverless endpoint the
 *              user (or we) control, which holds the key as a server secret and returns
 *              prose. See docs/01-product-architecture.md §4 and server/relay.md.
 *
 * What is sent to a relay is defined by `buildSummary` below and contains counts and
 * percentages only — never task titles, notes, goal names, or the user's name. That is
 * a deliberate limit: it is enough for a useful review and it means an intercepted
 * request reveals almost nothing.
 */
import { DAY_NAMES } from '@/domain/dates';
import type { Review, Settings, WeekStats } from '@/domain/types';

export interface ReviewSummary {
  completionPct: number;
  planned: number;
  done: number;
  remaining: number;
  importantPlanned: number;
  importantDone: number;
  byDay: { day: string; planned: number; done: number }[];
  byArea: { area: string; planned: number; done: number }[];
  habitTarget: number;
  habitDone: number;
  habitPct: number;
  previousWeekPct: number | null;
  averagePct: number | null;
}

export function buildSummary(
  stats: WeekStats,
  previousWeekPct: number | null,
  averagePct: number | null,
): ReviewSummary {
  return {
    completionPct: stats.pctToDate,
    planned: stats.plannedTotal,
    done: stats.doneTotal,
    remaining: stats.remaining,
    importantPlanned: stats.importantPlanned,
    importantDone: stats.importantDone,
    byDay: stats.byDay.map((d, i) => ({ day: DAY_NAMES[i] ?? '', planned: d.planned, done: d.done })),
    byArea: stats.byArea.map((a) => ({ area: a.area, planned: a.planned, done: a.done })),
    habitTarget: stats.habitTarget,
    habitDone: stats.habitDone,
    habitPct: stats.habitPct,
    previousWeekPct,
    averagePct,
  };
}

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly canRetry: boolean,
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

/* --------------------------------------------------------------- relay */

async function generateViaRelay(
  summary: ReviewSummary,
  relayUrl: string,
  signal?: AbortSignal,
): Promise<Review> {
  let res: Response;
  try {
    res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, summary }),
      signal: signal ?? null,
    });
  } catch {
    throw new ReviewError(
      'WeekFlow could not reach the review service. Your week is written from your own numbers below instead.',
      true,
    );
  }

  if (res.status === 429) {
    throw new ReviewError('The review service is busy. Try again in a few minutes.', true);
  }
  if (!res.ok) {
    throw new ReviewError(
      `The review service returned an error (${res.status}). Nothing was sent anywhere else.`,
      true,
    );
  }

  let data: Partial<Record<keyof Review, unknown>>;
  try {
    data = (await res.json()) as Partial<Record<keyof Review, unknown>>;
  } catch {
    throw new ReviewError('The review service sent something WeekFlow could not read.', true);
  }

  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const review: Review = {
    generatedAt: new Date().toISOString(),
    source: 'ai',
    wentWell: text(data.wentWell),
    gotInTheWay: text(data.gotInTheWay),
    pattern: text(data.pattern),
    nextFocus: text(data.nextFocus),
  };
  if (!review.wentWell && !review.gotInTheWay && !review.pattern && !review.nextFocus) {
    throw new ReviewError('The review came back empty.', true);
  }
  return review;
}

/* --------------------------------------------------------------- local */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The on-device review. Not AI — a careful reading of the numbers, written to the same
 * brief: honest, specific, non-judgemental, no motivational filler. It is the default,
 * and the fallback whenever the relay is unreachable.
 */
export function generateLocalReview(summary: ReviewSummary, stats: WeekStats): Review {
  const s = summary;
  const busiest = [...s.byDay].sort((a, b) => b.planned - a.planned)[0];
  const bestDay = [...s.byDay]
    .filter((d) => d.planned >= 2)
    .sort((a, b) => b.done / b.planned - a.done / a.planned)[0];
  const topArea = [...s.byArea].sort((a, b) => b.planned - a.planned)[0];
  const untouched = s.byArea.filter((a) => a.done === 0 && a.planned > 0);

  /* went well */
  const wellParts: string[] = [];
  if (s.done > 0) {
    wellParts.push(
      `You finished ${plural(s.done, 'task')} of the ${s.planned} you planned, ${s.completionPct}% of the week.`,
    );
  }
  if (bestDay && bestDay.done === bestDay.planned && bestDay.planned >= 2) {
    wellParts.push(`${bestDay.day} was clean — everything you put on it got done.`);
  }
  if (topArea && topArea.done > 0) {
    wellParts.push(`Most of the movement was in ${topArea.area}, with ${topArea.done} finished.`);
  }
  if (s.habitTarget > 0 && s.habitPct >= 70) {
    wellParts.push(`Habits held at ${s.habitPct}% — ${s.habitDone} of ${s.habitTarget} days.`);
  }
  if (wellParts.length === 0) {
    wellParts.push('A quiet week on paper. Nothing was finished, but nothing was pretended either.');
  }

  /* got in the way */
  const wayParts: string[] = [];
  if (s.remaining > 0) {
    wayParts.push(`${plural(s.remaining, 'task')} did not get done.`);
  }
  const mean = s.planned / 7;
  if (busiest && busiest.planned >= 4 && busiest.planned >= mean * 1.75) {
    wayParts.push(
      `${busiest.day} carried ${busiest.planned} of them, against an average of ${mean.toFixed(1)} a day — that is usually where the overflow starts.`,
    );
  }
  if (untouched.length > 0) {
    wayParts.push(
      `Nothing moved on ${untouched.map((a) => a.area).join(' or ')} at all this week.`,
    );
  }
  if (s.importantPlanned >= 2 && s.importantDone < s.importantPlanned) {
    wayParts.push(
      `${s.importantPlanned - s.importantDone} of your ${s.importantPlanned} important tasks are still open.`,
    );
  }
  if (wayParts.length === 0) {
    wayParts.push('Nothing obvious. You planned what you could do and you did it.');
  }

  /* pattern */
  let pattern: string;
  if (s.averagePct !== null && Math.abs(s.completionPct - s.averagePct) >= 10) {
    pattern =
      s.completionPct > s.averagePct
        ? `This week ran ${s.completionPct - s.averagePct} points above your recent average of ${s.averagePct}%. Worth noticing what was different about it.`
        : `This week ran ${s.averagePct - s.completionPct} points below your recent average of ${s.averagePct}%. One heavy week is not a trend, but two is.`;
  } else if (s.importantPlanned >= 2) {
    const impPct = Math.round((s.importantDone / s.importantPlanned) * 100);
    const restPlanned = s.planned - s.importantPlanned;
    const restPct = restPlanned > 0 ? Math.round(((s.done - s.importantDone) / restPlanned) * 100) : 0;
    pattern =
      impPct >= restPct
        ? `The things you marked important got done at ${impPct}% against ${restPct}% for everything else. The flag is doing real work.`
        : `Important tasks came in at ${impPct}% against ${restPct}% for everything else — the flagged ones are the ones slipping. They may simply be too big to be one task.`;
  } else if (s.habitTarget > 0) {
    pattern = `Habits ran at ${s.habitPct}% while tasks ran at ${s.completionPct}%. ${
      s.habitPct > s.completionPct
        ? 'The repeating things are steadier than the one-offs, which is usually a planning problem rather than a discipline one.'
        : 'The one-off work is holding up better than the repeating work.'
    }`;
  } else {
    pattern = 'Not enough weeks behind you yet for a pattern. A few more and this gets useful.';
  }

  /* next focus */
  const nextParts: string[] = [];
  if (busiest && busiest.planned >= 4 && busiest.planned >= mean * 1.75) {
    nextParts.push(`Move two things off ${busiest.day} before the week starts.`);
  }
  if (untouched.length > 0) {
    nextParts.push(`Put one small ${untouched[0]!.area} task somewhere you will actually see it.`);
  }
  if (s.remaining > 0 && s.remaining <= 3) {
    nextParts.push(`Carry the ${plural(s.remaining, 'unfinished task')} forward rather than re-planning from scratch.`);
  } else if (s.remaining > 3) {
    nextParts.push(`Plan fewer tasks than this week, not more — ${s.planned} was above what got done.`);
  }
  if (s.habitTarget > 0 && s.habitPct < 60) {
    nextParts.push('Pick the one habit that matters most and protect it; let the others float.');
  }
  if (nextParts.length === 0) {
    nextParts.push('Keep the shape of this week. It worked.');
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'local',
    wentWell: wellParts.join(' '),
    gotInTheWay: wayParts.join(' '),
    pattern,
    nextFocus: nextParts.join(' '),
    stats,
  };
}

/* ------------------------------------------------------------ entry point */

/**
 * Generate a review. Falls back to the local writer whenever the relay is unavailable,
 * so this never leaves the user without a review — the fallback is returned along with
 * the reason the relay failed, for the UI to show.
 */
export async function generateReview(
  stats: WeekStats,
  settings: Settings,
  context: { previousWeekPct: number | null; averagePct: number | null },
  signal?: AbortSignal,
): Promise<{ review: Review; notice?: string }> {
  const summary = buildSummary(stats, context.previousWeekPct, context.averagePct);
  const local = generateLocalReview(summary, stats);

  if (!settings.ai.enabled || settings.ai.mode === 'local' || !settings.ai.relayUrl) {
    return { review: local };
  }

  try {
    const review = await generateViaRelay(summary, settings.ai.relayUrl, signal);
    return { review: { ...review, stats } };
  } catch (err) {
    return {
      review: local,
      notice:
        err instanceof ReviewError
          ? err.message
          : 'The review service could not be reached, so this was written from your own numbers.',
    };
  }
}
