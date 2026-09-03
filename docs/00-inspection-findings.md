# Phase 1 — Inspection findings

## What I was able to inspect

**The repository `Yarinrin/Weekflow-2.0.0` is empty.** No branches, no commits, no
files. The GitHub API confirms it: `409 Git Repository is empty`.

The existing WeekFlow lives on StackBlitz and was never pushed here, so I could not
read the real source. Everything below is reconstructed from the functional and data
specification in the brief, which is detailed enough to design against.

## What this blocks, and what it does not

| Phase | Blocked by missing source? | Why |
| --- | --- | --- |
| Phase 2 — product & UX architecture | No | The brief documents every screen, feature and storage key. |
| Phase 3 — visual design previews | No | Previews are new design work with mock data. |
| Phase 9 Step 3 — migration of real data | **Yes** | A migration needs the real serialised shapes, not a summary. |
| Phase 9 Step 2 — implementation | Partly | Reusable logic (week keys, recurrence materialisation, stat maths) should be ported, not re-derived. |

**Action needed from you before full implementation:** push the StackBlitz project to
this repo (or paste `App.jsx` / the state and storage modules, plus `package.json`).
I specifically need:

1. The exact `localStorage` payloads for `wf-clean-v2`, `wf-templates-v1`, `wf-name` —
   ideally a real export from your own browser, so the migration is tested against real
   data rather than the idealised schema.
2. The week-key derivation (how the Sunday anchor is computed, and its timezone
   behaviour).
3. The recurrence materialisation logic and how `materializedTemplateIds` is used.
4. The AI review call site — this is where the API-key exposure lives.
5. Build tooling: Vite or CRA, React version, any UI dependencies.

## Assumed baseline

Working assumption for the architecture below, taken from the brief:

- React SPA, browser-only, no backend, no auth.
- Persistence: three `localStorage` keys.
- Week = Sunday → Saturday, keyed by the ISO date string of that Sunday.
- History: current week plus the previous 12.
- Recurring tasks are templates materialised into per-week task instances.
- AI weekly review calls Claude and stores one conclusion string per week.

## Security issue identified

A browser-only app that calls the Anthropic API must hold the key in client code —
in a bundled constant, a `VITE_`-prefixed env var, or `localStorage`. **All three ship
the key to the user's device.** In a web build it is readable in the network tab and
the JS bundle; in an Android APK it is readable by unzipping the APK. There is no
client-side mitigation. This is a real key-exfiltration risk, not a theoretical one.

If the current implementation calls `api.anthropic.com` from the browser, the key
should be treated as **compromised and rotated** once this is fixed.

Redesign, decided in `01-product-architecture.md`: the app never holds a key. See
"AI review architecture" there. The previews use hand-written mock review copy.
