<!-- TERRITORY: A -->
# PROJECTION SKILL — THE PREVIOUS-YEARS TEST, LOADED AND GATED — 2026-08-15

Cory: *"don't feel like I've gotten real confirmation that we are confident of
our points projections, have we ran through previous years to test for
sanity... looking for any advantage in this part lifts all boats"*

## Where confidence already stands (verified, not re-done here)

The model/learning audit (draft/audit/model_learning_audit_2026-08-15.md
§1.1–1.8) settled the **arithmetic** side: scoring recomputed to the cent
against real 2023–25 stat lines, the 6-pt passing TD priced (+43.67 for top-12
QBs), magnitudes sane against realized #1 seasons, composition identities
holding. The one named gap: the shipped forecast's **skill** has never faced a
previous-years test, because no provider's 2023–25 *preseason* projections
were archived by anyone here, and fetching "historical" numbers today normally
leaks (exp33) — a post-hoc-revised file grades flatteringly because it already
knows the injuries. The own-model walk-forward test exists and is honest: it
LOSES to the 0.7/0.3 recency blend at all four positions, which is exactly why
`proj_ownmodel` is display-only.

## What is now built (this branch)

**EXP-FP-HIST-PROJ** — the first real previous-years projection-skill
backtest, closable honestly only if FantasyPros' API serves *genuinely
archived* preseason projections. FP's historical **ADP** endpoint is already
proven genuine (exp_source_grade: 2023→358 rows, 2024→343, with plausible
pre-draft ordering and ghost rows). The projections variant is the object
under test.

- `draft/backtest/EXP-FP-HIST-PROJ-PREREG.md` — every gate, threshold,
  status, metric and baseline, committed **before** any fetch (commit
  1627e086 precedes all code and any possible result artifact).
- `draft/backtest/exp_fp_hist_proj.py` — refusal-first runner. Pure gated
  core, thin CI-only egress. Every failure mode is a named status
  (`no_fetch`, `no_rows`, `no_adp_anchor`, `no_markers`, `leaked`,
  `ambiguous_markers`, `regenerated`, `thin_anchor_join`, `anchor_divergent`,
  `thin_crosswalk`) — never a plausible number.
- `draft/tests/test_exp_fp_hist_proj.py` — 28 offline tests; every gate
  two-armed (a genuine fixture that passes AND a leaked fixture that must
  refuse), scoring parity under the real league table, baseline parity with
  model_accuracy_backtest's declared semantics, all refusal paths.
- `.github/workflows/exp-fp-hist-proj.yml` — `workflow_dispatch` only, the
  external-odds-probe shape: prereg-existence gate, fixture tests gate the
  egress, artifact committed hit/null/refusal alike, main-only push guard,
  `[skip deploy]`.

## The authenticity gates (why a fetched "2023" file can be trusted or refused)

1. **Marker players** — derived from data, not hand-picked: top-75 archived-ADP
   picks whose realized weeks-1–17 total was ≤ 30 (seasons that died early or
   never started). A preseason-frozen file must still project them
   full-season-sized (≥ 100 pts); a file that already knows the injury
   (< 60 pts, or the player pruned) is post-hoc → **`leaked`**, and that
   refusal is itself the filed verdict.
2. **Retired-since ghosts** — players with rows in the graded season but none
   in 2025 must appear in the archive (≥ 10); their absence means the file was
   regenerated from today's player DB → **`regenerated`**.
3. **Anchor cross-check** — the already-trusted archived ADP must rank-agree
   with the claimed projections (Spearman ≥ 0.60 on ≥ 100 name-joins);
   wild divergence is named, not papered over.

Only after all gates pass is anything graded — stat lines scored under **our**
table via `scoring.score_stat_line` (never FP's printed points; if only points
are served, the year grades rank-order only and says so).

## What ONE CI dispatch will answer

Dispatch **`exp-fp-hist-proj.yml`** from main (Actions → "EXP-FP-HIST-PROJ —
is FP's historical projection archive preseason-frozen…" → Run workflow; or
`gh workflow run exp-fp-hist-proj.yml --ref main`). Per year 2023/2024/2025:

- whether FP serves historical projections at all, and from which endpoint;
- whether they are preseason-frozen (gates) or post-hoc (refused, filed);
- if frozen: per position — n, MAE, bias, Spearman under our scoring, and the
  head-to-head Cory actually wants: **does a professional projection source
  beat `naive_prev` (last season's actual) and the 0.7/0.3 `recency_blend` on
  the shared population, and by how much.** That delta benchmarks what
  forecast skill is *worth* in this league — how much edge is available in
  "this part" at all. Baselines per year, honestly: 2023 has no prior stores
  (`no_prior_store`); 2024 has naive only (`no_prior_prior_store` for the
  blend); 2025 has both.
- crosswalk match rates, survivorship exclusion counts, and every gate's
  evidence (marker table, ghost count, anchor rho) travel in the artifact
  `draft/backtest/exp_fp_hist_proj.json`.

## What can never be known

**Sleeper's own historical preseason skill.** Sleeper's pre-2026 projections
were archived nowhere — not by us, not publicly — so the accuracy of the
board's authoritative source on 2023–25 is permanently unmeasurable. The
honest instrument already exists: `draft/data/proj_series.json` has frozen the
2026 numbers daily since 2026-08-09, and the already-armed grading makes
January 2027 the first date a real Sleeper skill number can exist. Nothing in
this experiment substitutes for that; it benchmarks the *class* of
professional projection against naive baselines, which is the strongest
previous-years sanity test that does not leak.
