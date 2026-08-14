# TERRITORY: A
"""OUR SCORING AND THE MARKET THAT PRICES OUR BOARD DISAGREE AT ONE POSITION.

    league_config   pass_td 6, pass_int -2
    ADP feed        scoring=HALF — 4 and -1 (FantasyPros consensus; FFC half-ppr)

`proj_mean` is computed in OUR scoring. `adp`, and therefore survival, VONA, the
LRM deadlines and run detection, are anchored to THEIRS. This file guards the
measurement of that gap — not a correction for it. Nothing here changes a price.

WHY IT MATTERS: the room takes quarterbacks earlier than market at every slot,
18 of 18 observations, carried until now as an unexplained quirk with "no
correction is fitted — three drafts give a direction, not a magnitude". A
4-point-TD ADP in a 6-point-TD league predicts that deviation from first
principles, which is a second and independent line of evidence for the same
conclusion.

WHY THE MEASUREMENT LIVES IN THE BUILD: it needs RAW STAT LINES. A built board
carries only already-scored points, so the difference between two scorings is
not recoverable from the artifact — verified by inspection, no stat keys on any
row. `build.py` therefore measures it while the payload is still in hand.

Run: python -m pytest draft/tests/test_scoring_gap.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

from backtest import lab_scoring_gap as gap  # noqa: E402

SCORING = {"pass_td": 6, "pass_int": -2, "pass_yd": 0.04,
           "rush_td": 6, "rush_yd": 0.1, "rec": 0.5, "rec_td": 6, "rec_yd": 0.1}
PLAYERS = [{"player_id": "q1", "position": "QB"}, {"player_id": "r1", "position": "RB"}]
RAW = {"q1": {"pass_td": 30, "pass_int": 10, "pass_yd": 4500},
       "r1": {"rush_td": 12, "rush_yd": 1200, "rec": 40, "rec_yd": 300}}


def test_THE_GAP_IS_THE_PASSING_TERMS_AND_NOTHING_ELSE():
    """30 TDs x 2 extra = +60; 10 INTs x 1 extra penalty = -10. Net +50, and a
    back with no passing stats must come out at exactly zero — otherwise the
    market table is being wrong about something other than quarterbacks."""
    out = gap.measure(RAW, SCORING, PLAYERS)
    assert out["measured"] is True
    assert out["positions"]["QB"]["mean_gap_points"] == 50.0
    assert out["positions"]["RB"]["mean_gap_points"] == 0.0, (
        "the gap reaches a non-passing position — the market override table is "
        "changing more than the two terms it claims to")


def test_THE_MARKET_TABLE_CHANGES_ONLY_THE_TWO_DECLARED_TERMS():
    """A silent third override would make every number in this file a different
    measurement than the one it claims to be."""
    mkt = gap.market_scoring(SCORING)
    changed = {k for k in SCORING if mkt.get(k) != SCORING[k]}
    assert changed == {"pass_td", "pass_int"}, changed
    assert mkt["pass_td"] == 4 and mkt["pass_int"] == -1
    # And half-PPR reception scoring must MATCH ours, or the gap is not a
    # quarterback story at all.
    assert mkt["rec"] == SCORING["rec"] == 0.5


def test_IT_REFUSES_RATHER_THAN_RETURNING_A_CONFIDENT_ZERO():
    """The failure mode to avoid: no stat lines producing `gap: 0`, which reads
    as "the scorings agree" — the exact null-as-a-value defect this project
    keeps finding."""
    empty = gap.measure({}, SCORING, PLAYERS)
    assert empty["measured"] is False and "why" in empty
    assert "positions" not in empty, "a refusal must not carry a result shape"

    unjoined = gap.measure(RAW, SCORING, [])
    assert unjoined["measured"] is False, (
        "a payload that joins no board player must refuse, not report an empty "
        "gap as a measured one")


def test_THE_STARTERS_ARE_REPORTED_SEPARATELY():
    """A gap averaged over every quarterback in the league includes the forty
    nobody drafts. The dozen being priced are the ones that move a pick."""
    many = {f"q{i}": {"pass_td": 30 - i, "pass_int": 10} for i in range(20)}
    players = [{"player_id": f"q{i}", "position": "QB"} for i in range(20)]
    out = gap.measure(many, SCORING, players)
    assert out["top12_qb"]["n"] == 12
    assert out["top12_qb"]["mean_gap_points"] > out["positions"]["QB"]["mean_gap_points"], (
        "the top twelve should carry a LARGER gap than the whole pool — they "
        "throw more touchdowns; if not, the ranking is not by our own scoring")


def test_THE_BUILD_ACTUALLY_CALLS_IT_AND_WHERE_THE_PAYLOAD_STILL_EXISTS():
    """A measurement wired nowhere is the rule-14 defect this repo keeps
    finding. It must also be called BEFORE the raw payload goes out of scope."""
    src = (ROOT / "draft" / "build.py").read_text()
    assert "lab_scoring_gap.measure(" in src, "build.py does not run the measurement"
    call = src.index("lab_scoring_gap.measure(")
    fetch = src.index("projections = si.fetch_projections(")
    assert fetch < call, "the measurement runs before the payload is fetched"
    assert "scoring_gap_vs_adp_market" in src, (
        "the result is computed and not recorded anywhere a reader can find it")


def test_A_FAILED_MEASUREMENT_NEVER_FAILS_THE_BUILD():
    """It is diagnostics. A board that will not build because a measurement
    threw is a strictly worse outcome than a board without the measurement."""
    src = (ROOT / "draft" / "build.py").read_text()
    block = src[src.index("lab_scoring_gap.measure(") - 400:
                src.index("lab_scoring_gap.measure(") + 600]
    assert "except Exception" in block and '"measured": False' in block, (
        "the call is not guarded — a throw here would stop the board building")
