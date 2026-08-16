# PACE OF PLAY — PREREGISTRATION, 2026-08-16

**This file is committed BEFORE any result exists.** Commit order is the proof.
The verdict lands separately in `draft/audit/pace_of_play_2026-08-16.md`.
Precedents for this shape: `draft/audit/pairing_claim_prereg_2026-08-12.md`,
`draft/audit/advanced_metrics_study_2026-08-16.md`,
`draft/audit/edge_hunt_2026-08-16.md`.

## 0. Cory's question and what triggered it

Cory, 2026-08-16: *have we studied pace of play?* The word appears throughout
`own_model_v5.py`, so the honest answer needs checking rather than asserting.

**Checked, and the answer is NO.** What v5 calls "pace" is

    E[team volume] = pace_lam · team_Y-1 + (1 − pace_lam) · league mean

(`own_model_v5.py:68-69`, applied at `:456-459`) — regression-to-the-mean on
prior-season team TARGET and RUSH-ATTEMPT volume. That is a shrinkage
coefficient on volume, not a measure of how fast a team plays. In the shipped
frozen config (`V5_CONFIG`, `own_model_v5.py:273-281`) it is:

| pos | `pace_lam` | what that means |
|---|---|---|
| QB | `None` | volume mode is `raw`; the term never executes |
| RB | `None` | volume mode is `raw`; the term never executes |
| WR | `1.00` | share mode, but λ=1 ⇒ **no regression at all** — team Y−1 volume at face value |
| TE | `0.50` | share mode, half-shrunk toward the league mean |

So the term is inert at two positions and, where it is live, it is prior-season
team volume — not seconds per play, not plays per game, not pass rate over
expected. And `own_model_v5.py:156` records that the only thing ever tested
under the name was *"the old NULL (pace, team WEEKLY scores from league
history)"* — a proxy built from our own league's weekly scores, which failed.
**`own_model_v6.py` contains the string `pace` zero times.** Real pace has never
been measured in this repo.

One thing DOES exist and is named here so this study is not mistaken for a
first: `draft/backtest/nflverse_pace.py` (**TERRITORY: C**, committed) computes
plays/game and neutral-script volume from play-by-play. Its own comment says why
it has never produced a number: *"the pbp pull is egress-blocked from the sandbox
so I cannot measure it."* **That claim is now false** — `play_by_play_<year>.parquet`
on the same nflverse GitHub release host `fetch_component_stats.py` already uses
returned HTTP 200 / 20.2 MB for 2021 and 200 for 2022-2025, measured before this
file was written. This study imports C's module read-only rather than
reimplementing its play filter, and never edits it.

## 1. Why the question is worth an evening

The 2026-08-16 start/sit study (reported to me in the build brief; **the artifact
is not on this branch and I have not verified it — treated as a stated premise,
not as evidence I checked**) found the **Vegas tilt is the only component of the
model that demonstrably earns its keep on decisions**: `own_v6_notilt` last
everywhere, the only jackknife-stable contrast. That tilt is
`fetch_component_stats.implied_team_totals` — `home = total/2 + spread/2` — wired
into `own_model_v5.py:482-483` as
`v *= 1 + vg·(implied[team] − mean_implied)/mean_implied`.

Implied team total answers **how many points** a team will score. Pace answers
**how many chances** its players get. Two teams with identical implied totals can
differ by ~10 offensive plays a game. **That orthogonality is the hypothesis of
this study, not its assumption** — §4 tests it and a failure there is a
publishable null.

## 2. The measure — every definition fixed here, before any number is computed

Source: `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{year}.parquet`,
seasons **2021-2025**, `season_type == "REG"` only.

**Play universe.** `play_type ∈ {pass, run}`, minus `qb_kneel` and `qb_spike`
(both by play_type and by the truthy flag — belt and braces, matching
`nflverse_pace.SCRIMMAGE` and its kneel/spike filter, which this study imports
rather than re-writes). Team is **`posteam`**, the offence, never `home_team`.
Rationale is C's and is not re-argued: punts/kickoffs/FGs/XPs/`no_play` penalty
rows rank offences by how often they kicked and got flagged; kneels reward
exactly the offences that stopped playing.

