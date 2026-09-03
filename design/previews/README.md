# WeekFlow 2.0 — design previews

Three interactive prototypes of the same product, so the comparison is about the visual
language and not about differing features. Open any file directly in a browser, or use
the published links below.

| | Direction | Published |
| --- | --- | --- |
| A | [Editorial Minimal](direction-a-editorial-minimal.html) | https://claude.ai/code/artifact/03a0014b-a435-4908-8672-87dcc8336b1f |
| B | [Soft Pastel](direction-b-soft-pastel.html) | https://claude.ai/code/artifact/914451f0-5ba9-45c5-ab25-101fde7defc1 |
| C | [Organic Editorial](direction-c-organic-editorial.html) | https://claude.ai/code/artifact/21b757a3-e2db-46e8-bcac-0699e4d0f7cd |

Each file is self-contained — no build step, no dependencies, fonts from Google Fonts.
On a desktop browser they render inside a phone frame; below 700px they go full-bleed so
you can open them on your actual phone, which is how they should be judged.

## What is in each prototype

Six screens and three sheets, all live:

1. **Home** — greeting, weekly intention, today's tasks, week progress, habits, goals
2. **Week → Plan** — day strip with per-day load, selected day's tasks and habits
3. **Week → Review** — Insights and the AI weekly review
4. **Goals** — list of active goals
5. **Goal detail** — milestones and the week's linked actions
6. **Habit detail** — this week, streak, consistency, eight-week history
7. **Add sheet** — Task / Habit / Goal, plus the full new-task form
8. **Task sheet** — detail, notes, the goal it contributes to
9. **You** — settings

## What actually works

These change real state, and the numbers recompute:

- **Complete a task** — tap any circle. The check draws, the row settles, and the week
  percentage, the goal it belongs to, and the category breakdown all move with it.
  Undo from the toast.
- **Complete a milestone** — in goal detail. Goal progress animates to its new value.
- **Complete a habit** — tap any day dot, on Home, in Week, or in habit detail. Past days
  are editable, because you forget to log things.
- **Navigate** — all five tabs, plus drill-down into goals and habits and back.
- **Switch days** in the week strip; switch Plan / Review.
- **Open the + menu** and the new-task form; chips are selectable.

## Notes

- Sample data is one real week: Sunday 30 August – Saturday 5 September 2026, viewed on
  Thursday the 3rd, mid-morning. Percentages are computed from that data, not typed in,
  which is why the week reads 67% rather than a rounder number.
- The AI review text is hand-written for the preview. No key exists anywhere in these
  files. See `docs/01-product-architecture.md` §4 for how the real one should work.
- Motion follows a Premium archetype: 140 / 260 / 420ms, `cubic-bezier(.4, 0, .2, 1)`,
  overshoot only on completion. Everything is disabled under `prefers-reduced-motion`.
- These are design prototypes: plain HTML, CSS and JavaScript with no framework, written
  to be read and thrown away. The real app is React + Capacitor.
