"""Discoverability probe — pure format matcher. No egress.
Run: python -m pytest draft/tests/test_discoverability.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_discoverability as D  # noqa: E402

SPEC = {"teams": 10, "rec": 0.5, "pass_td": 6.0,
        "roster": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "K": 1, "DEF": 1}}


def _league(**over):
    lg = {"total_rosters": 10,
          "scoring_settings": {"rec": 0.5, "pass_td": 6.0},
          "roster_positions": ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN"],
          "settings": {"type": 1, "max_keepers": 2}}
    lg.update(over)
    return lg


def test_our_format_matches_strict_and_loose():
    st, lo, why = D.format_match(_league(), SPEC)
    assert st and lo, why


def test_redraft_matches_loose_not_strict():
    st, lo, why = D.format_match(_league(settings={"type": 0, "max_keepers": 0}), SPEC)
    assert lo and not st and "no-keeper" in why


def test_full_ppr_rejected():
    st, lo, why = D.format_match(_league(scoring_settings={"rec": 1.0, "pass_td": 6.0}), SPEC)
    assert not lo and "rec" in why


def test_four_pt_pass_td_rejected():
    st, lo, why = D.format_match(_league(scoring_settings={"rec": 0.5, "pass_td": 4.0}), SPEC)
    assert not lo and "pass_td" in why


def test_superflex_rejected_even_if_scoring_matches():
    rp = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "K", "DEF", "BN"]
    st, lo, why = D.format_match(_league(roster_positions=rp), SPEC)
    assert not lo and "lineup" in why


def test_twelve_team_rejected():
    st, lo, why = D.format_match(_league(total_rosters=12), SPEC)
    assert not lo and "teams" in why


def test_verdict_thresholds():
    assert "OBTAINABLE" in D._verdict({"loose_matches": 60, "leagues_checked": 400,
                                       "api_calls": 800, "strict_matches": 20}, 800)
    assert "NOT OBTAINABLE" in D._verdict({"loose_matches": 1, "leagues_checked": 400,
                                           "api_calls": 800, "strict_matches": 0}, 800)
