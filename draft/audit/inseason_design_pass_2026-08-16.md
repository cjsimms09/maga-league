# In-Season Commissioner Tools Design Pass — 2026-08-16

Cory's directive, verbatim: *"really need to work on design of war room and in
season tools, theyre very amatuerish."* The fidelity gate, verbatim: *"we need
to also be certain the design is actually implementing and explaining what the
model says or the model is useless if I cant implement it."* And the surface
ruling that shaped this pass (2026-08-16, verbatim): *"fyi I will be using this
site from my desktop, so that site is more important. Also allows more room for
the war room design to have more tools if useful."*

This is the middle pass of the ordered three: war room (done, 2026-08-15) →
**this** → member-facing site (charter filed, `docs/queued/member-site-design.md`).
Scope: the four commissioner in-season pages — `/lineup` (+ its `/lineup/accuracy`
face), `/waivers`, `/analyzer`. It inherits the war-room pass's system wholesale
(`warroom_design_pass_2026-08-15.md` §"What the in-season pass inherits"): the
`--wr-*` token layer extended-not-forked, gold = money only, the explainer
contract with the DO half, the verdict grammar, the chart kit, and the
extract-the-shipped-surface fidelity method.

---

## Evidence — before / after (committed, draft/audit/screens/)

| Page | Before | After |
|---|---|---|
| Lineup (live), desktop 1440 / phone 390 | `is-before-lineup-{desktop,phone}.png` | `is-after-lineup-{desktop,phone}.png` |
| Lineup (proof), desktop / phone | `is-before-lineup-proof-*.png` | `is-after-lineup-proof-*.png` |
| Waivers, desktop / phone | `is-before-waivers-*.png` | `is-after-waivers-*.png` |
| Accuracy, desktop / phone | `is-before-accuracy-*.png` | `is-after-accuracy-*.png` |
| Analyzer, desktop / phone | `is-before-analyzer-*.png` | `is-after-analyzer-*.png` |

Harness: `draft/tests/shots-inseason.js` — boots the real app on a temp store,
seeds a mid-season Tuesday entirely through the docs the app actually reads
(`sleeper-cache`, `players-cache`, `stats-cache:*`, the `calibration:*` ledger,
the predledger, a scratch `DRAFT_DATA_PATH` artifact; no module stubbed).
Desktop 1440 is captured FIRST (doctrine §7); phone 390 keeps the war-room
acceptance bar — **zero horizontal overflow, asserted by the harness; zero
console errors** on every capture, before and after, identical seed both times.

## 1. DESKTOP IS THE PRIMARY SURFACE — the pages get room and use it

Doctrine §7 executed. The four pages wear `body.inseason-tools`, which widens
the content column 1100 → 1280px, and every page splits into **side-by-side
panels** (`.is-cols`, explicit column wrappers so the phone keeps its editorial
order; single column below 1100px):

- **Lineup**: DECIDE (the to-do diff, Play This, the model's moves) beside
  RECORD (log, override, the Sunday-alert rehearsal). The before state was one
  narrow centered column with ~400px of dead margin each side at 1440.
- **Waivers**: the verdict beside the priority doctrine; the claims list beside
  the spend card + both capture forms; streaming beside its two forms.
- **Accuracy**: pipeline + calibration (the trust core) beside overrides +
  graded decisions + the Brier-per-run series; recently-graded beside the
  misses; attribution full-width in the dense zone.
- **Analyzer**: the new posture board runs four columns at desktop width.

Phone 390 remains a first-class review surface: stacking order stays editorial
(act → verify → record), and the overflow gate stays green.

## 2. THE ANSWER FIRST — verdicts in the war-room grammar

- **Waivers** now leads with the page's one answer: **CLAIM X — drop Y —
  +N pts (≈ $D at $/pt)**, with a `⚔ CONTESTED` chip when the engine's rival
  read fires, and the page's measured honesty IN the verdict: *"Worth your
  priority spot? Not modelled — your call."* The nothing-week card (whose
  copy is pinned by `waiver_surface`) now wears the ✋ HOLD chip — the one
  stopping answer the tool can give on its own. **Net-points derivation is one
  tap deeper** (`wv-derive`): the bestLineup-diff definition (one baseline,
  never clamped), and the exact arithmetic net × $/pt with the $110/$100
  decomposition — every number on the disclosure is the page's own.
- **Lineup** already had its verdict (CHASE / PROTECT / PENDING) from the
  earlier honest-posture work; it keeps the lead position and gains its ⓘ.
  The optimizer's measured honesty — *finds a better lineup ~11% of weeks,
  ~$9/season, "9 weeks in 10"* — stays user-facing doctrine on the page (it
  was already pinned by `inseason_design.test.js`; this pass pins it AGAIN
  from the guide side so the explainer and the page cannot drift apart).
