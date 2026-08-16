<!-- TERRITORY: A -->
# BLENDED `proj_mean` — THE VERDICT — 2026-08-16

**Preregistration:** `draft/backtest/PROJ-MEAN-BLEND-PREREG.md` — the base plus
**Amendment 1** (Cory's rookie/K/DEF coverage ruling) and **Amendment 2** (his
"use whatever has proven superior" ruling), each committed before the work it
governs produced a number. Commit order is the proof: `20e30415` → `b5d6798e`
→ `b1970a41`.
**Artifact:** `draft/backtest/proj_mean_blend.json`.
**Runner:** `draft/backtest/proj_mean_blend.py`. **Tests:** 30 in
`draft/tests/test_proj_mean_blend.py`, every gate two-armed.
**Suites at this commit:** Python **2777 passed, 5 skipped, 6 deselected**;
JS **307 entry points, 0 failures**.

---

## THE ANSWER, FIRST

**NOTHING SHIPPED. `proj_mean` is still Sleeper-only.** The blend was refused —
not because it measured worse, but because **the measurement Cory's ruling
conditions on cannot be built.** Three independent reasons, in the order they
fire:

1. **The control arm does not exist.** Sleeper published no pre-2026 preseason
   projection archive and none was ever captured here, so "does the blend rank
   players better than Sleeper alone" has no answer on 2023/2024/2025.
2. **Every coverage policy failed the preregistered rookie-bloc veto** — all
   five, including both of the ones Cory named.
3. **The mechanism's own precondition is not met by our sources.** Averaging
   forecasts helps when they are *independent*. Ours are ~0.94 error-correlated,
   and in that regime the average beat the better parent in **31 of 112**
   measured cells — **37 of 112 even when the blend is position-weighted out of
   sample.** In this data the thing that has "proven superior" is the better
   single source, not a blend of sources.

Cory ruled on the expectation that blending helps. The honest report is that we
cannot show it does, we *can* show the coverage mechanics would move his board
in ways that have nothing to do with football, and six days out that is not a
change to make on a hope.

**One live defect WAS found and fixed** while doing the coverage census, and it
is worth more than the blend would have been — see §6.

---

## 1. WHY THE GRADED TEST COULD NOT RUN (prereg §2)

A blend is a **per-player** average. Whether it beats its best component is
decided by the **error correlation between sources** — a quantity no aggregate
MAE can carry. So the test needs per-player historical values for every arm.

| arm | per-player 2023/24/25? | why |
|---|---|---|
| **Sleeper (control)** | **NO** | never archived by anyone. `proj_series.json`, the only Sleeper freeze that exists, starts **2026-08-09** — it covers 2026 and no gradeable season. A retroactive fetch leaks (exp33): it grades flatteringly because it already knows the injuries. |
| **FantasyPros** | **NO** | `exp_fp_hist_proj` graded all three years in CI and passed every authenticity gate, but committed **only per-position aggregates**; the per-player rows were deliberately not retained. Re-fetching is CI-only egress and is unreachable from here — the agent proxy answers `CONNECT www.fantasypros.com` with **403**, verified this run via both urllib and curl. |
| **own_v6** | **yes** | reproducible offline and leak-free from the committed weekly/component stores. |

**This is not a new discovery and that is the point.** The repo had already
written it down three separate times, and each time drew the same consequence:

- `model_accuracy_backtest.py`'s docstring — *"a backtest of the SOURCES against
  2023-25 is UNMEASURABLE from this repo"*;
- `draft/audit/projection_skill_backtest_2026-08-15.md` § *what can never be
  known* — *"Sleeper's own historical preseason skill … permanently
  unmeasurable"*;
- `SOURCE-WEIGHT-PRIOR-PREREG.md` §4 — *"the ideal held-out test … is NOT
  constructible offline"*, deferring it to **January 2027**.

**REC-2 gates `proj_mean`'s composition on the January 2027 Sleeper grade for
exactly this reason.** The gate is not bureaucracy in the way of a good idea; it
is a statement that the evidence does not exist yet, and running the test is what
proved the gate right rather than merely quoting it.

