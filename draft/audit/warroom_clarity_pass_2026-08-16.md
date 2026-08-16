<!-- TERRITORY: A -->
# War-Room Clarity Pass — 2026-08-16

Three directives from Cory, same day, all landed in this pass. Verbatim:

1. *"Do we need to make sure our new war room is a clear representation of
   our model."* — the model-representation audit (the own model was promoted
   to **own_v6** earlier today: DECISIONS-NEEDED.md § Settled,
   `draft/audit/projection_program_2026-08-16.md`).
2. *"Do we have way to capture quick movement in ADPs. Players moving up or
   down quickly, might be good to identify as could hint at some new,
   movement, or development. Maybe a small screen on war room showing the top
   10 ADP movers up and top 10 down?"*
3. *"Anything we should add to it that could help me, especially in tie
   break scenarios?"* — asked of the verdict block.

Evidence: `draft/audit/screens/wr2-before-desktop.png` (+`-depth`) vs
`wr2-after-desktop.png` (+`-depth`), 1440px, clean dev-store boot, **zero
console errors** both sides (harness: the `shots-warroom.js` flow, desktop
arm). Suites at the end of the pass: **pytest 2381 passed / 5 skipped**,
**js-sweep 291 entry points all green** (was 288 — three new fidelity
suites).

---

## 1. THE MODEL-REPRESENTATION AUDIT — what was stale, what was fixed

The promotion protocol was clean *inside* the model lane
(`own_projections.py` stamps `provenance["algorithm"]`, the board refresh
carried `own_v6`); what the audit hunted was every SURFACE that names the
model or a projection source, checking each against the board's own
provenance. Findings, worst first:

| # | Surface | Finding | Fix |
|---|---|---|---|
| 1 | `src/routes/admin.js` `/admin/projections` | Read **only** `provenance.own_model` (top level) — the key the *promotion refresh script* writes. A full `build.py` run writes the diag at `provenance.projections.own_model` and no top-level key, so the page Cory uses to see "our model's" projections was **one nightly rebuild from labeling a full column "none attached."** The committed board proves both homes are real: today it carries a STALE walk-forward-era diag under `projections.own_model` (no `algorithm`, 753 projected) *and* the fresh own_v6 diag at top level (424 projected). | Resolve through **both homes**, top-level first: `prov.own_model \|\| (prov.projections \|\| {}).own_model \|\| {}`. |
| 2 | `draft/build.py` own-model attach log | `print("... own model (own_v6) ...")` — the algorithm name **typed** into the log line; one promotion from lying, the same class as the FFC footer credit (2026-08-10). | Reads `own_diag.get('algorithm')` — the log now follows provenance like every other surface. |
| 3 | `public/js/draft/app.js` `recRawProj` fallback | The DraftConsensus-missing fallback returned `label: 'Sleeper proj'` **hardcoded** — written in the single-source era, silently wrong since FantasyPros landed as source #2 (2026-08-10). | Label derived from `provenance.projections.source`. |
| 4 | `public/js/draft/consensus.js` header + third-source comment | Header still said *"TODAY IT IS SLEEPER ONLY … renders 'Sleeper proj', not 'consensus', until a second real source lands"* (the board has been 2-source for six days, 3-source where the own model attaches) and the `proj_ownmodel` comment named **walk_forward** as the algorithm (two promotions stale in one day). | Comments rewritten to state the mechanism (label derived per player from what is present) and to point at `provenance.own_model.algorithm` instead of naming an algorithm. The rendered label `'Our model'` was already version-free — kept deliberately so promotions cannot strand it. |
| 5 | `views/admin/projections.ejs`, `views/admin/warroom.ejs` | **Clean** — the projections page prints `ownModel.algorithm` from provenance (no literal anywhere); the war-room shell names no source or algorithm; the ADP footer credit was already provenance-driven from the 2026-08-10 fix. | Pinned (below), no change needed. |

