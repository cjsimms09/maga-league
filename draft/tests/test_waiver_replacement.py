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
CONSTANT_TOOLS = ("free_picks.js", "draft_card.js", "wire_vs_bench.js")


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


def test_THE_TOOLS_THAT_CARRY_THE_CONSTANT_STILL_CARRY_THIS_ONE():
    """READS THE TOOLS, which the assertion above never did. It compared the
    artifact to a hardcoded list and called that "what the tools ship" — so when
    a tool changed, the test went on passing and its name went on promising.

    A red here means one of two things and the fix differs: a tool was migrated
    to derive its level at runtime (remove it from CONSTANT_TOOLS), or a
    transcribed constant drifted from the artifact (regenerate it). It is not a
    reason to widen the tolerance."""
    import json as _json
    root = Path(__file__).resolve().parent.parent
    d = _json.loads((root / "backtest" / "waiver_replacement.json").read_text())
    art = {p: v["value"] for p, v in d["by_position"].items()}
    assert _check_tools(root / "tools", art) >= 2


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
    positions = {p["player_id"]: p.get("position") for p in board}

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