**What I did NOT do, deliberately:** substitute FantasyPros for Sleeper as "the
professional consensus" and grade *that* while calling it the ruled test. The
prereg forbids it in advance (§2) because it is a different test wearing this
one's name — and it would have produced a clean-looking table that answered a
question nobody asked.

**A note on the 2023 data, as flagged.** FP's measured accuracy degrades sharply
2023 → 2025 (WR ρ 0.9243 → 0.7621), a plausible signature of a 2023 archive
revised after the fact. The prereg therefore fixed 2023 at weight **0.5** against
1.0 for 2024/2025, *before* any result — and every FP bias figure used in §4's
P4 is weighted that way. Weight the 2024/2025 evidence; treat 2023 as
corroboration at best.

---

## 2. THE COVERAGE CENSUS — the hazard, counted (prereg §4)

Cory's ruling says *"we already have three sources attached to every player."*
**On this board that is not true, and the way it is untrue is the whole problem.**

Sleeper is counted from `proj_baseline`, **not** `proj_sleeper` — see §6 for why
the latter would have undercounted it.

| pos | group | n | 1 src | 2 src | **3 src** | has FP | **has own_v6** |
|---|---|---:|---:|---:|---:|---:|---:|
| QB | veteran | 70 | 1 | 10 | **59** | 63 | 65 |
| QB | **rookie** | 18 | 10 | 8 | **0** | 8 | **0** |
| RB | veteran | 121 | 5 | 32 | **84** | 91 | 109 |
| RB | **rookie** | 33 | 21 | 12 | **0** | 12 | **0** |
| WR | veteran | 172 | 6 | 37 | **129** | 132 | 164 |
| WR | **rookie** | 67 | 40 | 27 | **0** | 27 | **0** |
| TE | veteran | 93 | 3 | 12 | **78** | 79 | 89 |
| TE | **rookie** | 35 | 18 | 17 | **0** | 17 | **0** |
| K | both | 44 | 40 | 0 | 0 | 0 | 0 |
| DEF | n/a † | 32 | 32 | 0 | 0 | 0 | 0 |

† Team defenses carry `years_exp` 0, so the rookie/veteran split classifies all
32 as "rookie". They are not, and nothing in this study turns on it — but the
figure is in the artifact and would mislead anyone reading the raw census. The
4 K rows counted at **0 sources** are the ADP-fallback rows: `proj_baseline`
there is `_rank_fallback`'s ADP decay, not a Sleeper projection, and it is
counted separately rather than as Sleeper coverage.

**The three-source group IS the veteran group. Not one rookie anywhere on the
board carries three sources, at any position.** own_v6 covers **0 of 153**
rookies and 427 of 456 skill-position veterans. FP covers a minority of rookies
(8/18, 12/33, 27/67, 17/35) and a large majority of veterans.

So a naive blend does not average three opinions per player. It averages **three
for veterans and one or two for rookies**, and the groups are then measured on
different instruments. The instruments disagree by a lot:

    median(source − Sleeper), 2026 board, players carrying both:
      own_v6:   QB −14.86   RB  −9.78   WR −18.90   TE  −2.51
      FP:       QB  +1.09   RB +15.70   WR  +5.10   TE  +5.43

own_v6 sits **18.9 points below Sleeper at WR**. Add it to the veterans' average
and only the veterans', and the veteran bloc sinks — for no football reason at
all. That is the bug the brief named, and it is large.

*(Sideways implication worth recording: own_v6's measured bias against realized
2025 points is **+8.72** at WR, i.e. it over-projects. If it also sits 18.9 below
Sleeper, Sleeper's own WR bias is implied to be substantially more positive than
own_v6's. The two figures come from different populations and years so this is
indicative, not a measurement — but it is the first number of any kind
suggesting the shipped source over-projects WRs, and it is exactly what January
2027 will settle.)*

---

## 3. ARTIFACT OR OPINION — the split the bloc test alone cannot make

A rookie bloc can move for two opposite reasons and they demand opposite
responses. Measured per source, on the shared population, as mean rank-percentile
disagreement against Sleeper:

| pos | source | rookies covered | rookie Δ | veterans covered | veteran Δ |
|---|---|---:|---:|---:|---:|
| RB | FP | 12 | **−0.066** | 91 | +0.009 |
| WR | FP | 27 | **−0.036** | 132 | +0.007 |
| TE | FP | 17 | **−0.136** | 79 | +0.029 |
| QB | FP | 8 | +0.018 | 63 | −0.002 |
| all | **own_v6** | **0** | **—** | 427 | 0.000 |

- **FantasyPros covers both groups and ranks rookies systematically BELOW
  Sleeper** — most sharply at TE (−0.136 of a percentile). That is a **genuine
  football opinion**, and it is precisely the kind of signal a blend exists to
  capture. Suppressing it would be suppressing the point.
- **own_v6 covers no rookie anywhere, so it can express no opinion about them.**
  Every rookie-vs-veteran shift it causes is **pure artifact**.

**And the two are confounded in the shipped board.** A blend moves rookies for
both reasons at once and the board cannot tell you which. That, more than any
single number, is why this is not a safe change to make in six days.

---

## 4. THE FIVE POLICIES — all five failed the veto

The veto (prereg §4, fixed before any run): a policy is ineligible if the rookie
bloc's median **or** mean board-rank change differs from the veterans' by ≥ 3.0
positions.

| policy | what it does | blended rows | rookie med / mean Δ | veteran med / mean Δ | med gap | mean gap | **veto** |
|---|---|---:|---:|---:|---:|---:|---|
| **P1** | blend only where all 3 present | 350 | +5.0 / +0.01 | +2 / −0.00 | **3.0** | 0.01 | **FAIL** |
| **P2** | Sleeper-anchored level correction | 506 | +1.0 / +7.24 | 0 / −2.78 | 1.0 | **10.02** | **FAIL** |
| **P3** | blend where ≥2 present | 506 | +7.0 / +2.20 | +3 / −0.84 | **4.0** | **3.04** | **FAIL** |
| **P4** | **Cory's (a)** — bias-corrected | 506 | +5.0 / −3.44 | +3 / +1.32 | 2.0 | **4.76** | **FAIL** |
| **P5** | **Cory's (b)** — rank-space | 506 | +3.0 / +10.28 | 0 / −3.95 | **3.0** | **14.22** | **FAIL** |

### P1 is the cleanest demonstration of the hazard in the whole study

P1 blends **only** rows carrying all three sources. Verified directly: of its
**350 blended rows, exactly 0 are rookies** — so **P1 changes no rookie's
projection at all.** The median rookie still falls **5 board positions** against
the veterans' 2. Every one of those rookies moved purely because veterans moved
around him. **That is the coverage artifact in pure form, with the football
content held at exactly zero**, and it is pinned by
`test_p1_blends_no_rookie_yet_the_rookie_bloc_still_moves`.

(For scale: P2/P3/P4 each blend 64 rookies — exactly the FP-covered set,
8+12+27+17 — and P5 touches 80, because a permutation also displaces rows no
source covers.)

### On Cory's option (a), P4 — and the hole in it

Subtracting each source's measured per-position bias is the right instinct, and
it is the best-behaved policy on the *median* (gap 2.0, and 0.0 in the draftable
region). **But its correction has an unmeasured term at the centre of it.**
Sleeper's own bias against realized points is exactly the quantity §1 proves does
not exist, so P4 corrects FP and own_v6 onto the truth scale and must leave
Sleeper where it is, **0 by assumption**. It is a bias correction that cannot
correct the source carrying the most weight. Its inputs are also single-season
(own_v6, 2025) or year-weighted past seasons (FP) applied to a 2026 board, with
nothing showing they are stationary.

**P2 is the constructible half of the same idea** — anchor every source to
*Sleeper's* level rather than to truth, which needs no knowledge of Sleeper's own
bias. It has the best median gap (1.0) of any policy, and still fails on the mean.

### On Cory's option (b), P5 — the prior was right about the property and wrong about the outcome

