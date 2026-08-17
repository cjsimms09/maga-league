<!-- TERRITORY: A -->
# SLEEPER vs FANTASYPROS vs own_v6 — 2026-08-16

**Cory's question, verbatim:** *"we still haven't answered why we're drafting are
using sleeper projections vs fantasy pros vs a blend of both..."*

**Preregistration:** `draft/backtest/SLEEPER-HIST-PROJ-PREREG.md`, committed
before the probe module existed and before anything was fetched. Commit order
is the proof.
**Probe:** `draft/backtest/sleeper_hist_proj.py` · **Workflow:**
`.github/workflows/sleeper-hist-proj.yml` · **Tests:** 33 in
`draft/tests/test_sleeper_hist_proj.py`, every gate two-armed.
**Runs:** `31977192941` and `31977423381` (the second adds printing only — no
threshold moved).

---

# THE HEADLINE, FIRST

## 1. THE BLOCKING CLAIM IS FALSE. Sleeper serves historical projections.

Three separate committed records asserted the same thing, and none of them had
ever asked the API:

| record | claim |
|---|---|
| `exp_fp_hist_proj.json` | *"Sleeper's own historical skill remains structurally unmeasurable until Jan 2027"* |
| `projection_skill_backtest_2026-08-15.md` | *"permanently unmeasurable"* |
| `SOURCE-WEIGHT-PRIOR-PREREG.md` §4 | *"NOT constructible offline"* → deferred to January 2027 |
| `proj_mean_blend_2026-08-16.md` §1 | *"never archived by anyone"* → the blend REFUSED at `no_control` |

`sleeper_import.fetch_projections(season)` has been season-parameterized the
whole time. Asked for 2023, 2024 and 2025, `/projections/nfl/regular/{season}`
answers:

| season | rows | with a stat line | **scored NONZERO under our frozen table** |
|---|---:|---:|---:|
| **2026** (positive control) | 9412 | 9412 | **635** |
| 2025 | 9289 | 8625 | **638** |
| 2024 | 9146 | 7571 | **684** |
| 2023 | 8970 | 6691 | **690** |

Floor was 50 rows and 50 scored-nonzero. Every season clears it by more than
tenfold. **The other two endpoint shapes return 7621 rows and 0 with stats for
every season** — the exact "well-formed payload, empty stat lines" trap
`_PROJECTION_PATHS` was written to catch, and the reason a single-shape probe
would have concluded the opposite.

**The 13g positive control passed** (2026, the live board's season, 635 scored
rows), so a null would have been about Sleeper rather than about the runner.
It was not a null.

**This does not make the earlier records dishonest — it makes them untested.**
Each said "unarchived" and each was reasoning about a *capture* we never made,
not about a *fetch* nobody attempted. The claim propagated through four
documents and gated a live decision (`REC-2`, and the blend Cory ordered) on a
premise no one had spent five seconds checking.

## 2. THE LEAK VERDICT: 2025 is CLEAN. 2023 and 2024 are REFUSED.

| season | verdict | first gate to fire |
|---|---|---|
| 2023 | **`leaked_markers`** | L4 |
| 2024 | **`leaked_markers`** | L4 |
| **2025** | **`clean`** | — every gate passed |

**No accuracy number is reported for 2023 or 2024**, and the rho cells computed
for L2 stay inside that gate rather than being promoted to `metrics`. A leaked
arm's number must never be readable as a grade.

## 3. THE ONE-SENTENCE ANSWER TO CORY

> **Keep `proj_mean` on Sleeper: on the only leak-free season we can measure,
> Sleeper is the best single source at all four positions — beating FantasyPros
> by 0.030 ρ at QB, 0.019 at RB, 0.004 at WR and 0.025 at TE, and beating own_v6
> everywhere — and while an equal-weight three-source blend edges it by
> 0.006–0.015 ρ at RB/WR/TE, that blend is never better and twice worse in the
> top-12/24 that a draft actually happens in, which is the opposite of a reason
> to change the board six days out.**

