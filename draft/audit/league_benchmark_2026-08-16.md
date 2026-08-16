<!-- TERRITORY: A -->
# THE LEAGUE BENCHMARK — does the tool lose to everyone, or just Cory? — 2026-08-16

> ## ⚠️ AUDIT CORRECTION — 2026-08-16, later pass (data-integrity finding)
>
> **§4a's headline below — "rookie prior CLEARS, +25.1 = 38% of the pooled
> Cory gap" — DOES NOT REPRODUCE and is FALSE.** A fresh, from-scratch run
> of the exact code committed at `be3b2065` (the commit this doc and its
> artifact shipped in) produces pooled optimal `cory_gap_change: +1.6`
> (≈2.4% of the gap), not `+25.14`. Reproduced deterministically — 3 runs
> of the live tree, 3 more at explicit `PYTHONHASHSEED` values 111/222/333,
> and an independent run against an isolated `git archive` export of
> `be3b2065` itself — always `+1.6`, never `+25.14`. **The layer FAILS its
> own preregistered bar** (needed ≥25% / ≥16.4 pts, or a ≥2-seat pooled
> league-position lift on the optimal arm; actual: 2.4% / +1.6 pts, 0-seat
> lift). No code bug was found — see the forensics note, §9, for the full
> investigation and the corrected numbers. **Nothing below in §4a, §4c, §6,
> or §7 that quotes the +25.1/CLEARS result is true; each is annotated in
> place, and the original text is kept, struck through, not deleted, per
> this repo's standing correction discipline.** The prepared diff
> `draft/tools/apply_rookie_prior_own_model_2026.py` is NOT validated by
> any passing grade — see the corrected `DECISIONS-NEEDED.md` entry.

## 0. The questions, verbatim

Cory, 2026-08-16, after reading the draft replay's verdict
(`draft/audit/draft_replay_2025_vs_actual.md`: the tool lost to his real
drafts, pooled −65.7/season on the optimal arm):

> "Does model lose to everyone's drafting or just mine? We need to make this
> model better or at least better than most of the league at drafting, how
> do we do that?"

> "Should we identify what things I did better?"

and the addendum:

> "Do we need to find who the best drafter were? Top 3 and study what they
> do better then make sure model can do that or better"

**To the second question directly: YES.** The pick-by-pick replay tables and
this doc's league tables ARE the systematic record of where his reads beat
the board, and the shadow ledger
(`draft/data/draft_shadow_2026.jsonl` machinery) will capture every 2026
disagreement between his picks and the tool's recommendation as data, pick
by pick, on draft night. Rookies, roster-status news, and ascending year-2
players are that record's first three quantified components — the replay
named them, and §2 below turns two of them into testable layers (the third
is already priced on the live board and is verified rather than rebuilt).

This doc is written in the house order: §1–2 (protocol + preregistration)
were committed BEFORE any layer grade existed; §3 onward are the results,
appended afterward without touching §2's forms.

## 1. What runs — the all-seats replay

`draft/tools/replay_all_seats.py` drives the EXISTING single-seat machinery
(`draft/tools/draft_replay_2025.py`, imported and never edited) for **every
seat, every season 2023–25**: the tool sits in owner X's real seat with X's
real keepers, every other owner's picks byte-identical to history, K/DEF
mirrored from X's actual picks (they cancel exactly), and both frozen
rosters graded on actual weekly points under both lineup arms — hindsight-
optimal (the roster-quality primary) and realistic start-of-week. The
policy, projections, caps, rails, and grading are IDENTICAL to the
committed single-seat replay's primary arm; seat 1 (Cory) reproduces
`draft_replay_2025.json`'s numbers exactly (pinned by test before anything
else ran).

**Per-seat caveat, named up front:** each seat-year is one alternative
history under fixed opponents. Ten seats are ten SEPARATE counterfactuals —
they cannot happen simultaneously, and the tool's rosters may overlap
across seats. The league table reads "the tool in X's chair vs what X
actually drafted", ten times over, never "the tool re-drafting the league."

Artifact: `draft/data/replay_league_table.json` (deterministic,
`_territory` first). Tests: `draft/tests/test_replay_all_seats.py`,
`test_rookie_prior.py`, `test_year2_escalator.py`.

## 2. PREREGISTRATION — the candidate layers, forms frozen before grading

The single-seat replay named three mechanisms behind the Cory gap (§5 of
its audit doc): no rookies on a walk-forward board, no roster-status news,
under-ranked ascending year-2 players. Two are buildable walk-forward and
are preregistered here as layers; the third is a verification, not a build.
**The forms below — buckets, thresholds, clips, fit windows, and the
clearing bar — are frozen in this commit. Changing any of them after seeing
a replay grade is a NEW layer requiring a new prereg, not a fix.**

### 2a. Rookie prior from NFL draft capital (`draft/tools/rookie_prior.py`)

