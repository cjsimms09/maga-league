# Optimization pass — Phase 0 inventory

**Nothing in this phase changes behaviour.** It is the list of what could be
deleted and what is measurably slow, with the evidence for each. Deletions are
Phase 1; optimizations are Phase 3.

Method: V8 coverage (`NODE_V8_COVERAGE`) merged across all nine JS suites,
`coverage.py` for the Python side, plus reference sweeps. Coverage was taken
from the test suites only — the pipeline build and the golden-board walkthrough
are noted per finding where they change the verdict, because **zero test
coverage is not the same as dead code** and treating it as such would delete
the entire live-sync path.

---

## 0.1 Coverage

17 of 350 named JS functions never executed under any suite. Broken down by
what that actually means:

| Function | Verdict | Evidence |
|---|---|---|
| `mcts.sampleOpponentPick` | **DEAD** | zero coverage, zero external refs, zero internal callers |
| `survival.tendencyReasons` | **DEAD** | zero coverage, zero external refs, zero internal callers |
| `engine.matchPreset`, `engine.rankDiff`, `engine.autoWeights` | alive | called from `app.js`; exercised in the browser, not in node |
| `mcts.nodeCount`, `mcts._internal.rootId` | unused accessors | no caller anywhere; trivial, but they are surface |
| `sync.*` (10 functions) | alive, **untested** | the whole live-sync path — poll, fetchDraft, allPicks, addManual, currentPickNumber — has no node coverage at all |

`sampleOpponentPick` is dead **because of my own change earlier today**: the
rollout was switched to `fastOpponentPick` for speed, and the tree's chance
nodes call `S.positionProbabilities` / `S.withinPositionProbability` directly.
Nothing calls it any more. That is exactly the transitive orphaning Phase 1
step 11 exists to catch, and it appeared within hours of the optimization that
caused it.

`tendencyReasons` was written for the threat-board UI and never wired up.

**`app.js` is absent from this table entirely** — it is browser-only and never
loaded by a node suite, so coverage says nothing about it. Any dead code there
is invisible to this method. Listed as a known gap, not a clean bill.

## 0.2 Unused exports, unread config, unconsumed artifact fields

**Export surface.** 27 symbols are exported but imported by no other file.
Almost all have internal callers — they are export bloat, not dead code, and
deleting the *export* is safe while deleting the *function* would break the
module. Only the two above are genuinely dead. Full list in the commit's
command output.

**Config keys.** Every key in `league_config.json` is read somewhere. Nothing
to delete.

**Artifact fields never consumed by the client** — verified by direct
reference search, 0 refs each:

- `kept_player_ids` (top level)
- `pos_rank`, `proj_baseline`, `proj_sd`, `weekly_sd` (per player)

Removing all five shrinks the artifact **12.2%** (114,403 → 100,454 bytes raw).

**But `proj_sd` and `weekly_sd` must NOT be deleted.** They are the variance
inputs the quantile value function needs, and the sequencing rule is explicit:
never delete a mechanism before its replacement lands. Their being unread today
is itself the finding — the pipeline computes and ships variance that nothing
consumes, which is the same shape as this codebase's five prior silent-absence
bugs, just pointed the other way. `pos_rank`, `proj_baseline` and
`kept_player_ids` have no such claim on the future and are Phase 1 candidates.

## 0.3 Parallel implementations

Checked: scoring, keeper adjustment, survival, VORP, ADP fitting.

- **Scoring: clean.** One path — `draft/scoring.py::score_stat_line`.
  `src/sleeper.js` matches on "score" only for game scores, not fantasy points.
- **Survival: clean.** One implementation, in `survival.js`.
- **Keeper adjustment: two by design** (`keepers.py` / `keepers.js`), which the
  work order keeps deliberately as cross-validation twins. 38 parity checks.
- **Replacement level: not a duplicate.** `value.js::replacementLevels` reads
  the artifact's `replacement` field first and only derives a value when it is
  absent — a declared fallback, not a second source of truth.

**FOUND — roster legality is implemented six times.** The flex-eligibility
table `{FLEX:[RB,WR,TE], SUPER_FLEX:[...], REC_FLEX:[...]}` is written out
independently in:

```
public/js/draft/engine.js:245     starterSlotMarginal
public/js/draft/survival.js:344   positionProbabilities
public/js/draft/value.js:50       bestLineup
public/js/draft/mcts.js:76        unmetNeeds
public/js/draft/app.js:1338       roster rendering
draft/config_schema.py:21         the Python side
```

This is not a scoring duplicate, so it does not violate the single-scoring-path
rule literally — but it is the same failure mode one level down. The MCTS hard
legality filter, the value function's lineup construction and the composite's
need term each decide independently what counts as a filled slot. If the league
ever adds a SUPER_FLEX, six places must change together, and a miss would let
the filter and the value function disagree about what a legal roster is —
silently, because each is internally consistent.

**Filed, not fixed.** Consolidating it changes behaviour if any of the six has
drifted already, and this pass is not allowed to change behaviour. It needs its
own change with its own tests, starting by proving the six are currently
equivalent.

## 0.4 Baselines

| | |
|---|---|
| artifact, raw | 114,403 bytes |
| artifact, gzipped | 16,529 bytes |
| engine suite | 80 ms |
| survival suite | 36 ms |
| betlogic suite | 73 ms |
| **mcts suite** | **4,455 ms** |
| python suite (73 checks) | 606 ms |

The MCTS suite is 55× the next slowest and is the obvious Phase 2 profiling
target. Note it runs a 1,500- and a 2,100-iteration search for the tree-reuse
equivalence check, so some of that is the test being thorough rather than the
code being slow — Phase 2 has to separate those before Phase 3 touches
anything.

**Not yet captured:** golden-board full-precision output, pipeline wall time
per stage, and the client timings on the real device. The pipeline baseline
needs a network build (this sandbox has none) and the client timings need the
draft-day phone. Both are prerequisites for Phase 3 and are honestly outstanding
rather than skipped.

## Blocked

Phase 1 items **1 (`UpsideBonus`)** and **2 (flat bench discount)** are blocked
and must not proceed: the quantile blend and BenchValue do not exist in this
codebase. Deleting either now would remove the only upside and bench logic
there is, which the sequencing note rules out explicitly — *"a fast codebase
with no upside logic is not an optimization."*

Items 6, 7 and 8 (A5 pick-pair, Monte Carlo scaffolding, sequential survival
reformulation) are **not applicable** — none was ever built. Confirmed by
search; there is nothing to delete.