Full grade, its mechanism check and its failed prediction: §6.

---

# STEP 2 IN FULL — the leak diagnosis, adversarially

## L1 — IDENTITY. Is it a stat line wearing a projection's name? **NO.**

Fraction of graded players with realized ≥ 20 points whose projection lands
within 0.5 points of the outcome:

| season | eligible | matches | fraction | ceiling |
|---|---:|---:|---:|---:|
| 2023 | 350 | 3 | **0.0086** | 0.05 |
| 2024 | 327 | 4 | **0.0122** | 0.05 |
| 2025 | 335 | 3 | **0.0090** | 0.05 |

Three coincidental near-hits in 335 players is what an honest forecast looks
like. **A stat line relabelled as a projection would have read 1.0000.**

## L2 — RANK CEILING. Is the ordering too good to be a forecast? **NO.**

ρ(projection, realized) per position, on the graded population, under our
frozen table. **These are LEAK DIAGNOSTICS, not grades** — the shared-population
grade is §6's job.

| season | QB | RB | WR | TE |
|---|---:|---:|---:|---:|
| 2023 | 0.7960 | 0.8064 | 0.8189 | 0.7327 |
| 2024 | 0.8418 | 0.8242 | 0.8473 | 0.6765 |
| 2025 | 0.7941 | 0.7538 | 0.7724 | 0.8060 |

Ceiling 0.90 at WR and RB. Nothing came close. **For calibration**, FantasyPros'
genuine preseason numbers on the same table (`exp_fp_hist_proj.json`) sit at
0.75–0.79 for 2024/2025 — Sleeper lands in the same band, which is what two
honest preseason forecasts of the same season should look like.

**And the biases point the same way.** Sleeper's 2025 bias is **+22.11 QB,
+5.78 RB, +13.07 WR, −0.70 TE** — systematic *over*-projection, which is the
signature of a forecast that does not know who is going to get hurt. A
projection revised during the season would have a bias near zero, because by
December the injuries have already happened.

## L3 — PROVENANCE. **`no_timestamp` — UNDECIDABLE, and it blocks nothing.**

The payload carries **no** `date`, `updated_at`, `week`, `generated_at` or
`season_type` key in any of the three seasons. `keys_present: []`.

**This is entered as an absence, not as a negative finding** (13g). Had a
generation marker been present it would have named the date the numbers were
made, and that is precisely the evidence we do not have. The gate is silent and
the other four decide.

**But the census found something better than a timestamp, and it is the single
strongest piece of evidence in this document:**

    gp  2023: {18.0: 6659, 1.0: 32}
    gp  2024: {18.0: 7539, 1.0: 32}
    gp  2025: {18.0: 8593, 1.0: 32}

**Every offensive player in every season is projected for exactly 18 games.**
Not one row carries a reduced games count. A file revised during or after the
season would carry each player's *actual* availability; a preseason file cannot
know it and assumes everybody plays. (The 32 rows at `gp: 1.0` are the team
defenses, which Sleeper counts per-game.)

The payload also carries **`adp_half_ppr`, `adp_ppr`, `adp_std`, `adp_2qb`,
`adp_idp`** on every row. **ADP is a preseason quantity by construction** — it
is what a draft board looked like before the season. A post-hoc stat dump has
no reason to carry it.

## L4 — MARKERS. The gate that decided all three seasons, and the one I got wrong

The rule, fixed before the run: a player worth ≥ 200 points in season *y−1* who
realized ≤ 30 in season *y* must still be projected at full size (≥ 100) by a
genuine preseason file. Markers are derived from the committed stores, not
hand-picked.

### 2025 — PASS, and it is decisive

