# Audit: does the war room actually re-rank on source, everywhere Cory looks?

**E, 2026-08-20, audit requested by Cory directly** ("someone needs to audit
A's warroom changes... the board should change when source is changed and
should adapt accordingly... everything shown should match the source
selected... overall rank on that source should be clear... the big board tab
should switch too"). Driven live in a real browser against the safe rehearsal
server (`draft/tests/rehearsal-serve.js`, real board data, no live
credentials touched), not read from source alone — the existing test suite
for this feature (`proj_source_panel.test.js`) is 100% static regex-over-
source-text and never actually exercises runtime behavior, which is exactly
the gap a live drive can catch and a text-only test cannot.

## THE CORE MECHANISM: WORKS, VERIFIED LIVE

Toggling from blend to Draft Sharks and back, with real DOM/state reads at
each step (`draft/tests/proj_source_toggle_live_check.js`,
`draft/tests/bigboard_source_check.js`, `draft/tests/proj_source_vona_check.js`):

- **Big board table** (`#board-body`): rank, VORP, proj_mean all change on the
  actual rendered rows, not just internal state — e.g. Gibbs' row went
  `155.9 VORP` (blend) → `147.0 VORP` (DS), confirmed in the live table text.
- **The recommendation itself flips.** Blend recommends Josh Allen
  (score 24.44); Draft Sharks recommends Brock Bowers (score 19.32) —
  different players, not just different numbers on the same name.
- **VONA changes and is a real, separate component** (not folded into the
  score silently): Allen's VONA under blend is 17.87; Bowers' under DS is
  4.64. The full component breakdown (need, risk, ceiling, keeper, bye,
  stack) recomputes per source, not just the headline score.
- **Restoring to blend is byte-identical** to the original board — verified
  by comparing full top-5 objects (id, rank, vorp, tier, proj_mean) before
  toggling and after toggling back.
- **The live "Roster builder model says" panel** re-computes correctly (it
  calls `RosterBuilderMLV.recommend(state.board, ...)` directly, so it
  inherits the swap automatically).
- **The position-columns/cockpit tab** (`warroom_charts.js`) reads through a
  live function accessor (`WarRoomData.board()` returns `state.board`, not a
  cached copy) and is explicitly re-triggered every `renderAll()` via
  `WarRoomCockpit.refresh()` — traced through the code, not assumed.

So the headline claim — "does the board actually rearrange, not just show
numbers beside the blend" — is TRUE, and the mechanism is sound: Python
(`rerank_by_source.py`) reuses the real `vorp.apply_vorp`/`assign_tiers`
functions rather than re-implementing replacement level in the browser,
which is the right call given register 148 already found two DIFFERENT
replacement tables in this repo disagreeing by 2x — a third implementation
would have made that worse, not better.

## BUG 1 — THE WHOLE-DRAFT MLV PLAN PANEL DOES NOT REACT TO THE TOGGLE AT ALL

**Confirmed live, not inferred from reading the source.** The "whole-draft
MLV plan" panel (`renderMlvPlan`, the register 146-151 work — Cory's *"what
would MLV with 1 K and DEF pick"* panel) is fed by `loadMlvPlan()`, which
fetches `/mlv_plan.json` — a file precomputed once in Python from the blend
board. `loadMlvPlan()` is called **exactly once, at page boot** (line 1443
of `public/js/draft/app.js`) — never from `setProjSource`, never from
`applySourceBoard`, never from `renderAll`.

**Live test result:** toggled to Draft Sharks. The "Roster builder model
says" panel (immediately above it) changed its numbers correctly (+246.1 →
+243.6 marginal value on the same top pick). The MLV plan panel directly
below it printed **the exact same first row, character for character**:
`33 RB Breece Hall 29.8 +141.7` — unchanged.

**Why this matters:** the panel gives Cory no indication it is frozen. There
is no "based on the blend, not the current source" label anywhere in
`renderMlvPlan`'s output. A user who toggles source expecting *"everything —
rankings, VONA, recommended player, etc"* to follow (Cory's own words, quoted
in the code's own comments for the OTHER panels) has no way to know this
specific panel silently didn't.

**Not draft-blocking** — the panel still shows a real, correctly-computed
plan against the blend, which is the board Cory will actually draft from
unless he stays on an alternate source. But it is a real inconsistency next
to panels that were specifically built this session to solve exactly this
problem for everything else.

