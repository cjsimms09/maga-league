# TERRITORY: C
"""Does FantasyPros' real ADP payload carry a Best/Worst range we drop?

Run: python3 -m pytest draft/tests/test_discovery_fp_adp_field_census.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import discovery_fp_adp_field_census as C  # noqa: E402


def test_walk_keys_FINDS_A_NESTED_KEY():
    payload = {"players": [{"name": "X", "best": 3, "worst": 40}]}
    keys = C.walk_keys(payload)
    assert {"players", "name", "best", "worst"} <= keys


def test_classify_fields_FINDS_THE_RANGE_FAMILY():
    """MUTATION: leave out the `range` family — this repo's real earlier
    guess (ceiling/floor points vocabulary) would silently miss FantasyPros'
    ACTUAL known column names (Best/Worst/Std Dev), which is a different
    vocabulary for a related-but-different quantity."""
    keys = {"player_name", "adp", "best", "worst", "std_dev"}
    out = C.classify_fields(keys)
    assert set(out["families"]["range"]) == {"best", "worst", "std_dev"}


def test_classify_fields_min_max_NEEDS_WORD_BOUNDARIES_not_substrings():
    """`\\bmin\\b` requires MIN as its own token — `min_teams` is one
    underscore-joined word to a regex engine (`_` counts as `\\w`), so it
    must NOT match. MUTATION: use a bare `min|max` substring pattern instead
    of the word-bounded one — `min_teams`/`max_bid` (unrelated fields with
    no connection to a points or pick range) would false-positive into
    `range` on every single run, drowning the one real hit in noise."""
    keys = {"min_teams", "max_bid"}
    out = C.classify_fields(keys)
    assert out["families"]["range"] == []
    assert set(out["unclassified"]) == {"min_teams", "max_bid"}


def test_classify_fields_A_BARE_min_max_KEY_DOES_MATCH():
    """The word-boundary rule's other side: an exact `min`/`max` key (no
    underscore suffix) is a real candidate and must not be missed either."""
    keys = {"min", "max"}
    out = C.classify_fields(keys)
    assert set(out["families"]["range"]) == {"min", "max"}


def test_classify_fields_UNCLASSIFIED_KEYS_ARE_NEVER_DROPPED():
    keys = {"pass_yds", "some_field_nobody_anticipated"}
    out = C.classify_fields(keys)
    assert "some_field_nobody_anticipated" in out["unclassified"]


def test_report_IS_UNMEASURED_ON_AN_EMPTY_FETCH():
    """MUTATION: report an empty fetch as NULL — a failed fetch would then
    read as proof FantasyPros carries no range field, when it proves nothing
    about the provider at all."""
    rep = C.report(None, "https://x", {"page_error": "Timeout"}, {})
    assert rep["verdict"].startswith("UNMEASURED")


def test_report_IS_ACTIONABLE_WHEN_A_RANGE_FIELD_IS_FOUND():
    classified = C.classify_fields({"name", "adp", "best", "worst"})
    rep = C.report("some real text", "https://x", {}, classified)
    assert rep["verdict"].startswith("ACTIONABLE")
    assert rep["range_field_found"] is True


def test_report_IS_NULL_WHEN_A_REAL_PAYLOAD_HAS_NO_RANGE_FIELD():
    classified = C.classify_fields({"name", "adp", "pass_yds"})
    rep = C.report("some real text", "https://x", {}, classified)
    assert rep["verdict"].startswith("NULL")
    assert rep["range_field_found"] is False


def test_probe_END_TO_END_AGAINST_A_FAKE_fantasypros_adp_module(monkeypatch):
    """Full dry run with the network layer faked, proving the pieces
    actually connect — the same integration check
    `discovery_ffdp_probe`'s manual dry run used."""
    import json as _json
    import fantasypros_adp as FPA

    fake_payload = _json.dumps({"players": [
        {"player_name": "Josh Allen", "adp": 5.2, "best": 1, "worst": 22,
         "std_dev": 4.1}]})
    monkeypatch.setattr(FPA, "fetch",
                        lambda year, half_ppr=True, timeout=30:
                        (fake_payload, "https://fake", {"page_url": "https://fake"}))
    rep = C.probe(year=2026)
    assert rep["range_field_found"] is True
    assert rep["verdict"].startswith("ACTIONABLE")
