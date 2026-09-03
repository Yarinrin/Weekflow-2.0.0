# Phase 2 — WeekFlow 2.0 product & UX architecture

This is the structure all three visual directions are built on. The previews differ in
*look and feel only* — the information architecture is held constant so the design
comparison is a fair one.

---

## 1. The product model

The old app had one noun (task) and one container (week). The new app has three nouns
at different time horizons, and the week is what connects them.

```
GOAL            months          "Learn guitar"          — what I'm working toward
 └─ MILESTONE   weeks           "Learn barre chords"    — how the goal breaks down
     ├─ TASK    a day           "Practice barre chords" — a thing I do once
     └─ HABIT   ongoing         "Practice guitar 4×/wk" — a thing I do repeatedly
                    ↓
                  WEEK          the planning surface everything lands on
                    ↓
                INSIGHTS        what the record says about how I show up
                    ↓
                 REVIEW         what to change next week
```

The single most important structural change: **a task or habit can point at a goal.**
That one edge is what turns four separate tools into one product, and it is what makes
the Insights and Review screens able to say something worth reading — "your Learning
goal received 4 actions this week" is only possible if actions know their goal.

The link is always optional. Most tasks are just tasks, and forcing every errand into a
goal hierarchy is exactly the kind of productivity-system overhead this app should not
have.

### Mapping from the old model

| WeekFlow 1.0 | WeekFlow 2.0 | Note |
| --- | --- | --- |
| Task | Task | Gains `goalId`, `milestoneId`, `notes`, `remindAt`, `carriedFrom`. |
| Recurring template (`recur`, `customDays`) | **Habit** | Becomes a real entity with schedule, target, completion history, streak — not a task generator. |
| Materialised recurring instance | Habit completion record | No longer a fake task cluttering the task list. |
| Weekly goal (`{id, text, done}`) | **Weekly intention** + goal `weeklyTarget` | Split, see §3. |
| Week `conclusion` string | Structured `Review` object | Four sections instead of one blob. |
| Category | Category | Kept as-is: Work, Health, Learning, Personal, Other. |
| — | **Goal**, **Milestone** | New. |

### Why recurring-tasks → habits is not a rename

The old system materialises a template into N independent task rows per week. That means
consistency is unknowable: nothing is stored about *whether the pattern held*, only
whether seven unrelated rows got ticked. A habit stores `completions` as dated records
against a `schedule`, which makes streak, consistency %, and week-over-week comparison
cheap to compute and honest. It also stops habits from drowning the task list — four
daily habits currently generate 28 rows a week.

---

## 2. Navigation

```
┌──────────────────────────────────────────┐
│                                          │
│              (screen content)            │
│                                          │
├──────────────────────────────────────────┤
│  Home     Week     ( + )    Goals   You  │   floating tab bar
└──────────────────────────────────────────┘
```

Four destinations plus a centre create action. Chosen over the brief's
Home/Week/Goals/Insights for one reason: **Insights is not a place you go, it is
something you read.** It is a weekly-cadence surface, so putting it in the permanent tab
bar buys a tab that is dead six days a week.

Instead:

- **Insights + Review live under the Week tab**, as a second segment. They are the
  week's *retrospective* half — same time unit, same mental context.
- Home surfaces the one live insight that matters today, and from Saturday onward
  promotes a "Your week is ready to review" card straight to the top of Home.
- The fourth tab is **You** — settings, name, appearance, notifications, week start,
  data export. The old app had nowhere to put these.

If you would rather keep Insights as a fifth tab, that is a one-line change; the
previews model my recommendation so you can judge it.

### The + action

Opens a bottom sheet with three choices — Task, Habit, Goal — and never anything else.
Choosing one pushes a focused creation sheet. Task creation defaults to today and the
currently viewed day when opened from Week, which removes the most common two taps.

---

## 3. Screens

### Home — "what is happening in my life right now"

Ordered by how often it changes and how much it matters:

1. **Greeting + date.** "Good morning, Yarin." Thursday, September 3.
2. **Weekly intention.** One editorial line the user writes on Sunday —
   *"Fewer things, finished."* This is what replaces the old weekly-goals checklist as
   the *emotional* anchor. It is a sentence, not a checklist, and it sets the tone of
   the whole screen.
3. **Today.** Today's tasks, checkable inline. The primary action of the screen.
4. **Habits today.** Compact — one row per habit due today, tap to complete.
5. **This week.** Progress summary, one number plus a slim breakdown.
6. **Goals.** Two or three active goals with progress. Preview only, tap through.

Everything below "Today" is progressive disclosure — a summary with a tap-through, never
the full dataset. Home has exactly one primary action: complete something.

The old app's "weekly goals" percentage is gone from Home deliberately. It measured a
checklist that had no relationship to the tasks below it, which is the exact
disconnection this redesign exists to fix. Its replacement is each goal's
`weeklyTarget` — "practice 4 times this week" — which *is* connected, because the
practising is tracked by a habit.

### Week — the defining screen

Two segments: **Plan** and **Review**.

**Plan** — a Sun→Sat day strip with today marked, plus a per-day load indicator so an
overloaded Thursday is visible before you live it. Selecting a day shows that day's
tasks and habits. Week-level summary at the top. Navigate back through the 12 stored
weeks.

The old **Table view** (categories × days) is not preserved as a table. A 5×7 grid on a
390px screen is 55px cells, which cannot hold a task title. What the table was actually
*for* — spotting imbalance across days and categories — moves to two places: the
per-day load bars in the Plan strip, and the category/day breakdowns in Insights. This
is the one deliberate removal of an existing view, and I flag it as such.

**Review** — Insights, then the AI weekly review beneath it.

### Goals

List of active goals, each showing progress, deadline, and how many actions it received
this week. Goal detail:

- Title, description, deadline, progress derived from milestones.
- **Milestones** — an ordered checklist. Checking one animates goal progress.
- **This week** — the tasks and habits linked to this goal, with live status. This is
  the screen that answers *"is what I'm doing this week actually moving this?"*
- Archive rather than delete, so history and Insights stay intact.

Progress is computed from milestones by default (`completed / total`), with an optional
manual override for goals that are numeric — the savings goal is amount-based, not
milestone-based. Both are modelled in the preview.

### Habit detail

Name, icon, schedule, current streak, this week's dots, consistency over the last 12
weeks as a small bar history, and the goal it serves. Completion is one tap.

Gamification budget, deliberately small: a streak count and a consistency percentage.
No badges, no levels, no confetti, no loss-aversion messaging. A broken streak is shown
without comment — the history bar simply has a gap.

### Insights

Written as sentences first, charts second. Every metric must answer a question:

- "You finished 82% of what you planned." — am I planning realistically?
- "Tuesday is your strongest day, 94% over 8 weeks." — when should I schedule hard things?
- "Thursday is your heaviest day and 3 tasks usually carry over." — where am I overloading?
- "Learning received 4 actions this week, up from 1." — is my attention where I want it?
- "Habit consistency is up 12% on last week." — am I becoming more consistent?

Charts are supporting evidence under each sentence, not the point.

### Review

Four sections, generated from real numbers: **What went well**, **What got in the way**,
**A pattern we noticed**, **Next week's focus**. The AI is given actual counts,
completion rates, per-day and per-category breakdowns, habit consistency deltas, and
goal progress deltas — and instructed to be specific, concise, and non-judgemental.
Saved per week, regenerable.

---

## 4. AI review architecture (security)

**The app must never hold an Anthropic API key.** In a browser build the key is in the
bundle and the network tab; in an APK it survives `unzip`. There is no client-side fix —
obfuscation, splitting the string, and storing it in `localStorage` are all trivially
defeated.

Recommended: a **small serverless relay** (Cloudflare Worker or Vercel function) that
holds the key as a server secret. The app POSTs a *summary object* — counts and
percentages, never task titles unless the user opts in — and receives review text.
Rate-limited per install ID. No account, no user data at rest on the server.