| player | pos | 2024 realized | 2025 realized | **2025 projection** | verdict |
|---|---|---:|---:|---:|---|
| James Conner (`4137`) | RB | 230.3 | **29.3** | **203.5** | full_season |
| Joe Mixon (`4018`) | RB | 219.2 | **0.0** | **117.9** | full_season |

**Sleeper's "2025" file projects 203.5 points for a player who scored 29.3, and
117.9 for a player who never played a down.** Both lost their seasons to
injury. A file that had been revised at any point after week 3 of 2025 could
not possibly still say that. **This is direct, positive proof that the 2025
numbers are preseason**, and it is worth more than any timestamp would have
been.

### 2023 and 2024 — REFUSED, and every marker is a false positive of my own gate

| season | player | pos | prior | realized | projection | verdict |
|---|---|---|---:|---:|---:|---|
| 2023 | Tom Brady (`167`) | QB | 312.3 | 0.0 | **absent** | missing |
| 2023 | Aaron Rodgers (`96`) | QB | 278.0 | 0.0 | **absent** | missing |
| 2023 | Nick Chubb (`4988`) | RB | 247.2 | 21.1 | **absent** | missing |
| 2023 | Marcus Mariota (`2307`) | QB | 226.56 | 1.24 | 21.56 | leak_sized |
| 2024 | Sam Howell (`8162`) | QB | 290.12 | −0.84 | 40.18 | leak_sized |
| 2024 | Joshua Dobbs (`4179`) | QB | 228.66 | 8.1 | 14.2 | leak_sized |

**Say plainly what these are.** Brady **retired** in February 2023 — a correct
preseason file does not project a retired player. Mariota signed with
Philadelphia as Jalen Hurts' **backup**; Howell was traded to Seattle behind
Geno Smith; Dobbs sat behind Sam Darnold in Minnesota. **A preseason projection
of 14–40 points for a backup quarterback is right, not leaked.**

**My preregistered gate has a false-positive mode I did not anticipate: it
cannot tell "his season died" from "he retired or lost his job."** The gate
fired exactly as written; the writing was wrong. Naming this is the point —
`proj_mean_blend_2026-08-16.md` §4 records the same lesson about its own bloc
veto, and this is the second instance.

**I have NOT relaxed the gate to rescue 2023 and 2024, and I will not.** Moving
a preregistered bar after watching it fail is the one thing this repo refuses,
and it is the only reason any number here can be believed. 2023 and 2024 stay
refused, un-graded, and reported as refused.

**And there is an independent reason not to want them anyway — see below.**

## L5 — GHOSTS. `not_applicable` for 2025

There is no store later than 2025 to establish departure from. Recorded as
not-applicable rather than as a pass. 2023 and 2024 never reached this gate.

---

# THE FINDING NOBODY ASKED FOR: Sleeper's archive is being hollowed out

Post-hoc, not preregistered, and reported as post-hoc. It falls straight out of
the row counts:

| season | rows | with a stat line | **empty stat lines** | **hollow %** |
|---|---:|---:|---:|---:|
| 2026 (live) | 9412 | 9412 | 0 | **0.0 %** |
| 2025 | 9289 | 8625 | 664 | **7.1 %** |
| 2024 | 9146 | 7571 | 1575 | **17.2 %** |
| 2023 | 8970 | 6691 | 2279 | **25.4 %** |

**Monotone in age.** A quarter of Sleeper's 2023 projection rows are hollow —
the row exists, the stat line is gone. That is exactly why Brady, Rodgers and
Chubb come back `missing`: they are not absent from the file, they are
*emptied* in it. Nick Chubb was unquestionably projected for ~250 points in
August 2023, and Sleeper no longer serves that number.

**So the older archives are not faithful snapshots**, and the honest reading is
that 2023 and 2024 fail for a reason more serious than my mis-specified marker
gate: **they are partial**. Whatever survives in them is a *survivor* sample,
and grading a survivor sample flatters it in a direction nobody can bound.

