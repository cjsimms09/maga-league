"""MFL ADP parser + crosswalk — pure, no egress.
Run: python -m pytest draft/tests/test_mfl_adp.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import mfl_adp as M  # noqa: E402


ADP = {"adp": {"totalDrafts": "5011", "totalPicks": "1346", "player": [
    {"id": "13593", "averagePick": "1.5", "draftsSelectedIn": "5000"},
    {"id": "11192", "averagePick": "2.3", "draftsSelectedIn": "4980"},
    {"id": "99999", "averagePick": "40.1", "draftsSelectedIn": "12"},   # unknown id
]}}
PLAYERS = {"players": {"player": [
    {"id": "13593", "name": "Jefferson, Justin", "position": "WR", "team": "MIN"},
    {"id": "11192", "name": "McCaffrey, Christian", "position": "RB", "team": "SF"},
]}}


def test_join_resolves_names_and_sorts_by_adp():
    rows = M.parse(ADP, PLAYERS)
    assert rows[0]["name"] == "Justin Jefferson" and rows[0]["position"] == "WR"
    assert rows[0]["adp"] == 1.5 and rows[1]["adp"] == 2.3        # sorted ascending
    assert rows[1]["name"] == "Christian McCaffrey"


def test_name_normalization_last_first_to_first_last():
    assert M._norm_name("Jefferson, Justin") == "Justin Jefferson"
    assert M._norm_name("Kupp, Cooper") == "Cooper Kupp"
    assert M._norm_name("Mr. Irrelevant") == "Mr. Irrelevant"    # no comma -> unchanged


def test_unknown_id_kept_but_unnamed_and_coverage_reports_it():
    rows = M.parse(ADP, PLAYERS)
    unknown = [r for r in rows if r["mfl_id"] == "99999"][0]
    assert unknown["name"] is None                                # unresolved, not dropped
    cov = M.coverage(rows)
    assert cov["rows"] == 3 and cov["named"] == 2                 # 2 of 3 resolved
    assert cov["named_frac"] == round(2 / 3, 3)


def test_accepts_json_strings_and_field_variants():
    import json
    adp_variant = {"adp": {"player": [{"id": "1", "adp": "5.0"}]}}   # 'adp' not 'averagePick'
    players = {"players": {"player": {"id": "1", "name": "Solo, Han", "position": "QB"}}}  # single dict
    rows = M.parse(json.dumps(adp_variant), json.dumps(players))
    assert len(rows) == 1 and rows[0]["adp"] == 5.0 and rows[0]["name"] == "Han Solo"


def test_missing_adp_value_is_skipped():
    adp = {"adp": {"player": [{"id": "1"}, {"id": "2", "averagePick": "3.0"}]}}
    rows = M.parse(adp, PLAYERS)
    assert len(rows) == 1 and rows[0]["mfl_id"] == "2"
