# TERRITORY: A
"""Marker registry for the draft suite — one marker, one distinction.

`repo_parity` separates two questions this suite answers that CI kept
conflating (run 31926152660, 2026-08-16, sixteen refusals — diagnosis in
draft/audit/rebuild_refusal_diagnosis_2026-08-16.md):

  1. "Does the COMMITTED research artifact equal a regeneration from the
     inputs sitting in the tree?"  — the anti-hand-edit guard. Vital in the
     repo, where the inputs are exactly the ones the artifact was built
     from: any diff means the artifact was edited by hand or the code
     drifted from its own record.

  2. "Is the CANDIDATE BOARD internally sound?" — the publication gate's
     question, asked by draft-data.yml AFTER it has rebuilt the board and
     refreshed the stores the regeneration reads (public/draft_data.json's
     age/crosswalk rows, draft/data/proj_series.json's snapshot_dates,
     draft/data/player_positions.json). On any later day those inputs have
     legitimately moved, so question-1 tests fail BY CONSTRUCTION against
     yesterday's committed artifact — they refuse the board for being NEW,
     not for being BAD, and the gate can never pass on a genuinely fresh
     rebuild.

So: tests that pin committed-artifact == regeneration carry
`@pytest.mark.repo_parity`. A normal `pytest draft/tests` run includes them
— nothing is skipped, the anti-hand-edit guard stands exactly as before.
The ONE invocation that deselects them is the publication gate in
.github/workflows/draft-data.yml (`-m "not repo_parity"`), because there
the comparison's own inputs were just rewritten and a mismatch carries no
information about the candidate board. Board-soundness tests — field
purpose, season stamps, dormant players, replacement sensitivity, the
own-model column agreeing with a fresh run from committed stores — are NOT
marked and always run in the gate.

Run 31948330004 (2026-08-16, §7 of the same audit doc) widened the marked
family from one species to three, under the same single distinction — the
failure signal is about REPO/MARKET state, never about the candidate board:
  a. committed-artifact == regeneration pins (the original seven, plus the
     playoff-SOS object-parity pin, whose regeneration reads the board the
     gate just rebuilt);
  b. committed-artifact COVERAGE of the live board (playoff-SOS's
     ranked/absent partition: new Sleeper signings on a fresh board are
     neither, by construction);
  c. repo-constant-vs-today's-market ratchets and repo-file checks (the
     ADP-band dispersion ratchet, which grades keepers.py's shipped
     constant against the morning's fetched market; the weekly workflow
     YAML parse, which needs pyyaml the gate venv does not carry).
The test for membership is unchanged and it is the only test: could this
failure, on a freshly built board, be caused by nothing but the world
having moved since the artifact/calibration was committed? Yes -> marked.
Any arm that asserts a value ON the candidate board stays unmarked.

2026-08-16, artifact-freshness infra (draft/audit/
artifact_freshness_infra_2026-08-16.md): species (a) — EVERY committed-
artifact == regeneration pin, eleven of them by the time this landed — is
now handled OUTSIDE pytest, by draft/data/artifact_registry.json +
draft/tools/check_artifact_freshness.py: one central, append-only registry
and one generic, informational (never-blocking) script, instead of a new
bespoke `test_X_matches_regeneration` function and a new `repo_parity` mark
for every study that produces a regeneratable artifact. That recurring,
manual cost (own_model_v2 through v6, model_accuracy_backtest,
source_weight_prior, playoff_sos, draft_replay_2025, replay_all_seats,
props_season_projection — ten separate interventions for the same pattern)
is the thing Cory's ruling ("we need to fix this permanently") targets.
Species (b) and (c) do not fit the registry's committed-artifact-vs-
regeneration shape (a coverage/partition check and two ratchet-vs-live-
market checks, respectively) and remain hand-marked here — see
test_gate_selection.py's REPO_PARITY_NODES and the registry's own
`_not_yet_migrated` note for the current, smaller membership and why.

`draft/tests/test_gate_selection.py` pins the marked set to an explicit
list and proves the workflow's gate expression deselects exactly that set
and nothing else.
"""


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "repo_parity: pins on repo/market state — committed-artifact == "
        "regeneration, committed-artifact coverage of the live board, and "
        "repo-constant-vs-today's-market ratchets. Run in every normal pytest "
        "invocation; deselected ONLY by draft-data.yml's publication gate, "
        "where the comparison's own inputs were just rebuilt or refetched and "
        "a mismatch says the board is new, not that it is bad.")
