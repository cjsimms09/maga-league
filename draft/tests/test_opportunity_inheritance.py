# TERRITORY: A
"""Tests for the opportunity-inheritance study.

The ones that matter are the ones that would catch a wrong answer rather than a
crash: the graded cell must reproduce the bar's own cell exactly, the leak-free
arm must not read a season-Y byte, and the preregistered verdict rules must fire
in both directions.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(ROOT / "draft"))

pytest.importorskip("numpy")

import opportunity_inheritance as OI  # noqa: E402
import tiered_outcome_model as T      # noqa: E402

ARTIFACT = BT / "opportunity_inheritance.json"


@pytest.fixture(scope="module")
def art():
    if not ARTIFACT.exists():
        pytest.skip("artifact not built; run draft/backtest/opportunity_inheritance.py")
    return json.loads(ARTIFACT.read_text())


# ── the bar itself ──────────────────────────────────────────────────────────
def test_THE_GRADED_CELL_REPRODUCES_THE_BAR_EXACTLY():
    """170 player-seasons, 21 LEAGUE-WINNERs — the same cell tiered_outcome_model
    graded, or the hits@10 numbers are not comparable to the market's 7."""
    total = winners = 0
    for season in OI.TEST_SEASONS:
        rows, _ = T._rows_for_season(season, T.K_SLOTS, survivorship_zero=False)
        market = T._market(season)
        cell = [r for r in rows
                if market.get(r["pid"]) and market[r["pid"]] >= 61]
        total += len(cell)
        winners += sum(1 for r in cell if r["tier"] == T.LEAGUE_WINNER)
    assert (total, winners) == (170, 21)


def test_the_bar_constants_match_the_published_verdict():
    assert OI.BAR_MARKET_AT_10 == 7
    assert abs(OI.BAR_CHANCE_AT_10 - 3.71) < 0.005
    assert OI.LATE_ROUND_FIRST_PICK == 61


# ── the departure rule ──────────────────────────────────────────────────────
def test_V_INSEASON_READS_NO_SEASON_Y_BYTE():
    """The strictly-leak-free arm must be computable with season Y's stores
    made unreadable. Anything else and 'leak-free' is a claim, not a property."""
    real = OI._comp
    calls = []

    def spy(season):
        calls.append(season)
        return real(season)

    OI._comp = spy
    OI._STORES.clear()
    try:
        OI.departures(2024, "V_INSEASON")
    finally:
        OI._comp = real
        OI._STORES.clear()
    assert calls, "the arm read no store at all — the spy is not wired"
    assert max(calls) <= 2023, f"V_INSEASON opened season {max(calls)} for a 2024 answer"


def test_V_MOVED_IS_A_SUBSET_OF_V_ALL():
    """V_MOVED drops exactly the players absent from season Y entirely, which is
    the injury confound. It can never contain someone V_ALL does not."""
    for season in OI.TEST_SEASONS:
        allv = OI.departures(season, "V_ALL")
        moved = OI.departures(season, "V_MOVED")
        assert moved <= allv
        assert len(moved) < len(allv), "no injury/retirement cases at all is a smell"


def test_an_unknown_arm_refuses_rather_than_defaulting():
    with pytest.raises(ValueError):
        OI.departures(2024, "V_WHATEVER")


def test_departure_breakdown_counts_the_ambiguous_bucket_rather_than_hiding_it():
    for season in OI.TEST_SEASONS:
        b = OI.departure_breakdown(season)
        assert b["absent_from_season_entirely"] > 0
        assert "NOT a departure" in b["note"]


# ── absent != zero ──────────────────────────────────────────────────────────
def test_draft_capital_is_absent_not_imputed():
    cap = OI.draft_capital()
    feats = OI.inheritance_features(2024, "V_ALL", cap)
    missing = [f for f in feats.values() if f["nfl_exp"] is None]
    assert missing, "no player lacks a capital record — the store cannot be right"
    assert all(f["draft_round"] is None and f["draft_overall"] is None
               for f in missing)


def test_young_is_none_not_zero_when_capital_is_absent():
    cap = OI.draft_capital()
    rows, _ = OI.population(2024, "V_ALL", cap)
    assert any(r["young"] is None for r in rows)
    assert any(r["young"] == 1.0 for r in rows)
    assert any(r["young"] == 0.0 for r in rows)


def test_red_zone_vacancy_is_absent_not_proxied():
    """prereg GAP A: no committed store carries a red-zone split, and a vacated
    touchdown is an outcome, not an opportunity."""
    vac = OI.team_vacancy(2024, "V_ALL")
    row = next(iter(vac.values()))
    assert not any("rz" in k or "red" in k for k in row)
    assert not any("td" in k for k in row)


