"""FantasyPros ADP — parser of the embedded JSON blob (the real page structure,
confirmed 2026-08-09 from the live page via the self-diagnosing dump).
Run: python -m pytest draft/tests/test_fantasypros_adp.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import fantasypros_adp as FP  # noqa: E402

# The real shape: FP embeds `"rows":[ {rank, player:{name,team,url}, pos, avg} ]` in a
# window.FP SSR script. team is "MIN (13)" (team + bye); avg is the consensus ADP.
SAMPLE = ('window.FP.report = {"columns":[{"key":"avg","label":"AVG"}],"rows":['
          '{"id":19236,"rank":1,"player":{"id":19236,"name":"Justin Jefferson","team":"MIN (13)","url":"/x"},"pos":"WR1","avg":1},'
          '{"id":16393,"rank":2,"player":{"id":16393,"name":"Christian McCaffrey","team":"SF (9)","url":"/y"},"pos":"RB1","avg":2},'
          '{"id":15802,"rank":5,"player":{"id":15802,"name":"Tyreek Hill","team":"","url":"/z"},"pos":"WR3","avg":5.3}'
          '],"defaultSort":[{"key":"rank"}]};\nwindow.FP.isLoggedIn=false;')


def test_parses_embedded_json_name_team_pos_avg():
    rows = FP.parse(SAMPLE)
    assert len(rows) == 3
    r = {x["name"]: x for x in rows}
    assert r["Justin Jefferson"]["team"] == "MIN"          # "MIN (13)" -> team, bye stripped
    assert r["Justin Jefferson"]["position"] == "WR"       # "WR1" -> WR
    assert r["Justin Jefferson"]["adp"] == 1.0             # the avg (consensus) column
    assert r["Tyreek Hill"]["adp"] == 5.3
    assert r["Tyreek Hill"]["team"] is None                # empty team -> None, not ""


def test_sorted_ascending():
    rows = FP.parse(SAMPLE)
    assert [r["adp"] for r in rows] == sorted(r["adp"] for r in rows)


def test_accepts_bare_rows_list_and_normalizes_dst():
    bare = ('[{"player":{"name":"Some Defense","team":"SF"},"pos":"DST","avg":90.0},'
            '{"player":{"name":"Early Guy","team":"KC"},"pos":"QB2","avg":5.5}]')
    rows = FP.parse(bare)
    assert [r["name"] for r in rows] == ["Early Guy", "Some Defense"]
    assert rows[1]["position"] == "DEF"                    # DST -> DEF


def test_no_rows_blob_returns_empty_not_crash():
    assert FP.parse("<html>no data here</html>") == []
    assert FP.parse("") == []


def test_picks_the_largest_rows_array_and_is_string_aware():
    # an earlier 1-row widget with a ']' inside a string, THEN the real ADP table (3 rows).
    html = ('window.A={"rows":[{"note":"top pick [lock]","avg":1}]};'
            'window.FP={"rows":[' 
            '{"player":{"name":"A B","team":"KC (10)"},"pos":"RB1","avg":1.2},'
            '{"player":{"name":"C D [x]","team":"SF"},"pos":"WR1","avg":2.1},'
            '{"player":{"name":"E F","team":"BUF"},"pos":"WR2","avg":3.4}]};')
    rows = FP.parse(html)
    assert len(rows) == 3, [r["name"] for r in rows]      # the 3-row ADP table, not the 1-row widget
    assert rows[1]["name"] == "C D [x]"                    # a ']' inside a name did not truncate
