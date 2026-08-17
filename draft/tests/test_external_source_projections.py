# TERRITORY: C
"""THE JOIN, OFFLINE — Sleeper and FantasyPros rows onto our sleeper_id, no network.

`fetch_and_join` is `pragma: no cover` because it reaches two blocked hosts; every
rule below lives in `sleeper_rows` and `join_by_sleeper_id`, which are pure. Only
`fetch_and_join` touches the network, mirroring `external_discovery.crawl`'s split.

Run: python3 -m pytest draft/tests/test_external_source_projections.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import adp as ADP  # noqa: E402
import external_source_projections as M  # noqa: E402


def _players():
    return {
        "4984": {"full_name": "Josh Allen", "position": "QB", "team": "BUF",
                "search_rank": 1},
        "9224": {"full_name": "Chase Brown", "position": "RB", "team": "CIN",
                "search_rank": 50},
        "7564": {"full_name": "Ja'Marr Chase", "position": "WR", "team": "CIN",
                "search_rank": 5},
    }


def _index():
    return ADP.build_index(_players())


# ── sleeper_rows: tolerating the two real payload shapes ────────────────────

def test_sleeper_rows_READS_THE_NESTED_stats_KEY():
    """The shape `_rows_with_stats` (sleeper_import) scores as normal.

    MUTATION: read `row` directly instead of `row.get("stats")` and a nested
    payload comes back as an EMPTY stat dict — the exact silent-zero shape the
    module's own docstring names as bug #2 in source_blend_2025.py."""
    out = M.sleeper_rows({"4984": {"stats": {"pass_yd": 4000, "pass_td": 30}}})
    assert out == {"4984": {"pass_yd": 4000, "pass_td": 30}}


def test_sleeper_rows_TOLERATES_THE_FLAT_SHAPE_TOO():
    """A season whose endpoint serves stat keys directly on the row, no nested
    "stats" wrapper — `_rows_with_stats` treats this as valid and this must too.

    MUTATION: require the nested key unconditionally and every flat-shape
    season silently loses every row."""
    out = M.sleeper_rows({"4984": {"pass_yd": 4000, "pass_td": 30}})
    assert out == {"4984": {"pass_yd": 4000, "pass_td": 30}}


def test_sleeper_rows_DROPS_A_ROW_WITH_NO_READABLE_STATS():
    """A row that is present but carries an empty or non-dict stat line
    contributes nothing rather than an empty entry that LOOKS joined later."""
    out = M.sleeper_rows({"1": {"stats": {}}, "2": {"stats": None},
                          "3": "not-a-dict", "4": {"stats": {"pass_yd": 1}}})
    assert out == {"4": {"pass_yd": 1}}


def test_sleeper_rows_ON_AN_EMPTY_OR_NONE_PAYLOAD_IS_EMPTY_not_an_error():
    assert M.sleeper_rows({}) == {}
    assert M.sleeper_rows(None) == {}


# ── join_by_sleeper_id: the actual crosswalk ─────────────────────────────────

def test_A_PLAYER_IN_BOTH_SOURCES_IS_JOINED_with_both_stat_lines():
    sleeper_stats = {"4984": {"pass_yd": 4000}}
    fp_rows = [{"name": "Josh Allen", "position": "QB", "team": "BUF",
               "stats": {"pass_yd": 4100}, "fp_fpts": 320.5}]
    joined, diag = M.join_by_sleeper_id(sleeper_stats, fp_rows, _index())
    assert joined == {"4984": {"sleeper_stats": {"pass_yd": 4000},
                               "fp_stats": {"pass_yd": 4100},
                               "fp_match_method": "name",
                               "fp_fpts": 320.5}}
    assert diag["joined_rows"] == 1


