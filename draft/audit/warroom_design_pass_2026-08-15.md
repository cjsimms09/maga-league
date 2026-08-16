# War Room Design Pass — 2026-08-15

Cory's directive, verbatim: *"really need to work on design of war room and in
season tools, theyre very amatuerish.. these need to look professional and be
incredibly informative … combining tons of info into a small space while still
looking clean and not too hectic and also having easy access to info if needed
… explain different model behavior and war room tools … a host of options yet
be clear about what it is actually recommending and how confident it is."*

Mid-pass hard gate, verbatim: *"we need to also be certain the design is
actually implementing and explaining what the model says or the model is
useless if I cant implement it."*

The work order was his 21-page rejection capture of the live page
(2026-08-15). The law for feel is `docs/queued/warroom-v2-visual-design.md`;
the in-scope polish items came from `docs/queued/war-room-final-pass.md`.

---

## Evidence — before / after (committed, draft/audit/screens/)

| State | Before | After |
|---|---|---|
| Phone 390×844 | `before-20260815-phone.png` (+ `-depth`) | `after-20260815-phone.png` (+ `-depth`) |
| Desktop 1440 | `before-20260815-desktop.png` (+ `-depth`) | `after-20260815-desktop.png` (+ `-depth`) |
| Keepers CONFIRMED, phone | — | `after-20260815-phone-keepers-confirmed.png` (+ `-depth`) |
| Keepers CONFIRMED, desktop | — | `after-20260815-desktop-keepers-confirmed.png` (+ `-depth`) |

Cory's own PDF capture of production is the canonical "before" for the defect
catalog. All AFTER captures were taken from a clean dev-store boot with **zero
console errors** (harness: `draft/tests/shots-warroom.js`; the only classified
noise is predledger's designed offline-parking notice, matched by exact
prefix). 390px full page with every layer open: **zero horizontal overflow**.

---

## 1. THE VERDICT — one voice over four lenses

The capture showed four unmarked authorities at one pick: TAKE GIBBS (rule) /
paths top Nacua +82.3 / plan wants TE / poll 7-of-7 Nacua. Now:

- `public/js/draft/verdict.js` (**new**, pure, dual-exported):
  `DraftVerdict.derive` maps engine fields → `LOCK / LEAN / TOSS-UP / SPLIT /
  PINNED`. **Every threshold is the engine's own**: contested =
  `gap < CFG.TIE_THRESHOLD` (2.0); coin-flip/close = `CFG.COIN_FLIP_GAP` (1.0)
  / `CFG.CLOSE_GAP` (3.5) via `engine.confidence()` verbatim; the SPLIT band is
  `CFG.PATHS_BAND` (= COIN_FLIP_GAP × 4), the same band the old Two-Reads line
  used. Nothing was invented; nothing was rescored.
- The chip **cannot say LOCK while the engine says contested** — `contested`
  dominates the ladder and `ui_fidelity_verdict.test.js` sweeps the gap axis
  0→8 in 0.1 steps against the live CFG to prove it.
- A real rule-vs-value split backs **the rule** (the page's own measured
  doctrine) and prices the value pick honestly: *"other options: Nacua WR
  +6.3 … composite pts vs the pick (+ = scores higher)"* — units labeled,
  the disagreement displayed instead of arbitrated away.
- A TOSS-UP says, in the required spirit: *"inside the model's noise — your
  call; log which."* False precision was the amateur tell; the chip's words
  are the engine's own honesty about separation.
- The lens row is the "host of options": RULE (measured to earn money) /
  VALUE (biggest points edge now) / PLAN (all your picks together) / POLL
  (7 strategy sims) — each labeled by what it optimizes, disagreement marked,
  artifact polls flagged *"one term, not votes"* from the engine's own
  `driver_is_artifact`. Tap a lens → its source panel.
- The rule headline demotes its duplicate name/take-button/Two-Reads when the
  verdict renders; its detail (reason, bye stack, grab-by timing) remains as
  the rule lens's expansion.

## 2. PROFESSIONAL DENSITY — the design system

`public/css/warroom.css` (**new**, page-scoped via the Chronicle pattern in
`views/partials/header.ejs`). The in-season pass adopts this file — extend,
don't fork.

**Tokens** (all `--wr-*`, mapped onto the site palette in `style.css`):

| Group | Tokens | Doctrine |
|---|---|---|
| Type scale | `--wr-fs-hero 1.6rem · big 1.15 · title .95 · body .85 · sub .78 · micro .7` | one dominant figure per card |
| Spacing | `--wr-s1 .25rem … --wr-s5 1.5rem` | density gradient: zone 1 breathes (`--wr-s4` padding), zone 3 dense (`--wr-s2/s3`, sub/micro type) |
| Palette roles | `--wr-money` (= site gold) **money only** · `--wr-structure` (navy) authority · `--wr-good/--wr-bad` the one semantic pair · `--wr-warn` amber prose · muted everything else | gold never colors a non-dollar figure; the take action wears navy (red = alarm, gold = money, action = neither) |
| Chart ink | `--wr-chart-main #2a5f9e` · `--wr-chart-room #eb6834` (validated pair) · `--wr-chart-dim` · `--wr-chart-grid` | dataviz-validated; see §5 |
| Numerals | `.wr-num` → `font-variant-numeric: tabular-nums` for columns; hero figures stay proportional | aligned numeric columns everywhere (`.roll td.num`, `.rec-stats`, dossier, grids) |

