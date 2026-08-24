# TERRITORY: C
"""Keeper-futures store -- register/ROUTES 'keeper-futures file'. Fixtures
match `sleeper_import.fetch_rosters()`'s real return shape (list of
{roster_id, owner_id, players: [ids]}), the same shape already verified by
hand for `tuesday_wire_snapshot.py` (rule 3f) -- and `draft_data.json`'s
real `players[]`/`kept_players[]` split, exercised directly against the
live committed board in the known-positive tests below.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import keeper_futures as KF  # noqa: E402

REAL_CFG = json.loads(KF.CFG.read_text())


def _board(players=None, kept=None):
    return {"built_at": "2026-08-22T03:43:05Z",
           "players": players or [],
           "kept_players": kept or [],
           "replacement": {"replacement_points": {"WR": 50.0, "RB": 40.0, "QB": 100.0}}}


def test_load_board_recovers_kept_players_missing_from_players_list():
    board = _board(
        players=[{"player_id": "1", "position": "WR", "vorp": 10.0,
                 "adjusted_adp": 5, "raw_adp": 5}],
        kept=[{"player_id": "2", "position": "WR", "proj_mean": 120.0, "vorp": None}])
    by_id, pool_by_pos, rep = KF.load_board(board)
    assert "1" in by_id and "2" in by_id
    # recovered vorp = proj_mean - replacement_points[WR] = 120 - 50
    assert by_id["2"]["vorp"] == 70.0


def test_load_board_pool_and_replacement_from_players_only_not_kept():
    board = _board(
        players=[{"player_id": "1", "position": "WR", "vorp": 10.0},
                 {"player_id": "2", "position": "WR", "vorp": 30.0}],
        kept=[{"player_id": "3", "position": "WR", "vorp": 999.0}])
    by_id, pool_by_pos, rep = KF.load_board(board)
    assert len(pool_by_pos["WR"]) == 2  # kept player NOT counted in the pool
    assert rep["WR"] in (10.0, 30.0)    # median of [10, 30]


def test_build_team_eligible_refuses_loudly_not_silently():
    by_id = {"1": {"name": "A", "position": "WR", "vorp": 10.0}}
    eligible, unpriced = KF.build_team_eligible(["1", "999"], by_id)
    assert len(eligible) == 1
    assert len(unpriced) == 1
    assert unpriced[0]["player_id"] == "999"


def test_build_store_runs_the_real_optimizer_per_team():
    # a realistic-shaped pool: real ADP fields so expected_best_available's
    # survival-probability math doesn't treat the elite candidate as still
    # sitting on the board at pick 8 (his own ADP would have taken him off
    # it) -- a fixture with no ADP field pinned his own vorp right back as
    # "the alternative" and silently zeroed his surplus (caught by this
    # test's own first two drafts: rule 3f applied to the fixture itself).
    filler_wr = [{"player_id": f"f{i}", "position": "WR", "vorp": 1.0 + i * 0.1,
                 "adjusted_adp": 20 + i, "raw_adp": 20 + i, "adp_sd": 3.0}
                for i in range(10)]
    board = _board(players=[
        {"player_id": "1", "position": "WR", "vorp": 100.0,
         "adjusted_adp": 1, "raw_adp": 1, "adp_sd": 1.0},
        {"player_id": "2", "position": "RB", "vorp": 5.0,
         "adjusted_adp": 30, "raw_adp": 30, "adp_sd": 3.0},
        {"player_id": "3", "position": "WR", "vorp": 4.0,
         "adjusted_adp": 25, "raw_adp": 25, "adp_sd": 3.0},
    ] + filler_wr)
    rosters = [
        {"roster_id": 1, "owner_id": "u1", "players": ["1", "2"]},
        {"roster_id": 2, "owner_id": "u2", "players": ["3"]},
    ]
    doc = KF.build_store(rosters=rosters, board_doc=board, cfg=REAL_CFG)
    assert doc["n_teams"] == 2
    assert doc["cost_model"] == "top_picks_flat"
    t1 = doc["teams"]["u1"]
    assert t1["n_eligible"] == 2
    # the huge-VORP WR (100.0 vs a low-single-digit alternative) must be
    # recommended kept -- a real optimizer result, not a placeholder check
    assert t1["recommended_keep"] >= 1
    assert len(t1["recommended_players"]) == t1["recommended_keep"]


def test_build_store_reports_unpriced_players_per_team():
    board = _board(players=[{"player_id": "1", "position": "WR", "vorp": 10.0}])
    rosters = [{"roster_id": 1, "owner_id": "u1", "players": ["1", "unknown_pid"]}]
    doc = KF.build_store(rosters=rosters, board_doc=board, cfg=REAL_CFG)
    assert doc["teams"]["u1"]["unpriced"] == [{"player_id": "unknown_pid", "name": None}]


def test_refusal_reason_none_when_teams_at_floor():
    doc = {"n_teams": KF.MIN_TEAMS}
    assert KF.refusal_reason(doc) is None


def test_refusal_reason_fires_below_floor():
    doc = {"n_teams": KF.MIN_TEAMS - 1}
    reason = KF.refusal_reason(doc)
    assert reason is not None
    assert "10" in reason


def test_never_models_years_kept_eligibility_field():
    # THE ASK'S OWN STATED LIMIT, pinned: no player is excluded for having
    # been kept before -- every rostered player is eligible in this build.
    board = _board(players=[{"player_id": "1", "position": "WR", "vorp": 50.0}])
    rosters = [{"roster_id": 1, "owner_id": "u1", "players": ["1"]}]
    doc = KF.build_store(rosters=rosters, board_doc=board, cfg=REAL_CFG)
    assert "years_kept" not in str(doc["teams"])
    assert "max_years" not in str(doc["teams"])


# ---- Rule 3e known-positive: real committed board, real players ----------

def test_verify_known_positive_passes_on_the_real_committed_board():
    board = json.loads(KF.BOARD.read_text())
    control = KF.verify_known_positive(None, board_doc=board)
    assert control["ok"] is True
    assert control["recommended_keep"] == 3


def test_verify_known_positive_is_a_real_fail_arm():
    # break it: rename one of the three real players so the join misses it
    board = json.loads(KF.BOARD.read_text())
    kept = [dict(kp) for kp in board["kept_players"]]
    for kp in kept:
        if kp.get("name") == "Ja'Marr Chase":
            kp["name"] = "Some Other Player"
    broken = dict(board, kept_players=kept)
    control = KF.verify_known_positive(None, board_doc=broken)
    assert control["ok"] is False


def test_main_void_path_when_known_positive_fails(monkeypatch, tmp_path, capsys):
    board = json.loads(KF.BOARD.read_text())
    kept = [dict(kp) for kp in board["kept_players"] if kp.get("name") != "Derrick Henry"]
    broken = dict(board, kept_players=kept)
    broken_path = tmp_path / "draft_data.json"
    broken_path.write_text(json.dumps(broken))
    monkeypatch.setattr(KF, "BOARD", broken_path)
    rc = KF.main()
    assert rc == 1
    err = capsys.readouterr().err
    assert "VOID" in err
