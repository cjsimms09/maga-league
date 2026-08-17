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

2026-08-16, later the same day: eleven of the pins this file used to track
were migrated OUT of pytest entirely into draft/data/artifact_registry.json +
draft/tools/check_artifact_freshness.py (the permanent fix — see
draft/audit/artifact_freshness_infra_2026-08-16.md), so this mechanism now
guards a much smaller, real remainder. See REPO_PARITY_NODES below for what
is still here and why each one does not fit the registry's shape.

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
#: else.
#:
#: 2026-08-16, artifact-freshness infra (draft/audit/
#: artifact_freshness_infra_2026-08-16.md): the ELEVEN committed-artifact ==
#: regeneration pins that used to live here (model_accuracy_backtest,
#: own_model_v2-v6, source_weight_prior, playoff_sos's object-parity pin,
#: draft_replay_2025, replay_all_seats, props_season_projection's v6
#: reproduction) are MIGRATED OUT of pytest entirely, into draft/data/
#: artifact_registry.json + draft/tools/check_artifact_freshness.py — a
#: single generic, informational (never-blocking) tool that replaces one
#: bespoke test function per study. Their bespoke test_X_matches_regeneration
#: functions and @pytest.mark.repo_parity decorators are REMOVED from their
#: files (static shape / cross-artifact-identity assertions that were bundled
#: into the same functions but do NOT depend on regeneration were kept, as
#: new unmarked always-green tests, in the same files). Confirmed nothing was
#: lost: `python3 draft/tools/check_artifact_freshness.py` reports the exact
#: same STALE set the removed pytest tests used to fail on (10 of 11 STALE,
#: replay_all_seats FRESH, zero errors — 2026-08-16, cross-checked against a
#: full `pytest draft/tests -q` run on the same tree).
#:
#: What remains here is the species that does NOT fit "committed artifact vs
#: regeneration of that SAME artifact" and so was deliberately left as a
#: hand-marked pytest test (draft/data/artifact_registry.json's
#: `_not_yet_migrated` section carries the same list with reasons):
#:   · the 4 ADP-band ratchet params — keepers.py's shipped constant graded
#:     against TODAY'S freshly fetched FFC market dispersion, not against a
#:     committed artifact;
#:   · playoff_sos's OTHER pin — committed-artifact COVERAGE of the live
#:     board's player set (a partition, not a diff);
#:   · the weekly workflow-YAML parse check — marked because the gate venv
#:     carries no pyyaml, not because of board/artifact staleness.
#: Adding a marker to any other test WILL fail this file until the addition
#: is recorded here — that is the point, not an inconvenience.
REPO_PARITY_NODES = {
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[1-25]",
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[25-50]",
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[50-100]",
    "draft/tests/test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[100-150]",
    "draft/tests/test_playoff_sos.py::test_every_board_skill_player_is_ranked_or_honestly_absent",
    "draft/tests/test_weekly_own_projection.py::test_own_weekly_workflow_yamls_parse_and_carry_dry_run",
    # Added 2026-08-17. A THIRD shape again, and the registry's
    # committed-artifact-vs-regeneration check structurally cannot cover it:
    # the pre-draft freeze must NEVER be regenerated to compare against — a
    # freeze regenerated today IS the thing it exists to protect against, and
    # `freeze_pre_draft` refuses to overwrite for exactly that reason (no
    # --force). So the check is committed-artifact-vs-its-OWN-DECLARATION:
    # every field in PLAYER_FIELDS must appear on at least one frozen row.
    #
    # It is red today and correctly so — the 08-14 freeze predates FOURTEEN of
    # its declared fields, all fourteen of which the live board carries. Its
    # failure says the ARTIFACT is old, never that the candidate board is bad,
    # which is this set's defining property. The fix is a dated draft-day
    # action (delete by hand, re-freeze after the final board build).
    #
    # ONLY this node. The other two tests in that file are pure logic — they
    # touch no artifact and no board — and a module-level pytestmark that swept
    # them in here was refused by this very test, in the right words:
    # "soundness tests the gate would silently skip".
    "draft/tests/test_freeze_not_stale.py::test_the_freeze_carries_every_field_it_declares",
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