- **Store:** `draft/backtest/nflverse_draft_picks.json` — NFL draft picks
  2021–2025, QB/RB/WR/TE only, from the nflverse `draft_picks` release,
  committed with provenance. Period-correct by construction: the source's
  career-outcome columns (games, career yards, w_av, `to`, …) are DROPPED
  at build time; what remains is the draft-night information set of each
  class year plus the gsis→sleeper crosswalk (nfl_data_py `import_ids()`,
  the component stores' own source; unmapped picks keep `sleeper_id: null`
  and are counted, never dropped — 1 of 397 rows).
- **Fit for replay season Y:** classes C ∈ {2021…Y−1} only. Outcome of a
  class-C pick = his total scored points in season C (weeks 1–17, committed
  stores; component stores under the frozen table for 2021–22), **0.0 when
  he never recorded a scored row — busts count, that is the base rate.**
- **Form:** capital buckets by overall pick **1–10, 11–32, 33–64, 65–105,
  106+**; `Prior(pos, bucket)` = mean outcome in the cell; a cell with
  **n < 4** falls back to the position's pooled mean over all its fit rows
  (every n and every fallback reported in the artifact).
- **Application in replay Y:** every class-Y pick with a sleeper id not
  already on the walk-forward board enters the board at its cell value;
  position from the store; replacement levels recomputed. Nothing else
  changes.
- **Leakage guard:** `fit_rookie_prior(Y)` asserts every fit class < Y; the
  test traces every file open on the layer path and fails on any ≥Y store.

### 2b. Year-2 escalator (`draft/tools/year2_escalator.py`)

- **Cohort of transition S→S+1:** NFL draft class S (committed store,
  sleeper-mapped) with year-1 scored total **≥ 50.0** points. Undrafted
  rookies are not in the store and thus not in the fit — named.
- **The distribution itself is a deliverable** and is reported per position
  per transition (n, mean ratio, median ratio, ratio of sums) whatever the
  escalator grades — this is the "measure the actual year-1→year-2
  progression" half of the ask, and it is reported even if it kills the
  layer.
- **Escalator for replay Y:** pool transitions with S+1 ≤ Y−1
  (2023: 2021→22; 2024: adds 2022→23; 2025: adds 2023→24);
  `m(pos) = clip(Σyear2 / Σyear1, 1.00, 1.30)`; a position with pooled
  **n < 5** keeps m = 1.0. Ratio of sums, not mean of ratios (one 5→80
  season must not own the cell). **Clip floor 1.00 means the layer only
  escalates — it tests the ascending-sophomore hypothesis and nothing
  else.**
- **Application in replay Y:** every player on the walk-forward board whose
  NFL draft class is Y−1 gets projection × m(pos); replacement recomputed.

### 2c. Roster-status — verify, don't build

The live 2026 board already carries `team`, `depth_chart_order`,
`injury_status` per player. The claim to verify against the COMMITTED
`public/draft_data.json`: **no retired or teamless player carries a
draftable projection** (zero players with null team at all, and zero
teamless players with `proj_mean > 0`). If verified, the doc states this
edge is already priced live and NO layer is built. The Brady-2023
pathology is a walk-forward artifact, not a live defect.

### 2d. The clearing bar (preregistered)

Baseline pooled Cory-seat optimal gap is **−65.7/season** (the committed
single-seat replay). A layer **CLEARS** if, on the optimal arm, it

1. closes ≥ 25% of the pooled Cory gap (change ≥ +16.4 points/season), OR
2. lifts the tool's pooled league-table position by ≥ 2 seats
   (`beats_n_of_10`, pooled mean deltas).

Per-year deltas are reported in full either way — a layer that helps 2024
and hurts 2023 is published as exactly that, and a clearing layer whose
help is concentrated in one year is routed with that concentration named.
A layer that clears gets a **prepared, gated diff for the live 2026 board
path — NOT applied; Cory rules** (queued in `DECISIONS-NEEDED.md`).

### 2e. Drafter-skill study (the addendum — metric fixed here)

- **Skill metric, tool-independent:** VALUE OVER SLOT. Every non-keeper
  skill-position pick in each season's real 150-pick draft is graded
  `actual season total − league mean actual of non-keeper skill picks in
  the same round that year`; owner score = sum over his picks, pooled
  2023–25. Keepers (measured separately as keeper leverage: actual minus
  the occupied round's mean), K/DEF (no committed weekly stores; timing
  measured as a behavior), and the one position-less pick (2025 pid 12530)
  are excluded, each named. The ranking never touches the tool's
  projections.
- **Behaviors profiled** (pooled, n stated on everything): rookie rate +
  hit rate + surplus; year-2 rate + surplus; late-round (pick ≥ 101) hits
  + surplus; first-QB / first-TE round; earliest K/DEF round; keeper
  leverage. A "hit" = surplus > 0. A behavior counts as "what the top 3 do
  better" only if it separates them from BOTH the tool's replayed behavior
  in their seats AND the league's bottom half.
