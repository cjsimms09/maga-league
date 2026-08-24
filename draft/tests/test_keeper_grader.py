# TERRITORY: A
"""GUARDS FOR `keeper_vs_random.py` (register 289), pinned at the two places it
actually broke rather than by re-running the 73-keeper job.

WHAT BROKE, BOTH TIMES, AND WHY EACH GETS A TEST:

1. THE SECOND DRAFT OBJECT. I told Cory "43 keepers gradeable, 2023 had none".
   Both halves were false: I read `season["drafts"][0]` and stopped, and **2023
   carries TWO draft objects** — a 150-pick main draft with no keepers and a
   SEPARATE 30-pick keeper draft with thirty. The real n is 73. A season is a
   LIST of drafts and the first one is not the only one. `test_second_draft_
   object_is_not_invisible` is load-bearing: revert `run()` to `drafts[0]` and
   it fails, because its fixture puts the keepers in the second object exactly
   as the league does.

2. THE CONTRAST'S CONTROLS. Panel 2 grades the keeper against what a real pick
   at that round returned, and reports "NOT RESOLVED". **A comparison with no
   power and a comparison that correctly finds nothing print the same words** —
   which is Rule 3e's shape, a null that reads identically whether the
   instrument works or not. So panel 2 carries its own known-negative (halves of
   one population must NOT resolve) and known-positive (keepers vs R13-15 picks
   MUST resolve), and both gate the exit code. A gate that has never returned a
   positive has not been tested, only run: these tests BREAK each control in
   turn and assert the exit code moves and names the right one.

`contrast()` is also pinned against hand-computed arithmetic, because every
verdict in panel 2 is that one function.
"""
from __future__ import annotations
import importlib.util
import json
import statistics
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "draft" / "backtest" / "keeper_vs_random.py"