**This also bounds 2025.** At 7.1 % hollow, the 2025 grade is computed on a
population that excludes players Sleeper has since emptied — disproportionately
players who left the league. It is the same survivorship caveat
`exp_fp_hist_proj` carries and it is **not** eliminated by anything below. The
mitigation, which §6 applies, is a **shared population**: every arm is graded on
exactly the same players, so the filter cannot favour one source over another.

**The capture consequence, and it is urgent in the standing "free, accessible
now, unrecoverable later" sense.** Sleeper's 2026 file is 0 % hollow **today**
and will be ~7 % hollow next August and ~25 % hollow in 2029. `proj_series.json`
has been freezing 2026 daily since 2026-08-09, so 2026 is safe. **2023–2025 are
decaying in public and nothing is capturing them.** Cost: one fetch. See the
DECISIONS-NEEDED item.

---

# POST-HOC DIAGNOSTIC — is the season argument even honored? **YES**

If `/projections/nfl/regular/{season}` ignored its argument, every year would
grade identically and this whole exercise would be one number wearing three
dates. On the shared scored population:

| pair | shared players | identical projections | fraction |
|---|---:|---:|---:|
| 2023 vs 2024 | 546 | 6 | **0.0110** |
| 2024 vs 2025 | 510 | 6 | **0.0118** |
| 2023 vs 2025 | 425 | 4 | **0.0094** |

Around 1 % coincidental collision. The seasons are genuinely distinct files.
**This check gates nothing and it was added after step 1 came back positive —
it is labelled post-hoc because it can only ever REFUSE, never rescue.**

---

# WHAT THIS PROBE CANNOT SEE, STATED PLAINLY

- **It asked one endpoint family**, the one `sleeper_import` already calls. If
  a different Sleeper URL serves a *complete* 2023 archive, this probe cannot
  see it, and the hollowing finding would then be about this endpoint rather
  than about Sleeper.
- **`no_timestamp` means the file does not date itself.** The preseason case
  rests on `gp: 18` uniformly, ADP fields on every row, and the 2025 marker
  pair — strong, convergent, circumstantial. It is not a signed timestamp and
  it is not presented as one.
- **2025 is one season.** One clean season is not a stationary measurement of
  a source's skill, and nothing below should be read as one.
- **The marker gate is mis-specified** (above) and a better one needs a roster-
  status source to separate injury from retirement and demotion.

---

# §6 — STEP 3: THE THREE-WAY GRADE

**Preregistration:** `draft/backtest/SLEEPER-VS-FP-PREREG.md`, committed in its
own commit (`85e126dd`) before the grader existed and before any three-way
number existed. **Runner:** `draft/backtest/sleeper_vs_fp_grade.py`.
**Workflow:** `.github/workflows/sleeper-vs-fp-grade.yml`, run `31977945901`.
**Tests:** 16 in `draft/tests/test_sleeper_vs_fp_grade.py`.

**Both of `proj_mean_blend` §1's blockers are gone.** Sleeper's per-player 2025
is served and leak-gated clean (above); FantasyPros' per-player 2025 rows —
*"deliberately not retained… re-fetching is CI-only egress and is unreachable
from here"* — were re-fetched **from CI, which is where this runs.** §9.2 of
that document asked for exactly this.

**The re-fetch reproduces the committed FantasyPros run exactly:** 729 rows
parsed, **716 crosswalked to Sleeper pids**, 13 unmatched and excluded — the
same 729/716 the committed `exp_fp_hist_proj.json` recorded. Same URL, same
counts. The arm is not a new quantity wearing an old name.

## The population

| | |
|---|---:|
| Sleeper arm | 638 players |
| FantasyPros arm | 716 players (13 unmatched, **excluded and counted**) |
| own_v6 arm | 508 players |
| excluded — no position | 134 |
| excluded — no 2025 weekly row | 220 |
| **excluded — not in all three arms** | **174** |
| **SHARED POPULATION** | **354** — QB 54 · RB 86 · WR 136 · TE 78 |

