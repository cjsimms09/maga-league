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
    config.addinivalue_line(
        "markers",
        "post_chain: asserts an invariant that only EXISTS after the "
        "post-processing chain (blend + Draft Sharks attach). It is a real "
        "assertion ON the published board and is NOT repo_parity -- this "
        "conftest's own rule is that anything asserting a value on the "
        "candidate board stays unmarked, and that rule is not being bent. "
        "It is marked because the acceptance gate moved: the gate now runs "
        "BEFORE post-processing (so it grades what the builder produces), "
        "and a test of Draft Sharks bands cannot pass on a board that has "
        "no Draft Sharks bands yet. These tests are DESELECTED in the "
        "pre-chain gate and run EXPLICITLY in the post-chain step of "
        "draft-data.yml, which the independent audit required. Marking one "
        "of these WITHOUT adding it to that post-chain step would delete "
        "the check -- if you mark a test here, add it there in the same "
        "commit.",
    )


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    """A RED RUN MUST SAY WHETHER THE MACHINE IS THE PROBLEM (register 457).

    Register 378 exists because a `ModuleNotFoundError` renders in a pytest
    summary EXACTLY like a defect — same red FAILED line, same node id — and on
    2026-08-27 that cost an hour and eight false findings. The fix shipped then
    was `check_python_env.py`, plus a session-start hook that runs it.

    ⚠️ THAT WAS NOT ENOUGH, AND 2026-09-01 IS THE PROOF. The hook ran at session
    start and printed "✅ every declared distribution is installed". The
    container later lost FIVE of them, and the next suite run produced eight red
    tests whose names promise pure logic — `test_best_table_REJECTS_a_small_-
    table`, `test_regenerate_ON_AN_EMPTY_PLAYER_INDEX_IS_ALSO_VOID`. I read them
    as churn-sensitivity findings and had started writing them up as such.

    A check that runs only at session start answers a question that can stop
    being true an hour later. So the answer now travels WITH the red run, in the
    same output, at the moment somebody is looking at it — which is the only
    moment it matters.

    Deliberately silent on a green run: a healthy suite needs no environment
    footnote, and a banner nobody needs is a banner everybody learns to skip.
    """
    if not terminalreporter.stats.get("failed") and not terminalreporter.stats.get("error"):
        return
    try:
        import subprocess
        import sys as _sys
        from pathlib import Path as _Path
        tool = _Path(__file__).resolve().parents[1] / "tools" / "check_python_env.py"
        if not tool.exists():
            return
        out = subprocess.run([_sys.executable, str(tool)], capture_output=True,
                             text=True, timeout=30).stdout
        if "MISSING" not in out:
            return
        terminalreporter.write_sep("=", "ENVIRONMENT, NOT NECESSARILY CODE", red=True)
        terminalreporter.write_line(out.strip())
        terminalreporter.write_line(
            "  ⚠️  Some or all of the failures above may be this, not a defect. "
            "Install and re-run BEFORE reading any of them as a finding "
            "(register 378, and register 457 for why this prints here rather "
            "than only at session start).")
    except Exception:
        # This is a diagnostic. It must never turn a green run red or add a
        # second failure to a red one.
        return
