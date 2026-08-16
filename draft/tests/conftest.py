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

`draft/tests/test_gate_selection.py` pins the marked set to an explicit
list and proves the workflow's gate expression deselects exactly that set
and nothing else.
"""


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "repo_parity: committed-artifact == regeneration pins (anti-hand-edit "
        "guards on repo state). Run in every normal pytest invocation; "
        "deselected ONLY by draft-data.yml's publication gate, where the "
        "regeneration inputs were just rebuilt and a mismatch says the board "
        "is new, not that it is bad.")
