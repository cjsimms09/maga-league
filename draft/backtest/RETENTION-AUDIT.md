# ANNUAL RETENTION AUDIT — what actually compounds vs what resets (2026-08-09)

Cory's question (asked 3×): after a season ends and the Annual runs, what does the model
genuinely RETAIN and still READ — not merely store? "An archive nothing reads is the same
as a deletion." Verified against the code this date (not a guess unless marked).

| # | Thing | Preserved AND read? | Where / why |
|---|---|---|---|
| 1 | Every prediction, graded | **NO — captured, never graded** | `src/predledger.js` stores `forecast` entries in Netlify Blobs (`pred:<season>:`), contamination-safe. But **no schedule runs `forecast_grade.py`** against them — grep confirms zero grading cron. So predictions are stored raw and **ungraded**; nothing reads a graded result. **This is the keystone gap.** |
| 2 | Dossiers gain a season | **YES** | `manager_profiles` (build.py) + `opponent_profiles.py` rebuild from `league_history.json` every board build; history is re-exported from Sleeper each season. Read by the board + war room. |
| 3 | Lab registry + verdicts | **YES** | `lab-results.json` append-only + `LAB-REGISTRY.md`; the Lab re-runs on schedule and on any data/harness change, so a new season in `league_history` **re-grades** verdicts (strengthen/weaken). |
| 4 | Calibration history across years | **NO** | It is a product of #1. No grading ledger exists, so there is no cross-year calibration store. |
| 5 | Evidence weights from the larger sample | **NO — dormant** | `evidence_weight.py` exists (`combine`, `append_trajectory`) but is **not wired to consume a calibration ledger** and update live weights. Built but unused. |
| 6 | Its own mistakes | **PARTIAL** | Two halves. **Failed experiments: YES** — EXP-*.md + append-only results persist and retired findings are recorded. **Overrides + losing recommendations: CAPTURED, NOT GRADED** — predledger has the `recommendation` / `pick` / `override` kinds (+ in-season `lineup_call`/`waiver_claim`/`stream_call` counterfactuals), so the decision-time record exists; but nothing joins them to outcomes, so "where the tool lost money / where Cory beat it" is not yet computed. Same missing grading loop as #1. |
| 7 | Permanent raw record | **YES** | `history_export.py` pulls every pick, roster, matchup, transaction, and bracket from Sleeper into `league_history.json`; `rawarchive.js` archives raw snapshots (`raw:<season>:<kind>:`). Read everywhere. Strongest of the seven. |

## The rule-change question
Does anything know a 2025 finding was measured under different RULES than 2027?
- **Money-grading IS era-correct: strong.** `money_grade.py` + every Lab experiment grade "in dollars under **era-correct per-season payouts**." A re-run uses the season's own payout table, so verdicts measured under old payouts don't silently carry — the Lab re-derives under current rules.
- **Findings are NOT rules-era-STAMPED: residual risk.** A verdict *cited from an old committed report* without re-running carries no "measured under 2025 payouts" tag. In practice the Lab auto-re-runs, so this mostly self-heals, but a stale citation could mislead. Cheap fix: stamp each finding with the payout/scoring era it was measured under.

## Bottom line (the honest one)
**Three of the seven are solid (2, 3, 7). Three are not (1, 4, 5). One is half (6).** And the
three misses + the ungraded half of #6 all have the **same single root cause: the grading
loop does not run** — forecasts and decisions are *captured* but never *graded*, so
calibration, evidence-weight updates, and "where we were wrong" never get produced. This is
exactly the "January would tidy, not compound" verdict, now itemized.

The fix is one build: the **weekly grading cron** (task #17, moved up by Cory) →
`forecast_grade` on resolved entries → append to a calibration ledger → `evidence_weight`
consumes it. That single loop turns #1, #4, #5 live and makes #6 gradeable. Until it runs,
the raw record compounds but the *learning* does not. Plus the cheap rules-era stamp on
findings. Nothing else in the seven is missing — the record is there; the reader is not.
