# TERRITORY: A
# Artifact-freshness infrastructure — the permanent fix (2026-08-16)

## 1. Cory's directive, verbatim

> "we need to fix this permanently" — referring to the `repo_parity` pattern
> requiring individual, manual, per-test intervention every single time a new
> artifact-producing study is built. It has now happened for own_model_v2-v6,
> model_accuracy_backtest, source_weight_prior, playoff_sos, replay_all_seats,
> draft_replay_2025, variance_inputs, adp_sd_measured, props_season_projection,
> and counting — a real, recurring cost, not a one-off.

The diagnosis (`draft/audit/rebuild_refusal_diagnosis_2026-08-16.md`, five
passes across one day, §§5-8) traced every one of those interventions to the
same root cause, restated here because it is the reason this fix takes the
shape it does:

1. **CODE CORRECTNESS** — "does this function, run on ANY fixed input,
   deterministically reproduce its own committed output" — a question that
   should be a hard, always-green gate test.
2. **ARTIFACT FRESHNESS** — "does the committed artifact still match what the
   code would produce against TODAY's live board/inputs" — a staleness
   question, expected to go red periodically as the board legitimately
   changes, and never a hard pytest pass/fail gate item.

`draft/tests/test_X_matches_regeneration` functions conflated the two: they
asked question 2 with a pytest `assert`, so every legitimate board move
turned into a red test, and every red test needed a human to look at it,
conclude "the board moved, not the code," hand-add
`@pytest.mark.repo_parity`, and hand-add the node id to
`test_gate_selection.py`'s pinned list. Ten studies, ten manual
interventions, for the same fact pattern each time.

## 2. The fix, in one sentence

Move question 2 out of pytest entirely, into ONE central, append-only
registry (`draft/data/artifact_registry.json`) and ONE generic, informational
script (`draft/tools/check_artifact_freshness.py`) that any study registers
with a single entry instead of writing a new bespoke test.

## 3. Before / after

