"""F3 — the weekly series, and the four ways a hole in it looks like a number.

Every failure this file guards against produces a plausible score rather than an
error, which is why each one is asserted with its ARITHMETIC STATED rather than
with a "matches" assertion:

  1. a scoring term we cannot translate, silently dropped   -> QB scores 20 not 18
  2. a drafted player with no weekly rows, scored as zero   -> a real 0.0 outcome
     and a missing one become the same number
  3. banded scoring flattened to one multiplier             -> points nobody scored
  4. a range's upper bound assumed rather than checked      -> the same, at the top
     of the distribution where the expensive players live

Run: python3 -m pytest draft/tests/test_external_outcomes.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_outcomes as X  # noqa: E402
import grade as GR  # noqa: E402


# ── fixtures in MFL's actual shape ($t-wrapped, positions pipe-delimited) ────
def rule(event, points, rng="0-99"):
    r = {"event": {"$t": event}, "points": {"$t": points}}
    if rng is not None:
        r["range"] = {"$t": rng}
    return r


def rules(blocks):
    """blocks: [(positions_string, [rule, ...])]"""
    return {"version": "1.0", "rules": {"positionRules": [
        {"positions": {"$t": pos}, "rule": rs} for pos, rs in blocks]}}


# The half-PPR-ish table our own league uses, expressed the way MFL expresses it.
# Receiving yards get a range wide enough for a real week (999); receptions keep
# MFL's common "0-99", which IS unbounded for receptions and is not for yards.
FULL = [
    ("QB", [rule("PY", "*0.04", "0-999"), rule("#P", "*4"), rule("IN", "*-2"),
            rule("RY", "*0.1", "0-999"), rule("#R", "*6"), rule("FL", "*-2")]),
    ("RB|WR|TE", [rule("CC", "*0.5"), rule("CY", "*0.1", "0-999"), rule("#C", "*6"),
                  rule("RY", "*0.1", "0-999"), rule("#R", "*6"), rule("FL", "*-2")]),
]


def wk(pid, week, **stats):
    """One nflverse weekly row, in nflverse's OWN column vocabulary.

    `season_type` is here because the real tables carry it and pool REG with POST
    (2024: 5,340 + 257; 2025: 18,539 + 882, weeks running to 22). A fixture without
    it would let the postseason filter pass untested against a shape the live path
    never sees."""
    row = {"player_id": pid, "season": 2025, "week": week, "season_type": "REG"}
    # EVERY mapped column, defaulting to 0 — which is what a real nflverse row is.
    # A fixture carrying only the columns a test cares about would let the D5f
    # schema check pass on a shape the live path never serves, and D5f exists
    # BECAUSE a loader renamed one of these (`interceptions` ->
    # `passing_interceptions` in nflreadpy). Taken from the translator's own maps
    # so a column added there appears here without an edit.
    for c in list(GR._WEEKLY_MAP) + list(GR._FUM_LOST_COLS):
        row.setdefault(c, 0)
    row.update(stats)
    return row


# ── the tables ──────────────────────────────────────────────────────────────
def test_a_leagues_rules_become_ONE_FLAT_TABLE_PER_POSITION():
    tables, bad, ignored, bounds = X.scoring_tables(rules(FULL))
    assert not bad, bad
    assert tables["WR"]["rec"] == 0.5 and tables["WR"]["rec_yd"] == 0.1
    assert tables["QB"]["pass_yd"] == 0.04 and tables["QB"]["pass_int"] == -2.0
    # "RB|WR|TE" is one block and must expand to three tables, not one keyed on
    # the literal string.
    assert set(tables) == {"QB", "RB", "WR", "TE"}


def test_the_scoreable_vocabulary_is_DERIVED_from_the_shipped_translator():
    """Not a restated list. If `nflverse_weekly_to_scoring` stops emitting a key,
    this file must stop accepting rules for it in the same commit — a second copy
    of the vocabulary would let the two drift and score the missing key as zero."""
    assert X.SCOREABLE_KEYS == frozenset(GR._OUR_KEYS)
    assert set(X.EVENT_TO_KEY.values()) <= X.SCOREABLE_KEYS


# ── 1. THE UNTRANSLATABLE TERM, AND WHY DROPPING IT IS NOT A FLOOR ──────────
def test_an_UNTRANSLATABLE_term_makes_the_LEAGUE_unscoreable():
    """MUTATION: skip the unknown event instead of recording it. The league would
    be scored under a table missing that term and nothing would say so."""
    r = rules([("QB", [rule("PY", "*0.04", "0-999"), rule("TGT", "*0.5")]),
               ("RB|WR|TE", [rule("CC", "*0.5")])])
    tables, bad, _ignored, _b = X.scoring_tables(r)
    assert "QB" in bad and any(x["event"] == "TGT" for x in bad["QB"])
    assert "QB" not in tables, "a PARTIAL table is the object D5b exists to refuse"


def test_dropping_a_NEGATIVE_term_would_OVERSTATE_not_understate():
    """THE ARITHMETIC, STATED. A QB week of 300 pass yards, 2 pass TD, 1 INT under
    0.04 / 4 / -2 scores 300x0.04=12.0 plus 2x4=8.0 minus 1x2=2.0 = 18.0.

    Silently dropping the interception term gives 20.0 — HIGHER. So an omitted
    term is not a floor with a caveat; it is a bias whose direction depends on the
    term's sign, which is why the league is refused rather than scored short."""
    tables, bad, _i, bounds = X.scoring_tables(rules(FULL))
    assert not bad
    row = wk("QB1", 1, passing_yards=300, passing_tds=2, interceptions=1)
    got = X.weekly_points([row], 2025, tables, {"QB1": "QB"}, {"QB1": "QB1"}, bounds)
    assert got["series"]["QB1"][1] == 18.0
    without = dict(tables["QB"]); without.pop("pass_int")
    assert X.weekly_points([row], 2025, {"QB": without}, {"QB1": "QB"},
                           {"QB1": "QB1"}, {})["series"]["QB1"][1] == 20.0


