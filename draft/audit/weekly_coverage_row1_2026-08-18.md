# ROW 1 — `own_weekly_v1` ALREADY EXISTS. THE OPEN QUESTION WAS COVERAGE, AND IT IS NOW MEASURED

_TERRITORY: D. In-season row 1, and it settles a design question row 2 depends
on. Written 2026-08-18, D's first item on the in-season lane._

## 0. PRIOR ART FIRST — and it changed the task

The row reads *"`own_weekly_v1` must publish a point prediction for EVERY
player, EVERY week."* Before building anything I looked for what exists.

**It exists, and it is good.** `draft/weekly_own_projection.py` (TERRITORY: A)
prices a weekly number for every QB/RB/WR/TE the board prices, commits it before
kickoff — the commit timestamp *is* the forward guarantee — and is graded every
Tuesday by `weekly_own_grade.py`. It carries a champion arm and named challenger
arms, with `vg[pos]` imported from the graded `V5_CONFIG` rather than reinvented.
Two workflows (`own-weekly-proj.yml`, `own-weekly-grade.yml`) and two test files
already ship.

**So row 1 is not "build the spine". The spine is built.** The open half is the
one the row itself flags — *"coverage is the whole game"* — and nobody had the
number.

*(This check is the direct consequence of register 39, filed hours earlier the
same day: I re-derived a finding that was already graded and ruled on. The
standing fix is prior_art before filing. It fired correctly here.)*

## 1. THE MEASUREMENT

`draft/backtest/projection_coverage_census.py` → `.json`. No egress.

| universe | n |
|---|---|
| Sleeper | **693** |
| **own_weekly_v1** (board QB/RB/WR/TE) | **617** |
| FantasyPros | **429** |

### The structure is the finding, and it is better than feared

| | |
|---|---|
| FantasyPros ⊆ Sleeper | ✅ |
| FantasyPros ⊆ ours | ✅ |
| ours ⊆ Sleeper | ✅ |
| **players FantasyPros prices that we cannot** | **0** |

**The universes are perfectly nested**, so the three-way shared population is
unambiguous — **it is exactly FantasyPros' 429 players**, with no partial
overlap to adjudicate.

| | n | QB | RB | WR | TE |
|---|---|---|---|---|---|
| **three-way shared** | **429** | 71 | 103 | 158 | 97 |

= **61.9%** of Sleeper · **100%** of FantasyPros · **69.5%** of ours.

**Every position clears 70 rows**, so the *"3 of 4 positions"* bar in
`PROJECTION-PROGRAM-2027.md` can carry a per-position verdict rather than a
pooled one.

## 2. WHAT THIS SETTLES FOR ROW 2

The in-season prompt warns that a comparison over *"whoever each source happened
to cover"* is not a comparison, and that three graders persist counts rather
than per-player rows (P37/P38). **That worry is real but the population half of
it is now closed:**

> **PRIMARY — three-way: the 429.** The only set all three sources price.
> Nested, so no overlap rule is needed.
>
> **SECONDARY — two-way vs Sleeper: the 617.** What the wider universe does,
> where FantasyPros cannot follow. **Reported beside the primary, never instead
> of it** — it is the bigger and more flattering number, and a design that lets
> it drift into the headline is how a 429-player result becomes a 617-player
> claim.

Both are recommended in the artifact, and a guard fails if the secondary is ever
recorded as smaller than the primary.

## 3. THE TWO COVERAGE FACTS A GRADER MUST NOT REDISCOVER LATE

**1. 188 players we price sit outside any three-way comparison** — WR 82, RB 53,
TE 34, QB 19. We have a number for them; FantasyPros does not. That is not a gap
to close, it is a scope boundary, and it is why the secondary population exists.

**2. FantasyPros publishes NO K or DEF.** The board carries 76 (44 K, 32 DEF),
Sleeper prices all 76, FantasyPros prices **zero**, and `own_weekly_v1`'s formula
is QB/RB/WR/TE so it prices zero too.

> **A three-way weekly grade structurally cannot include K or DEF.** Not our
> gap. **A two-way grade against Sleeper could** — and that is the only route by
> which the 76 board players priced on `gaussian_z` (register 2e's P0) ever get
> a graded weekly number.

Declared in the artifact with its reason attached, rather than left as an empty
cell — the same absent-vs-zero rule the calibration refusal follows.

## 4. THE LIMIT, AND ITS RE-TEST TRIGGER

**`proj_series.json` holds SEASON projections.** They are used here as the
**pre-season proxy for the WEEKLY universes**, because no weekly snapshot exists
yet — the season has not started.

**A provider's weekly universe can differ from its season universe**, in either
direction: FantasyPros may publish weekly numbers for players it gave no season
total, and may drop others.

> **RE-TEST at week 1, from the real weekly snapshots.** This file is the
> method; the number is dated 2026-08-18. The trigger is in the artifact's
> `_limit` and a guard fails if it is removed.

**Nothing downstream should hard-code 429.** It is today's measurement of a
structure, and the structure — nesting — is the durable part.

## 5. WHAT THIS DOES NOT COVER

- **Not a grade.** No accuracy number is computed here; this is the population
  a grade may use.
- **Not a claim about weekly coverage within a season** — bye weeks, inactives
  and mid-season emergents all move the real weekly universe, and none of them
  are visible pre-season.
- **`weekly_own_projection.py` was not edited.** TERRITORY: A. Its QB/RB/WR/TE
  scope is reported here, not changed.
- **The waiver-wire question is untouched and is the real coverage risk:** a
  player who breaks out in week 6 was on nobody's preseason board. Sleeper and
  FantasyPros will project him; we project from a board fixed in August. **That
  is the coverage failure most likely to decide the 09-15 grade, and it is not
  measured yet** — filed as Q17.
