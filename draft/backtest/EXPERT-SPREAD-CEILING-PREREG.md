# PREREG — can expert disagreement produce a real per-player ceiling?

**Written 2026-08-18, BEFORE any arm was scored.** Register 4t. The decision rules,
the null control and the ship/no-ship condition are all fixed below, and the
no-change-before-08-22 rule is fixed here too — before any number exists — because
that is the only point at which fixing it costs nothing.

---

## 0. What is already settled, so this does not re-argue it

**No source publishes a per-player point ceiling.** Measured, not assumed:
`ceiling-source-probe` run **32087333128** reached all six candidate endpoints and
censused every key at every depth without filtering:

| endpoint | size | keys | result |
|---|---|---|---|
| `fp_projections_season` | 238 KB | 58 | NULL — a mean and nothing around it |
| `fp_projections_week1` | 262 KB | 50 | NULL |
| `sleeper_projections` | 2.9 MB | 124 | NULL for points |
| `fp_ecr_draft` | 747 KB | 40 | `rank_min`/`rank_max`/`rank_std` only |
| `fp_adp` | 312 KB | 40 | `rank_min`/`rank_max`/`rank_std` only |
| `fp_ecr_draft_experts` | 1.1 MB | 136 | **every individual expert's rank** |

Cory's own hypothesis — *"We will probably have to get from fantasy pro api don't
think we ever got"* — is answered by the second row of that table plus
`draft/audit/proj_correctness_evidence_2026-08-16.json`: **we did get it, on 08-16,
596 raw rows with a full unfiltered census, and it carries no ceiling field.**

So `ceiling = <a number some source states>` has no source. This prereg tests the
next-best thing the probe found, and it is not a consolation prize: **the observed
opinion distribution of ~90 humans about one specific player.**

## 1. The defect being replaced

`proj_ceiling` = `(player's projection) × (p90 realized/projected ratio of a COHORT)`.

The deep cohorts are dominated by players who never got a real role — `RB|33+` p10
0.021 / p50 **0.345** / p90 1.434 — so the cohort p90 lands near a typical
*participation* outcome rather than a breakout. Consequences on the live board:

* every RB from projection rank 33 down carries the **identical** multiplier 1.794;
* rank-60 Kimani Vidal's stated best case is **95.1 points** (a real late-RB
  breakout scores 250+);
* register 4j — **0 of 535 players share a `proj_mean` and differ on ANY dispersion
  field.**

**A group statistic applied to individuals.** That is the thing to beat.

## 2. Arms — named now, in advance

| arm | ceiling for player *p* | why it is on the list |
|---|---|---|
| **BASE** | today's cohort p90 | the incumbent; must be beaten, not merely differed from |
| **ECR-MIN** | points of the player at *p*'s **most bullish expert's POSITIONAL rank** | the single most optimistic published human opinion about him |
| **ECR-Q10** | points at the **10th-percentile** expert rank | same idea, robust — one contrarian cannot set a player's ceiling alone |
| **ECR-SPREAD** | `proj_mean + (spread-scaled term)` | uses disagreement WIDTH rather than its optimistic tail |
| **SHUFFLE** | expert ranks permuted across players within position | **the null.** Kills the player↔opinion link, keeps every marginal distribution |

**Positional** rank, not overall, in ECR-MIN/Q10: "the most bullish expert has him as
RB28" converts to points through the RB curve. Overall rank crosses positions and
would price a QB off a WR's points.

**If SHUFFLE scores as well as a live arm, that arm is measuring the shape of the
rank distribution and not the player, and it does not ship.** This is the control the
`ceiling` composite weight never had.

## 3. Grading — fixed before the data exists

**Primary.** Against realized seasons **2023–2025**, does the arm's ceiling predict a
player's realized/projected ratio *dispersion* better than BASE? Metric: Spearman
between the arm's implied upside and realized ratio, **computed within projection
band** so a positive result cannot be manufactured by the mean-rank relationship BASE
already encodes.

**This requires historical expert ranks.** `fp-expert-ranks-capture.yml` takes a
`year` input; 2023/2024/2025 must be captured before grading. **If any season's
capture fails, that is recorded and the season is EXCLUDED BY NAME — never silently
dropped (register 4s).**

**Secondary.** The draft replay in Cory's seat. Current standing: the tool **ties
Cory (−6.5) and loses to the league's best drafter (−163)**. An arm that improves the
primary but worsens the replay does not ship.

**Guardrail.** `proj_mean` is untouched by every arm, so `vorp` and the board ORDER
are untouched. Only the `ceiling` term moves. Any arm that moves `proj_mean` is
disqualified on sight.

