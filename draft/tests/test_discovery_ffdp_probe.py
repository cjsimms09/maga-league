# TERRITORY: C
"""FFDP discovery probe — the pure half, tested without any live network.

Run: python3 -m pytest draft/tests/test_discovery_ffdp_probe.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import discovery_ffdp_probe as FFDP  # noqa: E402


# ── extract_endpoint_examples: read the provider's own words ───────────────

def test_extract_endpoint_examples_FINDS_A_FULL_URL_IN_A_CODE_BLOCK():
    """MUTATION: return [] unconditionally — the scrape would never surface
    an endpoint the docs page spells out, and every run would silently fall
    through to the declared guesses even when the real answer was on screen."""
    html = ("<p>Try it:</p><pre><code>curl "
           "https://www.fantasyfootballdatapros.com/api/players/2020/1"
           "</code></pre>")
    out = FFDP.extract_endpoint_examples(html)
    assert "https://www.fantasyfootballdatapros.com/api/players/2020/1" in out


def test_extract_endpoint_examples_FINDS_A_BARE_API_PATH():
    """A docs page might show a relative path (`/api/players/{season}`)
    rather than a full URL. MUTATION: only match full https:// URLs — a
    relative-path docs example would be silently missed."""
    html = "GET <code>/api/season/2024</code> for full-season totals"
    out = FFDP.extract_endpoint_examples(html)
    assert "/api/season/2024" in out


def test_extract_endpoint_examples_DEDUPES_AND_STRIPS_TRAILING_PUNCTUATION():
    """A URL at the end of a sentence commonly picks up a trailing period or
    quote. MUTATION: drop the rstrip — every sentence-final URL comes back
    with garbage appended and never matches a real fetch."""
    html = ("See https://www.fantasyfootballdatapros.com/api/players/2024/1. "
           "Also see https://www.fantasyfootballdatapros.com/api/players/2024/1.")
    out = FFDP.extract_endpoint_examples(html)
    assert out == ["https://www.fantasyfootballdatapros.com/api/players/2024/1"]


def test_extract_endpoint_examples_ON_EMPTY_HTML_IS_EMPTY_NOT_A_CRASH():
    assert FFDP.extract_endpoint_examples("") == []
    assert FFDP.extract_endpoint_examples(None) == []


# ── walk_keys: never a fixed path into the payload ──────────────────────────

def test_walk_keys_FINDS_A_TOP_LEVEL_KEY():
    assert "ceiling" in FFDP.walk_keys({"player": "X", "ceiling": 31.2})


def test_walk_keys_FINDS_A_NESTED_KEY():
    """FantasyPros' own projections nest stats one level down
    (`{"stats": {...}}`) — FFDP's response shape is unconfirmed, so this must
    not assume flat. MUTATION: only read top-level keys — a nested `stats:
    {ceiling: ...}` shape reports `ceiling` absent when it is one level
    down, exactly the trap `fantasypros_adp.parse_projections` already had to
    handle for a different provider."""
    payload = {"player": "X", "stats": {"ceiling": 31.2, "floor": 8.0}}
    keys = FFDP.walk_keys(payload)
    assert {"ceiling", "floor", "stats", "player"} <= keys


def test_walk_keys_WALKS_A_LIST_OF_PLAYER_RECORDS():
    """The realistic shape: a season/week endpoint almost certainly returns a
    list of player rows, not one dict. MUTATION: only handle dict inputs — a
    real player-list response would report zero keys found."""
    payload = [{"name": "A", "ceiling": 10}, {"name": "B", "ceiling": 20}]
    assert FFDP.walk_keys(payload) == {"name", "ceiling"}


def test_walk_keys_CAPS_DEPTH_rather_than_recursing_forever():
    """A self-referential or pathological structure must not hang the probe.
    MUTATION: drop the depth cap — a payload nested deeper than Python's
    recursion limit crashes the whole run instead of returning a partial
    (and honestly capped) key set."""
    node = {"k0": None}
    cur = node
    for i in range(1, 30):
        cur["k%d" % i] = {}
        cur = cur["k%d" % i]
    keys = FFDP.walk_keys(node)
    # depth-capped at 12: k0..k12 should appear, deeper ones should not all
    assert "k0" in keys and "k12" in keys
    assert "k25" not in keys


# ── classify_fields: every unmatched key travels, nothing is dropped ───────

def test_classify_fields_FINDS_CEILING_AND_FLOOR():
    keys = {"player_name", "position", "proj_ceiling", "proj_floor", "team"}
    out = FFDP.classify_fields(keys)
    assert out["families"]["ceiling"] == ["proj_ceiling"]
    assert out["families"]["floor"] == ["proj_floor"]
    assert out["counts"]["ceiling"] == 1 and out["counts"]["floor"] == 1


def test_classify_fields_MATCHES_ALTERNATE_SPELLINGS():
    """MUTATION: match only the literal string 'ceiling' — a real API is
    just as likely to call it `upside`, `p90`, or `best_case`, and a probe
    that misses those reports a false NULL on a field that is actually
    there."""
    keys = {"upside", "p90_points", "best_case_pts", "downside", "p10_points"}
    out = FFDP.classify_fields(keys)
    assert set(out["families"]["ceiling"]) == {"upside", "p90_points", "best_case_pts"}
    assert set(out["families"]["floor"]) == {"downside", "p10_points"}


def test_classify_fields_UNCLASSIFIED_KEYS_ARE_NEVER_DROPPED():
    """MUTATION: only return the matched families — the field this probe
    exists to find is the one whose NAME nobody anticipated, and dropping
    unmatched keys would make that miss silent instead of visible."""
    keys = {"pass_yds", "some_totally_novel_field_name"}
    out = FFDP.classify_fields(keys)
    assert "some_totally_novel_field_name" in out["unclassified"]
    assert out["unclassified_count"] == len(out["unclassified"])


def test_classify_fields_ON_EMPTY_KEYS_REFUSES_NOTHING():
    out = FFDP.classify_fields(set())
    assert out["families"] == {n: [] for n in FFDP.FAMILIES}
    assert out["unclassified"] == []


# ── report: three verdict shapes, never a bare boolean ──────────────────────

def test_report_IS_UNMEASURED_WHEN_NOTHING_ANSWERED():
    """MUTATION: report a 404 as 'FFDP has no ceiling field' — every
    candidate here is a guess made by this file, and a failed guess proves
    only that the guess was wrong, the same discipline
    external_odds_probe.discovery_report already states."""
    rep = FFDP.report([], [{"url": "https://x/y", "status": 404, "reason": "guess"}],
                      FFDP.classify_fields(set()))
    assert rep["verdict"].startswith("UNMEASURED")
    assert rep["answered_count"] == 0


def test_report_IS_ACTIONABLE_WHEN_A_CEILING_FIELD_IS_FOUND():
    tried = [{"url": "https://x/y", "status": 200, "keys": ["name", "proj_ceiling"]}]
    classified = FFDP.classify_fields({"name", "proj_ceiling"})
    rep = FFDP.report([], tried, classified)
    assert rep["verdict"].startswith("ACTIONABLE")
    assert rep["ceiling_field_found"] is True


def test_report_IS_NULL_WHEN_A_REAL_PAYLOAD_HAS_NO_CEILING_FIELD():
    """A genuine negative — a payload came back and it just doesn't have the
    field. MUTATION: treat this the same as UNMEASURED — a real, answered
    negative is a much stronger fact than a guess that never landed, and
    collapsing the two would hide that a real player payload was actually
    inspected and found wanting."""
    tried = [{"url": "https://x/y", "status": 200,
             "keys": ["name", "pass_yds", "proj_points"]}]
    classified = FFDP.classify_fields({"name", "pass_yds", "proj_points"})
    rep = FFDP.report([], tried, classified)
    assert rep["verdict"].startswith("NULL")
    assert rep["ceiling_field_found"] is False


def test_report_RECORDS_DOCS_ENDPOINTS_FOUND_EVEN_ON_A_NULL():
    rep = FFDP.report(["/api/players/2024/1"], [], FFDP.classify_fields(set()))
    assert rep["docs_endpoints_found"] == ["/api/players/2024/1"]


def test_FALLBACK_CANDIDATES_ARE_ALL_HTTPS_and_EACH_CARRIES_A_REASON():
    """Every fallback guess must be a URL this repo can actually fetch, and
    every one must state WHY it's plausible — an undeclared guess is
    indistinguishable from a random string when someone reads the artifact
    later. MUTATION: leave a candidate with an empty reason — the artifact
    would carry a guess nobody can evaluate."""
    for url, reason in FFDP.FALLBACK_CANDIDATES:
        assert url.startswith("https://")
        assert reason and len(reason) > 10
