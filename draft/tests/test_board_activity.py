# TERRITORY: C
"""NOTHING THAT HAS NOT PLAYED A DOWN IN TWO YEARS MAY PRICE A DECISION.

Tom Brady, Drew Brees, Gronkowski, Edelman, Antonio Brown, Fitzgerald, Gurley and
Marshawn Lynch are all on the 2026 board. `build.py:448` gates on
`p.get("active") is False`, and Sleeper leaves `active` UNSET for much of what it
lists, so a null sails through; the only other gate is `search_rank`, which
Sleeper never retires, and this path puts no ceiling on it.

REMOVING THEM IS `build.py` AND A'S LANE. This file owns the property that
matters either way: they must not reach anything that turns into advice. Measured
on the shipped board, 900 rows qualify as dormant and ZERO of them reach a
decision surface — so today the pool is a superset of what is actionable, not a
contaminated version of it. The day that stops being true, this fails, instead of
being discovered by somebody reading a draft board and seeing Tom Brady.

THE DETECTOR'S EXEMPTIONS ARE THE DESIGN. Each one is a way this could accuse a
player genuinely on a 2026 roster, and being wrong in that direction would delete
somebody real from a draft board — far worse than missing a retiree. So it judges
only the positions the store actually scores, and spares rookies, anyone the
market prices, and anyone carrying a projection.

⚠ THE FALSE-POSITIVE CLASS THAT ALREADY BIT ME. My first pass judged every
position and produced 47 "inactive" players who were all KICKERS with 100-point
projections — the weekly store scores no K and no DEF at all. A detector applied
outside its evidence does not give a weaker answer, it gives a wrong one, and
`test_the_DETECTOR_REFUSES_positions_its_evidence_cannot_see` pins that.

Run: python3 -m pytest draft/tests/test_board_activity.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import board_activity as BA  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"


def board():
    if not BOARD.exists():
        pytest.skip("UNCHECKED: %s is not present — this says nothing about what "
                    "is on the board" % BOARD)
    return json.loads(BOARD.read_text())


def _row(**kw):
    base = {"player_id": "zz", "name": "Somebody", "position": "WR",
            "years_exp": 5, "adp_source": "search_rank", "proj_mean": 0.0}
    base.update(kw)
    return base


def _synthetic(rows, relevant_board=225):
    return {"players": rows,
            "provenance": {"adp": {"relevant_board": relevant_board}}}


# ── the detector, proved before it is believed ─────────────────────────────
def test_the_DETECTOR_FINDS_the_retired_players_by_name():
    """Named rather than counted. A count can drift to zero through a bug in the
    reader and still look like a healthy board; these eight cannot be on an NFL
    field in 2026 and their presence is the whole reason this file exists."""
    d = BA.dormant(board())
    assert d["status"] == "measured", d
    got = {p["name"] for p in d["rows"]}
    for who in ("Tom Brady", "Drew Brees", "Rob Gronkowski", "Julian Edelman",
                "Antonio Brown", "Larry Fitzgerald", "Todd Gurley",
                "Marshawn Lynch"):
        assert who in got, (
            "%s is on the board and the detector did not flag him — the check "
            "has stopped seeing what it was built for" % who)
    assert d["n"] > 500, ("only %d dormant rows; that is not the board this was "
                          "measured against" % d["n"])


def test_the_DETECTOR_REFUSES_positions_its_evidence_cannot_see():
    """THE FALSE POSITIVE THAT ALREADY HAPPENED. The weekly points store scores no
    kickers and no defenses, so "no scored week" is silence about them, not a
    finding. Judging them anyway produced 47 accused KICKERS carrying 100-point
    projections.

    MUTATION: drop the COVERED_POSITIONS filter — every K and DEF on the board is
    accused, and the loudest of them are the ones the model ranks highest."""
    rows = [_row(player_id="k1", name="A Kicker", position="K"),
            _row(player_id="d1", name="A Defense", position="DEF"),
            _row(player_id="w1", name="A Receiver", position="WR")]
    d = BA.dormant(_synthetic(rows))
    assert [p["name"] for p in d["rows"]] == ["A Receiver"], d["rows"]


@pytest.mark.parametrize("kw,why", [
    ({"years_exp": 0}, "a rookie's blank history is the correct history"),
    ({"adp_source": "fantasypros"}, "the market prices him, which outranks my absence"),
    ({"proj_mean": 3.2}, "a projection is a positive claim that he exists in 2026"),
])
def test_the_DETECTOR_SPARES_anyone_something_else_vouches_for(kw, why):
    """Each exemption is a way this could delete somebody real from a draft board,
    which is far worse than missing a retiree.

    MUTATION: remove any one of these guards — the accused set grows by exactly
    the players who had a reason to be there."""
    assert BA.dormant(_synthetic([_row(**kw)]))["rows"] == [], why


# ── the guarantee ──────────────────────────────────────────────────────────
def test_the_AUDIT_CATCHES_a_dormant_player_that_reaches_a_decision():
    """Proved on planted rows before the real board is asserted clean — three
    times, because the three surfaces are three different ways a dead row turns
    into advice and a check on one says nothing about the others.

    MUTATION: check only `overall_rank` — a dormant player with positive VORP, or
    one sitting inside the relevant board, sails through."""
    for kw, expect in (
        ({"overall_rank": 42}, "overall_rank <= 150"),
        ({"vorp": 1.5}, "vorp > 0"),
        ({"adp": 100.0}, "adp <= 225 (relevant board)"),
    ):
        got = BA.audit(_synthetic([_row(**kw)]))
        assert got["ok"] is False, (kw, got)
        assert got["offenders"][0]["reaches"] == [expect], got["offenders"]


def test_UNREADABLE_STORES_are_unmeasured_rather_than_clean():
    """The failure this whole lane keeps finding: a check that could not look
    reporting the same green as a check that looked and found nothing. `ok` must
    be None, never True.

    MUTATION: return `ok: True` when the stores are missing — and the guarantee
    silently stops existing the day the artifacts move."""
    got = BA.audit(_synthetic([_row(overall_rank=1)]), root="/nonexistent")
    assert got["status"] == "unmeasured", got
    assert got["ok"] is None, "could not look is not a pass"


def test_NOTHING_DORMANT_PRICES_A_DECISION_ON_THE_SHIPPED_BOARD():
    """The assertion this file exists for, against the artifact the tools read.

    900 rows have not scored since 2024 and nothing else vouches for them. None
    is ranked inside the draft's depth, none carries positive VORP, and none sits
    inside the relevant board. So the pool is a SUPERSET of what is actionable
    rather than a contaminated version of it — which is the distinction between
    untidy and dangerous."""
    got = BA.audit(board())
    assert got["status"] == "measured", got
    assert got["ok"] is True, (
        "players with no NFL activity since 2024 are reaching a decision "
        "surface: %s" % got["offenders"][:10])
    assert got["dormant"] > 500, got
