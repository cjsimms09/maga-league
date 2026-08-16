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

See §6 — it depends on the three-way grade, which **is now constructible for
2025 and is preregistered separately** (`SLEEPER-VS-FP-PREREG.md`).

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

# WHAT WAS NOT DONE

- **Nothing shipped.** No change to `proj_mean`, VORP, replacement, tiers,
  dollars, ordering or the board. `public/draft_data.json` untouched.
- **No threshold was moved after seeing a result.** The second run adds print
  statements and a post-hoc diagnostic; every gate constant is byte-identical
  and pinned to the preregistration by
  `test_the_thresholds_match_the_preregistration`.
- **2023 and 2024 were not graded**, despite believing their refusals are my
  gate's fault rather than Sleeper's.
- `draft/build.py`, `draft/own_model_v*.py`, `draft/own_projections.py`,
  `draft/backtest/fetch_component_stats.py`, `draft/tools/fetch_historical_props.py`
  and `draft/tools/fetch_kalshi.py` were imported read-only and never edited.
