# TERRITORY: A
"""rookie_prior — the contract of candidate layer A (league benchmark):
the committed draft-picks store's period-correctness (no career-outcome
columns survive), hand-computed prior cells on fixtures, the preregistered
fallback and bucket rules, walk-forward guards, real-data determinism, and
the LEAKAGE TRACE (no ≥replay-season store is opened on the fit path).
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
import rookie_prior as RP  # noqa: E402

STORE_PATH = DRAFT / "backtest" / "nflverse_draft_picks.json"


# ── the committed store ──────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def store():
    return json.loads(STORE_PATH.read_text())


def test_store_territory_provenance_and_span(store):
    assert next(iter(store)) == "_territory"
    prov = store["provenance"]
    assert prov["url"].startswith("https://github.com/nflverse/")
    assert prov["seasons"] == [2021, 2022, 2023, 2024, 2025]
    assert prov["rows_kept"] == len(store["picks"])
    assert prov["sleeper_unmapped"] == sum(
        1 for r in store["picks"] if not r["sleeper_id"])


def test_store_is_period_correct_no_career_columns(store):
    """The nflverse source carries career outcomes (w_av, games, `to`, …).
    None may survive into the committed store — each pick row is exactly
    the draft-night information set plus the crosswalk."""
    allowed = {"season", "round", "pick", "team", "position", "name",
               "gsis_id", "sleeper_id"}
    for r in store["picks"]:
        assert set(r) == allowed, f"unexpected columns: {set(r) - allowed}"


def test_store_covers_the_known_2024_invisible_rookies(store):
    """The single-seat replay counted five 2024 Cory picks invisible to the
    walk-forward board; every one must be in the store, sleeper-mapped."""
    by_sleeper = {r["sleeper_id"]: r for r in store["picks"]
                  if r["sleeper_id"]}
    for pid in ("11560", "11566", "11583", "11628", "11632"):
        assert by_sleeper[pid]["season"] == 2024
    # and the store names the repo's one position-less 2025 pick.
    assert by_sleeper["12530"]["name"] == "Travis Hunter"
    assert by_sleeper["12530"]["position"] == "WR"


def test_store_positions_are_skill_only(store):
    assert {r["position"] for r in store["picks"]} == {"QB", "RB", "WR", "TE"}


# ── bucket boundaries (preregistered) ────────────────────────────────────────

@pytest.mark.parametrize("pick,bucket", [
    (1, "1-10"), (10, "1-10"), (11, "11-32"), (32, "11-32"),
    (33, "33-64"), (64, "33-64"), (65, "65-105"), (105, "65-105"),
    (106, "106+"), (262, "106+")])
def test_bucket_boundaries(pick, bucket):
    assert RP.bucket_of(pick) == bucket


# ── hand-computed prior cells on a fixture ───────────────────────────────────

FIX_STORE = {"picks": [
    # class 2022, WR bucket 1-10: outcomes 100, 200, 0 (bust), 60 → mean 90
    {"season": 2022, "pick": 2, "position": "WR", "sleeper_id": "w1",
     "round": 1, "team": "X", "name": "w1", "gsis_id": "g1"},
    {"season": 2022, "pick": 5, "position": "WR", "sleeper_id": "w2",
     "round": 1, "team": "X", "name": "w2", "gsis_id": "g2"},
    {"season": 2022, "pick": 8, "position": "WR", "sleeper_id": "w3",
     "round": 1, "team": "X", "name": "w3", "gsis_id": "g3"},
    {"season": 2022, "pick": 10, "position": "WR", "sleeper_id": "w4",
     "round": 1, "team": "X", "name": "w4", "gsis_id": "g4"},
    # class 2022, WR 33-64: only ONE row (n<4 → fallback to pooled mean)
    {"season": 2022, "pick": 40, "position": "WR", "sleeper_id": "w5",
     "round": 2, "team": "X", "name": "w5", "gsis_id": "g5"},
    # unmapped pick: excluded from fit, counted
    {"season": 2022, "pick": 50, "position": "WR", "sleeper_id": None,
     "round": 2, "team": "X", "name": "w6", "gsis_id": "g6"},
    # class 2023 (the replay season): must NOT enter a 2023 fit
    {"season": 2023, "pick": 3, "position": "WR", "sleeper_id": "w7",
     "round": 1, "team": "X", "name": "w7", "gsis_id": "g7"},
]}
FIX_TOTALS = {"w1": 100.0, "w2": 200.0, "w3": 0.0, "w4": 60.0, "w5": 140.0,
              "w7": 999.0}


def test_prior_cell_mean_fallback_and_bust_zero(monkeypatch):
    monkeypatch.setattr(R, "season_totals_of",
                        lambda s: (FIX_TOTALS, {}))
    monkeypatch.setattr(RP, "CLASSES", (2022,))
    fit = RP.fit_rookie_prior(2023, FIX_STORE)
    assert fit["fit_classes"] == [2022]
    assert fit["fit_rows"] == 5           # w6 unmapped, w7 wrong class
    assert fit["unmapped_excluded"] == 1
    cell = fit["cells"]["WR|1-10"]
    # (100 + 200 + 0 + 60) / 4 — the store-absent bust counts as 0.0 by
    # totals.get default; here w3 is an explicit 0.
    assert cell == {"mean_pts": 90.0, "n": 4, "fallback": False}
    fb = fit["cells"]["WR|33-64"]
    # pooled WR mean = (100+200+0+60+140)/5 = 100.0
    assert fb["fallback"] is True and fb["mean_pts"] == 100.0 and fb["n"] == 1
    # a position with no rows at all: 0.0-valued fallback, never a crash.
    assert fit["cells"]["QB|1-10"]["mean_pts"] == 0.0


def test_overlay_adds_only_new_class_year_pids(monkeypatch):
    monkeypatch.setattr(R, "season_totals_of",
                        lambda s: (FIX_TOTALS, {}))
    monkeypatch.setattr(RP, "CLASSES", (2022,))
    fit = RP.fit_rookie_prior(2023, FIX_STORE)
    baseline = {"w7": 55.0}   # already on the board → never overridden
    got = RP.rookie_overlay(2023, baseline, FIX_STORE, fit)
    assert got == {}
    got2 = RP.rookie_overlay(2023, {}, FIX_STORE, fit)
    assert set(got2) == {"w7"}
    assert got2["w7"]["pos"] == "WR"
    assert got2["w7"]["proj"] == fit["cells"]["WR|1-10"]["mean_pts"]


def test_walk_forward_guard_refuses_empty_fit(monkeypatch):
    with pytest.raises(AssertionError):
        RP.fit_rookie_prior(2021)


# ── real-data pins (committed stores are frozen — exact and deterministic) ───

def test_real_fit_2023_wr_first_round_cell(store):
    """Hand-derivable from the committed stores: the 2023 fit's WR|1-10
    cell is the mean 2021/2022 rookie-season total of the five sleeper-
    mapped WRs drafted in the top 10 of those classes."""
    fit = RP.fit_rookie_prior(2023, store)
    rows = [r for r in store["picks"]
            if r["season"] in (2021, 2022) and r["position"] == "WR"
            and r["pick"] <= 10 and r["sleeper_id"]]
    assert len(rows) == 5
    want = 0.0
    for r in rows:
        want += float(R.season_totals_of(r["season"])[0]
                      .get(r["sleeper_id"], 0.0))
    cell = fit["cells"]["WR|1-10"]
    assert cell["n"] == 5 and cell["fallback"] is False
    assert cell["mean_pts"] == pytest.approx(round(want / 5, 2))


def test_fit_is_deterministic(store):
    assert RP.fit_rookie_prior(2025, store) == RP.fit_rookie_prior(2025, store)


# ── THE LEAKAGE TRACE — the fit path opens no ≥replay-season store ───────────

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
    R.frozen_table()   # league config, memoized — same rule as the replay
    store = json.loads(STORE_PATH.read_text())
    opened = _trace_opens(
        monkeypatch, lambda: RP.fit_rookie_prior(season, store))
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
    assert bad == [], f"rookie fit for {season} touched forbidden: {bad}"
    # non-vacuous: the fit must actually read prior-season point stores.
    prior_reads = [p for p in opened
                   if Path(p).name.startswith(("component_stats_",
                                               "nflverse_weekly_points_"))]
    assert prior_reads, ("tracer saw no store reads at all — the guard "
                         "went vacuous")
