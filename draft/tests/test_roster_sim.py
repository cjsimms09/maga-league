"""THE LAB — lock the roster -> weekly-scores bridge.

Two kinds of check: a synthetic fixture that pins the lineup optimizer to a known
optimum (flex logic, slot counts, dedicated-beats-flex), and harvested-data
checks that the season simulation is self-consistent (realized starters sum to
the recorded score) and that the hindsight ceiling never falls below what teams
actually scored on average.
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

BT = Path(__file__).resolve().parent.parent / "backtest"
sys.path.insert(0, str(BT))
import roster_sim as RS  # noqa: E402
import money_grade as MG  # noqa: E402


# --- synthetic optimizer ------------------------------------------------------

def test_flex_takes_the_best_remaining_eligible():
    pos = {"qb": "QB", "rb1": "RB", "rb2": "RB", "rb3": "RB",
           "wr1": "WR", "wr2": "WR", "te": "TE", "k": "K", "def": "DEF"}
    pts = {"qb": 20, "rb1": 15, "rb2": 12, "rb3": 30, "wr1": 10, "wr2": 8,
           "te": 5, "k": 6, "def": 7}
    out = RS.best_lineup_points(pts, pos, list(pos), RS.DEFAULT_SLOTS)
    flex = next(s for s in out["starters"] if s[1] == "FLEX")
    # Top-2 RBs (30, 15) fill the dedicated RB slots; the flex then takes the best
    # remaining eligible — rb2 (12) beats the leftover WR/TE. The total is what
    # matters, and it's maximal either way an RB lands in flex.
    assert flex[0] == "rb2" and flex[2] == pytest.approx(12.0)
    # QB20 + RB30 + RB15 + WR10 + WR8 + TE5 + FLEX12 + K6 + DEF7 = 113
    assert out["points"] == pytest.approx(113.0)


def test_slot_counts_are_respected():
    pos = {f"rb{i}": "RB" for i in range(6)}
    pos.update({"qb": "QB", "wr1": "WR", "wr2": "WR", "te": "TE", "k": "K", "d": "DEF"})
    pts = {pid: 10 for pid in pos}
    out = RS.best_lineup_points(pts, pos, list(pos), RS.DEFAULT_SLOTS)
    slots = [s[1] for s in out["starters"]]
    assert slots.count("RB") == 2 and slots.count("WR") == 2 and slots.count("QB") == 1
    assert slots.count("FLEX") == 1
    assert len(out["starters"]) == sum(RS.DEFAULT_SLOTS.values()) == 9


def test_a_roster_of_only_a_qb_scores_only_the_qb():
    out = RS.best_lineup_points({"qb": 25}, {"qb": "QB"}, ["qb"], RS.DEFAULT_SLOTS)
    assert out["points"] == pytest.approx(25.0)
    assert len(out["starters"]) == 1


# --- harvested data -----------------------------------------------------------

@pytest.fixture(scope="module")
def hist():
    return MG.load_history()


@pytest.mark.parametrize("season", ["2023", "2024", "2025"])
def test_realized_starters_sum_to_the_recorded_score(hist, season):
    s = MG.season_of(hist, season)
    checked = 0
    for entries in (s.get("weeks") or {}).values():
        for e in entries or []:
            sp = e.get("starters_points")
            if not sp:
                continue
            assert sum(sp) == pytest.approx(e["points"], abs=0.2), \
                f"{season} r{e['roster_id']}: starters sum {sum(sp)} != {e['points']}"
            checked += 1
    assert checked > 100


def _dedicated_pos_map(season: dict) -> dict:
    """player_id -> true position, from every DEDICATED starting slot across the
    season (the FLEX slot is skipped since its position is ambiguous there)."""
    template = season.get("roster_positions") or []
    pos: dict[str, str] = {}
    for entries in (season.get("weeks") or {}).values():
        for e in entries or []:
            for slot, pid in zip(template, e.get("starters") or []):
                if slot in ("QB", "RB", "WR", "TE", "K", "DEF"):
                    pos[str(pid)] = slot
    return pos


@pytest.mark.parametrize("season", ["2023", "2024", "2025"])
def test_hindsight_ceiling_beats_realized_on_average(hist, season):
    s = MG.season_of(hist, season)
    pos = _dedicated_pos_map(s)
    gpp = RS.global_player_points(s)
    # For each roster, its actual player set each week -> best lineup vs realized.
    best_sum = real_sum = 0.0
    for wk, entries in (s.get("weeks") or {}).items():
        w = int(wk)
        for e in entries or []:
            ids = [str(p) for p in (e.get("players") or [])]
            best = RS.best_lineup_points(gpp[w], pos, ids, RS.DEFAULT_SLOTS)["points"]
            best_sum += best
            real_sum += e["points"]
    # The optimal-in-hindsight lineup is a ceiling: it must beat realized play.
    assert best_sum >= real_sum, f"{season}: ceiling {best_sum} < realized {real_sum}"


def test_roster_weekly_scores_covers_every_week(hist):
    s = MG.season_of(hist, "2025")
    pos = _dedicated_pos_map(s)
    # Use roster 1's actual players as a stand-in draft roster.
    e1 = s["weeks"]["1"]
    ids = [str(p) for p in (e1[0].get("players") or [])]
    scores = RS.roster_weekly_scores(s, ids, pos)
    assert set(scores.keys()) == {int(w) for w in s["weeks"].keys()}
    assert all(v >= 0 for v in scores.values())
