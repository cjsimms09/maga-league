# TERRITORY: A
"""THE 50/50 STUDY — tests: hand-computed cells, fixture mining with the
parity pin observed to refuse, committed-artifact internal consistency, and
the leakage tracer (features open only strictly-prior stores).

Preregistration: draft/audit/edge_hunt_2026-08-16.md §1 (commit eb367719).
"""
from __future__ import annotations

import builtins
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))

import fifty_fifty_study as F  # noqa: E402

ARTIFACT = DRAFT / "data" / "fifty_fifty_study.json"


# ── wilson: hand-computed cells ──────────────────────────────────────────────

def test_wilson_hand_computed_cell():
    # wins=8, n=10, z=1.96: centre=(0.8+z^2/20)/(1+z^2/10)=0.99208/1.38416,
    # half=(z/1.38416)*sqrt(0.8*0.2/10 + z^2/400) — worked by hand.
    w = F.wilson(8, 10)
    assert w["p"] == 0.8
    assert abs(w["lo"] - 0.4902) < 0.002
    assert abs(w["hi"] - 0.9433) < 0.002


def test_wilson_zero_n_is_absent_not_zero():
    w = F.wilson(0, 0)
    assert w == {"p": None, "lo": None, "hi": None}


def test_wilson_even_split_is_centred():
    w = F.wilson(50, 100)
    assert w["p"] == 0.5
    assert abs((w["lo"] + w["hi"]) / 2 - 0.5) < 0.01
    assert w["lo"] < 0.5 < w["hi"]


# ── favored_of: the preregistered directions, cell by cell ──────────────────

def test_favored_directions():
    # lower-wins features
    assert F.favored_of("age", 24, 27, "a", "b") == "a"
    assert F.favored_of("games_missed_prior", 3, 1, "a", "b") == "b"
    assert F.favored_of("td_share_prior", 0.5, 0.2, "a", "b") == "b"
    assert F.favored_of("experience", 1, 4, "a", "b") == "a"
    # higher-wins features
    assert F.favored_of("ppg_prior", 12.0, 9.0, "a", "b") == "a"
    assert F.favored_of("late_trajectory", -1.0, 2.0, "a", "b") == "b"
    assert F.favored_of("weekly_cv_prior", 0.9, 0.5, "a", "b") == "a"


def test_favored_team_change_semantics():
    # value True = moved; the STAYER is favored.
    assert F.favored_of("team_change", True, False, "a", "b") == "b"
    assert F.favored_of("team_change", False, True, "a", "b") == "a"
    assert F.favored_of("team_change", False, False, "a", "b") == "equal"


def test_favored_absent_is_none_and_equal_is_equal():
    assert F.favored_of("age", None, 25, "a", "b") is None
    assert F.favored_of("age", 25, 25, "a", "b") == "equal"
    assert F.favored_of("team_pos_no1_prior", True, True, "a", "b") == "equal"
    assert F.favored_of("team_pos_no1_prior", True, False, "a", "b") == "a"


# ── source-B mining on a hand-built draft ────────────────────────────────────

def _picks(rows):
    return [{"pick_no": n, "roster_id": 1, "player_id": pid,
             "is_keeper": keep} for n, pid, keep in rows]


def test_mine_actual_pairs_hand_fixture():
    positions = {"1": "WR", "2": "WR", "3": "RB", "4": "WR", "5": "K",
                 "6": "RB"}
    picks = _picks([(10, "1", None), (12, "2", None), (13, "3", None),
                    (14, "5", None), (16, "4", None), (19, "6", True)])
    pairs = F.mine_actual_pairs(picks, set(), positions)
    got = {(p["a"], p["b"]) for p in pairs}
    # WR: 1-2 (gap 2, in), 2-4 (gap 4, in); RB: 3-6 keeper-excluded;
    # K excluded entirely.
    assert got == {("1", "2"), ("2", "4")}
    assert all(p["same_pos"] for p in pairs)


def test_mine_actual_pairs_gap_boundary_both_sides():
    positions = {"1": "WR", "2": "WR", "3": "WR"}
    picks = _picks([(10, "1", None), (15, "2", None), (21, "3", None)])
    pairs = F.mine_actual_pairs(picks, set(), positions)
    got = {(p["a"], p["b"]) for p in pairs}
    assert got == {("1", "2")}          # gap 5 in, gap 6 out


# ── source-A mining: hand fixture + the parity pin observed to refuse ────────

_POS = {"q1": "QB", "r1": "RB", "r2": "RB", "r3": "RB", "w1": "WR",
        "w2": "WR"}
_PROJ = {"q1": 300.0, "r1": 200.0, "r2": 197.0, "r3": 196.0, "w1": 190.0,
         "w2": 150.0}
