"""Props -> fantasy points, with the known-correct case rule 11 requires.

The expected answers below are HAND ARITHMETIC against this league's scoring
constants, stated in the test so they can be checked without running anything —
not values copied out of the implementation, which would assert only that the code
agrees with itself.

  pass_yd 0.04  pass_td 6  pass_int -2  rush_yd 0.1  rush_td 6
  rec 0.5  rec_yd 0.1  rec_td 6

  QB season:  4200*0.04 + 30*6 + 10*-2 + 350*0.1 + 4*6
            =  168      + 180  + -20   + 35      + 24   = 387.0
  Prop-covered component only (pass_yd, rush_yd):
            =  168 + 35 = 203.0

That 184-point difference IS the coverage problem: 47.5% of a QB's fantasy points
come from events the four props do not price.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import market_convert as M  # noqa: E402

SC = M.league_scoring()

QB_SEASON = {"pass_yd": 4200, "pass_td": 30, "pass_int": 10, "rush_yd": 350, "rush_td": 4}
QB_PROPS = {"player_pass_yds": 4200, "player_rush_yds": 350}


# ── the known-correct case ──────────────────────────────────────────────────
def test_the_league_constants_are_what_the_hand_arithmetic_assumes():
    """If a scoring constant changes, the expected answers below are stale — so
    the constants are asserted, not assumed."""
    assert SC["pass_yd"] == 0.04 and SC["pass_td"] == 6.0 and SC["pass_int"] == -2.0
    assert SC["rush_yd"] == 0.1 and SC["rec"] == 0.5 and SC["rec_yd"] == 0.1


def test_the_full_QB_line_scores_the_hand_computed_total():
    """387.0, arrived at above without reference to the implementation."""
    import scoring as S
    assert S.score_stat_line(QB_SEASON, SC) == 387.0


def test_props_convert_to_the_hand_computed_COMPONENT():
    """203.0 — pass yards and rush yards only, which is all the props price."""
    out = M.convert(QB_PROPS, SC)
    assert out["points"] == 203.0
    assert out["covered_stats"] == ["pass_yd", "rush_yd"]


def test_a_half_ppr_receiving_line_converts_correctly():
    """95*0.5 + 1300*0.1 = 47.5 + 130 = 177.5"""
    out = M.convert({"player_receptions": 95, "player_reception_yds": 1300}, SC)
    assert out["points"] == 177.5


# ── the coverage problem ────────────────────────────────────────────────────
def test_a_conversion_always_declares_itself_partial():
    """It is a COMPONENT, never a projection. A caller that treats it as a
    projection is comparing a part to a whole."""
    assert M.convert(QB_PROPS, SC)["is_partial"] is True


def test_the_gap_is_component_matched_not_whole_vs_part():
    """The failure this prevents: 203 - 387 = -184 would read as 'the market is
    massively below our model on this QB' when it is entirely coverage."""
    g = M.gap_vs_model(QB_PROPS, QB_SEASON, SC)
    assert g["comparable"] is True
    assert g["model_points"] == 203.0          # NOT 387.0
    assert g["gap_points"] == 0.0
    assert g["component_matched"] is True


def test_a_real_disagreement_still_shows_through():
    """Component-matching must not flatten genuine signal — the market pricing
    500 more passing yards is a real gap and must survive."""
    g = M.gap_vs_model({"player_pass_yds": 4700, "player_rush_yds": 350}, QB_SEASON, SC)
    assert g["gap_points"] == 20.0             # 500 * 0.04
    assert g["gap_pct"] == round(20.0 / 203.0 * 100, 1)


def test_an_unknown_market_is_reported_not_silently_dropped():
    """Silently ignoring it lets the covered fraction shrink while the number
    keeps looking like a projection."""
    out = M.convert({"player_pass_yds": 4200, "player_anytime_td": 12}, SC)
    assert out["unknown_markets"] == ["player_anytime_td"]
    assert out["covered_stats"] == ["pass_yd"]