- **Analyzer**: the answer is the new **posture board** (§3).
- **Accuracy**: the answer is the report card (§4).

## 3. THE ANALYZER POSTURE BOARD — the classification as a board

Zone 1 of `/analyzer` is now a four-cell board — 🔒 Lock / ⚔️ Contender /
🎲 Desperate / 🎯 Chasing $100 — each cell carrying: the plain-words meaning,
**the engine's own cut line** (lock ≥ 85% · contender 30–85% · desperate ≤ 30%
· chasing ≤ 10% — quoted from `standings.js`'s ladder, never re-derived, and
pinned by test against the live constants), the team count, and per team the
playoff-odds bar. The board is **grouped from the same rows the table renders**
— `inseason_surface.test.js` asserts every team appears on the board exactly
once and the four cell counts sum to the field. The full projection table (the
data) stays directly below, and A's honest validation caveat ("don't read the
top four as sharp") still precedes everything.

## 4. THE ACCURACY REPORT CARD — and two measured facts nothing rendered

- The by-kind table reads as a report card: per-kind **hit-rate bar against a
  50% coin-flip hairline tick** (a real benchmark, not an invented grade
  scale), Brier beside its 0.250 coin reference, and thin samples (n < 5)
  labelled *"(thin sample)"* — unproven, not bad.
- **Found by looking (rule 14, display side)**: `byKindRows()` has carried
  `scored` and `mean_edge` on the in-season decision rows since 2026-08-15 —
  the honest "3 of 5 scored" denominator and the measured points edge of the
  decision vs its recorded alternative — and the view rendered neither. They
  now fill a **Scored · edge** column on exactly the rows where they mean
  something, "—" elsewhere.
- Tabular numerals (`.wr-num`) on every stat tile; the Brier-per-run series
  and reliability curve keep their existing honest-trend copy.

## 5. THE EXPLAINER CONTRACT — one table, seventeen panels, pinned

`src/inseason_guide.js` is the single source: every panel on all four pages
explains itself in the war room's four halves — **what** it says / how to
**read** it / what to **DO** with it (the implementation half the fidelity gate
demands) / the cited **src**. Rendered by `views/partials/_wr_explain.ejs` as a
collapsed ⓘ `<details>` (these pages carry no JS layer — the disclosure is
server-rendered), same `.panel-explain` body the war room draws.

The DO halves are decisions, not captions: *"CHASE: start the marked ceiling
plays and accept the variance"*, *"Trade with the desperate — they overpay to
swing a long shot"*, *"Scale your trust to this page: a well-calibrated 60% is
a real 60% — act on it as one"*, *"Weigh the number against your spot in the
waiver order… then log the claim or the hold so the season grades it."*

## 6. CHARTS — additive, from real data