def test_rules_for_positions_we_do_NOT_grade_are_IGNORED_not_failures():
    """A league scoring sacks for its DEF is not a league we cannot score; it is a
    league whose DEF we never draft. Reported as ignored so "no untranslatable
    terms" cannot quietly mean "we never looked"."""
    r = rules(FULL + [("DEF", [rule("SK", "*1"), rule("IC", "*2")])])
    tables, bad, ignored, _b = X.scoring_tables(r)
    assert not bad and ignored == ["DEF"]
    assert set(tables) == {"QB", "RB", "WR", "TE"}


def test_a_league_with_NO_scoring_rules_says_so_per_position():
    _t, bad, _i, _b = X.scoring_tables({"error": "Error - No League Scoring Rules"})
    assert bad["WR"] == [{"why": "no_scoring_rules"}]


def test_a_graded_position_with_no_rules_at_all_is_NOT_a_zero_table():
    """MUTATION: leave the position out of `bad`. It would get an empty table,
    score every player 0.0, and read as a league where nobody produced."""
    tables, bad, _i, _b = X.scoring_tables(rules([("RB|WR|TE", [rule("CC", "*0.5")])]))
    assert "QB" in bad and bad["QB"] == [{"why": "no_rules_for_position"}]
    assert "QB" not in tables


# ── 3. BANDED SCORING IS NOT ONE MULTIPLIER ────────────────────────────────
def test_TWO_rules_for_one_event_is_BANDED_and_untranslatable():
    """MUTATION: keep the last rule (or the max, as the FILTER does). Either
    invents a per-unit rate the league never applied. The filter may flatten —
    excluding conservatively costs sample; a SCORER that flattens invents points."""
    r = rules([("QB", [rule("PY", "*0.04", "0-299"), rule("PY", "*0.05", "300-999")]),
               ("RB|WR|TE", [rule("CC", "*0.5")])])
    _t, bad, _i, _b = X.scoring_tables(r)
    assert any(x["why"] == "banded" and x["n"] == 2 for x in bad["QB"])


def test_a_range_that_does_NOT_start_at_zero_is_a_THRESHOLD_bonus():
    """"100-999" on receiving yards is +x per yard ABOVE 100, not per yard. Applied
    as a multiplier it would pay the bonus on the first hundred as well."""
    r = rules([("QB", [rule("PY", "*0.04", "0-999")]),
               ("RB|WR|TE", [rule("CC", "*0.5"), rule("CY", "*0.1", "100-999")])])
    _t, bad, _i, _b = X.scoring_tables(r)
    assert any(x["why"] == "threshold" and x["lo"] == 100.0 for x in bad["WR"])


def test_an_UNREADABLE_range_is_not_read_as_unbounded():
    """MUTATION: return (0, None) when the range will not parse. An unreadable
    band would become "applies to everything" and a threshold bonus would be paid
    on every unit — absent coerced to a value, in the one place it pays out."""
    assert X._range("") == (0.0, None)
    assert X._range("0-99") == (0.0, 99.0)
    assert X._range("300+") == (300.0, None)
    assert X._range("banana") is None
    r = rules([("QB", [rule("PY", "*0.04", "banana")]), ("RB|WR|TE", [rule("CC", "*0.5")])])
    _t, bad, _i, _b = X.scoring_tables(r)
    assert any(x["why"] == "unreadable_range" for x in bad["QB"])


