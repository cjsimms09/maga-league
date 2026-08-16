# TERRITORY: A
"""THE GATE'S SELECTION IS PINNED: it excludes exactly the repo_parity set.

Run 31926152660 (2026-08-16) proved the publication gate could never pass on
a genuinely fresh board: seven committed-artifact == regeneration pins fail
BY CONSTRUCTION once the nightly build rewrites the inputs the regeneration
reads. The fix (a `repo_parity` marker deselected only by the gate) opens
two new silent-failure lanes, and this file closes both:

  1. THE MARKER SPREADS. `-m "not repo_parity"` deselects whatever carries
     the marker — so one careless decorator on a board-soundness test would
     silently remove it from the gate, and the gate would go green on a
     defect it was built to refuse. The marked set is therefore pinned to an
     EXPLICIT node list; growing it must edit this file, in review.
  2. THE GATE'S EXPRESSION DRIFTS. If draft-data.yml's gate step stops
     saying `-m "not repo_parity"` (or says something broader), either the
     by-construction refusals come back or MORE than the parity set is
     excluded. The expression is read from the WORKFLOW FILE ITSELF
     (yaml.safe_load, never a copy typed here) and the selection it produces
     is measured with pytest's own collector, so what is proved is what runs.

Run: python3 -m pytest draft/tests/test_gate_selection.py -q
"""
import re
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "draft-data.yml"

#: The complete repo_parity set — every pin whose failure says the repo /
#: market state is NEW, never that the candidate board is BAD — and NOTHING
#: else. Two incidents built it, each node classified one line at a time in
#: rebuild_refusal_diagnosis_2026-08-16.md:
#:   · §6, run 31926152660: the 7 committed-artifact == regeneration pins
#:     whose regeneration inputs the nightly run itself rewrites (the other
#:     9 refusals were soundness and remain unmarked, in the gate);
#:   · §7, run 31948330004: the 2 playoff-SOS pins (committed artifact vs
#:     the just-rebuilt board — object parity and player-set coverage), the
#:     4 ADP-band ratchet params (keepers.py's shipped constant graded
#:     against the morning's fetched market dispersion), and the weekly
#:     workflow-YAML parse check (repo files + a gate venv without pyyaml).
#: Adding a marker to any other test WILL fail this file until the addition
#: is recorded here — that is the point, not an inconvenience.
REPO_PARITY_NODES = {
    "draft/tests/test_model_accuracy_backtest.py::test_the_COMMITTED_artifact_matches_regeneration",
    "draft/tests/test_own_model_v2.py::test_artifact_matches_regeneration_and_names_what_is_missing",
    "draft/tests/test_own_model_v3.py::test_artifact_matches_regeneration_and_reproduces_v2_baselines",
    "draft/tests/test_own_model_v4.py::test_artifact_matches_regeneration_and_reproduces_v3_bit_for_bit",
    "draft/tests/test_own_model_v5.py::test_artifact_matches_regeneration_and_reproduces_v4_bit_for_bit",
    "draft/tests/test_own_model_v6.py::test_artifact_matches_regeneration_and_reproduces_both_parents",
    "draft/tests/test_source_weight_prior.py::test_artifact_equals_regeneration",
    # §7 additions — run 31948330004 (2026-08-16 12:58Z, 8 failed / 2479 passed)
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[1-25]",
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[25-50]",
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[50-100]",
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[100-150]",
    "draft/tests/test_playoff_sos.py::test_committed_artifact_matches_a_fresh_run_of_the_tool",
    "draft/tests/test_playoff_sos.py::test_every_board_skill_player_is_ranked_or_honestly_absent",
    "draft/tests/test_weekly_own_projection.py::test_own_weekly_workflow_yamls_parse_and_carry_dry_run",
    # draft replay (2026-08-16): regeneration reads the tree's positions
    # record and board ages, both refreshed by the nightly board rebuild —
    # the same class as the own-model pins above.
    "draft/tests/test_draft_replay_2025.py::test_artifact_matches_regeneration",
    # all-seats league benchmark (2026-08-16): same class again — the
    # regeneration reads the tree's positions record, board ages, AND the
    # live board itself (roster-status verification + name map), all of
    # which the nightly board rebuild legitimately refreshes.
    "draft/tests/test_replay_all_seats.py::test_artifact_matches_regeneration",
    # historical-props study (2026-08-16): the read-only reproduction of
    # own_model_v6's construction (props_season_projection._v6_predictions)
    # is graded against the COMMITTED model_accuracy_v6.json — same class as
    # the own-model artifact-vs-regeneration pins above, since the
    # reproduction reads positions_record()/board_ages(), both refreshed by
    # the nightly board rebuild.
    "draft/tests/test_props_season_projection.py::test_v6_reproduction_matches_committed_model_accuracy_v6",
}


