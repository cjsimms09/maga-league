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
