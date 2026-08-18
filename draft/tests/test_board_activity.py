# TERRITORY: C
"""NOTHING THAT HAS NOT PLAYED A DOWN IN TWO YEARS MAY PRICE A DECISION.

Tom Brady, Drew Brees, Gronkowski, Edelman, Antonio Brown, Fitzgerald, Gurley and
Marshawn Lynch are all on the 2026 board. `build.py:448` gates on
`p.get("active") is False`, and Sleeper leaves `active` UNSET for much of what it
lists, so a null sails through; the only other gate is `search_rank`, which
Sleeper never retires, and this path puts no ceiling on it.

THEY ARE NOW PRUNED, in `build.py`, which imports `dormant()` from here rather
than reimplementing it — one definition, not two that drift. The prune runs after
projections attach, because that is the first point where both a market ADP and a
projection exist, and those are the two exemptions that stop it deleting somebody
real.

THIS FILE STILL OWNS THE PROPERTY, and that is deliberate: the prune could be
reverted, skipped by its own exception guard, or refused because the stores could
not be read, and in every one of those cases the dormant rows are back on the
board. The guarantee has to hold whether or not the pruning happened — they must
not reach anything that turns into advice.

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


#: Market-priced, projected rows. Every fixture needs them, because the detector
#: REFUSES to judge a board whose projections look broken — and a board of one
#: unprojected player looks exactly like one whose projection fetch died.
def _healthy(n=4):
    return [{"player_id": "h%d" % i, "name": "Priced %d" % i, "position": "WR",
             "years_exp": 3, "adp_source": "ffc", "adp": 10.0 + i,
             "proj_mean": 100.0} for i in range(n)]


def _synthetic(rows, relevant_board=225):
    return {"players": list(rows) + _healthy(),
            "provenance": {"adp": {"relevant_board": relevant_board}}}


# ── the detector, proved before it is believed ─────────────────────────────
#: Cannot be on an NFL field in 2026. Named rather than counted, because a count
#: can drift to zero through a bug in the reader and still look like a healthy
#: board.
RETIRED = ("Tom Brady", "Drew Brees", "Rob Gronkowski", "Julian Edelman",
           "Antonio Brown", "Larry Fitzgerald", "Todd Gurley", "Marshawn Lynch")


def _fixture_board():
    """The board the instant BEFORE the activity filter first ran — A's input,
    committed so the detector keeps being testable after it succeeds."""
    p = (Path(__file__).resolve().parent / "fixtures" /
         "board_pre_activity_filter.json")
    if not p.exists():
        pytest.skip("UNCHECKED: board_pre_activity_filter.json is absent")
    return json.loads(p.read_text())


def test_NO_RETIRED_PLAYER_IS_ON_THE_BOARD_AND_UNFLAGGED():
    """THE INVARIANT THAT SURVIVES THE FIX, which the first version did not.

    I originally asserted these eight ARE flagged as dormant — true of the board
    as it stood, and guaranteed to fail the moment `build.py` started pruning
    them, because a pruned board has none to flag. The nightly rebuild at 08:00
    UTC would have turned main red for a fix working exactly as intended.

    The property that holds in BOTH worlds is the one worth asserting: a retired
    player is either absent from the board, or present and flagged. Never present
    and unflagged. Before the prune lands this passes by flagging them; after,
    by their absence — and it still fails if one reappears unflagged."""
    b = board()
    d = BA.dormant(b)
    assert d["status"] == "measured", d
    flagged = {p["name"] for p in d["rows"]}
    on_board = {p.get("name") for p in b["players"]}
    for who in RETIRED:
        assert who not in (on_board - flagged), (
            "%s is on the board and NOT flagged as dormant — the detector has "
            "stopped seeing what it was built for" % who)


def test_THE_DETECTOR_STILL_WORKS_after_the_board_is_pruned():
    """The other half. Once the prune lands there is nothing left to flag, and
    "found nothing" then looks identical to "the detector broke".

    So its ability is proved against a PLANTED retiree rather than against the
    board happening to contain one — which is what makes the assertion above safe
    to pass by absence."""
    planted = _synthetic([_row(player_id="ret", name="A Retired Great")])
    assert [p["name"] for p in BA.dormant(planted)["rows"]] == ["A Retired Great"]


def test_a_PROJECTION_IS_WHAT_SPARES_A_KICKER_not_his_position():
    """THE FALSE POSITIVE THAT DROVE THE REDESIGN, from both ends.

    The first version judged on recent activity and exempted K and DEF, because
    the weekly store scores neither — which produced 47 accused KICKERS with
    100-point projections when the exemption was missing, and then made
    Gostkowski, Tucker and Dan Bailey permanently INVISIBLE once it was there.

    Judging on who vouches for a player fixes both directions at once: a real
    2026 kicker carries a projection and is spared; a retired one carries none
    and is not. No position needs special handling, so no position has a blind
    spot.

    MUTATION: exempt K and DEF again — the retired kickers become unreachable."""
    rows = [_row(player_id="k1", name="Real Kicker", position="K", proj_mean=104.0),
            _row(player_id="k2", name="Retired Kicker", position="K"),
            _row(player_id="d1", name="A Defense", position="DEF", proj_mean=90.0)]
    d = BA.dormant(_synthetic(rows))
    assert [p["name"] for p in d["rows"]] == ["Retired Kicker"], d["rows"]


def test_a_2024_LEFTOVER_IS_CAUGHT_even_though_he_played_recently():
    """Ezekiel Elliott and Adam Thielen both SCORED in 2024 and both carry a 2026
    projection of zero. Recent activity cannot see them, which is exactly why it
    stopped being the test.

    MUTATION: require `not scored_recently` again — both walk back onto the
    board, and so does every other player who is finished but played last year."""
    rows = [_row(player_id="4034", name="Played In 2024")]   # a real scoring id
    d = BA.dormant(_synthetic(rows))
    assert [p["name"] for p in d["rows"]] == ["Played In 2024"], d["rows"]
    assert d["rows"][0]["scored_recently"] is True, (
        "the evidence must still be REPORTED even though it is not the test")


@pytest.mark.parametrize("kw,why", [
    ({"years_exp": 0}, "a rookie's blank history is the correct history"),
    ({"adp_source": "fantasypros"}, "the market prices him with NO adp number — fail-safe spare"),
    ({"adp_source": "fantasypros", "raw_adp": 150.0}, "the market prices him inside draftable depth"),
    ({"proj_mean": 3.2}, "a projection is a positive claim that he exists in 2026"),
])
def test_the_DETECTOR_SPARES_anyone_something_else_vouches_for(kw, why):
    """Each exemption is a way this could delete somebody real from a draft board,
    which is far worse than missing a retiree.

    MUTATION: remove any one of these guards — the accused set grows by exactly
    the players who had a reason to be there."""
    assert BA.dormant(_synthetic([_row(**kw)]))["rows"] == [], why


def test_a_DEEP_TABLE_GHOST_PRICE_does_not_vouch():
    """THE GRONKOWSKI CASE, pinned from the first in-run diagnosis of a refused
    nightly board (draft/tools/diagnose_refused_board.py, CI run 31897110098):
    FantasyPros' consensus table carried Rob Gronkowski — retired since 2021 —
    at ADP 298.0 with proj_mean 0.0, and the unconditional market exemption
    spared him, blocking the publish. An ADP beyond MARKET_SPARE_DEPTH (1.5x
    the 150-pick draft) is a feed artifact, not "somebody is drafting him".

    Both directions pinned so the bound cannot drift into deleting somebody
    real: 298 -> dormant, 225 (exactly the bound) -> spared, and the predicate
    is ONE exported function (market_vouches) shared with the prune audit."""
    ghost = _row(adp_source="fantasypros", raw_adp=298.0)
    assert [p["name"] for p in BA.dormant(_synthetic([ghost]))["rows"]] == ["Somebody"], (
        "a 298.0 ADP in a 150-pick draft vouched for an unprojected veteran")
    at_bound = _row(adp_source="fantasypros", raw_adp=BA.MARKET_SPARE_DEPTH)
    assert BA.dormant(_synthetic([at_bound]))["rows"] == [], (
        "a price exactly at MARKET_SPARE_DEPTH must still spare")
    assert BA.market_vouches(at_bound) and not BA.market_vouches(ghost)


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


def test_a_BROKEN_PROJECTION_FETCH_REFUSES_rather_than_deleting_the_board():
    """THE CATASTROPHIC FAILURE THIS RULE COULD CAUSE, guarded. "No projection"
    means "nobody expects him in 2026" only while projections actually loaded. If
    the fetch dies, EVERY row is unprojected and an unguarded rule would drop the
    entire board instead of eight retirees.

    The market-priced set is the population we know should be projected — 96.2%
    of it is today and it goes to zero the moment projections break.

    MUTATION: drop the health gate — this board loses every row."""
    dead = [dict(p, proj_mean=0.0) for p in _healthy(6)]
    d = BA.dormant({"players": dead + [_row(player_id="x")],
                    "provenance": {"adp": {"relevant_board": 225}}})
    assert d["status"] == "unmeasured", d
    assert d["rows"] == [] and d["n"] == 0
    assert "REFUSING" in d["note"], d["note"]


def test_UNREADABLE_STORES_are_unmeasured_rather_than_clean():
    """The failure this whole lane keeps finding: a check that could not look
    reporting the same green as a check that looked and found nothing. `ok` must
    be None, never True.

    MUTATION: return `ok: True` when the stores are missing — and the guarantee
    silently stops existing the day the artifacts move."""
    got = BA.audit(_synthetic([_row(overall_rank=1)]), root="/nonexistent")
    assert got["status"] == "measured", (
        "the weekly store is EVIDENCE now, not the test — losing it must not "
        "stop the check, only blank the `scored_recently` column", got)
    assert got["ok"] is False, "the planted row still reaches a decision surface"
    rows = BA.dormant(_synthetic([_row()]), root="/nonexistent")["rows"]
    assert rows and rows[0]["scored_recently"] is None, (
        "unknown activity must read as None, never as False", rows)


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
        "players nothing in the system expects in 2026 are reaching a decision "
        "surface: %s" % got["offenders"][:10])
    # NO FLOOR ON THE COUNT. It used to require >500 dormant rows, which is true
    # of an unpruned board and guaranteed FALSE once `build.py` prunes them — the
    # assertion would have gone red for the fix working. Zero dormant rows is the
    # success state. The detector's ability to find them is proved on planted
    # rows above, which is what makes passing by absence safe here.
    assert got["dormant"] >= 0


@pytest.mark.parametrize("which", ["fixture", "shipped"])
def test_PRUNING_A_BOARD_REMOVES_NOTHING_ACTIONABLE(which):
    """The EFFECT of the prune, with every exemption asserted separately. A single
    count would pass while any one of them had quietly stopped applying, and each
    is a different way to delete a player somebody is drafting.

    ⚠ TWO ARMS, BECAUSE THE SHIPPED ARM STOPS RUNNING THE DAY THE PRUNE SUCCEEDS.
    This used to run only against the artifact, and skipped when nothing was left
    to drop — "the success state, not a broken detector", which is true and still
    leaves seven assertions silently retired on the day they start mattering. A
    detector that can only be tested while the defect is present stops being
    tested the moment it works (A's finding, and A built the input for it:
    `fixtures/board_pre_activity_filter.json`, the board the instant before the
    filter first ran, 1,841 rows, from CI run 31750835657).

      fixture   ALWAYS runs. 1,158 dormant under the current rule, Brady among
                them, so the seven clauses are exercised forever.
      shipped   still catches a live regression while the artifact has dormant
                rows, and skips honestly once it does not.

    MUTATION: remove any exemption from `dormant` — the corresponding assertion
    names exactly which one went, on the fixture arm regardless of the board."""
    b = _fixture_board() if which == "fixture" else board()
    rows = BA.dormant(b)["rows"]
    if not rows:
        assert which == "shipped", (
            "the FIXTURE has nothing dormant in it — it exists precisely to hold "
            "the hazard permanently, so this arm can never be allowed to skip")
        pytest.skip("the shipped board is already pruned — nothing dormant left "
                    "to drop, which is the success state. The fixture arm above "
                    "still asserts every clause.")
    drop = {str(p.get("player_id")) for p in rows}
    gone = [p for p in b["players"] if str(p.get("player_id")) in drop]

    def num(v):
        return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

    # THE BOUND, AND WHY IT IS BORROWED FOR THE FIXTURE. A trimmed the fixture to
    # `players` and dropped `provenance`, so the relevant board cannot be derived
    # from it. Falling through to None would make this clause vanish on the arm
    # that runs forever — the exact silent retirement the two arms exist to
    # prevent. It is the same league and the same build lineage, so the shipped
    # board's bound applies, and it is ASSERTED present rather than defaulted.
    relevant = (((b.get("provenance") or {}).get("adp") or {})).get("relevant_board")
    if relevant is None:
        relevant = (((board().get("provenance") or {}).get("adp") or {})
                    ).get("relevant_board")
    assert relevant, (
        "no relevant-board bound from either the board under test or the shipped "
        "artifact — the 'inside the relevant board' clause below would silently "
        "not run")
    for label, bad in (
        ("ranked inside the draft's depth",
         [p for p in gone if (num(p.get("overall_rank")) or 10 ** 9) <= BA.DEPTH]),
        ("carrying positive VORP",
         [p for p in gone if (num(p.get("vorp")) or 0) > 0]),
        ("inside the relevant board",
         [p for p in gone if relevant and (num(p.get("adp")) or 10 ** 9) <= relevant]),
        # DRAFTABLY priced — BA.market_vouches, the same single predicate the
        # spare rule uses, deliberately not a re-implementation (one definition,
        # so the audit and the spare can never drift apart). Changed 2026-08-15
        # with the MARKET_SPARE_DEPTH bound: a FantasyPros deep-table ghost row
        # (Gronkowski at ADP 298.0 on the refused candidate board, CI run
        # 31897110098) is prunable; anyone priced inside 1.5x the draft's
        # depth is not.
        ("draftably priced by the market",
         [p for p in gone if BA.market_vouches(p)]),
        ("carrying a projection",
         [p for p in gone if (num(p.get("proj_mean")) or 0) > 0]),
        ("a rookie",
         [p for p in gone if (num(p.get("years_exp")) or 0) == 0]),
        # DEF ONLY. Dropping an unprojected KICKER is now correct and
        # deliberate — Gostkowski, Tucker and Dan Bailey were the point. Every
        # one of the 32 defenses carries a projection, so this clause is a
        # structural guarantee rather than a hopeful assertion: if it ever fires,
        # the projection join has broken for team units.
        ("a defense",
         [p for p in gone if p.get("position") == "DEF"]),
    ):
        assert not bad, "the prune would drop %d player(s) %s: %s" % (
            len(bad), label, [p.get("name") for p in bad[:6]])


# ── A KEPT PLAYER IS NEVER DORMANT ─────────────────────────────────────────
#
# A'S FINDING, NOT MINE, AND MY OWN REDESIGN MADE IT SHARPER. `dormant()` had
# four exemptions and a keeper was none of them. A player kept through a
# two-season injury — no scored week in 2024 or 2025, dropped by FFC, unprojected
# — matches every dormancy condition.
#
# THE ORDERING IS WHAT MAKES IT LIVE. `build.py` builds `kept_players` by
# FILTERING `players` at ~line 1266; the prune's insertion point is ~line 613. A
# keeper removed at 613 never appears at 1266 — he is simply gone, and the
# artifact the whole draft plan rests on is short a player with nothing saying so.
#
# The old "scored recently" rule accidentally protected an injured keeper who had
# played in 2024. "Who vouches for him" does not. Measured today: 0 of the 3 real
# designations and 0 of the 17 predicted are dormant — so nothing is broken, and
# the safety rests entirely on nobody currently keeping a two-year absentee.
# Keeper lock is 2026-08-20.

def _keeperless_row(pid="99001"):
    """A row that matches EVERY dormancy condition: not a rookie, no market
    price, no projection."""
    return {"player_id": pid, "name": "Kept Through Injury", "position": "RB",
            "years_exp": 8, "adp_source": None, "proj_mean": 0.0}


def _root_with_keepers(tmp_path, ids, name="keepers.json"):
    cfg = tmp_path / "config"
    cfg.mkdir(exist_ok=True)
    (cfg / name).write_text(json.dumps(
        {"teams": [{"draft_slot": 1,
                    "keepers": [{"player_id": i} for i in ids]}]}))
    return tmp_path


def _board_with(rows):
    """A board whose projection health passes, plus the rows under test."""
    filler = [{"player_id": "f%d" % i, "years_exp": 3, "adp_source": "ffc",
               "adp": 10.0 + i, "proj_mean": 100.0} for i in range(40)]
    return {"players": filler + list(rows)}


def test_a_KEPT_player_is_NOT_dormant_however_dead_he_looks(tmp_path):
    """THE ASSERTION THIS EXISTS FOR. MUTATION: drop the keeper check — the row
    below is pruned, `build.py` looks for him in `kept_players` 650 lines later
    and does not find him, and a keeper leaves the board silently on 08-20."""
    row = _keeperless_row()
    root = _root_with_keepers(tmp_path, ["99001"])
    d = BA.dormant(_board_with([row]), root=str(root))
    assert d["status"] == "measured", d
    assert [r["player_id"] for r in d["rows"]] == [], (
        "a real keeper designation was flagged dormant: %s"
        % [r["player_id"] for r in d["rows"]])
    assert d["keepers"]["spared"] == ["99001"], (
        "and the save must be COUNTED — '0 spared' and 'the check never ran' are "
        "different states: %s" % d["keepers"])


def test_the_HAZARD_IS_REAL_the_same_row_IS_dormant_without_a_designation(tmp_path):
    """Proved by removing the designation, because the test above passes
    perfectly against a rule that has stopped flagging anything at all."""
    row = _keeperless_row()
    root = _root_with_keepers(tmp_path, ["70000"])          # somebody else
    d = BA.dormant(_board_with([row]), root=str(root))
    assert [r["player_id"] for r in d["rows"]] == ["99001"], (
        "the row is not dormant even WITHOUT a designation, so the test above "
        "proves nothing about keepers: %s" % d)


def test_an_UNREADABLE_keeper_file_REFUSES_rather_than_pruning_blind(tmp_path):
    """An unreadable file is not 'no keepers', it is 'I do not know who is kept'.
    Pruning under an unknown keeper set is the loss this exists to prevent.

    MUTATION: treat a parse failure as an empty set — the prune runs with no
    keeper protection at all, on the one path where nobody would look."""
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "keepers.json").write_text("{not json")
    d = BA.dormant(_board_with([_keeperless_row()]), root=str(tmp_path))
    assert d["status"] == "unmeasured", d
    assert d["n"] == 0 and d["rows"] == []
    assert "UNKNOWN" in d["keepers"]["note"] or "unreadable" in d["keepers"]["note"]


def test_an_ABSENT_keeper_file_is_NOT_a_refusal(tmp_path):
    """No file means no designations exist yet — a fact about the league, not a
    failure to read one. `build.py` says exactly that and builds anyway.

    MUTATION: refuse on absent too — the prune never runs before the first
    designation is made, and the reason is invisible."""
    d = BA.dormant(_board_with([_keeperless_row()]), root=str(tmp_path))
    assert d["status"] == "measured", d
    assert [r["player_id"] for r in d["rows"]] == ["99001"]
    assert d["keepers"]["status"] == "absent"


def test_the_PREDICTED_slate_is_NOT_read_as_a_designation(tmp_path):
    """`predicted_keepers.json` is quarantined research — "PREDICTED slates for
    MOCK/REHEARSAL ONLY — never applied to the live board". Sparing a row on the
    strength of a prediction couples the live board to it, in the one direction
    that looks harmless and is still the coupling.

    MUTATION: fall back to the predicted slate when no real designation exists —
    research data starts deciding which rows survive on the board Cory drafts
    from, which is exactly what the quarantine forbids."""
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "predicted_keepers.json").write_text(json.dumps(
        {"teams": [{"draft_slot": 1, "keepers": [{"player_id": "99001"}]}]}))
    d = BA.dormant(_board_with([_keeperless_row()]), root=str(tmp_path))
    assert d["keepers"]["status"] == "absent", (
        "the predicted slate was read as a real designation: %s" % d["keepers"])
    assert [r["player_id"] for r in d["rows"]] == ["99001"]


def test_the_REAL_DESIGNATIONS_are_read_from_the_SHIPPED_config():
    """Against the real file, so this stops being a fixture exercise. Today: 3
    designations across 1 team — Cory's — because the rest of the league has not
    designated yet. MUTATION: read a different path and this reports 0."""
    k = BA.keeper_ids()
    assert k["status"] == "read", k
    assert k["teams"] >= 1 and len(k["ids"]) >= 3, k
    assert {"3198", "7564", "8151"} <= set(k["ids"]), sorted(k["ids"])
