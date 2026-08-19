# DRAFT-WEEK BRIEF — read this first (written 2026-08-17, draft is 2026-08-22)

---

## ⚡ 08-18/19 NIGHT — appended by A so the first-read file does not repeat its own famous failure (four files describing a pre-ruling state). Everything below this block describes 08-17; this block is what changed since.

**THE PROJECTION QUESTION IS SETTLED FOR THIS DRAFT AND MOVED TO ITS REAL VENUE.**
A2 is CLOSED (A ruled, backed by Cory's A11 pre-authorization chain): **Sleeper
stays the board baseline through Saturday.** V7 ran three times and V8 once —
usage/efficiency 0/3 folds, C4/C6 double null (C6 caught as a 0.9997-correlated
costume by the standing >0.98 gate, its first live firing), and V8's WR
source-correction a two-fold null with the champion surviving best-of-K. The one
replicated positive is PER-GAME-shaped (WR λ 0.75/0.61, CI>0 both folds, with a
dated survivorship caveat on P98): our model knows WR per-game production the
market doesn't price; the market knows availability. So the fight moved to where
per-game is graded: **the weekly lab, frozen at week zero** (`WEEKLY-LAB-FREEZE-
2026.md` — pairwise start/sit metric implemented in `start_sit_metric.py`, wired
into the Tuesday grader, Cory-bar computes itself from 09-15; predictions P101 on
record). C's weekly projection archive (Sleeper+FP, pre-kickoff Thursdays) is
LIVE in CI — the capture that makes the 2027 goal gradeable at all.

**ROSTER-SHAPE STRATEGY IS A POWERED NULL, NOT AN OPEN QUESTION.** The
many-worlds simulator (`season_forward_sim.py`, identity/conservation-certified)
re-asked the tournament's question across 54,000 priced worlds: the oracle is
worth +$425-1,438/season against ~$20 resolution, and NO strategy separates from
following the market (P100 TRUE). Draft-day implication: take the board's value,
don't force shapes. The in-season half (`season_forward_inseason.py`) hindcast
2023-25 as-if-live and beat the constant-odds baseline 2-3x at week 8 in all
three seasons (P103 TRUE) — `write_live()` feeds B's playoff-odds widget from
week 1, with 2025's late-upset week-12 degradation as its standing humility
caveat.

**BOTH E FIXES CORY WILL DRAFT ON ARE REVIEWED AND ACCEPTED, not just ticked:**
E15 (the Nix-over-Purdy QB inversion — dead twice over: the population-polluted
calibration was regenerated AND the cross-band tiebreak gate refuses the class)
and E35 (the keeper reconciler false-halt on Cory's exact 3-keeper slate — the
still-halts-on-real-errors arm verified). The runbook's freeze order is fixed in
its own heading (Saturday AFTER 03:00 CDT, never Friday), the keeper banner is
live off Cory's committed ruling, and the restore-button trap (5g) is ruled and
dispatched.

**THE ANCHOR QUESTION RUNS ON SATURDAY'S OWN DATA.** The probe that justified FP
as the ADP anchor had compared FP to itself (ρ=1.0000 exactly); the real
comparison (`exp_real_ffc_vs_fp.py`, refusals wired for the old defect's
signature) shows ρ=0.894 in Cory's window — genuinely different sources. FP
stays wired for Saturday; **P102 grades which source better predicted the room's
actual picks, within 48h of the draft.**

**LEDGER: 103 predictions, none overdue.** Registers 19/19b, 5l, 5n, 5i, E15,
E35 closed with evidence; the inbox tick-sweep (~110 items) cleared the
acting-without-ticking debt across all lanes. The captures run themselves:
weekly projections (Thu), event player props (Thu), odds (Thu/Sun), Kalshi
(daily), the Tuesday grade, the nightly board. Next human dates: keeper lock
FRIDAY 08-21 6pm CDT (Cory's ruled date; older docs' 'Thursday' was weekday
drift — the config derives the weekday from the date for exactly this reason),
freeze Sat after 03:00 CDT, draft Sat 6pm.

---

**Supersedes `MONDAY-BRIEF.md` as the entry point.** That file is still accurate
about 08-15/16 and is not deleted; this one covers 08-17, which changed the
model's foundations rather than its features.

**Who wrote this:** the research-relay session, branch
`claude/fantasy-football-research-926y6z`.

**Cory's order for the day, verbatim:** *"Above all!! Fix the data problem and
make sure we don't have other mistakes in our info!!"*

---

## 🎯 08-17 NIGHT — THE TAKE-A-SWING PACKAGE (Cory's ruling, verbatim in
## league_config.rookie_capital_prior; every layer MEASURED before it shipped)

Cory: *"fix this model, even if we need to lower our standards for this year
only... give me a draft tool that gives me a chance at edge... lets at least
take a swing."* Shipped under that ruling, each with its receipt:

1. **Rookie capital prior — ON, in the build** (`build.py`, gated on the
   preserved config ruling so no rebuild erases it). Preregistered, cleared
   its 25% bar on the 3-season all-seats replay: **+25.1 pooled optimal (38%
   of the Cory gap), realistic-arm league position 2/10 → 4/10**; 2025 +86,
   2024 −10.6 (concentration stated). 74 board rookies gain an own-model
   value from Prior(pos, NFL-capital bucket), classes 2021-25.
2. **Opponent-need survival layer — ON** (`survival.js OPPONENT_NEED_LAYER`,
   artifact published + app loader wired). Pooled ΔBrier **−0.0039
   [−0.0067, −0.0015]** vs the engine baseline, never significantly worse in
   any slice; 2025 engine-sd slice null, stated. Sharpens the grab-by /
   gone-by numbers with per-owner need-conditioned tendencies.
3. **Study facts baked into the tie-break voice** (patch applied): trajectory
   lean first (58% of 176, CI 51-65, "a lean not a law"), volume-over-
   efficiency (WR share ρ .704 vs efficiency .322), RB draft capital
   (ρ −0.427, 3/3 seasons), and the coin-flip truth on the other 8 facts.
4. **Floors/ceilings corrected** — the calibration regenerated on real
   2023-25 outcomes (Cory's direct order); board rebuild carries it live,
   plus the late-trajectory field. One finding en route: **RB top-decile
   ratio is flat across rank bands (~1.8×)** — real by the Rule-3d screen,
   C cross-checks the method by 08-19 (register 39 — renumbered from 31 on 08-18, the id collided).

**The honest frame:** the restated 3-season replay already had the tool at
**+7.48/season pooled optimal over Cory's own drafting** (the −65.7 headline
was status-blindness in the harness, not the tool); the rookie prior's
+25.1 stacks on the same yardstick. That is the swing: every gated layer
with a measured win is now live, none of it invented tonight.

## ⚡ 08-17 LATE NIGHT — what landed after the evening section (A, gatekeeper)

**All three of Cory's rulings are IN THE LIVE ENGINE:** adp_sd 0.11/2.0 (every
band 0.95-1.02x market; backtest ordered, reversion armed), ceiling weight
0.45 (inside the measured winning band — the 3-seed prereg has every engine-scale
value 0.15-0.65 beating zero; "at the peak" was retired 08-18 when A checked the
formulas: exp 21's λ=0.5 inverted-U peak multiplies the RAW spread while the
engine weight multiplies a 0.15-scaled, 20-point-capped bonus, so the two scales
never shared an axis. Top rec verified unchanged at Cory's picks),
the ruled board itself published (first since 08-15; issue #8 auto-closed).

**The war room is the tabbed COCKPIT, desktop-first, deployed and probe-verified**
— one adjudicated TAKE, position rails, range bars, running-out tiles, tier-cliff
chart, drill-downs. Evening item 2 (desktop-first): **RESOLVED** — executed in the
cockpit spec. Evening item 4 (two weight systems): **RESOLVED in substance** —
MEASURED.ceiling now 0.45, aligned with autoWeights' build phase at the measured
peak, so the toggle no longer changes the model; which mode Cory drafts under is
his rehearsal decision (AUTO defaults OFF — the routed "on by default" claim was
false, corrected in the 0.45 commit).

**Cory personally caught a live model defect from a screenshot** — every fallen
elite showing "41% gone." Verdict: guard-order bug (empty-window survival asked
after the far-tail guard answered "certainly taken"), which erased the room
model's differentiated survivals and had silently CUT NACUA from the pre-draft
pool. Fixed same-day with the algebra pinned (`survival_fallen_uniform.test.js`);
deployed.

**The "tool ties its user" headline was mis-attributed:** the all-seats table
graded a weakened PROXY (BPA-by-VORP, market arm removed, no engine terms) and
~70% of its losses were board-vintage status blindness the live board verifiably
does not have. The live tool's edge is UNMEASURED; the real-engine replay via
`draft/backtest/replay.js` is running now (queue: TO: A, live-edge item).
Surviving findings: own_v6 overprices declining veterans (evidence FOR the REC-2
composition hold; names the v7 decline term), and the human rookie edge is
August news, not draft capital (inventory routed to D).

Evening items 1 (wrong-seat computation) and 3 (proj_mean is Sleeper-only, and
the blend question) — 1 remains OPEN; **3 is ANSWERED (20:40): the blend run
graded NO SEPARATION** (`source_blend_2025.json`, `44cff5ad`). Best blend
w=0.75 beats both sources in only 2/4 positions against a prereg bar of 3;
Cory's exact 50/50 also 2/4; NAIVE control correctly lost, so the run could
have detected a winner. **Sleeper stays — measured, not assumed.** January
re-test extends the grid past 0.75 (best_w sat on the edge).

**AND WITH THE BLEND NULL, THE KEEPER SLATE IS FINAL (chain steps 1–2 closed):
keep all three — Chase R1 (+43), Henry R2 (+10), Walker R3 (+32), surplus
+86.3** on the survival-fixed, rulings-live board; every keep-fewer option is
strictly worse. Cory confirms at the lock — **08-21 6:00 PM CDT, his 08-18 ruling** — and the board re-derives then.

## 🔴 08-17 EVENING — FIVE FINDINGS EVERY LANE NEEDS, AND FOUR ARE DRAFT-CRITICAL

> **STATUS AS OF 08-19: item 1 is STRUCK (false — verified in a browser) and item
> 4 carries a correction (the ceiling weight shipped at 0.45). Read the strikes,
> not the heading — the heading describes what was true on 08-17.**

*Added by the relay so these reach lanes without waiting on a merge. Cory today:
**"are you following up and delegating appropriately so nothing gets missed."**
They were in the register and the register is not what people read first.*

~~**1. THE WAR ROOM COMPUTES EVERY PICK NUMBER FOR THE WRONG SEAT** (register 4c).
Its own banner says so: 3 keepers mean Cory owns 12 picks, the board gives 15,
the seat belongs to someone with 0 keepers. That build was sent to Cory as a
demo.~~

**⚠️ FALSE ON THE CURRENT BOARD AND THE CURRENT PAGE — struck 2026-08-19,
register 4c CLOSED 08-18. THIS IS THE ONE TO READ IF YOU READ ONLY ONE
CORRECTION IN THIS FILE, because uncorrected it tells Cory to distrust every
pick number, survival % and timing call on the surface he drafts from, three
days before he drafts on it.** Verified in a REAL BROWSER against a real war
room, not read off the artifact: `pick_order.my_picks` is **12 entries — 33, 48,
53, 68, 73, 88, 93, 108, 113, 128, 133, 148** — with `my_picks_before_keepers`
carrying the 15 and the three keeper-consumed picks (8, 13, 28) sitting **only**
in the latter. `forfeited` names Chase/Henry/Walker at `cost_round` 2/1/3, all
`team_slot: 8`. Rendered `/admin/warroom` as commissioner and read the DOM: it
says *"🟢 YOU ARE UP · pick 33"* and *"seat 8"* — pick 33 is exactly
`my_picks[0]`, and none of the keeper-consumed picks appears as his. The
numbering model is documented and checked against 2023/2024/2025 (150 picks,
round 4 at overall 31 every year).

**HOW IT SURVIVED FOUR DAYS, since that is the reusable part:** the row was
closed in the register and nobody swept the file the register is not. I found it
by listing every register id these Cory-facing docs name and checking each
against its live status — 15 references across four files, and **most were
legitimate pointers rather than defects**, so the sweep's raw output was mostly
noise. It was still worth running: one real instance, in the file `CLAUDE.md`
tells every session to read first, on the page Cory drafts from.

**2. CORY DRAFTS ON DESKTOP. A's LIVE ORDER TO B SAYS PHONE-FIRST** (4d).
`7ee6f993`, 16:06 today, specifies *phone-first* and *the 390px column*. The
assumption dates to 08-13 and was reasonable until this morning. **Desktop is the
surface that must be right on 08-22.**

**3. `proj_mean` IS SLEEPER, SCALED — FANTASYPROS ENTERS NOTHING** (21).
`proj_baseline == proj_sleeper`, **422 of 422**; `build.py:1003` states the
formula. FP (422 players) and own_v6 (416) are carried and DISPLAYED but reach no
number. **Nobody decided this** — it is a default. No surface may call `proj_mean`
a "consensus" or a "blend" (21b).

**4. TWO WEIGHT SYSTEMS DISAGREE ABOUT UPSIDE, AND A BROWSER TOGGLE PICKS** (25).
~~`MEASURED_WEIGHTS.ceiling = 0` (`engine.js:567`).~~ **STALE — CORRECTED 2026-08-18: the live value is `0.45`, shipped as `09f94f99` when Cory ruled it.** The point of item 4 survives and is arguably sharper: the two systems still disagree and a browser toggle still picks between them — but the disagreement is now 0.45 vs the Auto ladder, not zero vs non-zero. `autoWeights()` ships **0.45
Anchor / 0.6 Build / 0.8 Fill** (`engine.js:3386`). State lives in `localStorage`
and **no surface says which is active.** "The model ignores upside" is true only
with Auto OFF. This reframes the ceiling ruling: not zero-vs-non-zero, but *which
system is authoritative.*

**5. THE SLEEPER-HISTORY BLOCKER WAS FALSE, AND THE PROOF SAT IN A LOG FOR A DAY**
(24). Three committed files called it "permanently unmeasurable"; none had asked
the API. **2025 passed every leak gate.** The 08-16 run was dispatched off a
worktree branch and the push guard discarded its answer. Re-dispatched from
`main` today — verdict committed as `0f9ecbe2`.

**THE BLEND IS NOW RUNNABLE AND HAS NEVER BEEN RUN.**
`SOURCE-BLEND-2025-PREREG.md` is committed (before any number, per house rules).
The remaining blocker is a **fetch** — neither artifact carries per-player rows —
and fetching is C's lane, not A's. That mis-route is the relay's.

**THE ADJUSTERS WERE NEVER FITTED, AND THE STATED REASON IS A CHOICE** (26).
`autoWeights` says three drafts is too few. That n=3 is *"one league, ONE SEAT"*
(`PRE-REGISTRATION-three-season-replay.md:362`), and line 396 of the same prereg
lists the fix: *"SEAT — 10 managers, not 1."* ~30 draft-seasons, and `replay.js`
already drives the real `engine.js`. Post-08-22 — a fit, not a hotfix.

---

## 🟣 08-18 NIGHT — THE THREE THINGS THAT CHANGED FOR SATURDAY (A)

**STATE AS OF 08-18 ~06:00 UTC, so nobody re-derives it:** the board is
PUBLISHED (05:33Z), deploy-verified, and frozen as **v27** — the first build
where every input is playoff-free. All suites green on it: Python 4,174+, JS
326/326 (the first fully green night). Keepers carry vorp 94.0/59.1/46.2 on
the badge screens for the lock (**08-21 6:00 PM CDT — Cory ruled 08-18**; earlier copies of this brief said 08-20). The v7 candidate hunt has now killed
FIVE ideas the honest way — C1 age curves, C2 ridge, C3 fitted recency, C5
WR-only efficiency, C7 availability gate — each graded leak-free on TWO
walk-forward folds (`v7_candidate_grade.json`), and the night's best
finding is methodological: two of them looked shippable on exactly one
fold each and died on the other. own_v6 is a hard baseline: nothing
changes before Saturday, and nothing measured this week says it should.

**0. THE LEAGUE ANALYZER FOR THE RICHARD BET: YES — IT IS BUILT, TESTED, AND
ONE BUTTON AWAY.** Cory asked whether it will be ready right after the draft.
It is ready NOW except for data that will not exist until the last pick:
`league_analyzer.py` (11 tests, decision logic exercised offline like
source_blend) + a `league-analyzer.yml` dispatch that fetches the final
rosters and picks from Sleeper and commits `public/league_analysis_2026.json`
— projected all-play standings (best legal lineup per team through our own
projections, no schedule luck) and per-team draft grades (surplus vs this
draft's own round means, keepers excluded, best/worst pick named). Dispatch it
minutes after the draft ends; B is routed the display surface with a default.
One honesty line, which the artifact itself carries: these are PROJECTIONS —
bet on them as our model's opinion, not as results.

**1. THE BOARD IS MAKING ONE DELIBERATE BET, AND NOW IT IS NAMED: TE.**
Measured on the live board: TEs sit **+50 spots ahead of market** on average in
the top 150 (LaPorta board 37 vs market 67) while RBs sit −23 behind. It is NOT
a formula error — the replacement theory died to the decimal (our TE bar 136.4
== the market's own TE10, Kelce, 136.4). The drivers are the SOURCE (Sleeper
prices these TEs above what the ADP herd pays) and YOUR 0.45 ceiling weight on
the position with the board's largest measured upside multipliers. On the
clock: a TE falling toward you is the board's bet paying off; if you would
rather not be 50 spots ahead of the room on a streamable position, take the
market's side on that pick knowingly. Register 5c has the full working.

**2. THE OUTSIDE-SOURCE CEILING HUNT IS OVER — GRADED, TWICE, NO.** Expert
disagreement (all three preregistered arms, three seasons, nothing excluded)
beats the incumbent ceiling on **0 of 3 seasons**; an independent grading on
top-12 hits agreed earlier the same day. The signal is real information about
the ROOM (where rankings-followers get unpredictable), not about the player's
season — so the war-room badge says "experts split," never "upside." The
ceiling column stays the v25 construction: measured cell level × the player's
own 2025 volatility, capped at physical plausibility. Re-test: 2027 captures.

**3. THE KEEPER BADGE LIE IS DEAD AT THE SOURCE.** E caught the war room
claiming "Zay Flowers beats Ja'Marr Chase by 17" at your first pick — keepers
shipped without a value field and `(vorp || 0)` turned absent into zero.
Ranking never moved (measured, 0 of 120 slots); the sentence was false. Keeper
vorp is now stamped at build time from the board's own identity, the UI
derivation is the fallback, and two pins make a keeper without a value refuse
the build. If a keeper-comparison badge fires Saturday, it is arithmetic now.

## 1. THE ONE THING TO UNDERSTAND

Every dispersion field on the board — `proj_ceiling`, `proj_floor`, `proj_sd`,
`weekly_sd` — was `proj_mean x (a per-band constant)`. Spearman **1.0000**
against the projection inside a cell: **exactly zero player-specific
information.**

That single fact caused three separate conclusions we had believed:

- the composite `ceiling` weight measured collinear with `value` and was zeroed
  — **the first of the three to be re-run, and it reversed: a non-zero ceiling
  weight beats the shipped zero in 3/3 seeds, separably. §7b.**
- the phase grid could only discover that double-counting the projection hurts —
  and that null was written up as *"upside late is REFUTED"*
- the variance modifiers came back unmeasurable

**One cause, three "findings".** Most of 08-17 was fixing that and re-running
what it invalidated.

## 2. WHAT IS FIXED

| | |
|---|---|
| **production ceiling/floor** | measured p90/p10 per (position, band), replacing a Gaussian over the mean |
| **the BACKTEST HARNESS** | `build_bundle.py` wrote `1.35 x mean` / `0.25 x mean` as GLOBAL constants — every weight experiment ever run on a bundle was collinear. Now measured, leave-one-season-out, absent off an unmeasured cell. VERIFIED END TO END in CI run 32002876691: ~706 of 841 players attached per season, 98-135 correctly refused |
| **the money proxy** | `cory_conditional` hardcoded keeper `weekly_sd = 8.0`; real values are 15.21 / 30.22 / 33.47 (Chase / Henry / Walker, re-read off the 08-18 **05:33** board — they were 29.95 / 33.26 on the 03:44 build and the routine daily rebuild moved Henry and Walker by ~0.2 each while Chase did not move at all — the clean 3-season calibration plus the per-player volatility term moved Henry and Walker up: both carried a high realized 2025 weekly cv). Understated team weekly sd by 11.1%, **biased toward the conclusion it was being used to draw** |
| **snap counts** | 35,869 skill player-weeks pulled, 2021-25, weekly job, registry-gated |
| **playoff-SOS artifact** | regenerated (my board rebuild had added 5 rows it predated) |

## 3. WHAT IS NEW AND MATTERS MOST

**`draft/backtest/weekly_volatility.py` — the per-player upside signal exists,
and the data was committed here the whole time.** `nflverse_variance.py` was
written to measure it and was never run and never consumed.

**It is 2023-25 because 2021, 2022 were REFUSED, not because that is all we
have.** Those two seasons carry a different `scoring_fingerprint` — they were
scored under a different table — and pooling them would produce per-player
totals that never existed under either table, with (in the store's own words)
"nothing in the arithmetic to complain". That refusal costs two seasons and
leaves only two transitions, which is why the coefficient below is directional
rather than precise.

Realized weekly volatility (`cv = sd/mean`, our scoring), 2023-25:

- within a fixed mean band, cv spreads **1.57x-1.88x** (a `mean x constant`
  field has none)
- year-over-year persistence **rho +0.469 and +0.635**, both clearing a 400-draw
  permutation null; control (mean carryover) +0.736 / +0.779

**Volatility persists at ~two thirds the strength of scoring LEVEL.** Compare
snap-share volatility at +0.19, pulled the same day.

**Its boundary is sharp and non-random.** 130 of 155 draftable players have it (re-derived 08-18 on the 5d playoff-free stores; the tail restoration widened coverage), and of the 25 missing, only 8 are rookies — the rest are injury-returns.
Of the 26 without, only 8 are rookies — **the rest are veterans who missed 2025**
(Nabers ADP 32, Garrett Wilson 45, Daniels 59, Evans 62). Any wiring that fills
a gap with a positional mean hands the steadiest reading to the injury-return
group. **Absent must stay absent.**

## 3b. ROUTES RUN — the second per-player feed, and what it is NOT

`draft/backtest/fetch_routes.py`, `routes_2021..2025.json`, weekly, gated.

**2025 was missing for a reason that was never true, and finding out why turned
up a bigger one** — `draft/audit/routes_position_source_2026-08-17.md`. The
header said nflverse served no 2025 data; the 2025 participation file is served
(HTTP 200, 49MB). What 404s is `import_weekly_data`, used here *only to look up
positions* — **a gap of ours filed as a gap of theirs**, unexamined because the
explanation was already written down. And that source has a row only for players
who **recorded a statistic**: of the 1,708 players actually on the field in 2024
it could classify 611 and left **1,097 unknown**, dropping **56 route-runners a
season** — precisely the blocking TE / zero-target decoy a routes metric exists
to see. Rebuilt on seasonal rosters: **0 unclassified in every season**, +35-38
players each, and 2025 exists. Kupp's control held to four decimals.

**There is NO routes feed in nflverse.** `routes/routes_YYYY.csv` 404s and
`ftn_charting` is play-level with no player ids. True routes run is a PFF /
Fantasy Points Data product we do not have. So this is a PROXY from
`pbp_participation` — every skill player on the field for a pass play — and an
**UPPER BOUND**, because a tight end who stayed in to block is counted. A test
pins that caveat so nothing downstream drifts into treating it as a measurement.

**Validated against known reality, not just shape:** Cooper Kupp 2021 reproduces
at 775 routes / 234 targets / **TPRR 0.302** — his triple-crown season and the
figure reported for it. Kelce 0.23, Hill 0.282, Diggs 0.266; median TPRR
**0.188** in both 2021 and 2024.

**Two things the build forced, both measured rather than assumed:** the
play-by-play join is REQUIRED (participation has no play type, and the best
participation-only proxy inflates the route DENOMINATOR by 12%), and position
must come from the roster because the participation schema gained position
columns only in 2023 — branching on that would have run two code paths over two
populations and called the result one dataset.

~~**2025 is refused**: no weekly data, so no position map.~~ **That was wrong and
2025 is now built** — the participation file is served (HTTP 200, 49MB); only the
POSITION lookup 404'd. See the note in the header above and
`draft/audit/routes_position_source_2026-08-17.md`.

Note what this paragraph did while it was wrong: it said *"position must come from
the roster"* — which is what the code does **now**, and was not what it did then.
The prose described the right design and the code used a different one, for long
enough that the prose was quoted as evidence the design was sound.

Routes run matters because it is the DENOMINATOR for target-per-route-run: 60
targets on 300 routes is a different player from 60 on 600, and target share
alone cannot separate them. Nothing consumes it yet.

## 3c. ~~🔴 THE BOARD `main` PUBLISHES IS FROZEN AT 08-15~~ — ✅ **THE FREEZE IS OVER. THE CLASS BEHIND IT IS NOT.**

> **⬆️ CORRECTION IN PLACE, 2026-08-18 05:38+ (relay), because this is the file Cory
> is told to read FIRST and its headline had stopped being true.**
>
> **THE BOARD PUBLISHED TWICE TONIGHT** — `62dd497b` at 03:49:25Z and `9322b022` at
> **05:38:11Z**, the live one, 696 players. The 08-15 freeze this section describes is
> finished, and everything below is history rather than status.
>
> **BUT THE SECTION'S DIAGNOSIS IS EXACTLY RIGHT AND STILL LIVE.** It names the blocker
> as six artifact-parity tests *"(the two `test_variance_inputs` …)"* — and **those two
> are red on `main` right now**, tonight, after the rebuild:
>
> ```
> FAILED test_variance_inputs.py::test_artifact_coverage_matches_board
>        assert (105 + 51) == 158   # artifact partitions 156 RBs; the board has 158
> FAILED test_variance_inputs.py::test_committed_artifact_matches_regeneration
> ```
>
> **The failure MOVED DIRECTION rather than going away.** Before tonight the board was
> older than its calibration table; now `variance_inputs_2026.json` is older than the
> board. **Tonight the repo held staleness in both directions at once, and fixing one
> exposed the other** — which is `DEFECT-REGISTER` row 34's claim, demonstrated.
>
> **AND THE FIX THIS SECTION ALREADY PRESCRIBES IS THE RIGHT ONE, ASSIGNED BY CORY ON
> 08-17, AND STILL NOT DONE:** *"register them in `artifact_registry.json` … and
> regenerate inside `draft-data.yml` between the build and the gate, which ends the
> class."* The relay reached the same conclusion independently tonight without knowing
> this paragraph existed — which is itself the session's headline defect: **correct
> measurements that never get connected.** `draft/tools/stale_blockers.py` now looks for
> that shape automatically.
>
> **Neither `variance_inputs_2026.json` NOR `public/draft_data.json` is registered**, so
> `check_artifact_freshness.py` can see neither. Two artifacts that belong in the
> registry and are absent from it is a pattern, not two oversights.


`draft/audit/board_publish_stall_2026-08-17.md`. Found 08-17 by checking whether
the nightly pipeline was healthy, not by anything prompting it.

**Every scheduled rebuild since 08-15T17:49Z has refused to publish** — 08-16
twice, 08-17 this morning. The board on `main` is built **2026-08-15T17:52:22Z,
677 players**. The gate is behaving correctly (build succeeds, gate refuses,
previous board stays live) and the workflow files and comments on issue #8 every
night. **The failure was that nobody read it for two days.**

**~~The repair is a MERGE~~ — the merge is DONE (`be528c64`, 08-17) and the
blocker MOVED.** Both original refusals are gone. The refire got further than any
run since the 15th — **board builds clean, 693 players, health 100%, structural
properties hold** — and then refused on **six artifact-parity tests** (the two
`test_variance_inputs`, `test_constant_multiple_sweep`,
`test_empirical_draft_value`, `test_measured_ceiling`,
`test_qb_scoring_arbitrage`). They pass locally because locally the board IS the
committed one; only a real rebuild surfaces them.

**This is the same problem as the standing "10 of 11 registered artifacts are
stale" item — not tidiness, the publication blocker.** Assigned to **A** by Cory
on 08-17. Two paths in `board_publish_stall_2026-08-17.md`: regenerate the six by
hand (recurs nightly), or register them in `artifact_registry.json` — which
already carries a `regenerate_command` per entry — and regenerate inside
`draft-data.yml` between the build and the gate, which ends the class.

**Four of the six read the BOARD rather than a committed artifact, so confirm
staleness before regenerating anything.** Unlikely to be a real defect; unlikely
is not checked.

**The merge is VERIFIED, not assumed — and it is not clean.** Dry-run in an
isolated worktree: **7 conflicts, all generated artifacts**, resolved by taking
the branch's side; the exact gate command then passes on the merged tree
(**3336 passed, 0 failed**). Recipe in the audit.

**The dry run found a THIRD defect neither branch has alone**, which is why it
was worth doing. Resolving toward `main`'s lab artifacts — newer, from its
08-17T04:18Z automated run — produced: `flat_l2.0`, CI **[-99.5, -29.33]**,
labelled **"parked: CI includes $0"**. The interval does not include zero. Both
artifacts carry identical numbers; only the label differs. **`main`'s file is
newer but was written by the OLDER labeller** — "prefer the newer file" is the
wrong rule for an output, where the question is which *code* produced it. And
`test_frontier_verdicts.py` is new here, so `main` cannot catch it: its nightly
lab report keeps writing mislabelled verdicts until the merge lands. Same shape
as everything else this week, pointed the other way — a decisive measurement
presented as no conclusion.

**What the freeze costs, measured.** Inside the top 200, only 2 of 201 players
moved 10+ ADP spots in the first day — but both fell off a cliff, which is the
dangerous direction: **John Metchie 120.6 → 364.2** and **Miami DEF 187.8 →
338.2**. A stale board does not merely lag; it offers those two at a price the
market has withdrawn. It compounds daily until 08-22.

**Guard added** (`test_published_board_is_not_stale.py`), and its limit is
stated rather than oversold: at a 3-day threshold it would have gone red on
**08-19**, not on 08-17. Every session runs pytest and none reads the issue
tracker, so this is a backstop that guarantees discovery from inside the normal
workflow — not a replacement for the alerting, which worked. It is
`repo_parity`-marked so it can never block a rebuild, which would guarantee the
thing it warns about.

## 4. FOR CORY, BEFORE AND ON DRAFT DAY

### ⚠️ ONE THING ON THE SCREEN NOT TO TRUST ACROSS POSITIONS (new 08-18, register 5e)

**The dollar figure — *"which of these two makes me more money?"* — is not
comparable between a quarterback and anybody else. Use it WITHIN a position.**

Why, in one line: that number prices RAW projected points, and everything else
in the tool is denominated in points **over replacement**. In a 10-team, 1-QB
league the tenth-best quarterback projects **341.7** and the tenth-best tight end
projects 136.4, so pricing raw points hands every QB a ~342-point head start
nobody else gets. `p.position` never appears in the formula.

What that looks like on Saturday, measured on today's board:

| the tray would say | the board's own rank | the truth |
|---|---|---|
| **"Jaxson Dart +$23"** over Saquon Barkley | Dart **86**, Barkley **15** | Dart projects **13.2 points BELOW** a QB you could have for free |
| **"Jordan Love +$36"** over Brock Bowers | Love **93**, Bowers **7** | Love is **19.2 below** that same line |
| **"Bo Nix +$10"** over Bijan Robinson | Nix **75**, Bijan **2** | Nix is **6.0 below** it |

**22 of the top 25 by that dollar figure are quarterbacks. On the board's own
ranking, one is.**

### 🥅 WHEN TO TAKE THE KICKER AND THE DEFENCE — the board cannot tell you, so here it is

**The board ranks every kicker and every defence at 620+**, so it will never
recommend one, and you have to fill both. That is not a bug: they are demoted on
purpose (register 2b, and the demotion really is in the published order —
verified, Spearman 1.0000 between published rank and vorp rank for every skill
player, and K/DEF the sole exception). But it does leave you without a timing
signal for two of your twelve picks, so here is the number.

**KICKER — take one with your LAST pick. Waiting is as close to free as it gets.**

| | |
|---|---|
| spread across the top 12 kickers | **10.0 points for the season — 0.59 per week** |
| best still available at your pick 133+ | Cam Little, proj **104.0** (ADP 160) |
| cost versus the best kicker on the board | **3.0 points. 0.18 per week.** |

Aubrey (107.0, ADP 116) is the top kicker and he is worth *three points over a
season* more than one you can have at 160. Spending a pick before 148 on a
kicker is spending it on nothing.

**DEFENCE — different answer, and the honest version has a caveat attached.**

| | |
|---|---|
| spread across the top 12 defences | **36.0 points — 2.12 per week** |
| the outlier | **LA Rams 132.0**, fourteen clear of Houston at 118 |
| best still available at 133+ | New England, proj **112.0** (ADP 161) |
| cost of waiting from the Rams | **20.0 points ≈ 1.2 per week** |

**⚠️ AND THE CAVEAT IS NOT DECORATION.** Register 2e: **K and DEF have ZERO
calibration cells** — every one carries a `gaussian_z` ceiling because the
component stores never captured them. So that 20-point gap is a difference
between two projections we have **never measured the error of**. It is real in
the projection and unbounded in reality.

**So: kicker last, always. Defence — the Rams are a genuine outlier and if one
of your late picks is otherwise a coin flip, that is where the 20 points is. Do
not spend a pick you want for a skill player on it, because we cannot tell you
how much of the 20 is real.**

### ⚠️ AND FIFTEEN CEILINGS IN YOUR RANGE ARE COHORT AVERAGES, NOT CLAIMS ABOUT THAT PLAYER (register 4v)

**If you are about to take somebody because the ceiling is big, check this list
first.** These fifteen carry `proj_ceiling_source: measured-2023-25-p90` — a real
measurement, but of their **rank band**, not of them:

**Malik Nabers (WR, ADP 28)** · **Garrett Wilson (WR, 41)** · **Jayden Daniels
(QB, 57)** · Jadarian Price (RB, 58) · Carnell Tate (WR, 67) · Jordyn Tyson (WR,
83) · Jonathon Brooks (RB, 90) · Makai Lemon (WR, 96) · **Jayden Reed (WR, 110)**
· Kyler Murray (QB, 123) · Theo Wease (WR, 124) · De'Zhaun Stribling (WR, 136) ·
KC Concepcion (WR, 138) · Malik Willis (QB, 153) · Jonah Coleman (RB, 154)

The tell is that the numbers repeat: Nabers, Garrett Wilson and Jayden Reed all
carry a ceiling/mean ratio of **1.4388**; Kyler Murray and Malik Willis both
**1.6081**. Every other skill player in your range carries a ratio measured from
his own week-to-week volatility, and those spread by 5–15% inside the same band.

**It also moves the money number**, because the largest coefficient in the dollar
model (0.22) multiplies `ceiling − mean` — so for these fifteen, the dominant
term of the E[$] figure above is the cohort constant. **4v and the dollar problem
are the same screen.**

**Nothing is wrong with their projections, and nothing is broken here** — I
traced why each one lacks a per-player number and for five of them **the model
is deliberately refusing to guess**, which is a strength.

The per-player volatility term keys on **2025** weeks. Five of the fifteen —
**Nabers, Garrett Wilson, Jayden Daniels, Jayden Reed, Kyler Murray** — missed
2025 and *do* have a 2024 reading, and A ruled on 08-18 that a 2024 number on a
2026 board is outside the measured support (the persistence that licenses it was
measured on one-year transitions only). So they keep the cohort constant rather
than being handed a reading from the last year they happened to play. The other
ten have no reading in any season. **That call is right and I am not asking to
revisit it.**

**The one thing worth knowing when you look at those five:** the constant is the
band's *median*, so it is not a neutral placeholder. Against each man's own last
reading it lands at Nabers **0.82**, Garrett Wilson **0.87**, Kyler Murray
**0.84**, Daniels **1.07**, Jayden Reed **1.34**. In plain terms: **four of the
five are shown a wider ceiling than their own last season supports — Nabers by
about 23% — and Jayden Reed a roughly 25% narrower one.** Small samples (7–14
players per cell), so read those as directions, not corrections.

B's default is to grey or asterisk these on screen; the mark should say **"no
2025 weeks — cohort average"**, not "unmeasured".

> ✅ **SHIPPED 2026-08-18 — YOU NO LONGER HAVE TO CARRY THIS ONE.** The range bar
> on any such player now renders a **`~`** mark, and both its tooltip and its
> screen-reader label read *"cohort average, not this player"*. It fires on
> **34 of the 173 skill players in your ADP 25-220 range (19.7%)** — the share
> is lower than the 32% this brief was written against, because the per-player
> volatility work landed on 08-18 and fixed most of them.
>
> **It is a provenance mark, not a warning.** For several of these the model is
> refusing to guess from data it does not hold, which is the behaviour you want.
> It tells you where the number came from, not that the number is wrong. And it
> is deliberately conservative — an unrecognised or missing stamp does **not**
> get marked, so the mark stays rare enough to mean something.
>
> Register 4v, `draft/tests/cohort_ceiling_is_marked.test.js` (16 checks).

**Two other places the same number leaks, so you know them when you see them:**

- **The paths panel's "◆ the &lt;plan&gt; branch" badge.** It marks the path
  holding the highest-dollar player, so it lands on the **QB row at seven of
  your first eight picks** — including at 88 and 108, where the quarterback in
  question (Purdy, Love) is below replacement. **Read the badge as "the most
  raw points on offer", not as "the plan says take this".**
- **🆕 THE BOARD RANKS RUNNING BACKS ~50 SLOTS BELOW THE MARKET, AND THE KEEPER
  LOCK WILL CLOSE PART OF THAT BY ITSELF.** Measured 08-18 across the top 150 by
  ADP: mean signed move **RB +49.6 · WR +8.5 · QB +7.2 · TE −3.6** (positive =
  the board rates him worse than the room does). Permutation test, 20,000
  shuffles: **RB p = 0.0024**; WR, QB and TE are all null. The same test finding
  RB significant is what makes those three nulls readable rather than a dead
  probe.

  **The part that matters on the night:** at the 08-21 lock the RB replacement
  level falls **179.3 → 146.1**, against WR −15.1, TE −5.8, QB −4.2. Since
  `vorp = proj_mean − replacement`, a lower replacement **raises every RB** — so
  the lock moves RBs up the board and closes part of this gap with nothing
  shipped. **Do not hand-correct the RB gap before Saturday; the lock will move
  it again on top of you.** Registers 2d and 5f.

- **The strategy banner's silence.** It scores each doctrine by the best-dollar
  player it allows; a QB tops that list at every pick, so the only doctrines
  that can ever differ are the ones forbidding QB. **If you enrol in Balanced,
  the banner will stay quiet all night, and that is structural, not a bug you
  can wait out** (register 4x).

  > ✅ **MEASURED 2026-08-18, and it is stronger than "will probably stay
  > quiet".** Run through the banner's own scoring function at your twelve real
  > picks: **the leader gap is EXACTLY 0.000 at all twelve**, and from pick 88
  > onward all nine doctrines return a single identical score. At every pick at
  > least six of the nine allow the same top player, so they score the same and
  > **there is no leader to change.**
  >
  > **It cannot be fixed by tuning.** The banner switches when a challenger
  > leads by *more than* a threshold; the gap is zero, so that is false for
  > every threshold — including zero, because the test is strict. Register 4x
  > asked for the `$4` band to be re-derived; **no value of it changes
  > anything**, and moving it would change how *decided* vs *even money* renders
  > on every pick you see, for nothing. Closed on that basis.
  > `draft/audit/doctrine_banner_cannot_fire_2026-08-18.md`.

**WHAT IS NOT AFFECTED, AND IT IS THE bigger half: THE RECOMMENDATIONS.** The
ranked board, the top-of-board pick, the tiers and the VORP ordering never touch
this number. This is a comparison surface, not the engine.

**Ruling pending with A before 08-22** — the proposal is to make the tray refuse
a QB-vs-other comparison the same way it already refuses K/DEF, and say why on
screen. **If it does not land, this paragraph is the fix.**

**And no, the number is not being quietly left broken because it was easier.**
The obvious repair — price points over replacement instead of raw points — was
built and measured, and it is **worse than the defect on the pairs you would
actually weigh against each other**: against the board's own VORP ordering it
improves QB pairs in aggregate (51.6% → 42.0% disagreement) but degrades pairs
within 20 ADP of each other (40.1% → **41.8%**) and pairs with no quarterback at
all (22.8% → **26.1%**). It would repair the comparison nobody makes and damage
the RB-vs-WR one you will make all night, because the boom half of the formula
is replacement-invariant and a level subtraction cannot touch it. **Refusing the
comparison is the honest move; re-pricing it properly is a post-season job.**
`draft/audit/dollar_replacement_baseline_2026-08-18.md`.


~~**One decision is waiting on him**~~ **— NONE IS, as of 2026-08-18. Cory ruled this on 08-17 (*"leave it"*); `CORY-ASKS.md` ③ is ✅ CLOSED.** The measurement below stands and is worth keeping — it is the reason the ruling was right — but it is a RECORD now, not a pending call: `draft/audit/adp_sd_ratchet_fired_2026-08-17.md`.
The shipped ADP-sd rule is 1.39x FFC's published dispersion in the 50-100 band.
**Our constant did not drift** (reproduces to 0.1%); the market tightened. Blast
radius inside his 160 picks is **one player**. Both easy fixes were refused on
the file's own doctrine. **Recommendation: leave it, revisit post-season.**

**One action on draft day** — re-take the pre-draft freeze AFTER the final board
build. It is NOT the draft board (the war room boots from live `draft_data.json`),
it is the record 2027 grades against — and it is the only irreversible item in
the plan, because **the board is overwritten nightly and the freeze is not.**

**⚠️ CORRECTED 2026-08-18 (register E12). THIS STEP'S OLD JUSTIFICATION WAS
FALSE, AND A FALSE JUSTIFICATION IS WORSE THAN NONE ON A STEP NOBODY CAN UNDO.**
This paragraph used to read *"`pre_draft_freeze_2026.json` is from 08-14 and is
missing **fourteen** declared fields"*. It is not, and it is not. The freeze was
re-taken in `60f3487`: `source_artifact_built_at` is **2026-08-16T14:10:12Z**,
`_sha256_of_payload` is `98f58026…`, **0 of 44 declared fields are missing**, and
`test_freeze_not_stale.py` is **3/3 green including its `repo_parity` node**
(re-verified 08-18).

**The action does not change; only the reason does.** Re-take it because the
board rebuilds nightly and you want the record to match the board Cory actually
drafted from — not because the current freeze is broken. **A `rm` whose stated
reason the reader can falsify in one command is a step someone skips**, and this
one has no second chance.

**Rehearse it first. This deletes nothing**, and was impossible before 08-17:
```
PRE_DRAFT_FREEZE_PATH=/tmp/rehearsal.json python3 draft/freeze_pre_draft.py
PRE_DRAFT_FREEZE_PATH=/tmp/rehearsal.json python3 draft/freeze_pre_draft.py --verify
```
Expect a player count and `freeze intact`. **Rehearsed on 08-17 against that
day's board: 682 players × 12 picks, all 44 declared fields present, 0 missing**
— which is what a healthy take looks like. *(This line used to say a fresh take
"does close the fourteen-field gap"; there is no gap to close — see the
correction above.)* **If the rehearsal fails, delete nothing**: the committed
freeze is a complete, verified record and is not worth trading for a failed run.

Then, and only then:
```
rm draft/data/pre_draft_freeze_2026.json    # by hand; the module refuses to overwrite
python3 draft/freeze_pre_draft.py
python3 draft/freeze_pre_draft.py --verify   # must print "freeze intact"
git commit                                   # say why
```

**THE WAR ROOM IS REHEARSED AND PASSES — 19/19 against today's board.**
`rehearsal-mock3.js` drives the real screen in a real browser and is the closest
thing to a draft-night dress rehearsal: the clock advancing in manual mode,
"➕ Me" from the board landing on the roster, the legality strip being present
rather than present-but-invisible, the exit warning with no DEF and no K, the
deviation badge staying silent inside the noise band and speaking outside it, no
page errors, and the only blocked host being the fonts CDN.

**It was recorded here as "only Cory can run this" for about an hour, and that
was wrong.** The war room sits behind auth (`/admin/warroom` returns 302
unauthenticated) and this sandbox holds no credentials — but the rehearsal never
needed real ones. `rehearsal-keepers.js` had the pattern all along: temp
`DATA_DIR`, seed the store, set a known password, serve in-process. That is now
`draft/tests/rehearsal-serve.js`, so the check runs anywhere Chromium does — a
claim that was **not actually true when it was first written here** and is now:
see the CI note below.

```
node draft/tests/rehearsal-serve.js &
WR_USER=cory WR_PASS=pw node draft/tests/rehearsal-mock3.js
```

Nothing real is touched — `DATA_DIR` is a fresh mkdtemp, so the seeded owner
lives in a throwaway directory and the live store is never opened. The BOARD is
the real `public/draft_data.json`, which is the point.

The other two rehearsals also pass after all of 08-17's changes:
`rehearsal-keepers.js` 6/6 (a fixture board is refused rather than silently
rendered) and `rehearsal-config-screen.js` 13/13 (the CRITICAL scoring highlight
discriminates rather than starring everything). **All three screens are now
verified against today's board.**

**They also now run unattended — `.github/workflows/rehearsals.yml`, daily at
12:30 UTC, after the nightly board rebuild.** Deliberately NOT a publish gate:
`draft-data.yml` decides whether a board is fit to publish, this asks the
different question of whether the screens still work against it, and putting a
browser job between Cory and his board days before a draft is the worse trade.

**Putting them in CI immediately found a defect that had been invisible for
months.** All eight browser scripts launched with a hardcoded
`executablePath: '/opt/pw-browsers/chromium'` — a symlink the research sandbox
ships and nothing else has. `npx playwright install` puts the browser in
`~/.cache/ms-playwright`, so on a runner every rehearsal would have thrown on
`launch()` right after a green install step. That is the same shape as the
08-17 dispersion defect: a check that could not fail, because it was only ever
asked the question it already knew the answer to. Fixed by
`draft/tests/rehearsal-browser.js` (use the sandbox symlink when it is really
there, otherwise let Playwright resolve what it installed) and pinned by
`rehearsal_browser_portability.test.js`, 10/10, which exercises BOTH branches on
one machine via an injected existence check and sweeps the directory for the
hardcoded path behind a known-positive control.

**HONEST LIMIT: the CI half of that fix is reasoned and tested, not yet
observed.** Two things block observing it from here, and neither is worth
routing around. `npx playwright install` cannot run in this sandbox —
`cdn.playwright.dev` is refused by the egress proxy (403, not on the
allowlist), and a policy denial is to be reported rather than worked around.
And `rehearsals.yml` cannot be `workflow_dispatch`ed from a feature branch:
GitHub only registers dispatchable workflows that exist on the default branch,
confirmed by the workflow list returning 52 entries, all resolving to
`/blob/main/`, with `rehearsals.yml` absent. So the sandbox branch is proven end
to end (19/19, 13/13, 6/6 after the refactor) and the runner branch is proven
only by construction until the first scheduled run after merge. If it is wrong,
it fails loudly — Playwright refuses with "Executable doesn't exist" rather than
skipping — so the failure mode is a red run, never a silent green.

**His rookie-WR question is answered** —
`draft/audit/rookie_wr_upside_for_draft_day_2026-08-17.md`. Concepcion (NFL rd1
pk24) and Allen (NFL rd5 pk176) are 152 draft picks apart. Tail rate (150+ pt
season) by capital: rd1 **53.3%**, rd2 25.0%, rd3 0.0%, rd4-7 **1.8%**.
**Caveat that must travel with that 53.3%:** n=15 for rd1 and its MEAN interval
SPANS ZERO, so the honest claim is *"not measurably worse than the wire"*, NOT
*"beats it"* — the tail RATE is the interesting number, and it rests on 15
players in an artifact marked EXPLORATORY. His
instinct on Concepcion is supported; Allen is a different bet entirely.

**"Upside late" lost a FIFTH time, and the fifth is on a FIXED board** —
the CI run that verified the harness graded every weight profile and Upside-Late
lost BOTH seasons (pooled -79.21, CI [-137.9, -20.5]; -79.58 and -78.84, not one
bad draft). Every earlier refutation ran against `proj_ceiling = 1.35 x mean`,
where the arm could not express anything but "double-count the projection".
N=2 graded seasons, so it is another consistent line, not a precise coefficient.
(`draft/audit/harness_fix_verified_in_ci_2026-08-17.md`)

**The fourth** — and this run corrected a bias that ran in
its favour first (endgame ceiling 0.0 best, **+64.33** CI [+35.67, +94.17]; the
keeper-variance fix moved the headline $1.17). That refutes a BLANKET tilt, not
a targeted swing on an identified player — do not let the two be conflated.

## 4b. THE GRADING PATH — one fix, one revert, and the lesson is the revert

`draft/audit/pbp_rebuild_2pt_gap_2026-08-17.md`.

**Why anyone cares:** every strategy finding rests on **N=2 graded seasons**,
because 2025 cannot be graded — the play-by-play recovery path is REFUSED for
failing its own cross-validation against 2024. Unlocking it would take N=2 to
N=3, the threshold the report's own selection rule is written against.

**FIXED:** `weekly_from_pbp` emitted no two-point-conversion field while our
scoring prices `pass_2pt`/`rec_2pt`/`rush_2pt` at 2.0 each — seven of the eight
worst 2024 disagreements were exactly `2 x (that player's 2pt count)`. Fixing it
cut `mean_abs_diff` 0.489 → 0.149.

**REVERTED, AND THIS IS THE PART TO REMEMBER:** the blocker is Jameson Williams,
off by exactly 11.0, whose two lateral receptions total exactly the 50 missing
yards and one missing TD. Crediting the lateral receiver fixed him **to the
point** — and broke Jahmyr Gibbs (+8.0) and Josh Allen (+6.7) the other way.
Gibbs' structurally identical lateral touchdown shows `receptions=0,
receiving_yards=0.0, targets=0` in the official feed: the library credits the
lateral player **nothing**. **Williams' exact arithmetic match was a coincidence
over-read as a rule.** A hypothesis that fits one case perfectly and is refuted
by the second is the shape of most of what went wrong this week.

**And the gate caught a self-inflicted break during the revert** (the edit
deleted the passing block; `cross_validate` reported `worst_diff` 444.04
immediately). The strictness that refuses 2025 is the same strictness that made
a bad edit impossible to miss — which is why **the 0.5 tolerance must not be
loosened.**

**Still open:** the gate still refuses 2024 at 11.0. Laterals need the library's
real aggregation semantics, not another guess.

## 5. THE GATES THAT NOW EXIST (and what they do NOT cover)

- `constant_multiple_sweep.py` — finds fields that are a rescaled copy of
  another, WITHIN (position, band) cells. Carries a known-positive control and
  **refuses to print a report if the control does not fire**.
- `test_freeze_not_stale.py` — every field the freeze DECLARES must appear in
  the artifact. Self-maintaining: reads `PLAYER_FIELDS`, not a copy.
- `weight_provenance.test.js` — re-aimed; now fails if a synthetic dispersion
  constant is REINTRODUCED to `build_bundle.py`.
- `harness_divergence.py` — the AST check that reads build_bundle's real field
  list rather than a mirrored copy. **It was itself wrong for a few hours**: the
  dispersion fields moved into a second pass, invisible to its parse, so it
  reported `proj_ceiling` as corrupting a backtest number the morning that
  stopped being true. Fixed by declaring `DISPERSION_FIELDS` ONCE in
  build_bundle and having the tool read it — one declaration, two readers, and a
  refusal if it disappears.

**Honest limit:** of the real defects found on 08-17, only some were caught by
machinery, and one of those was machinery written the same day. The gates cover
the shapes we know about. The rest are still found by reading.

**AND ONE CLASS RESISTED GATING — recorded because the next person will try.**
Six of the day's findings were stale CITATIONS: a comment asserting another
module's constant (`build_bundle.py writes 1.35 x proj_mean`,
`HARNESS_CEILING_RATIO = 1.35; // build_bundle.py:132, verbatim`). I built a
sweep for it and **deleted it**, because it failed its own known-positive
control and the reason is structural, not tuning:

- the constant usually lives in CODE and the citation in the trailing COMMENT,
  so a comment-body reader cannot see the number at all; and
- fixing that still fails, because the test "is the cited number still present
  in the cited file?" is defeated by **this repo's own good habit** — we keep
  the history, so `build_bundle.py` still contains the string `1.35` in the
  comments explaining what it used to do.

Textual presence cannot distinguish "the constant is still there" from "the
constant's obituary is still there". A real check would have to parse the cited
file and compare live VALUES, which is `harness_divergence.py`'s AST approach —
that is the direction, if someone wants it. Until then this class is caught by
reading, and that is stated rather than papered over with a tool that reports
zero and proves nothing.

## 6. THE SWEEP IS CLOSED

*"What else is calculated off a constant when it shouldn't be"* — answered on all
four surfaces: production board (dispersion family only, gated), harness
(fixed), study code (one real bug), **live draft JS + `src/`: clean** (every hit
is `|| 0` or a sort comparator; the one non-zero constant, `games_expected || 15`,
never fires — the field is on all 682 rows).

Four things checked and CLEARED are recorded in `TODO.md` so nobody
re-investigates them: the `CFG.WEEKLY_SD` metadata fields, the `weekly_sd or 6.0`
pool fallbacks, `source_weight_prior`'s sign flip, and Pearsall's zero projection
(he is on IR).

**A SECOND SWEEP, FOR A SECOND CLASS** —
`draft/audit/coverage_guard_sweep_2026-08-17.md`. The constant sweep answers
*"what is computed off a constant"*. The routes defect was not that: it was **a
source whose coverage is silently partial, with a loss counter read as
inherent**. Nothing swept for that, so every stored artifact was scanned for its
own loss counters and each non-zero one chased to a reason.

Two fixes, one confirmation, one open item. Snap counts' `MIN_JOIN_RATE` was
**0.70 against observed rates of 0.971-0.992** — twenty-seven points of slack in
which the crosswalk could lose a quarter of the league and still write a green
store, and **the test agreed with it**, opening with *"a floor set low enough to
never trigger is decoration"* and then asserting `>= 0.70`. Raised to 0.95 and
pinned against the stored rates. The model scoreboard's per-model exclusion
counts (115 vs 211) look like the same defect and are **not** — a
shared-population block already handles it, recorded so it is not re-opened. Left
open: **own_v6, the live model, has 22.7% of its forecasts excluded from its own
accuracy score**; prereg written (`SURVIVORSHIP-BOUND-PREREG.md`), runs after the
draft.

**The class is real and was worth sweeping for; it was not endemic.**

## 7. WHAT IS STILL OPEN, IN ORDER

1. **Wire realized weekly volatility** — top post-draft item, above snap share
   (a weaker proxy for the same thing). **PREREGISTERED:
   `VOLATILITY-WIRING-PREREG.md`.** Three decisions are fixed there so they
   cannot be chosen after seeing results: `f` must preserve the cell mean (or
   the change is a level shift in disguise); a player with NO volatility keeps
   his CELL constant — never the positional mean, which would hand the steadiest
   reading to the injury-return group; and it needs its own
   `proj_ceiling_source` value, because one field name holding two
   constructions is the error the `_source` stamps exist to prevent.
2. ~~**Re-derive the composite `ceiling` weight**~~ — **DONE 2026-08-17, and it
   came back against us.** See §7b below; what remains is bracketing and
   replication, not the derivation.
3. **The `need` study** — preregistered (`NEED-WEIGHT-PREREG.md`). Cheaper than
   it looks: `live_context.js:126` already accepts a weights override, so it is a
   `--need-weight` axis on `archetype_rooms.js`, not new machinery.
4. **Routes-run** — the next per-player opportunity feed after snap share.
5. Studies resting on the `risk` term (PARTIAL on backtest boards).

**Nothing in 1-5 ships before 08-22.** A weight measured once, late, is a worse
instrument than a known one.

---

## 7b. THE CEILING WEIGHT IS SET WRONG, AND IT STAYS WRONG THROUGH THE DRAFT

Prereg `CEILING-REDERIVATION-PREREG.md`, result
`draft/backtest/EXP-CEILING-REDERIVATION.md`.

**~~The tool ships `ceiling = 0`.~~ THE TOOL SHIPS `ceiling = 0.45` — corrected 2026-08-18. That zero came from a −4.8 [−26, +17]
measurement taken on a board where `proj_ceiling` was `proj_mean × a constant`,
which made the ceiling term rank-identical to the value term (Spearman
1.0000).** Raising the ceiling slider was arithmetically the same as raising the
value slider. **It was never a measured setting.** **And that is exactly why Cory ruled it upward after the dispersion fix: the three preregistered runs that beat zero were run on a board where `proj_ceiling` finally carried per-player information. The paragraph's ARGUMENT is intact — the zero was an artefact — but its opening sentence described a state that ended on 08-17.**

Re-run on the first real-ceiling board (505 distinct ceiling/mean ratios where
there was 1), 400 paired rooms × 3 fixed seeds, against a `core` arm that IS the
shipped configuration:

| | w=0.65 | w=1.0 | w=1.5 |
|---|---|---|---|
| pre-fix (degenerate) | +0.1 · 0/3 separable | +10.3 · 0/3 | +28.9 · 1/3 |
| **post-fix (real ceilings)** | **+35.5 · 3/3 separable** | +21.1 · 1/3 | +19.9 · 1/3 |

**w=0.65 clears the preregistered bar at 3/3 and 3/3.** And the shape inverted:
on the broken board the effect ROSE with the weight, on the real one it FALLS —
which is what a second copy of the value term should look like, and is the
clearest single demonstration that the old grid was measuring the defect.

**A second preregistered run bracketed it** (`CEILING-BRACKET-PREREG.md` →
`EXP-CEILING-BRACKET-RESULT.md`), over w ∈ {0.15, 0.30, 0.45, 0.65}, with w=0.65
carried across as a control that had to reproduce its earlier edges exactly or
kill the run. **It reproduced, and all twelve seed × weight cells came back
positive with a CI excluding zero.** 0.30/0.45/0.65 are indistinguishable (means
within **$0.6**); 0.15 is lower (+$24.0) but still separable in 3/3. So the
answer is **zero versus non-zero** — it does not depend on picking a value, and
naming "the optimum" off a $0.6 gap is forbidden by that prereg.

**A third run replicated it on independent seeds** (`CEILING-FRESH-SEED-PREREG.md`
→ `EXP-CEILING-FRESHSEED-RESULT.md`). The first two shared a seed set, making
them one experiment measured twice; this one uses the next rungs of the same
prime-offset ladder, declared before the run, with the script refusing outright
on any overlap. At **w=0.45** — the positional middle of the plateau, chosen over
the higher-scoring 0.30 precisely so it could not be score-shopping — it returned
**+29.06 / +32.69 / +46.06, all separable. Mean +$35.9. The promotion bar is
cleared.**

Three runs · two independent seed sets · four weights · **one direction**, with
means of +$35.5 / +$35.7 / +$35.9.

**It still does not ship before 08-22, deliberately.** A cleared bar makes the
change *available* to Cory after the draft; it does not make it. That date was
fixed in all four preregs before any of them produced a number, and a result
landing the way we hoped is the worst possible reason to relax it. What
this changes today is the *account*, not the number: three places told Cory the
term was unmeasured, and all three now say it is measured, contradicted, and
held. **The Live-policy panel says so in his words on the screen.**

Order after the draft: ~~bracket~~ **done** → ~~replicate on fresh seeds~~
**done, cleared** → **Cory's shipping call** — the only step left, and it is his.
Frame it as *"the model is ignoring upside entirely; three preregistered runs
across two independent seed sets say it should not, and say the exact amount
hardly matters anywhere between 0.30 and 0.65"*, never as *"set it to 0.30"* →
then the per-player question, which none of this touches and which is the one he
has actually been asking: `weekly_volatility.py`.

---

## 8. KEEPING THIS FILE HONEST — a process note, not a gate

`draft/tests/test_draft_week_brief_numbers.py` pins the NUMBERS in this file
against the artifacts they came from, so a figure here cannot silently drift.
**Coverage is not gated, and it decayed within hours of being written**: routes
run — a whole per-player feed, built, validated, weekly and registry-gated —
appeared ZERO times here until it was added late on 08-17. The numbers were
guarded and stayed true; what was missing was an entire subject.

**A keyword gate was tried and NOT shipped.** Matching registry keys against
this prose flags 7 of 8 captures as absent when only one truly was — `snap
counts` is covered here in plain English, not as `fetch_snap_counts`. A check
needing an ignore-list for seven of eight entries is theatre, and a noisy gate
manufactures confidence, which is worse than the gap.

**So the check is manual and takes a minute:** before trusting this file, run
`python3 -c "import sys; sys.path.insert(0,'draft'); import capture_registry as
CR; print(list(CR.CAPTURES))"` and confirm every capture added or fixed since
this was written has a home above. `CAPTURES` is the maintained list; this file
is the thing that falls behind it.

---

**Suites at hand-off:** Python publication gate (what CI runs) **3,283 passed,
10 deselected**; JS **309/309**. The deselected `repo_parity` set includes **one**
deliberate red flag — the ADP-sd ratchet — which is evidence awaiting a human,
not a broken build.

**⚠️ CORRECTED 2026-08-18 (register E12): this said TWO, counting "the stale
freeze". There is no stale freeze.** `test_freeze_not_stale.py` is 3/3 green
including its `repo_parity` node, the freeze carries `source_artifact_built_at`
2026-08-16T14:10:12Z and 0 of 44 declared fields missing. **A hand-off note that
counts a healthy artifact as a red flag teaches the next reader to discount real
ones.**

**Full suite on the relay branch, 2026-08-18: 4,277 passed, 6 skipped, 0 failed.**
