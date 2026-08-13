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
      on the same board. Not a source gap — 32 teams show a bye and none
      conflicts. `bye_source` is `ffc` or absent for every row on the board and
      NEVER `team-derived`, so the fallback built to close exactly this has not
      once fired. Cause: `adp.py:676` builds the team map from `p.get("bye")`
      BEFORE the FFC merge that supplies the only bye data — Sleeper's
      `metadata.bye_week` is empty for all 1,737, as that file's own comment
      records. The map is therefore empty when it is built.
  1   row where an ABSENT projection became a ZERO: Ricky Pearsall, ADP 111.5,
      both sources null, proj_mean 0.0, rank 823, VORP −173.

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

#: Known open defects, measured 2026-08-13 and routed to A. A RATCHET, not a
#: pass: the assertions below allow no more than this and say so by name. The
#: moment either is fixed these become 0 and the ceiling comes down with them.
KNOWN_BYE_GAP = 35
KNOWN_ZERO_PROJ = 1


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


def test_an_ABSENT_PROJECTION_READ_AS_ZERO_is_found_and_a_real_zero_is_not():
    """Zero is a claim that he will not score. Absent is the refusal to make one.
    The board writes the same bytes for both and every consumer acts on the
    number — VORP, tiering, best-available.

    MUTATION: flag any proj_mean of 0 — a genuine zero from a real source
    becomes a false finding, and the true one is lost in the noise."""
    rows = [_p(player_id="a", name="No Source", proj_fantasypros=None,
               proj_sleeper=None, proj_mean=0.0),
            _p(player_id="b", name="Real Zero", proj_fantasypros=0.0,
               proj_sleeper=None, proj_mean=0.0),
            _p(player_id="c", name="No Source But Projected", proj_fantasypros=None,
               proj_sleeper=None, proj_mean=42.0)]
    got = [p["name"] for p in AB.absent_projection_read_as_zero(_b(rows))]
    assert got == ["No Source"], got


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
    d = AB.bye_gap(board())
    assert len(d["derivable"]) <= KNOWN_BYE_GAP, (
        "the derivable-bye gap GREW to %d from a known %d: %s"
        % (len(d["derivable"]), KNOWN_BYE_GAP,
           [p.get("name") for p in d["derivable"][:10]]))
    assert d["teams_with_a_bye"] >= 30, (
        "only %d teams have a bye on this board — the gap is now a source "
        "problem rather than a fill that did not happen, which is a different "
        "and worse finding" % d["teams_with_a_bye"])


def test_NO_MORE_ABSENT_PROJECTIONS_ARE_WRITTEN_AS_ZERO():
    """RATCHET on the second open defect. One row today: Ricky Pearsall, priced
    by the market at 111.5, ranked 823 by us because an absence was written as a
    number."""
    rows = AB.absent_projection_read_as_zero(board())
    assert len(rows) <= KNOWN_ZERO_PROJ, (
        "absent-projection-as-zero grew to %d from a known %d: %s"
        % (len(rows), KNOWN_ZERO_PROJ, [p.get("name") for p in rows[:10]]))