# ── 4. THE UPPER BOUND IS MEASURED AGAINST THE DATA, NOT ASSUMED ────────────
def test_a_week_that_EXCEEDS_a_rules_upper_bound_makes_the_league_unscoreable():
    """D5d. "0-99" is unbounded for receptions and is NOT for receiving yards, and
    the difference is not knowable from the rule — only from the season. A 120-yard
    week against a 0-99 rule is proof the rule did not cover that week, and it
    happens exactly where the expensive players are."""
    r = rules([("QB", [rule("PY", "*0.04", "0-999")]),
               ("RB|WR|TE", [rule("CC", "*0.5"), rule("CY", "*0.1", "0-99")])])
    tables, bad, _i, bounds = X.scoring_tables(r)
    assert not bad and bounds["WR"]["rec_yd"] == 99.0
    rows = [wk("W1", 1, receptions=5, receiving_yards=120)]
    got = X.weekly_points(rows, 2025, tables, {"W1": "WR"}, {"W1": "W1"}, bounds)
    assert got["exceeded"], "a 120-yard week under a 0-99 rule must be caught"
    assert got["exceeded"][0]["value"] == 120.0 and got["exceeded"][0]["hi"] == 99.0


def test_a_week_INSIDE_the_bound_raises_nothing():
    """A check that always fires is a check nobody can act on."""
    r = rules([("QB", [rule("PY", "*0.04", "0-999")]),
               ("RB|WR|TE", [rule("CC", "*0.5"), rule("CY", "*0.1", "0-99")])])
    tables, _b, _i, bounds = X.scoring_tables(r)
    got = X.weekly_points([wk("W1", 1, receptions=5, receiving_yards=80)], 2025,
                          tables, {"W1": "WR"}, {"W1": "W1"}, bounds)
    assert got["exceeded"] == []
    assert got["series"]["W1"][1] == 10.5           # 5x0.5=2.5 plus 80x0.1=8.0


# ── the series itself ───────────────────────────────────────────────────────
def test_the_series_is_PER_WEEK_and_scored_by_the_SHIPPED_engine():
    """5 rec x 0.5 = 2.5, 80 yd x 0.1 = 8.0, 1 TD x 6 = 6.0 -> 16.5 in week 1;
    week 2 is a separate entry, not folded into a season total."""
    tables, _b, _i, bounds = X.scoring_tables(rules(FULL))
    rows = [wk("W1", 1, receptions=5, receiving_yards=80, receiving_tds=1),
            wk("W1", 2, receptions=3, receiving_yards=20)]
    got = X.weekly_points(rows, 2025, tables, {"W1": "WR"}, {"W1": "W1"}, bounds)
    assert got["series"]["W1"] == {1: 16.5, 2: 3.5}   # 3x0.5=1.5 plus 20x0.1=2.0


def test_rows_from_ANOTHER_SEASON_are_not_pooled_into_this_one():
    tables, _b, _i, bounds = X.scoring_tables(rules(FULL))
    rows = [wk("W1", 1, receptions=5), dict(wk("W1", 1, receptions=5), season=2024)]
    got = X.weekly_points(rows, 2025, tables, {"W1": "WR"}, {"W1": "W1"}, bounds)
    assert got["series"]["W1"] == {1: 2.5}, "2024 leaked into 2025"


def test_a_player_whose_POSITION_we_do_not_know_is_counted_not_defaulted():
    """MUTATION: fall back to a WR table. It would score a QB's passing yards at a
    receiver's rates and never error."""
    tables, _b, _i, bounds = X.scoring_tables(rules(FULL))
    got = X.weekly_points([wk("X9", 1, receptions=5)], 2025, tables, {}, {"X9": "X9"}, bounds)
    assert got["series"] == {} and got["unknown_position"] == ["X9"]


def test_fumbles_arrive_SPLIT_across_columns_and_are_summed_once():
    """nflverse splits fumbles lost across rushing/receiving/sack columns; our key
    is one. The shipped translator already does this, and the point of the test is
    that this file uses IT rather than its own read of the same columns."""
    tables, _b, _i, bounds = X.scoring_tables(rules(FULL))
    row = wk("W1", 1, receptions=2, rushing_fumbles_lost=1, receiving_fumbles_lost=1)
    got = X.weekly_points([row], 2025, tables, {"W1": "WR"}, {"W1": "W1"}, bounds)
    # 2 receptions x 0.5 = 1.0; TWO fumbles lost (one rushing, one receiving)
    # x -2 = -4.0; total -3.0. A translator that read only one column gives -1.0.
    assert got["series"]["W1"][1] == -3.0


