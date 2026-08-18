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


# ── MERGED IS NOT EXECUTED: adp_sd_source ──────────────────────────────────
#
# `adp_sd_source` exists so a consumer can tell a MEASURED dispersion from a
# fitted one, and `adp_sd` is the whole SHAPE of the survival curve — two players
# at the same ADP get identical curves under a fitted sd, while a published stdev
# knows one is a consensus pick and the other splits the room. A fixed it after
# finding the field was computed and never copied onto the player: ZERO of 1,841
# rows carried it.
#
# THE FIX IS ON MAIN AND HAS NOT RUN. `draft/adp.py` copies it at ~line 738
# (`0fe19d4`, 2026-08-14 01:18:27Z); `public/draft_data.json` was built
# 2026-08-13T23:13:18Z — two hours EARLIER. So the shipped board still carries it
# on zero rows, and that is staleness rather than failure.
#
# THAT DISTINCTION IS A's OWN, ABOUT TOP_N: "it is on main AND IT EXECUTED, which
# is the half a merge does not prove." Nothing was enforcing it. A ratchet is what
# turns "somebody should check after the rebuild" into a mechanism — the same
# shape as `bye_ceiling` above, for the same reason.
#
# VERIFIED BEFORE WRITING THIS, by driving `apply_with_fallback` over the shipped
# board with an anchor table built the way `build_adp_table`/`build_fp_table` build
# theirs: 1,841 rows in, ZERO left without a source — 4 `ffc`, 334
# `clamped-linear`, 1,503 `fallback-clamped`. So the rebuild WILL populate it, and
# if it does not, this fires.

#: When the copy landed on main. A board built after this must carry the field.
ADP_SD_SOURCE_FIX_LANDED = "2026-08-14T01:18:27Z"


def adp_sd_source_required(built_at) -> bool:
    """May this board still carry a null `adp_sd_source`?

    Factored out so BOTH branches are testable. An untested self-tightening
    ratchet is a ratchet with an extra branch to get wrong — the lesson from
    `bye_ceiling`, which is the same mechanism one field over.
    """
    built = str(built_at or "")
    return bool(built) and built > ADP_SD_SOURCE_FIX_LANDED


def test_the_adp_sd_source_RATCHET_TIGHTENS_ITSELF():
    """MUTATION: return False unconditionally — the board never has to carry the
    field, the rebuild could silently fail to populate it, and nothing says so."""
    assert adp_sd_source_required("2026-08-13T23:13:18Z") is False   # the stale board
    assert adp_sd_source_required("2026-08-14T08:00:00Z") is True    # after the rebuild
    assert adp_sd_source_required(None) is False, (
        "a board that does not state when it was built cannot be judged, and "
        "guessing is how a stale artifact passes as a fresh one")


def test_EVERY_PRICED_ROW_DECLARES_WHERE_ITS_SPREAD_CAME_FROM():
    """The assertion this exists for. A row with a real market ADP and no
    `adp_sd_source` is a spread nobody can classify: `fallback-clamped` and a
    published FFC stdev are different kinds of number and drive survival, and
    therefore VONA, differently.

    Before the rebuild this reports the known-stale state and does not fail —
    staleness is not a defect. After it, a null is a defect.

    MUTATION: assert only `len(rows) > 0` — the check passes on a board where
    every source is null, which is exactly today's board."""
    b = board()
    built = b.get("built_at")
    rows = [p for p in (b.get("players") or [])
            if p.get("adp") is not None and p.get("adp_source") not in (None, "search_rank")]
    assert rows, "no market-priced rows at all — the board is not what this judges"
    missing = [p for p in rows if not p.get("adp_sd_source")]

    if not adp_sd_source_required(built):
        assert missing, (
            "the board predates the fix (%s <= %s) yet every row already carries "
            "adp_sd_source — good news that must be RECORDED: move "
            "ADP_SD_SOURCE_FIX_LANDED back so this starts enforcing"
            % (built, ADP_SD_SOURCE_FIX_LANDED))
        pytest.skip(
            "board built %s, BEFORE the fix landed %s — %d of %d priced rows carry "
            "no adp_sd_source, which is staleness and not failure. This enforces "
            "from the next rebuild."
            % (built, ADP_SD_SOURCE_FIX_LANDED, len(missing), len(rows)))

    assert not missing, (
        "%d of %d market-priced rows carry NO adp_sd_source on a board built %s, "
        "AFTER the fix landed %s. The fix is on main and did not take: a fitted "
        "spread is now indistinguishable from a published one, and adp_sd is the "
        "whole shape of the survival curve. Sample: %s"
        % (len(missing), len(rows), built, ADP_SD_SOURCE_FIX_LANDED,
           [p.get("name") for p in missing[:6]]))


# ── MERGED IS NOT EXECUTED, SECOND FIELD: the deep pool's ordering ─────────
#
# `raw_adp` took exactly ONE distinct value across every unpriced row — "a
# constant wearing the name of an ordering", A's phrase, with a comment above it
# asserting the ordering. A fixed it: the players who carry a projection are
# ranked among themselves starting at `ffc_max + 1`, and the rest stay GENUINELY
# TIED behind them.
#
# THE FIX IS ON MAIN AND HAS NOT RUN. It landed `e77f834` at 2026-08-13T23:24:43Z;
# the shipped board was built 23:13:18Z — ELEVEN MINUTES earlier. Measured on it:
# 1,503 unpriced rows, 274 of them projected, and **1** distinct `raw_adp` among
# those 274. A's own count of 274 reproduces exactly.
#
# ⚠ AND I ALMOST REPORTED A SECOND DEFECT THAT DOES NOT EXIST. `adp_unordered` is
# on ZERO rows and I had it written up as missing — until I read the code. A put
# that distinction in PROVENANCE deliberately, because `season_stamp` requires
# every board field to be declared with a season and a purpose, and a flag no live
# consumer reads is not worth an override. That registry is mine and the guard was
# working. "Read what actually calls it" is the rule, and it saved me here.