**Components**: `.wrv*` (verdict block, chips, lens row), `.wr-info` +
`.panel-explain` (ⓘ explainer), `.wr-flag` + `.wr-flag-legend` (badges),
`.rec-dossier`/`.rec-expand` (row dossier), `.wr-chart` + `.wr-branch-grid`
(charts), `.roll tr.tier-cliff`/`.tier-note`/`.onesie-demoted` (board),
`.wr-help` (manual). Motion: state changes only; `prefers-reduced-motion`
respected.

Also fixed at this layer: the sticky board header/name column painted
`--navy-deep` (dark-era leftover) rendering names invisible on the light
theme.

## 3. PROGRESSIVE DISCLOSURE — everything one tap deeper, nothing removed

- **Shortlist dossier**: every rec row gets `▸ dossier` → the engine fields
  already on the scored entry: `components.weighted` decomposition (zero terms
  omitted), market survival labeled by model, rails, reasons, board-facts
  (labeled *not the reason*), and the engine's confidence sentence.
- **Badges**: flags render as fixed-short-form chips (no more "QUESTI0"
  clipping) whose tap opens a truthful legend; `¹`-class caveat markers carry
  their text on every occurrence (`data-caveat-text`) and are tappable —
  titles don't exist on phones.
- **Explainers**: collapsed to a visible ⓘ; openness survives re-renders.
- **Noise collapse**: 14 identical "seat mapping unavailable" blocks → one
  honest line + `<details>` with every row preserved; the control case (seats
  assigned) renders flat. Alarm banners are unchanged in mechanism but the keeper banner
  gained the A3 progress line ("N of 10 teams designated", derived from the
  same slate the banner asks about).

## 4. THE MODEL EXPLAINS ITSELF — truthfully, and pinned

`PANEL_GUIDE` (app.js) rewritten and extended to 8 entries — verdict,
recommendations, position_recs, survival, threats, lrm, paths, branches —
each with **four halves**: `what` / `read` / **`do`** (the implementation
half, e.g. *"LOCK: take it and bank the clock time … TOSS-UP: use your own
read, and log which you took so it grades"*) / **`src`** (the cited code).

**A live wrong explainer was found and killed**: the shipped `lrm` entry
described *"the last recorded model state — what the board believed at your
previous pick"* — a panel that does not exist; the strip renders
survival-derived deadlines. Rewritten from `computeLRM`'s actual semantics.

Source-of-truth citations per explainer (each pinned by test):

| Panel | Source of truth |
|---|---|
| verdict | `verdict.js derive()`; `engine.js confidence()` + CFG bands |
| recommendations | `engine.js recommend()/scorePlayer()`; CFG.TIE_THRESHOLD |
| position_recs | engine scored list, per-position slice |
| survival | `survival.js survivalProbability()/conservedSurvival()`; `engine.js survival()` accessor |
| threats | `engine.js threatBoard()`; `survival.js positionProbabilities()` |
| lrm | `app.js computeLRM()` over engine survival |
| paths | `engine.js computePaths()`; CFG.PATHS_BAND (= COIN_FLIP_GAP × 4) |
| branches | `engine.js branchForecast()/expectedBestAvailable()` |

**Help view** (`#help-card`, "How to run draft night with this page"):
assembled from the *same* PANEL_GUIDE table + the chip glossary — the manual
cannot drift from the captions (pinned).

## 5. CHARTS — his explicit ask, from real data

`public/js/draft/charts.js` (**new**, pure string builders):

- **Tier cliffs** — VORP by positional rank, small multiples, shared scale,
  dashed cliff edges, last-of-tier direct-labeled.
- **Gone chart** — market vs room model side by side for the at-risk names;
  the legend says which number the score uses and why identical market bars
  happen. Palette pair passed `validate_palette.js` (CVD ΔE 22.1, normal
  33.7, contrast ≥3:1).
- **Branch grid** — IF-YOU-TAKE as a sequential-ink delta matrix (exact loss
  in every cell, full engine row in the tooltip) replacing four repeated text
  blocks.

## Fidelity bugs from the capture — diagnosed and fixed

1. **The 42% wall**: chips print `survival_to_next` (ADP model through the
   conservation tilt — elites past ADP all lift to the *same* redistributed
   value; measured: 0.691 uniform for Gibbs/Robinson/Nacua/CMC). Threats print
   `threatBoard` (room model, genuinely differentiating). Both engine outputs;
   the defect was one caption for two models. Each now names its model; the
   gone chart shows both; the survival explainer explains the artifact in the
   tilt's own words ("fixes the total, not the ordering").
2. **Adjuster contradiction**: slider values are live auto-policy; captions
   describe measured defaults. `syncSliders` now prints *"(auto for this
   round — measured default 0.0)"* beside any moved value, reading the default
   from the EJS's own `value` attribute.
