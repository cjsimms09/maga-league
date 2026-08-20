# TERRITORY: A
"""The post-draft league analyzer — decision logic tested BEFORE draft night.

Cory's ask (2026-08-18): "After draft it should immediately be ready for me,
I will make bet with Richard." Immediately-ready means the only thing that
runs for the first time on draft night is the FETCH. Everything that decides
what the numbers mean is exercised here, on fixtures small enough to
hand-check, with both outcomes of every branch proven reachable — the
source_blend rule, applied to the artifact Cory will bet money on.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT / "tools"))

import league_analyzer as LA  # noqa: E402


def board(*rows):
    return [{"player_id": pid, "proj_mean": pm, "position": pos, "name": n}
            for pid, pm, pos, n in rows]


FULL_BOARD = board(
    ("q1", 300.0, "QB", "QB One"), ("q2", 250.0, "QB", "QB Two"),
    ("r1", 220.0, "RB", "RB One"), ("r2", 200.0, "RB", "RB Two"),
    ("r3", 180.0, "RB", "RB Three"),
    ("w1", 210.0, "WR", "WR One"), ("w2", 190.0, "WR", "WR Two"),
    ("w3", 170.0, "WR", "WR Three"),
    ("t1", 150.0, "TE", "TE One"), ("k1", 120.0, "K", "K One"),
    ("d1", 110.0, "DEF", "DEF One"),
)


# ── the lineup slots are the league's, not a retype ─────────────────────────

def test_slots_match_the_committed_league_settings():
    doc = json.loads(
        (DRAFT / "data" / "sleeper_league_settings.json").read_text())
    starting = [s for s in doc["roster_positions"] if s != "BN"]
    assert list(LA.STARTING_SLOTS) == starting, (
        "league_analyzer's lineup drifted from the league's real settings")


# ── best_lineup ─────────────────────────────────────────────────────────────

def test_lineup_fills_every_slot_and_flex_takes_best_remaining():
    idx = LA.board_projection_index(FULL_BOARD)
    out = LA.best_lineup([r[0] for r in [
        ("q1",), ("r1",), ("r2",), ("r3",), ("w1",), ("w2",), ("w3",),
        ("t1",), ("k1",), ("d1",)]], idx)
    slots = {s["slot"]: s for s in out["starters"]}
    assert slots["QB"]["player_id"] == "q1"
    # FLEX must take RB Three (180) over WR Three (170)
    assert slots["FLEX"]["player_id"] == "r3"
    assert out["starter_total"] == 300 + 220 + 200 + 210 + 190 + 150 + 180 + 120 + 110
    # bench = WR Three alone
    assert out["bench_total"] == 170.0
    assert out["unprojected"] == []


def test_a_player_the_board_cannot_price_is_NAMED_not_zeroed():
    idx = LA.board_projection_index(FULL_BOARD)
    out = LA.best_lineup(["q1", "mystery_rookie"], idx)
    assert out["unprojected"] == ["mystery_rookie"]
    # and he is not in the lineup as a silent 0.0
    assert all(s["player_id"] != "mystery_rookie" for s in out["starters"])


def test_an_unfillable_slot_is_an_EMPTY_SLOT_not_a_crash():
    idx = LA.board_projection_index(FULL_BOARD)
    out = LA.best_lineup(["q1"], idx)   # no RB/WR/TE/K/DEF at all
    empties = [s for s in out["starters"] if s["player_id"] is None]
    assert len(empties) == 8
    assert all(s["name"] == "EMPTY SLOT" for s in empties)
    assert out["starter_total"] == 300.0


def test_no_player_starts_twice_through_flex():
    idx = LA.board_projection_index(FULL_BOARD)
    out = LA.best_lineup(["q1", "r1", "w1", "t1", "k1", "d1"], idx)
    ids = [s["player_id"] for s in out["starters"] if s["player_id"]]
    assert len(ids) == len(set(ids))


# ── all-play standings ──────────────────────────────────────────────────────

def test_all_play_ranking_and_arithmetic():
    rows = [{"team": c, "starter_total": t}
            for c, t in (("a", 1500.0), ("b", 1600.0), ("c", 1400.0))]
    out = LA.all_play_table(rows)
    assert [r["team"] for r in out] == ["b", "a", "c"]
    assert [r["projected_all_play_wins_per_week"] for r in out] == [2, 1, 0]
    assert out[0]["gap_to_first"] == 0.0
    assert out[2]["gap_to_first"] == 200.0


# ── draft grades ────────────────────────────────────────────────────────────

def picks(*rows):
    return [{"pick_no": i + 1, "round": r, "roster_id": rid, "player_id": pid}
            for i, (r, rid, pid) in enumerate(rows)]


def test_surplus_is_zero_sum_within_a_round_and_names_best_and_worst():
    idx = LA.board_projection_index(FULL_BOARD)
    g = LA.draft_grades(picks((1, 1, "q1"), (1, 2, "q2")), idx)
    # round mean 275; q1 +25, q2 −25 — zero-sum by construction
    assert g["teams"][1]["surplus_total"] == 25.0
    assert g["teams"][2]["surplus_total"] == -25.0
    assert g["teams"][1]["best_pick"]["name"] == "QB One"
    assert abs(sum(t["surplus_total"] for t in g["teams"].values())) < 0.01


def test_keeper_slot_picks_are_excluded_from_means_AND_grades():
    idx = LA.board_projection_index(FULL_BOARD)
    with_keeper = LA.draft_grades(
        picks((1, 1, "q1"), (1, 2, "q2"), (1, 3, "r1")), idx,
        keeper_ids=frozenset(["r1"]))
    # r1 (220) must not drag the round mean: mean stays 275
    assert with_keeper["round_means"]["1"] == 275.0
    assert 3 not in with_keeper["teams"]


def test_an_unprojectable_pick_is_counted_ungraded_not_zero():
    idx = LA.board_projection_index(FULL_BOARD)
    g = LA.draft_grades(picks((1, 1, "q1"), (1, 1, "nobody")), idx)
    assert g["teams"][1]["ungraded_picks"] == 1
    assert g["teams"][1]["graded_picks"] == 1
    # the ghost did not enter the mean: mean of round 1 is q1 alone
    assert g["round_means"]["1"] == 300.0


# ── the assembled artifact ──────────────────────────────────────────────────

def test_analyze_end_to_end_on_a_two_team_fixture():
    rosters = [
        {"roster_id": 1, "owner_id": "u1",
         "players": ["q1", "r1", "r2", "w1", "w2", "t1", "k1", "d1", "r3"]},
        {"roster_id": 2, "owner_id": "u2",
         "players": ["q2", "w3"]},
    ]
    users = [{"user_id": "u1", "display_name": "Cory"},
             {"user_id": "u2", "display_name": "Richard"}]
    doc = LA.analyze(rosters, users, picks((1, 1, "q1"), (1, 2, "q2")),
                     FULL_BOARD)
    st = doc["projected_standings"]
    assert st[0]["owner"] == "Cory" and st[0]["projected_rank"] == 1
    assert st[1]["owner"] == "Richard"
    assert st[0]["projected_all_play_wins_per_week"] == 1
    assert "PROJECTIONS, not results" in doc["_claim"]
    assert doc["honesty"]["total_surplus_across_teams"] == 0.0


def test_the_real_board_projects_enough_of_the_draftable_pool():
    """The dry-run that makes 'ready right after the draft' a measurement:
    the top 150 priced players on the LIVE board — the population the room
    will actually roster — must be projectable by the index the analyzer
    uses. If this holds, draft-night coverage holes can only be deep-bench
    fliers, which the artifact names row by row anyway."""
    b = json.loads((ROOT / "public" / "draft_data.json").read_text())
    pool = b["players"] + b.get("kept_players", [])
    idx = LA.board_projection_index(pool)
    priced = sorted((p for p in b["players"] if p.get("adp")),
                    key=lambda p: p["adp"])[:150]
    missing = [p["name"] for p in priced if str(p["player_id"]) not in idx]
    assert not missing, f"unprojectable inside the draftable range: {missing}"


# ── the rehearsal stamp (found by the FIRST real dispatch, 2026-08-18) ──────

def _mini():
    rosters = [{"roster_id": 1, "owner_id": "u1", "players": ["q1"]}]
    users = [{"user_id": "u1", "display_name": "Cory"}]
    return rosters, users


def test_a_pre_draft_run_stamps_itself_a_rehearsal_in_the_claim_b_renders():
    """THE DEFECT THE FIRST DISPATCH FOUND: Sleeper's pre-draft rosters are
    LAST SEASON'S rosters, so a rehearsal produces a full, plausible standings
    table that reads as the draft result. The stamp must be in _claim itself —
    the one line B's surface renders verbatim — not only in a flag field."""
    r, u = _mini()
    doc = LA.analyze(r, u, [], FULL_BOARD, league_status="pre_draft")
    assert doc["_rehearsal"] is True
    assert "REHEARSAL" in doc["_claim"]
    assert "LAST SEASON" in doc["_claim"]


def test_a_post_draft_run_is_NOT_stamped_and_the_claim_stays_clean():
    """FAIL ARM: the stamp must be able to say no, or draft night's real
    artifact would carry a rehearsal warning over the real result."""
    r, u = _mini()
    for status in ("drafting", "in_season", "complete"):
        doc = LA.analyze(r, u, [], FULL_BOARD, league_status=status)
        assert doc["_rehearsal"] is False, status
        assert "REHEARSAL" not in doc["_claim"], status


def test_an_absent_status_does_not_fabricate_a_rehearsal():
    """A caller that never learned the status (old fixtures, unit tests) must
    not have its artifact branded a rehearsal by default — absence of evidence
    is stamped as absence (None), never as a claim either way."""
    r, u = _mini()
    doc = LA.analyze(r, u, [], FULL_BOARD)
    assert doc["_rehearsal"] is False
    assert doc["league_status"] is None