## 4. Decision rule, and the date

**NOTHING SHIPS TO THE BOARD BEFORE 2026-08-22.** Fixed here, before any number
exists. The draft is on 08-22 and a third variant of a broken quantity, unmeasured,
is worse than the honest one. **For draft day the ceiling column stays the part of
the board to ignore**; timing, survival and keepers are sound and unaffected.

After 08-22, an arm ships only if **all four** hold:

1. it beats BASE on the primary, within band, on **at least two of three** seasons;
2. **SHUFFLE does not match it** — the signal is the player, not the distribution;
3. it does not worsen the replay in Cory's seat;
4. it produces **many distinct ceilings among players sharing a `proj_mean`** — i.e.
   it actually repairs 4j rather than replacing one constant with another.

Condition 4 is the one that failed silently last time and it is a *measurement*, not
a promise: `fp_expert_ranks.coverage()` already reports `distinct_rank_spreads` for
exactly this reason.

## 5. What would make this whole line a dead end

Stated in advance so it cannot be rationalised later:

* **Expert coverage stops shallow.** If `deep_with_experts` is small, the source says
  nothing about the rounds Cory is asking about and the arm is a null where it
  matters most, whatever it scores overall.
* **Spread tracks rank almost perfectly.** If disagreement is a near-deterministic
  function of ECR, it carries no player-specific information beyond rank — the same
  defect as BASE wearing different clothes. Screened with the same
  same-`proj_mean`-different-ceiling test as 4j.
* **Experts rank consensus, not opinion.** If the individual ranks are near-copies of
  each other, ~90 experts is one expert counted ninety times. `rank_std` per player
  is the screen.

**Owner:** relay (built), **A** rules after 08-22. **Recheck 08-24.**

---

## 6. SCREENS RUN 2026-08-18 — §5's kill conditions, and all three cleared

These are the **screens named in §5**, run against `fp_expert_ranks_2026.json`
(capture run **32087530275**). They are *not* the §3 grading, which needs historical
seasons and has not been run. Reported here immediately so the record shows what was
known before any arm was scored.

**Capture: 788 players, 100% carrying individual expert ranks, 0 missing, up to 91
experts on a player, and 365 DISTINCT rank spreads.** Set that last number against
register 4j — *0 of 535 board players share a `proj_mean` and differ on any
dispersion field.*

**Coverage where it has to be good, stated by depth:**

| ECR range | players | with ≥20 experts |
|---|---|---|
| 1–60 | 60 | **60 (100%)** |
| 61–120 | 60 | **60 (100%)** |
| 121–200 | 76 | **76 (100%)** |
| 201+ | 592 | 123 (20%) |

**A 12-team draft is 192 picks. Coverage is 100% across the entire draftable range
and only thins past pick 200, i.e. past the draft.** §5's first kill condition —
"expert coverage stops shallow" — does not fire.

**Screen 1 — is spread just ECR wearing different clothes?** Spearman(ECR, spread) =
**0.855** on the 319 players with ≥20 experts. Correlated, as it must be, but far from
deterministic: real residual variation survives. Does not fire.

**Screen 2 — the 4j test, and the one that matters.** Players in the SAME ECR
neighbourhood, do their spreads differ?

| ECR band | tightest | widest |
|---|---|---|
| 80–99 | Kyle Pitts Sr. **55** | Jonathon Brooks **176** |
| 100–119 | Kenny Gainwell **68** | Stefon Diggs **169** |
| 120–139 | Tyrone Tracy Jr. **69** | Malik Willis **411** |

**Same draft neighbourhood, three times the disagreement — and the board today gives
those pairs the IDENTICAL ceiling multiplier.** That is Cory's football objection,
measured: *"this goes against every fantasy footbal theory ever."*

**Screen 3 — are ~91 experts one expert counted ninety times?** Per-player `rank_std`
runs **0.7 → 85.4, median 25.8.** They genuinely disagree. Does not fire.

**None of the three kill conditions fired.** The line is worth grading — which is
§3's job, against 2023–2025, and **§4's ship date does not move.** The board's
ceiling column is unchanged for 08-22.

---

## 7. ⚠️ VALIDITY CONSTRAINT FOUND 2026-08-18 — THE HISTORICAL RANKS ARE NOT PURELY PRESEASON

**This was found by a check, not by luck, and it is recorded before any arm was
graded.** §3 grades a season's *preseason* expert ranks against that season's realized
points. If FantasyPros revised those ranks during the season, an arm reads hindsight
and **scores beautifully while being worthless.**

