# CORY ASKS — every request Cory made, who owns it, and whether he got it

**Cory, 2026-08-17:** *"when I type things to you Im not necessarily expecting
you to do it but youre the project manager so you need to deligate effectively
but also make sure i get what I want."*

That is two jobs, and this file is the second one. `ROUTES.md` tracks what was
**assigned**. `DEFECT-REGISTER.md` tracks what is **broken**. Neither tracks
**what Cory asked for and whether it arrived** — so on 2026-08-17 an ask went a
full day with no owner, no row and no route (row A6 below), and nothing in the
repo would ever have noticed.

**The rule: an ask is not done when someone starts it. It is done when Cory has
the thing.** `DELEGATED` is a status, not a finish line.

**Status words:** `ASKED` = captured, not yet routed · `DELEGATED` = has an owner
and a deadline · `DELIVERED` = the work exists · `VERIFIED` = the relay confirmed
it does what Cory asked · `CORY` = waiting on Cory, nobody else can move it.

`draft/tests/test_cory_asks.py` fails on any row without an owner and a status.

---

## CORY RULED 2026-08-17 — executing

| # | ruling | status |
|---|---|---|
| ① | **Projection source — "RUN IT"** | ✅ **DONE.** `sleeper-hist-proj.yml` dispatched **from `main`** so the verdict commits this time (the 08-16 runs were dispatched off a worktree branch and the guard discarded the answer). Next: the three-way prereg, then Sleeper vs FP vs blend on 2025, matched population. |
| ② | **Ceiling weight — "lets see the blast radius"** | 🔄 **IN HAND, and the structure already changes the question — see below.** |
| ③ | **ADP-sd ratchet — "leave it"** | ✅ **CLOSED.** No change; revisit post-season. |
| ④ | **Session E — "already started"** | ✅ **LAUNCHED.** Lane, inbox, charter and Rule 3e all live. |
| ⑤ | **Model assignments — "do it"** | ✅ **RECORDED** in `OPERATING-MODEL.md` Rule 5b. A/D/E Opus; B/C Sonnet. |
| ⑥ | **War-room screenshots — "sent B already"** | ✅ B is unblocked. Register row 4b's blocker is cleared; 4c–4f (the truth defects) still stand. |

### ② THE CEILING BLAST RADIUS — what the code already settles

**The term is POSITION-NORMALISED.** `engine.js:1217-1220` divides each player's
`proj_ceiling − proj_mean` spread by the typical spread **at that player's own
position**, then rescales to the board. So "QBs all move" — the result my first
proxy produced — is exactly the artifact the engine was built to prevent, and my
proxy was wrong for the reason I flagged rather than by luck. The code's own note
records that dividing by median spread would have handed QBs a 2.35× boost.

**And the term is LATE-ONLY.** `CEILING_LATE_FROM: 0.6` (`engine.js:346`): the
ceiling contributes **zero until 60% of the draft**, then ramps, with a bench
gate that fires when every starting slot is full (measured near pick 70).

**So shipping a non-zero ceiling weight cannot re-rank Cory's early picks at
all.** It moves the late/throwaway rounds — the lottery-ticket picks — which is
far lower risk than "it changes every number." My earlier framing overstated it.

**STILL OWED:** the count of who moves and how far, through `recommend()`. A
direct call to `upsideBonus` returned zero for every player at every pick number,
but `_ceilingScales` is initialised inside `recommend()`, so that path proves
nothing — **no known-positive control, therefore not a finding.** Owner: relay.

## ✅ ANSWERED 2026-08-17 — SLEEPER vs FANTASYPROS vs BLEND

**Cory asked this four times over two days. Here is the measurement.**
Run `32051713260`, dispatched from `main`, matched population **376 players**,
Spearman within position (higher is better):

