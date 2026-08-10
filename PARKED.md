# PARKED — the lane belongs to the mock blockers

**Standing rule (Cory, 2026-08-08):** *from now until mock #2 runs clean, the
blockers own the lane exclusively. Legality strip, need bug, path labels,
nothing else. Park every incoming spec, registration, and doctrine question —
**including anything I send** — and say it is parked. If I ask for science
before mock #2 is green, remind me of this instruction.*

**THE LANE:** ① legality/roster strip → ② need bug → ③ path labels → **mock #2
green** → this queue reopens, top-down.

---

## Parked queue (FIFO unless Cory reorders)

| # | item | why it waits |
|---|---|---|
| 1 | **D11 diagnostic batch** — decompose the swing · verify the 12/12 bracket reproduction wasn't fitting · null baseline on the new grader · heterogeneous-room confirmation | science; D11 is HELD meanwhile, nothing installed. *Partial answer to check 3 already recorded in `DECISIONS-NEEDED.md` from data in hand — no compute was needed.* |
| 2 | **In-season instrumentation** (PredLedger in-season kinds + roster-move journal) | hard date 2026-09-01; ledger-kinds slice ships before the final mock |
| 3 | **Deviation budget display** (= mock-#1 fix #3, ADP-deviation explainer; = Anchor Doctrine §2) | buildable now, but it is a 4th item and the lane holds 3 |
| 4 | **Anchor Doctrine §4** default-to-market fallback | needs no reliability weights; still not a blocker |
| 5 | **Consensus §2** dispersion badge (real-ADP pool only) + **§3** format-match check | ditto |
| 6 | **Experiments 33 · 34 · 35 · 36 · 37 · 38** | all registered, all gated, none running |
| 7 | **Exp 31** 2026 delta board render | waits on `sleeper_rank` populating in a CI rebuild |
| 8 | **Rehearsal keeper mode** · **mock platform-board sampling** · **sync diagnosis** · **session plumbing / hard reset** | from the mock-#1 batch; below the three blockers by Cory's own ordering |
| 9 | **Site optimization Phase 2** | post-draft by its own spec |
| 10 | **THE LEARNING ENGINE** (received 2026-08-08, verbatim below) — ① continuous weekly re-grading that moves displayed confidence tiers on its own · ② hypothesis generation from residuals, auto-proposing registry entries as pre-registered experiments · ③ the Annual as the sole install gate for Tier-2, Tier-1 auto-installing through the gates, Tier-0 free | post-draft; ① and ② both need a live season's weekly outcomes. **⚠️ FLAG: the "Learning Constitution" and its Tier-0/1/2 taxonomy are referenced as existing but are NOT in the repo** — no file mentions them. Either it was never filed or it is in a message that did not arrive. That taxonomy is load-bearing for ③, so it must land before this is buildable. |

### Item 10 verbatim (so the spec is not paraphrased when it is finally built)

**(1) CONTINUOUS RE-GRADING** — every week, automatically re-run the calibration
passes against the new week's outcomes: survival accuracy, projection error by
position, lineup-policy capture, doctrine performance vs Balanced. Update the
confidence tiers on every surface accordingly. *"The tool's displayed certainty
should move on its own as evidence accumulates: a term that keeps being right
gets louder, a term that keeps missing gets quieter, automatically, within
Tier-1 bounds."*

**(2) HYPOTHESIS GENERATION FROM RESIDUALS** — weekly, scan where the model was
most wrong (biggest projection misses, blown survival calls, **overrides where
Cory beat the recommendation**) and auto-propose registry entries for the
patterns — *"model underprices rookie WRs after week 6"* — each entering as a
**pre-registered experiment with criteria, not as an installed change**. *"The
system should notice its own failures and turn them into questions without being
asked."*

**(2b) HYPOTHESIS PROVENANCE + SEPARATE HIT RATES** (added 2026-08-08) —
residual-generated hypotheses are **tagged as such**, and the Annual reports the
**hit rate of machine-generated vs human-generated hypotheses separately**.
*"If the scanner's proposals never clear the gates while human ones do, that's
worth knowing rather than assuming."*

*(Method note for the build: the two streams must face the IDENTICAL gates, or
the comparison measures gate leniency rather than hypothesis quality. And the
volumes will diverge hard — a scanner can propose dozens a week where Cory
proposes a few a season — so report **rate with n**, never rate alone. A
scanner at 2/60 and a human at 2/3 have the same numerator and opposite
meanings.)*

**(3) THE ANNUAL AS THE INSTALL GATE** (already specced) stays the **only** path
from proposal to installed change for Tier-2 items; Tier-1 auto-installs through
the gates; Tier-0 flows freely. **January deliverable: what it learned, what it
proposes, what it retired — and the honest count of hypotheses that DIED,
because a learning system that only ever adds is memorizing, not learning.**

*(Notes for the build, not changes to the spec: ② has an existing feeder — the
ledger already captures `override` with its one-tap reason and `recommendation`
at decision time, so "overrides where I beat the recommendation" is a join over
data we will already have, not new instrumentation. ①'s survival-accuracy pass
also exists as `replay.js calibration()`. The genuinely new pieces are the
weekly scheduler, the residual scan, and the tier-update write path.)*

## Tails received 2026-08-08 — filed with their items, NOT acted on

**① SYNC** (item 8) — *"…auto-fall-back to manual mode with a clear banner after
a short timeout; **a spinner that hangs is the worst possible draft-night
behavior**."* Plus: **instrument the sync path to log its own timings**, so the
next mock reports the hang duration rather than relying on memory. *(This also
answers the question I could not: the hang duration is unknown, and the
instrumentation is what makes it knowable next time.)*

**② REHEARSAL KEEPER MODE** (item 8) — *"…use the predicted slate to pre-remove
predicted opponent keepers from the rehearsal board, so **the value landscape at
my picks resembles draft night instead of a full pool**. Label it: `rehearsal
board — predicted keepers removed`."* Note when built: `predicted_keepers.json`
already exists and `cory_conditional.py` already resolves opponent keepers onto
the pool, so the data path is proven — this is a client-side board filter plus a
label, not new ingestion.

**③ PLUMBING** (item 8) — *"…verify that guard isn't what's swallowing the
action"* — **the END DRAFT confirmation guard from the §D safety pass may be
intercepting the press and never completing; check that path specifically.**
Named suspect, first thing to test.

## → FOR SESSION B (site lane) — CSS polish requests
_Per TERRITORY rule 6, the reverse direction: A adds markup + class hooks, B owns
`public/css/**`. These are cosmetic-only; the features work unstyled today._

- **Stack line + badge CSS (grind #4, landed 2026-08-08).** New Zone-2 markup in
  `views/admin/warroom.ejs` (`#stack-card`, `#stack-line`) and rec-card class
  hooks in `app.js`: `.stack-line`, `.stack-head`, `.stack-row`, `.stack-more`
  (a `<details>`), and `.rec-stack-badge`. The badge carries a single inline
  accent (`color:#f5c445`) as a stopgap so it reads as a badge, not body copy —
  **please move it into the design system** and drop the inline style. Match the
  quiet register of `.lrm-strip`: this is a LEAN, it must never out-shout the
  installed surfaces. The `#stack-class` sub-label prints the evidence class
  ("LEAN, not installed") — style it as a caveat, not a feature tag.
- **Movement line CSS (grind #4, landed 2026-08-08).** New Zone-1 markup
  `#movement-line` (under the Paths panel) with classes `.movement-line` and
  `.movement-mark` (the arrow/approx glyph). One thin line, replaced never
  accumulated — it should read as the model murmuring, quieter than the
  recommendation above it. No inline styles used; it inherits body text until
  you style it.

## Already landed, not parked
- **Claim-integrity doctrine** (`CLAIM-INTEGRITY.md`) + the three guards —
  shipped before this rule took effect; re-sent instruction needed no new work.

## Found by the mock-#3 dress rehearsal 2026-08-08 — measured, NOT fixed

**⑪ THE REMAINING 1.9s PER OPPONENT PICK.** The survival memoisation took a
marked opponent pick from **6.0s to 1.9s of synchronous main-thread block**
(3.2x, bit-identical numbers — see `survival-memo.test.js`). What is left is the
model's inherent cost: ~1700 board players x ~24 intervening picks, now flat
across the profile with no single hotspot above ~430ms. Two ways further, both
of which change behaviour and so are NOT being done unattended:
  - score survival only for the players actually displayed, rather than the
    whole board (VONA reads it broadly — needs a call-graph audit first);
  - move the recompute off the click path entirely and render a visible
    `recomputing…` state, never a silently stale number.
At 1.9s x ~135 opponent picks this is still ~4 minutes of frozen UI across a
draft. Worth doing; not worth guessing at.

**⑫ TAP TARGETS UNDER A FIXED OVERLAY.** `#arm-alerts` is `position:fixed`,
`z-index:150`, occupying x=1266-1426 at the bottom of a 1440px viewport. The
board's "✕ / ➕ Me" buttons centre at x≈1260 — **six pixels of clearance**. At
other viewport widths, or with a scrollbar, that overlay will sit on top of the
row-level draft actions and eat the tap. Dropped taps on those two buttons are
precisely how mock #2 ended with a drifted roster, so this is the same class of
defect as the 6-second freeze, not a cosmetic one. Fix is cheap (move it, or
make the board's action column un-overlappable); it needs a width sweep to
verify rather than a single-viewport spot check.

**⑬ THE WAR ROOM FETCHES FONTS FROM GOOGLE.** The only failing request in the
whole rehearsal was
`fonts.googleapis.com/css2?family=Archivo…&family=Inter…` (ERR_CONNECTION_RESET
under the sandbox's egress block). It degrades to system fonts rather than
breaking, so this is not urgent — but it is a render-blocking external
dependency on draft night, on whatever wifi the room has. Self-host the two
faces and the dependency disappears.

## ⑭ THE COMMAND CENTER — filed 2026-08-08, build AFTER the draft-critical sequence

Cory's private in-season page, same access gating as the war room. **The
in-season tools deserve the same rigor as the draft tool, and the evidence says
they are worth more** — L0 measured $445–595/team/season left on the table by
lineup decisions alone, against a draft edge that is currently unmeasured
(exp 34) and deviating on 100%-LEAN evidence.

1. **ONE PAGE, MY EYES ONLY** — the season's war room, same composition
   discipline: what to do now, why, what's close, who disagrees, everything else
   one tap down.
2. **THE ALWAYS-VISIBLE LINE-UP** — Sunday's start/sit calls with dollar framing
   (ΔP(win) and ΔP(weekly high)·100 dollars) · this week's waiver/FA targets
   ranked with claim-order strategy and the clear-time alert · money position
   (banked, projected, rank) · the week's high-point threshold vs my projection ·
   alerts (injury, role change, an uncovered starter on bye).
3. **SAME EPISTEMICS AS THE DRAFT TOOL, non-negotiable** — every recommendation
   carries its confidence sentence, evidence class, market/consensus comparison
   and near-misses; every piece of advice writes to the ledger at decision time
   with its counterfactual; **nothing renders in a voice its evidence doesn't
   support.** (The `EVIDENCE_STATE`-derived sentence already generalises here.)
4. **SELF-TESTING AND SELF-UPDATING** — the sanity-sweep harness applied to
   in-season advice: never recommend an illegal lineup, never claim a player I
   cannot roster, never stream against a bye. Plus weekly re-grading that updates
   the confidence sentences automatically as the season produces evidence.
5. **THE LEARNING LOOP LIVE** — weekly residual scanning (where were we most
   wrong), auto-proposed registry entries, and the attribution table filling in
   with real dollars per component.
6. **BUILT AND REHEARSED BEFORE WEEK 1** — dry-run against 2023–25 replayed
   weeks, and rehearse a full simulated game week. **The first live Sunday must
   not be the first Sunday the tool has ever run.**

*Dependencies worth noting now: (3) inherits the tier-sentence SSOT and the
ledger's decision-time rail, both of which exist. (4) is the sanity sweep
retargeted — the harness pattern is proven. (6) collides with the 2026-09-01
in-season instrumentation hard date; sequence them together.*

## ⑮ THE ORGANISM TEST — filed 2026-08-08, build WITH the in-season tools

An end-to-end assertion that **a decision made in one half is visible and
gradeable in the other.** Not a diagram, not a claim in a README — a test. **If
any link is broken, the build fails.** Same standard as the doctrine wiring:
one organism has to be *provable*, not assumed.

### The three links

| # | link | direction | status |
|---|---|---|---|
| **A** | a draft pick's **shadow roster** scored by **in-season results** | draft → season | ⛔ needs the season / in-season grading |
| **B** | an **in-season efficiency measurement** changing a **draft-side opponent projection** | season → draft | ⛔ needs in-season measurement |
| **C** | a **January verdict** updating `EVIDENCE_STATE`, which changes a **draft surface's confidence sentence** | season → draft | ✅ **PROVABLE TODAY — seeded now** |

### Why C is already real

`EVIDENCE_STATE` → `tierVoice()` → `tierLine()` → the rendered badge was built
2026-08-08 with exactly this property: `recordEvidence(34, ...)` rewrites every
surface showing a tier, and the badge reads it **live** rather than snapshotting
the wording. That is precisely link C's mechanism — a verdict from the season
half changing what the draft half says about itself.

So C is asserted now, in `draft/tests/organism.test.js`, as the **seed and the
pattern**: the organism test is not a future aspiration with three empty rows,
it is one proven link with two pending. A and B join it as their halves land.

### The standard each link must meet

Not "the data flows" — **the OUTPUT CHANGES.** A link that passes data which
nothing consumes is the doctrine bug again: a truthful-looking wire attached to
a computation it does not touch. Every link asserts a *visible behavioural
difference*, the same way the doctrine guard scores the same board twice and
compares rankings rather than grepping for a word.

## ⑯ THE PORTFOLIO DOCTRINE — spec received 2026-08-08

Full text: `docs/queued/portfolio-doctrine.md`. The earlier placeholder here is
superseded; the document arrived and nothing was reconstructed.

**Queue position:** behind tilt → Stage 3 boundary → exp 34 → tree, with step 1
(measure covariance) explicitly excepted and already running in CI.

**Why it matters more than its position suggests (spec §6):** if it works it
SUBSUMES the stack bonus, the bye-collision penalty, the flex-marginal fix, the
ceiling term's role, and the Money Meter's crude proxy — five hand-built
approximations of one quantity, replaced by the quantity itself. Fewer terms,
each measured, rather than more terms each guessed. That is the opposite
direction from everything else in the queue.

---

## ▶ SESSION B → A REQUEST (2026-08-09): Sleeper data for the matchup-page upgrade

The matchup-page upgrade (site backlog #4) needs `src/sleeper.js` (A's lane) to expose, per matchup:
- **per-player starter points** (not just team totals) — for the starters-with-points view;
- **projections** (pre-game / in-week) vs **live** vs **final** state, with a staleness signal so a stale copy never renders as live;
- **this week's league-wide high-point value + band** (the harvested winning band, e.g. "144 leads; typical winning score 139") and each team's distance to the $100.

B will build the view/route/one-tap-side-bet side against whatever shape A returns. Flagging rather than editing sleeper.js.

**UPDATE (2026-08-10, B): starter points no longer blocked on A — built in B's lane.**
The Starters card now assembles itself from the raw Sleeper bundle member.js already
holds (`sData.matchups[].starters` + `players_points`, slot order from
`league.roster_positions`) via the new B-owned `src/matchup.js` — paired BY LINEUP
SLOT (QB vs QB), which also fixes the old row-index pairing bug (my QB had lined up
across from their WR). So bullet 1 (per-player starter points) is DONE without a
sleeper.js change. **Still wanted from A:** bullet 2 — per-player **projections** with
a live/final **staleness** signal; when A returns a `{me:{pid:proj}, opp:{pid:proj}}`
map on `liveMatchup.proj`, `pairStarters` already wires it through and the Proj column
lights up (no further B change needed). Bullet 3 (high-point band) already served from
the harvested band.

**Also (2026-08-10, B): the pinned "DRAFT DAY" alert text is now DERIVED** from config
(`draft_date`/`draft_time`/`draft_location`) via `dashboard.draftAnnouncement()`, and the
home route self-heals the stored alert to it (the old seed text said "5:00 PM" and named
no place). **→ A, small:** the hardcoded strings in `src/data.js` seed (line ~105) and
`src/helpers.js` `DRAFT_DAY` (~75) still hand-type "08/22/26 at 5:00 PM" — please derive
them from config too (or drop them, since B re-pins on load) so a FRESH install doesn't
reintroduce the stale 5pm string. Not urgent: B's self-heal corrects any live store on
the next home load.

### ADD (2026-08-09): per-player BYE WEEK on `rosterView` rows — for the lineup guard

The in-season lineup sanity sweep (`draft/tests/lineup_sanity.test.js`) found a real,
current hole: the optimizer is projection-driven with no calendar, and the live
path's fallbacks (`season-avg`/`last-week`, member.js `liveOptimizeFor`) hand a
player who is **on bye** or **ruled OUT** a full positive projection — so the tool
would recommend *starting a benched player*.

- **INJURY arm — FIXED in B now.** `rosterView.rows` already carries `inj`
  (injury_status). `lineup.activeProjection()` (new, B-lane) zeroes a player whose
  status means "not playing" (Out/IR/PUP/Sus/NA/DNR/COV/RES/DNP); Questionable/
  Doubtful pass through (uncertainty is priced by the variance model). Wired into
  `liveOptimizeFor`. No A dependency.
- **BYE arm — needs A.** There is no per-player bye source in `rosterView` today.
  The guard already checks `row.bye === weekBeingOptimized` and is a **no-op until
  the field exists** — it activates automatically the moment `rosterView` rows carry
  a `bye` (integer NFL week). Please add it (Sleeper's players DB has team bye weeks).

Until then a bye player is only protected if the projection source happens to zero
him; with season-avg it does not. This is the one known in-season correctness gap.

---

## ▶ SESSION A (model lane) — deferred increments after the 34-dollar/36/33/41 batch (2026-08-09)

These are ACKNOWLEDGED and scoped, not dropped. Ordered by the resume list.

1. **EXP 41 — the paired-room money race (egress increment).** The combiner core is
   BUILT + tested (`exp41.py`, `test_exp41.py` 9/9): calibration-weighted Borda
   aggregation, agreement-as-confidence, the structural "deviate only on a weighted
   majority" collapse rule, intervention-rate-vs-74%. DEFERRED: feed it each of the 8
   profiles' per-pick rankings by scoring the board under each `strategies.js` PROFILE
   through the replay path (Node + nflverse/FFC), then race ensemble-vs-composite
   money-graded behind the green bridge gate, null + LOSO, same gates as the
   tournament. Weights = each profile's Lab-measured accuracy (tournament paired
   dollar edge and/or exp 36 per-cell efficiency). Pre-registered: ensemble deviates
   LESS often; if not, profiles aren't diverse — that's the finding.
2. **Auto-adjuster conditional mining on heterogeneous rooms** — mine which room
   conditions (heterogeneity, run state) predict when a deviation pays, from the
   tournament/heterogeneous-validation corpus.
3. **WHAT WOULD HAVE WORKED** — every registered strategy/doctrine against the 3
   historical drafts, which earned most each year, whether any is consistently ahead.
   Reuses the dollar-arm value-greedy grader + strategies.js profiles.
4. **upsideBonus endgame gated sweep** — the one residual dead-term flip
   (upsideBonus endgame 1.6), measured via a gated tournament sweep, not a blind flip.
5. **Dynamic seam-consumer guard · DOCTRINE DRIFT line · movement LOG + ledger kind ·
   covariance rho verdict** when CI lands it.

**A measured agenda the batch produced (for whoever calibrates Stage 2):** exp 36 says
early-round ADP is WEAK (shrink ~0.12–0.26 for R1-3 RB/WR) and mid/late pockets are
strong (R4-7 QB 0.58 / TE 0.62, R12+ WR 0.72) — the shrinkage should be region-specific
and in places INVERTED from the "bind hard early" prior. exp 33 says our BLEND
over-regresses (loses to naive on top-decile). exp 34 says value-only rosters lose money
to ADP's positional construction. Through-line: **evaluation ≠ construction; the blend's
regression is too strong; the anchor should come from measured per-region efficiency
(exp 36) and member agreement (exp 41), not a flat gate.** None of this ships without the
gates.
||||||| e148a67

---

## ▶ SITE DESIGN BRIEF (Cory, 2026-08-09) — acknowledged, in progress (Session B)

**Received mid-grind; captured verbatim so nothing is lost. Mostly B-lane; the
side-bet state machine (§5) touches `src/sidebets.js` = A's lane → coordinated
below.** Order of attack (B): finish the lineup-optimizer boundary → perf
BASELINE (measure-first) → design-system tokens (spacing/type/card/button/money
color) → page-by-page redesign (home, standings, team, matchup, finances, side
bets, history+subs, locker, voting, rules, dashboard) → data-viz (sparklines,
rank arrows, weekly-high progress, money color) → easter eggs → side-bet flow.

**THE HARD CONSTRAINT: nothing gets deleted.** Every number/table/feature stays.
Hierarchy, density, polish — not subtraction.

**§1 DESIGN** — page by page: one dominant element, everything subordinate, ref
one tap down. Intentional americana (navy/gold/eagle/stars), consistent
spacing+type+card+button scale. Mobile-first (Cory on a phone): no horizontal
scroll, thumb tap targets, nothing important 3 folds down. Motion means state
change, not decoration. Everything legible on sight; label any bare number.

**§2 DATA FUN** — sparklines on trends (pts/wk, money/season, efficiency); money
color-coded consistently site-wide (up/down, same treatment); rank-movement
arrows in standings; weekly-high progress rendered VISUALLY (biggest prize,
currently invisible); small charts where a table says less; records/superlatives
as a record book.

**§3 PERFORMANCE** — measure FIRST (page weight, phone-viewport load, interaction
latency, bundle size, anything loaded a page doesn't need), fix real bottlenecks,
report before/after. No guessing.

**§4 DETAIL + EASTER EGGS** (league voice: crude/funny about FANTASY only, no
slurs, nothing genuinely political):
- Chiefs/Mahomes woven in (fires on a Chiefs player drafted/big score; a Mahomes
  reference somewhere unexpected; arrowhead-red accents sparingly).
- "Back to back world war champs" for the two Germans (David, Marian) — hidden,
  rewards discovery.
- Bates reaching for Chiefs players — small badge/counter when data supports it.
- 2022 asterisk does something clever on hover/tap — a footnote that argues with
  itself.
- Balls and Wieners origin appearing somewhere unexpected.
- Hidden counter of Cory's benched points (the league's funniest ongoing tragedy
  — NOTE: the lineup optimizer already computes this; wire it here).
- A Konami code / long-press on the eagle / five taps on the star row → something
  ridiculous.

**§5 SIDE-BET WORKFLOW REDESIGN** (flow, not form) — **coordination with A on
`src/sidebets.js`:**
- PROPOSING: from anywhere an opponent appears (matchup/standings/franchise), one
  tap "bet him", opponent pre-filled, stake + plain terms + deadline, 15s total.
  *(B owns these surfaces + routes; the matchup one-tap already ships.)*
- ACCEPTING: pending invitation, accept/decline. **Unaccepted = PROPOSED, not
  OPEN.** *(sidebets.js already distinguishes; the wording "OPEN" on a market
  listing vs "PROPOSED" on a named bet must be enforced in the views.)*
- LIVE: shows on both parties' screens with terms + live scores where Sleeper
  determines it.
- SETTLING (design carefully): either party DECLARES outcome → other CONFIRMS;
  until confirmed = **AWAITING CONFIRMATION** to both; on confirm → settle
  (ledger records, both grids update, loser gets winner's Venmo + amount). If they
  disagree → stays open + **DISPUTED** (site records, doesn't adjudicate; visible
  dispute = social pressure). Where Sleeper objectively decides → offer auto-settle
  but BOTH still confirm; never settle silently.
- **THE LEDGER IS THE POINT:** every state change recorded with who+when —
  proposed/accepted/declined/declared/confirmed/disputed/settled/paid. Immutable.

  **⚠️ A-LANE FLAG (`src/sidebets.js`):** the new states DECLARED / AWAITING
  CONFIRMATION / DISPUTED and the declare→confirm handshake are a state-machine
  extension in sidebets.js (A's file per territory-check). Requested: add
  `declare(id, owner, outcome)` (sets AWAITING_CONFIRM + records declarer),
  `confirmSettle(id, owner)` (→ SETTLED, builds legs), `dispute(id, owner)` (→
  DISPUTED), each pushing an audit row. B builds all the views, the settle/confirm
  routes, the Venmo-handoff, and the live-score rendering against whatever shape A
  returns. Flagging rather than editing sidebets.js.

**HOW TO WORK IT:** screenshot key pages before/after; page-by-page; commit at
every boundary; tell A when to deploy so Cory can look.

**CORRECTION (Cory, 2026-08-09):** the "act as a designer, not a feature builder"
framing is WITHDRAWN. Build whatever makes the site better — new components, a new
side-bet interface, new charts, unasked-for improvements (say why). Only
constraints: nothing that works breaks · no info lost · territory holds (B lane,
never draft-surface, never deploy) · league voice. Take real liberties. Before/
after screenshots per change; tell A when to deploy. → The lineup-optimizer page
folds into this as a new feature page.

---

## ✅ RESOLVED (A, 2026-08-09) — access flag cleared; the "leak" reading was superseded

**Cleared so it stops alarming.** The FINAL rule is TOOLS vs HISTORY (`ACCESS-RULE.md`),
not raw-data vs analysis: the history pages' all-play / efficiency / bench analysis is
**LEAGUE-VISIBLE** (good writing, the league's shared record), NOT a leak. Only the
TOOLS are commissioner-only (war room, `/lineup` + proof, in-season recommendation
surfaces). So:
- **Guard test LOOSENED (A):** `draft/tests/access_guard.test.js` keeps the `/lineup`
  + `/lineup/log` 403/200 assertions and DROPS the "no page shows all-play/efficiency"
  assertions (they encoded the superseded reading). Wired in `ci.yml`.
- **`/lineup` gating is correct and stays.**
- **DEPLOY is HELD until B's history RESTORE lands** — deploying now would ship the
  over-stripped history (all-play/efficiency/bench removed), which the settled rule
  RESTORES. No restore commit exists yet on `main` or B's branch. **B: push the
  restore and signal A; A deploys immediately.** (A pinged B.)
- Integration to `main` DONE (A merged the exp34-dollar/36/33/41 batch + docs).

_Original flags retained below for the record; both are superseded by the above._

## ~~🚨🚨 URGENT → SESSION A (2026-08-09): DEPLOY THE ACCESS FIX + WIRE THE GUARD~~ (SUPERSEDED)

**A LIVE LEAK IS IN PRODUCTION.** The history pages on `main` (deployed) publish
per-owner **lineup-efficiency rates + all-play records + season bench-points** —
the most competitively sensitive ANALYSIS in the system (Cory: "results are
league property, analysis is mine"). B has FIXED it in code (commit on
`claude/lineup-optimizer-build-7y6nkt`: season/franchise efficiency+bench columns
removed, chapters/index all-play+efficiency+bench-aggregates pulled, /lineup gated
requireCommissioner). **But the fix is on B's branch, not `main`, so prod still
leaks until you merge + deploy.**

**ASKS (A owns deploy + `draft/tests` + `ci.yml`):**
1. **MERGE `claude/lineup-optimizer-build-7y6nkt` → `main` and DEPLOY, ASAP.** This
   pulls the live leak AND ships B's matchup page, lineup optimizer, money-board
   redesign. If a full merge is too broad right now, at minimum cherry-pick the
   access commit `8c5f085` to main and deploy that alone — the leak is the
   priority.
2. **Wire B's access-guard test into CI.** B can't write `draft/tests/*` (your
   lane). The harness is at (B scratchpad) `scratchpad/access-guard.js` — 18
   assertions: /lineup + /lineup/log 403 a non-commissioner (200 for commish), and
   NO league-visible page renders all-play / efficiency-rate / luck-gap / robbery-
   record / season-bench-aggregate text as a non-commissioner. Please copy it to
   `draft/tests/access_guard.test.js` and add `access_guard` to the ci.yml JS loop
   so this can never regress. (B will hand you the file contents on request.)
3. Optional: a CI test for the lineup optimizer engine (reproduces L0 to the
   dollar) — `scratchpad/lineup-validate.js`, 39 assertions. Same lane issue.

STANDING RULE now enforced in code; the guard keeps it enforced once wired.

---

## ~~🚨 → A (2026-08-09, UPDATED): the merge is DONE — just DEPLOY main + FYI~~ (SUPERSEDED — see RESOLVED above; deploy held for B's restore)

**Supersedes the "merge branch→main" ask above — B has consolidated onto `main`
per Cory's main-only directive.** `main` @ `44c24c6` now carries the full access
fix + all B site work (matchup, lineup optimizer, money-board redesign, eggs).

1. **DEPLOY `main` NOW.** The history-page analysis leak (per-owner efficiency +
   all-play + bench aggregates) is LIVE in prod until you deploy. Cory: "the live
   version is leaking right now, the fix should not wait for the next batch." The
   access-guard CI test (`draft/tests/access_guard.test.js`, now wired) must be
   green — it is.
2. **TERRITORY MOVED (Cory-directed, TERRITORY.md updated):** these site-feature
   modules are now **B's** by substance (imported only by src/routes/*, never by
   draft/**): `src/sidebets.js`, `src/betlogic.js`, `src/venmo.js`,
   `src/dashboard.js`, `src/ledger.js`, `src/notify.js`. **Do not edit these** — B
   owns the side-bet lifecycle end to end now (the earlier "A please add declare/
   confirm/dispute to sidebets.js" park is WITHDRAWN — B is doing it). A keeps
   predledger/sleeper/prefs + shared infra. Check script updated.
3. **STRAY BRANCHES:** the proxy is blocking B's delete of `claude/lineup-
   optimizer-build-7y6nkt` (fully merged into main, harmless). Also present:
   `claude/exp34-dollar-arm-21m58r` (yours?), `claude/new-session-jwdvn7`,
   `claude/new-session-xs2lv6`. Per main-only, these should be cleaned up — if you
   can delete them (proxy may block B), please do; else flag Cory.

---

## 🚨 → A (2026-08-09, DEPLOY-READY): restore is IN + guard ALREADY loosened — just DEPLOY

**The deploy is no longer blocked by content. Everything is on `main` @ `4a4deec`.**

Chain correction — the guard does NOT still encode the over-strip; **B already
loosened it in the SAME commit as the restore.** So there is nothing for A to
loosen. The steps left collapse to ONE: **deploy `main`.**

State on `main`:
1. **History RESTORED** to league-visible, byte-identical to the approved prose
   (`git diff 8c5f085^ -- views/history/...` is EMPTY): all-play, luck-gap,
   robbery, lineup-efficiency %, season bench totals — all back on season/
   franchise/hub/chapters. The over-strip is fully reversed.
2. **Guard LOOSENED** (`draft/tests/access_guard.test.js`): keeps ONLY the
   /lineup + /lineup/log 403-non-commish / 200-commish assertions, and now ALSO
   asserts the history pages STAY league-visible WITH all-play/efficiency (so a
   re-strip fails CI). 7/7 green. history_smoke 13/13.
3. **Tools still gated** (unchanged, correct): /lineup + optimizer + proof tab +
   war room = commissioner-only.

**THE FINAL RULE (Cory, settled, A has it too):** commissioner-only = the TOOLS
only (war room, /lineup + optimizer proof, in-season recommendation surfaces —
waiver/streaming/trade radar/Sunday alert, anything that generates a
recommendation). League-visible = everything describing WHAT HAPPENED regardless
of how computed (all-play, luck-gap, efficiency %, bench totals, money, standings,
records, champions, bad beats, chapter framings). TOOLS vs HISTORY, not
raw-data vs analysis.

If A has a SEPARATE guard/assertion encoding the old rule, reconcile it to the
above (B's `access_guard.test.js` is the current one). Then **deploy main** — Cory
has been unable to see days of design work stranded behind this.

---

## ▶ SESSION B → A REQUEST (2026-08-09): league-wide CHAMPIONSHIP-PROBABILITY model

Pool side bets are being rebuilt as a live snake-draft of franchises (Cory: split
the 10 teams, alternate picks by prior-season finish, whoever holds the champion
wins). The COMMISSIONER-ONLY advisor on Cory's picks needs an engine input that is
A's lane (and which also feeds the **League Outlook page** and **in-season
projections**, per Cory):

**Requested (A engine):** `P(team wins the league)` for each of the 10 franchises —
from roster strength, the owner's measured lineup efficiency, and remaining
schedule. Ideally also expose the **bracket-pairing structure / correlation** (odds
two given teams meet in a playoff round) so the advisor can price that taking the
two best teams is worth LESS than standalone odds when they'd eliminate each other
in the semifinal.

Shape B will consume (suggestion): `{ champProb: {owner_id: p}, meetProb?: {"a:b": p} }`
or a function on sleeper.js / a new engine module. B builds the portfolio advisor
ON TOP (marginal contribution to P(I hold the champion) = VONA-for-franchises,
correlation discount, "likely gone before my next turn", live P(I win the bet)).

Until A ships it, B's advisor runs on a **labelled placeholder** (rough champ odds
from standings + points) and drops A's real model in cleanly — same pattern as the
matchup page. Flagging rather than building engine in A's lane. The draft MECHANICS
+ the shared interface + the advisor SURFACE are B's and proceeding now.

## → SESSION B (2026-08-09, from A): deployed-vs-main health strip (the VIEW half)

A did the CI-alarm half (the Sunday audit now reports "prod is N commits behind main"
and escalates on served-file drift). The remaining half is a VIEW, so it's yours:
- **Status-dashboard health strip:** show the deployed commit vs main HEAD and
  "**prod is N commits behind**" plainly (not buried in a log) when they differ.
- **Data source:** `/api/health` already exposes the live/deployed commit (the audit
  reads it). Main HEAD is a GitHub API call, OR bake main's short-SHA at build time.
  A can add the deployed-commit + behind-count to `/api/health` if you want it
  server-computed rather than a client GitHub call — say the word (that's A's
  `server-app`/health lane).
- Optional: a subtle amber when behind ≥ a few commits, matching the health strip's
  quiet register.
Rationale in DEPLOY-POLICY.md (A's recommendation: keep [deploy] opt-in through the
draft, make stranding loud instead of switching policy under budget pressure).

## → SESSION B (2026-08-09, from A): regenerate your queue slice + prune like A did

A built `TODO.md` (root) — the plain-English current queue, grouped before-draft /
waiting-on-you / waiting-on-the-world / post-draft / Lab, with done items cited. It
covers the Lab + draft lane. **B: add your site/in-season slice** (matchup follow-ups,
Sunday alert, lineup optimizer in-season surfaces, the deployed-vs-main health strip
parked to you, the design sweep) and prune your own queue the same way Cory asked:
verify-then-remove with a citation in the commit, dedupe keeping the NEWEST version.

---

## 🅱️→🅰️ WAR-ROOM SHELL — split confirm + interface contract (B, 2026-08-09)

Cory handed B the **war-room SHELL**: `views/admin/warroom.ejs`, the war-room CSS
block, and the visual contract (spacing/type/hierarchy/mobile/rehearsal indicator).
**A keeps `app.js` and all markup it emits; A renders to B's classes.** Cory said A
approved a bounded split and is encoding it in TERRITORY.md.

**ASK 1 — encode it in TERRITORY.md.** The split table still lists `warroom.ejs`
as A's. Please add the shell reassignment (same SUBSTANCE principle already used
there): `warroom.ejs` shell + war-room CSS + visual contract → **B**; `app.js` +
the markup/DOM it emits + the draft engine → **A**. Until it's written, B is NOT
editing `warroom.ejs` (only the war-room CSS, which is already B's via
`public/css/**`). Confirm you're **out of the live mock** before B touches the
`.ejs` — "mid-mock, blocking" was on `b515233`.

**DONE NOW (CSS-only, `public/css/style.css`, ZERO markup change — safe on B's
branch, does not touch your mock branch):** three of Cory's nine-screenshot
complaints, all resolvable without editing your file:
1. **The TWO overlapping rehearsal ribbons → ONE quiet strip.** There were FOUR
   overlays: two sticky diagonal banners (`.rehearsal-watermark`, `.slot-watermark`)
   AND two `position:fixed` rotated corner ribbons (`body.is-rehearsal::after`,
   `body.slot-unverified::before`). The corner ribbons were the ones printing
   across the plan and covering END DRAFT / HARD RESET — **deleted.** One flat
   sticky strip remains; the red slot strip is hidden during rehearsal
   (`body.is-rehearsal .slot-watermark{display:none}`) so only one ever shows.
2. **`#arm-alerts` overlapping LOCKER/MORE →** lifted above the `.tabbar` on
   mobile via `!important` (overrides your inline `bottom:16px`).
3. **Cards clipping off the right edge →** `.card > h2` now `flex-wrap:wrap`, so
   header controls wrap instead of overflowing.

**INTERFACE B DEPENDS ON (please keep emitting, unchanged):**
- body classes **`is-rehearsal`** and **`slot-unverified`** (drive the one strip);
- divs **`#rehearsal-watermark`** / **`#slot-watermark`** with app.js toggling
  their `display` (content unchanged — B only restyled them);
- id **`#arm-alerts`** on the FAB.
If you ever collapse to a single watermark div, tell B and B drops the hide rule.

**ASK 2 (your markup, when you're clear):** the clean version of fix #2 is to drop
the inline `position:fixed;bottom:16px;right:14px;z-index:150` on `#arm-alerts` and
let the class own placement. B's `!important` override holds until then — no rush.

**NEXT from B (once split is encoded + you're out of the mock):** collapse the
status furniture (doctrine banner + WATCH + pick-state + statusbar) into ONE
tappable line, give the recommendation the fold, and make the tool quiet-by-default
/ loud only on a tier cliff, a contested split, or a plan deviation. B will bring a
class-level contract proposal so your `app.js` render targets don't move under you.

---

## 🅱️ PARKED (2026-08-09) — spec items deferred, with findings

### START/SIT VEGAS SIGNALS (commissioner-only) — BLOCKED ON DATA, probed
Spec: implied team total (spread + O/U), game total/shootout flag, spread/game
script, line movement; DFS salary week-over-week movement (probe first). Inputs to
the DISPLAY beside each start/sit call, not model terms, until measured for
incremental value against realized outcomes (projections may already price
opportunity — measure before installing). Chase-vs-protect mode drives which
players to point at. All on `/lineup` (commissioner-gated), never league-visible.

**PROBE FINDING (this build env):** external odds APIs are UNREACHABLE from the
sandbox — `curl` to ESPN's scoreboard and core APIs returns `http_code=000`; the
agent proxy's allow-list is package registries only (npm/pypi/crates…), not the
open internet. Sleeper 403s here too yet works in the DEPLOYED function, so odds
are *likely* reachable in production — but I cannot build+verify live-odds code
here without shipping it blind. Not skipping on "paid feed" grounds (ESPN's
`competitions[].odds` is free, no key, carries spread + O/U → implied team totals);
skipping on "can't exercise the network to test it here."

**PLAN when built (in an env where the deployed fn's network is exercisable):**
- Source: ESPN NFL scoreboard `events[].competitions[0].odds[0]` → `spread`,
  `overUnder`. Implied team total = O/U/2 ± spread/2. Free, no key. Cache per week.
- A `src/odds.js` (B-substance) with a labelled-empty fallback (same pattern as the
  matchup page: render "odds not available" honestly, never a fabricated number).
- Attach each signal to a specific start/sit call on `/lineup`; render nothing when
  it doesn't change the call. Extremes only (top/bottom implied totals; shootout =
  high O/U; large line moves). DFS salary movement only if a free delta source
  proves reachable — else drop it (Vegas carries most of the signal).
- Chase-vs-protect: compare projected score to `LO.weeklyHighBand()`; below-band +
  likely-lost → point at the highest-O/U shootout; protecting → the opposite.
- Measure incremental value (does implied total predict OUR players' scoring by
  position) before any term enters the recommendation, through the normal gates.

### GERMAN EGG — full screen translation (banner DONE)
DIE HERMANNSSCHLACHT billing/banner/flag/war-record is live. Remaining: translate
the ENTIRE matchup screen (labels, headers, buttons) into real German when
Marian–David. Approach: a `de` label map keyed on `rivalry.egg`, applied in
matchup.ejs (and its partials) — a `t(key)` helper defaulting to English, German
when the egg is live. Sizeable but mechanical; keep the German real, not machine.

### RIVALRY — franchise section + chronicle refs (billing DONE)
- Franchise pages: a "Rivalries" section listing that owner's named rivalries +
  record in each (RIV.RIVALRIES filtered by name, h2h for the record), each linking
  to the rivalry page.
- Chronicle / weekly recaps: reference the rivalry when one of these games happens,
  in the league voice.
- Permanent history note when a rivalry game decides a playoff spot or a weekly
  high (extra billing + a durable mark).

---

## 🅱️ THE BIG FEATURE SPEC (Cory, 2026-08-09) — parked, sequenced

**The principle (governs all of it):** the site must NOT grow a page per feature.
Transient things pop up and vanish; persistent things become a column, a line, or a
small addition to an existing screen. A new page requires a stated why first.
All league-visible; none touch the commissioner-only tools.

### PICK'EM — "build this properly, it is the best one" (do FIRST; offline-testable)
Two-way pick per game on the league matchup screen (tap a side, done; everyone
picks weekly). Requirements: see who picked AGAINST you; per-game split once locked
("7 of 10 took Michael"); picks LOCK at first kickoff; season-long accuracy
leaderboard AND all-time (accumulating across seasons), small but permanent, in the
standings area or home; the worst picker should know it; archived so the chronicle
can quote ("4-11 the year he finished last"). Storage: a B-owned module
(`src/picks.js`) + routes + a picks partial. No new page — the leaderboard folds
into standings/home; the picks UI is on the existing league-matchup screen.

### TRANSIENT POPUPS (dismissible cards, archived to history; offline-testable)
- WEEKLY AWARDS — Tuesday, mean, league voice: highest/worst score, biggest bench
  disaster, luckiest win, unluckiest loss, best single player, worst start. Appear,
  read, dismiss; archived so chapters can use it. (Compute from box scores.)
- POWER RANKINGS — weekly popup, one written line each, ranked by something real,
  dismissible. Not a permanent page.
- ON THIS DAY IN LEAGUE HISTORY — one rotating home-page LINE from the chronicle.

### FOLDED INTO EXISTING SCREENS
- PLAYOFF ODDS — a COLUMN in the standings (% + this-week movement). Needs a
  champ/playoff-probability model (A lane — see the earlier "championship-probability"
  request to A; until then a labelled placeholder from standings+points).
- WHAT THIS MATCHUP IS WORTH — one line on the matchup screen: expected money swing
  each side (from payout structure + standings implications).
- ELIMINATION & CLINCH — a marker in standings when it happens + one-time notice.

### WHAT-TO-WATCH panel (home, Sun/Mon only; NEEDS DEPLOYED SLEEPER — 403 in sandbox)
Small compact home panel, appears for the night game and goes away. Per undecided
matchup: the remaining player, his team, exactly what he needs ("Cory needs 14.2
more from Jefferson to beat Michael"). Cover every matchup. Include the live
weekly-$100 race. Say "decided" plainly when mathematically over. The SWEAT METER
and the LIVE WEEKLY HUNDRED fold into THIS panel (do not build a third live
surface). Tapping opens the full matchup. Bill a live rivalry as such. Build+verify
against deployed data (same constraint as the Vegas odds probe).

### TRASH TALK ON MATCHUPS
Post directly on a specific matchup (not just the locker room); attached to that
game permanently + archived so chapters can quote pre-loss bravado.

### FINAL DESIGN PASS — explicitly LAST (after everything above)
Whole-site, page-by-page, mobile-FIRST (390px, no horizontal scroll ever, thumb
targets, nothing important below 3 folds), USA theme made deliberate (real palette /
type scale / consistent treatment), everything-ties-together (every number → its
story, every name → their history, every game → its box score), a real time capsule
(surface old seasons / departed owners / name changes / money / rivalries / trophy).
Two specific adds: (1) CHIEFS LOGO next to every KC player everywhere (Sleeper
`p.team === 'KC'`, reachable — confirmed); (2) a GOAT next to whoever rosters
Mahomes, auto-moving. DO NOT build a season money leaderboard (dup of money board).
Screenshot before/after each page; bold over timid.
## ▶ REDESIGN — PERSONALITY-PRESERVATION CHECKLIST (Session B, 2026-08-09)

**Cory's rule for the redesign: NOTHING is lost — not a feature, a number, or a
tool. Regrouping/rearranging for better function is encouraged. But every bit of
personality stays and stays EASY TO FIND. If the redesign makes any of this
harder to find, that is a failure of the redesign.** This is the guardrail the
build-out (whichever direction is chosen) verifies against. Grep-verified
locations as of this commit:

| # | Personality element | Lives in | Preserve rule |
|---|---|---|---|
| 1 | **Easter eggs** — German-flag "back-to-back world war champs" medal (tap a 🇩🇪), the 2022 asterisk that argues with itself (tap the *), star-row 5-tap → Balls & Wieners origin, typed "mahomes/chiefs/kingdom" flourishes, Konami confetti + Mahomes line | `public/js/eggs.js`; hooks: `.egg-flag[data-egg]`, `.egg-aster[data-egg]`, `#star-row`, `[data-egg-origin]`, typed-word listener, `KONAMI` | Keep every hook id/class the JS binds to. A redesign may restyle, never delete these anchors. |
| 2 | **Chiefs arrowhead logo** next to every KC player | `public/icons/kc.svg`, `.kc-logo` in `views/team.ejs` | Real arrowhead (not 🏹). Keep on the roster; extend to matchup starters when A's per-player `team` field lands. |
| 3 | **GOAT 🐐 on Mahomes' owner** (auto-moves) | `src/routes/marks.js` → `flags`; rendered in dashboard standings, bank, matchup, pick'em | Must appear everywhere owner names render; re-derives live. |
| 4 | **Crown 👑 + trophy / dynasty** | dashboard standings (rank 1), `views/history/records.ejs` crown ladder | Champions + leader marks stay. |
| 5 | **Rivalry billing** | rivalry pages (A) + matchup framing | The "billed as a rivalry" treatment stays. |
| 6 | **German matchup treatment** ("Auswärtsspiel"/back-to-back when facing a German) | eggs.js + matchup | Stays as a discoverable flourish. |
| 7 | **Chronicle voice** (crude, funny, italic) | `views/history/**` chapters/catalogue/amendments, `src/routes/dispatch.js`, roast-banner, footer quips | The voice is the point. Render it as serif-italic against clean chrome — the crude/clean contrast IS the design. |
| 8 | **The Dispatch popups · Hall of Shame · the toilet 🚽 · weekly-high $100 · money color · side-bet grid** | dispatch.js, pickem.ejs, dashboard, bank | All stay; regroup freely, delete nothing. |
| 9 | **Origin lore** — Balls & Wieners / Whiny Little Bitch League, Est. 1776 gags, "cleared by U.S. Customs" | `views/partials/footer.ejs` | Stays. |

**Directions explored (screenshots sent to Cory):** A "Broadcast Deck" (dark
telemetry), B "Daylight" (light editorial departure), C "Terminal" (bold mono
instrument), D "Field Office" (the synthesis / B's recommendation: daylight base
+ mono data discipline + terminal accents, with all of the above shown intact).
**Awaiting Cory's pick (one, or pieces combined) before the site-wide build-out.**

---

## ▶ NEXT UNIT (parked, acknowledged) — THE ANNUAL BUTTON: content half (Session B)
**Sequenced after the design work + preservation audit (both done), before anything speculative. Not urgent — fires January, fall dry-run. Building now while the generators are fresh. Full spec: `docs/queued/annual-button.md`. All league-visible (results/money/history).**

**THE SPLIT:** A owns the workflow plumbing (headless dispatch, PR creation, engine/Lab grading passes, season rollover re-pointing config). **B owns the content + site artifacts**, wired to be CALLABLE FROM A's workflow (not run separately), and running AFTER A's corrections/grading complete — a chapter must never cite a number the same run later fixes.

**B's four pieces:**
1. **History chapter** — new season's full chapter in the chronicle voice + the hub story's new paragraph appended. Generators already exist in `src/routes/history-data.js` — this is WIRING them to run on the Annual trigger (export a callable that takes the corrected season data → writes the chapter view/data), not rebuilding them.
2. **Records-book recomputation** — all-time records, Money Board, franchise pages, Bad Beats HOF, champion crown → new winner, trophy gains its plaque. All derived from the season results with no manual step (history-data.js already computes most; make it regenerate from the sealed season).
3. **Financial settlement report** — final who-gets-paid / who-owes from the verified season money table via the payouts config (`src/ledger.js` + helpers.payoutTable), rendered on the league-visible Finances page with Venmo links attached (`src/venmo.js`).
4. **Season sealing** — current-season page live→permanent chapter; archive that year's transients into history where chapters can quote them: pick'em results (`pickem-slate`/`pickem:` + PE.seasonBoard), the Dispatch archive (`dispatch-index:<season>` — already immutable), trash talk (`TT.archiveForSeason`), weekly awards/power polls (dispatch archive). The archives were BUILT to be quotable — this wires them into the sealed chapter.

**Coordination flag → A:** expose B's content generation as a function A's workflow calls after grading (pass the corrected season table + final standings). Agree the call signature + the ordering barrier. B does NOT touch the workflow YAML/dispatch/PR creation (A's lane).

### ↳ ANNUAL BUTTON add-on (parked) — DRAFT-SELECTION BOARD RESET (two-stage order)
League-visible; one of the most-watched offseason things. Part of the Annual Button unit above.
- **Selection order = reverse regular-season finish for positions 5–10** (last place picks first; those six lock the moment the regular season ends), **then positions 1–4 = the four playoff teams ordered by BRACKET finish** (not reg-season seed) — can't compute until the championship is decided.
- **Two-stage resolve, shown honestly:** at regular-season end, 5–10 lock + display locked, 1–4 show "pending playoffs"; when the bracket completes, 1–4 fill in. No half-empty board, no wrong guess in the interim.
- **Claim board resets** for the new season (cleared, correctly ordered, ready to claim in turn); **last season's claims archive into history** (not deleted) — reuses the `draft:<year>` docs + `H.draftState`.
- **The dinner:** last place buys dinner on draft day — recorded + displayed + in the history (chronicle-referenceable).
- **Tiebreak:** total points (PF) per the payouts config — **DEFAULT ASSUMPTION unless Cory says the selection-order tiebreak differs from the standings tiebreak** (open question, below).
- **VERIFY AGAINST HISTORY (build gate):** reproduce the ACTUAL selection order for ≥1 of 2023–25 from that year's reg-season finish + bracket + the draft order that followed (seed-data STANDINGS/DRAFTS). If it doesn't reproduce, the rule is wrong — find it now, not in January.

**❓ OPEN QUESTION FOR CORY (DECISIONS-NEEDED):** is the selection-order tiebreak the same as the standings tiebreak (total points/PF), or different? Proceeding on PF unless told otherwise.

---

## ▶ SLEEPER LINEUP-WRITE PROBE (Session B, 2026-08-09) — VERDICT: NOT safely writable → build the frictionless manual tool
Probed for real (WebSearch + docs + the community undocumented-endpoints catalog), not inferred:
- **Documented API is read-only.** `api.sleeper.app/v1` and `api.sleeper.com` expose GET only — users/leagues/rosters/drafts/stats/projections/schedule/depth-charts. No POST/PUT/PATCH for lineup/starters/roster moves anywhere in the docs.
- **No known write endpoint.** The community catalog of UNDOCUMENTED endpoints (joeyagreco/sleeper disc. #11) lists only more reads (stats/projections/schedule/depth chart/headshots). The app's own writes go through an internal authed GraphQL that is undocumented and not offered for third-party use.
- **Terms:** Sleeper's General Terms prohibit "unauthorized scripts or other automated means." Driving an undocumented authed endpoint with Cory's credentials to change his roster is exactly that → **per Cory's rule ("if it would violate them, say so and stop — I am not risking my league account"), STOP the write path.**
- **No official write integration / partner API** found.
- **DECISION: do NOT build auto-set.** Build the **next best thing** (already ~80% in place): the `/lineup` optimizer already computes the optimal lineup + dollar deltas, and the Sunday alert already fires pre-kickoff. Remaining B work = a **one-tap "set this" screen in SLEEPER'S OWN SLOT ORDER** so Cory copies it in ~15s, with the current-information pass (injuries/inactives/scratches) at the final pre-kickoff run. No A write-layer needed (read-only stays); no ownership question.

---

## ▶ ANNUAL RESET — SEASON-SPECIFIC AUDIT (Session B first pass; verify page-by-page during the build)
Everything that changes year-to-year, categorized. **The dangerous column is ⚠️ SILENT-STALE (shows last year as current).**

**✅ AUTO (derive from live data / season-keyed — reset on the new season with no step):**
standings · scoreboard · matchups · playoff odds/clinch/elim · weekly-high race · what-to-watch/sweat · rank-movement arrows · GOAT+Chiefs marks (live rosters) · pick'em (season-keyed keys) · the Dispatch popups (season-keyed) · trash talk (season+game keyed). H2H / rivalry / pick'em all-time EXTEND automatically once the new season's box scores are in the source.

**🔧 NEEDS THE ANNUAL (wire to trigger — mostly built, run headless & in order AFTER A's grading):**
history chapter + hub paragraph · records book · Money Board new column · franchise pages · Bad Beats HOF · champion crown → new winner · trophy plaque · season sealing (live→permanent) · financial settlement report + Venmo · draft-selection board (two-stage) · dues tracker reset · keeper slate reset + deadline move · side-bet grid new-year column · buy-in/payout from the live VOTE → config (vote result feeds config, not a file edit) · league-id re-point (A) + settings watchdog diff (A).

**⚠️ SILENT-STALE (shows last year as current if untouched — MUST derive):**
- **Hardcoded dates/deadlines** — `betlogic.CFG.SEASON_START = '2026-09-10'`, `PLAYOFF_WEEK_DEFAULT = 16`, draft-day alert (`config.draft_day_alert_2026` — year baked into the key), keeper lock / trade deadline wherever written. → derive ALL from `config`/Sleeper per season.
- **Hardcoded season-year labels** in views ("2026", chapter years) that aren't reading `season.year`.
- **`config.season_start` / `season.buy_in` / `total_pot` / `weekly_payout`** if the new season record isn't created + set active (H.currentSeason falls back to latest-year, so a missing new-season record silently serves the old one).
- **Buy-in/pot** everywhere if the vote passes but config isn't re-pointed (pot, weekly-high amount, finances, money-board column, amendment ledger dated entry, every money calc).

**Short list that genuinely needs a HUMAN:** (1) approve the Annual's PRs (the whole point), (2) confirm the new Sleeper league mapping when auto-continue spawns it (A's watchdog surfaces diffs; a human confirms), (3) enter/confirm the new keeper designations (owner action, by deadline), (4) the buy-in vote itself (already a human vote — but its RESULT should flow to config automatically).

**❓→A:** (a) API key for the Annual's headless run → GitHub **Actions secrets** (the Annual runs in Actions), not Netlify env — B's understanding; **A confirm before Cory pastes a key.** (b) B needs the Annual workflow to call B's content generators AFTER grading, passing the corrected season table + final standings + bracket order; agree the call signature + ordering barrier.

### ↳ DRAFT-ORDER — HISTORY FINDING (❓Cory, before baking the playoff-four rule)
Engine + verification built (`src/routes/draftorder.js`, `draft/tests/draftorder.test.js`). The non-playoff six (reverse reg-season) reproduces for BOTH prior drafts. The **playoff four disagree between years**:
- **2026 draft** (from 2025): full reverse of final standings — **champion (Michael) picks LAST**. ✅ matches the stated rule.
- **2025 draft** (from 2024): **champion (David) picked 7th — FIRST among the playoff teams**, not last. Actual 7-10 = David, Justin, Marian, Jeremy; the stated "reverse bracket" predicts Marian, Justin, Jeremy, David.
**So the two years used different treatments of the playoff four.** Engine currently implements the 2026 rule (champ last); it's parameterized so flipping is one line. **❓ Which is the real rule for the playoff four's SELECTION order — champion picks LAST (2026), or champion picks first-among-the-four (2025)? And is seed-data STANDINGS regular-season or final?** Not baking it in until confirmed.

### ANNUAL CONTENT-HALF — remaining after this session (in order)
Done this session: silent-stale code fixes + the no-season-literals guard; draft-order engine + history verification (finding above). **Remaining:** draft board reset/archive + the two-stage UI (pending the rule answer) · buy-in vote → config flow (typed vote outcome → season config; the clearest config-flow test) · config-driven draft-day alert on season rollover (replaces the frozen 2026 migration) · CHAPTERS/RS_PRIZE/harvest-window derive-on-seal · history chapter + hub paragraph wiring · records-book recompute · settlement report + Venmo · season sealing (live→permanent + archive the transients). All callable from A's workflow AFTER grading (coordinate signature + ordering barrier).

---

## ▶ THREE-CHAIN VERIFICATION (Session B, 2026-08-09) — traced in code, honest state

### CHAIN 1 — vote → config → money.  WAS BROKEN; now FIXED (vote→config), one gap remains.
- **Recording:** votes have NO close moment / status transition / writer. `allVotes` computes `passed = yes>=threshold` as a tally on READ. It was **display-only**.
- **Flow to config:** did NOT exist. Only writer of buy_in/pot/payout was the commissioner's manual season form (`admin.js`).
- **FIXED:** `voteenact.applyVoteEffect` + commissioner "Enact" (admin votes tab) now write a passed vote's result into the season config; pot/weekly-high/payout table/finances/money-board/amendment-ledger all DERIVE from that config, so they follow automatically. Callable headless by the Annual.
- **Payout STRUCTURE:** the data model IS percentages per season (`payouts.{reg,playoff}`, any length) and `applyVoteEffect`/`payoutTable` handle a re-shaped table. **Remaining gap: the ADMIN SEASON FORM is hardcoded to 2 reg + 4 playoff inputs** — changing the NUMBER of paid places works via the vote-enact `payouts` effect (csv) but the season form UI needs generalizing. (Small B follow-up.)

### CHAIN 2 — Sleeper sync vs assumed.  PARTIAL — a real stale-rules risk (A's lane to close).
- **Read LIVE from Sleeper:** playoff_teams, playoff_week_start, draft rounds, rosters, scores, standings (wins/PF), current week.
- **HARDCODED copies (NOT synced):** `SCORING`, `ROSTER` shape, `RULES` (seed-data) — display + the OPTIMIZER's roster slots. Keeper count / trade deadline / waiver type aren't read from Sleeper at all.
- **Failure mode Cory named is REAL:** change scoring or roster shape in Sleeper and nothing on our side notices — the optimizer would optimize against stale rules. **A's settings watchdog (self-audit.yml/authority.test.js) — confirm scope: does it diff scoring/roster/keeper/deadline, or only part? (A question.)**
- **Auto-continue re-point:** `config.sleeper_league_id` is set ONCE (seed migration); a new league in January needs re-pointing → A's rollover, not automatic today.

### CHAIN 3 — honest Annual state.
- **RUN against real data (render-time):** the content generators (chapter, hub story, records book, money board, franchise, bad beats, settlement via payoutTable) all render correct CURRENT data on their pages. **But never as a season-SEALING pass.**
- **Built, verified, not yet run as an Annual:** draft-order engine (tests only), vote→config (tests + manual enact).
- **Does NOT exist:** the Annual orchestrator itself (A), season sealing (live→permanent), draft-board reset/UI, config-driven draft-day alert on rollover, CHAPTERS/RS_PRIZE/harvest derive-on-seal.
- **Fail silent vs loud:** the render-time generators fail SILENTLY (a stale buy-in → plausible-wrong money that looks normal; the unconfirmed playoff-four draft rule → plausible-wrong order). `applyVoteEffect` and the no-season-literals guard fail LOUD by design.
- **Partial-run risk (Cory's worst case):** there is no orchestrator yet, so **A's Annual workflow must (a) run corrections/grading FIRST, (b) call B's generators after, (c) HALT on any failed link rather than continue** — else the site ends half-updated with plausible-wrong numbers. Flag for A's workflow design.

---

## ▶ NEXT UNIT (parked, acknowledged) — THE WEEK'S-MATCHUPS SCOREBOARD (the Sunday landing)
Cory (2026-08-09): one page, all five of the week's games as compact cards — both owners/scores (live/projected/final + who's winning), and the interesting detail visible without tapping: **pick'em split** (tap → who took whom), **rivalry billing** (Dylan–Sam, Bates–Richard, the German derby), **weekly-high race** (leader, gap, which games can still change it), **what each game is worth** (playoff/money) + **clinch/elim** consequences, and the **what-to-watch line** on SNF/MNF undecided games. Tap a card → the full matchup screen (H2H, trash talk, side bet, starters). Mostly WIRING engines already built (PE.gameSplit/weekGames, playoffs.picture/matchupLeverage, whatwatch.sweat, rivalry, weeklyHighBand). Mobile-first, league-visible. **Nav: make it the obvious Sunday landing — a prominent home entry (or home BECOMES it on game days), not buried.** No existing page does this: home's "Week N Scoreboard" is bare scores; /watch is Sun/Mon sweat only. **Build next.**

---

## ▶ iPhone home-screen PWA — DIAGNOSED + FIXED in B's lane (Session B, 2026-08-09)
Cory reported the installed home-screen app "not working / seeing old versions."

**Root cause (the real bug):** the standalone app is chromeless — no address
bar, no pull-to-refresh — so no gesture can force a reload. Rendered pages
carried **no `Cache-Control`**, and iOS WebKit **heuristically caches** any 200
text/html without one, pinning the installed app to whatever build it first
loaded. A new deploy never reached the phone. Confirmed with a standalone-path
diagnostic (cold launch → `/login` → authed `/`, `/scoreboard`): every HTML
response came back `cc:null`.

**FIXED (B-owned files, shipped `ac0e05d` on `claude/pickems-feature-3ksf0l`):**
- `src/routes/member.js` + `src/routes/admin.js` now set
  `Cache-Control: no-cache, must-revalidate` on every rendered page. `/api/*`
  still sets `no-store` afterward (stricter). CDN assets (icons/css/manifest)
  keep netlify.toml's long-cache — they never hit these routers.
- `views/partials/header.ejs`: removed the Google Fonts `<link>` (dead weight —
  CSS is 100% system fonts — and a render-blocking external fetch a chromeless
  launch cannot afford).
- Verified external links (Venmo/Sleeper/GitHub) already `target=_blank
  rel=noopener` → open in Safari, no back-button trap. No change needed.

**Session cookie in standalone:** persists correctly today — 30-day expiry,
httponly, samesite=lax. iOS gives the standalone app its own cookie jar, so the
user logs in once *inside* the installed app; that works.

### 🅰️ ONE A-LANE ITEM (server-app.js, optional hardening — NOT the bug)
The session cookie has no `secure` flag. It's set in `server-app.js`'s
`cookieSession({...})` (A's lane), so B did not touch it. It is **hardening, not
the fix** — cookies persist fine over HTTPS without it. If A wants it: add
`secure: process.env.NODE_ENV === 'production' || !!process.env.NETLIFY` to the
`cookieSession` options (gate on prod so the local http dev server, which
rejects secure cookies, keeps working). Low priority.

### 📱 WHAT CORY MUST DO ON HIS PHONE (once, after A deploys this)
The old stale HTML is already pinned in the installed app's cache, so the fix
can't retroactively evict what's already there — one manual reset is needed:
**delete the home-screen app and re-add it** (Share → Add to Home Screen) after
the deploy lands. From then on every future deploy reaches the installed app on
its own, because the pages now tell iOS to revalidate. No need to clear all of
Safari — just delete + re-add the one icon.

---

## 🅱️→🅰️ WIRING HOOK — the draft-day ergonomics build (Session B, 2026-08-09)
B promoted the queue + search onto the war-room decide surface and added a slip
alert, per Cory. The SHELL, layout, CSS and hosts are done and shipped on
`claude/pickems-feature-3ksf0l`. Two things need A's engine — please wire in one pass:

### 1. Populate `#queue-slip` — "your guy is a turn from gone" (the piece Cory most wants)
A new IN-FLOW host sits at the top of `.wr-zone1`:
`<div id="queue-slip" class="queue-slip" ...>`. It's `display:none` by default.
- When a QUEUED player's probability of surviving to the user's NEXT pick drops
  below a threshold, set `display:flex` and fill it with a short line naming the
  player(s), e.g. `Your #1 — Puka Nacua — likely gone before pick 47 (2 of 3 sims).`
  You already compute this survival/branch math (the LRM + `renderBranches` path);
  this just surfaces it against the queue instead of the board.
- Add class `urgent` (`el.classList.add('urgent')`) when the slipping player is at
  the TOP of the queue — the CSS swaps it to red + 🚨. Plain (amber ⏳) otherwise.
- When nothing is slipping, set `display:none` (empty => it must not sit as furniture).
- Suggested threshold: the same "likely gone" bar the branch forecast uses; tune to taste.

### 2. Confirm Take / Queue / Compare on EVERY player-row surface
Rows already emit `data-draft-me` ("I took him"), `data-draft-other` ("Gone"),
`data-queue`, `data-compare`, and the handlers are delegated (so B reparenting the
hosts did not break them — verified). Please confirm all four appear on each of:
`#recs` (ranked list — CONFIRMED present), the paths panel, `#search-tail` (search
results), `#best-avail-strip`, `#pos-recs-out` (best-available-by-position), and the
`#queue` rows themselves (a one-tap **Take** on each queued player — that's the
"tap my guy from wherever I'm looking and it drafts + re-projects" loop). Add the
missing ones using the same classes so B's styling picks them up.

### Host moves B made (ids unchanged, per the host-id contract)
- `#search` + `#search-tail` moved from the draft-board header to the top of
  `.wr-zone1` (`.wr-search`). Board keeps `#pos-filter`. Bind-by-id + delegation
  means board filtering and results still work; no app.js change needed for this.
- `#queue` + `#queue-head` + the queue action buttons moved from Layer 3 to the
  bottom of `.wr-zone1` (`#queue-card`, blue-edged). Same ids.
- No ids renamed or deleted; no change to what app.js reads or emits.

---
## ▶ FOR SESSION B (from A, 2026-08-09) — ergonomics shipped + one styling hook
- **DEPLOYED** (main @ the `[deploy]` commit): your draft-day ergonomics (search bar,
  queue on the decide surface, slip alert) + the PWA root-cause fix + mobile furniture are
  all live. Ready for your **390px screenshot pass against the real draft flow** (not
  injected placeholders) — the surface now renders with real data.
- **Both parked hooks are WIRED (A's lane):** `#queue-slip` fills from the survival math
  (>=60% gone by next pick → shows; `.urgent` when it's Cory's #1; hidden when nothing
  slips), and Take/Compare are on every row (queue rows + best-available).
- **One styling hook for you:** best-available cells now render `<span class="ba-slot">`
  wrapping the compare cell + a `<button class="btn small gold ba-take">✓</button>`. The
  btn classes are globally styled so it works now; **`.ba-slot` / `.ba-take` are yours to
  tune** in the 390px pass (compact spacing on the strip). Coordinate — I did not touch
  `.ba-cell`.

## 🅱️→🅰️ MODEL-ACCURACY DISPLAY — the two docs A's grading must write (Session B, 2026-08-09)
B built the commissioner-only **/lineup/accuracy** page (calibration, recently-graded,
biggest misses, attribution table filling in) — the "places the graded data goes"
Cory asked for. Shipped on `claude/pickems-feature-3ksf0l`. It reads two store docs
A's weekly grading writes; both may be null and the page degrades honestly ("not yet
graded, N logged"), so nothing breaks before the cron exists. Write these and the
page lights up with zero further B work:

### `calibration:<season>`  (getDoc/setDoc) — the scorecard
Exactly the shape `draft/backtest/forecast_grade.py` `grade()` already returns, plus
two cheap optional roll-ups. B reads it defensively (missing fields tolerated):
```
{ generated_at, week,
  n_forecasts, n_resolved, n_graded, n_pending, n_disqualified,
  probability: { n, brier, reliability: [ { predicted_mid, n, observed_rate } ] },
  point:       { n, bias, mae },
  categorical: { n, accuracy },
  graded: [ { key, ftype:'probability'|'point'|'categorical', claim, value, outcome,
              method, forecast_at, week?, kind?,   // kind = survival|lineup_call|waiver_claim|forecast…
              brier? | error? | abs_error? | hit? } ],
  by_kind?: { <kind>: { n, brier?, accuracy?, mae? } },   // optional — powers "by prediction type"
  by_week?: [ { week, n_graded, brier?, accuracy? } ] }    // optional — powers "over time"
```
`graded[].claim` is the one human-readable line B shows; `kind`/`week` let B group
and label. If you already run `grade()`, this is essentially `JSON.stringify` of its
output + stamping `week` on each graded record.

### `attribution:<season>`  (getDoc/setDoc) — the component table filling in
```
{ generated_at,
  components: [ { key, label, realized, ci_low, ci_high, n, measured:boolean, note } ] }
```
`measured:false` cells render as **unmeasured** with the `note` (never a fabricated
number) — that honesty is the point per exp-37 wording ("$X realised on decisions
where the tool recommended Y", never "the tool earned $X").

No B action remains once these are written; the page + nav link + 20 tests are live.

---

## 🅱️→🅰️ ANNUAL-RESET HOLE HUNT — A-lane items (Session B, 2026-08-09)
B ran the full reset audit (3 sweeps: season literals, carry-forward survival, rule/
money derivation) and FIXED its own lane (vote→ledger tab re-sync; the Leak-analyzer
literals; chapter/timeline literals earlier; the draft-order reset). These remaining
holes are A-lane or shared-archive — specific questions, not a re-audit:

### 1. RULE PROVENANCE (highest correctness cost). Only PAYOUTS are per-season.
`SCORING` / `ROSTER` / `RULES` (src/seed-data.js:124-144) and `scoring` in
`draft/config/league_config.json` are single GLOBAL constants; `history-data.js`
REG_WEEKS=15 (:48) and SLOT_POS (:180) are hardcoded and used for every historical
season's optimal-lineup/efficiency. **Q for A:** if the league votes a scoring/roster/
keeper-count/trade-deadline change, nothing records that 2025 was measured under
different rules than 2027 — every historical efficiency/records number silently
recomputes under current rules with no era stamp. Payouts already solved this
(payouts.json `by_season`, era-correct — the model to copy). Should scoring/roster/
keeper be stamped per-season the same way? This is the "measured under a world that
no longer exists" risk Cory flagged.

### 2. AMENDMENTS don't derive from the live vote/config (history-data.js — archive lane).
`buildAmendments` (history-data.js:902-931) reads the STATIC committed
`master_sheet_archive.json` / `payouts.json`, not the live `seasons` doc the vote
writes. So an enacted buy-in/payout change produces NO dated amendment until someone
hand-edits those files (the enact code comment claiming the amendment "DERIVES" from
the config is wrong — different source). Also: scoring/roster/keeper changes have no
amendment path at all (buildAmendments only knows buy-in + payout), and
`votes_pending` on the Amendments page is a stale hand-maintained master copy, not
the live votes. **Q for A:** should the amendment ledger read the live seasons/vote
docs (or the Annual should write an amendment entry on seal)?

### 3. MONEY BOARD / CAREER TOTALS from static master, and two divergent computations.
`buildMoneyBoard` + per-owner career (history-data.js:884-897, 643-651) read
`master.total_winnings` (static) — nothing updates when a buy-in vote passes or live
ledger entries land, incl. the "reads live" 2026 column (money.ejs:56-59) which still
reads the static master. Separately, career money is computed TWO ways — live
`helpers.winningsGrid` (ledger-derived) vs archive `buildMoneyBoard` (master-derived)
— which can silently disagree after any live ledger activity. **Q for A:** reconcile
to one source on seal?

### 4. HARVEST PIPELINE GAP — a finished season enters records/money/H2H only on manual re-harvest.
`history-data.build()` filters `season !== '2026'` (:87) and reads only committed
`draft/data/*.json`. A just-finished season appears in the record book / money board /
H2H ONLY after someone re-harvests Sleeper and re-commits `league_history.json` +
`master_sheet_archive.json` (A's `draft/data`). If the Annual skips that harvest, the
season is missing from all three permanent surfaces. **This is the season-sealing data
step — A's lane** (harvest + commit); B's chapter/records surfaces are ready to render
it the moment it lands.

### 5. ROLLOVER doesn't migrate season-keyed store docs — needs the orchestrator.
`voteenact.skeletonFrom` / admin only advance the season CONFIG; nothing re-points or
surfaces the season-keyed store docs (`pickem:<s>`, `trash:<s>`, `dispatch-index:<s>`,
`playoff-odds:<s>`). They persist but are only as alive as the surface that reads them
(see B-lane orphan fixes below). The Annual orchestrator (A) should call B's sealing
hooks in order and HALT on any failure.

### B-lane orphans B is fixing next (not A's): pick'em all-time board silently drops
prior seasons; trash-talk + dispatch archives are written but read by no surface.
Tracked in B's queue.

---

## 🅱️→🅰️ CI heads-up before integration (Session B, 2026-08-09)
Ran the full pure JS suite locally against B's branch. Two things:

1. **FIXED (B): `authority.test.js` — `scores (c)`.** B's trash-talk route
   `/matchup/trash` (unit 5) tripped the "no route writes scores/matchups/results"
   substring scan because its path contains "matchup". It writes banter, not
   points. Exempted it explicitly in the test (doctrine intact). This would have
   gone RED on your merge-to-main since CI only runs on `main`.

2. **A-LANE (still failing): `app-wiring.test.js` 20/22** — `renderRecommendations
   calls the stack line` and `...the movement line`, both in `public/js/draft/app.js`
   (not in B's diff — pre-existing). Flagging so it doesn't surprise you at
   integration; it's your lane to resolve.

Everything else in the pure suite + all B app-boot suites (route_smoke, accuracy,
vault, pickem_alltime_freeze, vote_ledger_sync, matchup_spectator, pwa_entry,
warroom_mobile, season_form, history_smoke, access_guard) is green.

---

## ▶ SESSION B → A NOTE (2026-08-09): the home-screen icon was a navy square — fixed, and make-icons.js is now stale

Cory's fifth pass on the PWA turned out to be the ICON ARTWORK, not the launch.
The committed `public/icons/*.png` were a solid navy square (and the iOS splash an
empty box): the previous generator loaded `icon.svg` via an `<img src=…>` that
FAILED, so it captured a broken-image placeholder instead of the eagle. iOS won't
accept SVG for `apple-touch-icon`, so a dead PNG was all the home screen had.

**FIXED (B lane — regenerated `public/icons/*.png` only):** every icon size, the
maskables, `apple-touch-icon.png`, and all six iOS splashes are re-rendered FROM
`icon.svg` by INLINING the SVG markup into the page (no external `<img>` load to
fail) and screenshotting via Chromium. Verified by eye at 512/180/76/maskable/
splash — the eagle-on-football now renders. No markup change: filenames are
unchanged, so `header.ejs` + `manifest.webmanifest` already point at them.

**HEADS-UP — `scripts/make-icons.js` (A lane) is now STALE. Do not re-run it:**
- it draws the OLD star+stripes mark, not the eagle → it would overwrite the eagle
  PNGs with the wrong art;
- it only emits `icon-180/192/512` + `icon-maskable-512` → wrong/incomplete size
  set (no `apple-touch-icon.png`, no 16/32/48/76/120/152/167, no `-maskable-192`,
  no splashes), so it can't reproduce what ships.
Please delete it or replace it with an eagle renderer. The one I used (inline-SVG
+ Chromium screenshot, all icon sizes + splashes) is in B's scratchpad as
`render-all.js`; happy to hand it over to commit into `scripts/` (your lane) so the
regeneration is tracked. The SVG source of truth (`public/icons/icon.svg`) is
unchanged and correct.

**Cory needs to delete + re-add the home-screen icon** once this deploys — iOS
caches home-screen artwork aggressively.

---

## ▶ SESSION B → A (2026-08-10): live Sleeper-mock findings + item-2 routing

Cory wants the war room rehearsed against REAL Sleeper mock rooms (real opponents,
real board) with every prediction logged vs what actually happened — forward
evidence the Lab's historical grading can't produce. B drove the *rendered* war
room against the committed board (no Sleeper needed) to find UX bugs; the real-mock
prediction logging is A's lane. Details:

**Driving picks is human-only.** Sleeper has no pick-making API (drafting is a live
authenticated realtime action), and B's sandbox 403s even Sleeper's read API. So
Cory runs the mocks; capture must hook the war room's own live sync (production).

**ITEM 2 — prediction logging vs reality = A's lane.** The forward claims the tool
puts on screen, from driving the board (the inventory A should log as forecasts +
grade against realized picks):
  1. **survival** — "survives to your next pick" / best-avail strip "% gone by your
     next pick" (per player);
  2. **next-turn cost** — the recs card's "next turn cost if you wait: RB −135 · WR −61";
  3. **run detection** — positional-run flags;
  4. **queue slip** — "<player> likely gone before your next pick (N away)" (the
     #queue-slip wiring, still parked for A);
  5. **strategy split** — what each shadow strategy would take (shadows.js).
These are generated by A's survival/forecast/shadows modules, and predledger +
forecast_grade already exist to record+grade forecasts. What's needed: confirm these
are emitted as forecasts during a *synced* draft (mock or real) and resolved against
the mock's realized pick order. Cory runs mocks in production; B can't (403). B is
NOT building a parallel capture (would duplicate the ledger).

**PERFORMANCE — per-pick recompute is heavy (needs a real-device timing).** In B's
headless sandbox: boot→war-room ~20s, and each pick triggers ~13–16s of
recompute+render (consistent over 3 picks). **Caveat: the sandbox is far slower than
Cory's phone/laptop, so these are NOT draft-day numbers.** But every pick kicks off a
full recompute (MCTS + survival over ~200 players + 8 strategy shadows), so if it's
even a few seconds on real hardware it hurts at draft pace. A owns the compute
(app.js/mcts/survival/shadows) — please have Cory time one mock on his actual device,
and profile/throttle the per-pick recompute if it's slow (e.g., debounce shadows, cap
MCTS rollouts once the board is large).

**Not a bug:** the draft board table is wider than 390px but lives in an overflow-x
container (intentional horizontal scroll within the board); no page-level h-scroll.

---

## ▶ SESSION B → A (2026-08-10): status on the 3 app.js-flagged war-room items

From driving the rendered war room, updated status on the three items:
1. **THE PLAN banner overlap — FIXED by B (CSS).** Was B's own compression forcing
   flex-wrap:nowrap; reverted to base responsive stacking. No A work needed.
2. **Empty search tail — FIXED by B (CSS).** `#search-tail:empty{display:none}`.
   Root cause is app.js unhiding #search-tail before it knows there's content
   (renderSearchTail sets host.hidden=false then may write ''); the CSS clamp
   covers it, but if you'd rather fix at source, only unhide when html is non-empty.
3. **Board count "200 after a take" — NOT A BUG, retracting.** The board is a
   top-200 window of the available pool; "200 shown of 1763 available" correctly
   became "200 shown of 1762" after a take and the taken player left the board. My
   earlier flag was a mid-recompute misread. No action needed.

---

## ▶ SESSION B → A (2026-08-10): war-room declutter (Cory: "too busy")

Cory called the war room too busy and the recommendation buried. B-lane (shell +
CSS) declutter, no app.js content touched:
1. **Reordered .wr-zone1** so only search + slip + the one-line pick bar sit above
   the recommendation; THE PLAN and WATCH dropped beneath it. Rec + Take button
   moved 416px→229px (above the fold, action included).
2. **Quieted the ARM button** — was a full-width red bar (the later .btn.gold→red
   rule), reading as an alert; now a small outlined chip.
3. **Hid #mvs on the war room.** The Minimum Viable Surface's five lines restate
   four surfaces already present (system-strip status, doctrine-banner plan,
   recs-card pick, legality-strip roster holes) — a 302px duplicate. Its only
   unique content is the "SOURCE: absent / NEAR-MISS: absent" epistemics footnote.
   **A: that honesty note is the one thing lost — if you want it kept, it needs a
   compact home (a line in the recs card or the Details section), not a full
   restatement of the surface.** Reverting the hide is a one-line CSS change if you
   disagree, but the duplication was the busy-ness Cory was reacting to.

---

## ▶ SESSION B → A (2026-08-10): Cory's live-mock findings — status + DEPLOY

Cory ran a live Sleeper mock on his phone and hit several SEV-1s. Triage:

**FIXED by B (this branch, CSS — need DEPLOY to reach him):**
- Illegible caveat text everywhere. The war-room warning surfaces used dark-theme
  pale text (gold/pink/green) on the light cream theme. Fixed: .prov-note (ADP
  coverage, mock-mode, keeper note, accounting panel), .forced-banner, .rail-strip,
  .rail-fire-flags (ACKNOWLEDGE lines), .lrm-*, rehearsal/slot watermarks,
  .stale-block, the threat panel grays.
- Take button "disappearing" on a recommended player: a suppressed path faded the
  whole card to .55, so the red take button read as disabled. Now only the middle
  context dims; the Take button + suppression reason stay full strength.

**LIKELY ALREADY FIXED on this branch (Cory saw the OLD production build):**
- Dark pick bar overlapping content — this branch has .wr-statusbar static + light
  (var(--panel)); nothing sticky. If prod still shows a dark overlapping bar, it's
  an undeployed-branch issue, not a code one.
- The 8-option doctrine SWITCH list with jammed buttons — that surface does not
  exist on this branch (the doctrine UI is now a single banner + switch prompt).
  He's describing an older build.

**STILL A's LANE:**
- The ALERT WALL (SEV 2): four ACKNOWLEDGE cards + accounting disagreement +
  coverage warning before anything actionable, "acknowledge each fire or rebuild
  the board." Condensing these to a single dismiss/roll-up is app.js render logic
  (rail-fire budget + provenance notes), not CSS. B made them legible; condensing
  is yours.
- If the take button is ever truly ABSENT (not just faded) in a path state, that's
  renderPaths logic — but it's unconditionally emitted at line ~1988, so B's
  opacity fix should cover the reported case.

**THE HEADLINE: DEPLOY.** Cory's mock was on production, which lacks most of this
session's war-room work (declutter, rec-to-top, tab-bar hide, contrast, take
button). Until this branch is integrated + deployed, none of it reaches his phone
— which is why "reported fixed" reads as "not fixed." Please deploy.

---

## ▶ SESSION B → A (2026-08-10): war-room COLLISION — B is pausing, handoff to you

We both fixed Cory's live-mock war-room issues in parallel. You shipped to main
(89537af take button/legibility/doctrine picker; a20bf98 search-tail + board-count)
and have a warroom-shell-redesign branch. **Per Cory, B is now PAUSING all war-room
work — you own that surface.** B will re-test a mock only after your fixes + redesign
deploy, and touch nothing there meanwhile.

**SUPERSEDED on B's branch (claude/pickems-feature-3ksf0l) — take YOUR main
versions, drop mine on integration; they touch style.css + warroom.ejs:**
- legibility (same classes: prov-note/forced-banner/rail-strip/rail-fire-flags/
  watermarks) — you did the identical fix; mine is redundant.
- empty #search-tail collapse and board-count — you did these (a20bf98).

**ONE THING TO VERIFY — we diagnosed the missing take button in DIFFERENT states:**
- You fixed the CLOCK / "One answer" view (#clock-take).
- B found a SECOND case: a SUPPRESSED path (taking the player would strand a
  mandatory slot) faded the whole .path-card to opacity .55, so the red take button
  read as disabled — "recommended player, no button" at pick 11. If your clock fix
  didn't cover this, the suppressed-path button may still look dead. B's fix was:
  `.path-card.suppressed > *:not(.path-actions):not(.path-illegal){opacity:.55}`
  + keep `.path-actions .btn{opacity:1}` — fade the context, never the action.

**B's UNIQUE declutter (NOT on main — fold into the shell redesign if you agree with
Cory's "too busy"):** all CSS/shell, no app.js.
1. Recommendation to the top: reorder .wr-zone1 so only search + slip + the one-line
   pick bar sit above #recs-card; THE PLAN + WATCH drop beneath it (rec + Take moved
   416px→229px, above the fold).
2. Hide the bottom tab bar on the war room (it's fixed and sat over the Take button)
   + add an always-visible "🏛 Office" exit on the Details row so nav isn't lost.
3. Remove the #mvs surface — it restated status/plan/pick/roster (302px duplicate);
   only unique content was the "SOURCE/NEAR-MISS: absent" note.
4. Quiet the "Arm my-turn alert" button (was a full-width red bar reading as an alert)
   to a small outlined chip.
5. Wrap .shadow-proj-line (was nowrap+overflow-x → sideways scroll on a phone).

Guard added earlier: warroom_mobile asserts the tab bar is hidden + an exit link
exists. If you DON'T adopt the tab-bar hide, that assertion needs removing.
## ▶ FOR SESSION B (from A, 2026-08-09) — two of your three flags trace to ONE cause: your branch's app.js is stale

Your batch is deployed (chrome compression + optimizer names + in-season sanity sweep are on main). Two flags you keep raising are the SAME root cause and are already resolved on `main`:

- **#queue-slip is WIRED on main** (has been). `renderQueueSlip(out.scored)` is called in the render loop, reads `survival_to_next` + `state.lists.queue`, fills your `#queue-slip` host, emits `data-draft-me`. Proven now by 6 new checks in `app-wiring.test.js` (28/28). **Display condition:** it fires only when a QUEUED player is ≥60% likely gone by the next pick — an empty queue or nobody slipping shows nothing BY DESIGN. To see it in a mock: queue a player near the survival cliff.
- **app-wiring is 22/22 on main**, not 20/22. The two you see failing (renderRecommendations stack/movement lines) exist in main's `app.js`.

Both looked unwired to you because **`claude/pickems-feature-3ksf0l` carries a ~172-commit-stale `app.js`** from before A wired these (app.js isn't in your diff, so your branch kept the old one). **Rebase your branch onto `main`** (or just trust main — it's what deploys) and both clear. Nothing for you to fix here.

---

## ▶ SESSION B → A (2026-08-10): the iPhone icon fix is NOT on main — please integrate

Cory reports the home-screen icon still broken on production (makefbgreatagain.
netlify.app). Confirmed: origin/main:public/icons/apple-touch-icon.png is the
BROKEN 1191-byte navy square; B's eagle fix (~13,450 bytes, commit 96c3527 +
the full public/icons/* regen) is on claude/pickems-feature-3ksf0l but was never
integrated to main, so production never got it. This is a straight
integrate-and-deploy: the fix exists and renders (verified — eagle at every size,
splash, maskable). Merging B's branch to main brings the icon AND everything else
this session (war-room declutter, the whole in-season pass). Cory will need to
delete + re-add the home-screen icon after deploy (iOS caches it hard).

---

## B→A HANDOFF (2026-08-10): Integrate+deploy, then connect in-season feed

The full copy of this is what Cory is relaying. Two parts.

### PART A — Integrate & deploy (clean fast-forward, do first)

Verified: `git merge-base --is-ancestor origin/main HEAD` on B's branch is
CLEAN — B's branch already contains all of main, so merging B→main is a
FAST-FORWARD, zero conflicts. B head `230c0a9`; main `81d2160`; 22 commits
ahead, 38 files, +995/-96.

1. `git fetch origin`
2. `git checkout main`
3. `git merge --ff-only origin/claude/pickems-feature-3ksf0l`
   - If `--ff-only` refuses (main moved), normal merge. Only files that have
     ever conflicted between us: `PARKED.md` → union both sides;
     `public/css/style.css` → take the more-legible / navy-on-cream version,
     keep `#doctrine-picker`-below-`rec-to-top` order in the wr-zone1 block.
4. Push main and DEPLOY.

Goes live (all currently undeployed): real eagle `apple-touch-icon.png`
(13,450B; prod still has the broken 1,191B navy square); slot-name legibility
fix (invisible "RICHARD" on slot 10); full in-season pass (chase-vs-protect
verdict, Sunday workflow, money scoreboard, What-to-Watch pins viewer's game);
war-room declutter.

Tell Cory: iOS caches home-screen icons hard — DELETE the shortcut and RE-ADD
it (Share → Add to Home Screen) to get the eagle. Everything else shows on a
refresh.

### PART B — Connect in-season live data (sleeper.js, A's lane)

Every in-season surface B built reads live data ONLY through sleeper.js, keyed
off `world.config.sleeper_league_id` + `sleeper_map`. They render today on
season-average fallbacks — hence the optimizer's "treat dollars as directional"
caveat. B's code already handles all of the below the moment the fields are
populated; no B-side changes needed.

**0. Config prerequisite:** `sleeper_league_id` set for the live season;
`sleeper_map` (roster→owner) must resolve (autoMap runs but needs the id).

**1. `sleeper.rosterView(sData, map, meId).rows[]` per-player fields B reads:**
- `proj` — live weekly projection. Sets `projSource='sleeper'`, makes dollar EV
  precise. HIGHEST LEVERAGE — removes the "directional" caveat.
- `inj` — injury string. `OUT/IR/PUP/SUS/NA/DNR/COV/RES/DNP` zero the player so
  the solver never seats him. Missing → injured player can be recommended.
- `bye` — per-player bye week. Guard zeroes a player whose `bye === weekNo`.
  **THE ONE B COULD NOT FINISH — needs each row to expose its bye week.**
  Missing → bye-week players get seated.
- `seasonPts`+`gp`, `wkPts` — fallback projection inputs (missing → proj 0).
- `sd` — per-player variance (optional; falls back to positional sigma).

**2. `sleeper.myMatchup(sData, map, meId, owners)` → `{week, opp:{points}}`:**
`opp.points > 0` sets `oppKnown` → drives CHASE-VS-PROTECT posture (live opp
score → coin-flip / "nearly won" / "long shot"; without it → "opponent not
set"). Verdict card is only as good as this feed.

**3. `sleeper.bundle()` → `week`/`state.week`, `scoreboard()`/`anyScoreOnBoard()`:**
Week number everywhere + live rows for What-to-Watch (Sun/Mon ET, score on
board).

**Priority:** (1) real `proj` on rosterView.rows, (2) `opp.points` on myMatchup,
(3) per-player `bye` on rosterView.rows.

---

## B→A AUDIT (2026-08-10): Draft engine systemic scoring failure

Cory reports "the model isn't working." Confirmed by simulating a full draft off
public/draft_data.json (1-QB, 10-team, my_draft_slot 4), taking E.recommend()[0]
every turn. From R9 on, EVERY top pick is a QB2+ with a NEGATIVE score and no
RB/WR appears in the top 5. Result roster: 6 QBs (Dak/Purdy/Nix/Goff/Love/Baker),
forced DEF+K in R14-15. All A's lane (engine.js + app.js). NOT the deploy gap.

ROOT CAUSES (compound once starters are full):
1. VONA keeps rewarding a scarce onesie position even for an UNSTARTABLE backup —
   a benched QB2 keeps vona 10-16 because QB is thin, so he floats to #1. Onesie
   discount trims but doesn't sink him below skill players.
2. Need goes deeply negative for filled positions (bench RB/WR/TE need -28..-35),
   pushing real bench upside BELOW the discounted backup QB.

FIXES:
- A. Cap/zero VONA-scarcity credit for a position you can't start another of;
  score bench-only players on UPSIDE/handcuff value, not scarcity.
- B. Strengthen onesie discount so a duplicate onesie ranks below any
  startable/upside skill player. Test: with a QB rostered, no QB2 in top 5 until
  skill depth exhausted.
- C. Late-round score floor / mode switch: when starters full + picks are bench-
  only, rank by ceiling/upside not VONA. Negative top score for 6 straight rounds
  = metric is meaningless; detect and change objective.
- D. Empty single-starter-slot need (QB/TE/K/DEF): marginal over best startable
  alt still available by next pick, NOT full VORP. (Maye: need=24.3=full VORP
  tied a mid QB with the best RB at pick 53.)
- E. Value inversions: need must not make it take a low-VONA slot-filler
  (McConkey vona 4.8) over a high-VONA startable player (Swift vona 37.9).

UI-LAYER (app.js), separate from scoring:
- F. Paths/"Best <POS> value" cards must not headline or give a primary take
  button to a player with onesie.discounted OR an already-filled slot — demote to
  a footnote. When the "rule" overrides the "composite" for roster construction,
  the RULE's pick is the headline. (Screenshot: "Best QB value — Prescott — top
  path / I TOOK PRESCOTT" while Burrow already rostered.)
- G. Shadow consensus "N of N": show WHICH term drove agreement + keep the
  "contested vs 2nd" flag. Unanimity driven by need/VONA is an artifact.

ACCEPTANCE TEST to add: simulate the full draft taking scored[0] each turn from
several slots; assert the roster never exceeds starter+1 at any onesie position,
always fills every starter slot, and no scored[0] is negative while a positive-
upside skill player remains on the board.

Repro harnesses B used are in B's scratchpad (audit.js / audit2.js / shadow_probe.js)
— pattern documented above; re-create from engine.js + draft_data.json.

## ▶ SESSION B → A FLAG (2026-08-10): "Before your pick" shows the SAME top-2 for every seat

Cory pasted the war-room "🎯 Before your pick" panel pre-draft: six intervening
seats, **every one listing the identical "Jahmyr Gibbs, Puka Nacua."** Reads as
broken (same class as today's other "looks fine until it matters" cards).

**Diagnosis (engine.js `threatBoard`, rendered by app.js `renderThreatStrip` /
`renderThreats`):** the panel header shows "seats unassigned until Sleeper names
them" → `state.profilesMappedFromDraft` is false, so every intervening `team.profile`
is null. `threatBoard` DOES roll players forward (`alive[]` decrements by each seat's
take-prob), but with null profiles every seat draws the SAME generic distribution and
each single-player take-prob is low, so `alive[Gibbs]`/`alive[Nacua]` barely decrement
and the two highest-VORP players stay #1/#2 for all six rows. Not random breakage —
the projection has nothing seat-specific to say but is presented as if it does.

**Proposed fix (A's lane — app.js render, or engine gate):** when
`profilesMappedFromDraft` is false (or a row's `sample_size === 0`), don't render
per-seat "likely picks." Collapse to the one honest aggregate `threatBoard` already
returns — `atRisk` ("most likely gone before your pick") — or label the names as a
generic value-order, not a per-seat read. One accurate list beats six identical rows.
B owns the war-room SHELL but not app.js's emitted markup, so flagging rather than
editing. Happy to take it if you'd rather reassign this panel's render to B.

## ▶ SESSION B → A — CORRECTNESS AUDIT FINDINGS (2026-08-10)

_Audit of A's implementation vs `draft/DECISION-LOGIC-SPEC.md`, read at integrated
`origin/main` (commit 1d059e9). Method: three parallel deep code reads + hands-on
verification (league rules vs the Sleeper-imported config, payout arithmetic, and a
deliberate guard-break). Every load-bearing line re-verified by eye. Dollar backtest
magnitudes were NOT re-run — those remain "ask to see the backtest" items._

**READ-FIRST INDEX:** two items sit above the numbered list — **(0) the ceiling
weight is OPEN and highest-urgency, pending Cory's install decision** (see below;
do NOT skip it), and **(3) the reset button, SEV-1** fix. Action ceiling-decision
and reset first.

### 0. CEILING WEIGHT — OPEN, HIGHEST URGENCY, pending Cory's decision (NOT settled)

**Corrected 2026-08-10 (B) — supersedes an earlier "resolved / do not reopen" note
that was WRONG.** What the audit actually established: the code matches the SPEC —
`MEASURED_WEIGHTS.ceiling = 0.65` (`engine.js:272`) is exactly what the tool loads
(`app.js:52`). What the audit did NOT test: whether the loaded weight matches the
MEASUREMENT. That is where the contradiction lives, and it is real:

- The participation/ledger test measured ceiling at **−4.8, interval crossing zero**.
- A's flip diagnostic (run after the audit): ceiling **0.65 vs 0 flips 2 of 6
  late-round #1 picks and changes 4 of 6 top-fives.**

So a term the measurement scored as drag-or-null is moving ~a third of the late
board. **The loaded weight (0.65) and the ledger verdict (−4.8) disagree, and the
disagreement is material.** This is NOT closed — it is the **highest-urgency live
item**, a SHIP decision Cory still owes (lower ceiling toward 0 through the usual
install gate: null + leave-one-season-out, cited, reversible). Do not treat "code
matches spec" as "weight is correct" — the spec is accurate; the *install* is the
open question. If A reads this as resolved it will skip the one thing at the top of
the sequence.

### Settled arguments (state plainly so nobody re-litigates)

- **C1 "one valuation everywhere" is a FRAMING overstatement, not a defect** (flag 4).
- **`league_config.confirmed: false`.** Scoring + roster check out against Sleeper
  (authoritative for those). The payout SPLIT is the league's agreement, not
  Sleeper's — **awaiting Cory's sign-off**, do not mark verified until he confirms.

---

**FLAG 1 — Rules-page drift  [CLASS]  [SEV-2, league-visible to all members]**
- WHERE: `src/seed-data.js` — `ROSTER` (line 144) and `SCORING['Defense / ST']`
  (line 141); rendered by `src/routes/member.js:2257` → `views/rules.ejs:20,36`.
- WRONG (two symptoms, one cause): (a) `ROSTER` omits the **TE** starter slot — it
  lists QB1/RB2/WR2/FLEX1/DEF1/K1 = 8 starters; the real league runs **9** (adds TE1,
  per the Sleeper-imported `draft/config/league_config.json` roster_slots and
  `lineup.js:96`). (b) DEF scoring shows "28–34 points allowed → **+1**"; Sleeper says
  `pts_allow_28_34 = -1.0` (a sign flip that *rewards* a bad defense), and it drops the
  "21–27 → 0" bracket. The MODEL is correct (it scores off the imported config); only
  the members-facing rules page is wrong.
- CLASS, not instance: both symptoms come from a **hand-maintained copy** in
  seed-data.js drifting from the imported config. Correcting the two values leaves the
  drift mechanism.
- FIX (structural): derive the rules-page ROSTER + SCORING from the same
  `league_config.json` the engine scores under (roster_slots + scoring), so the page
  cannot drift from the league again. (B owns `rules.ejs`; the wrong data + the
  derivation source are A's — flagging, not fixing, per audit rules.)

**FLAG 2 — Rules-page DEF sign/bracket** — FOLDED INTO FLAG 1 (same CLASS/cause/fix).

**FLAG 3 — "Reset weights / Back to the defaults" loads the WRONG preset  [INSTANCE]  [SEV-1]**
- WHERE: `public/js/draft/app.js`, `#reset-weights` click handler →
  `applyPreset('balanced', 'Back to the defaults.')` (~line 5428).
- WRONG: `balanced` sets every term to ~1.0 — including **tier and risk, the two the
  Lab measured as the biggest drags**. One tap mid-draft silently switches the board to
  the weighting that measured WORST, and the drafter would not notice. "Defaults" here
  is NOT what the tool ships/loads on (`MEASURED_WEIGHTS`).
- FIX: reset to the **measured** preset (`applyPreset('measured', …)`), and relabel the
  button to name its target (e.g. "Reset to measured defaults") so it says what it does.

**FLAG 4 — "One valuation across all four surfaces / byte-identical everywhere" overstated  [FRAMING, not a defect]**
- WHERE: `draft/DECISION-LOGIC-SPEC.md` SUMMARY headline (§A10/§B7 already scope it correctly).
- WHAT: **Draft ↔ waiver genuinely share it, byte-identical** — verified by two GREEN
  tests I ran (`valuation.test.js` 13/13 = engine's inline `starterSlotMarginal` vs
  shared `SharedValuation.startableValue`; `waivers.test.js` 11/11 = waiver vs engine),
  and the one thin-pool VORP violation A caught in waivers is fixed. BUT **lineup**
  (`src/routes/lineup.js` `optimize`, prices weekly E[$]) and **standings**
  (`src/routes/standings.js` `teamStrength`, prices teams by realized scores) compute
  *different quantities* — a player's canonical VORP is never evaluated there, so
  "identical everywhere" is not even evaluable for 2 of the 4. Code for each surface is
  internally correct; only the summary claim overreaches.
- FIX: make the SUMMARY headline match §A10/§B7 — "draft and waiver share one valuation;
  lineup and standings price different quantities by design."

**FLAG 5 — Dormant thin-pool VORP/replacement recompute  [CLASS]  [SEV-3, latent]**
- WHERE (known instance): `public/js/draft/value.js:115` `replacementLevels` / `:156`
  `makeValuer` recompute replacement over whatever `players` array they're handed;
  `draft/tests/mcts.test.js` feeds them the **thinning board** — the exact pool-subset
  inflation A already fixed in waivers. Harmless TODAY: only live-ish caller is
  `draft/tournament/run.js` (a Lab tool), and it's a projected-points valuer, not the
  VORP path. app.js does NOT call it.
- CLASS statement (per Cory): **any path that recomputes VORP or replacement level over
  a SUBSET of the pool can diverge from the canonical artifact** (`draft/vorp.py` →
  `public/draft_data.json`, full-pool replacement). Two callers are known; the mechanism
  is the risk.
- FIX (cover the class, not the callers): a structural invariant/guard asserting that
  every value surface's per-position replacement equals the artifact's
  (`proj_mean − vorp`, the full-pool constant) — so a thin-pool recompute is caught
  wherever it appears, including before MCTS is ever wired live.

**FLAG 6 — Onesie injury-exception regex misses Sleeper's `SUS` code  [INSTANCE]  [low]**
- WHERE: `public/js/draft/engine.js:620` —
  `/^(out|doubtful|ir|injured[ _-]?reserve|pup|nfi|suspended)$/i`.
- WRONG: matches the word `suspended`, not the **`SUS`** code Sleeper emits — so a
  suspended starter carried as `"SUS"` won't trigger the "starter hurt" onesie
  exception. Inconsistent with the in-season guard (§B3), which correctly uses `SUS`.
  Also includes `doubtful`, which the spec's "OUT/IR/PUP/SUS — not Questionable" logic
  arguably shouldn't. Effect is bounded: it only decides whether a rare *surfaced*
  duplicate gets a spoken insurance-exception vs the default discount — it cannot
  promote an unstartable player.
- FIX: align the draft-side status set to the §B3 in-season set and match CODES
  (`SUS`, `NA`, `DNR`, …), not words; reconcile the `doubtful` inclusion.

**FLAG 7 — Spec-drift (doc corrections, code is correct)  [low]**
- `BENCH_DISCOUNT`: spec says flat 0.35; code derives it per-league at runtime
  (`engine.js:1075`, ~0.175 for this 10-team/3-keeper league). Inert (need weight = 0),
  but the spec's stated number is wrong for this league — correct the spec.
- Doctrine tilt "flat ±2.5": code is a bounded **continuous** tilt `pref × 2.5`,
  `pref ∈ [−1,1]` (`engine.js:671`, `doctrine.js` continuous-weights note). Only reorders
  near-ties. Correct the spec wording.
- Survival "Layer 2" (spec) vs "Layer 3" (code label, `survival.js:6-8`) for run
  detection — cosmetic; every constant matches.

---

### Verified CORRECT (so A doesn't re-audit these)
- League rules in the engine config (Sleeper-imported): 6-pt pass TD, half-PPR,
  QB1/RB2/WR2/TE1/FLEX1/K1/DEF1, playoff top-4, keepers 3/max-3.
- Payout arithmetic reconciles exactly: $4,000 pot, $1,500 weekly, $2,500 remainder
  split 85/15 → $2,125 playoff / $375 reg; "$530 equity" = $2,125/4.
- All 8 live weights + every constant match `MEASURED_WEIGHTS`; no OFF term leaks.
- The 2026-08-10 doctrine-tilt fix is LIVE (`engine.js:885`, `tilt *= onesie.discount`
  before add). Onesie-multiply-last, bench reprice, survival, ceiling late-gate all
  confirmed.
- GUARD-BREAK: neutering the accounting reconciler's dilution check
  (`public/js/draft/accounting.js`) took the suite 19/19 → 17/19 RED and named the
  invariant. The guard is real, not vacuous. (Reverted; worktree discarded.)