The first version of `fp_expert_ranks.py` dropped FP's `last_updated` — register 22's
defect (*"we keep one scalar and discard the rest"*) reappearing in the fetcher
written to fix the ceiling. It is now persisted, and the first value it returned is
the reason it had to be:

> **2025 store: `last_updated_ts` = 1757083656 → 2025-09-05 14:47 UTC.**
> The 2025 season opened **2025-09-04**. **The ranking was last revised AFTER kickoff.**

**What this does and does not mean.**

* It is **not** end-of-season hindsight. It is a *draft* ranking (`week=0`,
  `type="Draft Half PPR"`), revised to roughly the end of the real draft window.
* It **is** later than a real drafter's information set. A rank stamped 09-05 carries
  final injury and holdout resolution, cut-day news, and at least the Thursday-night
  week-1 result — none of which Cory has on **08-22**.
* **The endpoint overwrites.** There is no retrospective pre-draft snapshot to fetch
  instead. This contamination cannot be fixed by fetching differently; it can only be
  measured and bounded.

**Consequences, fixed now rather than argued later:**

1. **Every graded season must report its own `last_updated`** beside its result. A
   season whose ranking postdates that season's **week 3** is **EXCLUDED**, not
   caveated — by then the ranking is reacting to outcomes it is being graded on.
2. **The SHUFFLE null does most of the work here.** Hindsight inflates a live arm and
   its shuffled twin alike only if it is generic; if `experts=show` were leaking
   outcomes, ECR-MIN would beat SHUFFLE by a margin that also shows up as an
   implausibly strong result on the *shallow* players nobody's opinion moved. Both are
   reported.
3. **The 2026 store is uncontaminated by construction** — the season has not happened.
   It cannot be graded, but it is the honest input for any board that ships after
   08-22, and its screens (§6) stand.
4. **This constraint is stated as a discount on the result, in advance.** If an arm
   beats BASE by a small margin on 2023–2025, that margin is **not** clean evidence,
   because roughly one game plus final camp news sits inside the ranks. A small win
   does not ship.

**Owner of the check: C** (`ROUTES.md`). **A does not rule until C reports every
graded season's `last_updated`.**

---

## 8. ADDENDUM 2026-08-18 (A, before grading ran) — the ROOKIE slice is reported separately

Cory: *"We still haven't accounted for ceiling of rookies.. which will be
different depending on team, opportunities, etc."* He is right, and the gap is
already measured elsewhere: rookies have no realized cv (the volatility term
skips them by the absent rule), and `opportunity_z` is built from prior-season
usage — a veteran bonus a rookie cannot earn
(`opportunity_is_a_veteran_bonus_2026-08-17.md`).

**Expert ranks are the one input that price a rookie's team, situation and
draft capital per player** — an expert ranking a rookie WR12 vs another at WR30
is exactly the team/opportunity judgment Cory names, and rookie disagreement is
where spreads run widest (Jonathon Brooks: spread 176 in his ECR band).

Declared now, before any arm is scored:

1. Every §3 grading result is ALSO reported on the rookie-only slice
   (`years_exp == 0` as of the graded season), same metric, same nulls.
2. §4's ship conditions are evaluated on the full population as written — the
   rookie slice is a REPORT, not a new gate; three seasons of rookie classes
   may be underpowered and will say so rather than fake a verdict.
3. If the arms beat BASE overall but FAIL on rookies, that is reported as its
   own finding, because rookies are where the board's ceiling is blindest
   (cell constant + no volatility + no opportunity signal).

---

## 9. CORY'S ARM, ADDED 2026-08-18 BEFORE ANY EXPERT WAS SCORED

> **Cory:** *"Should we see which experts drafted better in 2025 then use those
> experts to apply to model for 2026"*

**Named here before a single expert has been graded**, because the whole hazard in
this idea is that it is trivially easy to run it backwards and get a beautiful
number.

**FEASIBILITY — CHECKED FIRST, AND IT PASSES.** Expert IDs persist across seasons:

| | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| distinct experts | 239 | 219 | 207 | 91 (still filling) |
| carried over from prior season | — | 197 (82%) | 171 (78%) | 76 (36%) |

**62 experts appear in all four seasons** — a three-season track record *and* a 2026
submission. The idea is buildable.

### Arm **EXPERT-SKILL** (Cory's)

Score each expert on 2023–2025 by how well their published ranks ordered realized
points; keep the ones that score well; build the 2026 consensus (and its spread) from
**those experts only**, or weight by skill.

### ⚠️ THE HAZARD, STATED IN ADVANCE

**With 62–239 experts and three seasons, the best-scoring expert is almost certainly
lucky.** Selecting the 2025 leaders and applying them to 2026 is textbook
overfitting, and it will *always* produce a flattering backtest because the selection
and the evaluation share a season. So:

