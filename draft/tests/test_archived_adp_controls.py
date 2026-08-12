# TERRITORY: C
"""THE PROBE'S CONTROLS MUST FAIL WHEN THE REAL DEFECT RETURNS.

A control that passes no matter what is decoration. Each case here reintroduces a defect
that actually shipped and asserts the control catches it.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import archived_adp as X  # noqa: E402
import positive_control as PC  # noqa: E402

ROOT = HERE.parent.parent


def _known():
    p = ROOT / "public/draft_data.json"
    return X.board_names(json.loads(p.read_text())) if p.exists() else None


def test_every_control_PASSES_on_the_shipped_code():
    """If this fails, the probe is broken — which is the whole point."""
    r = PC.run(X.controls(_known()))
    assert r["ok"], [c for c in r["controls"] if not c["ok"]]
    assert r["n"] >= 4


def test_the_walk_control_FAILS_when_the_walk_stops_at_the_newest_capture():
    """The defect that reported NO BOARD AT THIS URL while a capture 19 days earlier
    passed the gate 15 of 15. The control feeds a dud newest and a good second."""
    got = X.first_serving_capture(
        [{"timestamp": "2", "original": "u"}, {"timestamp": "1", "original": "u"}],
        lambda u: b"" if u.endswith("2id_/u") else b"BOARD",
        tries=1,                      # <- the shipped defect, reintroduced
        judge=lambda b: {"is_board": b == b"BOARD"})
    assert got["state"] != "board", "tries=1 must NOT find the board behind the dud"
    # and the control declared for this is the one that would have caught it
    names = [c[0] for c in X.controls(None)]
    assert any("PAST a dud" in n for n in names)


def test_the_control_set_is_NOT_EMPTY_so_the_probe_is_never_UNCONTROLLED():
    """An empty control set certifies itself. MUTATION: return [] — every probe then
    reports UNCONTROLLED, which the scaffold catches, but only if something asserts the
    probe actually declares controls."""
    assert len(X.controls(None)) >= 4
    assert PC.run(X.controls(None))["uncontrolled"] is False


def test_the_name_control_is_SKIPPED_rather_than_FAKED_without_known_names():
    """A control run against invented names checks nothing and reports PASSED, which is
    worse than no control. MUTATION: synthesise names when the board is absent."""
    without = [c[0] for c in X.controls(None)]
    assert not any("REAL players" in n for n in without)
    k = _known()
    if k:
        assert any("REAL players" in n for n in [c[0] for c in X.controls(k)])