This keeps the app local-first: the relay is only touched when the user taps "Generate
review", and every other feature works fully offline.

Fallbacks, in order of preference if you would rather not run any server:

1. **Bring-your-own-key**, entered in Settings, stored in the OS keystore via Capacitor
   Preferences, clearly labelled as the user's own key and their own cost. Acceptable
   because it is *their* key, not a shipped one.
2. **A local, non-AI review** — a templated summary generated from the same statistics.
   Less insightful, zero infrastructure, works offline. Worth building regardless as the
   offline fallback for when the relay is unreachable.

The previews use hand-written mock review copy so the design can be judged without any
key existing.

---

## 5. Data model

```ts
type Category = 'Work' | 'Health' | 'Learning' | 'Personal' | 'Other';
type DayKey   = 0|1|2|3|4|5|6;              // 0 = Sunday

interface Task {
  id: string;
  title: string;
  category: Category;
  date: string;                              // 'YYYY-MM-DD' — absolute, not 'Mon'
  important: boolean;
  done: boolean;
  completedAt?: string;
  goalId?: string;
  milestoneId?: string;
  notes?: string;
  remindAt?: string;                         // 'HH:mm'
  carriedFrom?: string;                      // date it was moved from
  createdAt: string;
}

interface Habit {
  id: string;
  name: string;
  icon: string;
  category: Category;
  schedule:
    | { type: 'daily' }
    | { type: 'weekdays' }
    | { type: 'weekends' }
    | { type: 'days'; days: DayKey[] }       // specific days
    | { type: 'timesPerWeek'; target: number };
  goalId?: string;
  remindAt?: string;
  createdAt: string;
  archivedAt?: string;
}

interface HabitCompletion {
  habitId: string;
  date: string;                              // 'YYYY-MM-DD'
}                                            // presence = done; no boolean needed

interface Goal {
  id: string;
  title: string;
  description?: string;
  category: Category;
  deadline?: string;
  progressMode: 'milestones' | 'manual';
  manualProgress?: { current: number; target: number; unit: string };
  createdAt: string;
  archivedAt?: string;
}

interface Milestone {
  id: string; goalId: string; title: string;
  done: boolean; completedAt?: string; order: number;
}

interface Week {
  weekStart: string;                         // 'YYYY-MM-DD', the Sunday
  intention?: string;
  review?: Review;
}

interface Review {
  generatedAt: string;
  source: 'ai' | 'local';
  wentWell: string; gotInTheWay: string; pattern: string; nextFocus: string;
  stats: WeekStats;                          // snapshot, so old reviews stay explicable
}

interface Settings {
  name: string;
  theme: 'light' | 'dark' | 'system';
  weekStartsOn: DayKey;
  notifications: { tasks: boolean; habits: boolean; deadlines: boolean; weeklyReview: boolean };
  ai: { enabled: boolean; mode: 'relay' | 'local' };
}
```

### Two decisions worth calling out

**Dates are absolute, not day-of-week strings.** The old model stores `day: 'Mon'`
inside a week bucket. That makes "show me the last 30 days", "carry this task to
tomorrow" and any cross-week query awkward, and it breaks if week-start ever becomes
configurable — which Settings requires. Storing `YYYY-MM-DD` makes the week a *view*
over tasks rather than a container of them.

**Habit completions are rows, not flags.** A completion is `(habitId, date)`. Streaks,
consistency and history are then derived, not stored, so they can never drift out of
sync with the truth.

---

## 6. Migration from WeekFlow 1.0

Run once, on first launch, behind a `schemaVersion` flag. **The old keys are never
deleted** — they are left in place and a full backup JSON is written to
`wf2-legacy-backup` before anything is transformed, so a bad migration is recoverable.

