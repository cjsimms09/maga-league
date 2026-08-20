# TERRITORY: C
"""Weekly expert-consensus-rank capture -- register: pull-list refill #2
item 3. The Jahmyr Gibbs row is copied verbatim (trimmed) from the real,
committed fp_expert_ranks_2026.json draft-time capture -- the weekly
response is the same JSON shape under a different query, not a different
payload, so this is a real fixture for both.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import fp_expert_ranks as FER  # noqa: E402 -- the module being reused (rule 11)
import fp_expert_ranks_weekly as FERW  # noqa: E402


# ── real row, fp_expert_ranks_2026.json, trimmed expert_ranks for brevity ──
GIBBS_PAYLOAD = {
    "players": [{
        "player_id": 22968, "player_name": "Jahmyr Gibbs", "player_position_id": "RB",
        "player_team_id": "DET", "rank_ecr": "1", "rank_min": "1", "rank_max": "5",
        "rank_ave": "1.75", "rank_std": "0.83", "pos_rank": "RB1",
        "experts": {"4616": "1", "65": "2", "7592": "2", "7616": "1", "1046": "1"},
    }],
    "last_updated": "2026-08-01T00:00:00Z", "year": 2026, "week": 1, "type": "weekly",
}


def test_store_path_is_week_parameterized_not_shared_with_the_draft_capture():
    p1 = FERW.store_path(2026, 1)
    p2 = FERW.store_path(2026, 2)
    assert p1 != p2
    assert "w1" in p1.name and "w2" in p2.name
    # never collides with the season-total draft capture's own path
    assert p1 != FER.store_path(2026)


def test_reused_parse_handles_the_real_weekly_shaped_payload():
    # THE REUSE CONTRACT: fp_expert_ranks.parse() is not re-derived here --
    # if FP's weekly response is the same JSON shape (it should be, per
    # this module's own docstring), the existing parser must handle it
    # unmodified.
    store = FER.parse(GIBBS_PAYLOAD)
    assert store["players"][0]["name"] == "Jahmyr Gibbs"
    assert store["players"][0]["n_experts"] == 5
    assert store["players"][0]["rank_ecr"] == 1


def test_build_snapshot_assembles_the_real_shape_pure_no_io():
    store = FER.parse(GIBBS_PAYLOAD)
    snap = FERW.build_snapshot(2026, 3, store, "https://example.test/url",
                               None, "2026-08-20T12:00:00Z")
    assert snap["season"] == 2026
    assert snap["week"] == 3
    assert snap["fetch_error"] is None
    assert snap["players"][0]["name"] == "Jahmyr Gibbs"


def test_build_snapshot_records_a_fetch_error_rather_than_a_shrug():
    # register 4s discipline, reused for the weekly sibling: a failed
    # fetch is a visible field, never silently dropped.
    empty_store = {"players": [], "players_without_experts": [], "expert_names": {}}
    snap = FERW.build_snapshot(2026, 1, empty_store, "https://example.test/url",
                               "HTTPError: 404", "2026-08-20T12:00:00Z")
    assert snap["fetch_error"] == "HTTPError: 404"
    assert snap["players"] == []


def test_min_players_floor_matches_the_documented_rule_3e_bar():
    assert FERW.MIN_PLAYERS_WITH_EXPERTS == 20