**NEUTRAL GAME SCRIPT — the exclusion rule, declared and defended.** A play is
neutral iff **all three** hold:

1. `qtr <= 3` — the fourth quarter is where score and clock, not identity,
   choose the play;
2. `abs(score_differential) <= 7` — one score;
3. `half_seconds_remaining > 120` — outside the two-minute drill in either half,
   which also removes end-of-half kneel/spike/clock-kill sequences at the source
   rather than only by play type.

**This is not invented for this study.** It is the repo's own written spec:
`draft/audits/value_frameworks_2026-08-13.md:141` specifies *"seconds/play in
Q1–Q3, within 7 points, >2 min left in half"* and estimates ≈5 sec/play ⇒ ≈15
more plays/game. Adopting a definition written down three days before any of this
data was reachable is the strongest available protection against fitting the
exclusion rule to the answer. `nflverse_pace.py` uses a laxer 14-point margin
with no quarter or clock condition; **both are computed and reported**, the
7-point/Q1-3/>2min rule as PRIMARY and C's 14-point rule as a robustness arm.
Neither is tuned.

**Metrics, per team-season and per team-week** (team-week only where the
denominator supports it; a team-week with fewer than 10 qualifying neutral plays
reports a status, not a number):

| key | definition |
|---|---|
| `plays_per_game` | raw scrimmage plays ÷ games — reported but **contaminated by game script on purpose**, as the honest baseline the neutral figures must be read against |
| `neutral_plays_per_game` | neutral scrimmage plays ÷ games |
| `neutral_sec_per_play` | mean snap-to-snap seconds, defined below |
| `neutral_pass_rate` | neutral pass plays ÷ neutral plays |
| `proe` | mean `pass_oe` over neutral plays ÷ 100. Verified in the real schema: `pass_oe == 100·(pass − xpass)` exactly, and `xpass` is populated for 33,335 of 33,470 REG scrimmage rows in 2024 |
| `neutral_share` | neutral plays ÷ raw plays — **the gap is itself the quantity**: a low share means the raw figure was mostly garbage time |

**`neutral_sec_per_play`, exactly.** Rows are taken in pbp order within a game.
A pair (i−1, i) contributes one observation iff: they are **adjacent rows in the
raw play-by-play** (nothing at all in between — no timeout row, no `no_play`
penalty, no two-minute warning, no change of possession); same `game_id`, same
`fixed_drive`, same `posteam`, same `qtr`; **both** plays neutral by the rule
above; and the gap `game_seconds_remaining[i−1] − game_seconds_remaining[i]`
lies in **(0, 60]**. The adjacency requirement is what makes this snap-to-snap
rather than "elapsed time divided by plays". The (0,60] window is declared, not
tuned: a gap over a minute is a stoppage, not a pace observation.

**The known contamination, stated before the numbers so it cannot be discovered
conveniently later.** An incompletion stops the clock, so pass-heavy offences
post shorter snap-to-snap gaps for reasons that are not tempo. A second variant
`neutral_sec_per_play_clockrunning` restricts to pairs whose EARLIER play kept
the clock running (no `incomplete_pass`, `interception`, `fumble_lost`,
`penalty`, `sp`, `out_of_bounds`, `timeout`). Both are reported; neither is
blended into the other.

**Absent is not zero, throughout.** A team-season below `MIN_GAMES = 4` reports
`status: "unmeasurable"` with a `basis` string and `None` values. Every store
carries a coverage report.

**Leakage.** The store is descriptive and holds every season. Every CONSUMER in
§5-§6 takes pace strictly from season Y−1 to predict season Y, and reuses
`nflverse_pace.team_pace`'s `before_season` refusal, which raises on any season
not strictly before the drafted one.

## 3. GATE — is pace persistent year over year? (answered first; may end the study)

