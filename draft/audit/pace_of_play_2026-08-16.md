# PACE OF PLAY — VERDICT, 2026-08-16

**Preregistered:** `draft/audit/pace_of_play_prereg_2026-08-16.md` (+ AMENDMENT
1 and AMENDMENT 2 in that file), committed before the store, before the study
and before the arm. Commit order is the proof — `0e9585ca` → `74f60209` →
`223c7ea8` → `78d41ea0`.

---

## THE ANSWER, FIRST

**No, we had not studied pace. We have now, and it does not pay. NOTHING
CHANGES IN THE MODEL.**

The finding is more specific than "null", and the specific part is the useful
part:

> **What everybody means by "pace" — plays per game — DOES NOT CARRY YEAR TO
> YEAR.** Pooled year-over-year Spearman +0.062, 95% CI [−0.154, +0.265]. So it
> cannot help a draft board, which can only ever read last season.
>
> **What DOES carry is TEMPO — seconds per play.** +0.417 [+0.191, +0.602],
> stable across all four transitions, and MORE persistent than the week-1
> implied team total (+0.302) that the model already leans on.
>
> **Tempo is genuinely orthogonal** to implied team total: −0.140 [−0.358,
> +0.077]. The study's premise held. That was the one thing worth checking and
> it checked out.
>
> **And it still does not pay, because the chain breaks one link short of the
> draft.** Tempo buys plays *inside* a season (−0.461 [−0.614, −0.315]) and
> **cannot be resolved from zero across one** (−0.181 [−0.368, +0.014]). Last
> year's tempo does not tell you this year's snap count. That break is measured
> **without reading a single fantasy point.**

Graded anyway, against `own_v6` on its own cells: **bar not cleared**, and the
**negative control — the tilt with the sign reversed — beats `own_v6` on both
metrics at WR** while the registered sign does not. Under the preregistration
that makes the arm void at WR, not inverted.

**This is not a "too small to measure" null.** The tilt moves Rachaad White
−10.0, CeeDee Lamb +7.1, Mike Evans −7.1, Bucky Irving −5.4 points and reorders
**37 of the top 60 RBs, 49 of 60 WRs and 25 of 60 TEs**. It moves the board
substantially and buys nothing.

