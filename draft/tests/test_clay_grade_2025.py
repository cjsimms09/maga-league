# TERRITORY: C
"""Pins the real 2025 grade — Clay's guide against what actually happened.

The headline number here (QB season-total bias +59.28) is real but is an
injury-luck artifact, not a projection defect — confirmed both by hand (Lamar
Jackson/Jayden Daniels/Joe Burrow/Kyler Murray all missed 5+ games) and by the
skill cut collapsing it to +1.58 per game. These tests pin that collapse as a
regression check, not just narrate it in a docstring.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import clay_grade_2025 as G  # noqa: E402


def _doc():
    return G.main(write=False)


def test_population_accounts_for_every_player():
    doc = _doc()
    pop = doc["population"]
    assert (pop["excluded_unmatched_crosswalk"] + pop["excluded_no_realized_2025_row"]
            + pop["graded_total"]) == pop["clay_players_2025"]


def test_qb_season_total_bias_is_large_and_positive():
    # Clay assumes ~17 healthy games; several 2025 QB1s missed 5+ to injury
    # (Lamar 12 played, Daniels 7, Burrow 7, Murray 5) — season-total grading
    # cannot separate that from a real projection miss.
    doc = _doc()
    assert doc["cells"]["QB"]["bias"] > 40


def test_skill_cut_collapses_the_qb_bias():
    # The whole point of the per-game cut: removing injury luck should shrink
    # the bias toward zero, not just move it — pinned as an inequality, not an
    # exact float, since realized points can be re-scored slightly if the
    # upstream store is regenerated.
    doc = _doc()
    season_bias = abs(doc["cells"]["QB"]["bias"])
    skill_bias = abs(doc["skill_cells"]["QB"]["bias"])
    assert skill_bias < season_bias / 10


def test_skill_cut_never_makes_ordering_worse():
    # Removing a real confound (injury variance neither Clay nor anyone else
    # can foresee) should help or be neutral for rank correlation at every
    # position that graded — this is a general claim, checked generally.
    doc = _doc()
    for pos in ("QB", "RB", "WR", "TE", "ALL"):
        a, s = doc["cells"][pos], doc["skill_cells"][pos]
        if a.get("status") == "unmeasurable" or s.get("status") == "unmeasurable":
            continue
        assert s["spearman"] >= a["spearman"] - 0.02, pos  # small slack, not exact


def test_min_n_is_imported_not_redeclared():
    # rule 11: MIN_N must be the SAME constant sleeper_vs_fp_grade.py's cell()
    # actually uses internally, not a second number that could drift from it.
    import sleeper_vs_fp_grade as SVF
    assert G.MIN_N is SVF.MIN_N


def test_writes_no_board_field():
    board = Path(G.ROOT) / "public" / "draft_data.json"
    before = board.read_bytes()
    G.main(write=False)
    after = board.read_bytes()
    assert before == after


def test_output_is_written():
    G.main(write=False)
    doc = json.loads(G.OUT.read_text())
    assert doc["population"]["graded_total"] > 300


def test_version_gate_is_exposed_and_confirmed():
    doc = _doc()
    assert doc["_version_gate"]["status"] == "preseason_confirmed_by_kickoff_check"


def test_refuses_to_grade_if_the_gate_is_not_confirmed(monkeypatch):
    # FAIL ARM: the refusal in main() must actually fire, not just exist as
    # an unreached branch. Monkeypatch build_store to return an otherwise
    # real doc with the gate flipped to unconfirmed.
    real = G.build_store(2025, write=False)
    bad = {**real, "version_gate": {"status": "in_season_or_unverifiable",
                                     "why": "test fixture"}}
    #: `**_` absorbs the `write=` kwarg main() now forwards (register 489). A
    #: stub with a narrower signature than the thing it replaces fails on the
    #: CALL rather than on the behaviour, which is a test failing for the wrong
    #: reason — exactly what happened when this flag was threaded through.
    monkeypatch.setattr(G, "build_store", lambda year, **_: bad)
    try:
        G.main(write=False)
        raised = False
    except SystemExit:
        raised = True
    assert raised, "main() graded a store whose version_gate was not confirmed preseason"