- **NOT computable, named:** ADP-deviation behaviors (reaches vs value
  falls). No season-stamped 2023–25 ADP exists in committed stores
  (`adp_series.json` is 2026-only; the BBM archive holds one 2023 finals
  subset). Absent, not approximated.
- **Small-n rule:** ~12 live skill picks per owner-year, ~36 pooled. No
  "best drafter" is crowned on a margin the table itself can't support;
  the top3-vs-bottom-half GROUP contrast is the only quotable read.
- **"Can the model do that or better":** graded as the tool's replayed
  optimal-arm delta in each top-3 seat, baseline vs layered — did the
  layers move the tool past the top drafters in their own chairs?

---

*(Everything below was appended AFTER the prereg commit `a1ce5b43`; no form
in §2 was touched.)*

## 3. THE LEAGUE TABLE — the answer to "everyone or just me"

**Direct answer: the tool loses to MOST of the league, not just Cory — and
in two of the three years the tool sits BELOW the median owner.** Pooled
across 2023–25 on the roster-quality (optimal) arm the tool beats **3 of 10
owners**; the median owner beats it by **92 points/season — more than Cory's
own 66**. Cory's framing was too kind to the tool: he is not the only owner
out-drafting it, he is not even the owner out-drafting it hardest. "Better
than most of the league" is currently false and is the right bar to chase.