#: When the deep-pool ordering landed on main.
#:
#: TERRITORY-GRANT: A RAW_ADP_ORDER_FIX_LANDED raw_adp_order_required
#:
#: The ratchet constant below dates a fix that lives in A's lane (`build.py`,
#: `adp.py`), so A is the only lane that can know when it became true — but the
#: test that reads it is C's. Scoped to these two symbols: every other assertion
#: in this file still refuses an A edit.
#:
#: ⚠️ MOVED FORWARD 2026-08-14, and forward is normally the wrong direction for a
#: ratchet. The justification is that the fix it dated NEVER RAN: the ordering
#: read `p["proj_mean"]`, which `projections.blend()` does not assign until fifty
#: lines below the call that needs it (build.py :527 vs :576), so every fallback
#: row took the unprojected sentinel. Arithmetic on the shipped board: max real
#: ADP 317, unprojected branch writes 317+600 = 917, and 917 is what all 348
#: carry. The honest date is when the ordering became capable of running.
#: Simulated against the shipped board after the fix: 274 distinct, 318..591.
RAW_ADP_ORDER_FIX_LANDED = "2026-08-14T13:02:23Z"

#: What the board carried before it — one value for every fallback row.
KNOWN_TIED_FALLBACK_VALUES = 1


def raw_adp_order_required(built_at) -> bool:
    """May this board still price every projected fallback player identically?

    Same self-tightening shape as `bye_ceiling` and `adp_sd_source_required`, and
    factored out for the same reason: an untested ratchet is a ratchet with an
    extra branch to get wrong.
    """
    built = str(built_at or "")
    return bool(built) and built > RAW_ADP_ORDER_FIX_LANDED


def test_the_raw_adp_ORDER_RATCHET_TIGHTENS_ITSELF():
    """MUTATION: return False unconditionally — the deep pool can stay a single
    constant forever and the fix could silently fail to take."""
    # The examples move with the constant. They read 08-13T23:13 as "stale" and
    # 08-14T08:00 as "after the rebuild" — correct against a fix that never ran.
    assert raw_adp_order_required("2026-08-14T09:15:36Z") is False   # the shipped board
    assert raw_adp_order_required("2026-08-15T08:00:00Z") is True    # the next cron
    assert raw_adp_order_required(None) is False
    # The boundary itself, which neither example touches.
    assert raw_adp_order_required(RAW_ADP_ORDER_FIX_LANDED) is False


def test_THE_PROJECTED_DEEP_POOL_IS_ORDERED_not_one_constant():
    """A constant wearing the name of an ordering. Before the rebuild this reports
    the known-stale state; after it, one distinct value across 274 projected rows
    is a defect.

    MUTATION: assert `>= 1` distinct values — satisfied by exactly today's board,
    where every one of them is 917.0."""
    b = board()
    built = b.get("built_at")
    # ⚠️ A BOARD THAT WILL NOT SAY WHEN IT WAS BUILT CANNOT BE CERTIFIED STALE.
    # `raw_adp_order_required(None)` returns False — correct for the ratchet, which
    # is A's granted symbol and whose contract I am not touching — but read as a
    # verdict it means "an absent timestamp switches this gate off forever". The
    # skip arm below is only honest while the staleness claim is grounded in an
    # observed build time, so the guard belongs HERE, at the decision, not in the
    # predicate. Null-as-absence is the defect class this repo keeps paying for.
    assert built, (
        "the board carries no `built_at`, so 'this board predates the fix' is "
        "unfalsifiable and the skip below would be a free pass with no expiry")
    unpriced = [p for p in (b.get("players") or [])
                if p.get("adp_source") in (None, "search_rank")]
    projected = [p for p in unpriced if (p.get("proj_mean") or 0) > 0]
    if not projected:
        pytest.skip("UNCHECKED: no projected fallback rows on this board")
    distinct = len({p.get("raw_adp") for p in projected})

    if not raw_adp_order_required(built):
        assert distinct <= KNOWN_TIED_FALLBACK_VALUES, (
            "the board predates the fix (%s <= %s) yet the deep pool is ALREADY "
            "ordered (%d distinct values) — good news that must be RECORDED: move "
            "RAW_ADP_ORDER_FIX_LANDED back so this starts enforcing"
            % (built, RAW_ADP_ORDER_FIX_LANDED, distinct))
        pytest.skip(
            "board built %s, BEFORE the fix landed %s — %d projected fallback rows "
            "share %d raw_adp value(s), which is staleness and not failure. This "
            "enforces from the next rebuild."
            % (built, RAW_ADP_ORDER_FIX_LANDED, len(projected), distinct))

    assert distinct > 1, (
        "%d projected fallback rows still share ONE raw_adp value on a board built "
        "%s, AFTER the fix landed %s. A constant is not an ordering, and the "
        "comment above it says it is."
        % (len(projected), built, RAW_ADP_ORDER_FIX_LANDED))
    assert distinct >= len(projected) * 0.5, (
        "only %d distinct values across %d projected rows — they are ordered in "
        "name but mostly still tied" % (distinct, len(projected)))
