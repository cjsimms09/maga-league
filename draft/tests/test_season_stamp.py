# TERRITORY: C
"""SEASON STAMPS AT INGEST — the gate against last season reaching this year's board.

Cory, 2026-08-13, HIGH: a player drafted high in 2025 may go late or undrafted in
2026, so any field carrying a prior-season value into a 2026 recommendation is a
silent, plausible-looking error. C stamps at ingest; A builds the refusal in
projections.py. Cory's clarification: *"unless that data IS considered relevant to
this year — the goal is to make sure we are operating off current years projections,
ADPs, and data."*

THAT CLARIFICATION IS WHY THE STAMP HAS THREE VALUES AND NOT TWO. A two-state
stamp forces a lie on the largest group of fields. Sleeper serves `age`,
`years_exp`, `injury_status`, `depth_chart_order` and `team` with no season attached
at all — they are LIVE STATE, correct for 2026 by construction, and there is nothing
in the payload that proves it. Stamping them `2026` would be an assertion dressed as
a measurement, which is the exact failure this program keeps finding. So:

    2026      proven from a season-scoped source (the year was in the request)
    current   live state, no season in the payload, correct by construction
    <year>    explicitly historical, and must say so

A's refusal then rejects any sub-target year that is not declared historical, and
cannot be fooled by a field claiming `2026` that nothing verified.

AND AN UNSTAMPED FIELD IS A VIOLATION, NOT A PASS. That is the whole design: a gate
whose default is "fine" only catches the fields somebody remembered to mark, which
are never the ones that bite.

Run: python3 -m pytest draft/tests/test_season_stamp.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import season_stamp as SS  # noqa: E402


# ── the stamp itself ────────────────────────────────────────────────────────
def test_a_SEASON_SCOPED_source_stamps_the_YEAR_it_was_requested_for():
    """MFL's ADP export is year-scoped, so the stamp is the request parameter — a
    fact, not an inference. MUTATION: stamp the CURRENT year regardless — a 2025
    export relabels itself 2026 and the gate waves it through."""
    r = SS.stamp({"adp": 12.4}, {"adp": SS.seasonal(2025)})
    assert r["adp_season"] == 2025


def test_LIVE_STATE_stamps_current_rather_than_asserting_a_YEAR():
    """`age` and `injury_status` arrive with no season in the payload. MUTATION:
    stamp them with the target year — the board then claims every Sleeper field was
    verified as 2026 when nothing verified anything, and the gate goes green on the
    largest group of unproven fields."""
    r = SS.stamp({"age": 27, "injury_status": "IR"},
                 {"age": SS.CURRENT_STATE, "injury_status": SS.CURRENT_STATE})
    assert r["age_season"] == SS.CURRENT and r["injury_status_season"] == SS.CURRENT


def test_a_HISTORICAL_field_must_DECLARE_itself():
    """Prior-season production is legitimate input — walk_forward is built on it.
    MUTATION: treat any past year as a violation — the projection's own inputs
    become illegal and the gate blocks the thing it was built to protect."""
    r = SS.stamp({"prior_points": 210.0}, {"prior_points": SS.historical(2025)})
    assert r["prior_points_season"] == 2025
    assert r["prior_points_historical"] is True


# ── the gate ────────────────────────────────────────────────────────────────
def test_an_UNSTAMPED_field_is_a_VIOLATION_not_a_pass():
    """THE WHOLE DESIGN. A gate whose default is 'fine' only catches fields somebody
    remembered to mark, which are never the ones that bite. MUTATION: skip fields
    with no stamp — a newly added ingest field is exempt on the day it lands."""
    v = SS.violations([{"player_id": "1", "adp": 12.4}], 2026, fields=("adp",))
    assert len(v) == 1 and "unstamped" in v[0]["why"]


def test_a_SUB_TARGET_year_that_is_NOT_declared_historical_is_a_VIOLATION():
    """The defect Cory named, in one row: a 2025 ADP riding into a 2026
    recommendation. MUTATION: compare only when the stamp is present and equal —
    2025 passes as 'stamped', which is the silent plausible error itself."""
    row = SS.stamp({"player_id": "1", "adp": 12.4}, {"adp": SS.seasonal(2025)})
    v = SS.violations([row], 2026, fields=("adp",))
    assert len(v) == 1
    assert "2025" in v[0]["why"] and "historical" in v[0]["why"].lower()


def test_a_DECLARED_HISTORICAL_field_is_allowed_through():
    row = SS.stamp({"player_id": "1", "prior_points": 210.0},
                   {"prior_points": SS.historical(2025)})
    assert SS.violations([row], 2026, fields=("prior_points",)) == []


def test_CURRENT_is_allowed_and_is_NOT_silently_upgraded_to_the_target_year():
    """`current` must stay distinguishable from a proven 2026 forever — otherwise
    the gate cannot ever be tightened, because nothing records which fields were
    verified. MUTATION: normalise current to the target year on the way in."""
    row = SS.stamp({"player_id": "1", "age": 27}, {"age": SS.CURRENT_STATE})
    assert SS.violations([row], 2026, fields=("age",)) == []
    assert row["age_season"] == SS.CURRENT, "still 'current', not 2026"


def test_an_EMPTY_BOARD_is_UNCOUNTED_rather_than_clean(capsys=None):
    """Rule 13f. MUTATION: return [] for an empty board — the gate reports clean on
    the day the artifact fails to build, which is the day it must shout."""
    rep = SS.report([], 2026, fields=("adp",))
    assert rep["status"] == "uncounted"
    assert rep["ok"] is False


def test_the_report_COUNTS_each_kind_so_a_gate_can_state_its_denominator():
    rows = [SS.stamp({"player_id": "1", "adp": 1.0, "age": 27},
                     {"adp": SS.seasonal(2026), "age": SS.CURRENT_STATE}),
            SS.stamp({"player_id": "2", "adp": 2.0, "age": 28},
                     {"adp": SS.seasonal(2025), "age": SS.CURRENT_STATE})]
    rep = SS.report(rows, 2026, fields=("adp", "age"))
    assert rep["rows"] == 2 and rep["checked"] == 4
    assert rep["by_kind"]["proven"] == 1
    assert rep["by_kind"]["current"] == 2
    assert rep["violations"] == 1 and rep["ok"] is False


# ── the board field map, so A's refusal has something to declare against ────
def test_EVERY_BOARD_FIELD_IS_CLASSIFIED_and_an_unknown_one_is_a_violation():
    """A map with a hole is worse than no map: the gate goes green on exactly the
    field nobody thought about, which is always the one added last week.
    MUTATION: return `current` for anything unmapped — a new ingest field is exempt
    on the day it lands, silently."""
    import json
    board = json.load(open("public/draft_data.json"))["players"]
    # THE POSITIVE CASE FIRST, and its absence let a mutation live. Asserting only
    # "no problems found" passes for a function that can never find one — the same
    # vacuous shape this program keeps catching, here in my own test.
    planted = SS.unclassified_fields(dict(board[0], a_field_nobody_declared=1))
    assert planted == ["a_field_nobody_declared"], (
        "the detector must be able to FIND an undeclared field, or the assertion "
        "below is satisfied by a function that always returns []")

    # AND IT SCANS EVERY PLAYER, not board[0]. A field that appears on SOME rows —
    # only on keepers, only on players with a bye, only where a fetch succeeded — is
    # invisible to a one-row sample, and partial population is the normal shape of
    # this board rather than an edge case. Same sample-cut error I made twice today
    # in the ingest work, so the plant goes on a LATE row: a board[0]-only scan
    # cannot find it and the assertion below would pass while checking one row.
    # AND THE PLANT GOES THROUGH THE SCAN, not past it. My first version called
    # `unclassified_fields` on a late row DIRECTLY, which proves the DETECTOR works
    # and says nothing about the SCAN's reach — I then mutated the scan back to
    # `board[0]` and the test still passed. Every field happens to be present on
    # every row today, so a one-row scan is right by luck, and a test that is right
    # by luck reports nothing on the day the luck changes.
    scan = lambda rows: sorted({f for r in rows for f in SS.unclassified_fields(r)})
    probe = list(board[:-1]) + [dict(board[-1], only_on_one_late_row=1)]
    assert scan(probe) == ["only_on_one_late_row"], (
        "the SCAN must reach the LAST row — board[0] alone cannot see a field that "
        "only some players carry, which is the normal shape of this board")

    unknown = scan(board)
    assert unknown == [], (
        "board fields with no declared provenance: %s — classify them in "
        "BOARD_FIELD_SOURCES or the gate cannot see them" % unknown)
    assert len(board) > 1, "a one-row board makes the scan above vacuous"


def test_the_PROJECTION_field_is_RUNTIME_DETERMINED_not_statically_2026():
    """THE ONE THAT MATTERS FOR CORY'S GATE. `build.py:340` falls back to the PRIOR
    SEASON'S ACTUALS as the projection baseline when fewer than
    PROJECTION_MIN_NONZERO of this year's projections carry points. So `proj_baseline`
    is 2026-seasonal or 2025-historical depending on a runtime branch, and only
    `PROJECTION_PROVENANCE.source` says which.

    MUTATION: declare it statically seasonal(2026) — a board running on last
    season's actuals stamps itself 2026 and passes the gate built to catch exactly
    that."""
    live = {"projections": {"source": "sleeper_projections", "season": "2026"}}
    fell_back = {"projections": {"source": "sleeper_stats_2025", "season": "2026"}}
    assert SS.projection_source(live, 2026) == SS.seasonal(2026)
    assert SS.projection_source(fell_back, 2026) == SS.historical(2025)


def test_an_UNRECOGNISED_projection_source_REFUSES_rather_than_assuming_current():
    """MUTATION: default to seasonal(target) — a source nobody has seen before is
    treated as this year's, which is the assumption the whole gate exists to remove."""
    try:
        SS.projection_source({"projections": {"source": "something_new"}}, 2026)
    except ValueError as e:
        assert "something_new" in str(e)
    else:
        raise AssertionError("an unknown projection source must refuse")


