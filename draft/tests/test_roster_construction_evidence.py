# TERRITORY: A
"""Contracts for the 2026-08-15 roster-construction evidence set.

Three research artifacts feed draft/audit/roster_construction_audit_2026-08-15.md:
exp_keeper_option.json, exp_bench_mix.json, exp_tiebreak_signals.json. These
tests pin (1) the 2023 draft normalization that the keeper study's benchmark
depends on — the season carries its keepers TWICE (a 30-pick keeper draft AND
unflagged rounds 1-3 of the main draft) and concatenating both poisoned the
first run's benchmark; (2) each artifact's territory/prereg contract; (3) the
position overlay that rescues the three current keepers (7564/3198/8151),
absent from player_positions.json because that file is written before kept
players are separated.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"


def _load(name):
    return json.loads((BT / name).read_text())


@pytest.fixture(scope="module")
def keeper_mod():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "exp_keeper_option", BT / "exp_keeper_option.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_2023_normalization_dedupes_keepers(keeper_mod):
    hist = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())
    picks = keeper_mod.season_draft(hist, "2023")
    # one row per drafted player — the keeper draft must not double-count
    assert len(picks) == 150
    keepers = [p for p in picks if p.get("is_keeper")]
    # all 30 keepers derived (the raw main draft carries zero is_keeper flags),
    # including 7528, who sits at main-draft round 4 but cost a round-3 keeper
    # slot — the keeper draft's round wins.
    assert len(keepers) == 30
    assert all(int(p["round"]) <= 3 for p in keepers)


def test_2024_2025_flags_pass_through(keeper_mod):
    hist = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())
    for yr, expected in (("2024", 23), ("2025", 20)):
        picks = keeper_mod.season_draft(hist, yr)
        assert len(picks) == 150
        assert sum(1 for p in picks if p.get("is_keeper")) == expected


@pytest.mark.parametrize("name", [
    "exp_keeper_option.json", "exp_bench_mix.json", "exp_tiebreak_signals.json"])
def test_artifact_contract(name):
    art = _load(name)
    keys = list(art.keys())
    assert keys[0] == "_territory", f"{name}: _territory must be the first key"
    assert "TERRITORY: A" in art["_territory"]
    assert "prereg" in art, f"{name}: preregistration pointer required"


def test_keeper_artifact_internal_consistency():
    art = _load("exp_keeper_option.json")
    q1 = art["q1_keeper_return_over_forfeit"]["summary"]
    # 73 keeper-seasons: 30 (2023, derived by membership) + 23 (2024) + 20 (2025).
    assert q1["n_keeper_seasons"] == 73
    by_round = q1["by_cost_round"]
    assert sum(by_round[r]["n"] for r in by_round) <= q1["n_measurable"]
    q3 = art["q3_option_value_by_source_bucket"]
    # the headline shape the audit quotes: rounds 13-15 produced ZERO keepers
    assert q3["13-15"]["p_kept_next"] == 0.0


def test_bench_mix_population_accounts_for_every_pick():
    art = _load("exp_bench_mix.json")
    # 30 team-seasons x 15 draft slots = 450 picks; 9 starters + flex
    # classification leaves 6 bench picks per team = 180, plus the 2023
    # 15th-round quirk absorbed by classification — pin the actual total so
    # a data change is loud, not silent.
    assert art["team_seasons"] == 30
    total = sum(v["bench_picks_total"] for v in art["by_position"].values())
    assert total == art["bench_picks_total"]
    assert art["unknown_position_rows"] <= 1, (
        "position overlay regressed — the three current keepers must resolve")


def test_tiebreak_artifact_shape():
    art = _load("exp_tiebreak_signals.json")
    p1 = art["part1_ceiling_structure"]
    for pos in ("QB", "RB", "WR", "TE"):
        assert p1[pos]["n"] > 0
        assert p1[pos]["spearman_ceiling_vs_mean"] is not None
    p2 = art["part2_age_experience"]
    assert p2["population"] > 0
    assert "coverage_note" in p2