# ── 2. ABSENT IS NOT ZERO, AND ZERO IS NOT ABSENT ──────────────────────────
def test_a_drafted_player_with_NO_weekly_rows_is_DROPPED_AND_COUNTED():
    rep = X.f3_report(["A", "B", "C"], {"A": {1: 10.0}, "B": {1: 3.0}})
    assert rep["drafted_with_outcomes"] == 2 and rep["drafted_without_outcomes"] == 1
    assert rep["dropped_ids"] == ["C"] and rep["coverage"] == 0.6667


def test_a_player_who_PLAYED_AND_SCORED_ZERO_IS_KEPT():
    """THE BOUNDARY, and it is one `if` wide. MUTATION: `if not sum(wk.values())`.
    A real 0.0 week and a player who was never on an NFL field become the same
    number, and the one that is data gets thrown away with the one that is not."""
    rep = X.f3_report(["A", "Z"], {"A": {1: 10.0}, "Z": {1: 0.0, 2: 0.0}})
    assert rep["drafted_without_outcomes"] == 0
    assert rep["drafted_with_outcomes"] == 2 and rep["coverage"] == 1.0


def test_an_EMPTY_series_for_a_player_still_counts_as_absent():
    """The other side: a key present with no weeks is not an outcome."""
    rep = X.f3_report(["A"], {"A": {}})
    assert rep["drafted_without_outcomes"] == 1


def test_grading_no_players_reports_None_coverage_not_a_perfect_one():
    assert X.f3_report([], {})["coverage"] is None


# ── the league-level answer, and the F4 flag it decides ────────────────────
def _weekly():
    return [wk("W1", w, receptions=5, receiving_yards=80, receiving_tds=1) for w in (1, 2)] \
        + [wk("Q1", w, passing_yards=300, passing_tds=2, interceptions=1) for w in (1, 2)]


def test_a_clean_league_gets_has_weekly_outcomes_TRUE_and_a_reason_of_ok():
    out = X.league_outcomes(rules(FULL), ["W1", "Q1", "GONE"], _weekly(), 2025,
                            {"W1": "WR", "Q1": "QB"}, {"W1": "W1", "Q1": "Q1"})
    assert out["has_weekly_outcomes"] is True and out["reason"] == "ok"
    assert out["series"]["Q1"] == {1: 18.0, 2: 18.0}
    assert out["f3"]["drafted_without_outcomes"] == 1     # GONE never appears


def test_an_untranslatable_league_is_FALSE_with_a_REASON_never_a_bare_False():
    """The attrition seam again, one layer down: a False with no reason is a
    league excluded for something nobody can route."""
    r = rules([("QB", [rule("TGT", "*0.5")]), ("RB|WR|TE", [rule("CC", "*0.5")])])
    out = X.league_outcomes(r, ["W1"], _weekly(), 2025, {"W1": "WR"}, {"W1": "W1"})
    assert out["has_weekly_outcomes"] is False
    assert out["reason"].startswith("F4.scoring_untranslatable:")
    assert "TGT" in out["reason"]


def test_NO_WEEKLY_DATA_names_the_FETCH_not_the_league():
    """"This league has no outcomes" and "we fetched nothing for 2025" support
    opposite actions, and both leave a league unscored."""
    out = X.league_outcomes(rules(FULL), ["W1"], [], 2025, {"W1": "WR"}, {"W1": "W1"})
    assert out["reason"] == "F4.no_weekly_data:2025" and out["has_weekly_outcomes"] is False


def test_a_range_exceedance_STOPS_the_league_rather_than_scoring_it_anyway():
    r = rules([("QB", [rule("PY", "*0.04", "0-999")]),
               ("RB|WR|TE", [rule("CC", "*0.5"), rule("CY", "*0.1", "0-99")])])
    # A 120-yard week: inside the season, outside the rule that was supposed to
    # cover it. The 80-yard weeks in `_weekly()` are not — which is the point.
    big = _weekly() + [wk("W1", 3, receptions=6, receiving_yards=120)]
    out = X.league_outcomes(r, ["W1"], big, 2025, {"W1": "WR"}, {"W1": "W1"})
    assert out["has_weekly_outcomes"] is False
    assert out["reason"].startswith("F4.scoring_range_exceeded:WR.rec_yd=")
    assert out["series"] == {}
    assert X.league_outcomes(r, ["W1"], _weekly(), 2025, {"W1": "WR"},
                             {"W1": "W1"})["has_weekly_outcomes"] is True, \
        "the same league scores fine on weeks the rule DOES cover"