def test_A_PLAYER_ONLY_SLEEPER_HAS_IS_COUNTED_NOT_JOINED():
    """⚠ THE WHOLE POINT OF THE FUNCTION. A row present on one side only is not
    something either arm of a comparison can use — it must be visible in
    diagnostics and ABSENT from `joined`, never invented with a missing half.

    MUTATION: join sleeper-only players with `fp_stats: {}` and a downstream
    scorer treats a missing FP projection as a projection of zero."""
    sleeper_stats = {"4984": {"pass_yd": 4000}, "9224": {"rush_yd": 800}}
    fp_rows = [{"name": "Josh Allen", "position": "QB", "team": "BUF",
               "stats": {"pass_yd": 4100}}]
    joined, diag = M.join_by_sleeper_id(sleeper_stats, fp_rows, _index())
    assert "9224" not in joined
    assert diag["sleeper_only"] == ["9224"]
    assert diag["joined_rows"] == 1


def test_A_PLAYER_ONLY_FANTASYPROS_HAS_IS_COUNTED_NOT_JOINED():
    sleeper_stats = {"4984": {"pass_yd": 4000}}
    fp_rows = [{"name": "Josh Allen", "position": "QB", "team": "BUF",
               "stats": {"pass_yd": 4100}},
              {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN",
               "stats": {"rec": 90}}]
    joined, diag = M.join_by_sleeper_id(sleeper_stats, fp_rows, _index())
    assert "7564" not in joined
    assert diag["fp_only"] == ["7564"]
    assert diag["joined_rows"] == 1


def test_AN_FP_ROW_THE_CROSSWALK_CANNOT_MATCH_IS_COUNTED_not_dropped_silently():
    """A player FP prints who is not in Sleeper's index at all — an unmatched
    name, not a name our crosswalk would recognise. Must be visible."""
    sleeper_stats = {"4984": {"pass_yd": 4000}}
    fp_rows = [{"name": "Josh Allen", "position": "QB", "team": "BUF",
               "stats": {"pass_yd": 4100}},
              {"name": "Some Undrafted Camp Body", "position": "WR", "team": "FA",
               "stats": {"rec": 5}}]
    joined, diag = M.join_by_sleeper_id(sleeper_stats, fp_rows, _index())
    assert diag["fp_unmatched_to_sleeper_id"] == 1
    assert diag["joined_rows"] == 1


def test_TWO_FP_ROWS_RESOLVING_TO_THE_SAME_SLEEPER_ID_ARE_COUNTED_AS_A_COLLISION():
    """A crosswalk collision must be visible, not a silent last-write-wins with
    no trace it happened."""
    sleeper_stats = {"4984": {"pass_yd": 4000}}
    fp_rows = [{"name": "Josh Allen", "position": "QB", "team": "BUF",
               "stats": {"pass_yd": 4000}},
              {"name": "Josh Allen", "position": "QB", "team": "BUF",
               "stats": {"pass_yd": 4200}}]
    joined, diag = M.join_by_sleeper_id(sleeper_stats, fp_rows, _index())
    assert diag["match_methods"].get("_collision_overwritten") == 1
    assert "4984" in joined


def test_EMPTY_EITHER_SIDE_JOINS_NOTHING_WITHOUT_CRASHING():
    joined, diag = M.join_by_sleeper_id({}, [], _index())
    assert joined == {} and diag["joined_rows"] == 0
    joined2, diag2 = M.join_by_sleeper_id({"4984": {"pass_yd": 1}}, [], _index())
    assert joined2 == {} and diag2["sleeper_only"] == ["4984"]


# ── VOID discipline: a failure is a stated reason, never zero rows reported
# as a clean result ──────────────────────────────────────────────────────────

def test_void_CARRIES_A_REASON_AND_NEVER_LOOKS_LIKE_A_CLEAN_EMPTY_RESULT():
    d = M._void("egress failed")
    assert d["status"] == "VOID"
    assert d["reason"] == "egress failed"
    assert "not zero rows" in d["_note"]


def test_void_PASSES_THROUGH_EXTRA_DIAGNOSTIC_FIELDS():
    d = M._void("parsed to zero rows", fp_diag={"api_tried": []})
    assert d["fp_diag"] == {"api_tried": []}
