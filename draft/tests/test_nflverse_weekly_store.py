# TERRITORY: C
"""THE WEEKLY REALIZED-POINTS STORE — the outcome half of learning.

`component-grading-live` and `ledger-to-gate-path` are both unmet and stay unmet
without this (A, 2026-08-13). The DATA is not the gap — `build_bundle.build()` already
receives `weekly_df`. The gap is a STAMPED, APPEND-ONLY record: which weeks, scored
under which scoring table, at which commit, so a January grade is REPRODUCIBLE rather
than re-derived against whatever the table says by then.

THE GUARD THIS FILE IS SHAPED AROUND, and it is not D3's. An ADP snapshot is a fact
about a day. A points total is a fact about a day AND A RULE SET. Our scoring table is
config: `pass_td` could move from 6 to 4 tomorrow. Two weeks scored under two tables,
summed, produce a season total that never existed under either — and nothing in the
arithmetic would complain.

Run: python3 -m pytest draft/tests/test_nflverse_weekly_store.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_weekly_store as W  # noqa: E402

SCORING = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "pass_td": 6.0}
SCORING_4PT = dict(SCORING, pass_td=4.0)


def pts(**kw):
    return dict({"s1": 10.0, "s2": 20.0}, **kw)


# ── append, dedupe, and the span ────────────────────────────────────────────
def test_a_re_run_of_ONE_WEEK_replaces_rather_than_doubling():
    """A retried job must not create two rows for one week and leave a season total
    silently doubled. MUTATION: drop the dedupe — every retry inflates the season."""
    s = W.append_week([], 2026, 1, pts(), SCORING)
    s = W.append_week(s, 2026, 1, pts(s1=11.0), SCORING)
    assert len(s) == 1 and s[0]["points"]["s1"] == 11.0


def test_weeks_are_kept_in_order_and_coverage_NAMES_THE_MISSING_ONES():
    """A season with a hole reads as complete on any count of rows. MUTATION: report
    `weeks: 3` and stop — a grader sums three weeks and calls it a season."""
    s = W.append_week([], 2026, 1, pts(), SCORING)
    s = W.append_week(s, 2026, 3, pts(), SCORING)
    cov = W.coverage(s, 2026)
    assert cov["weeks"] == 2 and cov["first"] == 1 and cov["last"] == 3
    assert cov["missing"] == [2], cov
    assert cov["complete"] is False


# ── THE SCORING-TABLE GUARD, which is the point of this module ─────────────
def test_a_WEEK_SCORED_UNDER_A_DIFFERENT_TABLE_IS_REFUSED():
    """THE DEFECT THIS EXISTS FOR. `pass_td` moving 6 -> 4 is a config edit, not a
    code change, and nothing downstream would notice. Two weeks under two tables sum
    to a season total that never existed under either. MUTATION: store it anyway and
    let the fingerprints differ silently."""
    s = W.append_week([], 2026, 1, pts(), SCORING)
    try:
        W.append_week(s, 2026, 2, pts(), SCORING_4PT)
    except ValueError as e:
        assert "scoring" in str(e).lower()
        assert W.scoring_fingerprint(SCORING) in str(e) or "fingerprint" in str(e).lower()
    else:
        raise AssertionError("a second scoring table must be refused, not mixed in")


def test_the_fingerprint_is_STABLE_under_key_order_and_float_noise():
    """A fingerprint that changes when the dict is rebuilt would refuse every legitimate
    week. MUTATION: hash `str(dict)` — key order flips and the store locks itself out."""
    a = {"rec": 0.5, "pass_td": 6.0}
    b = {"pass_td": 6.0, "rec": 0.5}
    assert W.scoring_fingerprint(a) == W.scoring_fingerprint(b)
    assert W.scoring_fingerprint(a) != W.scoring_fingerprint({"rec": 1.0, "pass_td": 6.0})


def test_the_table_ITSELF_is_stored_not_only_its_hash():
    """A hash proves two weeks agree; it cannot say WHAT they agreed on. In January the
    table may have moved on and the grade needs the rules it was scored under.
    MUTATION: keep the fingerprint alone — the record becomes unauditable."""
    s = W.append_week([], 2026, 1, pts(), SCORING)
    assert s[0]["scoring"] == SCORING


# ── absent is not zero ─────────────────────────────────────────────────────
def test_a_WEEK_WITH_NO_ROWS_IS_REFUSED_not_stored_as_zeros():
    """A fetch that returned nothing is not a week in which nobody scored. Storing it
    puts a dated empty week in an append-only record and a grader averages it in.
    MUTATION: accept `{}` — the season quietly gains a zero."""
    try:
        W.append_week([], 2026, 1, {}, SCORING)
    except ValueError as e:
        assert "empty" in str(e).lower() or "zero" in str(e).lower()
    else:
        raise AssertionError("an empty week must be refused")


def test_a_player_who_genuinely_scored_zero_IS_kept():
    """The other side of the same line — a real 0.0 is a measurement."""
    s = W.append_week([], 2026, 1, {"s1": 0.0, "s2": 12.0}, SCORING)
    assert s[0]["points"]["s1"] == 0.0 and s[0]["row_count"] == 2


# ── the record travels with its own population (rule 14 + Cory's rule) ─────
def test_save_records_POPULATION_AND_COVERAGE_beside_the_weeks(tmp_path):
    """A durable record carries its own field population — Cory's standing rule. And
    coverage, because a week that was never captured contributes no row to be counted
    as empty, so a holed season scores 100% on every field."""
    p = tmp_path / "w.json"
    s = W.append_week([], 2026, 1, pts(), SCORING)
    s = W.append_week(s, 2026, 3, pts(), SCORING)
    W.save(s, path=str(p))
    d = json.loads(p.read_text())
    assert set(d) >= {"weeks", "population", "coverage"}
    assert d["coverage"]["2026"]["missing"] == [2]
    assert d["population"]["fields"]["points"]["present"] == 2


def test_the_reader_exists_with_the_writer(tmp_path):
    """Rule 14. A season total is what every grade actually consumes, so it ships now
    rather than being re-derived by each caller."""
    p = tmp_path / "w.json"
    s = W.append_week([], 2026, 1, {"s1": 10.0}, SCORING)
    s = W.append_week(s, 2026, 2, {"s1": 5.0, "s2": 7.0}, SCORING)
    W.save(s, path=str(p))
    tot = W.season_totals(W.load(str(p)), 2026)
    assert tot["s1"] == 15.0 and tot["s2"] == 7.0


# ── THE PRODUCER, because a store nothing fills is a container ──────────────
def frame(rows):
    """A real DataFrame, or SKIP — CI installs pyyaml and pytest only.

    THE DEFECT THIS CLOSES WAS MINE, and it blocked every lane's integration for
    hours: these three tests imported pandas, ci.yml does not install it, so the
    Python suite was red on main and integrate.sh gates on it. It passed locally
    because this container happens to have pandas, which is exactly why "green on my
    machine" is not evidence about CI. (A found it; I had twice reported the red as
    somebody else's.)

    NOT FAKED. `grade.weekly_points_table` does `df[df["season"] == season]` and
    `df.to_dict("records")` — a stub would have to reimplement pandas' boolean
    masking, which is the re-derivation trap this module exists to avoid elsewhere.
    So the real frame or nothing.

    AND A SKIP IS NOT A PASS. Skipping these leaves `ingest_season` — the producer —
    unexercised in CI, covered only where pandas happens to exist. The honest fix is
    pandas in ci.yml; that file is shared and the cost is A's call, so this is the
    unblocking move and the coverage hole is stated rather than hidden.
    """
    pd = pytest.importorskip(
        "pandas", reason="pandas absent (ci.yml installs pyyaml + pytest only); "
                         "ingest_season goes UNTESTED here, not proven correct")
    return pd.DataFrame(rows)


def wkrow(gsis, season, week, rec=0, rec_yd=0.0):
    return {"player_id": gsis, "season": season, "week": week,
            "receptions": rec, "receiving_yards": rec_yd}


def test_ingest_DELEGATES_to_the_graded_scoring_path_not_a_second_one():
    """The store must hold the same numbers `grade.py` produces, or a January grade
    disagrees with the replay it is grading. MUTATION: map nflverse columns here
    instead of calling `weekly_points_table` — a second mapper drifts from the first
    the moment nflverse renames a column, and BOTH keep returning valid floats."""
    import grade as GR
    df = frame([wkrow("g1", 2026, 1, rec=10, rec_yd=100),
                wkrow("g1", 2026, 2, rec=2, rec_yd=20)])
    cw = {"g1": "s1"}
    s = W.ingest_season([], df, 2026, SCORING, cw)
    ref = GR.weekly_points_table(df, 2026, SCORING, cw)
    assert len(s) == 2
    assert {w["week"]: w["points"] for w in s} == {k: v for k, v in ref.items()}


def test_re_ingesting_a_season_DOES_NOT_DOUBLE_IT():
    """The normal case, not an exception: the job runs every week and re-reads weeks
    it already has. MUTATION: append blindly — every rerun inflates the season and
    the row counts stay internally consistent."""
    df = frame([wkrow("g1", 2026, 1, rec=10)])
    s = W.ingest_season([], df, 2026, SCORING, {"g1": "s1"})
    s = W.ingest_season(s, df, 2026, SCORING, {"g1": "s1"})
    assert len(s) == 1
    assert W.season_totals(s, 2026)["s1"] == 5.0


def test_a_season_WITH_NO_ROWS_stores_nothing_rather_than_empty_weeks():
    """An unplayed or unfetched season is absent, not eighteen weeks of zero.
    MUTATION: emit a row per week in range(1, 19) — the store gains a full season
    that never happened and `coverage.complete` goes True on it."""
    s = W.ingest_season([], frame([wkrow("g1", 2026, 1)]), 2025, SCORING, {"g1": "s1"})
    assert s == []
    assert W.coverage(s, 2025)["uncounted"] is True
    assert W.coverage(s, 2025)["complete"] is False


def test_season_totals_can_be_CUT_AT_THE_LEAGUES_SCORED_BOUNDARY():
    """THE DEFECT I PARKED FOR A AND THEN WROTE MYSELF.

    `league_history` says `last_scored_leg = 17` in every season: weeks 18-22 score
    nothing for anybody in this league. The STORE should still hold them — what
    happened is what happened, and baking a league's boundary into an archive makes
    the archive league-specific forever. But `season_totals` summing all 22 weeks
    hands a grader a playoff-inflated total with nothing saying so, which is exactly
    the finding I routed to A about `rest_of_season_points` having a `from_week` and
    no `to_week`.

    So the cut is the CONSUMER's, and it is available. MUTATION: ignore
    through_week — every season total silently gains five weeks nobody scored."""
    s = W.append_week([], 2026, 17, {"s1": 10.0}, SCORING)
    s = W.append_week(s, 2026, 18, {"s1": 4.0}, SCORING)
    s = W.append_week(s, 2026, 22, {"s1": 6.0}, SCORING)
    assert W.season_totals(s, 2026)["s1"] == 20.0, "the store holds what happened"
    assert W.season_totals(s, 2026, through_week=17)["s1"] == 10.0