**GATE — EXPERT SKILL MUST PERSIST, AND THAT IS TESTED BEFORE ANY WEIGHTING IS BUILT.**
Score every expert separately in 2023, 2024 and 2025, then measure the rank
correlation of expert skill **across** seasons (2023→2024, 2024→2025).

* **If skill does not persist across seasons, this arm is DEAD** and no amount of
  in-sample separation revives it. "Use the good experts" would then mean "use last
  year's lucky experts", which is a coin already flipped.
* **If it does persist,** experts are selected on seasons **strictly earlier** than
  the season they are evaluated on — select on 2023–2024, evaluate on 2025. Never the
  same season for both.

**NULL CONTROL — EXPERT-SHUFFLE.** Assign each expert a random skill score and rebuild
the consensus the same way. If a randomly-selected subset of ~60 experts consensuses
about as well as the "skilled" subset, the arm is measuring *ensemble size*, not
expertise — 60 opinions averaged beat 200 averaged for reasons that have nothing to
do with who is good.

**SECOND NULL — MOST-RANKED-PLAYERS.** An expert who ranks 300 players and one who
ranks 100 are not comparable on any raw correlation. Skill is scored only on each
expert's overlap with the common player set, and expert coverage counts are reported
beside the skill scores.

### What it would take to ship

Same four conditions as §4, plus persistence, plus **it must beat the plain
all-experts consensus** — not merely beat BASE. Today's board already uses a
consensus; an arm that reproduces it with extra machinery is not an edge.

**Blocked on the same join as §3** (`sleeper_name_index.yml`). **Owner: relay builds,
A rules after 08-22. Recheck 08-24.**

---

## 9b. RESULT — CORY'S ARM WAS RUN AND IT **FAILS ITS OWN NULL**. IT DOES NOT SHIP.

Run 2026-08-18 against the four committed expert-rank stores joined through
`sleeper_name_index.json` (97% name coverage every season). **Both preregistered
nulls were reported, and the arm lost to one of them.**

### Step 1 — the persistence gate: MARGINAL, not dead

Every expert scored separately per season on the common player set (≥80% coverage
both ways), skill = Spearman(their rank, realized fantasy points weeks 1–17), signed
so higher is better.

| transition | shared experts | skill correlation |
|---|---|---|
| 2023 → 2024 | 183 | **0.121** |
| 2024 → 2025 | 160 | **0.257** |

Mean **0.189 — weak persistence.** Real, not zero: last year's better experts are
somewhat more likely to be better again. **The gate passed as MARGINAL, so the arm
was allowed to be built with both nulls attached.** It was.

### Step 2 — ⚠️ AND HERE IS WHY THE SKILL SPREAD MATTERS MORE THAN THE PERSISTENCE

| season | worst | p25 | median | p75 | best |
|---|---|---|---|---|---|
| 2023 | 0.381 | 0.452 | 0.475 | 0.490 | 0.626 |
| 2024 | 0.338 | 0.493 | 0.525 | 0.543 | 0.570 |
| 2025 | 0.359 | 0.485 | 0.507 | 0.522 | 0.579 |

**The interquartile range is about 0.04 on a median of ~0.51.** There is no genius in
this room and no fool. Roughly 200 experts are all about equally good, which is the
mechanism behind everything below: **a consensus is dominated by what the experts
agree on, not by which ones are best.**

### Step 3 — the direct test, selecting on 2023+2024 and evaluating on 2025

145 experts have a 2023+2024 record and a 2025 submission. Consensus = mean rank
across the selected experts, scored against 2025 realized points. **The null is 200
random subsets of the identical size.**

| selection | 2025 consensus quality | vs ALL 198 experts | **percentile among random subsets of the same size** |
|---|---|---|---|
| **all experts** | 0.5240 | — | — |
| top quartile (k=36) | 0.5249 | +0.0009 | **36th** |
| top decile (k=14) | 0.5289 | +0.0049 | **70th** |
| top half (k=72) | 0.5282 | +0.0042 | **72nd** |

**THE TOP QUARTILE — the most natural reading of "use the experts who drafted
better" — LANDED AT THE 36th PERCENTILE, i.e. WORSE THAN A COIN-FLIP SUBSET OF THE
SAME SIZE.** The other two land at 70th and 72nd, inside the random p05–p95 band
(0.5203–0.5321), and the ordering is not monotone in selectivity. **Every margin over
the all-expert consensus is under 1% of the baseline and smaller than the noise.**

### Verdict, against §9's own rule

