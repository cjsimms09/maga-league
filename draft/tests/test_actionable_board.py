# TERRITORY: C
"""THE PART OF THE BOARD THAT PRICES DECISIONS MUST BE COMPLETE.

Cory: "we need to make sure more of these errors do not exist in the board of
players for this year in any of our tools. this will throw everything off."

An error at rank 1,500 is untidy. The same error inside the region the market
prices changes what the tools recommend, so everything here is scoped to that
region — `provenance.adp.relevant_board` plus the keepers.

TWO REAL DEFECTS ARE OPEN AND BOTH ARE IN A'S LANE, so this file RATCHETS them
rather than either pretending they are clean or turning main red for two other
sessions nine days out. The counts are named. They may not grow, and when the
fix lands these tighten to zero.

  35  actionable rows with NO BYE whose own team's bye is known and unambiguous
      on the same board. The CAUSE IS FIXED — `adp.py` built its team map before
      the FFC merge that supplies the only bye data, so the map was empty and the
      fill loop had nothing to apply. The map now builds after the merge, and the
      fix executes at the next nightly rebuild. THE RATCHET STAYS AT 35 UNTIL
      THEN, because the artifact on disk is still the one built before it. It
      should read 0 after the rebuild, and this ceiling comes down with it.
  1   row the MARKET prices and our projection zeroes: Ricky Pearsall, ADP 111.5,
      proj 0.00 with sd 0.00, rank 823, VORP −173.

      ⚠ I FIRST CALLED THIS "an absent projection written as a zero" AND THAT WAS
      WRONG. Sleeper PUBLISHES 8,778 explicit zeros in 9,411 rows, so the value
      is real and faithfully read. What is wrong is downstream: `season_sd =
      mean * variance` forces a zero spread from a zero mean, so the board claims
      CERTAINTY about a player on IR that real drafters are spending an
      eleventh-round pick on. The variance model ran, produced 0.384, named its
      reasons — and the multiplication erased them.

THE FIELD CHECKS ARE HARD ASSERTIONS because they are clean today, and each is a
field a tool indexes by, where an absence would read as a value.

Run: python3 -m pytest draft/tests/test_actionable_board.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import actionable_board as AB  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"

#: Known open defects, measured 2026-08-13. A RATCHET, not a pass: the assertions
#: below allow no more than this and say so by name.
KNOWN_BYE_GAP = 35
KNOWN_ZERO_PROJ = 1

#: WHEN THE BYE FIX LANDED, so the ratchet TIGHTENS ITSELF.
#:
#: A ceiling I have to remember to lower is a ceiling that stops ratcheting the
#: first time I forget — the check would pass forever at 35 while the real gap
#: was 0, which is the "a guard that can only say nothing yet" failure I have
#: spent this session removing from other people's code. So the allowance is tied
#: to the ARTIFACT, not to my memory: a board built before the fix may carry the
#: gap, a board built after it may not, and nobody has to do anything for the
#: ceiling to come down.
#:
#: `adp.py` now builds its team map after the FFC merge (main, 2026-08-13). The
#: nightly rebuild runs at 08:00 UTC.
BYE_FIX_LANDED = "2026-08-13T23:00:00Z"


def bye_ceiling(built_at) -> int:
    """How many derivable-but-missing byes this board is allowed to carry.

    A board built BEFORE the fix may carry the known gap; one built after it may
    not. Factored out so both branches are testable — an untested self-tightening
    ratchet is just a ratchet with an extra branch to get wrong.
    """
    built = str(built_at or "")
    return 0 if (built and built > BYE_FIX_LANDED) else KNOWN_BYE_GAP


def test_the_RATCHET_TIGHTENS_ITSELF_when_the_board_is_rebuilt():
    """A ceiling somebody has to remember to lower stops ratcheting the first time
    they forget, and then passes forever at the old number while the real gap is
    zero. That is the "can only say nothing yet" failure, in my own test.

    MUTATION: return KNOWN_BYE_GAP unconditionally — the check keeps allowing 35
    on a board that should have none, and the bye fix could silently regress."""
    assert bye_ceiling("2026-08-13T20:09:26Z") == KNOWN_BYE_GAP   # before the fix
    assert bye_ceiling("2026-08-14T08:00:00Z") == 0               # after it
    assert bye_ceiling(None) == KNOWN_BYE_GAP, (
        "an undated board must not be treated as fixed — unknown is not proof")


def board():
    if not BOARD.exists():
        pytest.skip("UNCHECKED: %s is not present — this says nothing about the "
                    "board the tools read" % BOARD)
    return json.loads(BOARD.read_text())


def _b(players, relevant=225, kept=()):
    return {"players": players, "kept_players": list(kept),
            "provenance": {"adp": {"relevant_board": relevant}}}


def _p(**kw):
    base = {"player_id": "x1", "name": "Somebody", "position": "WR", "team": "GB",
            "adp": 50.0, "adp_sd": 5.0, "bye": 11, "proj_mean": 100.0,
            "proj_fantasypros": 100.0, "proj_sleeper": 100.0}
    base.update(kw)
    return base


# ── the detectors, proved on planted rows before the real board is judged ──
def test_a_MISSING_BYE_WHOSE_TEAM_KNOWS_ITS_OWN_is_reported_as_derivable():
    """The distinction is the entire finding. A player whose team's bye is
    unknown is a source gap nothing here can close; a player whose team's bye is
    on the same board in black and white is a FILL THAT DID NOT HAPPEN, and the
    bye logic skips him in silence.

    MUTATION: report both as one number — the report stops saying whether
    anybody can do anything about it."""
    d = AB.bye_gap(_b([_p(player_id="a", name="Has Bye", bye=11),
                       _p(player_id="b", name="No Bye", bye=None)]))
    assert [p["name"] for p in d["derivable"]] == ["No Bye"], d
    assert d["unknowable"] == []


def test_a_MISSING_BYE_ON_A_TEAM_NOBODY_KNOWS_is_NOT_blamed_on_the_fill():
    """Tyreek Hill, team FA. No teammate, so no derivation — reporting him as a
    failed fill would send somebody hunting a bug that is not there.

    MUTATION: treat every missing bye as derivable."""
    d = AB.bye_gap(_b([_p(player_id="c", name="Free Agent", team="FA", bye=None)]))
    assert d["derivable"] == []
    assert [p["name"] for p in d["unknowable"]] == ["Free Agent"]


def test_a_TEAM_WITH_TWO_BYES_is_REFUSED_rather_than_resolved():
    """A wrong bye manufactures a conflict warning about a week the player
    actually plays, which is worse than a missing one.

    MUTATION: take the first value, or the mode — either silently invents a bye
    for a team whose data disagrees with itself."""
    got = AB.team_byes(_b([_p(player_id="a", team="ZZ", bye=5),
                           _p(player_id="b", team="ZZ", bye=9)]))
    assert "ZZ" not in got, got


def test_THE_MARKET_AND_OUR_PROJECTION_CANNOT_BOTH_BE_RIGHT():
    """The market pays for him; we say he scores 0.00 with sd 0.00. Two sources
    disagreeing is ordinary — disagreeing ABSOLUTELY is a defect.

    ⚠ THE FIRST VERSION OF THIS TEST WAS WRONG IN THE WAY THIS FILE HUNTS. It
    keyed on `proj_fantasypros is None and proj_sleeper is None`, believing that
    meant no source had an opinion. `proj_sleeper` is only SET inside the
    FantasyPros block, so its absence means FP had nothing and says nothing about
    Sleeper. Sleeper publishes 8,778 explicit zeros in 9,411 rows, so the zero is
    a real value faithfully read and `proj_baseline` is the honest field.

    `proj_baseline` is the field tested because it is the SOURCE value — what
    the projection provider actually said. Keying on `proj_mean` would find the
    identical rows (`mean = base * (1 + adj)`, so a zero baseline forces a zero
    mean) and the gate correctly reports that swap as unkillable. It is recorded
    here rather than dressed up as a mutation: the two are equivalent for zeros,
    and only one of them names the thing being asserted."""
    rows = [_p(player_id="a", name="Zeroed", proj_baseline=0.0, proj_mean=0.0),
            _p(player_id="b", name="Projected", proj_baseline=88.0, proj_mean=90.0)]
    got = [p["name"] for p in AB.market_prices_what_we_zero(_b(rows))]
    assert got == ["Zeroed"], got


def test_the_RANK_FALLBACK_IS_REPORTED_AS_UNREACHABLE():
    """`projections._rank_fallback` is guarded by `if base is None` and exists to
    "decay off ADP so the board still ranks sensibly". Sleeper publishes an
    explicit 0 rather than omitting a player, so `base` is never None and the
    branch cannot run — the same shape as the `search_rank` orphan.

    MUTATION: count rows whose proj_mean is 0 rather than proj_baseline — the
    opportunity adjustment hides some of them and the count stops being exact."""
    rows = [_p(player_id="a", proj_baseline=0.0, vorp=-173.17),
            _p(player_id="b", proj_baseline=0.0, vorp=-173.17),
            _p(player_id="c", proj_baseline=50.0, vorp=10.0)]
    got = AB.rank_fallback_reachable(_b(rows))
    assert got["zero_baseline"] == 2, got
    assert got["reachable"] is False
    assert got["distinct_vorp"] == 1, got


def test_the_REGION_IS_READ_from_the_board_not_assumed():
    """A default depth would audit a region the build never claimed, and would
    keep auditing it after the build changed. No claim, no audit.

    MUTATION: default to 225 — the checks then run against a made-up boundary."""
    assert AB.relevant_board({"provenance": {}}) is None
    assert AB.actionable({"players": [_p()], "provenance": {}}) == []


# ── the shipped board ──────────────────────────────────────────────────────
def test_the_FIELD_DETECTORS_FIRE_on_planted_gaps():
    """PROVED BEFORE THE REAL BOARD IS CALLED CLEAN. The assertion below checks
    that four lists are empty, and they are empty today — so a detector that had
    stopped looking would satisfy it perfectly. The gate caught exactly that:
    replacing the `no_adp_sd` scan with `[]` survived, because nothing anywhere
    required it to be able to find anything.

    MUTATION: any of the four scans returns `[]` — this fails, and the clean
    board below goes back to meaning something."""
    rows = [_p(player_id="a", adp_sd=None),
            _p(player_id="b", position="P"),
            _p(player_id="c", team=""),
            _p(player_id="d", player_id_missing=True)]
    rows[3] = {k: v for k, v in rows[3].items() if k != "player_id"}
    rows[3]["adp"] = 50.0
    got = AB.field_gaps(_b(rows))
    assert [p["player_id"] for p in got["no_adp_sd"]] == ["a"], got["no_adp_sd"]
    assert [p["player_id"] for p in got["unrostered_position"]] == ["b"], got
    assert [p["player_id"] for p in got["no_team"]] == ["c"], got
    assert len(got["no_player_id"]) == 1, got["no_player_id"]


def test_THE_FIELDS_EVERY_TOOL_INDEXES_BY_ARE_PRESENT():
    """Hard assertion: clean today and must stay clean. Each of these is a field
    something keys on, where an absence reads as a value rather than as a gap."""
    got = AB.field_gaps(board())
    for k, rows in got.items():
        assert not rows, "%s on %d actionable rows: %s" % (
            k, len(rows), [p.get("name") for p in rows[:8]])


def test_NO_MORE_ACTIONABLE_ROWS_LOSE_A_DERIVABLE_BYE():
    """RATCHET on an open defect, routed to A 2026-08-13, not a clean bill.

    35 actionable rows have no bye while their own team's bye is known — 11 RB,
    9 TE, 8 QB, 5 WR, 2 DEF, 1 K. The tools' bye logic skips all of them without
    saying so. This does not pass because the board is right; it passes because
    the board is no MORE wrong than when it was measured and reported."""
    b = board()
    d = AB.bye_gap(b)
    built = str(b.get("built_at") or "")
    ceiling = bye_ceiling(built)
    fixed_board = ceiling == 0
    assert len(d["derivable"]) <= ceiling, (
        "%d actionable rows have no bye their own team could supply, ceiling %d.\n"
        "This board was built %s, which is %s the fix landed (%s).\n%s"
        % (len(d["derivable"]), ceiling, built or "(undated)",
           "AFTER" if fixed_board else "BEFORE", BYE_FIX_LANDED,
           ("The fill is not working on a board that should have it — that is the "
            "defect back, not the old one." if fixed_board else
            "Expected on a board built before the fix; it must read 0 after the "
            "next rebuild.")))
    assert d["teams_with_a_bye"] >= 30, (
        "only %d teams have a bye on this board — the gap is now a source "
        "problem rather than a fill that did not happen, which is a different "
        "and worse finding" % d["teams_with_a_bye"])


def test_NO_MORE_ROWS_ARE_PRICED_BY_THE_MARKET_AND_ZEROED_BY_US():
    """RATCHET on the second open defect. One row today: Ricky Pearsall, taken by
    real drafters at 111.5 and given 0.00 ± 0.00 by us."""
    rows = AB.market_prices_what_we_zero(board())
    assert len(rows) <= KNOWN_ZERO_PROJ, (
        "absent-projection-as-zero grew to %d from a known %d: %s"
        % (len(rows), KNOWN_ZERO_PROJ, [p.get("name") for p in rows[:10]]))