def test_every_false_path_carries_a_reason_code_the_registry_DECLARES():
    """Rule 14 in the small: the reason strings this module emits are consumed by
    `ingest_filters`, so an undeclared one would bin nowhere in the attrition
    report — which is exactly how `F4.fetch_failed` arrived undeclared before."""
    import ingest_filters as F
    for reason in ("F4.scoring_untranslatable:QB=event_TGT_untranslatable",
                   "F4.no_weekly_data:2025",
                   "F4.scoring_range_exceeded:WR.rec_yd=120>99"):
        assert F.is_classified(reason), reason
        assert F.is_unreadable(reason), "these are OUR pipeline, not the public pool"


# ── the census: the number the cross-lane request is worth making with ──────
def _bad(*events):
    return {"untranslatable": {"QB": [{"why": "event_untranslatable", "event": e}
                                      for e in events]}}


def test_the_census_counts_LEAGUES_not_RULES():
    """One league scoring TGT at three positions is ONE league lost to TGT.
    MUTATION: update the counter per reason rather than per league — the same
    league would triple its own code and the table would overstate every cost."""
    three_pos = {"untranslatable": {p: [{"why": "event_untranslatable", "event": "TGT"}]
                                    for p in ("QB", "WR", "TE")}}
    c = X.untranslatable_census([three_pos, _bad("PA"), {"untranslatable": {}}])
    assert c["by_event_code"]["TGT"] == 1
    assert c["leagues_unscoreable"] == 2 and c["leagues_examined"] == 3


def test_the_census_ranks_the_codes_so_the_request_has_a_TARGET():
    c = X.untranslatable_census([_bad("TGT"), _bad("TGT"), _bad("PA"), _bad("TGT", "PA")])
    assert list(c["by_event_code"]) == ["TGT", "PA"]
    assert c["by_event_code"] == {"TGT": 3, "PA": 2}
    assert "TGT (3)" in c["verdict"]


def test_a_census_with_NOTHING_LOST_does_not_manufacture_a_warning():
    c = X.untranslatable_census([{"untranslatable": {}}, {"untranslatable": {}}])
    assert c["leagues_unscoreable"] == 0
    assert "UNSCOREABLE" not in c["verdict"] and "2 of 2 leagues scoreable" in c["verdict"]


def test_the_reason_STRING_is_formatted_from_the_STRUCTURE_one_way_only():
    """The census reads the structure; the attrition line reads the string. If the
    string were the only record, counting event codes would mean re-parsing a
    format we wrote ourselves — a second derivation of a fact we already had."""
    bad = {"QB": [{"why": "banded", "event": "PY", "n": 2},
                  {"why": "threshold", "event": "CY", "lo": 100.0}]}
    s = X.untranslatable_reason(bad)
    assert s == "F4.scoring_untranslatable:QB=PY_banded_2_rules,CY_threshold_from_100"
    import ingest_filters as F
    assert F.reason_code(s) == "F4.scoring_untranslatable" and F.is_unreadable(s)


def test_a_MISSING_gsis_crosswalk_is_named_rather_than_reported_as_0pct_coverage():
    """Weekly rows are GSIS-keyed and our board is Sleeper-keyed. With no map,
    nothing joins — and "nothing joined" has the SAME SHAPE as "none of these
    players ever took a snap". MUTATION: default `id_map` to identity. F3 would
    report coverage 0.0 for every league and it would read as a finding."""
    out = X.league_outcomes(rules(FULL), ["W1"], _weekly(), 2025, {"W1": "WR"}, {})
    assert out["has_weekly_outcomes"] is False and out["reason"] == "F4.no_gsis_crosswalk"
    assert out["f3"] is None, "no coverage figure at all beats a misleading 0.0"
    import ingest_filters as F
    assert F.is_unreadable(out["reason"])


def test_the_gsis_to_sleeper_hop_is_the_SHIPPED_one():
    """`grade.crosswalk_gsis_to_sleeper` already builds this map from two sources
    because neither is complete (739 of 761 in the 2026 build). A second one here
    would disagree on the tail and never say so."""
    assert callable(GR.crosswalk_gsis_to_sleeper)
    cw = GR.crosswalk_gsis_to_sleeper([{"player_id": "4046", "gsis_id": "00-0033873"}])
    out = X.league_outcomes(rules(FULL), ["4046"],
                            [wk("00-0033873", 1, receptions=4, receiving_yards=40)],
                            2025, {"4046": "WR"}, cw)
    assert out["series"]["4046"] == {1: 6.0}       # 4x0.5=2.0 plus 40x0.1=4.0
    assert out["f3"]["coverage"] == 1.0


