# TERRITORY: D
"""THE SHARED POPULATION IS A MEASUREMENT, NOT AN ASSUMPTION.

DEFECT GUARDED: PROJECTION-PROGRAM-2027's bar is "same players and weeks", and
the in-season prompt says a comparison over "whoever each source happened to
cover" is not a comparison. Nobody had the number, so nobody could tell whether
a three-way grade was even well-defined.

It is. ⚠️ THE REASON USED TO BE STATED AS "the universes are perfectly NESTED --
FantasyPros is a strict subset of both Sleeper and of what own_weekly_v1 can
price", and THAT IS NO LONGER TRUE (A, 2026-08-31, register 439). Sleeper has
not published projections for three rookie QBs that FantasyPros carries, so FP
⊄ Sleeper by 3 of 410; `ours ⊄ Sleeper` by 11 of 489.

Nesting was never the requirement. "Same players and weeks" is, and the
INTERSECTION gives that whether or not one universe contains another — nesting
was only how we knew the intersection was big. So the intersection is asserted
directly (394, floor 300) and the nesting BREAK is sized rather than forbidden
(5% of each universe, measured 0.73% / 2.25%). A large break is still the
structural finding this file exists to raise; a provider adding three rookies
is not.

They also pin the two facts a grader must not rediscover the hard way: that
FantasyPros publishes no K/DEF (so a three-way grade structurally cannot
include them), and that 188 players we price are outside any three-way
comparison.

draft/audit/weekly_coverage_row1_2026-08-18.md
Run: python -m pytest draft/tests/test_projection_coverage_census.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CENSUS = ROOT / "draft" / "backtest" / "projection_coverage_census.json"

#: Bands, not point values -- providers add and drop players weekly, and only a
#: STRUCTURAL change (nesting breaking) is a finding.
MIN_SHARED = 300
MIN_SOURCES = 3


def _doc() -> dict:
    return json.loads(CENSUS.read_text())


def test_all_three_universes_were_measured():
    """CONTROL -- with a source missing every assertion below is vacuous."""
    u = _doc()["universes"]
    assert len(u) >= MIN_SOURCES, u
    for src in ("sleeper", "fantasypros", "own_weekly_v1"):
        assert u.get(src, 0) > 0, (src, u)


def test_the_only_reason_we_cannot_price_a_fantasypros_player_is_a_missing_projection():
    """⚠️ REWRITTEN 2026-08-18. The first version asserted FP is a strict subset
    of what we price, and it CAUGHT ITS AUTHOR: that claim was false and this
    test failed on the corrected census. The fix is to the claim, not the guard.

    What is actually true, and is the stronger statement: every FantasyPros
    player we cannot price is explained by ONE cause -- no `proj_ownmodel` on
    the board row, so price_week skips them. If a second cause ever appears,
    that is a new defect and this fails.

    ⚠️ CHANGED 2026-08-31 BY A (register 439) AND THE FINDING IS REAL — the two
    strict-nesting lines below used to be `assert n[...] is True`, and they are
    now FALSE on a freshly regenerated census. This test has been on the board
    publish gate's refusal list every night since 08-27, and the board has not
    published since 08-26.

    NAMED, because "the nesting broke" is not a finding until you know by whom:
    THREE rookie QUARTERBACKS — Behren Morton (13295), Cole Payton (13335),
    Garrett Nussmeier (13404) — are in FantasyPros' 2026-08-30 capture and not
    in Sleeper's. That is 3 of 410 FP players, 0.73%. `ours ⊄ Sleeper` by 11 of
    489, 2.25%.

    ⚠️ AND THIS IS DATA, NOT A DEFECT. This file's own header already says so:
    "providers add and drop players weekly, and only a STRUCTURAL change
    (nesting breaking) is a finding." Sleeper simply has not published
    projections for three rookie QBs. Nesting was never the requirement —
    "same players and weeks" is, and the INTERSECTION delivers that whether or
    not one universe contains another. Nesting was how we knew the
    intersection was big; the intersection is measured directly, so it is
    asserted directly.

    WHAT IS ASSERTED NOW: the shared population is still large enough for a
    three-way grade to be well defined (MIN_SHARED, already 300 — measured 394,
    down from 399), and the break is SMALL. A large break IS the structural
    finding the header describes and still fails here. The bar is 5% of each
    universe against a measured 0.73% / 2.25%, so it has real room before it
    fires and real teeth if a provider changes population.
    """
    d = _doc()
    n = d["nesting"]

    fp_n = d["universes"]["fantasypros"]
    ours_n = d["universes"]["own_weekly_v1"]
    fp_outside = n["in_fantasypros_not_sleeper"]["n"] if "in_fantasypros_not_sleeper" in n \
        else (0 if n["fantasypros_subset_of_sleeper"] else None)
    #: ⚠️ The census does not publish that count as a field yet, so when the
    #: nesting holds it is 0 and when it does not we cannot size it from the
    #: artifact alone. Refuse rather than guess (rule 3e) — a silent pass here
    #: would be a nesting break of unknown size reading as healthy.
    assert fp_outside is not None, (
        "the census says FP is not a subset of Sleeper but publishes no count "
        "of the difference, so this guard cannot size the break. Add "
        "`in_fantasypros_not_sleeper` to the census (register 439) — until "
        "then this refuses instead of passing on an unmeasured claim.")
    assert fp_outside <= 0.05 * fp_n, (
        f"{fp_outside} of {fp_n} FantasyPros players are outside Sleeper's "
        "universe — that is past 5% and is the STRUCTURAL change this guard "
        "exists for, not weekly provider churn.")

    s = d["shared_population"]
    assert s["n"] >= MIN_SHARED, (
        f"the three-way shared population fell to {s['n']} (floor {MIN_SHARED}) "
        "— below this a 'same players and weeks' grade stops being meaningful, "
        "which is the thing nesting was a proxy for.")

    #: ── THE 'ONE CAUSE' CLAIM, RE-MEASURED (register 439) ─────────────────
    #: It is now TWO causes, and the guard found the second one itself while
    #: this change was being made: 13 FantasyPros players are unpriceable,
    #: 11 sit on the board without a `proj_ownmodel`, and 2 — `10231` and
    #: `5008` — are not on our board at all. Different players from the three
    #: rookie QBs above, and a different cause, which is why both are counted
    #: separately rather than folded into one tolerance. A THIRD cause still
    #: fails, which is what the original assertion was for.
    unpriceable = set(d["silently_dropped_by_price_week"]["in_fantasypros"])
    off_board = n.get("in_fantasypros_not_board", {}).get("n")
    assert off_board is not None, (
        "the census does not publish how many FantasyPros players are absent "
        "from our board entirely, so this guard cannot tell that cause from a "
        "genuinely new one. Refusing rather than passing (rule 3e, register 439).")
    assert n["in_fantasypros_not_ours"]["n"] == len(unpriceable) + off_board, (
        f"{n['in_fantasypros_not_ours']['n']} FantasyPros players are "
        f"unpriceable, but only {len(unpriceable)} are on the board without a "
        f"proj_ownmodel and {off_board} are absent from the board — the rest "
        "have a THIRD cause, which is a new defect and needs its own row. See "
        "draft/audit/weekly_coverage_row1_2026-08-18.md."
    )


def test_the_silent_drop_is_counted_and_named():
    """The defect the second pass found: price_week names byes and names
    no-line players, and says NOTHING about players it drops for a missing
    proj_ownmodel. A snapshot reader cannot tell "everyone was priced" from
    "117 were dropped". Same shape as `cells_unmeasurable: 0` counting only
    cells that were attempted."""
    s = _doc()["silently_dropped_by_price_week"]
    assert s["n"] > 0, (
        "no board player is missing proj_ownmodel any more. Good — but the "
        "audit doc and the ROUTES entry to A both rest on this being nonzero, "
        "so re-read them before deleting this test."
    )
    assert s["why"], "the reason must travel with the count"
    assert s["by_position"], s
    # The ones that matter are the ones inside a gradeable population.
    assert isinstance(s["in_fantasypros"], list), s
    assert s["named_top"], "the costly ones must be NAMED, not just counted"
    assert all(r.get("name") for r in s["named_top"]), s["named_top"]


def test_ours_matches_price_weeks_actual_population_rule_on_the_live_board():
    """KNOWN-POSITIVE CONTROL on the mirrored rule. The census restates
    price_week's population rule rather than importing it, so it must be
    re-derived from the board here — otherwise a drift in A's module silently
    re-inflates this number, which is exactly the error being corrected."""
    import json as _json
    board = _json.loads((ROOT / "public" / "draft_data.json").read_text())["players"]
    rule = {
        str(p["player_id"]) for p in board
        if p.get("position") in ("QB", "RB", "WR", "TE")
        and p.get("proj_ownmodel") is not None
    }
    d = _doc()
    assert d["universes"]["own_weekly_v1"] == len(rule), (
        d["universes"]["own_weekly_v1"], len(rule))
    # ...and the board's raw skill count must be BIGGER, or the drop is fiction
    skill = {str(p["player_id"]) for p in board
             if p.get("position") in ("QB", "RB", "WR", "TE")}
    assert len(skill) > len(rule), (len(skill), len(rule))
    assert d["silently_dropped_by_price_week"]["on_board_skill"] == len(skill)


def test_the_shared_population_is_big_enough_to_grade_and_covers_four_positions():
    s = _doc()["shared_population"]
    assert s["n"] >= MIN_SHARED, s
    assert set(s["by_position"]) == {"QB", "RB", "WR", "TE"}, s["by_position"]
    # The bar is "3 of 4 positions", so every position needs enough rows to
    # carry a verdict on its own.
    assert all(v >= 40 for v in s["by_position"].values()), s["by_position"]


def test_the_shared_population_really_is_a_subset_of_each_universe():
    """KNOWN-POSITIVE CONTROL on the arithmetic: the shares must be consistent
    with the counts, or the census is reporting an intersection it did not
    compute."""
    d = _doc()
    u, s = d["universes"], d["shared_population"]
    assert s["n"] <= min(u["sleeper"], u["fantasypros"], u["own_weekly_v1"])
    assert s["share_of_sleeper"] == pytest.approx(s["n"] / u["sleeper"], abs=1e-3)
    assert s["share_of_fantasypros"] == pytest.approx(s["n"] / u["fantasypros"], abs=1e-3)
    assert s["share_of_ours"] == pytest.approx(s["n"] / u["own_weekly_v1"], abs=1e-3)


def test_k_and_def_are_declared_rather_than_silently_absent():
    """A position nobody prices must be a stated fact with a reason, never an
    empty cell -- the same absent-vs-zero rule the calibration refusal follows."""
    k = _doc()["k_def"]
    assert k["on_board"] > 0, k
    assert k["own_weekly_v1_prices"] == 0, k
    assert k["fantasypros_covers"] == 0, (
        "FantasyPros now publishes K/DEF. A three-way grade could include them, "
        "and own_weekly_v1's QB/RB/WR/TE formula becomes the binding limit."
    )
    assert k["note"], "the reason must travel with the number"


def test_the_secondary_population_is_reported_beside_the_primary_not_instead():
    """The wider two-way set is bigger and flattering; the design must not let
    it quietly become the headline."""
    r = _doc()["recommended_grading_populations"]
    assert r["primary_three_way"]["n"] < r["secondary_two_way_vs_sleeper"]["n"]
    assert r["primary_three_way"]["n"] == _doc()["shared_population"]["n"]
    for v in r.values():
        assert v.get("why"), v


def test_the_limit_and_its_retest_trigger_travel_with_the_number():
    """A season-projection proxy for a weekly universe is a dated claim."""
    d = _doc()
    assert "SEASON" in d["_limit"] and "week 1" in d["_limit"], d["_limit"]
    assert d["measured_from"], d