def _load():
    """Fresh module each time — these tests mutate module-level constants."""
    spec = importlib.util.spec_from_file_location("kvr_under_test", SRC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ───────────────────────── contrast() arithmetic ──────────────────────────

def test_contrast_matches_hand_computed_two_sample_z():
    K = _load()
    a = [0.9, 0.8, 1.0, 0.7]
    b = [0.5, 0.4, 0.6, 0.5]
    d, half, z = K.contrast(a, b)
    ma, mb = statistics.fmean(a), statistics.fmean(b)
    sa = statistics.pstdev(a) / (len(a) ** 0.5)
    sb = statistics.pstdev(b) / (len(b) ** 0.5)
    se = (sa * sa + sb * sb) ** 0.5
    assert d == pytest.approx(ma - mb)
    assert half == pytest.approx(1.96 * se)
    assert z == pytest.approx((ma - mb) / se)
    # and this particular pair is a real gap, so the verdict must be RESOLVED
    assert abs(z) > 1.96


def test_contrast_on_two_halves_of_one_population_does_not_resolve():
    """The known-negative's SHAPE: identical populations must not separate."""
    K = _load()
    v = [0.5 + 0.01 * ((i * 7) % 13 - 6) for i in range(60)]
    _, _, z = K.contrast(v[::2], v[1::2])
    assert abs(z) <= 1.96


def test_contrast_refuses_a_sample_too_small_to_have_a_variance():
    K = _load()
    d, half, z = K.contrast([0.5], [0.4, 0.6])
    assert d != d and half != half and z != z   # NaN, not a confident 0


# ─────────────────── the second-draft-object regression ───────────────────

def _fixture(tmp_path, keepers_in_second_draft: bool):
    """A season shaped like 2023: TWO draft objects, keepers in the second."""
    bt = tmp_path / "draft" / "backtest"
    bt.mkdir(parents=True)
    (tmp_path / "draft" / "data").mkdir(parents=True)

    # MIN_POOL is 20, so the points store needs comfortably more than that
    pts = {"p%02d" % i: float(200 - i * 3) for i in range(40)}
    (bt / "nflverse_weekly_points_2099.json").write_text(
        json.dumps({"weeks": [{"points": pts}]}))
    (tmp_path / "draft" / "data" / "player_positions.json").write_text(
        json.dumps({"positions": {k: "RB" for k in pts}}))

    main_draft = {"picks": [
        {"pick_no": n, "round": 1, "roster_id": 1, "player_id": "p%02d" % (n + 9)}
        for n in range(1, 4)]}
    keeper_picks = [
        {"pick_no": 1, "round": 1, "roster_id": 1, "player_id": "p00",
         "is_keeper": keepers_in_second_draft},
        {"pick_no": 2, "round": 2, "roster_id": 2, "player_id": "p01",
         "is_keeper": keepers_in_second_draft},
    ]
    (tmp_path / "draft" / "data" / "league_history.json").write_text(json.dumps({
        "seasons": [{
            "season": "2099",
            "owners": {"1": {"display_name": "alpha"}, "2": {"display_name": "beta"}},
            "drafts": [main_draft, {"picks": keeper_picks}],
        }]}))
    return tmp_path


def _run_on(tmp_path, **kw):
    K = _load()
    root = _fixture(tmp_path, **kw)
    K.ROOT = root
    K.HIST = root / "draft" / "data" / "league_history.json"
    K.POSN = root / "draft" / "data" / "player_positions.json"
    return K, K.run()


def test_second_draft_object_is_not_invisible(tmp_path):
    """THE LOAD-BEARING ONE. Revert run() to `season["drafts"][0]` and this
    fails: the fixture's keepers live in the second object, exactly as 2023's
    thirty do. That single-index read is how 73 got reported as 43 and how
    "2023 had no keepers" got written down."""
    K, (rows, ctl_rand, ctl_best, skipped, no_store, no_keepers) = _run_on(
        tmp_path, keepers_in_second_draft=True)
    assert len(rows) == 2, "keepers in the SECOND draft object were not graded"
    assert {r["pid"] for r in rows} == {"p00", "p01"}
    assert skipped == 0 and no_store == []
    # and the keeper-less FIRST draft is reported as a draft, never as a season
    assert no_keepers == [("2099", 3)]


def test_the_fixture_can_go_negative_so_the_positive_means_something(tmp_path):
    """Rule 3e: a test whose fixture cannot produce the other answer proves
    nothing. Same season, keepers flag off — zero rows, and BOTH drafts report
    as keeper-less."""
    K, (rows, _, _, _, _, no_keepers) = _run_on(
        tmp_path, keepers_in_second_draft=False)
    assert rows == []
    assert sorted(no_keepers) == [("2099", 2), ("2099", 3)]


def test_all_keepers_are_off_the_board_for_the_null(tmp_path):
    """A keeper is not available to anyone at any slot — including to the null.
    p00 and p01 are the two highest scorers; if either leaked into the pool the
    `best_available` for the other would be that leaked man."""
    K, (rows, _, _, _, _, _) = _run_on(tmp_path, keepers_in_second_draft=True)
    best = {r["pid"]: r["best_available"] for r in rows}
    assert best["p00"] == best["p01"] == 194.0   # p02, the best NON-keeper


# ──────────────────── the panel-2 gate actually fires ─────────────────────

def _main_quietly(mod, capsys):
    rc = mod.main()
    return rc, capsys.readouterr().out


def test_panel2_gate_is_not_inert_known_positive(capsys, tmp_path, monkeypatch):
    """Sabotage the known-POSITIVE: point the late-round reference at the very
    rounds the keepers occupy, so the contrast that must resolve cannot. The
    grader has to refuse and name that control."""
    K = _load()
    monkeypatch.setattr(K, "OUT", tmp_path / "out.json")
    monkeypatch.setattr(K, "LATE_ROUNDS", K.KEEPER_ROUNDS)
    rc, out = _main_quietly(K, capsys)
    assert rc == 1, "a powerless contrast printed a verdict instead of refusing"
    assert "REFUSING" in out and "panel2 known-positive" in out


def test_panel2_gate_is_not_inert_known_negative(capsys, tmp_path, monkeypatch):
    """Sabotage the known-NEGATIVE by inflating every z: halves of one
    population now 'resolve', which means the comparison machinery is lying and
    the run must go red."""
    K = _load()
    monkeypatch.setattr(K, "OUT", tmp_path / "out.json")
    orig = K.contrast
    monkeypatch.setattr(K, "contrast",
                        lambda a, b: (lambda t: (t[0], t[1], t[2] * 40))(orig(a, b)))
    rc, out = _main_quietly(K, capsys)
    assert rc == 1
    assert "REFUSING" in out and "panel2 known-negative" in out


def test_honest_run_is_green_and_says_what_it_cannot_show(capsys, tmp_path, monkeypatch):
    """The control for the two above: unsabotaged, the same code path exits 0.
    Without this, both sabotage tests would pass on a grader that ALWAYS
    refuses — which is the inert-gate failure wearing the opposite mask."""
    K = _load()
    monkeypatch.setattr(K, "OUT", tmp_path / "out.json")
    rc, out = _main_quietly(K, capsys)
    assert rc == 0, out[-2000:]
    assert "REFUSING" not in out
    art = json.loads((tmp_path / "out.json").read_text())
    p2 = art["vs_real_pick_at_that_round"]
    assert p2["controls"]["known_negative_ok"] and p2["controls"]["known_positive_ok"]
    # panel 1 passing must never be reported as the answer on its own
    assert art["n_keepers"] == len(art["rows"]) > 0
    assert "near-vacuous" in art["_headline"]
