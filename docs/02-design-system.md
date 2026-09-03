# WeekFlow 2.0 — design system

Direction B, *Soft Pastel*, approved. This is the specification the implementation is
built from. Every token here exists as a CSS custom property in `src/styles/tokens.css`.

---

## 0. What changed from the preview, and why

The preview proved the direction. Three things about it would not survive contact with a
real app, so they are tightened here rather than carried over:

1. **A list is one object, not a stack of boxes.** In the preview every task was its own
   floating card, which turned Home into a column of white rectangles. Lists are now a
   single grouped surface with hairline dividers. Cards are spent where something really
   is a separate object — a goal, a habit, a summary.
2. **Gradient has exactly two jobs.** The hero surface, and the create action. Nowhere
   else. A gradient on every tinted panel is what makes a design read as generic.
3. **Glass has exactly three jobs.** The tab bar, sheets, and the scrim behind them.
   Never on content. Translucency should mean "this floats above the page", and it only
   means that if nothing else uses it.

And one rule that keeps the pastel from turning into confetti:

4. **Colour is a system, not decoration.** The five tints map to the five life areas and
   to nothing else. If a surface is mint, that is because it is about Health. Semantic
   colour (attention, danger) is a separate, non-pastel set, so a warning can never be
   mistaken for a category.

---

## 1. Colour

### Neutrals

The neutral ramp is biased very slightly blue, toward the Work tint, so it sits in the
same world as the accents instead of reading as unconsidered grey.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#F5F7FC` | `#12141A` | App background |
| `--surface` | `#FFFFFF` | `#1A1D26` | Cards, grouped lists |
| `--surface-2` | `#FBFCFE` | `#171A22` | Completed rows, insets |
| `--glass` | `rgba(255,255,255,.74)` | `rgba(26,29,38,.74)` | Nav, sheets only |
| `--ink` | `#242A38` | `#E8EAF0` | Primary text |
| `--ink-2` | `#5D6579` | `#A2A9BA` | Body, secondary |
| `--ink-3` | `#949BAD` | `#6E7689` | Meta, placeholders |
| `--line` | `#E8ECF5` | `#2A2F3C` | Dividers, input borders |

`--ink-3` on `--surface` is 3.1:1 — it is used only for non-essential metadata at 11.5px
and never for anything the user must read to operate the app. Everything load-bearing
uses `--ink-2` (5.9:1) or `--ink` (12.6:1).

### Life areas

Each area has a `tint` (surface, always behind text) and a `deep` (text, stroke, fill).
`deep` on `tint` clears 4.5:1 in both themes.

| Area | Light tint | Light deep | Dark tint | Dark deep |
| --- | --- | --- | --- | --- |
| Work | `#CFE0F7` | `#41669F` | `rgba(102,150,220,.22)` | `#8FB4E8` |
| Health | `#C9E9DA` | `#2F7A62` | `rgba(60,160,128,.22)` | `#7FD3B4` |
| Learning | `#DCD6F3` | `#5E4F9E` | `rgba(130,112,210,.24)` | `#B3A5EE` |
| Personal | `#F8D5DA` | `#A8566A` | `rgba(210,120,145,.22)` | `#EDA0B0` |
| Other | `#F8E6B9` | `#8A6B26` | `rgba(190,150,60,.22)` | `#DFC079` |

Set by `[data-area]` on any subtree; components read `var(--tint)` / `var(--deep)` and
never name a colour directly.

### Semantic

Deliberately outside the pastel family so status can never be read as a category.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--attention` | `#A85C2C` | `#E0A06A` | Carried-over, past deadline |
| `--danger` | `#AD3B3B` | `#F08A8A` | Destructive actions only |
| `--positive` | `#2F7A62` | `#7FD3B4` | Completion confirmations |

**Status is never colour alone.** A carried task also carries the words "Moved from
Wednesday"; a completed task also has a filled check, a strikethrough, and a dimmed row.

---

## 2. Typography

**Fraunces** for display — a soft, high-optical-contrast serif with real character.
**Plus Jakarta Sans** for everything operational. Both variable, both from Google Fonts,
both self-hosted in the app build so the app works offline.

The split is by *role*, not by size: Fraunces speaks (headings, the intention, review
prose, goal and habit names), Plus Jakarta Sans works (tasks, labels, numbers, controls).

