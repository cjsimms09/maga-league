# TERRITORY: A
"""Additions A and B to the empirical draft-value study — the claims they make
about themselves.

Preregistration: `draft/audit/empirical_draft_value_2026-08-16.md` §§12–14.

The load-bearing tests here, and why each exists:

  * THE 2025 STORE DEFECT IS PINNED, NOT JUST DESCRIBED. §12.1's whole
    justification for counting games from the component store is that the
    weekly-points store drops zero-point rows in 2025. If that ever silently
    changes — the store is refetched, say — the audit document's reasoning stops
    matching reality. So the divergence itself is asserted, and a fixed 2025
    store makes this test go red and the document get revisited.
  * BYES ARE NOT INJURIES. A bye is an absent row. If `team_games` stopped
    subtracting it, every player in the league would look like he missed a game
    and the availability numbers would all shift by 1/17. Pinned against the
    schedule.
  * THE MARKET TABLE DIFFERS IN EXACTLY TWO KEYS. Addition B's entire claim is
    that every difference it reports is attributable to half-PPR and 6-point
    passing TDs. A third changed key would silently invalidate that, so the
    diff between the tables is asserted key by key.

No test here touches the network.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import empirical_draft_value as EDV                 # noqa: E402
import empirical_draft_value_additions as ADD       # noqa: E402


# ── the defect that forced the design (§12.1) ───────────────────────────────

def test_2023_and_2024_stores_agree_on_row_presence():
    """The control case. If these ever disagreed, counting games from either
    store would be arbitrary and §12.1's argument would need rewriting."""
    positions = EDV.positions_record()
    for season in (2023, 2024):
        wk = EDV.weekly_points(season)
        comp = EDV.component_weeks(season)
        pres = {}
        for w, players in comp.items():
            if 1 <= w <= EDV.LAST_SCORED_WEEK:
                for pid in players:
                    pres.setdefault(pid, set()).add(w)
        disagree = 0
        for pid in set(wk) | set(pres):
            if positions.get(pid) not in EDV.POSITIONS:
                continue
            disagree += len(set(wk.get(pid, {})) ^ pres.get(pid, set()))
        assert disagree == 0, (season, disagree)


def test_2025_points_store_drops_zero_point_rows():
    """THE DEFECT ITSELF, pinned. 2023/2024 carry ~300 exactly-zero rows each;
    2025 carries a handful. That is why this study counts games from the
    component store. A refetched 2025 store makes this go red — which is the
    point: the audit document's §12.1 would then need revisiting."""
    positions = EDV.positions_record()
    zeros = {}
    for season in EDV.SEASONS:
        wk = EDV.weekly_points(season)
        zeros[season] = sum(1 for pid, rows in wk.items()
                            if positions.get(pid) in EDV.POSITIONS
                            for v in rows.values() if v == 0.0)
    assert zeros[2023] > 200 and zeros[2024] > 200
    assert zeros[2025] < 50, zeros
    # and the presence divergence that follows from it
    comp = EDV.component_weeks(2025)
    pres = sum(1 for w, players in comp.items() if 1 <= w <= 17
               for pid in players if positions.get(pid) in EDV.POSITIONS)
    wk = EDV.weekly_points(2025)
    pts = sum(len(r) for pid, r in wk.items()
              if positions.get(pid) in EDV.POSITIONS)
    assert pres - pts > 500, (pres, pts)


def test_the_2025_gap_does_not_reach_any_starter_set():
    """§12.1's other half: stage 2 is unaffected because every player the 2025
    points store is missing is a near-zero scorer. Asserted, not asserted-by-
    prose."""
    import fetch_component_stats as FCS
    positions = EDV.positions_record()
    comp = FCS.scored_weekly_points(2025, EDV.frozen_table(), 17)
    totals = {p: sum(float(v) for v in r.values()) for p, r in comp.items()}
    committed, games = EDV.season_totals(2025)
    u = EDV.universe(2025, positions)
    for pid, pts in totals.items():
        if pid in committed and games.get(pid, 0) > 0:
            continue
        pos = positions.get(pid)
        if pos not in EDV.POSITIONS:
            continue
        rank = sum(1 for _p, v in u[pos] if v > pts) + 1
        assert rank > EDV.STARTER_RANK[pos], (pid, pos, pts, rank)


# ── byes (§12.2) ────────────────────────────────────────────────────────────

def test_every_team_has_exactly_one_bye_week_in_each_season():
    for season in EDV.SEASONS:
        byes = ADD.team_bye_weeks(season)
        assert len(byes) == 32, (season, len(byes))
        for team, weeks in byes.items():
            assert len(weeks) == 1, (season, team, sorted(weeks))