# ── rule 12: the leaderboard a human can check against knowledge we lack ────
def test_the_sanity_leaderboard_ranks_by_SEASON_TOTAL_and_carries_the_NAME():
    """A leaderboard with no names cannot be eyeballed, and eyeballing it is the
    entire point: my fixtures use the column names I already believe in, so no
    test built from them can catch a translation that is wrong about ALL of them."""
    import scoring as S
    rows = [dict(wk("A", w, receptions=8, receiving_yards=100, receiving_tds=1),
                 player_display_name="Big Name", position="WR") for w in range(1, 4)] \
        + [dict(wk("B", 1, receptions=1, receiving_yards=5),
                player_display_name="Small Name", position="WR")]
    top = X.sanity_top(rows, 2025, S.HALF_PPR_REFERENCE, n=5)
    # 8x0.5=4.0 plus 100x0.1=10.0 plus 1x6=6.0 = 20.0 a week, three weeks = 60.0
    assert top[0] == {"player_id": "A", "points": 60.0, "weeks": 3,
                      "name": "Big Name", "position": "WR"}
    assert top[1]["name"] == "Small Name" and top[1]["points"] == 1.0


def test_the_leaderboard_does_not_pool_seasons():
    import scoring as S
    rows = [dict(wk("A", 1, receiving_tds=2), player_display_name="N", position="WR"),
            dict(wk("A", 1, receiving_tds=2), season=2024, player_display_name="N",
                 position="WR")]
    assert X.sanity_top(rows, 2025, S.HALF_PPR_REFERENCE)[0]["points"] == 12.0


# ── D5f: THE COLUMN THE LOADER DOES NOT SERVE ──────────────────────────────
# Measured 2026-08-11, not hypothesised. `nfl_data_py.import_weekly_data` 404s for
# 2025; `nflreadpy.load_player_stats` serves it (19,421 rows) with `interceptions`
# RENAMED to `passing_interceptions`. The shipped translator maps the old name, so
# `pass_int` is never emitted and every QB scores ~2 points per interception too
# high — with no error anywhere, because `score_stat_line` correctly skips a key
# the stat line does not carry.
def nflreadpy_shaped(row):
    """The same row as the 2025 loader actually serves it."""
    out = dict(row)
    out["passing_interceptions"] = out.pop("interceptions", 0)
    return out


def test_a_RENAMED_column_is_caught_rather_than_scored_as_absent():
    """MUTATION: skip the schema check. A league scoring -2 per interception would
    be graded with no interceptions at all, and the leaderboard would look fine."""
    tables, _b, _i, _bo = X.scoring_tables(rules(FULL))
    rows = [nflreadpy_shaped(wk("Q1", w, passing_yards=300, passing_tds=2,
                                interceptions=1)) for w in (1, 2)]
    gap = X.schema_gap(rows, tables)
    assert gap["QB"] == ["pass_int"], gap
    out = X.league_outcomes(rules(FULL), ["Q1"], rows, 2025, {"Q1": "QB"}, {"Q1": "Q1"})
    assert out["has_weekly_outcomes"] is False
    assert out["reason"] == "F4.stat_columns_absent:QB=pass_int"


def test_the_SIZE_of_the_silent_error_is_stated_not_asserted_away():
    """THE ARITHMETIC. 300 yards x 0.04 = 12.0, 2 TD x 4 = 8.0, 1 INT x -2 = -2.0
    -> 18.0 correct. Under the renamed column the interception term contributes
    nothing and the same week scores 20.0. Over 17 weeks with one pick a week that
    is 34 points of pure inflation, on QBs only — a systematic bias by position."""
    tables, _b, _i, bounds = X.scoring_tables(rules(FULL))
    row = wk("Q1", 1, passing_yards=300, passing_tds=2, interceptions=1)
    ok = X.weekly_points([row], 2025, tables, {"Q1": "QB"}, {"Q1": "Q1"}, bounds)
    silent = X.weekly_points([nflreadpy_shaped(row)], 2025, tables, {"Q1": "QB"},
                             {"Q1": "Q1"}, bounds)
    assert ok["series"]["Q1"][1] == 18.0
    assert silent["series"]["Q1"][1] == 20.0


def test_emittable_keys_is_the_TRANSLATOR_RUN_not_a_column_name_comparison():
    """Three failures, one measurement: a renamed column, an absent one, and one
    present but never populated. A name comparison would miss the third, and it
    would drift from the translator the first time either changed."""
    assert "pass_int" in X.emittable_keys([wk("A", 1, interceptions=0)])
    assert "pass_int" not in X.emittable_keys([nflreadpy_shaped(wk("A", 1))])
    nulled = dict(wk("A", 1)); nulled["interceptions"] = None
    assert "pass_int" not in X.emittable_keys([nulled]), \
        "a column present but never populated scores as absent, same as a missing one"