## GAP 2 — NOTHING ON THE BIG BOARD TABLE ITSELF SAYS WHICH SOURCE IT IS

**Code-confirmed, not a live-rendering bug — the data is correct, the
signal is missing.** The `⚠️ THE BOARD IS RE-RANKED ON <SOURCE>` warning
(`public/js/draft/app.js:4839`, and it is a real, well-built warning — bold,
colored, names the missing players) renders **only inside `#proj-source`**,
the toggle panel itself. Verified via DOM query: the warning text is present
in `#proj-source`'s subtree and absent from `#board`'s subtree, both after
toggling to a non-blend source.

`#proj-source` mounts right after `#recs`, near the top of the page (by
design — Cory complained earlier this session that panels mounted too low).
`#board` is a long, separately-scrollable table further down. **The
`overall_rank`/`vorp` numbers ON the board rows are correct and do reflect
the selected source** — that part of Cory's ask is already true. What is
missing is a persistent indicator ON or immediately around the board table
itself, so a reader who scrolls to the table without the toggle panel in
view has no way to tell, from the table alone, whether they're looking at
the blend or an alternate source.

## THINGS CHECKED AND FOUND CLEAN

- **Restoring to blend**: byte-identical, not a re-fetch that could drift.
- **A failed/empty source load**: does not silently strand the UI on a
  source it claims to have switched away from (verified in the source, the
  existing test suite covers this one correctly).
- **`engine.js` does not read `projSource` directly** — it only ever sees
  whatever is currently in `state.board`, which is the single source of
  truth the swap actually writes to. This is the right design (one board,
  one truth) rather than a second parallel state to keep in sync.
- **Replacement level under alternate sources inherits register 148's
  already-known issue** (starter-slot-based replacement, not measured draft
  depth) — expected and not a new defect; every alternate board is produced
  by the SAME `vorp.py` functions the blend uses, so it's the same bug
  surfacing in four more views rather than a new one. Already tracked, not
  re-filed here.

## NOT FULLY RESOLVED, FLAGGED RATHER THAN ASSERTED EITHER WAY

The proj_mean cell's existing superscript marker (¹/²,
`projSourceMark(p)`) reads `state.data.provenance.projections.source` — the
BLEND's own build-time record of which single external source informed an
otherwise-uncovered player, unrelated to the NEW toggle's `projSource`
state. I did not find it rendering anything factually wrong (the blend
value it annotates is preserved as `proj_blend` regardless of the active
toggle), but I also did not fully trace whether it could read as confusing
next to a toggle now showing a different source's numbers in the SAME row.
Named rather than silently left out; not claiming a verdict either way.

## ASK / REC / DEFAULT

`ASK:` A's call on both — wire `loadMlvPlan()` into the source-swap path (or
disable/grey the panel with a label when source != blend, if a per-source
plan file is out of scope before Saturday), and add a compact, persistent
indicator near `#board` itself (even a one-line sticky note is enough) so
the source is legible without scrolling back to the toggle panel.

`REC:` the board-table indicator is the cheaper, safer fix with the higher
payoff — it's the actual page Cory reads pick-by-pick. The MLV-plan wiring
is more valuable but touches a file that was rebuilt three times tonight
(register 146→150→151); I'd rather flag it clearly than patch a fast-moving
file myself two days before the draft.

`DEFAULT:` if nothing changes before Saturday, Cory should be told directly
(not left to discover) that the whole-draft MLV plan panel always reflects
the blend regardless of which source toggle is active, and that the board
table's own rows are correct but carry no visible source label — the toggle
panel above it is the only place that says so.

## FOLLOW-UP QUESTIONS (rule 3g)

- **Does this imply another failure we have not looked for?** Any FUTURE
  panel built against a precomputed JSON artifact (rather than live
  `state.board`) will have the same shape unless it's explicitly wired into
  the source-swap path — worth a house rule, not just a one-off fix.
- **Does it invalidate something already trusted?** No — `proj_source_
  panel.test.js`'s 16 checks all still hold; they test the mechanism that
  DOES work. It's testing the wrong SURFACE for these two findings (static
  text, not runtime DOM/state), which is itself worth naming: a green test
  suite here did not mean "verified," only "the code contains the expected
  patterns."
- **Is it routed to the lane that can act?** A owns `app.js`/the war room;
  both findings and both recommendations are theirs to weigh, not mine to
  ship into a file three sessions have touched tonight.