Cory's prior was that rank-space is more robust for a draft board. **The property
he expected is real and P5 is the only policy that has it:**

    replacement level, before -> after (points)
      P1   QB −11.87   RB −18.79   WR −15.59   TE −8.14   K 0.00   DEF 0.00
      P2   QB  −7.28   RB −11.02   WR −14.88   TE −9.18   K 0.00   DEF 0.00
      P3   QB −11.87   RB −18.79   WR −15.59   TE −8.14   K 0.00   DEF 0.00
      P4   QB −21.26   RB −19.70   WR −17.03   TE −5.21   K 0.00   DEF 0.00
      P5   QB   0.00   RB  +0.60   WR  +1.37   TE −0.45   K 0.00   DEF 0.00

**This is the K/DEF answer Cory asked for, and it is worse than it looks for
P1–P4.** Those four drop QB/RB/WR/TE replacement level by 5–21 points while K and
DEF sit at exactly 0 — because no blend can reach K or DEF. Replacement level is
the zero point of VORP, so **every skill-position dollar value inflates against
K and DEF**, and nothing on screen says so. That is precisely the silent
cross-position rescale Cory warned about, and it is a property of the *policy*,
not of the data.

P5 does not have it. Its back-map is an exact within-position permutation of the
Sleeper values, so the per-position value multiset is preserved by construction;
the ±1.4-point residuals above are only the per-player `opportunity_adj` riding
on top. K and DEF come out byte-identical.

**But P5 fails the bloc veto worst of all** (mean gap 14.22; 16.86 in the
draftable region), and its movers show why:

    Sterling Shepard   WR  vet   rank 574 -> 251   (+323)
    DeAndre Hopkins    WR  vet   rank 565 -> 258
    Fernando Mendoza   QB  rook  rank 261 -> 535   (−274)

Rank-space is scale-free, which removes the *level* channel — and that leaves the
*ordering* channel unrestrained. own_v6 likes veterans with prior production and
has literally nothing to say about rookies, so in pure rank space veterans climb
over rookies wholesale. **Being scale-free does not make it coverage-free**, and
that is the substantive correction to the prior: the level shift was never the
only channel, and closing it does not close the other one.

**A construction bug I found by measuring, recorded because it is the same
defect class:** P5's first implementation subtracted two percentiles taken inside
a source's own coverage and added the difference to a percentile taken on the
full position — two different rulers. Since own_v6's coverage is veterans-only
and veterans sit at the top of the board, a fixed shift in veteran-space is a
larger shift in board-space, and the veteran bloc moved for that reason alone.
**The coverage-artifact bug, reproduced inside the fix written to prevent it.**
It is now a quantile transfer through the shared population, which carries no
density assumption. It moved the mean gap 17.03 → 14.22 — i.e. it was real, and
it was not the main effect.

### A weakness in my own bar, named rather than quietly used

The veto counts every row on a 685-row board, so a player sliding from rank 500
to 823 counts like one sliding out of round 3. The median/mean split shows the
movement lives in a tail nobody drafts. A post-hoc cut to `adp ≤ 225` is in the
artifact under `post_hoc_draftable_only`, and under it **P3 would have passed**.
**It is labelled post-hoc and it rescues nothing** — it was chosen after seeing
the veto fail, and the ship decision was already REFUSE at §1 regardless. It is
recorded so the next preregistration writes a better bar than mine.

---

## 5. THE MECHANISM PROBE — the premise, priced (prereg §5)

Cory's stated mechanism: *"averaging independent forecasts is the single most
reliable improvement in forecasting."* **The claim is true and the operative word
is `independent`.** Nothing in this repo had ever measured whether our sources
are.

Graded on 2025, every unordered pair of the eight offline-constructible arms
(own_v6/v5/v4/v3/v2, walk_forward_v1, recency_blend, naive_prev), per position:

| | |
|---|---:|
| measured cells | 112 |
| **equal-weight blend beat the better parent** | **31 (27.7%)** |
| median error correlation between parents | **0.9439** |
| range | 0.6521 – 1.0000 |
| cells with error correlation < 0.8 | 12 |
| — blend won among those | 5 (41.7%) |

**In the high-correlation regime, averaging usually makes the ranking worse, not
better** — it drags the better forecast toward the worse one and there is little
independent error left to cancel. The pattern is visible arm by arm: own_v6 +
recency_blend loses at RB (0.7968 → 0.7866), WR (0.7663 → 0.7563) and TE
(0.7987 → 0.7947), winning only at QB where the two are closest in skill.

