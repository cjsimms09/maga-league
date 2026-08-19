# TERRITORY: C
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import discovery_projection_spread_capture as C  # noqa: E402


def _table_html(rows):
    """rows: [(name, pts), ...] -> a real HTML table (>=10 rows so
    _best_table's size floor doesn't reject it)."""
    trs = "".join("<tr><td>%s</td><td>TM</td><td>%s</td></tr>" % (n, p) for n, p in rows)
    return "<html><body><table><tr><th>Player</th><th>Team</th><th>FPTS</th></tr>%s</table></body></html>" % trs


def test_norm_matches_expert_grading_style():
    assert C._norm("Ja'Marr Chase Jr.") == "jamarr chase"


# ── register-the-bug: the REAL stage-2 dispatch found CBS/Walterfootball
# parsing real row counts (377/247) with 0/15 planted-control hits. The
# cause, confirmed against ffanalytics's own scrape_cbs regex: a combined
# "Name  POS  TEAM" cell, not a clean name column. ──────────────────────────

def test_clean_name_STRIPS_a_trailing_position_and_team_WITH_SPACES():
    assert C._clean_name("Ja'Marr Chase  WR  CIN") == "Ja'Marr Chase"


def test_clean_name_STRIPS_a_trailing_position_and_team_GLUED_NO_SPACE():
    """pandas.read_html can merge adjacent text nodes with no separator at
    all -- the exact shape that produced 0/15 hits on 377 real CBS rows.
    MUTATION: require whitespace before the position code and this case
    (the one that actually broke) keeps failing silently."""
    assert C._clean_name("Ja'Marr ChaseWRCIN") == "Ja'Marr Chase"


def test_clean_name_LEAVES_AN_ALREADY_CLEAN_NAME_ALONE():
    """MUTATION: match too eagerly and a genuinely clean 'Justin Jefferson'
    (no trailing position/team) could get mangled -- this is the safety
    check that the fix is additive, not a new way to break good sources."""
    assert C._clean_name("Justin Jefferson") == "Justin Jefferson"


def test_clean_name_HANDLES_A_SUFFIX_NAME_WITH_TRAILING_CODES():
    assert C._clean_name("Michael Pittman Jr.  WR  IND") == "Michael Pittman Jr."


def test_rows_from_table_APPLIES_clean_name_not_just_strips_junk():
    """End-to-end: a table whose 'name' column carries the combined CBS-style
    cell must still produce a clean, controllable name -- not just a
    points-parsing test in isolation."""
    html = _table_html([("Player %d  RB  KC" % i, "%d.0" % (300 - i)) for i in range(12)])
    found = C._best_table(html)
    assert found is not None
    name_col, pts_col, df = found
    rows = C._rows_from_table(name_col, pts_col, df, "RB")
    assert rows[0]["name"] == "Player 0"


def test_control_names_reads_the_real_board():
    """MUTATION: point this at the wrong file or field and the control set
    would be empty or wrong, silently disabling the whole validation gate --
    every source would VOID on a control that can never match."""
    names = C.control_names()
    assert len(names) == 15
    assert all(isinstance(n, str) and n for n in names)


def test_best_table_REQUIRES_BOTH_a_name_col_and_a_points_col():
    html = "<table><tr><th>Team</th><th>Bye</th></tr>" + \
          "".join("<tr><td>T%d</td><td>%d</td></tr>" % (i, i) for i in range(12)) + "</table>"
    assert C._best_table(html) is None


def test_best_table_REJECTS_a_small_table():
    """A 3-row table could be a nav widget or a mini leaderboard, not a real
    projection table for ~100+ rostered players at a position. MUTATION:
    drop the `len(df) >= 10` floor and a tiny unrelated table could pass."""
    html = _table_html([("A", 10), ("B", 9), ("C", 8)])
    assert C._best_table(html) is None


def test_rows_from_table_STRIPS_NON_NUMERIC_JUNK_FROM_POINTS():
    """Real sites format points as '312.5 pts' or '1,234.5' -- MUTATION:
    float() the raw cell directly and a real row would be silently dropped
    (ValueError) or crash the whole parse."""
    html = _table_html([("Player %d" % i, "%d.5 pts" % (300 - i)) for i in range(12)])
    found = C._best_table(html)
    assert found is not None
    name_col, pts_col, df = found
    rows = C._rows_from_table(name_col, pts_col, df, "WR")
    assert len(rows) == 12
    assert rows[0]["points"] == 300.5


