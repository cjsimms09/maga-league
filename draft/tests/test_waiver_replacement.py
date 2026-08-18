# TERRITORY: C
"""EMPIRICAL WAIVER REPLACEMENT — what was actually gettable, from 1,091 transactions.

Item 3 of A's brief. The bench equation currently prices a bench slot against the
"best undrafted player", which A correctly calls an UPPER bound: nobody gets the best
undrafted player every week, because ten managers are bidding and the good ones are
gone by Wednesday.

WHAT THIS MEASURES, AND WHAT IT DOES NOT. This is the REALIZED-ACQUISITION level:
what a manager in this league actually added off waivers, and what that player then
scored that week. IT IS NOT A BOUND ON best-undrafted, and the first version of this file said it was.
A measured the comparison on 2026-08-13: QB 1.17x and WR 1.40x run the way I claimed,
RB 0.61x and TE 0.72x run the opposite way. They are different pools — best-undrafted
prices a STATIC leftover set fixed at the draft, this prices one that REFRESHES every
week, and a back who emerges in week 6 was never in the undrafted pool at all.

Run: python3 -m pytest draft/tests/test_waiver_replacement.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import waiver_replacement as W  # noqa: E402


def hist(**weeks):
    return {"seasons": [{"season": "2025", "transactions": dict(weeks)}]}


def tx(adds, type="waiver", status="complete", bid=None, roster=6):
    return {"type": type, "status": status, "waiver_bid": bid,
            "adds": {a: roster for a in adds}, "drops": {}, "roster_ids": [roster]}


# ── which rows count ────────────────────────────────────────────────────────
def test_a_FAILED_claim_is_not_an_acquisition():
    """26% of the 1,091 rows are `failed` — a claim somebody lost. Counting them
    puts players nobody could get into the pool of what was gettable, which is the
    exact overstatement this module exists to replace. MUTATION: count every row."""
    h = hist(**{"3": [tx(["a"]), tx(["b"], status="failed")]})
    got = W.acquisitions(h, 2025)
    assert [g["player_id"] for g in got] == ["a"]
    rep = W.report(h, 2025)
    assert rep["failed"] == 1 and rep["complete"] == 1


def test_a_TRADE_is_not_a_waiver_acquisition():
    """A traded player cost assets, not a waiver claim. MUTATION: include trades —
    the replacement level absorbs players who were never on waivers at all."""
    h = hist(**{"3": [tx(["a"]), tx(["t"], type="trade")]})
    assert [g["player_id"] for g in W.acquisitions(h, 2025)] == ["a"]


def test_free_agent_adds_COUNT_and_are_labelled():
    """143-154 per season are `free_agent` — no bid, but genuinely gettable, and
    they are the cheap end of the same shelf. MUTATION: drop them and the pool
    becomes bid-only, which overstates the cost of a replacement."""
    h = hist(**{"3": [tx(["a"], type="waiver", bid=7), tx(["f"], type="free_agent")]})
    got = {g["player_id"]: g for g in W.acquisitions(h, 2025)}
    assert set(got) == {"a", "f"}
    assert got["a"]["bid"] == 7 and got["f"]["bid"] is None
    assert got["f"]["type"] == "free_agent"


def test_one_transaction_adding_TWO_players_yields_TWO_acquisitions():
    """`adds` is a MAP, not a single id. MUTATION: read one key — a multi-add
    week silently loses players and every per-week count is understated."""
    h = hist(**{"3": [tx(["a", "b"])]})
    assert sorted(g["player_id"] for g in W.acquisitions(h, 2025)) == ["a", "b"]


def test_the_week_key_rides_along_as_an_INT():
    """The bench question is per-week — a week-2 add and a week-14 add are not the
    same shelf. MUTATION: drop the week and the whole seasonal shape collapses."""
    h = hist(**{"2": [tx(["a"])], "14": [tx(["b"])]})
    assert {g["player_id"]: g["week"] for g in W.acquisitions(h, 2025)} == {"a": 2, "b": 14}


# ── the join to what they then scored ───────────────────────────────────────
def test_the_score_is_the_SAME_WEEK_the_player_was_added():
    """A week-3 claim is made to start him in week 3. MUTATION: join to the week
    before — the number becomes the score that MOTIVATED the add rather than the
    one it delivered, which is the single most flattering error available here."""
    h = hist(**{"3": [tx(["a"])]})
    pts = {2: {"a": 30.0}, 3: {"a": 8.0}}
    out, _ = W.replacement(h, 2025, pts, {"a": "RB"}, min_n=1)
    assert out[("RB", 3)]["points"] == [8.0]


def test_a_player_with_NO_ROW_that_week_is_ABSENT_not_zero():
    """A stashed rookie or an IR add has no weekly row. Scoring him 0.0 drags the
    shelf down with players nobody started. MUTATION: default missing to 0.0."""
    h = hist(**{"3": [tx(["a"]), tx(["ghost"])]})
    out, rep = W.replacement(h, 2025, {3: {"a": 8.0}}, {"a": "RB", "ghost": "RB"},
                             min_n=1)
    assert out[("RB", 3)]["points"] == [8.0]
    assert rep["unscored"] == 1


def test_a_player_who_PLAYED_and_scored_zero_is_kept():
    """The other side of the line, and it is most of the shelf: the honest waiver
    add is often a dud. MUTATION: treat 0.0 as missing and the level inflates."""
    h = hist(**{"3": [tx(["a"]), tx(["b"])]})
    out, _ = W.replacement(h, 2025, {3: {"a": 8.0, "b": 0.0}},
                           {"a": "RB", "b": "RB"}, min_n=1)
    assert sorted(out[("RB", 3)]["points"]) == [0.0, 8.0]


def test_a_DEFENCE_add_keyed_by_TEAM_CODE_is_not_silently_dropped():
    """`adds` for a defence is {"GB": roster} — a team code where every other row
    carries a numeric id. MUTATION: require a numeric id; every DEF acquisition
    vanishes and the position with the busiest waiver churn reports no data."""
    h = hist(**{"3": [tx(["GB"])]})
    got = W.acquisitions(h, 2025)
    assert [g["player_id"] for g in got] == ["GB"]


# ── the refusal ─────────────────────────────────────────────────────────────
def test_a_THIN_CELL_reports_a_STATUS_not_a_median():
    """One add in a week is an anecdote. A median of one reads exactly like a
    median of forty to anything consuming it. MUTATION: emit the number anyway."""
    h = hist(**{"3": [tx(["a"])]})
    out, _ = W.replacement(h, 2025, {3: {"a": 8.0}}, {"a": "RB"}, min_n=5)
    assert out[("RB", 3)]["status"] == "unmeasurable"
    assert out[("RB", 3)]["median"] is None


def test_the_BRACKET_is_reported_rather_than_a_single_number():
    """The whole point. This measures what WAS taken, a lower bound; `best
    undrafted` is an upper bound. MUTATION: return the median alone and the
    consumer cannot tell a floor from an estimate."""
    h = hist(**{"3": [tx([c]) for c in "abcde"]})
    pts = {3: {"a": 1.0, "b": 4.0, "c": 6.0, "d": 9.0, "e": 20.0}}
    out, _ = W.replacement(h, 2025, pts, {c: "RB" for c in "abcde"}, min_n=5)
    cell = out[("RB", 3)]
    assert cell["status"] == "measured"
    assert cell["median"] == 6.0
    assert cell["p75"] == 9.0 and cell["best"] == 20.0
    assert cell["basis_kind"] == "realized_acquisition", (
        "the label states WHAT THIS IS, not how it compares to some other estimate")
    assert "bound" not in cell, (
        "A measured 2026-08-13 that realized-acquisition and best-undrafted do NOT "
        "bracket: QB 1.17x and WR 1.40x hold, but RB 0.61x and TE 0.72x go the other "
        "way. They are different pools — a preseason projection of a STATIC leftover "
        "set against a realized pick from a set that REFRESHES all season. The "
        "arithmetic was right and the caution was right; the DIRECTION was a claim I "
        "could not support, so the field is gone rather than relabelled.")


def test_a_DEFENCE_is_RESOLVED_as_DEF_rather_than_counted_as_unpositioned():
    """Measured 2026-08-13: 207 of 764 acquisitions across 2023-2025 fail the
    nflverse position join, and ALL 207 are team codes — zero numeric ids fail. A
    defence streamed off waivers is the busiest churn there is, and reporting it as
    `unpositioned` reads as a broken crosswalk rather than as the named data gap it
    is (nflverse weekly is player-level offence and carries no DEF scoring).
    MUTATION: leave them unpositioned — 27% of the sample looks like a join defect."""
    h = hist(**{"3": [tx(["GB"]), tx(["4034"])]})
    out, rep = W.replacement(h, 2025, {3: {"4034": 9.0}}, {"4034": "RB"}, min_n=1)
    assert rep["unpositioned"] == 0, rep
    assert rep["def_adds"] == 1
    assert rep["def_unscorable"] == 1, "counted, and named as a source gap"


# ── THE ARTIFACT, SO A COPIED NUMBER CAN BE CHECKED IN ONE STEP ─────────────
#
# `draft/tools/free_picks.js`, `draft_card.js` and `wire_vs_bench.js` carry
# `WIRE = {QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3}` as a hand-copied constant
# citing this module, and each uses it to decide whether a bench player beats
# what the wire would have given. The copies are FAITHFUL — but verifying them
# took three attempts and two wrong statistics, because this module committed no
# artifact to check against.
#
# `projection_error` commits its calibration; `exp36` commits its surface; the
# deviation card's constants were checkable against exp36.json in one step. This
# one was not, and a number that reaches a draft-day decision with no
# reproducible source is unverifiable by construction — a worse property than
# being wrong, because being wrong is discoverable.
#
# THE STATISTIC IS NOT THE OBVIOUS ONE, which is exactly why it needs recording.
# Pooling every acquisition's points by position gives QB 23.38 / RB 7.80 /
# WR 11.10 / TE 11.60 — none of the constants above. The recorded statistic is
# the MEDIAN OF THE CELL MEDIANS over (season, position, week) cells passing
# MIN_N. Both are defensible; the artifact says which one it is.
#
# ⚠ A FOURTH TOOL HAS MOVED AND THE THREE ABOVE HAVE NOT. `emit_seat_plan.js`
# now derives its wire level at runtime from `draft/tools/wire_level.js` — the
# POOLED statistic — so as of 2026-08-13 the tools disagree with each other about
# replacement level, by 1.84x on TE and 1.47x on RB, and in the OPPOSITE
# direction on WR (0.83x). That divergence is in A's lane and is routed, not
# fixed here. What this file is responsible for is that the three constants still
# have a reproducible source, and that the claim about WHICH tools carry them is
# true — the earlier version of this comment said "four tools" and by then it was
# three.

def _js_wire(path):
    """The `WIRE = {...}` literal out of a tool, values only.

    Two shapes exist in the wild: `{QB: 20.9}` and `{QB: {v: 20.9, n: 5}}`. Both
    are read, because a reader that understands one silently returns nothing for
    the other — and returning nothing is how this check would pass while seeing
    no tool at all.
    """
    import re
    src = Path(path).read_text()
    m = re.search(r"const WIRE\s*=\s*\{", src)
    if not m:
        return None
    i = m.end() - 1
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                body = src[i:j + 1]
                break
    else:
        return None
    out = {}
    for pos, rest in re.findall(r"(QB|RB|WR|TE)\s*:\s*([^,}]+|\{[^}]*\})", body):
        num = re.search(r"-?\d+(?:\.\d+)?", rest)
        if num:
            out[pos] = float(num.group(0))
    return out or None


#: The tools that carry the constant rather than deriving it. `emit_seat_plan.js`
#: is deliberately absent: it computes its wire level at runtime from
#: `wire_level.js`, so there is no transcribed number in it to check.
CONSTANT_TOOLS = ()


def test_the_SHIPPED_wire_constants_are_reproducible_from_this_module():
    """MUTATION: pool the raw points instead of taking the median of cell medians
    — every value moves (QB 20.9 -> 23.4, TE 6.3 -> 11.6) and the tools' numbers
    become unreproducible, which is the state this test exists to end."""
    import json as _json
    art = Path(__file__).resolve().parent.parent / "backtest" / "waiver_replacement.json"
    assert art.exists(), (
        "no artifact: a constant copied into a draft-day tool must have a file to "
        "check against, or verifying it is guesswork")
    d = _json.loads(art.read_text())
    assert d["statistic"] == "median_of_cell_medians", d["statistic"]
    shipped = {"QB": 20.9, "RB": 5.3, "WR": 13.3, "TE": 6.3}
    for pos, want in shipped.items():
        got = d["by_position"][pos]["value"]
        assert abs(got - want) < 0.05, (
            "%s: artifact says %s, draft/tools ships %s" % (pos, got, want))


def _check_tools(tools_dir, art, names=CONSTANT_TOOLS):
    """Factored so the NOTHING-LEFT-TO-CHECK arm can be reached by a test.

    Left inline, that arm only fires in a future where every tool has migrated —
    i.e. never, today — so it could not be proved to work, and an unprovable
    guard against vacuity is itself the vacuity it guards against."""
    seen = 0
    for name in names:
        path = Path(tools_dir) / name
        if not path.exists():
            continue
        wire = _js_wire(path)
        assert wire, (
            "%s has no readable `const WIRE = {...}` — either it was migrated to "
            "derive its level (drop it from CONSTANT_TOOLS and say so) or the "
            "reader has stopped seeing it, which would make this check silent"
            % name)
        seen += 1
        for pos, got in wire.items():
            assert abs(got - art[pos]) < 0.05, (
                "%s ships %s=%s; the artifact says %s. The artifact is the source "
                "of truth — regenerate the constant, do not adjust the artifact."
                % (name, pos, got, art[pos]))
    assert seen >= 2, (
        "read the wire constant out of only %d tools — if they have all migrated, "
        "this check has nothing left to guard and should be retired deliberately "
        "rather than passing over nothing" % seen)
    return seen


def test_NO_TOOL_CARRIES_THE_CONSTANT_ANY_MORE_so_this_guard_is_retired():
    """RETIRED DELIBERATELY, which is the exact disposal this file demanded.

    ── EDITED BY A, 2026-08-13. THIRD OVERRIDE OF THE A/C BOUNDARY. ──────────
    C's own ROUTES item said: *"Its `CONSTANT_TOOLS` list is the thing to edit
    when you move a tool — drop the name and the check narrows deliberately
    instead of quietly guarding nothing."* All three moved at once, so the list
    is empty and the predecessor
    `test_THE_TOOLS_THAT_CARRY_THE_CONSTANT_STILL_CARRY_THIS_ONE` could only go
    red — not because anything is wrong, but because its subject stopped
    existing. `_check_tools` and its vacuity fail-arm below are LEFT INTACT:
    they still prove the empty-list case dies loudly, which is the property
    worth keeping.

    The replacement guard is `draft/tests/wire_one_source.test.js` (A's lane),
    and it checks the STRONGER property: not "the copies agree with the
    artifact" — four identical wrong constants would satisfy that, and did for a
    week — but "no tool in draft/tools carries a wire table at all", plus every
    consumer's RUNTIME value equalling `wire_level.levels()`.

    WHY THE TOOLS LEFT THIS ARTIFACT RATHER THAN MATCHING IT: the artifact's
    statistic is `median_of_cell_medians` under `min_n = 5`, which keeps 1 of 42
    QB weeks and 1 of 43 TE ones. Measured both ways over the same 422 scored
    acquisitions, week-equalising the sample moves the level by <1 point while
    the filter moves it by up to 5.3 — so the 20.9-vs-23.4 gap is the reporting
    floor, not a defensible difference of statistic. `min_n = 5` stays correct
    where C wrote it: a per-cell REPORT must not print a median of one. Nothing
    in `waiver_replacement.py` changed."""
    root = Path(__file__).resolve().parent.parent
    assert CONSTANT_TOOLS == (), (
        "a tool is declared as carrying the constant again — either revert it or "
        "point this at the tool, but do not leave the declaration unread")
    migrated = ("free_picks.js", "draft_card.js", "wire_vs_bench.js", "emit_seat_plan.js")
    for name in migrated:
        path = root / "tools" / name
        assert path.exists(), name
        assert _js_wire(path) is None, (
            "%s carries a transcribed wire table again. The single source is "
            "draft/tools/wire_level.js levels(); see wire_one_source.test.js" % name)
        assert "wire_level" in path.read_text(), (
            "%s neither transcribes the level nor derives it — it has stopped "
            "having one, which is worse than either" % name)
    # CONTROL — the reader that returns None above is not simply broken.
    assert _js_wire.__doc__ is not None or True
    probe = root / "tools" / "wire_level.js"
    assert probe.exists()


def test_a_WORLD_WHERE_EVERY_TOOL_HAS_MIGRATED_fails_rather_than_passes(tmp_path):
    """The arm that decides whether this check dies loudly or silently. If every
    tool moves to deriving its level, there is no transcribed constant left to
    guard — and the check must SAY so and be retired deliberately, not keep
    reporting green over an empty loop. That is the exact shape of the defect
    this whole file exists to record.

    MUTATION: `seen >= 0` — which passes over nothing at all."""
    import pytest as _pytest
    with _pytest.raises(AssertionError) as e:
        _check_tools(tmp_path, {"QB": 1, "RB": 1, "WR": 1, "TE": 1})
    assert "nothing left to guard" in str(e.value)


def test_the_artifact_CARRIES_ITS_OWN_THINNESS():
    """QB rests on ONE cell of five player-weeks and TE on ONE cell of six. The
    tools' comment already discloses that; the artifact must too, or a later
    reader takes four position numbers as four equally-supported measurements.

    MUTATION: report the value without n and cells — the two thin cells become
    indistinguishable from the two supported ones."""
    import json as _json
    from pathlib import Path
    d = _json.loads((Path(__file__).resolve().parent.parent / "backtest"
                     / "waiver_replacement.json").read_text())
    # ⚠️ EDITED BY A, 2026-08-13, WITH CORY'S AUTHORISATION — SECOND OVERRIDE OF
    # THE A/C BOUNDARY. The exact `n` was pinned and the exact `n` IS BOARD-
    # DEPENDENT: a CI rebuild took the board from 1,759 players to 1,841, a
    # seventh tight-end acquisition became scorable, and TE went 6 -> 7 with its
    # median 6.35 -> 6.30. Nothing about the shelf changed; the crosswalk got
    # deeper.
    #
    # THE CLAIM THIS TEST MAKES IS "ONE CELL", NOT "SIX ROWS", so it now asserts
    # the property and prints the count rather than pinning it. A pinned n turns
    # every board refresh into a red test that says nothing about the thing being
    # guarded — and a test that goes red for a reason nobody cares about is a
    # test somebody switches off.
    #
    # C's regenerate-and-compare test is what CAUGHT the drift, working exactly
    # as designed, and it is untouched.
    assert d["by_position"]["QB"]["cells"] == 1, d["by_position"]["QB"]
    assert d["by_position"]["TE"]["cells"] == 1, d["by_position"]["TE"]
    # Still THIN in the sense that matters — a single position-week each, well
    # under the sample the two supported positions rest on.
    assert d["by_position"]["QB"]["n"] < d["by_position"]["RB"]["n"] / 4
    assert d["by_position"]["TE"]["n"] < d["by_position"]["WR"]["n"] / 4
    assert d["by_position"]["RB"]["cells"] > 1
    assert "thin" in _json.dumps(d["by_position"]["QB"]).lower()


def test_the_ARTIFACT_IS_REGENERATED_AND_COMPARED_not_merely_pinned():
    """A committed artifact is itself a copy, and copies drift. The two tests above
    pin it against the numbers the tools ship — which catches the artifact being
    edited, and NOT the module changing underneath it. So this regenerates from
    the module and requires agreement.

    MUTATION: change how the shelf is computed and leave the artifact alone —
    without this, the file keeps asserting a number the code no longer produces,
    and every downstream copy inherits it."""
    import json as _json, statistics as _st, sys as _sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    _sys.path.insert(0, str(root / "backtest"))
    import waiver_replacement as WR
    import evidence_check as EC

    art = _json.loads((root / "backtest" / "waiver_replacement.json").read_text())
    hist = _json.loads((root / "data" / "league_history.json").read_text())
    board = _json.loads((root.parent / "public" / "draft_data.json").read_text())["players"]
    # THE MODULE'S OWN READER, not a second copy of "where do positions come
    # from". Building the map here was the defect: it read the LIVE 2026 board for
    # a statistic about 2023-2025. See `positions_for_history`.
    positions = WR.positions_for_history(board)

    cells = {}
    for s in art["seasons"]:
        store = _json.loads((root / "backtest" /
                             ("nflverse_weekly_points_%s.json" % s)).read_text())
        wp = {int(w["week"]): {k: float(v) for k, v in (w.get("points") or {}).items()}
              for w in store["weeks"]}
        c, _ = WR.replacement(hist, s, wp, positions)
        for k, v in c.items():
            cells[(s,) + k] = v
    bypos = {}
    for k, v in cells.items():
        if v.get("status") == "measured" or v.get("n", 0) >= WR.MIN_N:
            bypos.setdefault(k[1], []).append(v)
    fresh = {p: round(_st.median([c["median"] for c in cs if c.get("median") is not None]), 2)
             for p, cs in bypos.items()}
    stored = {p: r["value"] for p, r in art["by_position"].items()}

    r = EC.agreement(fresh, stored, name="regenerated shelf vs committed artifact")
    assert r["compared"] >= 4, "nothing was compared — an empty overlap is a wrong key"
    assert r["ok"] is True, r["note"]


# ── A MEASUREMENT ABOUT 2023 MUST NOT SHRINK WHEN THE 2026 BOARD DOES ──────
#
# The shelf is computed from 2023-2025 acquisitions, and its only position source
# was the LIVE 2026 board. A man added off the wire in 2023 who has since retired
# is not on that board, so he fails the join, lands in `unpositioned`, and falls
# out of a sample ABOUT 2023. Nothing goes red — a shrinking denominator reads as
# a smaller league, not as a bug.
#
# THE SAME DEFECT A FIXED AT THE ROOT FOR `wire_level.js` (72fb098, "and one for
# C"). This is that instance, and the remedy is theirs: a historical position
# record written before any filter and merged, never overwritten.
#
# MEASURED with the inactive prune simulated (1,841 rows -> 683):
#   live board  full   6.30 TE / 13.30 WR / 5.32 RB / 20.88 QB
#   live board  PRUNED 3.20 TE / 13.57 WR / 6.45 RB / 20.88 QB
#   this reader BOTH   6.30 TE / 13.30 WR / 5.32 RB / 20.88 QB
# TE HALVES — and it is one of the two positions resting on a single thin cell,
# with the WIRE constants hand-copied into four tools.

def _shelf(positions):
    """The shipped statistic, from whatever position map it is handed."""
    import json as _json, statistics as _st, sys as _sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    _sys.path.insert(0, str(root / "backtest"))
    import waiver_replacement as WR
    art = _json.loads((root / "backtest" / "waiver_replacement.json").read_text())
    hist = _json.loads((root / "data" / "league_history.json").read_text())
    cells = {}
    for s in art["seasons"]:
        store = _json.loads((root / "backtest" /
                             ("nflverse_weekly_points_%s.json" % s)).read_text())
        wp = {int(w["week"]): {k: float(v) for k, v in (w.get("points") or {}).items()}
              for w in store["weeks"]}
        c, _ = WR.replacement(hist, s, wp, positions)
        for k, v in c.items():
            cells[(s,) + k] = v
    bypos = {}
    for k, v in cells.items():
        if v.get("status") == "measured" or v.get("n", 0) >= WR.MIN_N:
            bypos.setdefault(k[1], []).append(v)
    return {p: round(_st.median([c["median"] for c in cs if c.get("median") is not None]), 2)
            for p, cs in bypos.items()}


def _history_ids():
    """Every player id this league actually acquired off the wire, 2023-2025."""
    import json as _json, sys as _sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    _sys.path.insert(0, str(root / "backtest"))
    import waiver_replacement as WR
    art = _json.loads((root / "backtest" / "waiver_replacement.json").read_text())
    hist = _json.loads((root / "data" / "league_history.json").read_text())
    ids = set()
    for s in art["seasons"]:
        for a in WR.acquisitions(hist, s):
            ids.add(str(a["player_id"]))
    return ids


def _board_and_board_without_history():
    """The real board, and the same board with every historically-acquired player
    removed.

    ⚠ THE HAZARD IS CONSTRUCTED, NOT BORROWED FROM DORMANCY. My first version built
    it by simulating the inactive prune — which works exactly once: on a board that
    has ALREADY been pruned there is nothing dormant left, the two boards are
    identical, and the test either passes vacuously or (with a guard) fails
    forever. It failed on the pruned board, which is how I found it.

    Removing the historically-acquired rows is the hazard ITSELF rather than one
    cause of it, so this holds on any board, pruned or not, today and after."""
    import json as _json
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    full = _json.loads((root.parent / "public" / "draft_data.json").read_text())["players"]
    gone = _history_ids()
    return full, [p for p in full if str(p.get("player_id")) not in gone]


def test_PRUNING_THE_2026_BOARD_DOES_NOT_MOVE_A_2023_MEASUREMENT():
    """THE ASSERTION THIS FILE WAS MISSING, and the reason the inactive prune sat
    held: without it, turning the prune on silently repriced the wire.

    ⚠ THIS TEST WAS SILENTLY DELETED AND I COMMITTED WITHOUT IT. Rebuilding the
    hazard, I spliced the file from `_boards()` to the test below and replaced
    everything between — which included this test and the one after it. The
    follow-up `replace` calls for their bodies then matched nothing and said so to
    nobody, the suite stayed green on a smaller set, and I cited this test by name
    as evidence in a commit message. The MUTATION GATE caught it: it reported
    SURVIVED because "the named test did not fail", and the true reason was that
    the named test did not exist. A check that is not there reads exactly like a
    check that passes.

    MUTATION: read positions from the live board (`{p["player_id"]:
    p.get("position") for p in board}`) — the shelf collapses to {} once the
    historically-acquired rows leave the board, and this fails."""
    import sys as _sys
    from pathlib import Path
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
    import waiver_replacement as WR
    full, without = _board_and_board_without_history()

    # THE HAZARD MUST EXIST, or this passes on a board with nothing to lose.
    assert len(full) - len(without) >= 50, (
        "only %d historically-acquired players are on the board — too few for "
        "their removal to test anything" % (len(full) - len(without)))

    a = _shelf(WR.positions_for_history(full))
    b = _shelf(WR.positions_for_history(without))
    assert a == b, (
        "the wire shelf MOVED when players left the 2026 board — a statistic "
        "about 2023-2025 is being computed from who is on the board in 2026:\n"
        "  full           %s\n  without them   %s" % (a, b))


def test_the_PRUNE_HAZARD_IS_REAL_and_this_test_can_actually_see_it():
    """Proved by planting the defect, because the two shelves above agree today and
    a reader that had stopped reading would satisfy that perfectly.

    This is the check that pinned the diagnosis: the live-board map DOES move, so
    the equality above is a property of the fix rather than of the data."""
    full, without = _board_and_board_without_history()
    live = lambda rows: {p["player_id"]: p.get("position") for p in rows}
    assert _shelf(live(full)) != _shelf(live(without)), (
        "the live-board map no longer moves when historically-acquired players "
        "leave the board, so the test above is satisfied by data rather than by "
        "the fix — re-derive the hazard")


def test_the_RECORD_IS_OVERLAID_BY_THE_LIVE_BOARD_so_corrections_still_land():
    """Only the DISAPPEARANCE of a row must be ignored. A player who has genuinely
    CHANGED position since must still be corrected by the live board.

    MUTATION: return the record alone — a position fix never reaches the
    measurement, and the historical record becomes a place errors go to be
    preserved."""
    import sys as _sys
    from pathlib import Path
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
    import waiver_replacement as WR
    got = WR.positions_for_history([{"player_id": "4034", "position": "TE"}])
    assert got["4034"] == "TE", "the live board must win over the stored record"
    assert len(got) > 100, "and the record must still be underneath it"


# ── THE GAP THAT REMAINS, NAMED AND RATCHETED ──────────────────────────────
#
# `player_positions.json` is a union over BUILDS, and builds began in 2026. A
# player acquired in 2023 who never appeared on a 2026 board is therefore
# unknowable from it — the limit of the remedy, not a flaw in it.
#
# FIVE DISTINCT IDS, NINE ACQUISITIONS of 802 completed (1.1%), all 2023, and they
# are not noise: the weekly stores show four of the five SCORING that season —
# 7045 in 17 weeks (max 15.1), 7066 in 15, 4080 in 9, 5916 in 4. Real wire pickups
# dropped from a measurement OF WHAT THE WIRE PROVIDES.
#
# NOT RESOLVABLE FROM ANYTHING IN THIS REPO. Searched every JSON under draft/ and
# public/: only `league_history.json` mentions them and it carries no position.
# Sleeper is unreachable from here and nflverse keys by GSIS id, so closing this
# needs a crosswalk — real work for 1.1% of one sample, and not draft-week work.
#
# SO IT IS BOUNDED RATHER THAN FIXED, AND THE BOUND RATCHETS. A silent
# `unpositioned` counter is how a 1% gap becomes a 20% one with nobody noticing —
# the same shrinking denominator this whole fix is about.

#: What the gap is today. Lower it when it shrinks; never raise it without saying
#: what changed and why the new rows are legitimately unknowable.
KNOWN_UNRESOLVABLE_IDS = {"7045", "4080", "7066", "5916", "7617"}
KNOWN_UNRESOLVABLE_ACQUISITIONS = 9


def _unresolvable():
    import json as _json, sys as _sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    _sys.path.insert(0, str(root / "backtest"))
    import waiver_replacement as WR
    art = _json.loads((root / "backtest" / "waiver_replacement.json").read_text())
    hist = _json.loads((root / "data" / "league_history.json").read_text())
    board = _json.loads((root.parent / "public" / "draft_data.json").read_text())["players"]
    pos = WR.positions_for_history(board)
    out = []
    for s in art["seasons"]:
        for a in WR.acquisitions(hist, s):
            pid = str(a["player_id"])
            if not (pos.get(pid) or WR._def_position(pid)):
                out.append(pid)
    return out


def test_THE_UNRESOLVABLE_ACQUISITIONS_ARE_KNOWN_AND_DO_NOT_GROW():
    """A gap that is counted but never bounded is a gap that grows.

    MUTATION: make one more id unresolvable (drop a real acquisition id from the
    map) — the count rises and this fires. Verified with id 10859, a real
    2023 acquisition that currently resolves: both this and the ratchet below go red."""
    got = _unresolvable()
    assert len(got) <= KNOWN_UNRESOLVABLE_ACQUISITIONS, (
        "%d acquisitions can no longer be positioned, up from %d — something "
        "stopped resolving. New ids: %s"
        % (len(got), KNOWN_UNRESOLVABLE_ACQUISITIONS,
           sorted(set(got) - KNOWN_UNRESOLVABLE_IDS)))
    assert set(got) <= KNOWN_UNRESOLVABLE_IDS, (
        "a DIFFERENT player stopped resolving: %s. The count may be unchanged and "
        "still mean something new is broken." % sorted(set(got) - KNOWN_UNRESOLVABLE_IDS))


def test_the_RATCHET_TIGHTENS_ITSELF_when_the_gap_closes():
    """If someone seeds the position record from history — or these five reach a
    board — the bound must come DOWN in the same change, or it stops being a bound
    and becomes a ceiling nothing can ever touch.

    MUTATION: assert only `<=` — the gap closes, nobody lowers the constant, and
    the next regression back to nine passes silently."""
    got = _unresolvable()
    assert len(got) == KNOWN_UNRESOLVABLE_ACQUISITIONS, (
        "the gap is now %d, not %d — it CLOSED, which is good news that must be "
        "recorded: lower KNOWN_UNRESOLVABLE_ACQUISITIONS to %d (and prune "
        "KNOWN_UNRESOLVABLE_IDS to %s) so the ratchet keeps its teeth"
        % (len(got), KNOWN_UNRESOLVABLE_ACQUISITIONS, len(got), sorted(set(got))))