**Before** (ground truth: `draft/tests/test_gate_selection.py`'s
`REPO_PARITY_NODES`, as of this pass's start — the pinned set is the honest
inventory of what was marked, per the file's own docstring: "the ground
truth of what's currently marked"):

- **17 marked pytest nodes** (11 `@pytest.mark.repo_parity`-decorated test
  functions; the ADP-band ratchet counts as 4 parametrized nodes from one
  function): `test_model_accuracy_backtest`, `test_own_model_v2` through
  `v6` (5), `test_source_weight_prior`, `test_adp_sd_measured` (4 params),
  `test_playoff_sos` (2 nodes), `test_weekly_own_projection`,
  `test_draft_replay_2025`, `test_replay_all_seats`,
  `test_props_season_projection`.
- Every one of those required, at the time it was added: a human or agent
  reading a CI failure, re-deriving that the failure was "the board moved,"
  writing (or re-using) the marker, and hand-editing
  `test_gate_selection.py`'s pinned list under review.
- `pytest draft/tests -q` (no `-m` filter — the "advisory pre-build step" /
  local-dev invocation) was red on **12 of those 17** on this same tree, on
  this same day, before any change in this pass — not because anything was
  broken, but because the board and its inputs had moved since each artifact
  was committed. That noise is exactly the cost Cory named.

**After**:

- **11 of those 17 nodes are migrated OUT of pytest entirely** — their
  bespoke `test_X_matches_regeneration` functions and
  `@pytest.mark.repo_parity` decorators are removed from
  `test_model_accuracy_backtest.py`, `test_own_model_v2.py` through
  `v6.py`, `test_source_weight_prior.py`, `test_playoff_sos.py` (the
  object-parity node only — its coverage node is unrelated, see §5),
  `test_draft_replay_2025.py`, `test_replay_all_seats.py`, and
  `test_props_season_projection.py`. Each is now ONE entry in
  `draft/data/artifact_registry.json`, checked by
  `draft/tools/check_artifact_freshness.py`.
- **6 nodes remain hand-marked** — a real, honest, SMALLER pin, not zero,
  because they are a genuinely different species (§5): the 4 ADP-band
  ratchet params, playoff_sos's coverage/partition pin, and the weekly
  workflow-YAML parse check.
- `test_gate_selection.py`'s `REPO_PARITY_NODES` shrank from 17 to 6 and its
  three tests still pass, proving the gate's `-m "not repo_parity"`
  deselection is exactly that smaller set.
- `pytest draft/tests -q` (no filter) is now red on exactly **2** of those
  remaining 6 (both fetch/board-drift-sensitive by design, exactly as
  before — see §6) instead of 12.
- Nothing was lost: `check_artifact_freshness.py` reports the exact same
  10-of-11 STALE / 1-of-11 FRESH split the removed pytest tests used to
  report, on the same tree, on the same day (§6). Static shape and
  cross-artifact-identity assertions that were bundled into the same
  removed test functions but never depended on regeneration were kept, as
  new unmarked always-green tests, in the same files (§4).

## 4. What "migrate" meant in practice, file by file

Several of the removed test functions were NOT pure freshness checks — they
bundled a regen-vs-committed comparison together with static assertions
(artifact shape, or a cross-check between two already-COMMITTED artifacts,
e.g. own_model_v4's artifact against own_model_v3's) under one
`@pytest.mark.repo_parity` decorator, because pytest marks apply to a whole
function. Deleting the whole function would have silently dropped those
static checks — they never depended on the board and were never the
`repo_parity` concern. So the migration split each one:

| File | Regen-comparison (removed → registry) | Static / cross-artifact checks (kept, new unmarked test) |
|---|---|---|
| `test_model_accuracy_backtest.py` | `grade()` vs `model_accuracy_2025.json` | (none bundled — file already had a separate `test_the_artifact_records_the_honest_negative`) |
| `test_own_model_v2.py` | `V2.run()` vs `model_accuracy_v2.json` | `test_artifact_names_what_is_missing_and_never_masquerades_as_fitted` |
| `test_own_model_v3.py` | `V3.run()` vs `model_accuracy_v3.json` | `test_artifact_shape_and_protocol_identity_with_v2_baselines` (cross-checks against the COMMITTED v2 artifact) |
| `test_own_model_v4.py` | `V4.run()` vs `model_accuracy_v4.json` | `test_artifact_shape_and_protocol_and_arm_identity_with_v3` |
| `test_own_model_v5.py` | `V5.run()` vs `model_accuracy_v5.json` | `test_artifact_shape_and_protocol_identity_with_v4` |
| `test_own_model_v6.py` | `V6.run()` vs `model_accuracy_v6.json` | `test_artifact_shape_and_composition_identity_with_both_parents` |
| `test_source_weight_prior.py` | `build_artifact()` vs `source_weight_prior.json` | (none bundled — `test_shipped_verdict_is_the_honest_negative` was already separate and unmarked) |
| `test_playoff_sos.py` | `S.compute()` vs `playoff_sos_2026.json` (object-parity node only) | (none bundled; the coverage node is untouched, see §5) |
| `test_draft_replay_2025.py` | `R.run()` vs `draft_replay_2025.json` | (none bundled — the `artifact` fixture is shared with many other, already-unmarked tests) |
| `test_replay_all_seats.py` | `A.run()` vs `replay_league_table.json` | (none bundled, same shape) |
| `test_props_season_projection.py` | `_v6_predictions` + `_grade_models` reproduction vs `model_accuracy_v6.json`'s `arm_2025.models.own_v6.cells` | (none bundled) |

The cross-artifact checks that were kept (v3-vs-v2, v4-vs-v3, v5-vs-v4,
v6-vs-v5-and-v4) compare two files that are BOTH already committed, static,
on-disk documents — neither side is regenerated, so nothing about them ever
depends on the board or goes stale. They belong in pytest as ordinary,
always-green code-correctness tests, and now they are exactly that: no
longer riding along under a `repo_parity` marker that implied they could
legitimately go red when the board moved (they cannot).

## 5. What did NOT migrate, and why

`draft/data/artifact_registry.json`'s `_not_yet_migrated` section carries
this list too, so it is discoverable from the registry itself, not only this
doc. The test for registry membership is: *does this check regenerate an
artifact from a Python function and diff the result against a COMMITTED
artifact file of essentially the same shape?* Three remaining nodes fail
that test on their own terms, not because migrating them was unsafe:

- **`test_adp_sd_measured.py`'s 4-param ratchet** grades `keepers.py`'s
  shipped dispersion CONSTANT against TODAY'S freshly fetched FantasyPros
  market dispersion — there is no committed artifact file on either side of
  the comparison to diff against; the "artifact" IS the live board's own
  `adp_sd` column, read as-is. This is a market-drift ratchet, not an
  artifact-freshness check, and the registry's shape (regenerate, diff
  against a committed JSON) does not fit it.
- **`test_playoff_sos.py::test_every_board_skill_player_is_ranked_or_honestly_absent`**
  checks that the committed SOS artifact's `players`/`players_absent` keys
  PARTITION the live board's player-id set — a coverage/membership check,
  not an equality diff. (Its sibling, the object-parity node, DID migrate —
  see §4.)
