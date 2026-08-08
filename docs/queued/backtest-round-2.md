# Backtest Round 2 — Corrected Foundations, 2025 Recovered, Findings I Can Use This Year

Every prior backtest run replayed against boards we now know were wrong three ways: fixture keepers, the original_round cost model, and missing board coverage. All three are fixed. This run is therefore new evidence, not a repeat — and its explicit goal is **usable findings for the August 22 draft**, extracted with the same honesty discipline as everything else. Pre-registered framing, locked before any numbers: this run **characterizes, calibrates, and eliminates — it does not certify a winning strategy.** No p-values are claimed at N≤3 drafts. The certifying rerun remains post-quantile, September.

Work the phases in order; each gate must pass before the next phase runs.

---

## PHASE 1 — Recover 2025 grading (the season closest to this draft)

The library weekly path 404s on 2025; the pbp path serves it but was refused because the pbp rebuild disagreed with the library by 11 points on 2024 (tolerance 0.5). Diagnose that divergence properly instead of accepting the loss of our most relevant season:

1. On 2024, where both paths work: pick 10 player-weeks where the two disagree most, and diff them **stat-category by stat-category**. The 11-point annual gap has the exact signature of missing categories in the pbp aggregation (2-pt conversions, fumble recoveries, return yards, kick-distance splits — the same vocabulary-mismatch family as run 4).
2. Fix the aggregation to include every category our scoring config pays, verified against the shared mapper.
3. Re-run the cross-validation gate: pbp-rebuilt 2024 vs library 2024, per-player season totals, tolerance 0.5 points. **If it passes:** 2025 grading is certified via the pbp path — record the certification. **If it still fails:** show the residual per-category diff, and 2025 stays ungraded with the reason stated. Do not loosen the tolerance to force a pass.
4. Either way, add the dual-path agreement check as a permanent pipeline gate for future seasons.

## PHASE 2 — Rebuild the replay boards on true foundations

For each replayable season (2023, 2024, 2025):
1. Boards include **every actually-drafted player** (the coverage fix), with the ≥98% coverage gate asserted per season — refuse with the missing list otherwise.
2. Keeper slates come from each draft's **real is_keeper picks** — never fixtures. Gate: zero synthetic names on any board (assert every keeper resolves to a real Sleeper player ID).
3. Cost model: top_picks_flat, as the league actually plays. Note in the report that historical seasons were drafted under whatever rules applied then — if the is_keeper pick positions show a different historical structure (e.g., keepers slotted at original rounds in 2023), model each season as it actually occurred and say so. The replay must match each year's reality, not this year's rules.
4. True pick orders per season verified against the actual recorded pick sequence — the replay advances on what really happened, so any mismatch is a construction bug, caught here.

## PHASE 3 — The analyses (all projection-free or projection-honest)

### 3.1 Survival calibration — the model's report card on this league
Across all graded seasons: every survival prediction the current model would have made, bucketed (0–10% … 90–100%), vs actual survival. Per layer (ADP-only vs +need-aware vs +run-detection), per season, and pooled. This is the one analysis with real statistical power at our N (~450 pick-level predictions), it needs no projections, and it directly answers whether the numbers on my draft-day screen are honest. If a layer doesn't improve calibration, say so plainly — that layer's complexity is unearned.
- Follow-on: if the curve shows systematic bias, fit adp_sd (or the layer parameters) to the curve, install only if the fit improves held-out-season calibration, cited to this run.

### 3.2 Strategy falsification — elimination, not certification
The eight named profiles through the corrected replay, all seasons, my seat and league-wide, with confidence intervals. Framing is fixed: **no winner is declared.** Report each profile's directional result per season and pooled; any profile that loses to Default in every graded season by a wide margin is ELIMINATED and recorded as such. If any profile beats Default directionally in all graded seasons, note it as "worth the September certification rerun first" — nothing installs off this run.

### 3.3 League intelligence, focused on MY actual draft window (picks 30–75)
I have no picks before 34. Bias every Section B analysis toward the rounds I actually draft in:
- **The 30–75 value map:** what fell to these picks historically — positions, ADP-vs-pick gaps, and how those players' seasons actually went. This is my scouting report for rounds 4–8.
- **Reach and Chiefs-premium maps** as specced, but with a "what it pushed into picks 30–75" shadow column — their early reaches are my mid-round supply.
- **Faller verdicts:** players who fell 10+ past ADP into my window — did they pay off or was the room right? Sets my faller posture for exactly the picks where I'll face the choice.
- **Run archaeology:** runs that started in rounds 3–7, what triggered them, and what the post-run board looked like at the next few picks — the live-draft situation I'll actually be in.
- **Keeper-behavior grading** under each season's real rules: who historically kept players not worth the forfeited pick, and what their forfeitures pushed to the middle rounds.
- Every line carries its N. 3/3-season patterns are intel; 2/3 are leans; 1/3 are anecdotes and labeled as such.

### 3.4 The pick-34 dossier (new, and the most directly usable output)
Synthesize 3.3 into one page: at picks 34/41/54/61 specifically, across all replayed seasons — what was the best available by actual season outcome, what did the room take, what would Default have taken, and what patterns repeat. If the model's pick at 34 would have beaten the room's actual pick in every replayed season, that's the trust-calibration number for my first live decision of draft night.

## PHASE 4 — Deliverables

- `BACKTEST-2.md`: all phases, gates passed/refused, every finding with N and intervals, provenance-stamped
- Intel Card updated with the 3.3/3.4 findings
- STATUS.md: verbatim — the calibration verdict per layer, the elimination list from 3.2, the top 5 lines of the pick-34 dossier, and one honest paragraph on what this run still cannot answer (the strategy certification, pending September)
- Any new gate refusal is reported as a finding with its cause, per house rules — seven runs, zero wrong numbers; keep the streak.