def test_a_league_that_does_NOT_score_the_missing_term_is_unaffected():
    """A check that fails every league is a check nobody can act on. A WR-only
    league scoring receptions and yards never touches `pass_int`."""
    r = rules([("QB", [rule("PY", "*0.04", "0-999")]),
               ("RB|WR|TE", [rule("CC", "*0.5"), rule("CY", "*0.1", "0-999")])])
    tables, _b, _i, _bo = X.scoring_tables(r)
    rows = [nflreadpy_shaped(wk("W1", w, receptions=5, receiving_yards=80))
            for w in (1, 2)]
    assert X.schema_gap(rows, tables) == {}
    assert X.league_outcomes(r, ["W1"], rows, 2025, {"W1": "WR"},
                             {"W1": "W1"})["has_weekly_outcomes"] is True


# ── D5g: A FANTASY SEASON IS THE REGULAR SEASON ────────────────────────────
# Both loaders pool REG and POST in one table (2024: 5,340 + 257; 2025: 18,539 +
# 882) and weeks run to 22. Caught by the leaderboard's `weeks` column showing
# 19-21 for a season that has at most 18.
def test_POSTSEASON_weeks_are_DROPPED_AND_COUNTED():
    """MUTATION: score every row. Playoff production would inflate exactly the
    players on good teams — a bias correlated with team quality, which is
    correlated with what a draft policy is being graded on."""
    tables, _b, _i, bounds = X.scoring_tables(rules(FULL))
    rows = [wk("W1", 1, receiving_tds=1),
            dict(wk("W1", 20, receiving_tds=3), season_type="POST")]
    got = X.weekly_points(rows, 2025, tables, {"W1": "WR"}, {"W1": "W1"}, bounds)
    assert got["series"]["W1"] == {1: 6.0}, "the playoff week was scored"
    assert got["postseason_rows_dropped"] == 1


def test_a_row_with_NO_season_type_is_not_ASSUMED_regular():
    """Absent is not REG, any more than absent is zero."""
    tables, _b, _i, bounds = X.scoring_tables(rules(FULL))
    row = wk("W1", 1, receiving_tds=1); row.pop("season_type")
    got = X.weekly_points([row], 2025, tables, {"W1": "WR"}, {"W1": "W1"}, bounds)
    assert got["series"] == {} and got["unknown_season_type_rows_dropped"] == 1


def test_data_carrying_NO_season_type_AT_ALL_refuses_the_league():
    """If nothing in the table distinguishes REG from POST, dropping every row
    would produce empty series that read as a season in which nobody played."""
    rows = []
    for w in (1, 2):
        r = wk("W1", w, receiving_tds=1); r.pop("season_type"); rows.append(r)
    out = X.league_outcomes(rules(FULL), ["W1"], rows, 2025, {"W1": "WR"}, {"W1": "W1"})
    assert out["has_weekly_outcomes"] is False and out["reason"] == "F4.no_season_type"
    import ingest_filters as F
    assert F.is_unreadable(out["reason"])


# ── D5h: A ZERO FROM THE CALENDAR AND A ZERO FROM A BROKEN FETCH ────────────
# Measured 2026-08-11: fetch_weekly(2026) 404s from BOTH loaders. So does a season
# we simply cannot reach. The signal is IDENTICAL, and no amount of care inside
# the target season's own result can separate them — only a control can.
def _season(weeks, season_type="REG"):
    return [wk("A", w, receptions=1) | {"season_type": season_type} for w in weeks]


def test_UNPLAYED_and_UNFETCHABLE_are_the_SAME_signal_and_are_told_apart_by_the_CONTROL():
    """MUTATION: drop the control and report `state` from the target alone. Both
    cases return no rows, so both would read the same — and one of them means the
    pipeline is broken."""
    played = X.season_readiness(2026, [], "404", 2025, _season(range(1, 19)), None)
    broken = X.season_readiness(2026, [], "404", 2025, [], "404")
    assert played["state"] == "UNPLAYED" and broken["state"] == "UNFETCHABLE"
    # Same input for the TARGET in both calls — only the control differs.
    assert "the season has not been played" in played["why"]
    assert "evidence about THIS PIPELINE" in broken["why"]
    assert "measured nothing" in broken["why"]