§9 required the arm to beat **the plain all-experts consensus** and **the
random-subset null**. It does neither. **CORY'S ARM DOES NOT SHIP.**

**This is a real saving, not a dead end.** A skill-weighted expert model would have
been entirely plausible to build, would have shown a positive-looking `+0.005`
against the all-expert consensus, and would have delivered nothing — because the
persistence that justified it (0.19) is swamped by the fact that the experts barely
differ. **The null is the only thing that separated those two stories, and it was
written down before the number existed.**

**What survives from this line:** the *disagreement* between experts (§6) is still
the live signal, and it is untouched by this result. **How much the room disagrees
about one player is informative; which members of the room they are is not.**

**Owner: relay (run). Recorded for A. Recheck 08-24.**

---

## 10. GRADED 2026-08-18 — **ALL THREE CEILING ARMS FAIL. THE LINE IS DEAD.**

1,111 graded player-seasons across 2023–2025, joined through `sleeper_name_index.json`
(97% name coverage every season), players with ≥20 experts only.

**ONE DECLARED DEVIATION FROM §3, stated because a silent substitution is worse than
the deviation.** §3 specified realized/projected *ratio* within projection band.
Historical bundles are not committed (`cli.py` writes `bundles.json`, nothing stores
it), so the grading uses **ECR band** instead of projection band and **realized
points** instead of the ratio. This is not a weaker test of the claim: **BASE assigns
every player inside a band the identical ceiling by construction**, so any within-band
discrimination whatsoever is information the current board cannot express. The arms
had the easiest possible bar — beat a constant — and they did not clear it.

### Metric 1 — realized p90 within band, narrow vs wide disagreement

| ECR band | n | narrow p90 | wide p90 | gap |
|---|---|---|---|---|
| 1–24 | 72 | 318.9 | 332.4 | +13.5 |
| 25–48 | 69 | 334.5 | 351.1 | +16.5 |
| 49–72 | 71 | 253.6 | 303.4 | +49.8 |
| **73–108** | 106 | 336.9 | 226.7 | **−110.2** |
| 109–160 | 154 | 220.1 | 254.6 | +34.5 |
| 161–240 | 160 | 171.9 | 207.5 | +35.6 |
| **pooled** | 632 | 255.2 | 273.7 | **+18.5** |

**SHUFFLE null, 400 draws:** median −1.9, p05 −41.8, **p95 +38.3**. The real +18.5
sits at the **72nd percentile — inside the null band.** Five bands positive, one
violently negative, pooled *mean* points identical (139.1 vs 138.6). **Not evidence.**

### Metric 2 — P(top-12 finish at position), the stable one

p90 on ~35 players per half is effectively the third-best player and is very noisy, so
the same three arms were re-graded on a rate: did the player finish **top-12 at his
position** that season (144 hits in 1,111 rows).

| arm | gap in hit rate | shuffle median | shuffle p95 | percentile |
|---|---|---|---|---|
| ECR-SPREAD (disagreement width) | **−0.0134** | −0.0007 | +0.0499 | **28%** |
| ECR-MIN (most bullish expert) | **−0.0467** | −0.0213 | +0.0296 | **15%** |
| ECR-Q10 (bullish decile) | **−0.0297** | −0.0106 | +0.0465 | **19%** |

**All three are NEGATIVE and all three sit BELOW the shuffle median.** Not "small but
positive" — the wide-disagreement and expert-bullish halves hit *less* often than
their opposites, at rates a shuffle reproduces easily.

### Verdict

**§4's conditions are not met and are not close. NOTHING FROM THIS LINE SHIPS.**
`proj_ceiling` is unchanged. The board is unchanged.

**§6's screens were necessary but not sufficient, and that is the lesson worth
keeping.** Expert disagreement is genuinely per-player (365 distinct spreads),
genuinely not a function of rank (ρ 0.855, not 1.0), and genuinely reflects ~91
humans who disagree (rank_std 0.7→85.4). **Every one of those was true and the thing
still predicts nothing.** "The field varies by player" and "the variation predicts the
outcome" are different claims, and only the second one is worth a board column.

**What this closes:** the answer to Cory's *"ceiling is a projected score that we will
have to get from outside source"* is now complete and entirely negative — **no source
publishes one (§0), and the best proxy any source does publish carries no predictive
upside information (§10).** The cohort-p90 ceiling is not being defended here; it is
still broken for the reasons in register 4t. **But the replacement we went looking for
does not exist in this data, and that is now measured rather than assumed.**

**Owner: relay (ran it). Recorded for A. Register 4t stays OPEN — the defect is real,
this particular fix is not it.**