| Token | Family | Size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| `--t-d1` | Fraunces | 29 / 1.10 | 500 | Screen heroes, greeting |
| `--t-d2` | Fraunces | 25 / 1.15 | 500 | Review pull-quotes, insight statements |
| `--t-d3` | Fraunces | 20 / 1.18 | 500 | Goal titles, sheet titles |
| `--t-d4` | Fraunces | 18 / 1.22 | 500 | Card titles |
| `--t-body-lg` | Jakarta | 14.5 / 1.50 | 600 | Task titles |
| `--t-body` | Jakarta | 13.5 / 1.62 | 400 | Body copy |
| `--t-label` | Jakarta | 11.5 / 1.2 | 700 | Section labels, uppercase, `.07em` |
| `--t-meta` | Jakarta | 11.5 / 1.4 | 500 | Metadata, counts |
| `--t-pill` | Jakarta | 10.5 / 1 | 600 | Pills, tags |
| `--t-num` | Jakarta | — | 700 | Ring values, `tabular-nums`, `-.02em` |

Rules: headings get `text-wrap: balance`. Anywhere digits line up in a column,
`font-variant-numeric: tabular-nums`. Body copy caps at ~62 characters. Display sizes
scale down 1 step below 360px viewport width; nothing else changes.

**Italic Fraunces is reserved for one thing:** the user's own words and the review's
emotional line — the weekly intention, the name in the greeting, the review headline.
It marks "this is about you", so it must not become decoration.

---

## 3. Spacing, radius, elevation

**Space** — 4px base: `2 4 6 8 10 12 14 16 20 24 32 40 56`.
Screen gutter is 20px. Section rhythm is 26px. Related items sit 8px apart, unrelated 20px.

**Radius** — larger surfaces take larger radii, so radius reads as scale rather than style:

| Token | px | Use |
| --- | --- | --- |
| `--r-xs` | 8 | Pills on small elements, dots |
| `--r-sm` | 12 | Chips, segmented control thumb |
| `--r-md` | 16 | Inputs, small tiles |
| `--r-lg` | 20 | Buttons, inner cards |
| `--r-xl` | 24 | Cards, grouped lists, nav bar |
| `--r-2xl` | 30 | Hero surface |
| `--r-3xl` | 32 | Sheet top corners |
| `--r-pill` | 999 | Pills, tags, back button |

**Elevation** — three levels only. Nothing in the app has a fourth.

| Token | Value | Use |
| --- | --- | --- |
| `--sh-1` | `0 1px 2px rgba(36,42,56,.04), 0 8px 22px -8px rgba(36,42,56,.10)` | Cards, grouped lists |
| `--sh-2` | `0 2px 6px rgba(36,42,56,.05), 0 22px 44px -16px rgba(36,42,56,.18)` | Toast, raised create button |
| `--sh-nav` | `0 3px 10px rgba(36,42,56,.07), 0 18px 40px -12px rgba(36,42,56,.28)` | Tab bar, sheets |

In dark mode shadows lose most of their work; surfaces separate by lightness instead, and
shadow alpha drops to a third.

---

## 4. Motion

Personality: **Premium**. Calm, no bounce, one signature curve.

| Token | Value | Use |
| --- | --- | --- |
| `--dur-quick` | 140ms | Press feedback, hover |
| `--dur-base` | 260ms | Screen transitions, state change |
| `--dur-slow` | 420ms | Entrances, stagger budget |
| `--dur-sheet` | 360ms | Sheet in |
| `--dur-measure` | 700ms | A number or ring moving to a new value |
| `--ease` | `cubic-bezier(.4,0,.2,1)` | The signature curve — 80% of everything |
| `--ease-out` | `cubic-bezier(.05,.7,.1,1)` | Entrances, sheet presentation |
| `--ease-in` | `cubic-bezier(.3,0,1,1)` | Exits, dismissals |
| `--ease-pop` | `cubic-bezier(.34,1.4,.64,1)` | **Completion only** |

**The one overshoot.** `--ease-pop` is permitted on exactly one event: marking something
done. That is the moment worth celebrating, and reserving the curve for it is what makes
it feel like a reward rather than a tic.

Choreography:
- **Screen change** — 260ms; outgoing fades and drifts 16px against travel, incoming
  arrives from 16px with a 0.99 scale. Back reverses the direction.
- **List entrance** — 420ms rise from 13px, staggered 45ms, capped at 6 items so the
  total stays under 400ms. Entrance runs on navigation only, never on re-render.
- **Completion** — check container pops to 1.18 and settles (360ms, `--ease-pop`) while
  the tick strokes on over 190ms after a 70ms delay; the row's text colour and
  strikethrough cross over 260ms.
- **A measured value that changes** — rings and counters animate *from their previous
  value to the new one* over 700ms, never replaying from zero. Completing a task should
  nudge the week ring, not restart it.
- **Sheet** — in at 360ms `--ease-out`; out at 220ms `--ease-in`. Exits are faster than
  entrances because nobody watches something leave.

`prefers-reduced-motion: reduce` collapses every duration to 1ms and disables the ambient
background drift. State still changes; it just arrives instantly.

