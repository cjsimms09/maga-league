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
