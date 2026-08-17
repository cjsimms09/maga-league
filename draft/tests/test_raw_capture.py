# TERRITORY: A
"""Keep the response, and say when it was taken vs what it describes.

Cory, 2026-08-17: "I want all the data we can possibly get... this is literally
the base of our model, without this we are building a model on top of shit."
And: "Maintains that historical data doesn't get mixed in with this years data."

Two requirements, one primitive. These tests pin both, and pin the distinction
that makes retention safe rather than dangerous: KEEPING data and GRADING it are
different decisions.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import raw_capture as RAW  # noqa: E402


def test_a_contemporaneous_pull_is_a_real_forecast():
    c = RAW.classify_lag(2026, 2026)
    assert c["lag_seasons"] == 0
    assert c["provenance"] == "contemporaneous"
    assert c["gradeable_without_review"] is True


def test_a_retrospective_pull_is_retained_but_not_gradeable_on_sight():
    """The exp33 lesson as a data structure. A 2023 projection fetched in 2026
    comes off a live endpoint that has been rewritten since — it may already
    know who got hurt. We KEEP it; we do not let it be graded by accident."""
    c = RAW.classify_lag(2026, 2023)
    assert c["lag_seasons"] == 3
    assert c["provenance"] == "retrospective"
    assert c["gradeable_without_review"] is False
    assert "exp33" in c["why"]


def test_the_boundary_is_a_named_constant_not_a_magic_number():
    assert RAW.LEAK_SUSPECT_LAG == 1
    assert RAW.classify_lag(2026, 2027)["gradeable_without_review"] is True


def test_retain_keeps_the_bytes_verbatim(tmp_path):
    text = '{"players":[{"name":"A","weird_key_no_parser_knows":7}]}'
    e = RAW.retain("fp_test", 2026, text, "http://x", {"tried": 1}, as_of="2026-08-17",
                   root=tmp_path)
    stored = (tmp_path / "fp_test" / "2026__asof_2026-08-17.raw").read_text()
    assert stored == text, "the payload must be kept EXACTLY as served"
    assert "weird_key_no_parser_knows" in stored, (
        "the whole point is keeping what today's whitelist would drop")
    assert e["bytes"] == len(text)
    assert e["sha256_16"] == RAW.fingerprint(text)


def test_both_dates_ride_on_every_entry(tmp_path):
    e = RAW.retain("s", 2023, "x", as_of="2026-08-17", root=tmp_path)
    assert e["as_of"] == "2026-08-17" and e["as_of_season"] == 2026
    assert e["applies_to"] == 2023
    assert e["provenance"] == "retrospective", (
        "as_of and applies_to differing by three seasons IS the leak question — "
        "a filename cannot carry that and a consumer cannot check a filename")


def test_a_same_day_rerun_replaces_rather_than_doubling(tmp_path):
    RAW.retain("s", 2026, "one", as_of="2026-08-17", root=tmp_path)
    RAW.retain("s", 2026, "two", as_of="2026-08-17", root=tmp_path)
    rows = RAW.manifest(tmp_path)
    assert len(rows) == 1 and rows[0]["sha256_16"] == RAW.fingerprint("two")


def test_different_fetch_dates_are_separate_records(tmp_path):
    RAW.retain("s", 2026, "one", as_of="2026-08-17", root=tmp_path)
    RAW.retain("s", 2026, "two", as_of="2026-08-18", root=tmp_path)
    assert len(RAW.manifest(tmp_path)) == 2, (
        "two fetches of the same season on different days are two observations, "
        "and the drift between them is a thing worth being able to see")


def test_gradeable_filters_out_the_leak_suspects(tmp_path):
    RAW.retain("s", 2026, "clean", as_of="2026-08-17", root=tmp_path)
    RAW.retain("s", 2023, "suspect", as_of="2026-08-17", root=tmp_path)
    ok = RAW.gradeable(root=tmp_path)
    assert [e["applies_to"] for e in ok] == [2026]
    assert len(RAW.manifest(tmp_path)) == 2, "both are RETAINED; only one is gradeable"


def test_the_manifest_states_the_keep_versus_grade_rule(tmp_path):
    RAW.retain("s", 2026, "x", as_of="2026-08-17", root=tmp_path)
    doc = json.loads((tmp_path / "MANIFEST.json").read_text())
    assert "different decisions" in doc["_note"]


def test_the_fp_historical_pull_actually_retains_both_payloads():
    """A primitive nobody calls leaves the hole open while looking fixed."""
    src = (Path(__file__).resolve().parents[1] / "backtest"
           / "exp_fp_hist_proj.py").read_text()
    assert 'RAW.retain("fantasypros_adp"' in src
    assert 'RAW.retain("fantasypros_projections"' in src