At draft time all we have is last year. If pace(Y) does not predict pace(Y+1),
pace is useless for a draft board no matter how well it explains past outcomes.

**Measured:** for each transition 2021→2022, 2022→2023, 2023→2024, 2024→2025,
the Pearson **and** Spearman correlation across the 32 teams of each metric in
§2. Reported per transition with a Fisher-z 95% CI (n=32), plus a pooled
estimate (mean Fisher-z) with a 95% CI from a **cluster bootstrap resampling
franchises**, 10,000 draws, so the four transitions of one franchise move
together and the CI is not narrowed by treating them as independent.

**Preregistered decision rule:**

- **NOT PERSISTENT** — pooled Spearman 95% CI includes 0 ⇒ **the study STOPS
  here and that is the finding.** §4-§6 are not run and no diff is prepared.
- **WEAKLY PERSISTENT** — CI excludes 0 but the point estimate is < 0.30. The
  study continues, and every downstream result is read against the fact that
  last year's pace explains under a tenth of next year's variance.
- **PERSISTENT** — CI excludes 0 and the point estimate is ≥ 0.30.

Registered before looking: I expect `neutral_plays_per_game` and
`neutral_sec_per_play` to be **more** persistent than `plays_per_game`, because
the raw figure carries a team's win/loss script and that turns over. If the raw
figure is the MORE persistent one, that is evidence the neutral filter is
destroying signal rather than noise, and it will be reported as such.

## 4. Is it orthogonal to the implied team total we already use?

For each target season Y ∈ {2022, 2023, 2024, 2025}: pace from Y−1 against
`FCS.implied_team_totals(Y, 1, 1)` — the week-1-only window, the only slice the
model is allowed to read — across teams present in both. Pearson and Spearman,
per season and pooled by the same cluster bootstrap.

**Preregistered bands, fixed now:**

- **|r| ≥ 0.70** — pace is largely a restatement of "good offences score more";
  it adds little over the tilt already in the model, and that is a real finding.
- **0.40 ≤ |r| < 0.70** — substantial overlap; any §5 gain must be shown to
  survive alongside the Vegas tilt rather than instead of it.
- **|r| < 0.40** — substantially orthogonal; the premise of the study holds.

Sign is registered too: I expect **positive but modest** — better offences run
somewhat more neutral plays because they sustain drives — and I expect
`neutral_sec_per_play` to be **less** correlated with implied total than
`neutral_plays_per_game`, because seconds-per-play is a coaching choice and
plays-per-game is partly an outcome.

## 5. Does it beat `own_v6`, leak-free? (the real test)

**The arm.** `own_v6_pace{k}` — `own_v6` with ONE added term, built as the exact
structural analogue of the tilt that already earns its keep
(`own_model_v5.py:482-483`):

    v *= 1 + k · (pace_prev[team] − mean_pace) / mean_pace

applied to the v5 component opinion at **RB, WR and TE only** (QB is v4's arm in
v6 and the mandate names the volume-dependent positions). `team` is the same
`f["team"]` field the Vegas tilt uses — season Y−1 assignment. `pace_prev` is
`neutral_plays_per_game` from season Y−1.

**Implementation is non-invasive.** `own_model_v5.py`, `own_model_v6.py`,
`fetch_component_stats.py`, `build.py`, `own_projections.py`, `vorp.py`,
`projections.py` and `draft/tools/fetch_*.py` are **imported read-only and never
edited.** Because the tilt is the last multiplicative step before a `max(0, ·)`
clamp on a non-negative quantity, applying it to the returned `comp_opinion`
dict is arithmetically identical to applying it inside the loop — asserted by a
test, not assumed.

**Leak-free protocol, fixed now.** `k` is SELECTED on the 2024 grade (features
from 2022/2023, outcomes from 2024, pace from 2023) and applied **unchanged** to
the 2025 grade (features 2023/2024, pace 2024). Season 2025 is never consulted
to choose anything. Grid, declared: `k ∈ {0.25, 0.50, 0.75, 1.00}`, selected by
minimum summed MAE across RB/WR/TE on 2024, ties broken by mean Spearman.