_REPL = {"QB": 250.0, "RB": 100.0, "WR": 95.0}
# VORP: q1 50, r1 100, r2 97, r3 96, w1 95, w2 55.


def test_mine_replay_pairs_hand_fixture():
    log = [
        {"pick_no": 1, "player_id": "q1", "how": "history"},
        {"pick_no": 2, "player_id": "r1", "how": "tool", "forced": False},
    ]
    pairs = F.mine_replay_pairs([], set(), _PROJ, _REPL, _POS, log,
                                max_band=10.0)
    got = {(p["a"], p["b"]): p["vorp_delta"] for p in pairs}
    # top is r1 (VORP 100); within 10: r2 (97, Δ3), r3 (96, Δ4), w1 (95, Δ5).
    assert got == {("r1", "r2"): 3.0, ("r1", "r3"): 4.0, ("r1", "w1"): 5.0}
    assert pairs[0]["same_pos"] is True and pairs[2]["same_pos"] is False


def test_mine_replay_pairs_parity_pin_refuses_on_drift():
    # The log claims the tool took w2 — reconstruction's top is r1. The miner
    # must REFUSE (rule 10: this break was made on purpose and observed red).
    log = [{"pick_no": 1, "player_id": "w2", "how": "tool", "forced": False}]
    with pytest.raises(RuntimeError, match="parity pin FAILED"):
        F.mine_replay_pairs([], set(), _PROJ, _REPL, _POS, log)


def test_mine_replay_pairs_respects_caps():
    # r-heavy counts: with RB already at cap, candidates exclude RBs.
    log = [
        {"pick_no": 1, "player_id": "r1", "how": "keeper"},
        {"pick_no": 2, "player_id": "r2", "how": "keeper"},
        {"pick_no": 3, "player_id": "w1", "how": "tool", "forced": False},
    ]
    caps_backup = F.R.POSITION_CAPS
    try:
        F.R.POSITION_CAPS = {"QB": 2, "RB": 2, "WR": 7, "TE": 2}
        pairs = F.mine_replay_pairs([], set(), _PROJ, _REPL, _POS, log,
                                    max_band=100.0)
    finally:
        F.R.POSITION_CAPS = caps_backup
    # RBs capped out: top is w1 (95), partners q1 (50, delta 45) and
    # w2 (55, delta 40) — no RB appears in any pair.
    assert {(p["a"], p["b"]) for p in pairs} == {("w1", "q1"), ("w1", "w2")}


# ── grading: hand-computed outcome and feature cells ─────────────────────────

def test_grade_pairs_hand_computed():
    pairs = [{"a": "x", "b": "y", "pick_no": 5, "same_pos": True}]
    feats = {"x": {"age": 24.0, "ppg_prior": 10.0, "prior_team": "CIN"},
             "y": {"age": 28.0, "ppg_prior": 12.0, "prior_team": "BAL"}}
    y_teams = {"x": "CIN", "y": "DAL"}
    weekly = {"x": {1: 10.0, 2: 20.0, 3: 5.0}, "y": {1: 12.0, 2: 8.0}}
    totals = {"x": 35.0, "y": 20.0}
    out = F.grade_pairs(pairs, feats, y_teams, weekly, totals)
    g = out[0]
    assert g["winner"] == "x" and g["points_delta"] == 15.0
    assert g["co_active_weeks"] == 2 and g["weeks_won"] == [1, 1]
    assert g["weeks_winner"] is None
    # age: younger is x (24) and x won.
    assert g["features"]["age"] == {"favored": "x", "won": True,
                                    "won_weeks": None}
    # ppg: higher is y, y lost.
    assert g["features"]["ppg_prior"]["won"] is False
    # team_change: x stayed (CIN->CIN), y moved (BAL->DAL) — x favored, won.
    assert g["features"]["team_change"]["won"] is True


def test_grade_pairs_drops_tied_outcome():
    pairs = [{"a": "x", "b": "y", "pick_no": 1, "same_pos": True}]
    out = F.grade_pairs(pairs, {}, {}, {}, {"x": 10.0, "y": 10.0})
    assert out[0]["dropped"] == "tied_outcome"


def test_summarize_counts_absent_and_equal_separately():
    graded = [
        {"features": {"age": {"favored": "a", "won": True,
                              "won_weeks": None}}},
        {"features": {"age": {"favored": None, "won": None,
                              "won_weeks": None}}},
        {"features": {"age": {"favored": "equal", "won": None,
                              "won_weeks": None}}},
    ]
    s = F.summarize(graded, "age")
    assert (s["n"], s["wins"], s["absent_pairs"], s["equal_pairs"]) \
        == (1, 1, 1, 1)