def test_an_absent_prop_is_not_zero():
    """A prop we did not capture is not a market forecast of zero yards."""
    out = M.convert({"player_pass_yds": None, "player_rush_yds": 350}, SC)
    assert "pass_yd" not in out["stat_line"]
    assert out["covered_stats"] == ["rush_yd"]


# ── refusals ────────────────────────────────────────────────────────────────
def test_nothing_comparable_is_a_REFUSAL_not_a_zero_gap():
    g = M.gap_vs_model({"player_anytime_td": 12}, QB_SEASON, SC)
    assert g["comparable"] is False and "no prop mapped" in g["why"]


def test_a_projection_missing_the_priced_stat_refuses():
    """A gap computed against a missing component would be a large confident
    number meaning nothing."""
    g = M.gap_vs_model(QB_PROPS, {"pass_yd": 4200}, SC)     # no rush_yd
    assert g["comparable"] is False and "rush_yd" in g["why"]


def test_a_zero_model_component_gives_no_percentage_rather_than_infinity():
    g = M.gap_vs_model({"player_rush_yds": 100}, {"rush_yd": 0}, SC)
    assert g["comparable"] is True and g["gap_pct"] is None


# ── one scoring engine ──────────────────────────────────────────────────────
def test_conversion_uses_the_shared_scoring_engine_not_a_local_copy():
    """A second half-PPR implementation here would be the twelfth instance of the
    disease. Source guard: the module must delegate."""
    src = (HERE.parent / "backtest" / "market_convert.py").read_text()
    body = src.replace('"""', "\x00").split("\x00")
    code = "".join(body[::2])                    # strip docstrings
    assert "SCORING.score_stat_line" in code
    assert "0.5" not in code, "a hard-coded half-PPR constant means a second engine"


# ── source feasibility arithmetic (the probe's pure half) ───────────────────
import market_probe as P  # noqa: E402


def test_credits_per_snapshot_multiplies_when_billing_is_per_market_per_book():
    """The unit that matters. 1 request x 4 markets x 2 books is 8 credits, and
    nobody would guess that from the headline 'one request'."""
    assert P.credits_per_snapshot(4, 2, True)["credits_per_snapshot"] == 8
    assert P.credits_per_snapshot(4, 2, False)["credits_per_snapshot"] == 1


def test_the_allowance_PERIOD_changes_the_verdict():
    """500 monthly and 500 once-ever are completely different sources. Comparing
    a monthly allowance against a whole-season requirement is a units error that
    would call a comfortable source infeasible."""
    monthly = P.season_feasible(500, 8, 2, period="month")
    once = P.season_feasible(500, 8, 2, period="season")
    assert monthly["season_feasible"] is True
    assert once["season_feasible"] is False


def test_the_safety_margin_is_applied_not_merely_recorded():
    """An allowance that exactly covers a perfect season covers nothing the first
    week a call needs a retry."""
    tight = P.season_feasible(352, 8, 2, period="season")   # exactly the raw need
    assert tight["season_feasible"] is False
    assert tight["credits_needed_per_period_with_margin"] == 528


def test_the_arithmetic_is_stated_not_just_the_verdict():
    a = P.season_feasible(500, 8, 2, period="month")["arithmetic"]
    assert "8 credits/snapshot" in a and "x1.5 margin" in a and "vs 500" in a


def test_an_unknown_period_refuses_rather_than_guessing():
    assert P.season_feasible(500, 8, 2, period="fortnight")["season_feasible"] is None


def test_every_candidate_records_its_exact_host_and_docs():
    """'The Odds API' is not a sufficient identifier — there is a real naming
    collision and the products differ in NFL coverage. A feasibility verdict
    against an unnamed host is not one anyone can re-check."""
    for name, c in P.CANDIDATES.items():
        assert c["host"].startswith("https://"), name
        assert c["docs"].startswith("https://"), name
