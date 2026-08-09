# GATING AUTHORITY — which harness is allowed to say "install"

_Written after the phantom catch (2026-08-09): the strategy table (run-strategies.js)
autonomously printed "INSTALL DECISION: YES — Upside-Late" (+$230 pooled, both
seasons, CI-clear) off weight-jitter robustness alone. The tournament, with a
200-draw outcome-shuffle null and a consistent control, scored the same profile at
$0, 0th percentile — its "upside" tilt was buying extra QBs that never clear the
weekly-high band. Twelve days before the draft, the weaker harness would have put a
phantom edge on the board. This document fixes the rule so it cannot happen again._

## The rule

**No harness installs anything. The tournament (`tournament.py` → `LAB-TOURNAMENT.md`)
is the sole gating authority for any draft-strategy claim that both harnesses can
express.** A number from any other harness is a CANDIDATE at most, never an install.

A draft-strategy claim installs to the board only if, in the tournament:
1. its pooled dollar edge **clears the null 95th percentile** (outcome-shuffle,
   same best-of-K search, same grid), AND
2. it is **consistent** (leave-one-season-out; not one lucky season/seat), AND
3. its edge is **not a coverage or divergence artifact** (a candidate that ties the
   control on picks, or grades on sub-1.0 roster coverage, is not an edge).

## Why the tournament and not the others

| harness | control | null | verdict it may emit |
|---|---|---|---|
| **tournament.py** | arch:balanced (stable) | 200-draw outcome-shuffle p95 | **INSTALL / CANDIDATE / PARK** (authority) |
| run-strategies.js (strategy table) | Default weighting | weight-jitter only (robustness, NOT a null) | CANDIDATE — pending the tournament null |
| bridge.py | the real drafter's seat | none (descriptive $ substitution) | descriptive $ only; coverage-caveated |
| exp 34/36/43 (audits) | — | bootstrap CI / cell floors | reliability surface / descriptive; never an install |

Weight-jitter answers "is this edge a property of the strategy or one point in
weight-space" — necessary, not sufficient. Beating "Default" answers nothing about
luck. Only the outcome-shuffle null prices luck under the same best-of-K search, and
only a stable control keeps the comparison honest across candidates.

## Enforcement (wired, not just written)

- `run-strategies.js` now prints **"STRATEGY-TABLE VERDICT: CANDIDATE … PENDING the
  tournament null gate"** and carries the caveat in `STRATEGY.md`. No INSTALL string.
- `LAB-REGISTRY.md` records the phantom catch (exp 25-adjacent discipline entries).
- Any new harness that produces a draft-strategy dollar number MUST cite this file
  and label its output CANDIDATE unless it is the tournament itself.

## Scope

This governs **draft-strategy** claims (what to draft / how to weight). It does not
govern in-season claims (lineup, waivers) — those have their own grader (L0/exp35)
and their own as-of discipline, and get their own authority doc when that harness
matures. The Master Experiment's season-forward layer, when built, extends this
rule to the full draft→season→dollars path; until then, draft strategy is gated
here and nowhere else.
