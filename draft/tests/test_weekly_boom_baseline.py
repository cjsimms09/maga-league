"""Tests for draft/backtest/weekly_boom_baseline.py — the null every weekly
boom feature must beat, preregistered in
draft/WEEKLY-BOOM-BASELINE-PREREG-2026-08-21.md.

The prereg promised a specific Rule 3e known-positive: a synthetic season
where one planted player is top-12 every week must come back at boom rate
1.0, and a planted never-scorer at 0.0. A harness that cannot produce those
two is not measuring booms, and every rate in the artifact would be
meaningless. That pair is `test_KNOWN_POSITIVE_*` / `test_KNOWN_NEGATIVE_*`
below.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import weekly_boom_baseline as B  # noqa: E402

ARTIFACT = ROOT / "draft" / "backtest" / "weekly_boom_baseline.json"


def _doc() -> dict:
    return json.loads(ARTIFACT.read_text())


# ── the harness itself ────────────────────────────────────────────────────

def _synthetic(n_others: int = 30, weeks: int = 5):
    """A season where `star` outscores everyone every week and `bench` scores
    zero every week. Everyone else is mid-pack."""
    by_pos_week = {}
    for w in range(1, weeks + 1):
        rows = [("star", 100.0), ("bench", 0.0)]
        rows += [(f"p{i}", 10.0 + i) for i in range(n_others)]
        by_pos_week[("WR", w)] = rows
    return by_pos_week


def test_KNOWN_POSITIVE_a_planted_every_week_top_scorer_comes_back_at_rate_one():
    booms, _ties = B.boom_sets(_synthetic())
    weeks = [k for k in booms if k[0] == "WR"]
    assert weeks, "no weeks built — the fixture is wrong, not the code"
    hits = sum(1 for k in weeks if "star" in booms[k])
    assert hits == len(weeks), f"planted top scorer boomed {hits}/{len(weeks)} weeks"


def test_KNOWN_NEGATIVE_a_planted_never_scorer_comes_back_at_rate_zero():
    booms, _ties = B.boom_sets(_synthetic())
    weeks = [k for k in booms if k[0] == "WR"]
    hits = sum(1 for k in weeks if "bench" in booms[k])
    assert hits == 0, f"planted zero-scorer boomed {hits}/{len(weeks)} weeks"


def test_the_boom_set_is_exactly_twelve_when_the_field_is_deeper_than_twelve():
    booms, _ = B.boom_sets(_synthetic(n_others=30))
    for key, pids in booms.items():
        assert len(pids) == B.BOOM_RANK, (key, len(pids))


def test_a_field_SHALLOWER_than_twelve_booms_everyone_rather_than_crashing():
    """A thin week is a real state (a position with <12 scorers). It must
    degrade to 'everyone boomed', not raise and not silently drop the week."""
    booms, _ = B.boom_sets({("TE", 1): [("a", 5.0), ("b", 3.0)]})
    assert booms[("TE", 1)] == {"a", "b"}


def test_cutoff_ties_are_COUNTED_not_silently_broken():
    """Two players tied exactly at the 12th-place cutoff: the store's ordering
    picks one, and the harness must SAY that happened."""
    rows = [(f"p{i}", float(100 - i)) for i in range(11)]      # ranks 1..11
    rows += [("tieA", 5.0), ("tieB", 5.0)]                      # tied at 12/13
    _booms, ties = B.boom_sets({("RB", 1): rows})
    assert ties["weeks_with_a_cutoff_tie"] == 1, ties


def test_tier_buckets_cover_every_rank_with_no_gap_and_no_overlap():
    seen = [B.tier_of(r) for r in range(1, 200)]
    assert seen[0] == "T1" and seen[11] == "T1"
    assert seen[12] == "T2" and seen[23] == "T2"
    assert seen[24] == "T3" and seen[35] == "T3"
    assert seen[36] == "T4" and seen[-1] == "T4"


def test_an_unlabeled_scoring_row_is_COUNTED_never_dropped_silently():
    pts = {"weeks": [{"week": 1, "points": {"known": 10.0, "ghost": 7.0}}]}
    _by, cov = B.weekly_scores(pts, {(1, "known"): "WR"})
    assert cov["scoring_player_weeks"] == 2
    assert cov["labeled"] == 1
    assert cov["unlabeled"] == 1


# ── the committed artifact ────────────────────────────────────────────────

def test_the_artifact_labels_the_degenerate_reading_so_it_cannot_be_quoted_as_a_finding():
    """prereg S2. The unconditional rate is mechanically 12/N; if that warning
    ever disappears, someone will quote it as a boom rate."""
    doc = _doc()
    assert "12/N" in doc["degenerate_reading_warning"]
    for s in doc["seasons"]:
        assert "degenerate_unconditional" in s


def test_the_artifact_states_that_100pct_coverage_is_a_TAUTOLOGY():
    """The correction this whole study rests on. If this text goes away, the
    next reader takes 100% as evidence of a healthy join, which it is not."""
    doc = _doc()
    assert "BY CONSTRUCTION" in doc["coverage_is_a_tautology"]
    for s in doc["seasons"]:
        assert s["coverage"]["unlabeled"] == 0, s["season"]


def test_K_and_DEF_are_declared_out_of_scope_WITH_a_reason_not_silently_omitted():
    oos = _doc()["positions_out_of_scope"]
    assert set(oos["positions"]) == {"K", "DEF"}
    assert "position_groups" in oos["reason"]


def test_the_blind_call_is_recorded_as_FALSE_by_the_artifact_itself():
    """The prereg called QB most stable and RB least. The artifact says the
    inverse. This test pins the INVERSION, so a later re-run that quietly
    flips it back gets caught rather than silently vindicating the call."""
    stab = _doc()["stability"]
    assert stab["most_stable"] == "RB", stab["most_stable"]
    assert stab["least_stable"] == "QB", stab["least_stable"]


def test_every_tier_cell_has_a_real_population_behind_its_rate():
    """Rule 3i: a rate with no n behind it is not a finding."""
    for s in _doc()["seasons"]:
        for pos, cells in s["conditional"].items():
            for tier, c in cells.items():
                if c["boom_rate"] is not None:
                    assert c["player_weeks"] >= 30, (s["season"], pos, tier, c)
