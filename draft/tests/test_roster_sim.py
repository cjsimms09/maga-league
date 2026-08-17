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
            # EXACT IDENTITY, not an estimate: the recorded score IS the sum of
            # the starters' points. abs=0.2 was a fifth of a fantasy point of
            # slack on a quantity with no noise in it — wide enough to hide a
            # genuinely mis-summed lineup. Rule 10b, 2026-08-11: re-ran this
            # against all three seasons (100+ entries) at 0.2, 0.01, 1e-4 and
            # 1e-9, and it passes at every one. Nothing needed the slack, so the
            # band was chosen for comfort. 1e-9 leaves ~4 orders over the ~1e-13
            # float accumulation of summing nine ~150-point values.
            assert sum(sp) == pytest.approx(e["points"], abs=1e-9), \
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


@pytest.mark.parametrize("season", ["2023", "2024", "2025"])
def test_hindsight_ceiling_beats_realized_every_week(hist, season):
    """The AGGREGATE check above is too coarse: it can pass even if individual
    weeks undercount the ceiling below what was realized, so long as other
    weeks overcorrect for it in sum. This is the per-row version that caught
    the real bug (infer_positions' FLEX gap, fixed 2026-08-15): the exact same
    (season=2023, roster_id=3, week=3) case that broke the JS-side port
    (draft/tests/lineup_edge_backtest.test.js) belongs to this dataset too."""
    s = MG.season_of(hist, season)
    pos = RS.infer_positions(s)
    violations = []
    for wk, entries in (s.get("weeks") or {}).items():
        w = int(wk)
        for e in entries or []:
            ids = [str(p) for p in (e.get("players") or [])]
            pts = {str(pid): float(v or 0.0) for pid, v in (e.get("players_points") or {}).items()}
            best = RS.best_lineup_points(pts, pos, ids, RS.DEFAULT_SLOTS)["points"]
            if best < e["points"] - 0.01:
                violations.append((w, e["roster_id"], best, e["points"]))
    assert not violations, f"{season}: hindsight ceiling below realized on {len(violations)} team-weeks: {violations[:5]}"


def test_player_positions_fallback_agrees_with_the_reliable_source_wherever_both_exist():
    """Independent-review finding, 2026-08-15 (low/population_denominator):
    player_positions.json is a single union-over-builds snapshot per player_id,
    not season-keyed, so using it as a historical fallback is only safe if a
    player's position does not actually change build-to-build. This is not an
    assumption: for every (season, player_id) pair the starters-array heuristic
    -- which is unambiguous whenever it fires, since a dedicated slot is exact,
    unlike the FLEX case this fallback exists for -- can independently confirm,
    the two sources must agree. A disagreement means the fallback would have
    silently MISCLASSIFIED a player this test could have caught."""
    from pathlib import Path
    root = Path(RS.__file__).resolve().parent.parent.parent
    hist = MG.load_history()
    db = RS._player_positions_db()
    mismatches = []
    checked = 0
    for season in ("2023", "2024", "2025"):
        s = MG.season_of(hist, season)
        template = s.get("roster_positions") or []
        dedicated = {}
        for entries in (s.get("weeks") or {}).values():
            for e in entries or []:
                for slot, pid in zip(template, e.get("starters") or []):
                    if slot in ("QB", "RB", "WR", "TE", "K", "DEF"):
                        dedicated[str(pid)] = slot
        for pid, pos in dedicated.items():
            if pid in db:
                checked += 1
                if db[pid] != pos:
                    mismatches.append((season, pid, pos, db[pid]))
    assert checked > 100, f"only {checked} overlapping ids -- too few to trust this check"
    assert not mismatches, (
        f"player_positions.json disagrees with the season's own dedicated-slot "
        f"starts on {len(mismatches)} players -- the fallback would misclassify "
        f"them: {mismatches[:10]}")


def test_roster_weekly_scores_covers_every_week(hist):
    s = MG.season_of(hist, "2025")
    pos = _dedicated_pos_map(s)
    # Use roster 1's actual players as a stand-in draft roster.
    e1 = s["weeks"]["1"]
    ids = [str(p) for p in (e1[0].get("players") or [])]
    scores = RS.roster_weekly_scores(s, ids, pos)
    assert set(scores.keys()) == {int(w) for w in s["weeks"].keys()}
    assert all(v >= 0 for v in scores.values())