**The pin** (`draft/tests/ui_fidelity_own_model_label.test.js`, 19 checks):
the committed board's provenance names an algorithm through the two-home
chain (says `own_v6` today, printed by the test, never asserted as a
literal); the route reads both homes; the shipped EJS **rendered with the
real artifact's provenance** displays that exact value; a hypothetical
`own_v7` promotion relabels the rendered page with zero template edits (the
directive's "the NEXT promotion can't strand it", executed as a test); no
rendering surface contains `own_v4`/`own_v5`/`own_v6`/`walk_forward` as a
literal; consensus.js labels stay version-free and source counts stay
derived; build.py's log line reads the diag.

## 2. THE ADP MOVERS PANEL — Cory's "small screen", built on data that already existed

The data was already on every board player — `adp_velocity` (slots moved
over the retained daily series' window, **positive = rising** toward an
earlier pick; `draft/adp_series.py`, stamped by `build.py
_update_adp_series`) and `adp_stale` (the ≥8-slot alarm) — and **no surface
rendered either field.** Now:

- **`public/js/draft/movers.js`** (new, pure, dual-exported):
  `DraftMovers.movers(players, {n, span})` → top 10 up / top 10 down by
  velocity, ties broken by explicit board-order index (provably stable — the
  suite reverses the board and watches the tie pair flip), `null` velocity
  **excluded** (absent ≠ zero), zero-velocity excluded from both directions,
  per-day rate = velocity/span (absent when the span cannot support a rate),
  `state:'shallow'` when nobody is measurable.
- **`renderAdpMovers`** (app.js) + the Zone-2 rail card in `warroom.ejs`
  (`#adp-movers-card`). **Placement is doctrine**: market motion informs a
  pick and never scores one, so it sits in the context rail with
  roster/byes/survival — below the decision surface, never displacing the
  verdict. Desktop-first: two columns at rail width. Row grammar: direction
  glyph · name · pos chip · current ADP · slots moved (bold) · per-day rate ·
  the **STALE chip in `--wr-bad`** — the one alarm-colored thing on the card,
  because it is a real alarm (the board's own number is a round behind the
  market), tappable into the shared `FLAG_LEGEND` with the full sentence.
  Velocity itself wears plain ink: it is neither money (gold) nor an alarm
  (red), per the token doctrine.
- **The honest empty state, verbatim in the renderer**: *"series too shallow
  — velocity means nothing yet."* Day one of a fresh series every velocity
  is None and the panel says so — never zeros. One-sided emptiness renders
  its own line ("nobody falling over this window").
- **Full explainer contract** (`PANEL_GUIDE.adp_movers`, what/read/**do**/src)
  including the honesty line the series file itself insists on: this is NOT
  a tested momentum edge — names to investigate, feeding no score. Spec
  entry added to `draft/tools/panel_spec.js` (weight: CONTEXT).
- **Pinned** by `draft/tests/ui_fidelity_movers.test.js` (35 checks) through
  the extracted shipped renderer on a synthetic board fixture: top-10
  ordering both directions, the reversed-board tie-stability proof, None
  exclusion, zero exclusion, per-day arithmetic, the stale chip count, the
  shallow board's sentence, and "zero mover rows, zero zeros" on an all-None
  board. Live capture: 6-day window, 287 measured, Folk +60 leads the risers,
  Johnson −69 the fallers.

Rehearsal bookkeeping: the mock-3 card census moved 18 → 19 (this card),
recorded in `rehearsal-mock3.js` with the measurement note, same as the
17 → 18 precedent.

## 3. TIE-BREAK AIDS IN THE VERDICT — printed facts, zero new weights

When the verdict chip says **TOSS-UP** the engine has already said the top
options sit inside its own noise (`CFG.TIE_THRESHOLD` / the PATHS_BAND
plan/rule ties) — the old surface stopped at "your call". Now
`verdict.js tiebreakFacts()` prints a compact discriminator line, **computed
from fields already on the board**, attached *after* the verdict and backed
pick are final so it structurally cannot move either:

- **(a) market divergence** — only when one is rising AND the other falling
  (`adp_velocity` both ends), named with slots each way: *"market: Alpha is
  rising (+14 ADP slots) while Beta is falling (−6) — one of these moves may
  be news"*;
- **(b) bye overlap** — each candidate's bye counted against the picks
  already made (`state.myRoster`, keepers included): *"byes: Alpha (wk 9)
  stacks with 2 of your picks; Beta (wk 5) is clear"* — a tie-breaker, not a
  price (the bye adjuster stays measured-off);
- **(c) age gap** — printed only past 2 years, strictly;
- **(d) depth-chart security** — only when exactly one is the listed №1:
  starter vs committee seat.

A fact with an absent input on either side is **skipped, never zero-filled**;
a pair nothing separates renders the honest *"nothing on the board separates
X and Y — genuinely even; your read decides."* The line itself is labeled
*"printed, not scored — the pick above is unchanged."* Non-toss-ups
(LOCK/LEAN/SPLIT/PINNED) carry nothing. Explainer updated (read/do +
`tiebreakFacts` cited in src).

**Pinned** by `draft/tests/ui_fidelity_tiebreak.test.js` (23 checks): a
synthetic toss-up derives and renders all four facts; every gate's refusal
arm (same-direction velocity, 2-year gap exactly, both-committee, equal
overlap, one-sided velocity, bare players); LOCK and SPLIT derive
`tiebreak: null` even with every input present; and the hard clause — **the
backed pick, verdict, headline and why are byte-identical with and without
the roster input, swept 0→8 in 0.1 steps** plus the plan/rule branch
variants. (Today's live board resolves to a SPLIT, so the line's rendering
evidence is the suite's extracted-renderer markup, not the capture.)

## What this pass deliberately did NOT touch

No scoring/weight default, no CFG flag, no member-facing surface, no
matchup-screen animation (explicitly end-of-list), nothing in
`draft/backtest/` (a roster-construction agent is working there
concurrently — its lane untouched).

## Files

A-lane: `movers.js` (new), `verdict.js`, `app.js`, `consensus.js`,
`build.py`, `panel_spec.js`, `_warroom_scripts.ejs` (A's seam), three new
`ui_fidelity_{movers,tiebreak,own_model_label}.test.js` suites,
`rehearsal-mock3.js` (census note), TERRITORY headers added to the five
2026-08-15-design-pass test files the gate flagged as undeclared.

B-lane crossings (all already in the Override #5 pinned set): `warroom.ejs`
(the movers card host), `warroom.css` (`.wr-movers*` / `.wrv-tiebreak`
components on the existing tokens), `src/routes/admin.js` (finding #1).
Appendix + repin bookkeeping in TERRITORY.md Override #5 — the repin also
records the projections-page pair (`admin.js`, `projections.ejs`) that was
already trespassing but missing from the 39-file pin (39 → 41; this pass
added zero new files to the set).
