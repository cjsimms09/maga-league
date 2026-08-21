# TERRITORY: C
"""Weekly K/DEF source probe — source-hunt item 3. Pure census/detection
logic tested on fixtures; the two candidate hosts are unreachable from this
sandbox (see module docstring), so their real shape is confirmed only by a
first CI dispatch.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import weekly_kdef_source_probe as P  # noqa: E402


def test_looks_like_kdef_position_recognizes_real_spellings():
    assert P.looks_like_kdef_position("K") == "K"
    assert P.looks_like_kdef_position("PK") == "K"
    assert P.looks_like_kdef_position("DEF") == "DEF"
    assert P.looks_like_kdef_position("DST") == "DEF"
    assert P.looks_like_kdef_position("D/ST") == "DEF"


def test_looks_like_kdef_position_none_for_a_skill_position_or_garbage():
    assert P.looks_like_kdef_position("RB") is None
    assert P.looks_like_kdef_position("WR") is None
    assert P.looks_like_kdef_position(None) is None
    assert P.looks_like_kdef_position(42) is None


def test_looks_like_projection_key_matches_known_conventions():
    assert P.looks_like_projection_key("projectedPoints") is True
    assert P.looks_like_projection_key("fpts") is True
    assert P.looks_like_projection_key("pts_half_ppr") is False  # not in the hint set verbatim


def test_looks_like_projection_key_false_for_unrelated_keys():
    assert P.looks_like_projection_key("player_id") is False
    assert P.looks_like_projection_key("team") is False


def test_find_kdef_rows_matches_a_real_shaped_row():
    payload = {"players": [
        {"name": "Dallas", "position": "DEF", "projectedPoints": 7.4},
        {"name": "Some Kicker", "position": "K", "projectedPoints": 8.1},
        {"name": "Some RB", "position": "RB", "projectedPoints": 15.0},
    ]}
    hits = P.find_kdef_rows(payload)
    positions = sorted(h["position"] for h in hits)
    assert positions == ["DEF", "K"]


def test_find_kdef_rows_finds_a_projection_nested_one_level_under_the_position():
    # the exact bug this module's own first draft shipped with, caught by
    # this file's own known-positive control before it was ever committed:
    # position and projection at DIFFERENT nesting levels must still match.
    payload = {"player_id": "DAL", "position": "DEF", "stats": {"points": 7.4}}
    hits = P.find_kdef_rows(payload)
    assert len(hits) == 1
    assert hits[0]["position"] == "DEF"
    assert hits[0]["projection_value"] == 7.4
    assert hits[0]["projection_path"] == "$.stats"


def test_find_kdef_rows_does_not_borrow_a_projection_from_an_unrelated_sibling():
    # a projection two levels away (a sibling player, not this row's own
    # nested stats) must NOT be attributed to this position.
    payload = {"a": {"position": "DEF"}, "b": {"stats": {"points": 7.4}}}
    assert P.find_kdef_rows(payload) == []


def test_find_kdef_rows_requires_both_position_and_numeric_projection():
    # a DEF-position row with NO numeric projection key must not count
    payload = {"players": [{"name": "Dallas", "position": "DEF", "notes": "bye week"}]}
    assert P.find_kdef_rows(payload) == []


def test_find_kdef_rows_returns_empty_on_an_unrelated_payload():
    assert P.find_kdef_rows({"error": "not found"}) == []
    assert P.find_kdef_rows([]) == []


def test_find_kdef_rows_records_the_real_path_to_the_hit():
    payload = {"data": {"rows": [{"position": "K", "fpts": 9.0}]}}
    hits = P.find_kdef_rows(payload)
    assert hits[0]["path"] == "$.data.rows[0]"


def test_verify_known_positive_passes_on_the_real_shaped_fixture():
    control = P.verify_known_positive()
    assert control["ok"] is True


def test_census_one_reports_unreachable_distinctly_from_a_real_null():
    rec = P.census_one("x", "http://example.com", None, err="TimeoutError: timed out")
    assert "UNREACHABLE" in rec["verdict"]
    assert rec.get("kdef_rows_found") is None  # never counted as a null


def test_census_one_reports_a_real_positive():
    payload = '{"players": [{"position": "K", "projectedPoints": 8.5}]}'
    rec = P.census_one("x", "http://example.com", payload)
    assert rec["kdef_rows_found"] == 1
    assert "POSITIVE" in rec["verdict"]


def test_census_one_reports_a_real_null_distinct_from_unreachable():
    payload = '{"players": [{"position": "RB", "projectedPoints": 15.0}]}'
    rec = P.census_one("x", "http://example.com", payload)
    assert rec["kdef_rows_found"] == 0
    assert "NULL" in rec["verdict"]


def test_census_one_handles_non_json_without_crashing():
    rec = P.census_one("x", "http://example.com", "<html>not json</html>")
    assert rec["error"] == "not JSON"
    assert "NOT JSON" in rec["verdict"]


def test_summarise_distinguishes_all_unreachable_from_a_genuine_null():
    all_dead = [{"source": "a", "error": "x"}, {"source": "b", "error": "y"}]
    assert "UNREACHABLE" in P.summarise(all_dead)["headline"]
    genuine_null = [{"source": "a", "kdef_rows_found": 0}]
    assert "NO CANDIDATE" in P.summarise(genuine_null)["headline"]