The shared population is the primary denominator because it is the only one on
which "source X beats source Y" is one quantity. **The intersection is
expensive** — 354 of a union near 900 — and that is the honest price of removing
the coverage channel that `proj_mean_blend` §2 showed can move a board for
reasons that are not football.

## Spearman — the headline, because a draft board is an ordering

| arm | QB (54) | RB (86) | WR (136) | TE (78) |
|---|---:|---:|---:|---:|
| **sleeper** | **0.7782** | 0.7976 | 0.7319 | 0.7990 |
| fantasypros | 0.7487 | 0.7785 | 0.7278 | 0.7739 |
| own_v6 | 0.6932 | 0.7900 | 0.7244 | 0.7773 |
| blend_equal | 0.7636 | **0.8040** | **0.7470** | **0.8112** |
| blend_weighted | 0.7652 | 0.8007 | 0.7462 | 0.8105 |

**Sleeper is the best SINGLE source at all four positions.** Margins over
FantasyPros: **QB +0.0295, RB +0.0191, WR +0.0041, TE +0.0251**. Over own_v6:
+0.0850, +0.0076, +0.0075, +0.0217.

**Winners under the preregistered rule** (highest ρ; ties inside 0.01 are TIED
and are *not* broken by a metric chosen afterwards):

| pos | verdict | detail |
|---|---|---|
| QB | **sleeper, clear** | margin 0.0130 over the runner-up |
| RB | **TIED** | blend_equal / blend_weighted / sleeper all inside 0.01 |
| WR | **TIED** | blend_equal / blend_weighted; sleeper 0.0151 back |
| TE | **TIED** | blend_equal / blend_weighted; sleeper 0.0122 back |

## MAE and bias — and P4, confirmed

| arm | QB mae/bias | RB | WR | TE |
|---|---|---|---|---|
| sleeper | 62.69 / **+26.45** | 39.35 / +3.22 | **40.50** / **+13.63** | 23.24 / +1.25 |
| fantasypros | 68.49 / +22.63 | 40.57 / −2.74 | 35.43 / −3.14 | 22.26 / −10.68 |
| own_v6 | 75.97 / +13.24 | 40.50 / +1.17 | 35.65 / +8.39 | 24.78 / +1.97 |
| blend_equal | 63.07 / +20.77 | **38.89** / +0.55 | **35.20** / +6.29 | **21.39** / −2.49 |

**P4 HOLDS, and it is the first direct measurement of it.**
`proj_mean_blend` §2 could only infer sideways that *"the shipped source
over-projects WRs"* and called it *"indicative, not a measurement."* **It is now
measured: Sleeper's WR bias is +13.63 and its WR MAE is the worst of any arm.**
Sleeper orders WRs a hair better than FantasyPros and prices them materially
worse. **For ranking that does not matter; for dollar values it does**, and
that is a real, separable finding about the shipped board.

## Top-12 / 24 / 48 precision — where the disagreement is, and it decides this

The prereg fixed these as corroboration and said a disagreement with ρ must be
**reported as a disagreement**. There is one, and it points the other way.

| pos · N | sleeper | fantasypros | own_v6 | blend_equal | blend_weighted |
|---|---:|---:|---:|---:|---:|
| QB top12 | 0.5833 | 0.5833 | 0.5833 | 0.5833 | 0.5833 |
| QB top24 | **0.8333** | 0.7917 | 0.7917 | 0.8333 | 0.8333 |
| RB top12 | **0.8333** | 0.8333 | 0.7500 | 0.8333 | 0.8333 |
| RB top24 | 0.7083 | **0.7500** | 0.6667 | 0.7083 | 0.7083 |
| WR top12 | **0.4167** | 0.4167 | 0.3333 | 0.4167 | 0.4167 |
| WR top24 | **0.6250** | **0.6250** | 0.5417 | 0.5833 | 0.5833 |
| TE top12 | **0.5000** | **0.5000** | 0.4167 | 0.4167 | 0.4167 |
| TE top24 | 0.7917 | 0.7917 | 0.7500 | 0.7917 | 0.7917 |