**Baseline, optimal arm (Δ = tool − owner, in that owner's seat, that
owner's keepers; each cell one fixed-opponents counterfactual):**

| seat | owner | 2025 | 2024 | 2023 | pooled mean |
|---|---|---|---|---|---|
| 1 | coryjsimms | −16.9 | −58.0 | −122.1 | **−65.7** |
| 2 | ds7mmet | −168.2 | −129.3 | −249.7 | −182.4 |
| 3 | cashworth | −24.9 | +37.9 | +24.7 | **+12.6** |
| 4 | Jreis | −86.4 | +245.1 | +228.6 | **+129.1** |
| 5 | B8T3S | −206.7 | +130.3 | −101.3 | −59.2 |
| 6 | MarianSaar | −67.9 | +10.9 | −296.3 | −117.8 |
| 7 | mhagen | −218.2 | +9.1 | −184.6 | −131.2 |
| 8 | Richard2121 | −215.0 | +97.9 | +175.4 | +19.5 |
| 9 | Schmelley | −290.6 | +117.5 | −311.9 | −161.7 |
| 10 | Sadbru | −258.8 | +60.8 | −162.7 | −120.2 |

| year | tool beats | median owner Δ | Cory Δ |
|---|---|---|---|
| 2025 | **0 / 10** | −187.4 | −16.9 |
| 2024 | **8 / 10** | +49.4 | −58.0 |
| 2023 | 3 / 10 | −142.4 | −122.1 |
| pooled | **3 / 10** | −91.7 | −65.7 |

Realistic arm, pooled: beats 2/10, median −31.4, Cory −6.5.

The shape of the table is the finding: **the tool beats the league's bad
drafters and loses to its good ones.** Its three pooled wins are exactly
the bottom three of the skill ranking (§6: Jreis, cashworth, Richard2121
rank 8–10), and the owners who beat it hardest (ds7mmet, Schmelley,
mhagen, Sadbru, MarianSaar) include the ranking's top two. 2024 — the one
year the tool is above median — is also the year §6 shows the ROOM drafted
worst against its slots. And **2025 is a red flag: 0/10**, every owner's
real roster beat the tool's, Cory's seat being the tool's *closest* year
(−16.9). The 2025 board was the thinnest walk-forward board of the three
(biggest rookie class contribution: 85 rookies added by the layer in §4,
five invisible rookie picks in seat 2 alone) — which is exactly why the
rookie layer moves 2025 most.

**"Above-median, below-Cory" is TRUE for 2024 only.** The honest pooled
headline is: **below-median, below-Cory, above only the league's bottom
three drafters.**

Fixed-opponents caveat, per seat: every row is one alternative history in
which only that seat re-drafts; the ten rows cannot happen at once.

Side-finding, for the record: the NFL draft-picks store identified the
repo's one position-less pick — **2025 pick 64, pid 12530, is Travis
Hunter (WR, JAX, NFL pick 2), 49.8 pts, out after week 7.** The store now
gives him a position in the layered configs, and his rows stop being a
grading hole there (named in the artifact; the baseline keeps the original
exclusion so seat-1 parity with the committed replay is exact).

## 4. LAYER GRADES — against the §2d bar, no retuning

### 4a. Rookie prior — ~~CLEARS (bar 1), with its concentration named~~

> **⚠️ CORRECTED 2026-08-16 (later pass) — the table and claims immediately
> below THIS LINE never reproduced from the committed code; see §9. Struck
> through and kept, not deleted. The corrected verdict is FAILS (both
> bars), stated with real numbers in the box that follows.**

~~| year | Cory Δ baseline → layer | change | beats n | median Δ |~~
~~|---|---|---|---|---|~~
~~| 2025 | −16.9 → **+69.1** | **+86.0** | 0 → 4 | −187.4 → −116.3 |~~
~~| 2024 | −58.0 → −68.6 | **−10.6** | 8 → 7 | +49.4 → +38.0 |~~
~~| 2023 | −122.1 → −122.1 | 0.0 | 3 → 3 | unchanged |~~
~~| pooled | −65.7 → **−40.5** | **+25.1** | 3 → 3 | |~~

~~+25.1 = **38% of the pooled Cory gap — clears the preregistered 25% bar.**~~
~~Realistic arm agrees and adds league position: pooled Cory −6.5 → **+11.3**,~~
~~beats **2 → 4** owners (2025 realistic Cory cell: **+141.5**).~~ Honesty
bullets below are likewise struck where they depended on the false table
(the raw mechanics they describe — 85 rookies added, replacement shifting,
Travis Hunter becoming visible — are real; only the point estimates of how
much they moved the Cory gap were wrong):

> **THE TRUE, REPRODUCIBLE TABLE (fresh regeneration of the exact committed
> code, `python3 draft/tools/replay_all_seats.py`, deterministic — see §9):**
>
> | year | Cory Δ baseline → layer | change | beats n | median Δ |
> |---|---|---|---|---|
> | 2025 | −16.9 → **−1.5** | **+15.4** | 0 → 2 | −187.4 → −161.9 |
> | 2024 | −58.0 → −68.6 | **−10.6** | 8 → 7 | +49.4 → +38.0 |
> | 2023 | −122.1 → −122.1 | 0.0 | 3 → 3 | unchanged |
> | pooled | −65.65 → **−64.05** | **+1.6** | 3 → 3 | |
>
> +1.6 = **2.4% of the pooled Cory gap — FAILS the preregistered 25% bar**
> (needed ≥16.4 pts) **and FAILS bar 2** (pooled beats-n is 3 → 3 on the
> optimal arm, no seat-position lift; the same three owners — cashworth,
> Jreis, Richard2121 — are beaten baseline and layer alike). Realistic arm
> does NOT agree: pooled Cory −6.53 → **−13.43** (worse, not better; 2025
> realistic Cory cell **+67.4**, not +141.5). The realistic arm's beats-n
> does lift 2 → 4, which is real, but the preregistered bar (§2d) is
> defined on the OPTIMAL arm only, so this lift does not count toward
> clearing.

- **⚠️ CORRECTED:** the movement is still 2025-concentrated in DIRECTION,
  but the TRUE 2025 move is +15.4, not the originally-claimed +86.0 — the
  tool's rookie-layer Cory cell only climbs from −16.9 to −1.5 (still a
  tool LOSS, never crosses zero), not to the falsely-claimed +69.1. 2023 is
  a no-op for the reason originally given (the 2021–22 fit's cells are too
  cheap to out-VORP any veteran — top cell WR|1-10 at 176 but QB|1-10 at a
  3-row fallback of 70.9), and 2024 is slightly NEGATIVE for the reason
  originally given too — that part of the story reproduces exactly, unlike
  2025 (the tool drafted MHJ, Nabers and Odunze — rookies in: 592.6 actual
  pts; vets out: London/Allen/Godwin/Ekeler, 565.9 — but the swap converted
  to −10.6 in startable-lineup points). Pricing rookies at the capital base
  rate gets the tool INTO the rookie market without giving it Cory's 2024
  selection (his five rookie picks scored 1044) — true then, true now.
- Mechanically the 2025 move is part direct (rookies drafted), part
  indirect (85 added players shift replacement levels and pick cascades,
  and Travis Hunter becomes visible/gradeable) — the mechanism is real; its
  effect on the Cory gap was 5-6x smaller than originally reported.
- 30 seat-year cells, one policy: this is evidence of an opened structural
  hole (the tool can now see and draft rookies) that on THIS measurement
  does not translate into a closed performance gap — not a measured
  +25/season expectation for 2026, and not even a measured +1.6/season one;
  see §9 for why a point estimate this small shouldn't be over-read either.

**⚠️ CORRECTED — NOT "prepared, gated, NOT applied" as a §2d consequence,
because §2d's consequence (a clearing grade) never happened.** The diff
`draft/tools/apply_rookie_prior_own_model_2026.py` + the 2026-class store
`draft/backtest/nflverse_draft_picks_2026.json` still exist and still do
what they say (the live 2026 board's own-model column carries **0 of 153**
rookies; the market columns already price rookies; the diff fills
`proj_ownmodel` for the 71 NFL-drafted board rookies from the 2021–25-fit
prior, touches NO blend/VORP/rank field, refuses to run without Cory's
recorded approval) — but they are **not backed by a passing clearing
grade** and must not be presented to Cory as validated. Corrected framing
and options are in `DECISIONS-NEEDED.md`.