**Where do the shipped sources sit?** `exp_proj_source.json` measured
Sleeper-vs-FantasyPros rank agreement on the 2026 board at **ρ = 0.9327 overall,
0.9273 in the top 150** — and concluded, before any of this,
*"HIGH agreement → the projection source barely moves picks."* That is the same
regime where the probe says averaging does not reliably help.

### 5b. POSITION WEIGHTING — Cory's (a), measured; and the arm dropped per his (b)

Cory: *"A flat 1/3 each throws that away."* **He is right, and it is measurable.**
Weights ∝ 1/MSE per position, fitted by **2-fold cross-fit over players** so no
player is graded under a weight his own error helped choose:

| | |
|---|---:|
| cells | 112 |
| **weighted blend beat the EQUAL-weight blend** | **76 (67.9%)** |
| weighted blend beat the better parent | 37 (33.0%) |
| *(equal-weight blend beat the better parent)* | *31 (27.7%)* |

**Two findings, and the second is the one that matters.**

1. **Weighting beats flat averaging about two times in three.** Cory's instinct
   is confirmed: a flat 1/3 discards a real and consistent signal.
2. **Even weighted, blending still loses to simply using the better source in
   two cells out of three** (37/112). Weighting improves the blend; it does not
   rescue the mechanism in this correlation regime.

That second line is the direct answer to *"use whatever version of model has
proven superior"*: **in this data the thing that has proven superior is the
better single source, not a blend of sources.** And we cannot name the better
single source, because the board's source is the unmeasured one — see §5c.

**The SHIPPED position-weighted arm (A3) is DROPPED, not reported**, under the
rule Amendment 2 fixed *before* the check. Two independent blocks, either
sufficient:

- the same per-player gap as A1/A2 — there is no Sleeper or FantasyPros
  per-player series to weight; and
- **only one season is predictable leak-free from the committed stores.** 2025
  needs 2023+2024; grading 2024 would need a 2022 weekly store, which is not
  committed. So a shipped position weight could only ever be fitted on the very
  season it grades. Amendment 2 (b): *"if you cannot do that leak-free, say so
  and drop the arm rather than reporting a fitted-on-itself number."* Done.

The cross-fit above is a **player** holdout, not a **season** holdout, and that
limitation was declared before it ran. It cannot see whether a position weight
transfers across seasons — the transfer that actually matters — and both folds
share 2025's shocks. It is the friendly case; a weighting that failed here would
have failed the easiest test available. It did not fail, and it still did not
clear the better parent.

### 5c. "USE WHATEVER HAS PROVEN SUPERIOR" — why it cannot be executed as a swap

Everything that has been measured says own_v6 is a serious instrument: champion
of its own lineage under Cory's written promotion; better than FantasyPros on
*ordering* at RB and TE and level at WR; and the better DRAFT instrument against
market-derived season projections (0 of 15 head-to-head tests cleared for the
market arm — own_v6 won top-24 .5833 vs .5417 and top-48 .7292 vs .6458).
FantasyPros is clearly better at QB (63.70/.7515 vs 72.29/.7225).

**And the board ranks on Sleeper, which is the only arm in that comparison that
has never been measured against anything.** So "use whatever has proven superior"
cannot be executed as a swap without moving the board *toward* a measured arm and
*away from* an unmeasured one — which is not evidence, it is a guess wearing
evidence's clothes. It is the same wall §1 hit, reached from the opposite side,
and it is the reason Cory's own instinct to blend rather than swap was right.

What the blend would have done is act on what we know without pretending to know
what we don't. The measurements above are why it remains the right idea; §2–§5
are why it is not yet a safe change to this board.

**This probe cannot license or block the ship and the prereg said so before it
ran** — none of these arms is Sleeper or FP, and every arm from own_v3 up
consumes `recency_blend` internally, so they are more correlated than two
independent professional forecasts. What it establishes is narrower and still
useful: **the mechanism's precondition is a measurable quantity, we had never
measured it, and the one measurement we have of our actual sources puts them in
the regime where the mechanism does not pay.**