**One note for A that is not about pace:** the committed
`model_accuracy_v6.json` no longer equals a fresh regeneration of
`own_model_v6.py` (WR 33.63/0.7634 committed vs 33.44/0.7663 fresh). This is
**already caught** by this morning's freshness registry — I initially wrote that
nothing noticed it, and that was wrong; §7 carries the correction, the cause
(one player's position row), and what it does and does not mean.

---

## 1. Verifying Cory's premise — we had NOT studied pace

Checked before anything was built.

`own_model_v5.py` uses the word throughout, and what it names is

    E[team volume] = pace_lam · team_Y-1 + (1 − pace_lam) · league mean

(`:68-69`, applied `:456-459`) — a shrinkage coefficient on prior-season team
**target and rush-attempt volume**. In the shipped frozen `V5_CONFIG`
(`:273-281`):

| pos | `pace_lam` | effect |
|---|---|---|
| QB | `None` | volume mode `raw`; the term never executes |
| RB | `None` | volume mode `raw`; the term never executes |
| WR | `1.00` | share mode, λ=1 ⇒ **no regression at all** — team Y−1 volume at face value |
| TE | `0.50` | share mode, half-shrunk to the league mean |

The mandate's summary said "OFF at every position". Precisely: **inert at QB
and RB**, and at WR λ=1.00 means the shrinkage is a no-op. Either way it is
prior-season team volume, not a measure of how fast a team plays.
`own_model_v5.py:156` records that the only thing ever tested under the name was
*"the old NULL (pace, team WEEKLY scores from league history)"* — a league-score
proxy that failed. **`own_model_v6.py` contains the string `pace` zero times.**

**One thing already existed and is credited rather than re-invented:**
`draft/backtest/nflverse_pace.py` (**TERRITORY: C**) had the play filter and the
argument for it. Its own comment says why it never produced a number: *"the pbp
pull is egress-blocked from the sandbox so I cannot measure it."* **That is no
longer true** — `play_by_play_<year>.parquet` on the same nflverse GitHub
release host `fetch_component_stats.py` already uses returned HTTP 200 / 20.2 MB.
This study **imports C's `SCRIMMAGE`, `MIN_GAMES` and kneel/spike rule read-only
and never edits that file.**

## 2. The measure — `draft/backtest/team_pace_2021_2025.json`

`draft/backtest/fetch_team_pace.py`, 641 KB store, per team-season **and** per
team-week, 2021-2025 regular season.

**Neutral game script — the exclusion rule, and it was not invented for this
study.** A play is neutral iff `qtr ≤ 3` **and** `|score_differential| ≤ 7`
**and** `half_seconds_remaining > 120`. That is the repo's own written spec from
`draft/audits/value_frameworks_2026-08-13.md:141` — *"seconds/play in Q1–Q3,
within 7 points, >2 min left in half"* — written three days before this data was
reachable. **Adopting a definition that predates the data is the strongest
available protection against fitting the exclusion rule to the answer.** C's
laxer 14-point margin is computed too, as a declared robustness arm; neither is
tuned. The clock condition removes the two-minute drill and end-of-half
kneel/spike sequences **at the source**, not merely by play type.

**Seconds per play is snap-to-snap** and requires the two plays to be **adjacent
rows in the raw pbp** — nothing in between, no timeout, no `no_play` penalty, no
two-minute warning — with the gap in (0, 60]. Without adjacency the number is
"elapsed time over plays", which prices stoppages as tempo.

**The contamination is named in the store, not discovered later:** an
incompletion stops the clock, so pass-heavy offences post shorter gaps for
reasons that are not tempo. `neutral_sec_per_play_clockrunning` restricts to
pairs whose earlier play kept the clock running. Both are stored; **neither is
blended into the other.**

**Coverage:** 32/32 teams **measured** in all five seasons, 0 unmeasurable,
~11.7 k snap pairs per season (~366 per team-season), same 32 team codes
throughout (so the franchise-clustered bootstrap pairs franchises, not
relocations). Absent is never zero: a short team-season or a thin team-week
stores `status` + `basis` and `None`.

**Sanity, against reality rather than against itself:** raw 61.5 plays/game
league-mean; neutral tempo 31.8–35.8 s/play; KC fastest in 2024. And the design's
own prediction visible in the data — CHI ran the 4th-most RAW plays in 2024
(62.3) and the FEWEST neutral plays (25.6), because they trailed, not because
they were fast (their tempo is 6th-quickest). That is exactly the trap the
neutral filter exists to defuse.

**A defect the test found before the store shipped.** `is_neutral` was written
as `if abs(float(d)) > margin: return False`. `abs(nan) > 7` is **False**, so
every NaN row passed as **neutral** — a guard that exists and does not guard.
`score_differential` happens to be non-null in all five seasons so it never
fired; it would have shipped silently and gone off the day nflverse changed a
fill rule. Rewritten as an inclusion; the refetch reports `"unchanged"`, which is
the proof it never fired.

**And one measurement C could not make, made here.** `nflverse_pace.py` warns
about a denominator defect it could not test — a game sitting in
`plays_per_game`'s denominator but not its numerator. **It occurs zero times on
real pbp, 2021-2025.** C's caution was right to record and is now resolved.

## 3. THE GATE — is pace persistent? (this is the finding)

Pooled Spearman over 2021→22 … 2024→25, 32 franchises, **cluster-bootstrapped by
franchise** (10 000 draws) so a team's four transitions move together and the CI
is not narrowed by pretending they are 128 independent points.

| metric | pooled ρ | 95% CI | verdict |
|---|---|---|---|
| `neutral_plays_per_game` — **§5's registered feature** | **+0.062** | [−0.154, +0.265] | **NOT PERSISTENT** |
| `plays_per_game` (raw) | +0.141 | [−0.082, +0.357] | **NOT PERSISTENT** |
| `neutral_share` | +0.085 | [−0.130, +0.291] | NOT PERSISTENT |
| `lax_plays_per_game` (C's 14-pt rule) | +0.218 | [+0.007, +0.415] | weakly |
| `proe` | +0.292 | [+0.047, +0.521] | weakly |
| `neutral_pass_rate` | +0.362 | [+0.129, +0.571] | PERSISTENT |
| **`neutral_sec_per_play`** | **+0.417** | **[+0.191, +0.602]** | **PERSISTENT** |
| `neutral_sec_per_play_clockrunning` | +0.434 | [+0.231, +0.602] | PERSISTENT |
| *`implied_team_total_wk1`* — **CONTROL, not pace** | *+0.302* | *[+0.097, +0.492]* | *PERSISTENT* |

**The control is the reason the nulls above are worth anything** (SESSION-A 13f,
and its trigger: *when a result is an absence, state what the instrument would
have shown if the thing were present*). Same estimator, same 32 franchises, same
four transitions, on a quantity nobody disputes persists — and it comes back
clearly positive. **Tempo out-persists it.** The volume nulls are the
instrument's answer, not its silence.

**Per-transition, tempo is the only metric that is stable rather than merely
positive on average:** +0.42, +0.44, +0.33, +0.48. `neutral_plays_per_game`
flips sign (+0.11, −0.22, +0.29, +0.07).

**The registered expectation was half wrong and is recorded as such.** §3 said
neutral plays/game and seconds/play would both beat raw plays/game. Tempo did,
decisively; **neutral plays/game is the least persistent of the three** — below
the raw figure it was meant to improve on. §3 also pre-registered the reading for
that case ("evidence the neutral filter is destroying signal rather than noise");
the honest version is weaker, because both CIs include zero and +0.141 vs +0.062
is not resolvable at n = 32.

**Why volume does not persist and tempo does.** `neutral_plays_per_game` is
tempo × time-spent-in-a-close-game. The second factor is game competitiveness,
which turns over hard. Tempo is a coaching habit, and habits persist.

## 4. Is it orthogonal to the implied team total? — YES, and this part held

Prior-season pace against `FCS.implied_team_totals(Y, 1, 1)` — the week-1-only
window, the only slice the model may read. Pooled Pearson, same bootstrap.

| metric | pooled r | 95% CI | band |
|---|---|---|---|
| **`neutral_sec_per_play`** | **−0.140** | [−0.358, +0.077] | **SUBSTANTIALLY ORTHOGONAL** |
| `neutral_sec_per_play_clockrunning` | −0.110 | [−0.327, +0.100] | SUBSTANTIALLY ORTHOGONAL |
| `neutral_share` | +0.179 | [+0.036, +0.303] | SUBSTANTIALLY ORTHOGONAL |
| `neutral_pass_rate` | +0.190 | [−0.077, +0.413] | SUBSTANTIALLY ORTHOGONAL |
| `proe` | +0.266 | [+0.016, +0.486] | SUBSTANTIALLY ORTHOGONAL |
| `plays_per_game` | +0.314 | [+0.142, +0.487] | SUBSTANTIALLY ORTHOGONAL |
| `neutral_plays_per_game` | +0.329 | [+0.196, +0.442] | SUBSTANTIALLY ORTHOGONAL |
| `lax_plays_per_game` | +0.359 | [+0.189, +0.525] | SUBSTANTIALLY ORTHOGONAL |

**Every metric clears the |r| < 0.40 band.** Tempo is essentially uncorrelated
with the one component the model has that demonstrably earns its keep — its CI
straddles zero. The registered expectation was right on both counts: positive but
modest for volume, and **less** correlated for seconds-per-play than for
plays-per-game.

**So the premise of the study was correct.** Pace is not a restatement of "good
offences score more". It is a different thing. It is just not a *useful* different
thing, for the reason in §4b.

## 4b. THE LINK THAT ACTUALLY KILLS IT — and it needs no fantasy data

A draft board needs `tempo(Y−1) → opportunity(Y)`. Tempo persisting is
**necessary and not sufficient**: a perfectly persistent coaching habit that does
not move next year's snap count is a fact about coaches, not an edge.

| link | pooled r | 95% CI |
|---|---|---|
| tempo(Y) → `plays_per_game`(Y), **same season** | **−0.461** | [−0.614, −0.315] |
| tempo(Y) → `neutral_plays_per_game`(Y), same season | −0.174 | [−0.354, −0.013] |
| tempo(Y−1) → `plays_per_game`(Y), **next season** | **−0.181** | **[−0.368, +0.014]** |
| tempo(Y−1) → `neutral_plays_per_game`(Y), next season | **−0.114** | **[−0.304, +0.083]** |

Correctly signed throughout (fewer seconds ⇒ more plays). **Strong within a
season, and both forward links straddle zero.** The chain breaks at exactly the
link a draft consumes — and it breaks **before any fantasy point, player or
projection is read**, so nothing here could have been steered toward a result.

This section was not in the original prereg. It was added in AMENDMENT 1,
**committed before §5 ran**, precisely so it could not later be presented as a
consolation prize.

## 5. Graded against `own_v6` anyway — bar not cleared

`own_v6_pace{k}`: `own_v6` plus one term at RB/WR/TE, the structural analogue of
the Vegas tilt at `own_model_v5.py:482-483`:

    v *= 1 + k · (mean_sec − sec_prev[team]) / mean_sec

Inverted per AMENDMENT 1 (**the sign was registered before grading**): fewer
seconds = faster = more snaps ⇒ a fast team gets a positive tilt. QB untouched.

**No model file was edited.** The tilt is applied to the dict `comp_opinion`
returns, which is arithmetically identical to applying it inside v5's loop —
**pinned by test**, because that identity is the entire licence for not editing
v5.

**2025 fold (features 2023/2024, tempo 2024), best `k` of the declared grid
(`k = +1.00`):**

| pos | MAE `own_v6` → pace | gain | ρ `own_v6` → pace | gain |
|---|---|---|---|---|
| RB | 37.54 → 37.31 | **+0.23** | 0.7968 → 0.7977 | **+0.0009** |
| WR | 33.44 → **33.60** | **−0.16** | 0.7663 → 0.7665 | +0.0002 |
| TE | 23.33 → 23.23 | **+0.10** | 0.7987 → **0.7983** | **−0.0004** |

**BAR NOT CLEARED.** The bar, fixed in writing before any number existed and not
weakened: improve **both** metrics at **≥ 2** of RB/WR/TE and degrade **neither**
metric at **any**. Two degradations — WR MAE and TE Spearman. The gains that do
exist are ~0.6 % of MAE and +0.0009 of ρ.

**Ordering, reported separately from MAE** (today's start/sit work found the two
can rank arms differently, and ordering is what a draft board consumes):

| pos | ρ on the top-36 by our own projection | adjacent-rank pairs flipped vs `own_v6` |
|---|---|---|
| RB | 0.5493 → 0.5539 | 25 / 98 |
| WR | 0.0317 → 0.0355 | 49 / 150 |
| TE | 0.4597 → 0.4713 | 17 / 83 |

Ordering nudges up everywhere while MAE goes both ways — the same
metric-disagreement the start/sit study found. **It does not rescue the arm:** the
top-36 ρ gains are +0.005 to +0.012 against a WR baseline of 0.03, and the bar
was set on the committed cells, not chosen afterwards from whichever metric
looked kinder.

### The controls decide it

| pos | `own_v6` | **negative control** (k = −0.50) | positive control (Vegas) |
|---|---|---|---|
| RB | 37.54 / 0.7968 | 37.68 / 0.7972 | 37.83 / 0.7954 |
| WR | 33.44 / 0.7663 | **33.38 / 0.7681** | 33.69 / 0.7720 |
| TE | 23.33 / 0.7987 | 23.39 / 0.7989 | 23.40 / 0.7974 |

**The negative control — the same tilt with the sign reversed, i.e. SLOW teams
get the boost — beats `own_v6` on BOTH metrics at WR, and beats the registered
sign there too.** Under the preregistration that makes the arm **void at WR, not
inverted**: it is fitting something that is not tempo. The sign was registered in
advance specifically so this could be checked instead of rationalised.

**Positive control (SESSION-A 13f): the harness works.** Every cell moved. Its
limitation is stated rather than glossed: v5 **already** carries `vg = 0.50` at
RB and WR, so there the control **doubles** a tilt rather than adding one. **TE is
the clean case** — v5 chose `vg = 0.00` at TE, so the control genuinely *adds* the
Vegas tilt there, and it makes TE **worse on both metrics**, independently
reproducing v5's own preregistered choice of `vg = 0.00`. The instrument can
detect a real team-level effect and can distinguish a good tilt from a bad one.

### Two method facts, stated rather than buried

**(a) The registered selection fold does not exist.** §5 registered "`k` selected
on the 2024 grade, applied unchanged to 2025". A 2024 grade needs
`season_totals(2022)` → `nflverse_weekly_points_2022.json`. **Only 2023, 2024 and
2025 exist**, and that store sits under C's `nflverse*` prefix, so manufacturing
the missing year is out of this lane. **2025 is the only gradable fold in the
repo.** So the whole grid was graded and the verdict uses its **best** member —
an **in-sample optimum**, labelled as one everywhere it appears, never a
leak-free win. **That makes the test more conservative, not less:** the best `k`
in the declared grid still fails, so **no selection rule could have rescued it**.
A pass would have proved nothing without the missing fold, and would have been
reported that way. *(Recorded as AMENDMENT 2, before the arm ran.)*

**(b) The features ARE leak-free.** Every predictor reads 2023/2024 only; tempo
comes from 2024; `own_model_v2._assert_no_leak` enforces it and would raise. The
`before_season` refusal in `nflverse_pace.team_pace` encodes the same rule.

## 6. Where would it matter? — the draftable top of the board, materially

At the best-case `k`, within the top 60 at each position **by our own
projection**:

| pos | max \|Δ\| | median \|Δ\| | players changing rank in the top 60 |
|---|---|---|---|
| RB | **9.96 pts (6.3 %)** | 1.77 | **37 / 60** |
| WR | 7.14 pts (4.5 %) | 2.89 | **49 / 60** |
| TE | 3.07 pts (3.1 %) | 0.60 | 25 / 60 |

Largest movers — real, draftable players, not deep bench:

| player | pos, our rank | team tempo (2024) | `own_v6` → paced |
|---|---|---|---|
| Rachaad White | RB #21 | TB 35.77 (slowest) | 157.4 → **147.4** (−9.96) |
| Mike Evans | WR #19 | TB 35.77 | 159.2 → **152.0** (−7.14) |
| CeeDee Lamb | WR #3 | DAL 32.08 (4th fastest) | 216.0 → **223.1** (+7.12) |
| Xavier Worthy | WR #21 | KC 31.78 (fastest) | 155.8 → **162.1** (+6.33) |
| Kareem Hunt | RB #36 | KC 31.78 | 107.3 → **113.2** (+5.93) |
| Bucky Irving | RB #6 | TB 35.77 | 227.5 → **222.1** (−5.37) |
| Cade Otton | TE #15 | TB 35.77 | 100.8 → **97.7** (−3.07) |

**So this is emphatically not "an effect too small to see".** Adding tempo would
move a first-round WR by seven points, cut a top-6 RB, and reorder most of the
draftable pool at two positions — **and buy nothing measurable.** That is a much
more useful answer than "no signal detected", and it is the reason not to ship
it: the change is large, legible, and unearned.

## 7. NOT ABOUT PACE — a note on `model_accuracy_v6.json`, corrected

**I first wrote that the committed `model_accuracy_v6.json` had drifted from its
own code "and nothing in the suite notices". THE SECOND HALF WAS WRONG, and it is
corrected here rather than quietly dropped.**

The drift is real:

| cell | committed artifact | fresh regeneration of the unmodified file |
|---|---|---|
| WR | n = 150, MAE 33.63, ρ 0.7634 | **n = 151, MAE 33.44, ρ 0.7663** |
| QB / RB / TE | 72.29 / 37.54 / 23.33 | identical |

**But it is already instrumented.** `draft/data/artifact_registry.json` +
`draft/tools/check_artifact_freshness.py` — this morning's permanent fix — cover
`own_model_v6` explicitly. Running it reports **10 of 11 registered artifacts
STALE**, `own_model_v6` among them, naming this exact WR diff. It is
informational and never blocks, by design, and its own footer says so: *"STALE is
expected and does not indicate a defect — it means the board/inputs moved since
the artifact was committed."* I had checked `repo_parity` (7 tests, none covering
v6) and stopped there, which is the same "I checked one instrument and concluded
the thing is unwatched" error SESSION-A 13g names. **The infrastructure works and
was already doing its job.**

**What this study adds is the CAUSE, which the checker reports a diff for but
cannot explain:** exactly one player — pid `8253` — gained a `WR` classification
in `draft/data/player_positions.json` since the artifact was built, and he has a
2025 actual of 4.7 points. That single row is the whole WR delta. Documented
board-input drift, not a hand-edit.

**The one thing worth carrying forward** — a judgement, not a defect, and not
this study's to make six days from the draft: `own_v6`'s **promotion-decision
numbers** (WR 33.63 / 0.7634) are no longer the numbers its code produces today
(33.44 / 0.7663). Both clear REC-3, so the ruling is not in question; but anyone
quoting a v6 cell should quote it from a regeneration or from the artifact
knowingly, not interchangeably.

**Both new artifacts from this study are registered** in that registry
(`pace_study`, `pace_arm`), per its `_pattern`'s instruction to add an entry
rather than a bespoke `test_X_matches_regeneration` + `repo_parity` marker.
Writing the bespoke marked test first — and having `test_gate_selection.py`
correctly refuse it — is how I found the registry. That guard worked exactly as
designed.

Every delta in §5 is computed **within one run on identical inputs**, so none of
this touches the result.

## 8. Multiplicity and honest limits

- **Eight pace metrics were screened** for persistence; two cleared; one was
  graded. Every §5 number is the survivor of that screen. **The screen reads no
  fantasy outcome** — it is pace against pace — so it cannot inflate the outcome
  test, but it is real multiplicity and is priced here in words.
- **`k` is an in-sample optimum, not a selected constant** (§5a). Legitimate
  only because it FAILED.
- **2025 has now been read by v4, v5, v6 and this arm** — a fourth read of the
  same season. The January 2027 grade of the frozen 2026 `proj_series` remains
  the first evaluation no candidate has touched.
- **n = 32 teams, 4 transitions.** Every CI here is wide and is shown wide.
- **Team-week pace is in the store and was NOT used.** A season-total projector
  consumes a season-grain feature; a weekly pace arm is a different study, and
  §4b's forward break is a season-grain result that says nothing about it.
- **The start/sit finding that motivated this** (`own_v6_notilt` last everywhere)
  was **relayed to me, not verified by me** — that artifact is not on this
  branch. It is treated as a stated premise throughout, and nothing in this
  verdict depends on it.

## 9. What I could not do

- **Build a second grading fold.** The repo has weekly-points stores for 2023-25
  only. Everything about leak-free constant selection here is limited by that
  one missing file, and it is C-named.
- **Test a weekly pace arm.** The store supports it (per-team-week rows,
  ~500 measured team-weeks a season); the projector this study grades against is
  season-total, so there was nothing to grade it in.
- **Verify the start/sit study** (§8).
- **Regenerate the stale artifacts in §7.** Diagnosed, not regenerated — which
  of `own_model_v2`-`v6`'s committed cells should be refreshed six days before a
  draft is A's call, not a side effect of a pace study.

## 10. Consequence

**None. No diff is prepared and no `DECISIONS-NEEDED.md` item is raised**, because
the preregistration says a prepared diff follows only a **real, CI-clear result**,
and this is a null with a void control. Nothing in `own_model_v*.py`,
`build.py`, `own_projections.py`, `vorp.py`, `projections.py`,
`fetch_component_stats.py` or any workflow was touched.

**What is kept:** `draft/backtest/team_pace_2021_2025.json` is a clean, covered,
leak-guarded store with 23 tests behind it (66 across the three new files). If a
future weekly arm, a game-script
model, or an in-season usage tool wants tempo, it is measured and it is there —
and the answer to *"is pace worth adding to the draft board"* is now on the record
with a number instead of a guess.