# ── the committed artifact: internal consistency, not vibes ─────────────────

@pytest.fixture(scope="module")
def artifact():
    return json.loads(ARTIFACT.read_text())


def test_artifact_territory_and_prereg(artifact):
    assert artifact["_territory"].startswith("TERRITORY: A")
    assert artifact["prereg"]["band_primary"] == F.BAND_PRIMARY
    assert artifact["prereg"]["min_n"] == F.MIN_N
    assert "edge_hunt_2026-08-16" in artifact["prereg"]["audit_doc"]


def test_artifact_feature_cells_recompute(artifact):
    for f, cell in artifact["feature_table"].items():
        for key in ("replay", "actual", "pooled"):
            c = cell[key]
            w = F.wilson(c["wins"], c["n"])
            assert c["p"] == w["p"] and c["lo"] == w["lo"] \
                and c["hi"] == w["hi"], (f, key)
        p = cell["pooled"]
        predictive = (p["n"] >= F.MIN_N and p["lo"] is not None
                      and (p["lo"] > 0.5 or p["hi"] < 0.5))
        assert cell["predictive"] == predictive, f
        assert ("PREDICTIVE" in cell["verdict"]) == predictive, f


def test_artifact_pooled_is_replay_plus_actual(artifact):
    for f, cell in artifact["feature_table"].items():
        assert cell["pooled"]["n"] == cell["replay"]["n"] \
            + cell["actual"]["n"], f
        assert cell["pooled"]["wins"] == cell["replay"]["wins"] \
            + cell["actual"]["wins"], f


def test_artifact_ranking_matches_cells(artifact):
    ranked = artifact["predictive_features_ranked"]
    predictive = {f for f, c in artifact["feature_table"].items()
                  if c["predictive"]}
    assert set(ranked) == predictive
    diffs = [abs(artifact["feature_table"][f]["pooled"]["p"] - 0.5)
             for f in ranked]
    assert diffs == sorted(diffs, reverse=True)
    if ranked:
        assert artifact["prepared_diff"]["measured_ranking"] == ranked
        assert "NOT APPLIED" in artifact["prepared_diff"]["status"]
    else:
        assert artifact["prepared_diff"] is None


def test_artifact_absent_by_design_features_are_named(artifact):
    text = " ".join(artifact["features_absent_by_design"])
    for missing in ("adp_velocity", "playoff_weeks_slate",
                    "depth_chart_order"):
        assert missing in text


def test_artifact_every_season_has_both_sources(artifact):
    for season in ("2023", "2024", "2025"):
        s = artifact["seasons"][season]
        assert s["replay_pairs"] > 0 and s["actual_pairs"] > 0
        for pr in s["pairs"]:
            if pr.get("dropped"):
                continue
            assert pr["winner"] in (pr["a"], pr["b"])


# ── the leakage tracer: features open only strictly-prior stores ────────────

def _trace_opens(monkeypatch, fn):
    opened = []
    orig_read_text = Path.read_text
    orig_path_open = Path.open
    orig_open = builtins.open

    def rec_read_text(self, *a, **k):
        opened.append(str(self))
        return orig_read_text(self, *a, **k)

    def rec_path_open(self, *a, **k):
        opened.append(str(self))
        return orig_path_open(self, *a, **k)

    def rec_open(file, *a, **k):
        opened.append(str(file))
        return orig_open(file, *a, **k)

    monkeypatch.setattr(Path, "read_text", rec_read_text)
    monkeypatch.setattr(Path, "open", rec_path_open)
    monkeypatch.setattr(builtins, "open", rec_open)
    try:
        fn()
    finally:
        monkeypatch.undo()
    return opened


def test_features_prior_opens_no_current_or_future_store(monkeypatch):
    season = 2024
    F.R.frozen_table()               # the table carve-out, pre-warmed (it is
    #                                  league CONFIG carried by the 2023 store)
    F._MEMO.clear()
    positions = F.R.positions_record()
    opened = _trace_opens(
        monkeypatch, lambda: F.features_prior(season, positions, {}))
    stores = [p for p in opened
              if "component_stats_" in p or "nflverse_weekly_points_" in p]
    assert stores, "tracer saw no store opens — the guard went vacuous"
    for p in stores:
        year = int(Path(p).stem.split("_")[-1])
        assert year < season, f"feature path opened a >= {season} store: {p}"


def test_teams_of_season_is_the_single_named_current_season_reader():
    """F5's exception is a separate, named function — the feature path
    itself (features_prior) never takes a season-Y argument to leak with."""
    import ast
    import inspect
    tree = ast.parse(inspect.getsource(F.features_prior))
    calls = [n.func.id for n in ast.walk(tree)
             if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)]
    assert "teams_of_season" not in calls