**Fidelity:** own_v6 is rebuilt here from its committed helpers (own_model_v* is
read-only to this task, and `run()` exposes no per-player predictions). The
rebuild reproduces `model_accuracy_v6.json` **exactly at QB (0.7225), RB (0.7968)
and TE (0.7987)**; WR differs only by population (n 151 here vs 150 committed).
**Incidental finding, reported not fixed:** `own_model_v2.board_ages()` reads
`public/draft_data.json`, so own_v6's graded cells are **not** a pure function of
the committed stores — every published MAE/ρ moves with the nightly board
rebuild. That belongs to whoever owns own_model_v*.

---

## 6. THE DEFECT THIS FOUND AND FIXED — worth more than the blend

Building the census surfaced a live, material defect on the shipped board.

**`proj_sleeper` was stamped only inside `build.py`'s FantasyPros block**, so a
player FantasyPros missed lost his Sleeper number from every surface reading the
per-source columns. **The field named after one source was gated on a second.**

`public/js/draft/app.js:593` had already named this trap in prose — *"'does this
player have a Sleeper projection' cannot be answered by the field called
proj_sleeper"* — and left it standing. It had never been counted. **77 rows on
the shipped board**, and the consequences are not cosmetic:

- **`consensus.js` averages whatever per-source fields are present.** On those 77
  rows it therefore rendered **our own model alone** under the raw-projection
  label. **Kenneth Walker — ADP 17, a keeper — displayed 171.2 where Sleeper
  says 225.5.** A 54-point understatement on a second-round player, labelled
  *"Our model proj"*, on the war room six days before the draft. Also
  Tyreek Hill (−25.5) and Ricky Pearsall.
- **`src/routes/memberweek.js` derives the member-facing win odds from
  `proj_sleeper`** and correctly refuses a starter it believes Sleeper does not
  project. It was refusing on players Sleeper projects perfectly well.

**Fixed at the root**, in `build.py`, as `attach_sleeper_column(board, baseline)`
called right after `blend()` — one stamp, independent of every other source, so
all consumers are fixed at once and the field's name becomes true. It reads
`baseline` (the **pre-fallback** truth) rather than `proj_baseline`, so a row
whose baseline is `_rank_fallback`'s ADP decay is **refused**: putting a
fabricated number under a source's name would be a worse defect than the one
being fixed. The FantasyPros block keeps its own now-redundant assignment, so an
edit to FP's branch cannot silently undo this.

Two tests, red arm explicit: `test_sleeper_column_is_not_gated_on_fantasypros`
reproduces the old rule and shows it leaves the row unstamped;
`test_sleeper_column_refuses_the_adp_fallback_rows` proves absent stays absent.

**This changes no projection, no VORP, no dollar value and no ordering.** It adds
a raw column to 77 rows that already had the number one field away.

---

## 7. DISPLAY-CONSENSUS vs VALUATION-BLEND — which is which

The brief asked that these be kept distinct rather than duplicated. As shipped:

- **`public/js/draft/consensus.js` is the DISPLAY consensus.** It averages
  whatever per-source columns a player carries and labels the result honestly
  (`Consensus (N src)` / `<Source> proj`). It is a **sanity check shown beside**
  the valuation. It touches no dollar, VORP or rank. Unchanged by this study —
  and after §6 it is finally reading a complete Sleeper column.
- **There is NO valuation blend, and that is the outcome of this study.**
  `proj_mean` remains `Sleeper baseline × (1 + opportunity_adj)`. Nothing was
  duplicated because nothing was built.
- The blend logic that *was* written lives only in
  `draft/backtest/proj_mean_blend.py`, is off the build path, is imported by no
  shipped surface, and exists to be graded when the evidence arrives.

**And the provenance now says which is which, because it did not.**
`consensus_sources` was set to `2` inside the FantasyPros branch and never
revisited when the own model became a third column — so a committed durable
record has been asserting 2 while three sources attach. **No consumer reads the
field**, so it was never a live defect; it was a record stating something untrue
about the board's own projections. The name is the root of it: *"consensus
sources"* reads equally as **sources inside `proj_mean`** (1) and **columns in
the displayed consensus** (up to 3), and a field answering two questions answers
neither. Both are now stated separately in `PROJECTION_PROVENANCE`:

- **`proj_mean_composition`** — `sources: ["sleeper"]`, `blended: false`, the
  formula, the REC-2 gate, **and Cory's override with its outcome** (`REFUSED`,
  pointing at this document). A future reader learns what the board ranks on and
  that the blend was ordered, tested and declined, without leaving the artifact.
- **`display_consensus_sources`** — **per position**, because the uniform number
  is the lie: **K and DEF are Sleeper-only by necessity** (FantasyPros' feed does
  not cover them and the own model never has), and no rookie at any position
  carries three. This is the K/DEF statement Cory asked to be explicit rather
  than implied, and it is true whether or not anything is ever blended.

`consensus_sources` is corrected in place rather than removed — nothing reads it,
and a field that silently disappears is harder to notice than one that starts
telling the truth.

## 8. REC-2 — Cory's override, recorded; the gate stands

Cory's ruling **overrode REC-2** on 2026-08-16, for a blend and explicitly not a
swap, in these words:

> *"What I think is defensible right now: not 'replace Sleeper with own_v6,'
> which the gate correctly blocks — but blend. Averaging independent forecasts is
> the single most reliable improvement in forecasting, it's the actual mechanism
> behind FantasyPros' strength, and we already have three sources attached to
> every player. A blended proj_mean is a smaller, safer change than a swap, and
> it captures the one thing pros are doing that we structurally can't buy. Let's
> do it"*

and, on coverage:

> *"Can we use sleeper or fantasy pros on rookies, k and def"*

**The override is recorded and it was executed — the work was done, the test was
built, and the answer came back REFUSE.** Nothing in REC-2's documentation has
been deleted or weakened, and its original rationale stands untouched, because
**running the test is what confirmed the rationale rather than contradicting
it**: REC-2 gates `proj_mean`'s composition on the January 2027 Sleeper grade
precisely because Sleeper's skill is unmeasurable until then, and that is the
exact wall this study hit.

`proj_mean` stays single-source Sleeper. No provenance surface needs correcting,
because none of them was made to say anything untrue.

## 9. WHAT WOULD CHANGE THE ANSWER

1. **January 2027** — `proj_series.json` has frozen per-player Sleeper AND
   FantasyPros 2026 numbers daily since 2026-08-09. The moment 2026 outcomes
   land, the graded test in prereg §3 becomes constructible **for the first
   time**, with the real control and no substitution. `grade_frozen_sources` and
   `source_weight_prior` are already pointed at it.
2. **Retaining per-player rows.** The single cheapest thing that would have made
   this answerable today is `exp_fp_hist_proj` committing its per-player archive
   rows, not just aggregates. If a future egress run is dispatched, retain them.
3. **Rookie coverage in own_v6.** While own_v6 covers zero rookies, *any* policy
   that lets it into a valuation moves rookies against veterans for reasons that
   are not football. A rookie arm is a prerequisite for blending it, not a
   nice-to-have.
4. **A better bar than mine** — depth-weighted, or restricted to the draftable
   region, preregistered rather than found afterwards.

---

## WHAT I DID NOT DO

- Did not ship any blend, or change `proj_mean`, VORP, replacement, tiers,
  dollars or ordering. **I did not rebuild the board** — `public/draft_data.json`
  is untouched by this work; §6's fix takes effect at the next scheduled
  rebuild and adds only a raw column, changing no value the board ranks on.
- Did not substitute FantasyPros for Sleeper as the control and grade that.
- Did not weaken, move or delete the preregistered bar or the bloc veto after
  seeing them fail; the post-hoc draftable cut is labelled and rescues nothing.
- Did not delete or soften REC-2.
- Did not touch `draft/own_model_v*.py`, `draft/backtest/fetch_component_stats.py`,
  `draft/tools/fetch_historical_props.py` or `.github/workflows/*` — all imported
  read-only.
- Did not fix `own_model_v2.board_ages()`'s dependence on the live board (§5),
  and did not duplicate `consensus.js`'s display logic (§7).