- **The leak chart** (`/lineup?tab=proof`): per-owner bench dollars summed
  across the analyzed seasons, horizontal bars in the validated chart ink
  (navy magnitude, accent for Cory's own bar), dollar values as direct labels
  — one glance where three per-season tables had to be scanned. The tables
  remain untouched below it; the caption says so ("the chart adds the glance,
  the tables stay the record") and the surface test pins both halves.
- The analyzer board's odds bars and the accuracy report-card bars use the
  same `--wr-chart-*` ink; no new series color was introduced, so no new
  palette validation was needed.

## THE FIDELITY SUITES — what the certainty rests on

**111 new checks, all green**, two suites (both `// TERRITORY: A`):

| Suite | Checks | Pins |
|---|---|---|
| `inseason_explainers.test.js` | 71 | four halves present on all 17 entries; every entry rendered by its view (no orphaned caption — the war room's lrm lesson); cited functions exist where cited (12 citation checks against the live modules); analyzer cut lines = `standings.js` ladder read out of the shipped code (0.85/0.30/0.10) in guide AND view; $110/$100 = both engines' live defaults, quoted in guide AND the waiver derivation; chase = `edge >= 1` verbatim; ~11%/~$9 in guide AND page; sims = 3000 real; K/DEF stream filter real; the partial renders all four halves and nothing without an entry |
| `inseason_surface.test.js` | 40 | real app over HTTP, seeded store: token layer linked + body class; waiver verdict (chip, name, net pts, derivation working, $110/$100, no-overclaim line) with all four capture forms intact; lineup to-do diff + 11% honesty + both forms; proof chart present AND the tables it draws still present; accuracy report card (coin tick, scored·edge values, thin-sample label); analyzer board = table (counts sum, one row per team), cut lines, caveat-precedes-numbers, table intact |

Existing pins kept green throughout: `waiver_surface` (22), `waiver_stream_surface`
(15), `lineup_capture_escaping` (10), `inseason_capture_routes` (21),
`capture_failure_is_honest` (8), `override_capture` (32), `c3_lineup_disagree`
(7), `inseason_design` (25), `calibration_surface` (32), `analyzer_surface` (16),
`analyzer_cut_and_week` (10), `route_smoke`, `every_route_renders` (64 routes).
One test-side fix while there: `analyzer_surface`'s `az-prob">` regex anchors the
class attribute, so the tabular-numeral class was moved to CSS rather than the
markup (numeric alignment on these pages comes from `warroom.css`'s
`.roll td.num` rule for free).

## Suite results (final)

- `python3 -m pytest draft/tests -q` → **2340 passed, 5 skipped** (identical to
  the pass's baseline — no Python surface touched)
- `bash scripts/js-sweep.sh` → **284 JS entry points, all green** (282 at
  baseline + the two new fidelity suites)
- Screenshot harness: zero console errors, zero horizontal overflow at 390px,
  both runs.

## Override #5 — every touched file (bookkeeping; TERRITORY.md not edited)

Lane-crossings (B-lane: `views/**`, `src/routes/**`, `public/css/**`, `src/*`):
- `views/lineup.ejs` — two-column restructure, explainers, leak chart (proof face)
- `views/waivers.ejs` — verdict card + derivation disclosure, column split, explainers
- `views/accuracy.ejs` — report card (bars, scored·edge), column split, explainers
- `views/analyzer.ejs` — posture board, cut lines, explainers
- `views/partials/header.ejs` — warroom.css condition widened to the three
  paths; `inseason-tools` body class
- `views/partials/_wr_explain.ejs` — **new** (the ⓘ partial)
- `src/inseason_guide.js` — **new** (the explainer table; view-model only)
- `src/routes/member.js` — the four render calls pass `guide` (display glue only;
  no route logic, no capture payloads touched)
- `public/css/warroom.css` — the in-season section (wrap width, `.wr-exp`,
  `.is-cols`, `.az-board`, `.acc-kind-bar`, `.wv-*`)

Own-lane / A-lane test surface:
- `draft/tests/inseason_explainers.test.js` — **new** (71 checks)
- `draft/tests/inseason_surface.test.js` — **new** (40 checks)
- `draft/tests/shots-inseason.js` — **new** (capture harness + overflow gate)
- `draft/audit/screens/is-{before,after}-*.png` — evidence (20 captures)
- this document

NOT touched, per the hard constraints: scoring/engine CFG, every capture
route's payload (the waiver/lineup/stream hidden fields render byte-identical —
their suites prove it), commissioner gating (unchanged on all four routes,
`requireCommissioner` untouched), `src/routes/lineup.js`, `src/routes/waivers.js`,
`src/routes/standings.js`, `src/routes/accuracy.js` (the accuracy view-model was
already carrying everything the report card needed).

## Found but deliberately not done — and why

- **`docs/queued/war-room-final-pass.md` carries nothing for these pages** —
  read for strays as ordered; every unexecuted item there (A1–A4, B, C, D, E,
  Part 2) is draft-day war-room surface, none of it in-season. Nothing imported.
- **`.btn.gold` renders crimson site-wide** (LOG THIS LINEUP / LOG THIS CLAIM).
  It is the site's shared button language on member pages too, so recoloring it
  is a site-wide identity decision that belongs to the member-site pass, not a
  page-scoped override here. Flagged for that charter's "modern look, keep the
  theme" item.
- **The waivers desktop left column can run shorter than the right** on a
  thin-wire week (one claim). Accepted: masonry-balancing would either reorder
  the phone flow or need JS; the honest column split wins.
- **The analyzer legend card** ("What the postures mean") now overlaps the
  board's content; kept deliberately as the dense-zone reference (it is where
  the cut lines live in prose) rather than deleted — nothing removed in a
  design pass that only had to add.
- **Lineup drill player names** still render as ids pending A's historical
  player map — pre-existing, stated on the page, unchanged.
- **The stream verdict** was not promoted into the top verdict card: a stream
  is a different decision shape (free, weekly) and its card already leads its
  own section; folding it into the claim verdict would blur exactly the
  claim-vs-stream distinction the capture kinds keep separate.

## What the member-site pass inherits from here

1. The `.is-cols` wrappers + `body.<surface>` width pattern for any page that
   earns desktop room (member pages stay phone-first — doctrine §7).
2. The `_wr_explain.ejs` partial + guide-module pattern for server-rendered
   pages without a JS layer; `inseason_explainers.test.js` is the template for
   pinning a guide to its code.
3. The shots-inseason seeding pattern: a whole mid-season world through store
   docs alone — reusable for the matchup/scoreboard/watch captures that pass
   will need.