**Negative control:** `k = −0.50` is graded on both seasons. If the negative
control wins, the instrument is measuring something that is not pace and the
result is void, not inverted.

**Positive control (SESSION-A clause 13f — a null must first be shown capable of
producing anything else).** The identical harness is run with the pace term
replaced by the KNOWN-GOOD Vegas tilt at the same magnitude. If that substitution
does not move the cells, the harness cannot detect a real effect and no null it
reports is evidence about pace.

**Grading.** `model_accuracy_v6.json`'s exact cells — same graded season, same
shared population, same denominators (QB 58 / RB 99 / WR 150 / TE 84), Spearman
and MAE per position, so the numbers are directly comparable to every committed
artifact.

**ORDERING IS REPORTED SEPARATELY FROM MAE.** Today's start/sit study found MAE
and decision quality can rank arms differently, and ordering is what a draft
board consumes. Beyond per-position Spearman I report, per position: Spearman
restricted to the **top 36 by our own projection** (the draftable range), and
the count of adjacent-rank pairs whose order flips versus `own_v6`.

**Preregistered success bar — fixed now so it cannot move:**

> Pace ADDS iff, on the untouched 2025 grade, `own_v6_pace{k}` improves **both**
> MAE and Spearman at **at least two** of RB/WR/TE **and degrades neither metric
> at any of the three**. Anything short of that is a **NULL** and is published
> as one.

Even on a pass, **nothing in the model changes unilaterally.** A pass produces a
`DECISIONS-NEEDED.md` item describing a prepared diff. **Cory rules.**

## 6. Where would it actually matter?

Only if §5 passes. Applied to the live 2026 board: the players whose projection
moves most, restricted to the **top 150 by ADP** — a pace effect that only
reorders players nobody drafts is not useful, and will be said in those words.

## 7. What would make me report a null

- pooled persistence CI includes 0 (§3) — study stops;
- |r| with implied total ≥ 0.70 (§4) — pace is a restatement;
- the §5 bar is not cleared on 2025;
- the negative control wins;
- the positive control fails to move the cells (then nothing is reported as
  evidence about pace at all — it is reported as an instrument failure).

**Honest nulls are expected and publishable.** EPA/air-yards/CPOE, the variance
tilt, the rookie prior, the props arm and every roster archetype came back null
on 2026-08-16 and were published clean. A pace null is a perfectly good outcome
and no finding will be manufactured.

## 8. Named limits, declared before the run

- 32 teams × 4 transitions is a small n; every CI here is wide and will be shown
  wide rather than described as tight.
- Franchise identity is the bootstrap cluster; relocations/renames inside
  2021-2025 (none expected in this window) would break that and will be checked
  against the actual team codes present.
- The 2025 grade has now been read by v4, v5 and v6 in this lineage. This arm is
  a fourth read of the same season. That is stated in the verdict too.
- Team-week pace exists in the store but is NOT used by §5 — a season-total
  projector consumes a season-grain feature, and a weekly arm is a different
  study.

---

# AMENDMENT 1 — 2026-08-16, written AFTER §3/§4 and BEFORE §5 is run

Appended, never rewritten (the no-delete habit). Everything above stands as
written; this records a departure from its letter and why, before the grading
step it changes.

## What the gate did

§3 ran and **split the family**, which §3 as written did not anticipate:

| metric | pooled Spearman, CI | verdict |
|---|---|---|
| `neutral_plays_per_game` — **§5's preregistered feature** | +0.062 [−0.154, +0.265] | **NOT PERSISTENT** |
| `plays_per_game` (raw) | +0.141 [−0.082, +0.357] | NOT PERSISTENT |
| `neutral_share` | +0.085 [−0.130, +0.291] | NOT PERSISTENT |
| `lax_plays_per_game` | +0.218 [+0.007, +0.415] | weakly |
| `proe` | +0.292 [+0.047, +0.521] | weakly |
| `neutral_pass_rate` | +0.362 [+0.129, +0.571] | PERSISTENT |
| **`neutral_sec_per_play`** | **+0.417 [+0.191, +0.602]** | **PERSISTENT** |
| `neutral_sec_per_play_clockrunning` | +0.434 [+0.231, +0.602] | PERSISTENT |
| *`implied_team_total_wk1` (CONTROL, not pace)* | *+0.302 [+0.097, +0.492]* | *PERSISTENT* |

**The registered expectation was half wrong and it is recorded as such.** §3
said *"I expect `neutral_plays_per_game` and `neutral_sec_per_play` to be MORE
persistent than `plays_per_game`"*. Seconds-per-play, yes, decisively.
Neutral plays per game is the LEAST persistent of the three — below the raw
figure it was supposed to improve on. §3 also registered the reading to apply
in that case (*"evidence the neutral filter is destroying signal rather than
noise"*); the honest version is weaker than that, because both CIs include zero
and the difference between +0.141 and +0.062 is not resolvable at n=32.

## The substitution, and why it is not a free second look

**§5's preregistered feature failed the gate, so the §5 arm as written is dead
and is not run.** In its place §5 is run with **`neutral_sec_per_play`**, the
metric that passed the gate. This is a departure from the letter of §5 and is
declared here rather than discovered in the result.

**Why it does not inflate the §5 test.** The gate is computed from pace against
pace — 32 team-seasons correlated with 32 team-seasons. **It reads no fantasy
outcome, no player, no projection and no graded season.** Selecting which
feature to grade on a criterion that never touches the outcome cannot bias the
outcome test. This is the same reason a power calculation may precede an
experiment.

**The multiplicity is still real and is priced.** Eight metrics were screened.
Two of the eight cleared the PERSISTENT band; one is being carried forward.
Every §5 number must be read as the survivor of an eight-way screen, and the
verdict will say so in those words.

**THE SIGN IS REGISTERED NOW, before grading, because a sign flip after the
fact is a second free look.** Fewer seconds per play = faster = more snaps, so
the tilt is written with tempo INVERTED:

    v *= 1 + k · (mean_sec − sec_prev[team]) / mean_sec

A fast team gets a positive tilt. If the winning `k` on the 2024 selection fold
is the negative-control value, the arm is void, not inverted.

## §4b — a link the original prereg did not name, and it is the load-bearing one

Writing §5 exposed a chain the prereg only implied. A draft board needs
`tempo(Y−1) → opportunity(Y)`. Tempo persisting is **necessary and not
sufficient**: a perfectly persistent coaching habit that does not move next
year's snap count is a fact about coaches, not an edge. §4b measures both links
directly, and — like the gate — **reads no fantasy outcome at all**:

| link | pooled Pearson, CI |
|---|---|
| tempo(Y) → `plays_per_game`(Y), same season | **−0.461 [−0.614, −0.315]** |
| tempo(Y) → `neutral_plays_per_game`(Y), same season | −0.174 [−0.354, −0.013] |
| tempo(Y−1) → `plays_per_game`(Y), next season | **−0.181 [−0.368, +0.014]** |
| tempo(Y−1) → `neutral_plays_per_game`(Y), next season | **−0.114 [−0.304, +0.083]** |

Correctly signed throughout. Strong within a season; **both forward links have
CIs that include zero.** §4b is added to the record here, before §5, so it
cannot be presented later as though it had been planned as a consolation.

## What this does to §5's status

§5 is still run, and the §5 success bar in the original text is unchanged and
not weakened. But §5 is now a **CONFIRMATION of a null already established
upstream by §4b**, not the primary evidence. If §5 clears the bar anyway on a
feature whose forward mechanism link cannot be resolved from zero, that result
is to be treated as a candidate for chance, not a finding — and it will be
reported that way. Nothing about the model changes without Cory's ruling in
either direction.