def test_a_BLENDED_field_carries_EVERY_season_it_blends():
    """FOUND BY VERIFYING RATHER THAN BY READING THE CODE. I classified the usage
    fields `historical` and checked it against the artifact: the board carries 509
    players with a target_share and my 2025-only computation produced 509 — the same
    population — but only 5% of the VALUES matched, and the board's range was
    narrower (0.0010-0.3160 vs 0.0014-0.3481). That is a blend compressing the
    extremes, not a single season. `build.py:678` confirms it:
    `opportunity_metrics(pbp, weekly, [2025, 2024], recency_weights [0.7, 0.3])`.

    A single-year stamp cannot say that. `historical(2025)` hides the 2024
    component; `historical(2024)` misstates the dominant one.

    MUTATION: keep only the first year — a blend reaching back further than anyone
    declared passes as though it were one season old."""
    r = SS.stamp({"target_share": 0.21}, {"target_share": SS.historical(2025, 2024)})
    assert r["target_share_season"] == [2025, 2024]
    assert r["target_share_historical"] is True


def test_a_BLEND_is_judged_on_its_OLDEST_component():
    """If a 2024 value is unacceptable on a 2026 board, a blend CONTAINING 2024 is
    too — the newest component cannot launder the oldest. MUTATION: judge on the
    first/dominant year and a blend reaching back to 2019 reads as 2025."""
    row = SS.stamp({"player_id": "1", "x": 1.0}, {"x": SS.historical(2025, 2024)})
    assert SS.violations([row], 2026, fields=("x",)) == [], "declared, so allowed"
    rep = SS.report([row], 2026, fields=("x",))
    assert rep["by_kind"]["historical"] == 1
    assert SS.oldest_season(row, "x") == 2024


