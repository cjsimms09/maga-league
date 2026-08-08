# THE PORTFOLIO DOCTRINE — Constructing a Variance Profile, Not Collecting Players

_Received in full 2026-08-08. Verbatim spec below the build-status header._

## BUILD STATUS (maintained here, not in a second place)

| step | state |
|---|---|
| **1. Measure covariance** | 🟡 **RUNNING IN CI** — `draft/backtest/measure_covariance.py`, `.github/workflows/covariance.yml`. Explicitly excepted from the queue position. |
| 2. Portfolio evaluator + **retrodiction validation** | ⛔ not started — gated behind exp 34 / the tree per the queue |
| 3. Wire as roster-marginal term, sized small, raced in the Lab | ⛔ not started — gated on (2) clearing retrodiction |
| 4. Robot/test discipline (retrodiction + participation test) | ⛔ builds with (2) |

**The gate that matters, in Cory's words: _"A portfolio model that can't retrodict
who won weekly highs does not get to price my picks."_**

---

**The gap this closes:** the engine scores players and sums them. It does not evaluate the *roster as a portfolio* — the joint distribution of outcomes my starting lineup produces week to week. In a league where 37.5% of the pot (weekly high, $1,500) pays for correlated ceiling and ~53% pays for consistent entry, the shape of that distribution is the objective. Two rosters with identical projected points can have materially different E[dollars]. Nothing currently prices that difference except a stack bonus (LEAN, uninstalled) and a bye penalty.

**Status discipline:** this ships as a *measured* term or not at all. It enters through the Lab, sized by the sizing doctrine's evidence-class rules, and its default is small until raced. It does NOT ship as a large unvalidated term — that would be the 74%-intervention problem in a new hat.

## 1. What must be modeled (the roster-level quantities)

For a given roster and week, the starting lineup's score is a sum of correlated random variables. The quantities that matter:

- **Expected weekly score** (already have, approximately)
- **Weekly variance** — the spread of outcomes, driven by individual player variance AND covariance between starters
- **Covariance sources, concretely:** same-team QB↔pass-catcher (positive, strong), same-team pass-catchers competing for targets (negative), players in the same game (positive via game script/pace), a player vs the opposing DST if I roster both (negative), and same-bye-week (a degenerate perfect correlation to zero)
- **P(week clears the winning band)** — the high-pool question, computed against the harvested per-week thresholds, NOT against a flat number
- **P(week beats my actual opponent)** — the entry question, computed against that opponent's efficiency-adjusted projection

## 2. The two-layer objective, restated at roster level

E[dollars] for a roster = Σ_weeks [ P(clear the week's winning band) × $100 ] + P(top-4 entry) × entry payouts + P(RS money) × RS payouts

The insight that makes this a *doctrine* rather than a term: **these two components want different things.** Entry wants a high floor (win your matchups). The high pool wants a fat right tail (boom above ~139). A roster optimized purely for either underperforms one optimized for the pair. The portfolio doctrine's job is finding the shape that maximizes their sum — which the frontier experiment (21) already showed is *moderate* tilt toward variance, not maximum.

## 3. Draft-time implementation (what changes on the board)

1. **Roster-marginal scoring:** every candidate is priced by the change he makes to the ROSTER's E[dollars], not by his standalone value. This subsumes the flex-marginal fix (D3), the stack bonus, and the bye penalty into one coherent quantity rather than three bolted-on terms.
2. **Concentration flags:** when a pick pushes the roster past a tested concentration threshold (starters on one offense, one game, one bye), the card says so with its dollar cost — not a blanket penalty, a priced one.
3. **The portfolio readout (Zone 2, one line, expandable):** projected weekly mean, the spread, P(clear the band) per week, and the two-layer split — "entry 61% · high-pool 2.3 expected wins" — updating per pick. This is the Money Meter done properly.
4. **Correlation is measured, not assumed:** the covariance inputs come from historical co-scoring (nflverse weekly data, same-team and same-game pairs across 2021–25), not from a hand-set rho. Exp 6's stack finding was priced against a modeled rho=0.35 and flagged LEAN for exactly this reason; measuring it converts the whole family from lean to evidence.

## 4. In-season implementation (where it matters more)

The portfolio view is *more* valuable weekly than at the draft, because the lineup decision IS a portfolio decision:
- **Lineup optimization becomes explicitly two-objective** (already specced): the optimizer chooses the lineup maximizing E[dollars] = P(win matchup)-driven value + P(clear band)×$100, and the portfolio math is what makes that computable rather than heuristic
- **Chase mode:** when my projected score sits below the week's band and my matchup is likely lost, the optimizer should tilt hard to variance (nothing to protect); when I'm favored and near the band, it balances. The *state-dependent* posture is the doctrine's weekly expression
- **Waiver/streaming choices** priced by roster-marginal E[dollars], same as draft picks

## 5. The build order (small, gated, honest)

1. **Measure covariance first** — same-team QB/WR/TE pairs, same-game pairs, from historical weekly data. Report the actual correlations. This is a fact-finding step, not a modeling step, and it can run now.
2. **Build the portfolio evaluator** — given a roster and a week, produce the outcome distribution and the two probabilities. Validate it against history: does it reproduce actual observed weekly-high frequencies for the three seasons we hold? A portfolio model that can't retrodict who won weekly highs isn't ready to price picks.
3. **Only then**, wire it as a roster-marginal scoring term, sized small per the sizing doctrine, raced in the Lab against the current composite, installed only if it clears the gates.
4. **Robot/test discipline:** the retrodiction check in (2) is the non-vacuity guard — assert the evaluator's predicted high-frequency correlates with observed, and that perturbing correlation inputs changes the output (participation test).

## 6. What this replaces

If it works, it subsumes: the stack bonus, the bye-collision penalty, the flex-marginal fix, the ceiling term's role, and the Money Meter's crude proxy — five hand-built approximations of one quantity, replaced by the quantity itself. That consolidation is the strongest argument for building it: fewer terms, each measured, rather than more terms each guessed.