Only `transform` and `opacity` are animated. Ring progress animates `stroke-dashoffset`,
which is compositor-friendly enough at these sizes.

---

## 5. Components

### Grouped list
The default container for tasks, milestones and settings rows. `--surface`, `--r-xl`,
`--sh-1`, `overflow: hidden`, rows divided by 1px `--line`, last divider removed. Rows are
56px minimum. A completed row takes `--surface-2`.

### Task row
Check control · title · pills. Two independent tap targets: the check (44×44 target
around a 25px circle) completes; the body opens the detail sheet. Title is
`--t-body-lg`. Pills sit below: life area always, then carried-over, then linked goal.

### Check control
25px circle, 2px `--tint` border on `--surface`. Checked: fills `--deep`, tick strokes on
in white, container pops. `role="checkbox"` with `aria-checked`; label is the task title.

### Ring
The only form progress takes. SVG, `--deep` stroke on a 10%-ink track, round caps,
rotated −90° so it starts at twelve o'clock. Sizes: 38 (tile), 54 (goal row), 62 (stat),
82 (week summary), 116 (habit hero); stroke is roughly size/10. The value sits inside in
`--t-num`. Bars are used *only* for time series — an eight-week history — never for a
single proportion.

### Card
`--surface`, `--r-xl`, `--sh-1`, 20px padding. A tinted card
(`background: linear-gradient(135deg, var(--tint), var(--surface) 78%)`) is used for goals
and habits, where the life area is part of the identity. Everything else is plain.

### Hero
`--r-2xl`, the one multi-stop gradient in the app, with a soft white radial highlight
top-right. One per screen, at the top, never twice.

### Tab bar
Floating pill, 18px from each edge and 22px from the bottom, `--glass` with a 22px blur,
`--sh-nav`. Four destinations plus the create action, which is a 50px `--r-lg` square with
the app's second gradient and a 45° rotation to × when a sheet is open. Content beneath
fades into `--ground` over the last 58px so nothing is sliced by the screen edge.

### Sheet
Bottom sheet, `--r-3xl` top corners, `--glass` with a 26px blur, grab handle, max 84%
height, scrollable. Dismiss by scrim tap, swipe down, or Back. Focus moves into the sheet
on open and returns to the trigger on close. Sheets, never dialogs — a sheet is reachable
by thumb.

### Buttons
Primary: full-width, 16px padding, `--ink` on light / `--ink` inverted on dark, `--r-lg`,
`--t-body-lg`. Ghost: 5% ink wash. Destructive: `--danger` text on a 8% danger wash, and
always behind a confirm. Press: scale 0.985 over `--dur-quick`. Minimum target 44px.

### Input
`--surface`, 1px `--line`, `--r-md`, 14/16px padding, 16px font — **16px is not
negotiable on mobile**, anything smaller makes iOS zoom on focus. Focus adds a `--deep`
border and a 3px 13%-alpha ring. Sheets scroll the focused input above the keyboard.

### Pill
`--r-pill`, `--t-pill`, `--deep` on `--tint`. A plain variant uses a 5% ink wash for
non-categorical metadata such as a linked goal name.

### Empty state
Never "No data." A dashed `--line` border on a 66%-alpha surface, a Fraunces line naming
what is missing, a sentence explaining why it might be worth adding, and a single action.

> **No goals yet.** — Choose something worth working toward. — *Add a goal*

### Error state
Says what happened, what it means, and what to do. Never an error code, never an apology.

> **Couldn't write that change.** — Your phone is out of storage, so WeekFlow kept the
> last saved version. Free some space and try again. — *Retry*

---

## 6. Accessibility

- Every interactive element ≥44×44px, including the 7 habit day dots (26px visual,
  44px target via padding).
- Visible focus ring on every focusable element — 2px `--deep` at 3px offset. Never
  removed, only restyled.
- Screen reader: checkboxes carry `role="checkbox"` + `aria-checked` + the item title;
  rings carry `role="img"` with a label like "Build the portfolio, 67 percent complete";
  the tab bar is a `nav` with `aria-current="page"`; sheets are `role="dialog"` with
  `aria-modal` and a focus trap; live regions announce completion and errors.
- Status never encoded by colour alone (§1).
- `prefers-reduced-motion` fully honoured (§4).
- Text scales with the OS setting up to 200% without clipping; the layout uses no fixed
  heights on text containers.

---

## 7. Iconography

One set, hand-drawn as inline SVG on a 24px grid: 1.7px stroke, round caps and joins,
no fills, geometry built from circles and rounded rectangles. About fourteen icons total.
No icon library — a library brings 900 icons in someone else's voice, and this app needs
fourteen in its own.
