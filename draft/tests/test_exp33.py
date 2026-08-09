"""EXP 33 pure core — the projection bake-off, verifiable WITHOUT egress.

The egress (nflverse realized + FFC + optional Sleeper) runs in CI; the METRICS
(MAE, rank correlation, top-decile hit), the naive model, the scorecard and the
head-to-head verdict are pure and tested here — a bug in the metric that decides
whether our blend "beats naive" is caught in the sandbox, not in a CI headline.

Run: python -m pytest draft/tests/test_exp33.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp33 as E  # noqa: E402


POS = {p: ("RB" if i % 2 else "WR") for i, p in enumerate("abcdefghij")}


def test_mae_and_rank_corr():
    proj = {"a": 100, "b": 90, "c": 80}
    realized = {"a": 110, "b": 85, "c": 78}
    assert E.mae(proj, realized) == round((10 + 5 + 2) / 3, 2)
    # perfectly ordered -> rho 1.0
    assert E.rank_corr(proj, realized) == 1.0


def test_top_decile_hit_finds_the_winners():
    # 10 players; top decile = 1. Source's #1 IS the realized #1 -> hit 1.0
    proj = {p: 100 - i for i, p in enumerate("abcdefghij")}       # a best
    realized = {p: 100 - i for i, p in enumerate("abcdefghij")}   # a best too
    td = E.top_decile_hit(proj, realized)
    assert td["k"] == 1 and td["hit_rate"] == 1.0
    # a source that inverts the order finds none of the winners
    inv = {p: i for i, p in enumerate("abcdefghij")}              # a worst
    td2 = E.top_decile_hit(inv, realized)
    assert td2["hit_rate"] == 0.0


def test_adp_scorecard_omits_mae():
    # ADP as ranking (point_scale False) -> no MAE, but rank_corr + top_decile present
    adp = {p: -(i + 1) for i, p in enumerate("abcdefghij")}       # negated: higher=better
    realized = {p: 100 - i for i, p in enumerate("abcdefghij")}
    card = E.scorecard(adp, realized, POS, point_scale=False)
    assert card["mae"] is None
    assert card["rank_corr"] is not None
    assert card["top_decile"]["hit_rate"] is not None


def test_naive_model_is_last_year_scaled_by_availability():
    prior_points = {2023: {"a": 170.0, "b": 34.0}}
    prior_games = {2023: {"a": 17, "b": 2}}       # a full season, b barely played
    naive = E.naive_projection(prior_points, prior_games, {"a": "RB", "b": "WR"}, expected_games=15.5)
    # a: ppg 10 * 15.5 * (0.5 + 0.5*1.0) = 155.0 ; b: ppg 17 *15.5*(0.5+0.5*(2/17))
    assert naive["a"] == 155.0
    assert naive["b"] < 17 * 15.5        # availability discount applied
    # NO regression: a's projection is its raw prior rate carried forward
    assert naive["a"] > 150


def test_bake_off_ranks_and_headline():
    realized = {p: 100 - i for i, p in enumerate("abcdefghij")}
    good = {p: 100 - i for i, p in enumerate("abcdefghij")}       # perfect
    bad = {p: i for i, p in enumerate("abcdefghij")}              # inverted
    bo = E.bake_off({"our_blend": good, "naive": bad}, realized, POS)
    # our_blend should top the rank-corr and top-decile rankings
    assert bo["ranks"]["top_decile_best_first"][0] == "our_blend"
    hl = E.headline(bo)
    assert hl["our_beats_naive_on_top_decile"] is True
    assert hl["verdict"] == "our-blend-leads"
    assert hl["provenance_banner_required"] is False


def test_leak_suspect_source_excluded_from_verdict():
    # A leak-suspect 'sleeper' source that PERFECTLY predicts realized must NOT win
    # the ranking — it is scored for transparency but excluded from the verdict.
    realized = {p: 100 - i for i, p in enumerate("abcdefghij")}
    our = {p: 100 - i + (i % 2) for i, p in enumerate("abcdefghij")}     # decent, safe
    leaky = dict(realized)                                                # perfect = leak
    bo = E.bake_off({"our_blend": our, "sleeper_proj": leaky}, realized, POS,
                    safe={"our_blend": True, "sleeper_proj": False})
    assert "sleeper_proj" in bo["disqualified"]
    # the leaky source is scored...
    assert bo["cards"]["sleeper_proj"]["top_decile"]["hit_rate"] == 1.0
    # ...but never appears in any ranking (verdict) — only the safe source does
    for key, ranked in bo["ranks"].items():
        assert "sleeper_proj" not in ranked, key
    assert bo["ranks"]["top_decile_best_first"] == ["our_blend"]


def test_headline_flags_provenance_when_naive_wins():
    realized = {p: 100 - i for i, p in enumerate("abcdefghij")}
    our = {p: i for i, p in enumerate("abcdefghij")}             # our blend inverted (bad)
    naive = {p: 100 - i for i, p in enumerate("abcdefghij")}     # naive perfect
    bo = E.bake_off({"our_blend": our, "naive": naive}, realized, POS)
    hl = E.headline(bo)
    assert hl["our_beats_naive_on_top_decile"] is False
    assert hl["provenance_banner_required"] is True
    assert hl["top_decile_winner"] == "naive"