### 4b. Year-2 escalator — **FAILS its own bar, and the measurement says why**

| year | Cory Δ change | beats n | pooled |
|---|---|---|---|
| 2025 | −8.1 | 0 → 0 | |
| 2024 | 0.0 | 8 → 6 | |
| 2023 | 0.0 | 3 → 3 | |
| pooled | **−2.7** | 3 → 2 | realistic −3.0, beats 2 → 2 |

The measured progression distribution (the deliverable that survives the
layer): **the cohort-wide sophomore leap does not exist in this data.**
Ratio of year-2 to year-1 points, league scoring, cohort = NFL-drafted
skill players with ≥50 year-1 points:

| transition | QB | RB | WR | TE |
|---|---|---|---|---|
| 2021→22 | 1.17 (n=6) | 0.74 (n=8) | 1.00 (n=10) | 0.70 (n=2) |
| 2022→23 | 1.89 (n=2) | 1.39 (n=8) | 1.02 (n=10) | 0.74 (n=6) |
| 2023→24 | 1.05 (n=5) | 1.35 (n=6) | 0.99 (n=16) | 0.81 (n=5) |
| 2024→25 | 1.03 (n=5) | 0.45 (n=5) | 0.69 (n=12) | 1.16 (n=4) |

WR — the position the single-seat replay's Olave/Pickens story pointed at —
is ≈ 1.0 in three transitions and 0.69 in the fourth. **Cory's year-2 wins
were SELECTION, not cohort membership**, and §6 agrees from the other
side: the top-3 drafters' year-2 picks pooled NEGATIVE surplus (−82.8)
while the bottom half's were positive. A flat escalator cannot encode a
selection skill. Reported as measured; layer dead under its own prereg;
no diff prepared.

### 4c. Both layers — ~~negative interaction, named loudly~~ mostly just the escalator's own (already-failing) effect

**⚠️ CORRECTED 2026-08-16 (later pass) — the "both" numbers themselves are
verified UNCHANGED and true** (pooled optimal `both` = −1.11, matches a
fresh regeneration exactly; see §9) — **only the "rookie alone" side of
this comparison was wrong**, and correcting it mostly dissolves the
"negative interaction" finding rather than confirming it. Pooled optimal
`both` = −1.11 vs the TRUE rookie-alone = **+1.6** (not +25.1) — a gap of
only 2.7 points, not 26, and 2.7 is almost exactly the year-2 escalator's
own solo pooled effect (−2.71, §4b) — i.e. once the rookie layer's real
(tiny) effect is used, "both" reads as approximately "the escalator's
already-failing effect, present," not as a meaningful negative interaction
on top of a real rookie gain. 2025 in particular: **Cory 2025: +15.4
rookie-alone → +7.3 both** (not +86.0 → +7.3) — the escalator still
roughly halves the rookie layer's small 2025 move, but there isn't much
left to halve. Draft policies are cascades — layer grades DO NOT ADD — that
lesson still holds; it just isn't illustrated by a dramatic number anymore.
**Neither config clears; there is no "clearing combination."**

## 5. LAYER (c) — roster-status: verified, already priced live

Against the committed board (`public/draft_data.json`, built
2026-08-15T17:52:22Z): **677 players, 0 with a null team, 0 teamless
players carrying any projection**, 538 with a depth-chart slot,
`injury_status` populated. The claim stands: **the Brady-2023 pathology is
a walk-forward artifact, not a live defect — this edge is already priced
on the live board and nothing was built for it.** (Pinned by test so a
future board that regresses goes red:
`test_roster_status_verification_is_true_and_reproducible`.)

## 6. THE DRAFTER STUDY — who is actually good, and at what (addendum)

**Value-over-slot ranking, pooled 2023–25** (tool-independent; n stated;
adjacent ranks are inside noise — the group contrast is the quotable read):

| rank | owner | surplus (3yr) | per pick | n |
|---|---|---|---|---|
| 1 | **Schmelley** | +705.0 | +22.7 | 31 |
| 2 | **MarianSaar** | +548.7 | +17.7 | 31 |
| 3 | **coryjsimms** | +290.8 | +9.4 | 31 |
| 4 | ds7mmet | +78.9 | +2.6 | 31 |
| 5 | mhagen | −13.8 | −0.5 | 30 |
| 6 | Sadbru | −22.9 | −0.7 | 33 |
| 7 | B8T3S | −213.6 | −6.9 | 31 |
| 8 | Richard2121 | −233.3 | −7.8 | 30 |
| 9 | Jreis | −507.6 | −14.5 | 35 |
| 10 | cashworth | −632.6 | −19.2 | 33 |