def test_an_IN_SEASON_year_is_PARTIAL_not_COMPLETE():
    """Grading a draft on a third of a season is a real number about a different
    question. MUTATION: treat any rows at all as COMPLETE."""
    r = X.season_readiness(2026, _season(range(1, 7)), None, 2025, _season(range(1, 19)), None)
    assert r["state"] == "PARTIAL" and r["reg_weeks"] == 6 and r["control_reg_weeks"] == 18


def test_a_COMPLETED_season_matching_the_control_is_COMPLETE():
    r = X.season_readiness(2025, _season(range(1, 19)), None, 2024, _season(range(1, 19)), None)
    assert r["state"] == "COMPLETE" and r["reg_weeks"] == 18


def test_the_SEASON_LENGTH_is_measured_from_the_control_not_hardcoded():
    """The NFL went 17 REG weeks -> 18 in 2021 and could again. A constant would
    call a full season partial the year it changes. MUTATION: `< 18`."""
    r = X.season_readiness(2020, _season(range(1, 18)), None, 2019, _season(range(1, 18)), None)
    assert r["state"] == "COMPLETE", "17 weeks against a 17-week control is complete"
    assert X.season_readiness(2020, _season(range(1, 18)), None, 2021,
                              _season(range(1, 19)), None)["state"] == "PARTIAL"


def test_POSTSEASON_rows_do_not_make_an_UNPLAYED_season_look_played():
    """`reg_weeks` counts REG only, so a table carrying nothing but playoff rows
    is still a season with no regular season in it."""
    assert X.reg_weeks(_season([20, 21], season_type="POST")) == []
    r = X.season_readiness(2026, _season([20], season_type="POST"), None, 2025,
                           _season(range(1, 19)), None)
    assert r["state"] == "UNPLAYED"


# ── F3's THIRD outcome: "we never looked" is not "he did not play" ──────────
# Measured 2026-08-11 against the real artifacts: `import_ids()` yields 6,160
# gsis->sleeper pairs covering 78.9% of our 1,763-player board. More than a fifth
# of the board cannot be looked up in weekly data at all — and a drafted player
# from that fifth has no series, exactly like a player who never took a snap.
def test_UNMAPPABLE_and_DID_NOT_PLAY_are_split_because_they_look_identical():
    """MUTATION: drop the `reachable` argument and bin both as no-weekly-rows. A
    21% hole in OUR ID MAP would be reported as a fact about the players."""
    rep = X.f3_report(["A", "B", "C"], {"A": {1: 5.0}}, reachable={"A", "B"})
    assert rep["drafted_with_outcomes"] == 1
    assert rep["drafted_no_weekly_rows"] == 1        # B: reachable, no rows -> did not play
    assert rep["drafted_unmappable"] == 1            # C: no id reaches him -> we never looked
    assert rep["drafted_without_outcomes"] == 2      # the old total, unchanged in meaning
    assert rep["unmappable_ids"] == ["C"]


def test_the_UNMAPPABLE_half_LEADS_the_verdict_because_it_is_OURS():
    rep = X.f3_report(["A", "C"], {"A": {1: 5.0}}, reachable={"A"})
    assert rep["verdict"].startswith("1 of 2 drafted players are UNMAPPABLE")
    assert "evidence about THIS PIPELINE'S id map" in rep["verdict"]


def test_NO_reachability_set_reports_the_split_as_UNKNOWN_not_as_did_not_play():
    """The honest third state. A caller that supplies nothing must not have its
    silence read as "all of these players simply did not play"."""
    rep = X.f3_report(["A", "B"], {"A": {1: 5.0}})
    assert rep["split_available"] is False and rep["drafted_unmappable"] is None
    assert "NO REACHABILITY SET SUPPLIED" in rep["verdict"]
    assert "it is NOT KNOWN how many" in rep["verdict"]


def test_a_fully_mappable_league_carries_no_unmappable_warning():
    rep = X.f3_report(["A", "B"], {"A": {1: 5.0}}, reachable={"A", "B"})
    assert rep["drafted_unmappable"] == 0
    assert "UNMAPPABLE" not in rep["verdict"] and "NOT KNOWN" not in rep["verdict"]


def test_the_league_path_supplies_the_reachable_set_from_the_ID_MAPS_VALUES():
    """Rule 14: the producer's only caller decides whether the split exists at all.
    MUTATION: pass `None`. Every test above still passes and the live report
    silently loses the distinction."""
    out = X.league_outcomes(rules(FULL), ["W1", "Q1", "GONE"], _weekly(), 2025,
                            {"W1": "WR", "Q1": "QB"}, {"W1": "W1", "Q1": "Q1"})
    assert out["f3"]["split_available"] is True
    assert out["f3"]["drafted_unmappable"] == 1, "GONE is not in the id map's values"
    assert out["f3"]["drafted_no_weekly_rows"] == 0
