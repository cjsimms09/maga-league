"""FantasyPros ADP — pure regex parser.
Run: python -m pytest draft/tests/test_fantasypros_adp.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import fantasypros_adp as FP  # noqa: E402

# A synthetic FP-shaped ADP table (the real column layout is unconfirmed; this pins the
# parser's CONTRACT — linked name, (TEAM), a POS token, AVG as the last float per row).
SAMPLE = """
<table id="data"><tbody>
<tr><td>1</td><td class="player-label"><a href="/nfl/players/x">Ja'Marr Chase</a> <small>(CIN)</small></td>
    <td class="center">WR1</td><td>1.0</td><td>2.0</td><td>1.8</td></tr>
<tr><td>2</td><td class="player-label"><a href="/nfl/players/y">Bijan Robinson</a> <small>(ATL)</small></td>
    <td class="center">RB1</td><td>2.0</td><td>3.0</td><td>2.4</td></tr>
<tr><td>3</td><td class="player-label"><a href="/nfl/players/z">Malik Nabers</a> <small>(NYG)</small></td>
    <td class="center">WR5</td><td>30</td><td>35</td><td>31.8</td></tr>
</tbody></table>
"""


def test_parses_name_team_pos_and_avg_adp():
    rows = FP.parse(SAMPLE)
    assert len(rows) == 3
    r = {x["name"]: x for x in rows}
    assert r["Ja'Marr Chase"]["team"] == "CIN"
    assert r["Ja'Marr Chase"]["position"] == "WR"
    assert r["Ja'Marr Chase"]["adp"] == 1.8            # the AVG column (last float), not 1.0/2.0
    assert r["Malik Nabers"]["adp"] == 31.8


def test_sorted_ascending_and_dst_normalized():
    html = ('<tr><td><a href="/p">Some Defense</a> <small>(SF)</small></td>'
            '<td>DST</td><td>90.0</td></tr>'
            '<tr><td><a href="/p">Early Guy</a> <small>(KC)</small></td><td>QB2</td><td>5.5</td></tr>')
    rows = FP.parse(html)
    assert [r["name"] for r in rows] == ["Early Guy", "Some Defense"]   # sorted by adp
    assert rows[1]["position"] == "DEF"                                  # DST -> DEF


def test_skips_rows_without_name_or_adp():
    html = ('<tr><td>header</td><td>no link no float</td></tr>'
            '<tr><td><a href="/p">Real Guy</a> <small>(BUF)</small></td><td>RB3</td><td>12.3</td></tr>')
    rows = FP.parse(html)
    assert len(rows) == 1 and rows[0]["name"] == "Real Guy"