Cory is a top-3 drafter and NOT the best — consistent with §3, where
ds7mmet/Schmelley/MarianSaar all beat the tool by more than he does.
(Per-year: Schmelley's +705 is spread across 2023/2025; Cory's +291 is
one huge 2024 (+481) against a negative 2025 (−202) — n=31 volatility,
said plainly.)

**What separates the top 3 — from the bottom half AND from the tool:**

| behavior | top 3 | bottom half | tool (baseline, replayed) |
|---|---|---|---|
| rookie rate | 17.2% | 8.7% | **0% — structural** |
| rookie surplus | +40.8 | −41.7 | n/a |
| late-round (101+) surplus | +38.5 | −35.7 | ≈ owner-level (42/93 hits vs owners' 41/93) |
| first QB round (mean) | 7.1 | 5.9 | earlier (VORP over-buys QB — known) |
| first TE round | 5.6 | 7.0 | — |
| year-2 rate / surplus | 16.2% / **−82.8** | 8.7% / +26.3 | — |
| keeper leverage | +4.5 | +105.8 | mirrored (excluded) |

Reads, with per-owner nuance the group means hide:

1. **Rookie drafting separates on BOTH tests** — the top 3 do it twice as
   often and profitably, the tool cannot do it at all → **the study
   CONFIRMS the rookie layer's priority** (and §4a shows the layer clears).
   Nuance: it is Cory (4/7 hits, +203) and Marian (4/6, +77) who win at
   rookies; Schmelley's rookie picks went 0/3, −157.7.
2. **Late-round hitting is Schmelley's edge** (#1 drafter: 5/9 late hits,
   +322.6 — that IS most of his +705), and the group contrast separates
   top-3 from bottom-half. But it does NOT separate from the tool: the
   tool's replayed late-round hit rate (42/93) already matches the
   owners' (41/93). A "late-round upside bias" layer is therefore the one
   NEW candidate this study surfaces, with honestly mixed evidence — if
   pursued it needs its own prereg cycle; NOT graded today (named per the
   addendum's scope rule).
3. **Later first QB** separates top-3 from bottom-half and from the tool —
   independent confirmation of the replay's raw-VORP-over-buys-QB
   mechanism (the onesie caps contain it; the timing preference is not
   yet encoded).
4. **Year-2 targeting is NOT a top-3 edge** (their year-2 surplus is
   negative) — the study kills the same narrative the escalator's
   measurement killed in §4b. Consistency from two independent directions.
5. **Keeper leverage doesn't separate the top 3** — bottom-half owners
   held better keeper value; drafting skill and keeper luck are different
   axes here.
6. **NOT computable, named:** ADP-deviation (reach/value-fall) behaviors —
   no committed 2023–25 market. Absent, not approximated.

**"Make sure model can do that or better" — graded, and the answer today
is NO.** The tool's pooled optimal deltas in the top-3 seats: Schmelley
−161.7, MarianSaar −117.8, Cory −65.7 baseline; ~~with the clearing rookie
layer −146.1 / −91.1 / −40.5 — better in all three chairs~~. **⚠️ CORRECTED
2026-08-16 (later pass):** with the rookie-prior config actually applied
(it does not clear — §4a/§9), the TRUE pooled optimal deltas are Schmelley
**−167.5** (worse, not better), MarianSaar **−91.1** (essentially
unchanged), Cory **−64.1** (barely moved) — **still behind all three
drafters, and not "better in all three chairs."** Nothing built today
closes the gap to the top 3 in any seat, including Cory's. That is the
honest state of Cory's bar.

## 7. What this licenses for the 22nd, and what it does not

- License: "the tool must get better to beat most of this league" — Cory's
  instinct is measured fact (§3). ~~The rookie hole is real, closable, and
  the ONE prepared diff (own-model rookie column, §4a) is on the queue.~~
  **⚠️ CORRECTED:** the rookie hole (0 rookies visible on the walk-forward
  board) is real and the diff still fills a real structural gap in the
  own-model column, but on the preregistered replay measurement it is NOT
  shown to close performance (§4a/§9 — the layer fails its own bar); "the
  rookie hole is closable" is not established by this doc's evidence. The
  live engine's market arm already carries most of what the replay's
  baseline lacks — nothing in §3's walk-forward numbers transfers to the
  2026 engine as-is (same §6 caveat as the single-seat replay).
- License: at the table, when Cory's read disagrees with the board on a
  ROOKIE, his measured record there (4/7 hits, +203 surplus) says take his
  read seriously; on a YEAR-2 trajectory player, the cohort data does NOT
  back an automatic escalation — his edge there, if any, is selection.
- Not licensed: any "the tool now beats the top drafters" claim (§6 grade:
  it does not, in any tested configuration), or quoting **the +25.1/CLEARS
  result at all — it does not reproduce and was a data-integrity error,
  corrected 2026-08-16 (later pass), see §9.** The true, reproducible
  rookie-prior effect (+1.6 pooled, 2.4% of the gap) fails the preregistered
  bar and licenses no 2026 expectation either.
- The shadow ledger (`draft/data/draft_shadow_2026.jsonl` machinery)
  captures his 2026 disagreements pick-by-pick — the systematic record his
  "should we identify what things I did better" asks for, growing at
  draft speed from the 22nd on.

## 8. Machinery, tests, honesty

- Tools (all new; `draft_replay_2025.py` imported, untouched):
  `draft/tools/replay_all_seats.py`, `rookie_prior.py`,
  `year2_escalator.py`, `drafter_skill.py`,
  `apply_rookie_prior_own_model_2026.py` (prepared, gated).
- Stores: `draft/backtest/nflverse_draft_picks.json` (2021–25, provenance,
  career columns dropped), `nflverse_draft_picks_2026.json` (2026 class,
  input to the prepared diff only).
- Artifact: `draft/data/replay_league_table.json` (`_territory` first;
  league tables, layer grades, measured distributions, drafter study,
  roster-status verification, honesty list).
- Tests (55 new checks): `draft/tests/test_replay_all_seats.py` (seat-1
  parity with the committed single-seat replay — exact, all years, both
  arms; league-table/pooled/layer-grade arithmetic identities; per-seat
  board legality + keeper coverage; drafter-study consistency +
  hand-recomputed 2024 round means; roster-status re-derivation;
  determinism; regeneration pin, `repo_parity`-marked and registered in
  `test_gate_selection.py`), `test_rookie_prior.py` (store
  period-correctness — career columns cannot survive; hand-computed cells,
  fallback and bust-zero fixtures; bucket boundaries; walk-forward guard;
  per-year leakage traces), `test_year2_escalator.py` (hand-computed
  ratio-of-sums, both clips, min-n, cohort floor; walk-forward guard;
  leakage traces; real-data pins).
- Honesty (full list carried in the artifact): thirty seat-year cells are
  thirty alternative histories of ONE policy family, not a distribution;
  per-seat fixed opponents; layer grades are non-additive (§4c); the
  drafter ranking is surplus = skill + luck at n≈31; prereg commit
  `a1ce5b43` precedes every grade in §3–§6.

## 9. FORENSICS — the "CLEARS" claim did not reproduce (audit correction, 2026-08-16, later pass)

**What was claimed, at commit `be3b2065`:** the rookie-capital-prior layer
closes the pooled optimal-arm Cory gap from −65.7 to −40.5 (`cory_gap_change:
+25.14`), "38% of the pooled Cory gap — clears the preregistered 25% bar,"
with a per-year table showing 2025 alone moving Cory's cell from −16.9 to
**+69.1**. This was the basis for §4a's CLEARS verdict, the "better in all
three chairs" line in §6, and `DECISIONS-NEEDED.md`'s ruling-ready framing
of the prepared own-model diff.

**What actually reproduces, checked by hand:** running
`python3 draft/tools/replay_all_seats.py` fresh — against the live tree,
against an isolated `git archive` export of `be3b2065` itself (so the
board/data state is exactly what was committed, with zero influence from
any later commit or any other in-progress worktree), and at three explicit
`PYTHONHASHSEED` values (111, 222, 333, in addition to the default) —
produces, **every single time, byte-identical**: pooled optimal
`cory_mean_delta_layer: -64.05`, `cory_gap_change: +1.6` (≈2.4% of the
gap). The 2025 Cory cell reproduces at **−1.46**, not +69.1. The `both`
config (rookie + year-2 escalator) and the `year2_escalator` config alone
both reproduce EXACTLY what was committed in every GRADED quantity —
seat deltas, league tables, layer grades — unchanged; only the
`rookie_prior`-alone configuration's 2025 numbers (and everything pooled
that flows from them) fail to reproduce. (One benign, score-irrelevant
side-note surfaced while checking this: the `baseline` config's
`projection_coverage` diagnostic — a raw player-pool-size count, not a
graded quantity — also runs 2-3 players higher on a fresh regeneration
than committed, uniformly across all three years and ALL FOUR configs
including the ones that otherwise reproduce exactly, and confirmed present
even in the isolated `be3b2065` archive. This is further, independent
evidence that the committed artifact does not match a byte-for-byte
regeneration of the committed code — but it demonstrably does not by
itself explain the score-affecting divergence, since `baseline`,
`year2_escalator`, and `both` all reproduce their graded deltas exactly
despite carrying the same 2-3-player pool difference.)

