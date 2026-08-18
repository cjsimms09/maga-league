# TERRITORY: A
"""year2_escalator — the contract of candidate layer B (league benchmark):
hand-computed factors on fixtures (ratio of sums, both clips, the min-n
rule, the cohort floor), walk-forward guards, leakage trace, overlay scope,
and real-data determinism pins on the committed stores.
"""
import builtins
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R  # noqa: E402
import year2_escalator as Y2  # noqa: E402

STORE_PATH = DRAFT / "backtest" / "nflverse_draft_picks.json"

FIX_STORE = {"picks": [
    {"season": 2021, "pick": 5, "position": "RB", "sleeper_id": "r1",
     "round": 1, "team": "X", "name": "r1", "gsis_id": "g1"},
    {"season": 2021, "pick": 15, "position": "RB", "sleeper_id": "r2",
     "round": 1, "team": "X", "name": "r2", "gsis_id": "g2"},
    {"season": 2021, "pick": 30, "position": "RB", "sleeper_id": "r3",
     "round": 1, "team": "X", "name": "r3", "gsis_id": "g3"},
    {"season": 2021, "pick": 40, "position": "RB", "sleeper_id": "r4",
     "round": 2, "team": "X", "name": "r4", "gsis_id": "g4"},
    {"season": 2021, "pick": 50, "position": "RB", "sleeper_id": "r5",
     "round": 2, "team": "X", "name": "r5", "gsis_id": "g5"},
    # below the 50-point cohort floor — must be excluded
    {"season": 2021, "pick": 60, "position": "RB", "sleeper_id": "r6",
     "round": 2, "team": "X", "name": "r6", "gsis_id": "g6"},
    # TE cohort of ONE — min-n rule keeps m = 1.0
    {"season": 2021, "pick": 70, "position": "TE", "sleeper_id": "t1",
     "round": 3, "team": "X", "name": "t1", "gsis_id": "g7"},
]}
# year1 (2021) and year2 (2022) totals: RB sums 500 → 700 (ratio 1.4 → cap
# clips to 1.30); r3's crash to 0 counts (busts are the base rate).
FIX_Y1 = {"r1": 100.0, "r2": 100.0, "r3": 100.0, "r4": 100.0, "r5": 100.0,
          "r6": 49.9, "t1": 80.0}
FIX_Y2 = {"r1": 200.0, "r2": 200.0, "r3": 0.0, "r4": 200.0, "r5": 100.0,
          "r6": 500.0, "t1": 160.0}


def _fix_totals(season):
    return ({2021: FIX_Y1, 2022: FIX_Y2}[season], {})


def test_factor_ratio_of_sums_cap_and_min_n(monkeypatch):
    monkeypatch.setattr(R, "season_totals_of", _fix_totals)
    fit = Y2.fit_escalator(2023, FIX_STORE)
    rb = fit["factors"]["RB"]
    assert rb["n"] == 5                     # r6 under the 50-pt floor
    assert rb["raw_ratio_of_sums"] == 1.4   # 700 / 500
    assert rb["m"] == 1.30                  # cap clip
    te = fit["factors"]["TE"]
    assert te == {"m": 1.0, "n": 1, "reason": "n<5"}


def test_factor_floor_clip_never_de_escalates(monkeypatch):
    y2_down = dict(FIX_Y2, r1=50.0, r2=50.0, r3=0.0, r4=50.0, r5=50.0)
    monkeypatch.setattr(R, "season_totals_of",
                        lambda s: ({2021: FIX_Y1, 2022: y2_down}[s], {}))
    fit = Y2.fit_escalator(2023, FIX_STORE)
    rb = fit["factors"]["RB"]
    assert rb["raw_ratio_of_sums"] == 0.4
    assert rb["m"] == 1.0, "the preregistered floor: escalate-only"


def test_overlay_touches_only_year2_board_players(monkeypatch):
    monkeypatch.setattr(R, "season_totals_of", _fix_totals)
    fit = Y2.fit_escalator(2023, FIX_STORE)
    baseline = {"r1": 100.0, "t1": 80.0, "vet": 300.0}
    positions = {"r1": "RB", "t1": "TE", "vet": "RB"}
    got = Y2.year2_overlay(2023, baseline, positions, FIX_STORE, fit)
    # r1 is class 2022? NO — class 2021, replay 2023 wants class 2022 only.
    assert got == {}, "class-2021 players are year-3 in 2023, not touched"
    got2 = Y2.year2_overlay(2022, baseline, positions, FIX_STORE, fit)
    assert set(got2) == {"r1"}              # t1's factor is 1.0 → untouched
    assert got2["r1"] == pytest.approx(130.0)
    assert "vet" not in got2


def test_walk_forward_guard_refuses_2022(monkeypatch):
    with pytest.raises(AssertionError):
        Y2.fit_escalator(2022, FIX_STORE)


def test_distribution_is_pure_measurement(monkeypatch):
    monkeypatch.setattr(R, "season_totals_of", _fix_totals)
    d = Y2.transition_distribution(2021, FIX_STORE)
    rb = d["per_pos"]["RB"]
    assert rb["n"] == 5
    assert rb["sum_year1"] == 500.0 and rb["sum_year2"] == 700.0
    assert rb["ratio_of_sums"] == 1.4
    # mean of individual ratios (2, 2, 0, 2, 1) = 1.4; median = 2.0
    assert rb["mean_ratio"] == 1.4 and rb["median_ratio"] == 2.0


# ── real-data pins on the committed stores ───────────────────────────────────

@pytest.fixture(scope="module")
def store():
    return json.loads(STORE_PATH.read_text())


def test_real_fit_windows_are_walk_forward(store):
    assert Y2.fit_escalator(2023, store)["fit_transitions"] == ["2021->2022"]
    assert Y2.fit_escalator(2025, store)["fit_transitions"] == [
        "2021->2022", "2022->2023", "2023->2024"]


def test_real_fit_is_deterministic_and_clipped(store):
    a = Y2.fit_escalator(2025, store)
    assert a == Y2.fit_escalator(2025, store)
    for pos, v in a["factors"].items():
        assert 1.0 <= v["m"] <= 1.30


def test_real_2024_qb_factor_hits_the_cap(store):
    """Hand-derivable: pooled 2021→22 + 2022→23 QB cohort ratio of sums is
    1.313 — the preregistered cap clips it to 1.30."""
    f = Y2.fit_escalator(2024, store)["factors"]["QB"]
    assert f["raw_ratio_of_sums"] > 1.30 and f["m"] == 1.30


# ── leakage trace ────────────────────────────────────────────────────────────

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


@pytest.mark.parametrize("season", [2025, 2024, 2023])
def test_fit_path_opens_no_store_of_the_replay_season_or_later(
        monkeypatch, season):
    R.frozen_table()
    store = json.loads(STORE_PATH.read_text())
    opened = _trace_opens(
        monkeypatch, lambda: Y2.fit_escalator(season, store))
    bad = []
    for path in opened:
        name = Path(path).name
        for y in range(season, 2027):
            if name in (f"nflverse_weekly_points_{y}.json",
                        f"component_stats_{y}.json"):
                bad.append(name)
        if name in ("league_history.json", "draft_replay_2025.json",
                    "replay_league_table.json", "pre_draft_freeze_2026.json"):
            bad.append(name)
    assert bad == [], f"escalator fit for {season} touched forbidden: {bad}"
    prior_reads = [p for p in opened
                   if Path(p).name.startswith(("component_stats_",
                                               "nflverse_weekly_points_"))]
    assert prior_reads, "tracer saw nothing — the guard went vacuous"