**Sleeper is greater than or equal to the blend on top-12 AND top-24 at every
position, and strictly better in two cells** — WR top-24 (0.6250 vs 0.5833, one
player in 24) and TE top-12 (0.5000 vs 0.4167, one player in 12).

**So the blend's Spearman edge is bought in the tail.** ρ counts all 136 WRs
equally; a draft does not. **Where the picks actually happen, blending never
helps and twice hurts.** That is the finding that turns a marginal ρ into a
clear decision, and it is exactly the failure mode `proj_mean_blend` §4 named
about its own bar — *"the movement lives in a tail nobody drafts"* — appearing
this time in the metric rather than in the veto.

## THE MECHANISM CHECK — mandatory, and the blend win IS consistent with it

Per-position Pearson correlation of the arms' signed errors on the shared
population:

| pos | sleeper \| fantasypros | sleeper \| own_v6 | fantasypros \| own_v6 |
|---|---:|---:|---:|
| QB | **0.9295** | 0.6407 | 0.6461 |
| RB | **0.9744** | 0.8602 | 0.9019 |
| WR | **0.9384** | 0.8022 | 0.8911 |
| TE | **0.8700** | 0.7706 | 0.8249 |

**The two consensus products are 0.87–0.97 error-correlated** — an independent
confirmation, on realized 2025 outcomes rather than on 2026 rank agreement, of
`exp_proj_source.json`'s ρ = 0.9327 and `proj_mean_blend` §5's median 0.9439.
**Averaging Sleeper with FantasyPros is averaging a forecast with itself.**

**own_v6 is the only partially-independent arm** (0.64–0.86), and that is
where every point of the blend's gain comes from. The prereg required this be
stated explicitly if a blend won, so:

> **The blend wins at RB/WR/TE and loses at QB, and the pattern follows the
> diversification trade-off exactly.** Adding a partially-independent arm pays
> only when it is not much worse than the best arm. At **RB/WR/TE own_v6 is
> within 0.0076–0.0217 ρ of Sleeper** and its errors are 0.77–0.86 correlated —
> close in skill, different in error, so the average gains a little. At **QB
> own_v6 is 0.0850 ρ worse**, and there the average drags Sleeper down by
> 0.0146. **Nothing here contradicts the 0.94 regime; it confirms it.** The
> gain is not the mechanism Cory named ("averaging independent forecasts") firing
> between the two professional sources — between those two it does not fire at
> all. It is one different-in-kind model contributing diversification at three
> positions and costing it at the fourth.

**And the gain is at or inside the noise the prereg anticipated.** RB's +0.0064
is *inside* the 0.01 tie band the rule declares undecidable. WR's +0.0151 and
TE's +0.0122 clear it by less than the band's own width, **on one season, at
n = 136 and n = 78.** Set against a blend that is worse where the draft happens,
this is not a mechanism; it is a margin.

**Position weighting did not rescue it either** — the same finding
`proj_mean_blend` §5b reported. Cross-fit weights (2 folds, player holdout, so
no player is graded under a weight his own error helped choose) came out close
to flat: Sleeper 0.27–0.38, FantasyPros 0.28–0.39, own_v6 0.26–0.39. The
weighted blend beat the equal blend at QB only, and lost to it at RB/WR/TE.

## THE PREDICTIONS, SCORED