- **`test_weekly_own_projection.py::test_own_weekly_workflow_yamls_parse_and_carry_dry_run`**
  parses two repo workflow YAML files and is marked `repo_parity` /
  `importorskip`'d because the gate's CI venv carries no `pyyaml` — a
  missing-library concern, unrelated to board or artifact staleness. It
  asserts nothing about any board or artifact.

Also explicitly left alone per this pass's scope instruction: anything
`fetch_weekly_props.py`-adjacent, because the weekly-props study
(`draft/tools/fetch_weekly_props.py`, `draft/weekly_props_arm.py`,
`.github/workflows/weekly-props-fetch.yml`) was still mid-flight per
ROUTES.md as of this pass (its own ROUTES entry says "NEXT PHYSICAL STEP,
COSTS REAL CREDITS" — the real fetch had not been dispatched yet). Checked
directly: none of that study's own test files
(`test_fetch_weekly_props.py`, `test_weekly_props_arm.py`,
`test_weekly_props_grading_roundtrip.py`) currently carry
`@pytest.mark.repo_parity`, so there was nothing of theirs to migrate in
this pass — but a future pass should check again once that study lands and
produces its own committed artifact, rather than assuming it stays clear.
`test_weekly_own_projection.py`'s workflow-parse node (see above) touches a
DIFFERENT pair of workflow files (`own-weekly-proj.yml` /
`own-weekly-grade.yml`, not `weekly-props-fetch.yml`) and was left unmarked
for its own (library-availability) reason, not the weekly-props stay-out.

Also confirmed out of scope and untouched: `engine_ablation`,
`breakout_equity`, `edge_hunt`, `rookie_prior`, `textbook_crosscheck`,
`te_rb_correlation` — none of their test files carry
`@pytest.mark.repo_parity` as of this pass, so there was nothing to migrate
there either; `variance_inputs`'s test file likewise carries no
`repo_parity` marker despite being named in Cory's list of studies that hit
this pattern (its self-consistency test is pinned against the artifact's own
internal identities, not a regeneration).

## 6. Verification — nothing was lost

Every claim above is checked mechanically, not asserted from memory:

1. **The freshness script reproduces exactly what the removed tests used to
   catch.** Run on this tree, same day, before vs. after the migration:

   ```
   $ python3 draft/tools/check_artifact_freshness.py
   STALE  model_accuracy_backtest
   STALE  own_model_v2
   STALE  own_model_v3
   STALE  own_model_v4
   STALE  own_model_v5
   STALE  own_model_v6
   STALE  source_weight_prior
   STALE  playoff_sos
   STALE  draft_replay_2025
   FRESH  replay_all_seats
   STALE  props_season_projection_v6_reproduction

   1 fresh, 10 stale, 0 errored, 11 total.
   ```

   Cross-checked against a full unfiltered `pytest draft/tests -q` run
   BEFORE this pass's edits: the 10 STALE entries above are exactly the 10
   of that run's 12 failures that correspond to a migrated node (the other
   2 failures — `test_adp_sd_measured[50-100]` and playoff_sos's coverage
   node — are the two that stayed hand-marked, §5, and are unrelated to
   this migration). `replay_all_seats` was the one node that PASSED in that
   same run, and it is the one entry the script reports FRESH. Exit code 0
   both times — zero errors, confirming every `regenerate_command` runs
   cleanly; STALE is reported, never a crash.

2. **Full suite, after the migration:**
   `pytest draft/tests -q` → **2709 passed, 5 skipped, 2 failed** (the 2
   remaining hand-marked nodes that happen to be red today because the
   market/board moved — expected, documented, not a regression; before this
   pass the same invocation was 2705 passed / 5 skipped / 12 failed on
   this tree).

3. **Gate selection, after the migration:**
   `pytest draft/tests -q -m "not repo_parity"` → **2705 passed, 5 skipped,
   6 deselected** — fully green, deselecting exactly the smaller 6-node set.

4. **The pin proves itself:** `pytest draft/tests/test_gate_selection.py -q`
   → 3 passed — the marked set equals the pinned `REPO_PARITY_NODES` (now 6
   nodes) and the gate's own `-m` expression (parsed from
   `.github/workflows/draft-data.yml`, never retyped) deselects exactly
   that set.

5. **All edited files compile:** `python3 -m py_compile` on every touched
   test file plus the two new tool files — clean.

