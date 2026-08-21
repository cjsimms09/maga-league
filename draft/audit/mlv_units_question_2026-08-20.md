# The units question cannot be answered with data this project has — measured, not assumed

**D, 2026-08-20.** Answers relay's ask (ROUTES.md, TO: D, 2026-08-20): *"encode
`lineupValue` in projected POINTS (the board's own `proj_mean`) instead of
market rank, re-run the 30 seat-years, and report whether the cap arm's
+45.8/+29.3 survives the unit change."* Filed as the biggest open risk on MLV
(prereg §9 limit 4).

**Short answer: the substitution was run, and it does not answer the question
it was meant to answer.** The result (+130.7 actual, +164.4 skill — the cap
arm gets FAR BETTER, not worse) is dominated by an uncontrolled confound the
harness's own header already names: there is no era-correct projection source
in this project reachable without network access, so "points" can only mean
the CURRENT 2026 board's opinion of a player, applied to 2023-2025 picks. That
is hindsight, not a units change, and the swing below is mostly a measurement
of how much hindsight is worth — not evidence about MLV's robustness to unit
choice.

---

## 1. The harness's own header already flagged this, before I ran anything

`draft/tools/roster_builder_replay.js`'s file-level comment, unchanged by this
work:

> *"The seat replay is blocked on era-appropriate projections. But the roster
> equation's job is NOT projection, it is SHAPE. So hold player evaluation
> constant and vary only the construction rule: value signal = THE MARKET'S
> OWN DRAFT ORDER... The market's order is era-correct, carries no hindsight,
> and — the point — IS THE SAME INFORMATION THE HUMAN OWNER HAD... ⚠️ THIS
> CANNOT TEST PROJECTIONS AND MUST NEVER BE QUOTED AS IF IT DID."*

Market rank was not an arbitrary encoding choice. It is the one thing this
design does to stay valid at all, given that the only projection source
loaded anywhere in this file is `public/draft_data.json` — the live 2026
board, one single, present-day vintage. Swapping a 2023 pick's value for its
2026 `proj_mean` feeds the engine three more years of real NFL outcomes
(injuries that happened, breakouts that happened, aging that happened) to
make a decision the human owner made without any of that. That is exactly
the asymmetry the header's "same information" claim exists to prevent.

## 2. Run anyway, because the question deserves a number, not an argument

Added `--mlv-points` to `roster_builder_replay.js` (TERRITORY: A, extended
under the same flag-gated pattern already used for `--kdef-tax`,
`--te-boost`, and others — nothing ships, default behaviour unchanged, report
file regenerated back to its default state after this run). When set, every
`valueOf(player)` call inside `buildSeat` — which feeds both the MLV cap
arm's `lineupValue` and the plain shaped-curve arm's per-pick score — returns
the current board's `proj_mean` instead of `(N+1) − pick_no`, falling back to
market rank for any player absent from the 2026 board (documented, not
silent).

**Coverage, measured before trusting a single result:** 45,196 of 50,744
`valueOf` calls across the 30-seat run resolved to a real 2026 `proj_mean`
(89.1%). Checked independently per season directly against the historical
draft picks (not the internal counter, as a second path): **2025 144/150
(96.0%), 2024 137/150 (91.3%), 2023 128/150 (85.3%)** — coverage is real and
high, not a near-total miss that would make the whole run meaningless, but a
real ~11-15% of historical picks fall back to market rank regardless.

## 3. The result

| | market rank (`--mlv`, reproduced exactly) | current-board points (`--mlv --mlv-points`) |
|---|---|---|
| actual | **+45.8** (20/30) | **+130.7** (19/30) |
| skill | **+29.3** (18/30) | **+164.4** (22/30) |
| conversion wins | 15/30 | 13/30 |

**Reproduced the baseline to the decimal first** (+45.8/+29.3, 20/30 wins,
18/30 skill wins) before changing anything, so the comparison is against a
verified starting point, not a remembered number.

By season, skill delta:

| season | market rank | points | coverage |
|---|---|---|---|
| 2023 | +34 (6/10) | **−24** (2/10) | 85.3% |
| 2024 | +8 (5/10) | **+332** (10/10) | 91.3% |
| 2025 | +46 (7/10) | **+185** (10/10) | 96.0% |

**The cap arm's number does not collapse — it more than quintuples on skill
(+29.3 → +164.4).** That is not what a units-robustness check finding a real
problem looks like, and it is not what surviving a clean units change would
look like either. It is the signature of an arm being handed information the
opposing side never had: 2024 and 2025 flip from modest/positive to
blowout-positive (10/10 and 10/10 seats won), while 2023 — the season with
the *lowest* current-board coverage, though not dramatically so — flips
negative. A mechanism becoming both far better AND, in one season, reversed
in sign under the same substitution is consistent with a confound dominating
the result, not with a clean re-scaling of the same signal.

## 4. Why this can't be fixed by better bookkeeping

The project has exactly one path to real era-correct projections:
`draft/backtest/build_bundle.py`'s `build()`, which produces per-season,
walk-forward, leave-one-season-out `proj_mean` — genuinely the right
instrument for this question. But `build_bundle` is assembled by
`draft/backtest/cli.py`, whose own docstring says it **"runs where the
network is (CI)"** — it needs Sleeper, which is 403 at CONNECT from this
sandbox, the same wall every cross-network fetch in this project has hit all
week. No `bundles.json` has ever been committed (checked: zero history for
that path), so there is no already-built artifact to borrow from either.
The already-committed `engine_seat_choices_slot_s0/s1.json` files (used for
register 139's detection-floor work) come from a *different* harness
(`replay_seats.js`/`engine.js`) with a different scoring formula and are not
a drop-in points source for this one.

**So the honest state is: this project cannot currently answer "does MLV
survive a clean, era-correct units change" without a CI run this sandbox
cannot perform.** The measurement above answers a different, easier question
— "does MLV survive being handed 2026 hindsight instead of market rank" —
and the answer to *that* question is "it wins even bigger," which is
uninformative about the real risk the prereg names.

## 5. Rule 3g

**(1) Implies another failure?** Any other study in this project that has
substituted the live 2026 board's `proj_mean` into a historical (2023-2025)
replay context carries the same hindsight exposure — worth a targeted check
of anything quoting a "points-based" historical comparison rather than
assuming market-rank was used throughout.

**(2) Invalidates something trusted?** No — the original +45.8/+29.3
market-rank result is untouched and remains the number the P234/P235/P236
grade rests on. This finding does not argue MLV is wrong; it argues the
specific proposed test cannot currently distinguish "MLV is unit-robust"
from "MLV benefits from hindsight," and the number produced should not be
read as either.

**(3) Routed:** relay, who asked, with the scope of what's actually missing
(a CI-run `bundles.json`) named so the next attempt knows what it needs
rather than re-discovering the same wall.

## Method, for reproduction

```
node draft/tools/roster_builder_replay.js --mlv               # baseline, reproduces +45.8/+29.3
node draft/tools/roster_builder_replay.js --mlv --mlv-points   # this measurement
```

Both runs write the same report-only path
(`draft/data/roster_builder_replay.json`); the committed file was regenerated
with no flags afterward to restore its documented default state (which was
itself found committed in a non-default, `--mlv`-flagged state on
`origin/main` before this — a recurrence of a previously-reported class of
issue, fixed the same way as before: regenerated, not hand-edited).
