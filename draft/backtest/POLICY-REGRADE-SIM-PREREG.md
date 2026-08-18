# POLICY RE-GRADE THROUGH THE SEASON-FORWARD SIMULATOR — PREREG (task 27)

**A, 2026-08-18, committed before the module first runs.** The strategy
tournament's dollar verdict was honest but starved: in the one realized
world Cory's seat never reached the payout channels that carry 53%+ of
the pot, so every policy graded on a 3-sample weekly-high coin flip
(EDGE-LEDGER, "the experiment could not exercise its own hypothesis").
The season-forward simulator (task 9, committed and certified tonight)
activates those channels across 2,000 worlds per season. This study
re-asks the tournament's question there — and only that question.

## Design

For each season 2023/2024/2025 and each tournament arm — the seven
strategies (`market`, `need_value`, `zero_rb`, `robust_rb`, `hero_rb`,
`elite_te`, `wr_feast`) plus `cory_actual` and `oracle_realized` —
rebuild the roster EXACTLY as `exp_strategy_tournament.py` built it
(imported, not re-derived: `build_roster`, `STRATEGIES`, the same
decision/pick/keeper/adp inputs) and take its NEUTRALIZED weekly series
(`neutralized_weekly` — the injury-neutral treatment the tournament
already ruled the honest basis). Feed each through
`season_forward_sim.simulate(substitute=(cory_seat, series),
n_worlds=2000)`. Outputs per arm per season: P(playoffs) and E[$]
decomposed, with world-resampling spread.

Playoff scores: the simulator bootstraps every seat's playoff weeks from
its own (substituted) RS distribution — so the "replay stops at the
regular season" $-None outcome of `grade_substituted` cannot occur here;
every world prices every channel.

## Bars, fixed before any number

* **INSTRUMENT CONTROL (rule 3e for studies): `oracle_realized` must
  separate from `cory_actual`** — E[$] mean higher by > 2·(SE_a + SE_b),
  same sign, all three seasons. The oracle drafts on realized points; if
  even it cannot separate across 2,000 worlds, the instrument is too
  dull and the verdict is NOT RUN — never "null".
* **A strategy SEPARATES from `market`** iff its E[$] mean differs by
  > 2·(SE_a + SE_b) with the SAME SIGN in all three seasons (the
  sign-consistency gate the proxy verdict already uses). SE = world
  sd / √n_worlds.
* Secondary, reported not gated: P(playoffs) per arm, and which payout
  channel any separation lives in.

## Blind prediction (ledger P100, this commit)

**No strategy separates from `market` in either direction; the oracle
separates cleanly.** Prior: the EDGE-LEDGER's graded null (shape tilts
moved playoff-window points ~equally — generic noise) plus the graded
"none beats the measured core" archetype result. A strategy separating
UPWARD would overturn a shipped conclusion and would need a replication
run with a fresh seed before anything routes to the board.

## What ships

Nothing ships from this study directly in either outcome. A surprise
separation files a follow-up prereg with a fresh seed; a confirmation
retires the roster-shape question with real power behind it (the
tournament's INCONCLUSIVE becomes a powered null, which is a strictly
better epitaph).

Module: `policy_regrade_sim.py`. Artifact: `policy_regrade_sim.json`.
Audit: `draft/audit/policy_regrade_sim_2026-08-18.md`. Grade-by for
P100: 08-20 (runs tonight; the date is slack, not a gate).