No change was made to `.github/workflows/draft-data.yml`'s gate invocation
(`-m "not repo_parity"`) — it did not need one; the marked-set shrinking is
transparent to it.

## 7. The registry format

`draft/data/artifact_registry.json` — one JSON object, `entries: [...]`,
each entry:

```json
{
  "id": "own_model_v6",
  "description": "human-readable one-liner",
  "owner_module": "draft/backtest/own_model_v6.py",
  "artifact_path": "draft/backtest/model_accuracy_v6.json",
  "regenerate_command": ["python3", "-c", "<python that prints JSON to stdout>"],
  "compare_keys": ["optional.dotted.path", "..."],
  "timeout_s": 120
}
```

- `regenerate_command` is argv (a list), run with `cwd` at the repo root —
  no shell quoting to get wrong. Any runnable command works; every entry in
  this pass uses a `python3 -c` one-liner that imports the study's module
  and calls its existing `run()` / `compute()` / `build_artifact()` /
  `grade()` — the SAME function each study's own `main()` already calls to
  write the committed file, so the freshness check and the "how do I
  regenerate this for real" answer are the same command family.
- `compare_keys` is optional. Omit it to diff the whole committed document
  against the whole regenerated document. Set it (a list of dotted paths)
  when the regeneration only reproduces a SUBSET of a committed artifact —
  `props_season_projection_v6_reproduction` is the worked example: it
  reproduces `own_model_v6`'s construction independently and checks the
  result against `arm_2025.models.own_v6.cells` inside
  `model_accuracy_v6.json`, a file owned by a different study entirely.
- `timeout_s` is optional (default 120s in the script); the two replay
  studies (draft_replay_2025, replay_all_seats — full draft simulations)
  set it to 300.

The registry's own top-level `_pattern` field documents this same format,
in the file itself, for the next study — that is the actual "permanent"
part of the fix per Cory's directive point 5: the next study that produces
a regeneratable artifact adds ONE entry instead of writing a new bespoke
`test_X_matches_regeneration` function. `_not_yet_migrated` documents the
species that don't fit and stay hand-marked, so nobody re-discovers §5's
reasoning from scratch.

## 8. `check_artifact_freshness.py` — the contract

- Iterates the registry; for each entry, runs `regenerate_command`, parses
  its stdout as JSON, loads the committed artifact, and does a tolerant
  (small float epsilon, to absorb genuine dict/set-iteration-order fp noise
  without hiding a real drift) recursive diff.
- Prints `FRESH <id>` or `STALE <id>` with a best-effort reason (the first
  few differing leaf paths; a short list of field-name hints like
  `built_at` / `snapshot_date` is checked to name an obvious cause when
  present) — informational only.
- **Never exits nonzero for staleness.** STALE is the expected, normal
  state of an artifact whose inputs moved since it was committed.
- **Does exit nonzero if a `regenerate_command` itself crashes, times out,
  or prints something that is not valid JSON** — that is a real bug (a
  broken study, or a broken registry entry), and the script deliberately
  does not let that hide inside a STALE report. This distinction is the
  whole point and is preserved exactly as Cory specified it.
- `--id <name>` (repeatable) to check a subset; `--verbose` to print every
  differing leaf instead of the first three.

## 9. Wired into `scripts/verify-relay-session.sh`

A new, clearly-labeled section, `== ARTIFACT FRESHNESS (informational,
never blocks) ==`, runs `check_artifact_freshness.py` and prints its
summary — placed between the existing "artifact consistency" section and
the territory-gate section, so anyone running the verify script sees the
whole staleness picture in one place instead of hunting through pytest's
full (unfiltered) output for which of the 6 remaining `repo_parity` nodes
are red today and why. It does not count toward the script's PASS/FAIL
tally or its exit code — a nonzero exit from the freshness script itself
(meaning a `regenerate_command` crashed) is called out with a one-line
note, but does not fail the verify run either, matching "informational,
never blocks" literally. (The verify script's existing §1 already runs the
filtered gate-selection suite as one of its real PASS/FAIL checks — that is
unchanged.)

## 10. Follow-up left for later (recorded on ROUTES.md TO:A)

- The weekly-props study (§5) should be re-checked once it lands for real
  artifacts — at that point it likely earns its own registry entries rather
  than a new bespoke test, per the pattern this pass establishes.
- The three remaining hand-marked nodes (§5) are a stable, small, honestly
  different species — no further migration work is owed on them unless
  their own shape changes (e.g. if `test_adp_sd_measured` grows a committed
  fixture-artifact of its own).