| arm | QB | RB | WR | TE |
|---|---|---|---|---|
| **SLEEPER** | **.7860** | **.7896** | .7385 | **.7964** |
| **FantasyPros** | .7531 | .7753 | .7409 | .7710 |
| BLEND-0.25 | .7709 | .7802 | .7444 | .7814 |
| BLEND-0.50 *(Cory's 50/50)* | .7812 | .7902 | .7439 | .7914 |
| BLEND-0.75 | .7899 | .7896 | **.7442** | .7937 |
| NAIVE *(control — must lose)* | .7018 | .7326 | .6961 | .7592 |

> **VERDICT: NO SEPARATION.** The best blend (w=0.75) beats both sources in only
> **2 of 4** positions; the prereg required 3. **The board keeps Sleeper.**

**What it means, stated plainly:**

1. **Sleeper alone beats FantasyPros at QB, RB and TE.** FP wins only WR, by
   .0024. **Using Sleeper was the right default — it was simply never a decision
   anyone made, which is what Cory was angry about, and rightly.**
2. **Blending helps but not enough.** BLEND-0.75 is the best WR arm on the board
   and edges both sources at QB and WR. Two positions, not three.
3. **The control passed cleanly** — NAIVE lost at every position by a wide
   margin, so the harness is sound and these numbers mean something.
4. **⚠️ THE BEST BLEND SITS AT THE EDGE OF THE GRID.** 0.75 is the top of
   {0.25, 0.50, 0.75}. **The optimum is not bracketed** — it plausibly sits at
   0.80–0.90, which was never tested. That is a live edge candidate with a cheap
   test, and the prereg's own edge-of-grid rule says so rather than letting us
   quietly call 0.75 "the answer."

**✅ SCORING PARITY VERIFIED (Cory asked: *"and we made sure fantasy pros
projections were for our league scoring before comparing?"*).** Both sources are
scored from STATLINES through `score_stat_line` against our house table — neither
provider's own points are used. But `_FP_STAT_MAP` covered only 9 of 32 priced
categories. Eighteen gaps were K/DEF and irrelevant to a QB/RB/WR/TE grade; five
were skill categories Sleeper carries (`pass_2pt`, `rush_2pt`, `rec_2pt`,
`fum_rec`, `fum_rec_td`) — a systematic tilt against FP inside a head-to-head that
had FP losing. **The map was extended to all 14 priced skill categories and the
run repeated: EVERY NUMBER IS IDENTICAL to four decimals.** FantasyPros does not
publish those fields at all, so there was nothing to drop. **The concern was real
in principle and zero in fact — and the verdict now rests on a scoring map proven
complete rather than assumed complete.** `test_fp_stat_map_coverage.py` fails if a
priced skill category ever goes unparsed again.

**NEXT (post-08-22, per the prereg's shipping cap):** extend the grid to
0.80/0.85/0.90 and re-run. One season, n≈376 — the most this licenses is
"adopt for 2026 and re-test when 2023/2024 become gradeable."

## CORY RULED 2026-08-17 (evening)

| # | ruling | what it means |
|---|---|---|
| ⑦ | **`ceiling` weight → NON-ZERO. "IS THIS STUDIES? IF SO, YES."** | Yes, studies: three preregistered runs, two independent seed sets, every value 0.15–0.65 beats zero, 3/3 separable. **"Should it be higher?" — NO, and there is evidence.** `FRONTIER.md` exp 21 found an INVERTED-U across 150 paired rooms on his real keeper base: λ=0.25 **+$44/season**, λ=0.5 **+$56** (CI [33, 78]), λ=2 **−$18**, λ=3 **−$27** with CI excluding zero. `POLICY-TOURNAMENT.md` §5 reproduced the shape independently. **0.45 sits at the measured peak; higher moves toward the negative arm.** Caveat that stands: both ran in the simulated-room proxy on the v1 money model, not held-out seasons. |
| ⑧ | **E owns input policy — "YES"** | Confirmed rather than inherited from the relay. E decides which sources feed the board and at what weight, subject to Cory; A keeps correctness and merges. |
| ⑨ | **EDGE IS DEFINED** — beat his own drafting or top 4 · more money · title >3/10 · playoffs ≥50% · PF > league average. **Any one counts.** | `EDGE-DEFINITION.md`. **This is the target nobody had written down.** It exposes that almost everything we measure is ACCURACY (MAE, Spearman) and not one of his five is. Three of the five are reachable with machinery that already exists. |

## OPEN — Cory has not got this yet

| # | what Cory asked for | owner | status | what "done" looks like |
|---|---|---|---|---|
| A1 | **War room redesign**, *"too busy and wordy… a professional draft buddy"* — **and it must be the DESKTOP screen**, which is where Cory drafts. | **B** | 🔴 DELEGATED — draft-critical, 08-22 | Desktop-first. Fix density by hierarchy, NOT by deleting data. **Four truth defects found in B's own screenshot are blocking regardless of the redesign** — register rows 4c–4f, of which 4c (every pick number computed for the wrong seat) invalidates the page. |
| A2 | **Decide the projection source: Sleeper, FantasyPros, or a mix.** | **A** | 🔴 DELEGATED — needs a ruling | A rules on source policy. The finding that forces it: `proj_mean` is Sleeper × adjuster, and FP never enters it (register row 21). **📐 NEW EVIDENCE FOR THIS RULING, 2026-08-18 (relay) — the disagreement is POSITION-SHAPED, and RB is the outlier by 3-5×.** Measured in Cory's actual pick window (ADP 27-160, the 123 players there carrying BOTH sources; `proj_mean == proj_sleeper` for **123 of 123**): **RB n=37 — median FantasyPros − Sleeper = +21.4 pts (+15.3%), FP higher for 33 of 37.** WR n=48 → +6.1 (+4.3%). QB n=21 → +4.8 (+1.4%). TE n=17 → +4.2 (+3.0%). **So "Sleeper vs FantasyPros" is not one decision — at WR/TE/QB the two sources are within a few percent and the choice barely moves a pick; at RB they differ by a sixth of a season and it moves ranks by dozens of slots.** **AND THIS IS THE MECHANISM UNDER REGISTER ROW 2c** (*high-upside young RBs are under-ranked*), which I re-measured today and confirmed TRUE: RJ Harvey board **144** vs ADP **83**, Bhayshul Tuten board **94** vs ADP **56**. Their Sleeper numbers are 125.6 and 158.8; FantasyPros says **145.2** and **192.5**. Both sit below the RB replacement level of 179.3 on Sleeper's number, which is exactly why they rank where they do. **The market is closer to FantasyPros on these players.** **⚠️ WHAT THIS IS NOT: EVIDENCE THAT FANTASYPROS IS RIGHT.** `ROUTES.md:1662` states the binding constraint — *"Sleeper/FantasyPros past accuracy is unmeasurable — 2026 is the first gradeable season."* This measures the SIZE and SHAPE of the disagreement, not which side of it is correct, and no amount of staring at it will settle that before 08-22. **WHAT IT DOES CHANGE: the ruling can be POSITION-SCOPED.** A blanket source choice pays the RB cost or takes the RB risk across the whole board; ruling RB separately is a much smaller commitment, and RB is where Cory's picks 33-93 mostly land. |
| A3 | **Capture ALL the FantasyPros data** — projected points, ceilings, ranges, everything — not just one scalar. | **D** | DELEGATED | FP's per-player range fields walked through the eight questions. They are a real per-player upside signal, which this project has been missing entirely. Register row 22. |
| A4 | **Every session asks more questions and stops moving past things.** *"common logic shouldve told us that everyone having the same ceiling makes no sense."* | relay | **DELIVERED — verify at next surprising result** | Rule 3d shipped (`OPERATING-MODEL.md`), routed to all four lanes, and applied immediately: it reopened the Vegas null (row 18) and caught the FP-vs-FP comparison (row 19). VERIFIED only once a lane other than the relay applies it unprompted. |
| A5 | **Stop throwing data away.** *"we dont just throw out vegas odds or weekly routes because we havent seen a pattern yet."* | relay | **DELIVERED** | Rule 3c + `test_retention_rule.py`, which fails if any lane-facing doc issues a stop-the-job instruction. Known-positive control carries the exact bad text the relay shipped. |
| A8 | **Site has too many top tabs — consolidate into existing pages without losing anything.** What to Watch → matchup; Pick'em → an existing page; The Races → not its own tab; My Team + Matchup possibly merged. *"I STILL WANT ALL THOSE."* | **B** | DELEGATED — after the war room | A tab map proposed to Cory BEFORE any rebuild, then hierarchy-and-grouping (never deletion). In-season-facing, so ~week 1 rather than 08-22. |
| A6 | **Re-test EVERY adjuster now that ceiling and floor changed, and tune the auto function to change DURING the draft** by round, circumstance, position. | **A** | 🔴 DELEGATED — answered in part; the auto function EXISTS and is UNMEASURED | **The round-aware adjuster is already built**: `autoWeights()` runs Anchor/Build/Fill/Endgame phases plus four situational responses. **But its own docstring says it is NOT backtested** — every phase constant is a reasoned judgement, never measured (register 26). **And it disagrees with the composite about upside**: auto ships ceiling 0.45–0.8 while `MEASURED_WEIGHTS` ships 0, with a browser toggle deciding which Cory drafts under (register 25). Tuning needs the all-seats replay, not three drafts — post-08-22. |
| A7 | **A session that takes the macro view and red-teams the model's output** — *"our current big board has trey mcbride over justin jefferson. that makes no sense."* | relay | **DELIVERED — awaiting Cory's launch** | `SESSION-E.md`, `ROUTES.md → TO: E`, `OPERATING-MODEL.md` Rule 3e (E sits BESIDE the pipeline, gates nothing), and the lane-aware tests taught about E. Scoped as red-team-on-outputs, NOT a second PM: it raises questions with the player and number attached, and never overrides a measurement. |
| A9 | **Two decisions D put to Cory, which Cory handed to A** — 2026-08-18, verbatim: *"Send to A for answers."* (1) **what instrument grades E1**, now that the all-seats replay is measured at a ±41.8 pts/season detection floor and a PERFECT game-total oracle scores 77% of it; (2) **whether the asymmetric-environment arm is built before or after 08-22.** | **A** | 🔴 DELEGATED — routed 08-18 | A rules on both. **Q-A is the one that matters:** name the estimand that replaces the seat delta, because every null this project has published was measured on an instrument that could not have seen the effect anyway. D's REC is paired-within-room with its noise floor measured BEFORE any arm runs; DEFAULT if unruled by 08-23 is that D builds that harness. Q-B REC and DEFAULT are both *after the draft*. `ROUTES.md → TO: A`, `OPEN-QUESTIONS.md` Q13, register 31 + 18b. |

## WAITING ON CORY — nobody else can move these

| # | what | why it is Cory's |
|---|---|---|
| — | **Nothing.** All five open decisions were ruled on 2026-08-17, and the two D raised on 08-18 were delegated to A the same day (A9). | Kept as a live section: when it is empty, no lane is idling on Cory. |
| — | ⚠️ **One thing is still with Cory but is not a decision — the uploaded resources.** D reported 08-18 that **nothing was uploaded to its session**; anything living only in a chat window is invisible to A and every other lane. `RESOURCES.md` is the committed home for it. Not blocking any lane. | Only Cory has the material. |

## DELIVERED AND VERIFIED

| # | what Cory asked for | how it was verified |
|---|---|---|
| V1 | **A data-stewardship session** (D) | `SESSION-D.md`, inbox, `OPERATING-MODEL.md` row, and `test_lane_coherence.py` — which failed the moment D's inbox appeared without a role file, then passed. |
| V2 | **Nothing gets left behind** | `DEFECT-REGISTER.md` + `test_defect_register.py`, which fails on any row with no owner. It caught lane D's own rows on the first run after the re-route. |
| V3 | **The eight-question data chain** | `DATA-LIFECYCLE.md`, all ten stores measured rather than recalled: two complete the chain, four stop with no recorded reason. |
| V4 | **Everyone in their own lane, A decides and merges** | `OPERATING-MODEL.md` — one screen, Rules 1–5, ASK/EVIDENCE/REC/DEFAULT so silence is consent and nobody idles. |

---

**Rule for adding a row:** if Cory said it and it would change something, it goes
here the same turn — even when the answer is "already covered by X." Especially
then, because "already covered" is what A6 looked like right up until someone
checked, and nothing was covering it.

---

## 🔴 2026-08-18 — THE MARKET AXIS WILL PRODUCE NOTHING ALL SEASON UNLESS YOU SAY GO. ONE DECISION, WITH THE PRICE.

**Context, measured tonight:** the champion (`own_v6`) already contains usage share,
pace, xFP efficiency and a Vegas week-1 tilt. Two arms I proposed as "new axes" turned
out to be **already graded and failed** because they re-added what the model has
(`pace_arm.json` and `advanced_efficiency_study.json`, both `clears: false`).
**The one family the model does NOT contain is MARKET INFORMATION** — lines set by
people with money at stake. That is now the priority for beating Sleeper and
FantasyPros next year.

**AND ITS PIPELINE IS NOT SCHEDULED.**

`draft/weekly_props_arm.py` (`props_weekly_v1`) is **built and already wired into the
Tuesday grader** — `weekly_own_grade.py` imports it and grades it as a study arm. But
its input folder is *"empty pending a human-dispatched real fetch"*, and
**`weekly-props-fetch.yml` is `workflow_dispatch` only — it has NO cron.**

**So on Thursday of week 1 the projection job runs, on Tuesday the grader runs, and the
props arm is silently absent from every grade, all season, because nobody pressed a
button.** That is the exact shape of failure you have been calling out all week.

**THE PRICE, computed from the fetcher's own `estimate_credits()`:**

| scope | per week (16 games) | full 18-week season |
|---|---|---|
| **all 8 player-prop markets** | 1,280 credits | **23,040** |
| confirmed market only (`player_pass_yds`) | 160 credits | 2,880 |

**Budget last seen: 75,681 credits remaining**, on what the fetcher's header reads as a
~100,000/month plan. **The full-fat option is ~31% of the current balance spread across
four months.**

**THE ASK — one word:**
1. **GO, all 8 markets** (23,040/season) — the complete market picture, and the version
   that can answer P12 (alternate lines imply the per-player *distribution* no source
   will publish — the thing we went looking for all week and could not buy).
2. **GO, narrow** (2,880/season) — passing yards only; cheap, but QB-only signal.
3. **HOLD** — and the market axis produces nothing in 2026, which pushes the
   "beat Sleeper and FP" verdict to 2028.

**RELAY'S REC: option 1.** It is the only untapped family, the arm is already built and
graded-ready, and the cost is a fraction of a budget that otherwise expires monthly
unused. **A capture not taken cannot be backfilled** — that is your own standing rule,
and week 1 is ~09-10.

**DEFAULT IF YOU SAY NOTHING: nothing happens.** This one cannot have a relay default —
it spends your money.

---

### ✅ RULED 2026-08-18 — AND MY ASK ABOVE WAS PARTLY MOOT. CORRECTING IT.

**Cory:** *"I guess use our credits until this run out but expire at the end of this
month I believe. Use while you can. Do deep search for 2026 days for free."*

**THE ASK ABOVE WAS WRONG IN ITS CENTRAL ASSUMPTION AND I SHOULD SAY SO PLAINLY.** I
priced a **season-long weekly fetch** at 23,040 credits. **That is not purchasable:
the credits expire ~08-31 and week 1 is ~09-10.** The plan's own framing, recorded in
`free-betting-probe.yml`'s header on 08-16, already said so — *"the Odds API plan is a
ONE-MONTH purchase for HISTORICAL data; 2026 live betting must come from free sources
or not at all"* — and I asked Cory to approve a recurring spend anyway. **He answered
the question I should have asked.**

**WHAT THE CREDITS CAN ACTUALLY BUY BEFORE 08-31, in priority order:**

1. **2026 week-1 (and week-2) player props, if books have posted them yet.** The only
   in-season data this plan can ever produce, and it feeds `props_weekly_v1` — already
   built and already wired into the Tuesday grader. **Verifying availability now with a
   dry run** (costs ~nothing, shows the live credit balance).
2. **Nothing from `historical-props-fetch.yml`** — it offers 2023/2024/2025 only, and
   **we already hold all three in full.** There is no unbought season there.

**THE HONEST CEILING ON THIS: at most a week or two of in-season market data, not a
season.** That is worth having — it is the only market data 2026 will get unless a free
source is found — but it will not settle P11/P12 on its own.

### 🔴 AND THE FREE PATH IS MEASURED SHUT — BALL DON'T LIE CANNOT DO IT

Cory: *"We can get for free from ball don't lie key."* **Tested properly rather than
argued** (`bdl-key-matrix.yml`, artifact `bdl_key_matrix.json`), because the repo's
existing "no" had probed **1 of 4** BDL secret names and I would not report a limit on
that basis.

| BDL endpoint | status | what it means |
|---|---|---|
| `odds` (season/week, by date) | **401** | exists, **needs a paid tier** |
| `player_props` + 5 other spellings | **404** | **route does not exist — BDL has no player-props product** |
| stats · season_stats · injuries · advanced_stats | 401 | paid tier |
| teams | 429 | free-tier rate limit |

**And only ONE of the four secrets is actually set** — the other three are empty, so the
"wrong key" theory is dead too. **A BDL paid tier could unlock game-level ODDS, but the
404s say no tier unlocks player props.** BDL is not a substitute for the market axis.

**⭐ SO THE REAL ASK IS THE ONE CORY ALREADY GAVE ME: find a free 2026 source.** That is
now a tracked row (**P53**) rather than a good intention, and Kalshi is the live
candidate — free, already captured daily, and its catalog carries season player totals
and fantasy-points markets. Its known problem is thinness, not access: every ticker
sampled in mid-August returned **zero open markets**. **Re-probing after the season
opens is the test.**

