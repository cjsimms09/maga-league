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


def test_the_two_point_conversions_are_reachable_and_the_biting_set_is_empty():
    """RE-PINNED 2026-08-17 (stale against the same-day scoring-parity fix,
    c0e1fe03 / verified in a99c5270). This used to pin the 2-point conversions
    as UNREACHABLE biting gaps — true while _FP_STAT_MAP covered 9 of 32 priced
    categories. The map was then extended to all 14 priced skill categories and
    the parity re-run came back identical to four decimals: FantasyPros does not
    publish 2-point conversions at all, so there was never anything to drop —
    the concern was real in principle and zero in fact. The pin inverts to the
    fixed state: the 2pt keys are REACHABLE through the map (non-vacuous — they
    must actually be in it) and no skill-biting gap remains."""
    reachable = set(CR.fp_stat_map().values())
    assert {"pass_2pt", "rush_2pt", "rec_2pt"} <= reachable, reachable
    a = CR.audit()
    assert a["unreachable_biting_skill_positions"] == [], (
        a["unreachable_biting_skill_positions"])


def test_sleeper_and_fp_are_both_scored_through_OUR_table_not_the_providers():
    for name in ("sleeper_projections", "fantasypros_projections"):
        note = CR.CAPTURES[name].get("scoring_note") or ""
        assert note, f"{name} must state how it reaches our scoring"
    assert "NEVER the value" in CR.CAPTURES["fantasypros_projections"]["scoring_note"]


def test_the_still_open_holes_are_named_so_none_can_be_forgotten():
    """AMENDED 2026-08-17, later the same day. This first asserted that four
    captures were missing raw retention; two of them (adp_series,
    opportunity_metrics) were then FIXED, so the test went red — which is the
    tripwire working, not a regression. The assertion moves to the new truth
    rather than being deleted.

    The two that remain are the FantasyPros parsers, and they are the ones that
    need a fetcher change rather than an attach change."""
    a = CR.audit()
    missing_raw = set(a["captures_missing_raw"])
    assert missing_raw == set(), (
        "AMENDED AGAIN 2026-08-17: every capture now retains its payload. If "
        "this set is non-empty a NEW capture was added without retention, or "
        "one regressed — either way it is a decision someone has to make out "
        f"loud rather than inherit: {sorted(missing_raw)}")


def test_the_captures_fixed_today_record_that_they_were_fixed():
    """A capture that silently starts passing teaches a future reader nothing.
    Each fix carries its date and what it replaced."""
    for name in ("proj_series", "adp_series", "opportunity_metrics",
                 "fantasypros_adp", "fantasypros_projections"):
        c = CR.CAPTURES[name]
        assert c["raw_retained"] is True, name
        assert "2026-08-17" in (c.get("fixed") or ""), name


def test_proj_series_is_recorded_as_fixed_rather_than_quietly_passing():
    c = CR.CAPTURES["proj_series"]
    assert c["raw_retained"] is True
    assert "2026-08-17" in c.get("fixed", "")
    assert "situation" in c["retains"]


def test_rz_share_is_now_retained_and_the_history_is_recorded():
    """The most expensive instance of the discard pattern: it made a committed
    study report that red-zone vacancy 'is not measured at all' when it had in
    fact been measured. Now retained — and the registry keeps the story, because
    the next reader needs to know that study's limitation is lifted."""
    c = CR.CAPTURES["opportunity_metrics"]
    assert "rz_share" in c["retains"]
    assert "rz_share" not in (c["knowingly_drops"] or {})
    assert "unmeasurable" in (c.get("fixed") or "")


def test_xfp_delta_is_declared_a_real_gap_not_an_implied_field():
    """The docstring promised snap_share and xfp_delta and the function never
    computed either. The fix was to correct the contract, not invent the
    fields — and the remaining gap is filed where it can be acted on."""
    why = CR.CAPTURES["opportunity_metrics"]["knowingly_drops"]["xfp_delta"]
    assert "NOT COMPUTED ANYWHERE" in why


def test_snap_share_gap_narrowed_from_data_to_wiring_when_the_source_landed():
    """THIS TEST IS THE REGISTRY DOING ITS JOB ON ITSELF.

    Until 2026-08-17 the honest entry was "snap_counts, which this repo has
    never pulled: a real gap". The pull landed the same day, and at that moment
    the entry became FALSE — the data existed and the registry still called it
    missing. A registry that goes stale is precisely the defect it was built to
    prevent, so the split is pinned: snap_share is still dropped, but for a
    different and smaller reason, and the reason has to name which one.
    """
    drops = CR.CAPTURES["opportunity_metrics"]["knowingly_drops"]
    why = drops["snap_share"]
    assert "WIRING gap" in why, "the reason must name what is actually missing now"
    assert "never pulled" not in why, "the source WAS pulled; this claim is stale"
    # And the source it points at must actually be registered, so the pointer
    # cannot outlive the thing it points to.
    assert "snap_counts" in CR.CAPTURES


def test_snap_counts_declares_its_strength_honestly_not_just_its_existence():
    """A capture entry that only says "we have it" invites the next reader to
    weight it as though it were strong. This one measured +0.19 year-over-year
    carryover — real, and small. Both halves are load-bearing, so both are
    pinned here: drop the caveat and this test fails."""
    c = CR.CAPTURES["snap_counts"]
    assert c["raw_retained"] is True and c["raw_why_not"] is None
    added = c["added"]
    assert "permutation null" in added, "the claim must cite how it was tested"
    assert "WEAK-BUT-REAL" in added, "the size of the effect must survive in the record"
    # The reason it is worth having at all is the comparison to what exists.
    assert "Spearman 1.0000" in added