| Old | New | Fidelity |
| --- | --- | --- |
| `wf-name` | `Settings.name` | Exact. |
| Week keys in `wf-clean-v2` | `Week.weekStart` | Exact. |
| Task, where `templateId` is absent | `Task`, `date` computed from week key + `day` | Exact. |
| Task, where `templateId` is present | `HabitCompletion` if `done`, else discarded | Intended — a materialised instance was never real data, only a rendering of a template. |
| `wf-templates-v1` entries | `Habit` | `recur`/`customDays` map cleanly onto `schedule`. Icon and category are inferred, then editable. |
| Week `goals[]` | `Goal` with `category: 'Personal'`, one milestone per goal | **Lossy — see below.** |
| Week `conclusion` | `Review` with the text in `wentWell`, `source: 'local'` | Lossy but preserved; the other three sections are empty and the UI shows it as a legacy note rather than faking structure. |
| `materializedTemplateIds` | dropped | No meaning in the new model. |

**The lossy case, stated plainly.** Old weekly goals are per-week strings — "run 3 times"
might exist in eight different weeks as eight unrelated records. There is no reliable way
to know whether those are one recurring goal or eight separate ones. String-matching them
would silently merge things the user meant to keep apart. So: each old weekly goal becomes
a short goal scoped to its week, and the migration ends on a screen that says what it did
and offers to merge duplicates by hand. Automatic guessing here would corrupt history that
the user cannot get back.

---

## 7. Technical architecture

**Recommendation: React + Vite + TypeScript, wrapped with Capacitor.**

Evaluated against the brief's criteria:

| | React + Capacitor | React Native / Expo |
| --- | --- | --- |
| Existing code reuse | **All of it** — components, hooks, stat maths port directly | Logic ports; every component is rewritten |
| APK generation | `npx cap add android` → Gradle → APK | EAS build → APK |
| UI quality for *this* design | **Strong** — the direction is typographic, gradient- and blur-heavy; CSS does this natively | Fighting the platform: no CSS blur, no gradient text, harder type control |
| Mobile performance | Good — this is a local, list-based app, not a 60fps game | Better, but the headroom is unused here |
| Offline | Native — everything is local by default | Native |
| Maintainability | One codebase, standard web tooling | Native build complexity, native module churn |
| Future iOS | `npx cap add ios`, same code | Same code |

The deciding factor is the design itself. This product is typography, layered
translucency, soft shadows and gradient surfaces — things CSS renders effortlessly and
React Native makes into a project. The performance advantage RN would bring is not needed
by an app whose heaviest screen is a list of twelve rows.

The honest cost of Capacitor: scroll and gesture feel is *very good* rather than
*indistinguishable*, and it needs deliberate work — `touch-action`, momentum scrolling,
tap-highlight suppression, safe-area insets, and never animating anything but `transform`
and `opacity`. That work is budgeted.

**Persistence: SQLite via `@capacitor-community/sqlite`**, with a Dexie/IndexedDB adapter
behind the same repository interface for the web build. The model now has relations —
goals to milestones to tasks and habits, plus dated completion rows queried by range —
and Insights runs aggregate queries across twelve weeks. That is a database, and driving
it by reading a single JSON blob out of `localStorage` on every render will not hold up.

All storage sits behind a repository layer so the engine can change without touching UI.

**Notifications: `@capacitor/local-notifications`.** All local, no push service, no
server. Defaults are conservative: everything off except an opt-in weekly review nudge on
Sunday morning. Reminders are scheduled per task/habit and cancelled on completion, so
you are never reminded to do something you have already done.

---

## 8. Design principles carried into the previews

1. Calm over noisy — one accent, generous whitespace, no competing colour.
2. One primary action per screen — Home is for completing, Week is for planning,
   Goals is for orienting, Review is for reading.
3. Progressive disclosure — summary on Home, detail one tap away.
4. Every metric earns its place, or it is cut.
5. Status is never colour alone — icon, weight and position carry it too.
6. Motion is Premium-archetype: 140/260/420ms, `cubic-bezier(0.4, 0, 0.2, 1)`, no
   bounce except a 4% overshoot on completion. Fully disabled under
   `prefers-reduced-motion`.
7. Thumb-first — primary actions in the lower half, 44px minimum targets, sheets rather
   than dialogs.
