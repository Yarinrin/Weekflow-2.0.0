# The review relay

WeekFlow never holds an Anthropic API key. A key in a web bundle is visible in the
network tab; a key in an APK survives `unzip`. There is no client-side mitigation —
obfuscation, string-splitting and `localStorage` are all trivially defeated — so the app
is built so that it has nothing worth stealing.

The relay is a small endpoint **you** deploy. It holds the key as a server secret,
receives an aggregate summary, and returns four short pieces of prose.

It is entirely optional. With no relay configured, WeekFlow writes the review on-device
(`src/services/review.ts`, `generateLocalReview`) and works with the radio off.

## What the app sends

Exactly the `ReviewSummary` type in `src/services/review.ts`, and nothing else:

```json
{
  "version": 2,
  "summary": {
    "completionPct": 67, "planned": 20, "done": 13, "remaining": 7,
    "importantPlanned": 4, "importantDone": 3,
    "byDay": [{ "day": "Sunday", "planned": 2, "done": 2 }],
    "byArea": [{ "area": "Work", "planned": 6, "done": 4 }],
    "habitTarget": 22, "habitDone": 14, "habitPct": 64,
    "previousWeekPct": 74, "averagePct": 71
  }
}
```

**No task titles. No notes. No goal names. No user name. No dates.** Only counts,
percentages, day names and the five fixed area labels. An intercepted request reveals
almost nothing about the person, which is the point of the boundary.

## What it must return

```json
{
  "wentWell": "…",
  "gotInTheWay": "…",
  "pattern": "…",
  "nextFocus": "…"
}
```

Any missing field is rendered as absent rather than faked. If all four are empty, the
app treats it as a failure and falls back to the on-device review.

## Reference implementation — Cloudflare Worker

```js
// wrangler secret put ANTHROPIC_API_KEY
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const { summary } = await request.json();
    if (!summary || typeof summary.completionPct !== 'number') {
      return new Response('Bad request', { status: 400 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,   // server-side only, never shipped
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        system:
          'You write a weekly reflection for a personal planning app. You are given only ' +
          'aggregate numbers — you do not know what the tasks were, and you must not invent ' +
          'them. Be specific about the numbers, concise, and non-judgemental. No motivational ' +
          'filler, no exclamation marks, no praise the data does not support. British English. ' +
          'Reply with JSON only: {"wentWell","gotInTheWay","pattern","nextFocus"}. ' +
          'Two or three sentences each. "nextFocus" must be one concrete change, not advice.',
        messages: [{ role: 'user', content: JSON.stringify(summary) }],
      }),
    });

    if (!res.ok) return new Response('Upstream error', { status: 502 });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '{}';
    // The model is asked for bare JSON; strip a code fence if it adds one anyway.
    const json = text.replace(/^```(?:json)?\s*|\s*```$/g, '');

    let parsed;
    try { parsed = JSON.parse(json); } catch { return new Response('Unparseable', { status: 502 }); }

    return new Response(
      JSON.stringify({
        wentWell: String(parsed.wentWell ?? ''),
        gotInTheWay: String(parsed.gotInTheWay ?? ''),
        pattern: String(parsed.pattern ?? ''),
        nextFocus: String(parsed.nextFocus ?? ''),
      }),
      { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } },
    );
  },
};
```

Add rate limiting before this is public — a Durable Object or KV counter keyed by IP is
enough. Reviews are weekly, so a handful of requests per address per day is generous.

## Connecting it

Settings → Weekly review → **Via a relay**, then paste the URL. If the relay is
unreachable the app writes the review on-device and says so, rather than failing.

## If the WeekFlow 1.0 app called Anthropic from the browser

Then that key was readable by anyone who opened the network tab, and it should be
**revoked and rotated** — treat it as public. Nothing in WeekFlow 2.0 will ask you to
paste a key into the app, and there is no field to put one in.
