/**
 * The weekly review. Four sections written from real numbers, not a generic
 * "generate" button attached to a blob of motivational text.
 */
import { useState } from 'react';
import { Section } from '@/ui/components';
import { SparkIcon } from '@/ui/Icons';
import { weeklyTrend } from '@/domain/stats';
import { generateReview } from '@/services/review';
import type { DateKey, WeekStats } from '@/domain/types';
import { useStore } from '@/store/store';

const SECTIONS = [
  ['wentWell', 'What went well'],
  ['gotInTheWay', 'What got in the way'],
  ['pattern', 'A pattern we noticed'],
  ['nextFocus', 'Next week’s focus'],
] as const;

export function ReviewPanel({ weekStart, stats }: { weekStart: DateKey; stats: WeekStats }) {
  const store = useStore();
  const { settings, today } = store;
  const week = store.weeks.find((w) => w.weekStart === weekStart);
  const review = week?.review;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const trend = weeklyTrend(today, store.tasks, 8, settings.weekStartsOn);
    const priors = trend.slice(0, -1).filter((w) => w.planned > 0);
    const previousWeekPct = priors.length ? priors[priors.length - 1]!.pct : null;
    const averagePct = priors.length
      ? Math.round(priors.reduce((n, w) => n + w.pct, 0) / priors.length)
      : null;

    const { review: next, notice: why } = await generateReview(stats, settings, {
      previousWeekPct,
      averagePct,
    });
    await store.setReview(weekStart, next);
    if (why) setNotice(why);
    setBusy(false);
  };

  if (!review) {
    return (
      <Section title="Weekly review">
        <div className="card card--tint" data-area="Learning">
          <p className="display d2">Look back on the week.</p>
          <p className="body" style={{ marginTop: 'var(--sp-4)' }}>
            {stats.doneTotal} of {stats.plannedTotal} tasks and {stats.habitDone} habit days are on
            the record. WeekFlow will read them and tell you what it noticed — what went well, what
            got in the way, and one thing to change.
          </p>
          <button type="button" className="btn" style={{ marginTop: 'var(--sp-7)' }} onClick={run} disabled={busy}>
            <SparkIcon style={{ width: 15, height: 15, verticalAlign: '-2px', marginRight: 6 }} />
            {busy ? 'Reading your week…' : 'Write my review'}
          </button>
          <p className="meta" style={{ marginTop: 'var(--sp-5)', lineHeight: 1.5 }}>
            {settings.ai.mode === 'relay' && settings.ai.relayUrl
              ? 'Only totals and percentages leave your phone. Task titles, notes and your name never do.'
              : 'Written entirely on your phone. Nothing leaves the device.'}
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Weekly review"
      aside={review.source === 'ai' ? 'AI' : review.source === 'legacy' ? 'from WeekFlow 1.0' : 'on-device'}
    >
      <div className="card card--tint" data-area="Learning">
        {notice && (
          <p
            className="body"
            style={{ marginBottom: 'var(--sp-7)', color: 'var(--attention)' }}
            role="status"
          >
            {notice}
          </p>
        )}

        {review.source === 'legacy' ? (
          <>
            <p className="label">Your note from this week</p>
            <p className="body" style={{ marginTop: 'var(--sp-4)', color: 'var(--ink)' }}>
              {review.wentWell}
            </p>
            <p className="meta" style={{ marginTop: 'var(--sp-7)', lineHeight: 1.5 }}>
              WeekFlow 1.0 saved reviews as a single note, so this one has no sections. New
              reviews will.
            </p>
          </>
        ) : (
          SECTIONS.map(([key, label]) =>
            review[key] ? (
              <div key={key} className="reviewSection">
                <h3 className="label">{label}</h3>
                <p className="body" style={{ marginTop: 7, color: 'var(--ink)' }}>
                  {review[key]}
                </p>
              </div>
            ) : null,
          )
        )}

        <button
          type="button"
          className="btn btn--ghost"
          style={{ marginTop: 'var(--sp-9)' }}
          onClick={run}
          disabled={busy}
        >
          {busy ? 'Rewriting…' : 'Write it again'}
        </button>
      </div>
    </Section>
  );
}
