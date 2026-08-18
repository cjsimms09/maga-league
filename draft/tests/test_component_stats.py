# TERRITORY: A
"""The component-stats stores (2021-2025) — shape, provenance, row-count
sanity, the missing-vs-zero rule, and the parity contract with the committed
weekly points stores: component rows scored under the stores' own frozen
scoring table must reproduce the committed points EXACTLY for 2023/2024 (same
upstream, same engine, same table), must cover every fantasy-position
player-week the points stores grade, and the 2025 divergence (the committed
2025 store's rebuild path undercounts 2pt conversions) is pinned as a bounded,
named finding — not silently tolerated.

No test here touches the network: everything reads the committed stores.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import fetch_component_stats as FCS  # noqa: E402

SEASONS = (2021, 2022, 2023, 2024, 2025)
POINTS_STORE_SEASONS = (2023, 2024, 2025)
FANTASY_POS = ("QB", "RB", "WR", "TE")


@pytest.fixture(scope="module")
def stores():
    return {s: FCS.load_store(s) for s in SEASONS}


@pytest.fixture(scope="module")
def positions():
    rec = json.loads((HERE.parent / "data" / "player_positions.json").read_text())
    return rec["positions"]


# ── shape and provenance ─────────────────────────────────────────────────────

def test_every_season_store_exists_with_territory_first(stores):
    for season, doc in stores.items():
        assert next(iter(doc)) == "_territory", season
        assert "fetch_component_stats.py" in doc["_territory"]
        assert doc["season"] == season


def test_provenance_block_is_complete_and_counts_match_content(stores):
    for season, doc in stores.items():
        prov = doc["provenance"]
        for k in ("url", "tried", "fetched", "weeks_span", "season_type",
                  "position_groups", "columns_kept", "crosswalk",
                  "kept_player_weeks", "players", "sleeper_mapped_players",
                  "unmapped_gsis_players"):
            assert k in prov, (season, k)
        assert prov["url"].startswith(
            "https://github.com/nflverse/nflverse-data/releases/download/")
        assert prov["season_type"] == "REG"
        assert any(t["ok"] for t in prov["tried"])
        # counts are statements about the bytes, not the fetch — recompute
        n_rows = sum(len(w["players"]) for w in doc["weeks"])
        pids = {p for w in doc["weeks"] for p in w["players"]}
        assert prov["kept_player_weeks"] == n_rows, season
        assert prov["players"] == len(pids), season
        unmapped = {p for p in pids if p.startswith("gsis:")}
        assert prov["unmapped_gsis_players"] == len(unmapped), season
        assert prov["sleeper_mapped_players"] == len(pids) - len(unmapped), season


def test_weeks_are_regular_season_ascending_unique(stores):
    for season, doc in stores.items():
        wks = [w["week"] for w in doc["weeks"]]
        assert wks == sorted(set(wks)), season
        assert min(wks) >= 1 and max(wks) <= 18, season
        assert len(wks) >= 17, season  # a season missing weeks is a bad fetch


def test_row_count_sanity(stores):
    for season, doc in stores.items():
        prov = doc["provenance"]
        assert 4500 <= prov["kept_player_weeks"] <= 8000, (
            season, prov["kept_player_weeks"])
        assert 400 <= prov["players"] <= 800, (season, prov["players"])


def test_store_sizes_stay_committable(stores):
    for season in SEASONS:
        size = FCS.store_path(season).stat().st_size
        assert size < 2_000_000, (season, size)  # single-digit MB, with margin


# ── the missing-vs-zero rule ─────────────────────────────────────────────────

def test_missing_vs_zero_rule_is_stated_and_enforced(stores):
    for season, doc in stores.items():
        assert "MISSING DATA" in doc["_note"] and "never a zero" in doc["_note"]
        for w in doc["weeks"]:
            for pid, line in w["players"].items():
                assert line.get("pos") in FCS.POSITION_GROUPS, (season, pid)
                for k, v in line.items():
                    if k in FCS.STAT_KEYS:
                        # a zero-valued stat is encoded by ABSENCE, never stored
                        assert v != 0, (season, w["week"], pid, k)


def test_component_weeks_reader_round_trips_row_presence(stores):
    # games in season_components == number of week rows in component_weeks —
    # row-presence IS the games basis, same as the points stores
    for season in (2021, 2024):
        cw = FCS.component_weeks(season, 1, 17)
        agg = FCS.season_components(season, last_week=17)
        assert set(cw) == set(agg)
        for pid in list(cw)[:50]:
            assert agg[pid]["games"] == len(cw[pid]), (season, pid)


# ── volume sanity (the columns the points stores never had) ──────────────────

def test_each_season_has_full_volume_qbs(stores):
    for season in SEASONS:
        agg = FCS.season_components(season, last_week=17)
        qb_att = sorted((v.get("pass_att", 0) for v in agg.values()
                         if v.get("pos") == "QB"), reverse=True)
        assert qb_att[0] > 400, (season, qb_att[0])  # somebody threw a season
        assert qb_att[0] < 800, (season, qb_att[0])  # and it is a season, not a sum bug
        wr_tgt = sorted((v.get("tgt", 0) for v in agg.values()
                         if v.get("pos") == "WR"), reverse=True)
        assert wr_tgt[0] > 100, (season, wr_tgt[0])


def test_team_field_supports_team_volume_sums(stores):
    # team assignment was a NAMED absence of v2/v3/v4 — assert it is closed:
    # every 2024 player-week carries a team, and team target sums are plausible
    doc = stores[2024]
    for w in doc["weeks"][:3]:
        teams = {}
        for pid, line in w["players"].items():
            assert "team" in line, (w["week"], pid)
            teams.setdefault(line["team"], 0)
            teams[line["team"]] += line.get("tgt", 0)
        # a bye-less early week has ~32 teams throwing 20-55 targets each
        assert len(teams) >= 26, w["week"]
        for team, tgts in teams.items():
            assert 10 <= tgts <= 70, (w["week"], team, tgts)


# ── parity with the committed weekly points stores ───────────────────────────

@pytest.fixture(scope="module")
def frozen_cfg():
    return FCS.frozen_scoring_table()


def _store_points(season):
    doc = json.loads((BT / f"nflverse_weekly_points_{season}.json").read_text())
    out = {}
    fps = set()
    for w in doc["weeks"]:
        if 1 <= w["week"] <= 17:
            fps.add(w["scoring_fingerprint"])
            for pid, v in w["points"].items():
                out.setdefault(str(pid), {})[w["week"]] = float(v)
    return out, fps


def test_one_scoring_fingerprint_across_all_points_stores():
    fps = set()
    for season in POINTS_STORE_SEASONS:
        fps |= _store_points(season)[1]
    assert len(fps) == 1  # frozen_scoring_table() is THE table, not A table


def test_component_scoring_reproduces_2023_and_2024_exactly(frozen_cfg):
    for season in (2023, 2024):
        mine = FCS.scored_weekly_points(season, frozen_cfg, last_week=17)
        theirs, _ = _store_points(season)
        compared = 0
        for pid, rows in theirs.items():
            for wk, pts in rows.items():
                if pid in mine and wk in mine[pid]:
                    assert mine[pid][wk] == pytest.approx(pts, abs=0.01), \
                        (season, pid, wk)
                    compared += 1
        assert compared > 4500, season


def test_component_store_covers_every_graded_fantasy_player_week(positions):
    # the graded population (fantasy-position players with a points-store row)
    # must be a SUBSET of the component store — a projector reading components
    # must never lose a player the harness grades
    for season in POINTS_STORE_SEASONS:
        theirs, _ = _store_points(season)
        cw = FCS.component_weeks(season, 1, 17)
        for pid, rows in theirs.items():
            if positions.get(pid) not in FANTASY_POS:
                continue
            for wk in rows:
                assert pid in cw and wk in cw[pid], (season, pid, wk)



# ── the Vegas lines store (Cory's 2026-08-16 scope addendum) ─────────────────

def test_vegas_store_shape_provenance_and_coverage():
    doc = FCS.load_vegas()
    assert next(iter(doc)) == "_territory"
    prov = doc["provenance"]
    assert prov["url"].startswith(
        "https://github.com/nflverse/nflverse-data/releases/download/")
    assert prov["season_type"] == "REG"
    for season in ("2021", "2022", "2023", "2024", "2025"):
        games = doc["seasons"][season]
        # a modern regular season is 271-272 games; fewer means dropped weeks
        assert 265 <= len(games) <= 285, (season, len(games))
        assert prov["games_per_season"][season] == len(games)
        for g in games:
            assert 1 <= g["week"] <= 18, (season, g)
            assert 20.0 <= g["total_line"] <= 70.0, (season, g)
            assert abs(g["spread_line"]) <= 25.0, (season, g)


def test_vegas_missing_line_is_absent_never_zero():
    doc = FCS.load_vegas()
    for season, games in doc["seasons"].items():
        for g in games:
            # a stored 0-0 line would be a fabricated game, not a market
            assert g["total_line"] != 0, (season, g)
    assert "ABSENT" in doc["_note"] and "WEEK 1" in doc["_note"]
    # the standing ceiling context travels with the store, not just the doc
    assert "+0.23" in doc["_note"]


def test_implied_team_totals_week1_only_by_default():
    imp = FCS.implied_team_totals(2024)
    assert len(imp) == 32                       # every team opens somewhere
    for team, pts in imp.items():
        assert 10.0 <= pts <= 40.0, (team, pts)
    # arithmetic check: implied home + implied away == total_line, week 1
    doc = FCS.load_vegas()
    g = doc["seasons"]["2024"][0]
    assert g["week"] == 1
    home = g["total_line"] / 2 + g["spread_line"] / 2
    away = g["total_line"] - home
    all_imp = FCS.implied_team_totals(2024, 1, 1)
    # the opener teams' week-1 means include exactly their one week-1 game
    assert all_imp[g["home"]] == pytest.approx(home, abs=0.001)
    assert all_imp[g["away"]] == pytest.approx(away, abs=0.001)


def test_2025_divergence_is_bounded_and_named(frozen_cfg):
    """The committed 2025 points store was partly rebuilt from pbp (the library
    path 404'd that season) and that path never emitted 2pt conversions — so a
    bounded set of 2025 player-weeks scores HIGHER from components than the
    store recorded. Pin the bound and the direction; the committed store is
    not modified (it is the frozen graded truth of the v2-v5 protocol)."""
    mine = FCS.scored_weekly_points(2025, frozen_cfg, last_week=17)
    theirs, _ = _store_points(2025)
    diffs = []
    compared = 0
    for pid, rows in theirs.items():
        for wk, pts in rows.items():
            if pid in mine and wk in mine[pid]:
                compared += 1
                d = mine[pid][wk] - pts
                if abs(d) > 0.05:
                    diffs.append(d)
    assert compared > 4000
    # Re-pinned 2026-08-18 (register 5d): the 2025 store was REBUILT from the
    # component store itself (build_weekly_points_from_components, one frozen
    # scoring table), so the divergence this test bounded — the pbp path's
    # missing 2pt conversions — is GONE by construction: zero rows differ.
    # The healed state is the pin now; any reappearing diff means a second
    # writer is back, which is the drift this file exists to catch.
    assert len(diffs) == 0, (
        f"{len(diffs)} of {compared} rows diverge between the component "
        "store and the weekly-points store — a second derivation is back")
