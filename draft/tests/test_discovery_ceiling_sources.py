"""THE PROBE MUST BE ABLE TO FIND A CEILING BEFORE ITS "NO CEILING" MEANS ANYTHING.

Register 4t. Every ceiling-source check we have run so far reported a clean null,
and at least one of them (`fp-projections-probe.yml`) COULD NOT HAVE REPORTED
ANYTHING ELSE — it filters the payload through `_FP_STAT_MAP`, a 9-key whitelist,
before anything inspects it. A `ceiling` field would have been dropped on the way
in and the probe would still have printed its green verdict.

So the first test here is the known-positive control: feed the census a payload
that DOES carry a points ceiling and fail if it comes back null.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import discovery_ceiling_sources as D  # noqa: E402


# A payload shaped like FP's real projections response, but carrying the field we
# are hunting. If the probe cannot see this, it cannot see a real one either.
PAYLOAD_WITH_CEILING = json.dumps({
    "players": [
        {"player_name": "Josh Allen", "player_position_id": "QB",
         "stats": {"points_half": 372.3, "ceiling": 441.8, "floor_pts": 288.0}},
        {"player_name": "Bijan Robinson", "player_position_id": "RB",
         "stats": {"points_half": 288.1, "ceiling": 361.4, "floor_pts": 201.5}},
    ]
})

# The same shape with NOTHING around the mean — the real 2026-08-16 FP capture.
PAYLOAD_WITHOUT = json.dumps({
    "players": [
        {"player_name": "Josh Allen", "player_position_id": "QB",
         "stats": {"points": 372.3, "points_half": 372.3, "pass_yds": 3816.9}},
    ]
})

# FP's rankings family: real per-player dispersion, but in RANK space.
PAYLOAD_RANK_ONLY = json.dumps({
    "players": [
        {"player_name": "Josh Allen", "rank_ecr": 12, "rank_min": 4,
         "rank_max": 31, "rank_std": 6.2},
    ]
})


def test_KNOWN_POSITIVE_a_real_ceiling_field_is_actually_found():
    """The control. If this fails, every null this probe reports is worthless."""
    rec = D.census_one("fixture", "https://example/x", PAYLOAD_WITH_CEILING)
    found = {c["key"] for c in rec["points_range_candidates"]}
    assert "ceiling" in found, f"census MISSED a literal ceiling field: {rec}"
    assert "floor_pts" in found, f"census MISSED a literal floor field: {rec}"
    assert rec["verdict"].startswith("🎯"), rec["verdict"]


def test_known_positive_survives_nesting_the_whitelist_probe_would_have_dropped():
    """`_FP_STAT_MAP` drops unknown keys; this must not. Bury it two levels deeper."""
    deep = json.dumps({"data": {"rows": [{"player": {"name": "X"},
                                          "proj": {"detail": {"ceiling": 400.0}}}]}})
    rec = D.census_one("fixture", "u", deep)
    assert any(c["key"] == "ceiling" for c in rec["points_range_candidates"]), rec


def test_a_payload_with_no_range_reports_a_plain_null():
    rec = D.census_one("fixture", "u", PAYLOAD_WITHOUT)
    assert rec["points_range_candidates"] == []
    assert rec["verdict"].startswith("NULL")


def test_rank_dispersion_is_reported_as_real_but_NOT_as_a_points_ceiling():
    """The bug in the last census: `rank_min`/`rank_max`/`rank_std` were present,
    got filed under `unclassified`, and the verdict said "NULL". They are not a
    points ceiling — but they ARE per-player outside-sourced dispersion we discard,
    and the artifact has to say so out loud."""
    rec = D.census_one("fixture", "u", PAYLOAD_RANK_ONLY)
    assert rec["points_range_candidates"] == [], "rank space is not a points ceiling"
    got = {k["key"] for k in rec["known_not_a_point_range"]}
    assert {"rank_min", "rank_max", "rank_std"} <= got, rec
    assert "currently discarded" in rec["verdict"], rec["verdict"]


def test_unreachable_is_not_reported_as_a_null():
    """A 403 is not evidence that a field is absent. This distinction is the whole
    reason four 'stated limits' collapsed on 08-17 when someone checked the disk."""
    rec = D.census_one("fixture", "u", None, err="HTTPError: 403")
    assert "UNREACHABLE" in rec["verdict"]
    assert "do not read as a null" in rec["verdict"]
    assert rec.get("points_range_candidates") is None


def test_non_json_retains_the_raw_head_instead_of_shrugging():
    rec = D.census_one("fixture", "u", "<html><body>login required</body></html>")
    assert rec["error"] == "not JSON"
    assert "login required" in rec["raw_head"]


def test_walk_keys_counts_rather_than_just_collecting():
    """A key on 3 of 600 rows is a different fact from a key on all 600."""
    keys = D.walk_keys(json.loads(PAYLOAD_WITH_CEILING))
    assert keys["ceiling"] == 2, keys
    assert keys["player_name"] == 2, keys


def test_sample_rows_are_verbatim_not_summarised():
    rec = D.census_one("fixture", "u", PAYLOAD_WITH_CEILING)
    rows = rec["sample_rows_verbatim"]
    assert rows and rows[0]["stats"]["ceiling"] == 441.8, rows


def test_summary_never_calls_an_unreachable_endpoint_a_null():
    recs = [D.census_one("a", "u", None, err="HTTPError: 403")]
    s = D.summarise(recs)
    assert s["endpoints_unreachable"] == ["a"]
    assert "Unreachable is NOT a null" in s["reminder"]


def test_summary_leads_with_the_hit_when_there_is_one():
    recs = [D.census_one("fp", "u", PAYLOAD_WITH_CEILING),
            D.census_one("other", "u", PAYLOAD_WITHOUT)]
    s = D.summarise(recs)
    assert s["headline"].startswith("A PUBLISHED POINTS RANGE EXISTS")
    assert "ceiling" in s["headline"]


def test_summary_falls_back_to_rank_dispersion_when_no_points_range_exists():
    recs = [D.census_one("fp_ecr", "u", PAYLOAD_RANK_ONLY),
            D.census_one("fp_proj", "u", PAYLOAD_WITHOUT)]
    s = D.summarise(recs)
    assert "NO SOURCE PROBED PUBLISHES A POINTS CEILING" in s["headline"]
    assert "rank_min" in s["headline"]


def test_candidate_list_covers_the_endpoints_register_4t_names():
    """The ECR endpoint is the one never tried; if it silently drops off the list
    the probe answers a question we already answered."""
    names = {n for n, _ in D.candidates(2026)}
    assert "fp_ecr_draft" in names
    assert "fp_ecr_draft_experts" in names
    assert "sleeper_projections" in names
    for _, url in D.candidates(2026):
        assert "2026" in url, url


@pytest.mark.parametrize("key,why", [
    ("MIN", "team"),                       # Minnesota, a real key in the Sleeper capture
    ("adp_dynasty_std", "pick"),           # real key, no hand-list had it
    ("adp_std", "pick"),
    ("rank_std", "rank"),
    ("rank_min", "rank"),
    ("pts_std", "format"),
    ("pts_allow_max", "DEF"),              # `pts_allow_0` never even reads as range-shaped
])
def test_real_world_false_positives_are_suppressed_with_a_stated_reason(key, why):
    """Every one of these came out of a REAL captured payload, not from imagination —
    found by replaying this classifier over the 2026-08-16 evidence file."""
    assert D.RANGE_SHAPED.search(key), f"{key} should still be range-SHAPED"
    assert D.why_not_a_point_range(key), f"{key} was not suppressed"


@pytest.mark.parametrize("key", [
    "ceiling", "proj_ceiling", "floor", "proj_high", "pointsHigh", "points_ceiling",
    "high_projection", "best_case_pts", "p90_points", "upside_points",
    "projection_std", "points_std", "fpts_high", "proj_range",
])
def test_nothing_that_could_be_a_real_ceiling_is_ever_suppressed(key):
    """THE GUARD ON THE GUARD. `why_not_a_point_range` is the one function here that
    can hide the answer we are hunting. Note `projection_std` and `points_std`: they
    carry `std` like `rank_std` does, but with no `rank`/`adp` token — so they are a
    dispersion IN POINTS and must survive. If a future rule broadens and swallows
    them, this fails."""
    assert D.RANGE_SHAPED.search(key), key
    assert D.why_not_a_point_range(key) is None, (
        f"{key} was suppressed as {D.why_not_a_point_range(key)!r} — that is a real "
        f"ceiling candidate being hidden")


def test_the_real_fp_capture_still_reports_a_clean_null():
    """Replay against the actual 596-row FantasyPros payload committed on 2026-08-16.
    This is the behavioural answer to Cory's 'don't think we ever got' — we did, and
    it carries nothing around the mean."""
    p = Path(__file__).resolve().parents[2] / "draft/audit/proj_correctness_evidence_2026-08-16.json"
    if not p.exists():
        pytest.skip("evidence file absent")
    fp = json.loads(p.read_text())["fantasypros"]
    rec = D.census_one("fp_real", "replay", json.dumps({"players": fp["raw_rows"]}))
    assert rec["key_count"] > 30, "replayed the wrong thing — too few keys"
    assert rec["points_range_candidates"] == [], rec["points_range_candidates"]


@pytest.mark.parametrize("key", ["ceiling", "high", "best_case", "p90", "upside",
                                 "proj_high", "pointsHigh", "std_dev", "spread"])
def test_the_pattern_catches_every_vocabulary_a_source_might_use(key):
    """Sources do not agree on a name. A pattern that only knows 'ceiling' is how a
    published field reads as absent."""
    assert D.RANGE_SHAPED.search(key), key


@pytest.mark.parametrize("key", ["points", "points_half", "pass_yds", "rush_tds",
                                 "player_name", "team", "rec_yds"])
def test_the_pattern_does_not_fire_on_ordinary_projection_fields(key):
    """The other half of a usable pattern: if everything matches, nothing is a hit."""
    assert not D.RANGE_SHAPED.search(key), key