def test_a_DERIVED_field_INHERITS_the_reach_of_every_input():
    """FOLLOWING MY OWN FLAG. I warned that other entries in the map might be blends
    and then checked, and the biggest field on the board is one.

    `projections.blend`: `mean_proj = base * (1 + adj)`, where `adj` is a function of
    `composite_z(metrics, ...)` and `metrics` is the [2025, 2024] usage blend. So
    proj_mean is a 2026 projection MODULATED BY prior-season usage — it reaches back
    to 2024 on every path, including the one where the base is a clean 2026 fetch.

    `derived` cannot say that. A derived field is exactly as current as its
    furthest-back input, and the stamp has to carry the union.

    MUTATION: keep only the first input's seasons — proj_mean reads as clean 2026 and
    the gate passes the single most consequential field on the board."""
    src = SS.derive(SS.seasonal(2026), SS.historical(2025, 2024))
    row = SS.stamp({"player_id": "1", "proj_mean": 210.0}, {"proj_mean": src})
    assert SS.oldest_season(row, "proj_mean") == 2024
    assert row["proj_mean_historical"] is True, (
        "it draws on prior seasons, so it must declare itself historical or the "
        "gate treats a blended field as a proven one")
    assert SS.violations([row], 2026, fields=("proj_mean",)) == [], "declared"


def test_derive_of_only_CURRENT_inputs_stays_current():
    """A derivation over live state is still live state — it must not acquire a
    spurious year. MUTATION: collapse current to the target season and the record of
    what was verified is destroyed one layer down."""
    src = SS.derive(SS.CURRENT_STATE, SS.CURRENT_STATE)
    row = SS.stamp({"player_id": "1", "x": 1.0}, {"x": src})
    assert row["x_season"] == SS.CURRENT
    assert SS.violations([row], 2026, fields=("x",)) == []