3. **Board**: sentinel ADPs (`adp_source=search_rank`) render as `—` with the
   reason tappable, never as market numbers; K/DEF demoted below skill players
   in the All view with a one-line why; tier-cliff hairlines +
   "last of T1 WR" markers; `¹` explained on tap.

## THE UI-FIDELITY SUITE — the number Cory's certainty rests on

**137 checks, all green**, in four suites (pattern: extract the shipped
renderer, feed known engine outputs, assert the displayed value equals the
engine field):

| Suite | Checks | Pins |
|---|---|---|
| `ui_fidelity_verdict.test.js` | 31 | chip ladder swept vs live CFG (LOCK×contested impossible); real-board gap/alternatives/confidence = engine fields; rendered markup = derivation |
| `ui_fidelity_numbers.test.js` | 36 | chip % = survival_to_next; threat % = threatBoard.gone; sentinels never numeric; demotion order; slider markers; dossier = components.weighted; badge legends pinned to engine lines (−12 injury, cliff 27, ±6 opp, risk ships 0) |
| `ui_fidelity_explainers.test.js` | 49 | every do/src present; cited functions exist where cited; TIE_THRESHOLD & PATHS_BAND quoted in copy = live CFG values; mechanism claims grep their code lines; help = same table |
| `ui_fidelity_charts.test.js` | 21 | marks/titles/labels = fed values; absent renders absent; models named; validated palette shipped |

## Suite results (final)

- `python3 -m pytest draft/tests -q` → **2286 passed, 5 skipped**
- `bash scripts/js-sweep.sh` → **272 JS entry points, all green** (includes
  robot-mock **146/146**)
- Browser rehearsals: `rehearsal-mock3` **19/19** · `rehearsal-config-screen`
  **13/13** · `rehearsal-exp33-banner` **7/7** · `rehearsal-keepers` **6/6**
- Three rehearsal-mock3 expectations were stale **at the merge baseline**
  (verified by running the rehearsal at 37b1a307 before any design change):
  card census 17→18 (grew in merged work), the clock assertion predating the
  prep-anchor contract, and two dev-environment noise classifications. Each
  updated with the measurement in a comment.

## Override #5 — every touched file (bookkeeping; TERRITORY.md not edited)

Lane-crossings (`views/**`, `public/js/draft/**`):
- `views/admin/warroom.ejs` — verdict host, tier-cliff host, help host
- `views/admin/_warroom_scripts.ejs` — verdict.js + charts.js script tags (A's seam)
- `views/partials/header.ejs` — page-scoped warroom.css link
- `public/js/draft/app.js` — renderVerdict, disclosure layer, PANEL_GUIDE,
  renderHelp, survival/threat labeling, board fixes, slider markers, keeper
  progress line, chart wiring
- `public/js/draft/verdict.js` — **new**
- `public/js/draft/charts.js` — **new**

Own-lane / shared:
- `public/css/warroom.css` — **new** (design system)
- `draft/tools/panel_spec.js` — renderVerdict + renderHelp entries;
  renderPositionRecs re-tiered
- `draft/tests/ui_fidelity_{verdict,numbers,explainers,charts}.test.js` — **new**
- `draft/tests/shots-warroom.js` — **new** (screenshot harness)
- `draft/tests/rehearsal-mock3.js` — stale expectations updated (documented)
- `draft/audit/screens/*` — before/after evidence

## What the in-season pass inherits

1. **The token layer** — link `warroom.css` (widen the header.ejs condition),
   use `--wr-*` type/spacing/palette roles and `.wr-num`; gold stays
   money-only site-wide.
2. **The explainer contract** — a PANEL_GUIDE-shaped table per page with
   what/read/**do**/src, the `.wr-info` collapsed-ⓘ treatment, and a fidelity
   test pinning every load-bearing claim to the code it paraphrases. Wrong
   explainers are worse than none — this pass found one live.
3. **The verdict grammar** — LOCK/LEAN/TOSS-UP chips derived from whatever
   model quantity owns that page's confidence (never invented thresholds);
   lens rows for multi-voice pages (lineup optimizer vs projections is the
   obvious next candidate).
4. **The chart kit** — `DraftCharts` mark discipline + the validated palette;
   run the dataviz validator before adding any series color.
5. **The fidelity method** — extract-the-shipped-renderer + known-input
   assertion (the seat_panel_markup pattern, now generalized in four suites).

## Known gaps / notes for the next pass

- The **compare tray, doctrine banner, MVS and clock (one-answer) surfaces**
  kept their existing treatments — they are coherent but not yet on the token
  layer.
- `coherence.js` (A's one-voice resolver) is loaded and still uncalled by
  app.js; the verdict block covers the same ground from display-side
  derivation. Whether coherence.resolve should *feed* the verdict is A's call
  — flagged, not wired, per the no-engine-changes rule.
- The keeper A3 items "auto-refresh as teams lock" and "morning-of re-verify"
  need server data the client doesn't have; the progress line ships from the
  slate the client does have.
- Dev-store rehearsals write picks server-side; the screenshot harness
  documents that captures need a fresh store (END DRAFT clears too much —
  keeper attribution goes with it).
