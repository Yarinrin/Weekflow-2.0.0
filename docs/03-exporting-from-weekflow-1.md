# Getting your data out of WeekFlow 1.0

## The thing to understand first

WeekFlow 1.0 keeps everything in `localStorage`, which belongs to **one browser, on one
device, for one origin**. The StackBlitz preview is its own origin. The Android app is a
completely separate sandbox.

So the automatic migration — which reads `localStorage` at launch — only fires if you
open WeekFlow 2.0 *in the same browser where you used 1.0*. On the phone it will find
nothing, because there is nothing there to find.

That is what the export below is for: a file you can hand to the app.

---

## Step 1 — open the running app, not the editor

Open your WeekFlow project on StackBlitz and **open the preview in its own tab** (the
"open in new window" arrow on the preview pane). The data belongs to the preview's
origin, not to the StackBlitz editor page, so the export has to run on the preview.

> **This must be the browser and device you actually use WeekFlow on.** If you use it on
> your phone, the data is on your phone, and exporting from your laptop will produce an
> empty file. See "If you use it on your phone" below.

## Step 2 — run this in the console

With the preview tab focused, open DevTools (`F12`, or `⌥⌘I` on a Mac), go to
**Console**, paste this, and press Enter:

```js
(() => {
  const KEYS = ['wf-clean-v2', 'wf-templates-v1', 'wf-name'];
  const found = KEYS.filter((k) => localStorage.getItem(k) !== null);
  if (found.length === 0) {
    console.error(
      'No WeekFlow data on this page. You are probably on the editor rather than the ' +
      'preview, or on a different device from the one you use WeekFlow on.',
    );
    return;
  }
  const bundle = { format: 'weekflow-v1-export', exportedAt: new Date().toISOString() };
  for (const k of KEYS) bundle[k] = localStorage.getItem(k);

  const weeks = JSON.parse(bundle['wf-clean-v2'] || '{}');
  console.log(
    `Found ${found.length} of 3 keys · ${Object.keys(weeks).length} weeks of history · ` +
    `name: ${bundle['wf-name'] || '(not set)'}`,
  );

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'weekflow-v1-export.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
})();
```

It prints what it found and downloads **`weekflow-v1-export.json`**.

If the download is blocked (some embedded previews block it), run this instead and the
whole bundle goes to your clipboard — then paste it into a text file:

```js
copy(JSON.stringify(
  Object.assign(
    { format: 'weekflow-v1-export', exportedAt: new Date().toISOString() },
    Object.fromEntries(
      ['wf-clean-v2', 'wf-templates-v1', 'wf-name'].map((k) => [k, localStorage.getItem(k)]),
    ),
  ),
  null,
  2,
));
```

## Step 3 — import it

**In the app:** Settings → *Your data* → **Import from a file** → pick the JSON.

It shows you what it found — weeks, tasks, habits recovered from recurring tasks, goals,
and any notes about the lossy cases — and waits for you to confirm before writing
anything. Nothing is imported until you press the button.

---

## If you use WeekFlow on your phone

Then the data is in your phone's browser and the desktop console is no help. Two options:

**Remote debugging (reliable).** Plug the phone into a computer via USB, enable USB
debugging on the phone, open `chrome://inspect` on the computer, click *inspect* under
the WeekFlow tab, and run the Step 2 snippet in that console.

**Email it to yourself (no cable).** On the phone, open WeekFlow, then paste the
clipboard snippet into a browser that has a console. Most mobile browsers do not have
one — so realistically, use remote debugging, or just accept starting fresh on the phone
and keep 1.0's history in the browser where it already lives.

---

## What the file contains

Exactly the three keys, verbatim:

| Key | What it is |
| --- | --- |
| `wf-clean-v2` | Every week: tasks, weekly goals, the AI conclusion |
| `wf-templates-v1` | Recurring task templates → become habits |
| `wf-name` | Your name |

Nothing is transformed on the way out — it is a byte-for-byte copy, so the import runs
through exactly the same tested migration as the automatic path.

**It contains your real task and goal titles.** It is a normal file on your device;
treat it like any other personal document. It is never uploaded anywhere by the app.

---

## What the import does with it

Documented in full in [`01-product-architecture.md`](01-product-architecture.md) §6, and
covered by 22 tests in `src/data/migrate.test.ts`. In short:

- Day-of-week (`"Mon"`) becomes an absolute date, using the week key it sat under.
- Recurring templates become habits, and **past completions are recovered** from the
  ticked instances, so streaks and consistency reflect your real history.
- Materialised recurring rows are *not* imported as tasks — they were a rendering of a
  template, not data.
- Weekly goals become one goal per week they appeared in. The same text in eight weeks
  might be one recurring goal or eight separate ones, and guessing would silently merge
  things you meant to keep apart — so the import keeps them separate and tells you which
  ones repeated, for you to merge by hand.
- An old one-paragraph review is kept as written, labelled as a legacy note rather than
  padded out into four fake sections.
- Anything unreadable is skipped and counted, never silently dropped.

Your WeekFlow 1.0 data is not touched by any of this. The keys stay exactly where they
are, in the browser where they already live.