def _gate_step():
    # importorskip, not a bare import: run 31948330004 proved the gate venv
    # itself carries no pyyaml, so a bare import turned BOTH yaml-reading
    # guards here into board refusals — a missing library blocking a live
    # board, exactly the class this file exists to prevent. Where yaml is
    # absent these two guards SKIP (visibly, in the skip count) and the
    # marker-side pin below — which needs no yaml — still runs; where yaml
    # exists (every dev env, the pre-merge suite) they enforce in full.
    yaml = pytest.importorskip(
        "yaml", reason="pyyaml absent — workflow-expression guards skip; "
                       "the collector-side pin still enforces the marked set")
    wf = yaml.safe_load(WORKFLOW.read_text())
    steps = wf["jobs"]["build"]["steps"]
    gates = [s for s in steps
             if "Acceptance gate on the FRESH board" in (s.get("name") or "")]
    assert len(gates) == 1, "the publication gate step moved or forked"
    return gates[0], steps


def _gate_marker_expression():
    """The -m expression the gate actually passes to pytest, read from the
    workflow file — never retyped here, so this file cannot agree with a
    stale copy of the gate."""
    gate, _ = _gate_step()
    m = re.search(r'python -m pytest draft/tests\s+-q\s+-m\s+"([^"]+)"',
                  gate["run"])
    assert m, ("the gate step no longer invokes "
               "`python -m pytest draft/tests -q -m \"...\"` — if the "
               "invocation changed shape, re-derive this parse with it")
    return m.group(1)


def _collect(*extra):
    """Node ids pytest would run for draft/tests under the given options."""
    out = subprocess.run(
        [sys.executable, "-m", "pytest", "draft/tests", "--collect-only",
         "-q", "-p", "no:cacheprovider", *extra],
        cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert out.returncode in (0, 5), out.stdout + out.stderr
    return {line.strip() for line in out.stdout.splitlines()
            if "::" in line and not line.startswith(("=", "warning"))}


def test_the_workflow_gate_deselects_repo_parity_and_the_advisory_step_does_not():
    """Both invocations verified from the parsed YAML: the gate carries the
    exclusion; the advisory pre-build step keeps the FULL suite, because
    before the build the tree is as committed and the parity pins are
    meaningful there — that step is the anti-hand-edit check's nightly home."""
    gate, steps = _gate_step()
    assert _gate_marker_expression() == "not repo_parity", (
        "the gate's marker expression changed — anything narrower readmits "
        "the by-construction refusals, anything broader silently drops "
        "soundness tests from the gate")
    advisory = [s for s in steps
                if "Run acceptance tests" in (s.get("name") or "")]
    assert len(advisory) == 1
    # `python -m pytest` itself contains `-m`; what must be absent is a
    # marker expression AFTER the pytest invocation.
    assert not re.search(r"pytest\s+draft/tests.*\s-m\s", advisory[0]["run"]), (
        "the advisory pre-build step must run the FULL suite — it tests "
        "committed state, where the repo_parity pins are exactly meaningful")
    assert advisory[0].get("continue-on-error") is True


def test_the_marked_set_is_exactly_the_declared_nodes():
    """pytest's own collector, marker-side: `-m repo_parity` selects the
    pinned list, whole and nothing more. A marker that spread to a soundness
    test, or fell off a parity test, both land here."""
    marked = _collect("-m", "repo_parity")
    assert marked == REPO_PARITY_NODES, (
        "the repo_parity-marked set drifted from the pinned list.\n"
        "  unexpected marks (would VANISH from the publication gate): %s\n"
        "  lost marks (would refuse fresh boards by construction again): %s"
        % (sorted(marked - REPO_PARITY_NODES),
           sorted(REPO_PARITY_NODES - marked)))


def test_the_gate_selection_excludes_exactly_the_marked_set_and_nothing_else():
    """End to end with the gate's OWN expression: full collection minus the
    gate's collection == the pinned set. This is the sentence the fix rests
    on — the gate skips the seven regeneration pins and not one test more."""
    everything = _collect()
    gate_selected = _collect("-m", _gate_marker_expression())
    assert REPO_PARITY_NODES <= everything, (
        "pinned nodes missing from the suite itself: %s"
        % sorted(REPO_PARITY_NODES - everything))
    excluded = everything - gate_selected
    assert excluded == REPO_PARITY_NODES, (
        "the gate's deselection is not exactly the repo_parity set.\n"
        "  extra exclusions (soundness tests the gate would silently skip): %s\n"
        "  missing exclusions (fresh boards refused by construction again): %s"
        % (sorted(excluded - REPO_PARITY_NODES),
           sorted(REPO_PARITY_NODES - excluded)))