**The investigation.** Per the working hypothesis list (non-determinism,
an uncommitted intermediate state, or a genuine bug):

1. **Not non-determinism.** Every function on the path — `fit_rookie_prior`,
   `rookie_overlay`, `with_rookies`, `replacement_levels`, and
   `replay_draft`'s pick loop — is a pure function of committed, unchanging
   inputs. No `random`, no wall-clock, no `time.time()` anywhere on the
   path (checked by grep). The one place iteration order could plausibly
   matter, `replay_draft`'s BPA-by-VORP tie-break, explicitly breaks ties
   by `(-value, -proj, player_id)` — deterministic by construction, not by
   luck. Confirmed empirically too: identical output across three
   `PYTHONHASHSEED` values, which is exactly the value that would move a
   result if any `set()` iteration order were silently load-bearing (none
   is).
2. **Not a currently-live bug in `fit_rookie_prior`.** The fit is
   byte-identical between the committed artifact's `meta.fit.cells` and a
   fresh run's — same `fit_rows: 311`, same fit classes, same per-cell
   `mean_pts`/`n`/`fallback` for all 20 (pos, bucket) cells, checked field
   by field. The walk-forward guard (fit classes strictly `< replay_season`)
   is satisfied. `rookies_added: 85` is identical too. So the fit and the
   overlay's inputs are provably not the source.
