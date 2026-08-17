# TERRITORY: A
"""The capture registry is a GATE, not documentation.

Cory, 2026-08-17: "Also fixing all these things for future pulls?"

Five instances of the same discard defect were found in one day. A list of five
one-time fixes does not stop the sixth, so these tests make the sixth fail in CI
instead of being found by accident a year later.

The model is season_stamp's field registry, which made an unclassified board
field a test failure and caught the draft-capital column the morning it was
added. Same shape, one layer up: a capture must DECLARE what it keeps and drops,
and the declaration is CHECKED against the code and the live config rather than
believed.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import capture_registry as CR  # noqa: E402


def test_every_capture_declares_the_three_things_that_matter():
    for name, c in CR.CAPTURES.items():
        assert c.get("module"), name
        assert "retains" in c and c["retains"], name
        assert "knowingly_drops" in c, name
        assert isinstance(c["raw_retained"], bool), name


def test_a_capture_that_drops_the_raw_payload_must_say_why():
    """'We only parse what we need' is not a reason — that IS the defect. Every
    such capture has to carry a queue position instead."""
    for name, c in CR.CAPTURES.items():
        if not c["raw_retained"]:
            why = c.get("raw_why_not") or ""
            assert why, f"{name} drops the raw payload with no reason"
            assert "QUEUED" in why, (
                f"{name}: a dropped payload is a defect with a queue position, "
                "never a settled design")


def test_every_declared_drop_carries_a_real_explanation():
    for name, c in CR.CAPTURES.items():
        for field, why in (c["knowingly_drops"] or {}).items():
            assert len(why) > 40, f"{name}.{field} has a stub explanation"


def test_the_fp_stat_map_is_readable_and_is_a_whitelist():
    m = CR.fp_stat_map()
    assert m, "the FP stat map could not be read — this gate is blind"
    assert len(m) < 30, (
        "a small whitelist is the point of the warning; if this grew a lot, "
        "unreachable_scored_keys below is the number that must be re-read")


def test_the_fp_scoring_gap_is_COMPUTED_against_the_live_config():
    """THE GATE THAT MATTERS. If anyone adds a scoring category, or FP starts
    serving a stat we do not map, this number moves and someone has to decide.
    That is the difference between a comment that goes stale and a gate."""
    unreachable = CR.unreachable_scored_keys()
    priced = CR.priced_categories()
    reachable = set(CR.fp_stat_map().values())
    assert set(unreachable) == priced - reachable
    assert unreachable, "no gap at all would mean the map or the config failed to load"


def test_the_two_point_conversions_are_flagged_as_biting_skill_positions():
    """K and DEF being unreachable is an EXPECTED absence — FP's feed does not
    cover them and the board records that. The 2-point conversions are the ones
    that silently understate a real skill-position FP column against Sleeper's
    full stat line, so they are surfaced separately."""
    a = CR.audit()
    assert set(a["unreachable_biting_skill_positions"]) == {
        "pass_2pt", "rush_2pt", "rec_2pt"}


def test_sleeper_and_fp_are_both_scored_through_OUR_table_not_the_providers():
    for name in ("sleeper_projections", "fantasypros_projections"):
        note = CR.CAPTURES[name].get("scoring_note") or ""
        assert note, f"{name} must state how it reaches our scoring"
    assert "NEVER the value" in CR.CAPTURES["fantasypros_projections"]["scoring_note"]


def test_the_known_open_holes_are_all_present_so_none_can_be_forgotten():
    """Each of these was found on 2026-08-17 and is still open. Removing one
    from the registry without fixing it should be hard, so the test names them."""
    a = CR.audit()
    missing_raw = set(a["captures_missing_raw"])
    for expected in ("adp_series", "opportunity_metrics",
                     "fantasypros_adp", "fantasypros_projections"):
        assert expected in missing_raw, (
            f"{expected} was dropped from the open-hole list — was it actually "
            "fixed, or just removed from the registry?")


def test_proj_series_is_recorded_as_fixed_rather_than_quietly_passing():
    c = CR.CAPTURES["proj_series"]
    assert c["raw_retained"] is True
    assert "2026-08-17" in c.get("fixed", "")
    assert "situation" in c["retains"]


def test_rz_share_is_named_as_computed_then_discarded():
    """The most expensive instance: it made a committed study report that
    red-zone vacancy 'is not measured at all' when it was measured."""
    why = CR.CAPTURES["opportunity_metrics"]["knowingly_drops"]["rz_share"]
    assert "CONSUMED" in why and "0 of 682" in why