| | prediction | outcome |
|---|---|---|
| **P1** | Sleeper and FantasyPros within 0.05 ρ at every position | **HOLDS.** 0.0295 / 0.0191 / 0.0041 / 0.0251 |
| **P2** | no blend beats the better parent at more than one of four positions | **FAILS.** It beat at **three** (RB, WR, TE) |
| **P3** | own_v6 wins at most one position, likely RB or TE; loses QB | **HOLDS on the letter, and own_v6 won ZERO** — it is last at QB (0.6932) and third at every other position |
| **P4** | Sleeper's over-projection persists on the shared population | **HOLDS.** +26.45 QB, +3.22 RB, **+13.63 WR**, +1.25 TE |

**P2 is a failed prediction and is recorded as one.** I expected the 0.94
correlation regime to stop the blend outright; it did not, and the reason —
own_v6's genuine partial independence — is a fact I did not weigh properly
before the run. It changes the *explanation*, not the recommendation: the
top-12/24 evidence, not the ρ, is what decides this.

## THE LIMITATIONS, WHICH ARE LARGE

1. **ONE SEASON.** own_v6 exists only for 2025 (it needs two prior
   weekly-points stores and 2021/2022 do not exist) and Sleeper's 2023/2024 are
   refused upstream. **N = 1.** Nothing here is a stationary measurement of a
   source's skill, and the 0.004 ρ gap between Sleeper and FantasyPros at WR is
   not distinguishable from nothing.
2. **A 7.1 % hollow Sleeper file** means the shared population is easier than
   the true one by an amount nobody can bound. Identical for every arm, so it
   cannot flip the *comparison* — but it inflates every absolute number.
3. **354 of ~900 players.** The intersection is where the comparison is clean;
   it is not where a board lives. **Nothing here says what any source does with
   the 174 players the other two do not cover — and own_v6 covers no rookie at
   all** (`proj_mean_blend` §2).
4. **own_v6 is rebuilt, not imported**, from its committed helpers via
   `proj_mean_blend._probe_models` (that module's own reproduction check
   applies, including its note that `own_model_v2.board_ages()` reads the live
   board, so own_v6's graded population tracks the nightly rebuild).

## THE RECOMMENDATION — Cory rules, nothing shipped

**`proj_mean` stays Sleeper-only.** Not because the question was unanswerable —
it is answered now — but because **the answer is that the shipped source is
already the best single source at every position**, and the only thing that
beats it does so in a region nobody drafts while losing in the region everybody
does.

**Two things ARE worth his ruling, and both are in `DECISIONS-NEEDED.md`:**

1. **Capture Sleeper's 2023–2025 projection files now**, before they hollow
   further. Cost: one dispatch. They are decaying in public at roughly 7 points
   of hollowing per year and 2023 is already a quarter gone.
2. **Sleeper's WR level is +13.63 high and its WR MAE is the worst of any arm.**
   That is a *dollar* problem, not a *ranking* problem, and it is the first time
   it has been measured rather than inferred. It is not a six-days-out change.

---

# WHAT WAS NOT DONE

- **Nothing shipped.** No change to `proj_mean`, VORP, replacement, tiers,
  dollars, ordering or the board. `public/draft_data.json` untouched.
- **No threshold was moved after seeing a result.** The second run adds print
  statements and a post-hoc diagnostic; every gate constant is byte-identical
  and pinned to the preregistration by
  `test_the_thresholds_match_the_preregistration`.
- **2023 and 2024 were not graded**, despite believing their refusals are my
  gate's fault rather than Sleeper's.
- **The blend was not shipped on a 0.006–0.015 ρ edge**, and the tie band was
  not widened afterwards to make RB read as a blend win.
- **No pairwise two-source blend was added** to sharpen §6's mechanism story.
  It was not in the preregistration, it would have been chosen after seeing
  which explanation I wanted, and the three-way error correlations already
  carry the argument.
- `draft/build.py`, `draft/own_model_v*.py`, `draft/own_projections.py`,
  `draft/backtest/fetch_component_stats.py`, `draft/tools/fetch_historical_props.py`
  and `draft/tools/fetch_kalshi.py` were imported read-only and never edited.