# ── the verdict rules fire in both directions ───────────────────────────────
def test_the_grading_bar_fires_in_every_direction():
    v = OI._grade_verdict
    assert v(3, 3.71, {"excludes_zero": False}).startswith("NULL")
    assert "loses to the room" in v(6, 3.71, {"excludes_zero": False})
    assert "loses to the room" in v(7, 3.71, {"excludes_zero": True})
    assert v(9, 3.71, {"excludes_zero": True}).startswith("FINDING")
    assert "covers zero" in v(9, 3.71, {"excludes_zero": False})


def test_the_interaction_bar_fires_in_every_direction():
    def reg(inter_excl, youth_excl):
        return {"ALL": {"status": "measured", "coefficients": {
            "young_x_vac": {"beta": 1.0, "excludes_zero": inter_excl},
            "young": {"beta": 1.0, "excludes_zero": youth_excl}}}}
    assert OI._h2_verdict(reg(True, False))["ALL"]["verdict"] \
        == "INTERACTION BEATS YOUTH ALONE"
    assert "reconciled" in OI._h2_verdict(reg(True, True))["ALL"]["verdict"]
    assert OI._h2_verdict(reg(False, False))["ALL"]["verdict"].startswith("NULL")
    assert OI._h2_verdict(reg(False, True))["ALL"]["verdict"].startswith("NULL")


def test_no_youth_only_ranking_is_built():
    """The age flag is dead twice (prereg 0.2, 4.4). Youth may appear only as
    the control term inside the interaction — never as a ranking of its own, and
    never as a `years_exp` board indicator."""
    src = (BT / "opportunity_inheritance.py").read_text()
    assert "years_exp" not in src, "no years_exp indicator anywhere"

    scored = src.split("def _rank_scores")[1].split("def grade_cell")[0]
    names = [ln.split('"')[1] for ln in scored.splitlines()
             if ln.strip().startswith('"R') or '"R' in ln.split(":")[0]]
    assert names, "no ranking names found — the parse is wrong, not the code"
    youthy = [n for n in names if "young" in n]
    assert youthy == ["R3_young_x_open_above"], \
        f"youth appears in rankings outside the interaction: {youthy}"

    # and the interaction ranking must genuinely multiply, not just be renamed:
    # a young player with no vacated volume above him must score zero.
    assert 'g(r, "open_above") if r.get("young") == 1.0 else 0.0' in scored


# ── statistics ──────────────────────────────────────────────────────────────
def test_spearman_refuses_a_sample_too_small_to_speak():
    out = OI.spearman_clustered({2023: ([1, 2, 3], [1, 2, 3])})
    assert out["status"] == "insufficient_n"


def test_a_planted_effect_is_found_and_pure_noise_is_not():
    """13f: before believing a null, show the instrument could have produced
    anything else."""
    import numpy as np
    rng = np.random.default_rng(7)
    strong = {s: (list(range(60)), [i + rng.normal(0, 3) for i in range(60)])
              for s in (2023, 2024, 2025)}
    got = OI.spearman_clustered(strong, draws=200)
    assert got["finding"] is True and got["rho"] > 0.8
    noise = {s: (list(rng.normal(size=60)), list(rng.normal(size=60)))
             for s in (2023, 2024, 2025)}
    assert OI.spearman_clustered(noise, draws=200)["finding"] is False


def test_benjamini_hochberg_rejects_nothing_when_everything_is_noise():
    assert not any(OI.benjamini_hochberg({f"t{i}": 0.5 for i in range(20)}).values())
    got = OI.benjamini_hochberg({**{f"t{i}": 0.9 for i in range(19)},
                                 "real": 1e-6})
    assert got["real"] is True


def test_wilson_interval_brackets_the_point():
    w = OI.wilson(3, 21)
    assert w["ci95"][0] < w["rate"] < w["ci95"][1]


# ── the artifact ────────────────────────────────────────────────────────────
def test_artifact_cell_matches_the_bar(art):
    for arm, cell in art["graded_cell"].items():
        assert cell["n"] == 170, arm
        assert cell["league_winners"] == 21, arm
        assert abs(cell["chance_at_10"] - 3.71) < 0.02, arm
        assert cell["rankings"]["market"]["hits_at_10"] == 7, arm


def test_artifact_marks_the_quarantined_arms(art):
    assert art["graded_cell"]["V_ALL"]["quarantined"] is True
    assert art["graded_cell"]["V_MOVED"]["quarantined"] is True
    assert art["graded_cell"]["V_INSEASON"]["quarantined"] is False


def test_artifact_records_the_leak_free_team_misassignment_cost(art):
    for season, row in art["team_assignment_cost"].items():
        assert 0.2 < row["leak_free_misassignment_rate"] < 0.4, season


def test_artifact_states_conditional_value_was_imported_not_reimplemented(art):
    block = art["conditional_value_already_established"]
    assert "conditional_value.py" in block["not_reimplemented"]
    assert abs(block["handcuff_premium_season_points_to_owner"] - 0.95) < 0.6


def test_rookie_cell_is_declared_underpowered(art):
    assert "UNDERPOWERED" in art["rookie_cell"]["predeclared"]
    assert art["rookie_cell"]["n"] == 37
