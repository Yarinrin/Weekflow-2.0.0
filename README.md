# WeekFlow 2.0

WeekFlow helps you make sense of your week — what you need to do, what you're working
toward, how consistently you're showing up, and what to improve next.

Local-first: everything lives on the device. No account, no sync, no analytics. The app
works with the network switched off.

```
GOAL            months        what I'm working toward
 └─ MILESTONE   weeks         how it breaks down
     ├─ TASK    a day         a thing I do once
     └─ HABIT   ongoing       a thing I do repeatedly
                  ↓
                WEEK          the planning surface it all lands on
                  ↓
              INSIGHTS  →  REVIEW
```

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 50 unit tests
npm run build        # production web bundle
```

## Building the Android APK

**The APK cannot be built inside this repo's Claude Code sandbox** — the network policy
blocks `dl.google.com`, which is where the Android Gradle Plugin and the SDK come from.
Two ways to get one:

**In CI (recommended).** Push to `main` or any `claude/**` branch and
`.github/workflows/android.yml` builds a debug APK, attaching it to the run under
**Artifacts → weekflow-debug-apk**. Run the workflow manually with `release: true` for
an unsigned release build.

**Locally.** With Android Studio (or the SDK command-line tools) and JDK 21 installed:

```bash
npm run android:apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

To install on a phone: enable USB debugging, then `adb install -r <path-to-apk>`.

For a Play Store build you need a signing key. Generate one with `keytool`, add it to
`android/app/build.gradle` as a `signingConfig`, and keep the keystore out of the repo.

## Layout

```
src/domain/      Pure logic — dates, habit scheduling, statistics, insights. Unit tested.
src/data/        Dexie repository and the WeekFlow 1.0 migration.
src/store/       Application state; optimistic writes that roll back on storage failure.
src/ui/          Shared components, icons, sheets.
src/screens/     Home, Week, Goals, Goal detail, Habit detail, Review, Settings.
src/services/    Weekly review generation and local notifications.
docs/            Inspection findings, product architecture, design system.
design/previews/ The three design directions the visual language was chosen from.
server/          Reference implementation of the optional review relay.
```

## Two things worth knowing

**Dates are local calendar days, never instants.** Everything is a `YYYY-MM-DD` string
parsed through `fromKey`, because `new Date('2026-09-03')` is UTC midnight — the
previous day everywhere west of Greenwich. A task on the 3rd stays on the 3rd.

**The app holds no API key.** A key shipped in a web bundle is in the network tab; a key
shipped in an APK survives `unzip`. Weekly reviews are written on-device by default, with
an optional relay you deploy yourself that receives aggregate counts only — never task
titles, notes, or your name. See [`server/relay.md`](server/relay.md).

## Upgrading from WeekFlow 1.0

The migration runs once, on first launch, and **never deletes the old data**. Before
anything is transformed it writes a verbatim copy of `wf-clean-v2`, `wf-templates-v1` and
`wf-name` to `wf2-legacy-backup`; the originals stay where they are.

Recurring-task templates become real habits, and past completions are recovered from the
ticked instances so streaks and consistency reflect your actual history. The one lossy
case is old weekly goals — the same text in eight weeks might be one recurring goal or
eight separate ones, and string-matching them would silently merge things you meant to
keep apart, so each becomes a week-scoped goal and the app tells you which ones repeated
and offers to merge them by hand.

The full mapping is in [`docs/01-product-architecture.md`](docs/01-product-architecture.md) §6.

## What changed from 1.0

| 1.0 | 2.0 |
| --- | --- |
| Recurring tasks materialised into per-week rows | Real habits with dated completions, streaks, consistency |
| Weekly goals — a per-week checklist | Goals with milestones, deadlines, and linked tasks and habits |
| Analytics screen | Insights written as sentences, charts as supporting evidence |
| A one-paragraph AI conclusion | A four-part review from real numbers, on-device by default |
| Table view (categories × days) | **Removed** — see below |
| Dark UI | Light-first, with a full dark palette |
| No settings, no reminders | Settings, local reminders, JSON export |

The **Table view** is the one deliberate removal. A 5×7 grid on a 390px screen gives 55px
cells that cannot hold a task title. What the table was *for* — spotting imbalance across
days and categories — moved to the per-day load bars on the Week screen and the
breakdowns in Insights.