3. **Not a currently-live bug in `rookie_overlay` / `with_rookies` /
   `config_boards`.** Cross-check: `rk` (the rookie-overlay dict) is the
   SAME object applied to both the `rookie_prior` config
   (`with_rookies(baseline, positions)`) and the `both` config
   (`with_rookies(esc, positions)`), in the same function, same run. The
   `both` config reproduces the committed artifact EXACTLY. If `rk` or
   `baseline` were being computed differently between the graded run and
   today, `both` (which uses the identical `rk` and a superset-derived
   `esc = dict(baseline)`) would almost certainly show it too, and it does
   not. `year2_escalator` alone reproduces exactly as well. Only the one
   configuration — rookie prior with NO escalation — diverges, and only
   for the 2025 replay year.
4. **Where the roster actually differs.** In the 2025 `rookie_prior`
   config, Cory's seat-1 tool roster committed one veteran, Keenan Allen
   (`sleeper_id 1479`); the fresh run drafts a different veteran, Brian
   Robinson Jr. (`sleeper_id 8154`) instead — a one-player swap, neither
   player a member of the rookie-overlay set (both predate the 2025
   class), that is enough to flip the seat from a large positive delta to
   a small negative one. Since every input object on that path
   (fit, overlay, baseline board, replacement levels) is proven identical
   by the checks above, this swap cannot come from anything in the
   currently-committed code running on currently-committed data.

**Conclusion — root cause not fully recoverable, and that is stated
plainly rather than papered over.** No commit exists between `0207e10b`
(the prereg) and `be3b2065` (the grade + doc + artifact, all landed
together in one commit) that could be diffed to show an intermediate
version of `rookie_prior.py` or `replay_all_seats.py` — the grading and
the final code were committed as one unit, so if the number that got
written into the doc came from a since-simplified or since-fixed
intermediate version of the "rookie prior alone" application path (the
most likely explanation given everything above proves the CURRENT code is
deterministic, current, and self-consistent across configs), that
intermediate version was never itself committed and left no trace to
recover. **Per this repo's standing house discipline (treat a fresh,
reproducible regeneration as ground truth when a committed artifact can't
be reconciled with the code that supposedly produced it — the same
discipline `test_artifact_matches_regeneration` exists to enforce), the
fresh regeneration is ground truth.** The true, current, reproducible
effect of the rookie-capital-prior layer as prereg'd and as currently
coded is **pooled optimal `cory_gap_change: +1.6` (2.4% of the gap)** —
it **FAILS** its own clearing bar (needed ≥25% / ≥16.4 pts, or a ≥2-seat
pooled league-position lift on the optimal arm; actual lift: 0 seats).

**This is flagged explicitly as a caught data-integrity issue, not
minimized.** A "CLEARS" claim — with a prepared, gated diff sitting in
`DECISIONS-NEEDED.md` under ship-it framing — was about to be presented to
Cory as a ruling-ready model improvement on evidence that does not exist.
It was caught before that ruling was requested, by the same discipline
(regenerate and diff against the committed artifact) this project applies
to every other crew's work; §4a, §4c, §6, §7, `DECISIONS-NEEDED.md`, and
`ROUTES.md` are corrected in place, dated, with the original false claims
struck through and kept rather than deleted, and `draft/data/replay_league_table.json`
is regenerated to the true, reproducible values (this correction pass does
not add a new test, because no code was found to be wrong — the existing
`test_replay_all_seats.py::test_artifact_matches_regeneration`, now
passing against the corrected artifact, is exactly the guard that would
catch this class of error recurring).
