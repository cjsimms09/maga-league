# AUTO-ADJUSTER POLICY TUNING — Is Auto Actually the Best Driver?

Queue: CI-class work alongside the Strategy Hunt sweep (shares the replay harness); results gated by the same evidence rules. The question, stated honestly: the Auto mode's phase schedule (when weights ramp, by how much, triggered by what) was DESIGNED, never TESTED. Treat the policy as a parameterized strategy, sweep the policy space, and let the draft-day Auto be the tournament winner — or discover that a fixed preset beats it, which would be equally valuable to know.

## 1. Parameterize the policy (SMALL space — this is the overfitting defense)
Express Auto as ~10-14 knobs, no more:
- Phase boundaries: 2-3 breakpoints as live-pick indices (e.g., foundation→middle→endgame)
- Per-phase weight vector deltas for the seven sliders (relative to Balanced, bounded)
- Event responses: run-detection multiplier (how hard cliff-urgency spikes during a positional run), need-ramp onset (which pick "unfilled starter" starts shouting), ceiling ramp slope for the bench-lottery phase, LRM-proximity urgency
Complexity discipline: every knob must justify itself — a knob whose sweep shows <1% E[$] effect gets FROZEN at default and removed from the space. Fewer knobs, honest tuning.

## 2. The evaluation gauntlet (three tiers of rooms)
- **Tier A — historical replays** (2023/24/25 real drafts, real keepers): ground truth but n=3; graded in E[$] with harvested thresholds and efficiency-adjusted opponents
- **Tier B — Monte Carlo rooms**: thousands of synthetic drafts from the opponent behavior models (per-manager tendencies + noise), across all 10 slots, heterogeneous keeper configurations (keep-3/2/1/0 mixtures per the placement mechanics), and stress scenarios: early QB run, TE cliff evaporation, my-target sniped streaks, a no-show CPU drafter, reach-heavy vs value-fall rooms
- **Tier C — adversarial**: rooms biased against each candidate policy's assumptions (the policy that only wins friendly rooms is curve-fit)

## 3. Overfitting guardrails (non-negotiable)
- **Season cross-validation**: tune on two seasons' replays + their-era Monte Carlo, validate on the held-out season; rotate; a policy must win on held-out data, not training data
- **Champion-challenger**: current hand-designed Auto is the champion; a tuned challenger replaces it ONLY if it beats champion AND the 95th-percentile luck baseline on validation, by a margin exceeding the noise band
- **Preset honesty check**: race tuned-Auto against the four fixed presets across all tiers — if BALANCED-fixed statistically matches tuned-Auto, report that loudly; a simpler policy that ties wins on robustness grounds
- **Pre-registration**: the winning criteria above are registered now, before any sweep runs; no post-hoc metric shopping
- **September re-run**: all of this re-executes on quantile-model grading; August's verdict is provisional and labeled so

## 4. Deliverables
- The policy tournament table: every candidate × tier × season, E[$] with intervals, luck-baseline percentile
- The knob report: per-knob sensitivity (which adjustments actually matter — likely finding: 3-4 knobs carry everything)
- The verdict: Auto-tuned / Auto-default / fixed-preset as the recommended draft-day driver, with the one-paragraph honest rationale
- If tuned policy wins: it ships through normal gates (cited config, robot scenario asserting the new schedule fires at the right picks, participation test per phase), and the war room's Auto explanation lines update to describe the TESTED policy
- Rehearsal requirement: whichever policy wins drives at least one full robot mock and one Cory mock before draft night — the winner must be the rehearsed configuration

## 5. PRE-REGISTERED HYPOTHESIS (locked 2026-08-08, before any sweep runs)
**Registered by Cory ahead of the first sweep — no post-hoc metric shopping (per §3 pre-registration).**

**H1 (the phase-shape hypothesis):** under E[$] grading, the winning policy tilts **boomier than the current defaults**, and specifically with a **PHASE SHAPE** rather than a uniform lift:
- **Core rounds (foundation → middle):** a **MODEST** ceiling/correlation increase — the floor still has to buy the top-4 door, so the core stays solid; boom is nudged, not maximized.
- **Final ~6 bench picks (endgame):** **AGGRESSIVE upside + near-ZERO risk penalty** — a bench ticket's floor is free on the waiver wire, so downside stops mattering and you pay only for ceiling/lottery outcomes.

**Comparative test — the candidate set MUST include H1's rivals so the verdict is comparative, not confirmatory:**
1. **H1 phase-shape** (modest core boom + aggressive floor-free endgame) — the registered favorite
2. **Uniform boom-tilt** (raise ceiling/correlation evenly across all phases — no phase shape)
3. **Current hand-designed defaults** (the champion)
4. **Floor-heavy** (the opposite tilt — risk-averse throughout)
Each runs the full Tier A/B/C gauntlet with season cross-validation; H1 is credited only if it beats **all three rivals AND the 95th-percentile luck baseline** on held-out data by a margin exceeding the noise band. If uniform-boom or defaults statistically tie H1, that is reported loudly (a simpler policy wins on robustness).

**Required reported quantities:** the **per-phase optimal upside / risk / correlation values the sweep finds, WITH intervals** — i.e., the actual (ceiling, risk-penalty, correlation) triple the tournament lands on for each phase, so H1's predicted shape (modest-core / aggressive-floor-free-endgame) can be read directly off the numbers and confirmed or falsified. A phase whose interval straddles the default is reported as "no evidence of a shift there," not nudged.