def test_capture_source_VOIDS_on_a_FAILED_planted_value_control():
    """The parser 'succeeds' (no exception, real rows come back) but none of
    them are recognizable current players -- exactly what a changed-markup
    or wrong-page scrape looks like. MUTATION: skip the control check and
    this would report OK with garbage rows."""
    def fake_fetch(pos):
        return [{"name": "Nobody Real %d" % i, "position": pos, "points": float(i)}
                for i in range(20)], "https://x.example/"
    with patch.dict(C.SOURCES, {"cbs": (fake_fetch, True)}):
        result = C.capture_source("cbs", {"christian mccaffrey", "puka nacua"})
    assert result["status"] == "VOID"
    assert "control" in result["reason"]
    assert result["sample_names"][:3] == ["Nobody Real 0", "Nobody Real 1", "Nobody Real 2"], (
        "a VOID result must still carry what the parser actually extracted -- "
        "this is the exact diagnostic the real stage-2 dispatch was missing "
        "when CBS/Walterfootball parsed real row counts with 0/15 hits and "
        "nobody could tell why without a second dispatch")


def test_capture_source_OK_when_control_clears():
    controls = {"christian mccaffrey", "puka nacua", "jonathan taylor", "james cook", "ceedee lamb"}

    def fake_fetch(pos):
        names = ["Christian McCaffrey", "Puka Nacua", "Jonathan Taylor",
                "James Cook", "CeeDee Lamb"] + ["Filler %d" % i for i in range(10)]
        return [{"name": n, "position": pos, "points": 100.0} for n in names], "https://x.example/"
    with patch.dict(C.SOURCES, {"cbs": (fake_fetch, True)}):
        result = C.capture_source("cbs", controls)
    assert result["status"] == "OK"
    assert result["control_hits"] == 5


def test_capture_source_NEVER_RAISES_on_a_network_exception():
    def fake_fetch(pos):
        raise ConnectionError("refused")
    with patch.dict(C.SOURCES, {"cbs": (fake_fetch, True)}):
        result = C.capture_source("cbs", {"x"})
    assert result["status"] == "VOID"
    assert "ConnectionError" in result["reason"]


def test_capture_source_fantasyfootballnerd_IS_NOT_ATTEMPTED():
    """MUTATION: call the real (nonexistent free) fetch path and this would
    either crash or silently succeed against a demo/limited TEST key,
    reporting a fabricated table as real data."""
    result = C.capture_source("fantasyfootballnerd", {"x"})
    assert result["status"] == "VOID"
    assert "paid" in result["reason"].lower()


def test_build_spread_DROPS_single_source_players():
    """A player only one source names has no disagreement to report --
    MUTATION: keep them anyway and every low-coverage player would show
    spread=0, indistinguishable from 'sources agree exactly'."""
    capture = {"sources": {
        "cbs": {"status": "OK", "rows": [{"name": "Solo Player", "position": "WR", "points": 100.0}]},
    }}
    spread = C.build_spread(capture)
    assert spread["players"] == []
    assert spread["single_source_players_dropped"] == 1


def test_build_spread_COMPUTES_min_median_max_spread_across_sources():
    capture = {"sources": {
        "cbs": {"status": "OK", "rows": [{"name": "Dual Player", "position": "RB", "points": 200.0}]},
        "numberfire": {"status": "OK", "rows": [{"name": "Dual Player", "position": "RB", "points": 240.0}]},
        "fftoday": {"status": "VOID", "reason": "x"},
    }}
    spread = C.build_spread(capture)
    assert len(spread["players"]) == 1
    row = spread["players"][0]
    assert row["n_sources"] == 2
    assert row["min_points"] == 200.0
    assert row["max_points"] == 240.0
    assert row["spread"] == 40.0
    assert sorted(row["sources"]) == ["cbs", "numberfire"]


def test_build_spread_ONLY_JOINS_VALIDATED_OK_SOURCES():
    """MUTATION: iterate every source regardless of status and a VOID
    source's garbage rows (control-failed but rows still present in the
    dict) would join into the spread anyway."""
    capture = {"sources": {
        "cbs": {"status": "OK", "rows": [{"name": "A", "position": "WR", "points": 100.0}]},
        "fftoday": {"status": "VOID", "reason": "control failed",
                   "rows": [{"name": "A", "position": "WR", "points": 9999.0}]},
    }}
    spread = C.build_spread(capture)
    assert spread["players"] == [] or all("fftoday" not in r["sources"] for r in spread["players"])