def test_team_games_subtracts_the_bye_so_a_full_season_is_16_not_17():
    """A bye is an absent row. If it were not subtracted, every player in the
    league would read as having missed a game."""
    for season in EDV.SEASONS:
        av = ADD.availability(season)
        tg = [v["team_games"] for v in av.values()]
        assert max(tg) <= EDV.LAST_SCORED_WEEK
        # the modal player is on one team with one bye
        assert sorted(tg)[len(tg) // 2] == ADD.FULL_SEASON_GAMES


def test_availability_is_bounded_and_games_are_component_counted():
    av = ADD.availability(2024)
    assert all(0.0 <= v["availability"] <= 1.0 for v in av.values())
    comp = EDV.component_weeks(2024)
    pid = next(iter(av))
    hand = sum(1 for w, players in comp.items() if 1 <= w <= 17 and pid in players)
    assert av[pid]["games"] == hand


# ── Addition B's central claim (§14.2) ──────────────────────────────────────

def test_market_table_differs_from_league_table_in_exactly_two_keys():
    """Addition B's whole claim is that every difference it reports comes from
    half-PPR and 6-point passing TDs. A third changed key would invalidate that
    silently."""
    league = EDV.frozen_table()
    market = ADD.market_table()
    assert set(league) == set(market)
    diff = {k for k in league if league[k] != market[k]}
    assert diff == {"rec", "pass_td"}, diff
    assert market["rec"] == 1.0 and market["pass_td"] == 4.0
    assert league["rec"] == 0.5 and league["pass_td"] == 6.0


def test_market_scoring_moves_the_right_players_in_the_right_direction():
    """A reception-heavy player must gain under full PPR and a pure runner must
    gain under 6-point passing TDs. A sign error in the rescoring would be
    invisible in the aggregates and fatal to the section."""
    import fetch_component_stats as FCS
    league = {p: sum(float(v) for v in r.values()) for p, r in
              FCS.scored_weekly_points(2024, EDV.frozen_table(), 17).items()}
    market = {p: sum(float(v) for v in r.values()) for p, r in
              FCS.scored_weekly_points(2024, ADD.market_table(), 17).items()}
    comp = EDV.component_weeks(2024)
    recs, ptds = {}, {}
    for w, players in comp.items():
        if not 1 <= w <= 17:
            continue
        for pid, row in players.items():
            recs[pid] = recs.get(pid, 0) + row.get("rec", 0)
            ptds[pid] = ptds.get(pid, 0) + row.get("pass_td", 0)
    for pid in league:
        delta = market[pid] - league[pid]
        expect = 0.5 * recs.get(pid, 0) - 2.0 * ptds.get(pid, 0)
        assert abs(delta - expect) < 0.5, (pid, delta, expect)


# ── attribution and persistence machinery ───────────────────────────────────

def test_bust_attribution_labels_are_exhaustive_and_disjoint():
    positions = EDV.positions_record()
    out = ADD.a1_bust_attribution(positions)
    for pos, v in out["by_position"].items():
        rates = (v["starter_rate"] + v["production_rate"]
                 + v["absence_rate"] + v["both_rate"])
        assert abs(rates - 1.0) < 0.005, (pos, rates)
        counts = (v["starter_n"] + v["production_n"]
                  + v["absence_n"] + v["both_n"])
        assert counts == v["n"], (pos, counts, v["n"])


def test_the_no_injury_counterfactual_can_only_raise_the_starter_rate():
    """Scaling every pick to 16 games at his own rate cannot make a player
    worse — if a band's counterfactual rate came out BELOW its actual rate the
    scaling has a sign or ranking error."""
    positions = EDV.positions_record()
    cf = ADD.a1_bust_attribution(positions)["if_nobody_got_hurt"]
    for band, v in cf.items():
        assert v["if_everyone_played_16"] >= v["actual_starter_rate"] - 1e-9, band
        assert v["lift"] >= 0, band


def test_established_only_arm_actually_restricts_the_population():
    """The robustness arm is only meaningful if it drops the depth players it
    claims to drop."""
    positions = EDV.positions_record()
    full = ADD.a2_persistence(positions)
    est = ADD.a2_persistence(positions, established_only=True)
    for pos in EDV.POSITIONS:
        a = full["availability_to_availability"][pos]
        b = est["availability_to_availability"][pos]
        if "n" in a and "n" in b:
            assert b["n"] < a["n"], pos


def test_preregistered_addition_constants():
    assert ADD.AVAIL_LOW == 0.75
    assert ADD.FULL_SEASON_GAMES == 16
    assert ADD.MOVER_RANKS == 5
    assert ADD.TOP_MOVER_WINDOW == 40
    assert ADD.MARKET_SUBSTITUTIONS == {"rec": 1.0, "pass_td": 4.0}


@pytest.mark.parametrize("season", EDV.SEASONS)
def test_availability_population_is_sane(season):
    av = ADD.availability(season)
    assert len(av) > 500, (season, len(av))
    full = sum(1 for v in av.values() if v["availability"] >= 1.0)
    assert full > 50, (season, full)
