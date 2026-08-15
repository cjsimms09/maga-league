# TERRITORY: A
"""EXP-ANALYZER-PRIOR mechanics, tested offline against the preregistration
(draft/backtest/EXP-ANALYZER-PRIOR-PREREG.md, commit a0c70705).

What is under test:
  · the blend rule (0.7/0.3 + the two fallback arms) — pure-function parity
    with model_accuracy_backtest's declared semantics
  · the best-lineup optimizer (flex optimality, K/DEF exclusion, empties)
  · the committed means artifact's invariants (statuses per prereg, 10 teams,
    availability-masking can only lower a team-week prior)
  · the committed sim artifact's integrity (parity gate 36/36, the
    preregistered cell counts, and the centering-neutrality theorem: ARM B and
    ARM B_raw identical per cell — mean SHIFTS shared by all teams cannot move
    H2H outcomes, so the flagged centering designed-guess is outcome-neutral)

Run: python3 -m pytest draft/tests/test_exp_analyzer_prior.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BACKTEST = HERE.parent / "backtest"
sys.path.insert(0, str(BACKTEST))

import exp_analyzer_prior_means as M  # noqa: E402

MEANS_ART = BACKTEST / "exp_analyzer_prior_means.json"
SIM_ART = BACKTEST / "exp_analyzer_prior.json"


# ── blend rule: parity with the declared champion-baseline semantics ─────────
def test_blend_weights_are_the_declared_pair():
    assert M.RECENCY_WEIGHTS == (0.7, 0.3)


def test_blend_full_pair_and_per_pid_fallback():
    last = {"a": 100.0, "b": 50.0}
    prior = {"a": 200.0}            # b has no prior row -> last alone
    out = M.blend_from_totals(last, prior)
    assert out["a"] == pytest.approx(0.7 * 100 + 0.3 * 200)
    assert out["b"] == pytest.approx(50.0)


def test_blend_population_is_last_season_rows_only():
    # a pid present ONLY in the prior season gets no forecast (rookie-mirror
    # of model_accuracy_backtest: population = pids with a Y-1 row)
    out = M.blend_from_totals({"a": 10.0}, {"a": 5.0, "ghost": 300.0})
    assert "ghost" not in out


def test_blend_no_prior_store_falls_back_league_wide():
    last = {"a": 100.0, "b": 50.0}
    assert M.blend_from_totals(last, None) == last


# ── best-lineup optimizer ────────────────────────────────────────────────────
RP = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN"]


def test_lineup_flex_takes_best_leftover_across_positions():
    pos = {"q1": "QB", "r1": "RB", "r2": "RB", "r3": "RB",
           "w1": "WR", "w2": "WR", "w3": "WR", "t1": "TE"}
    vals = {"q1": 20, "r1": 15, "r2": 14, "r3": 13,
            "w1": 12, "w2": 11, "w3": 5, "t1": 8}
    pids = list(pos)
    # fixed: q1 + r1 + r2 + w1 + w2 + t1 = 80; best flex leftover = r3 (13)
    assert M.best_lineup_sum(pids, vals, pos, RP) == pytest.approx(93.0)


def test_lineup_kdef_and_unknown_positions_score_zero():
    pos = {"q1": "QB", "phi": "DEF", "k1": "K"}
    vals = {"q1": 20, "phi": 999, "k1": 999, "mystery": 999}
    assert M.best_lineup_sum(["q1", "phi", "k1", "mystery"], vals, pos, RP) \
        == pytest.approx(20.0)


def test_lineup_empty_and_short_rosters_do_not_crash():
    assert M.best_lineup_sum([], {}, {}, RP) == 0.0
    pos = {"w1": "WR"}
    assert M.best_lineup_sum(["w1"], {"w1": 7.0}, pos, RP) == pytest.approx(7.0)


# ── the committed means artifact ─────────────────────────────────────────────
@pytest.fixture(scope="module")
def means():
    assert MEANS_ART.exists(), "run exp_analyzer_prior_means.py first"
    return json.loads(MEANS_ART.read_text())


def test_means_territory_is_first_key(means):
    assert next(iter(means)) == "_territory"
    assert means["_territory"].startswith("TERRITORY: A")


def test_means_season_statuses_match_prereg(means):
    assert means["status"] == {"2023": "no_prior_store",
                               "2024": "last_season_alone_fallback",
                               "2025": "full_blend"}
    assert "2023" not in means["team_prior"]   # refusal, not an invented number


def test_means_ten_teams_per_measurable_season(means):
    for year in ("2024", "2025"):
        assert len(means["team_prior"][year]) == 10
        for wk, m in means["team_prior_by_week"][year].items():
            assert len(m) == 10


def test_masked_week_prior_never_exceeds_full_roster_prior(means):
    # availability masking only REMOVES players, so a team-week prior can
    # never beat the same team's unmasked prior
    for year in ("2024", "2025"):
        full = means["team_prior"][year]
        for wk, m in means["team_prior_by_week"][year].items():
            for rid, v in m.items():
                assert v <= full[rid] + 1e-9, (year, wk, rid)


# ── the committed sim artifact ───────────────────────────────────────────────
@pytest.fixture(scope="module")
def sim():
    assert SIM_ART.exists(), "run exp_analyzer_prior_sim.js first"
    return json.loads(SIM_ART.read_text())


def test_sim_territory_and_prereg_pointer(sim):
    assert next(iter(sim)) == "_territory"
    assert sim["_territory"].startswith("TERRITORY: A")
    assert "EXP-ANALYZER-PRIOR-PREREG" in sim["_prereg"]


def test_parity_gate_all_cells_and_none_failed(sim):
    # 3 seasons x 12 checkpoints, every one bit-compared to the shipped
    # projectStandings; a single failure voids the run
    assert sim["parity"] == {"checked": 36, "failed": 0}


def test_cell_counts_match_prereg(sim):
    cells = sim["cells"]
    assert len(cells) == 36
    b_cells = [c for c in cells if "B" in c]
    assert len(b_cells) == 24                      # 2024 + 2025 only
    assert all(c["season"] != 2023 for c in b_cells)
    for m in ("hits", "mae", "brier"):
        assert sim["pooled"]["B"][m]["n_cells"] == 24


def test_centering_neutrality_theorem_B_equals_B_raw(sim):
    # a mean shift shared by every team cancels in every H2H draw, so the
    # centered and raw arms must be IDENTICAL cell by cell — the empirical
    # proof that the flagged centering designed-guess is outcome-neutral
    for c in sim["cells"]:
        if "B" in c:
            assert c["B"] == c["B_raw"], (c["season"], c["throughWeek"])


def test_verdict_is_the_preregistered_vocabulary(sim):
    v = sim["verdict"]
    assert v.startswith("B_wins") or v.startswith("no_detectable_improvement")


def test_controls_are_the_preregistered_floors(sim):
    assert sim["controls"]["random_set_expected_hits"] == pytest.approx(1.6)
    assert sim["controls"]["constant_p_brier"] == pytest.approx(0.24)
