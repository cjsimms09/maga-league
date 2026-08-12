# TERRITORY: C
"""EVERY MUTATION HERE TURNS A PROBE DEFECT INTO A FACT ABOUT SLEEPER."""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import sleeper_pool as S  # noqa: E402

OURS = {"total_rosters": 10,
        "scoring_settings": {"rec": 0.5, "pass_td": 6.0},
        "settings": {"max_keepers": 3},
        "roster_positions": ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"]
                            + ["BN"] * 6}


def test_OUR_OWN_LEAGUE_matches_or_the_probe_is_broken():
    """THE POSITIVE CONTROL. Our league is known 10-team, half-PPR, keepers,
    single-QB. If the probe cannot recognise OURS, a zero elsewhere is about the
    probe. MUTATION: any screen clause that mis-reads Sleeper's shape — and MFL's
    draftType came back SFIRSTRANDOM, so this is the expected failure, not a
    hypothetical one."""
    ok, why = S.screen(OURS)
    assert ok is True, why


def test_UNREADABLE_is_never_scored_as_a_MISMATCH():
    """The distinction that kept MFL's 74 unreadable leagues from becoming evidence
    about the pool. MUTATION: return a plain False. A probe that cannot parse a
    response reports the pool as not matching, and the failure reads as format
    rarity — which is precisely how the first MFL run would have lied."""
    ok, why = S.screen({"scoring_settings": {"rec": 0.5}, "settings": {"max_keepers": 1}})
    assert ok is False and why.startswith("unreadable:")
    ok2, why2 = S.screen(dict(OURS, scoring_settings={"pass_td": 6.0}))
    assert ok2 is False and "unreadable:no rec term" in why2


def test_a_REAL_mismatch_is_labelled_by_its_CAUSE_not_lumped():
    for lg, want in ((dict(OURS, total_rosters=12), "teams:12"),
                     (dict(OURS, scoring_settings={"rec": 1.0, "pass_td": 4}), "rec:1.0"),
                     (dict(OURS, settings={"max_keepers": 0}), "no_keepers")):
        ok, why = S.screen(lg)
        assert ok is False and why == want, (why, want)


def test_TE_PREMIUM_is_its_own_format_not_half_PPR_with_a_caveat():
    """The same split F1 makes on the MFL side, where 16 distinct TE/split shapes
    were the long tail that closed F7. MUTATION: read only `rec` — a TE-premium
    league counts as half-PPR and the match rate is inflated by the exact family
    that made MFL's pool unusable."""
    ok, why = S.screen(dict(OURS, scoring_settings={"rec": 0.5, "rec_te": 0.5, "pass_td": 6}))
    assert ok is False and "te_premium" in why


def test_SUPERFLEX_is_caught_by_slots_AND_by_a_second_QB():
    for rp in (["QB", "SUPER_FLEX", "RB"], ["QB", "QB", "RB"]):
        ok, why = S.screen(dict(OURS, roster_positions=rp + ["BN"]))
        assert ok is False and why == "superflex", (rp, why)


def test_an_AUTH_WALL_RAISES_rather_than_reading_as_an_empty_pool():
    """The question that decides the route. MUTATION: return [] on a non-list. An
    auth wall on the referral edge reads as 'this user has no other leagues', the
    crawl terminates at one league, and the route is reported closed on a
    permission error."""
    with pytest.raises(TypeError):
        S.league_ids({"error": "not permitted"})
    with pytest.raises(TypeError):
        S.user_ids({"message": "unauthorized"})
    assert S.league_ids([{"league_id": "1"}, {"league_id": "2"}]) == ["1", "2"]


def test_the_keeper_key_is_tried_under_every_name_it_has_had():
    """Sleeper's settings keys have varied by era. MUTATION: read only max_keepers —
    older leagues report 'no keeper key' and are scored as unreadable, shrinking the
    denominator in the direction that makes the pool look worse."""
    for k in ("max_keepers", "keepers", "num_keepers"):
        n, why = S.keeper_count({"settings": {k: 2}})
        assert n == 2 and why is None, k
    n, why = S.keeper_count({"settings": {"nothing": 1}})
    assert n is None and "tried" in why


def test_a_pick_with_NO_time_field_says_so_rather_than_defaulting():
    """Q3 decides whether D7's construction transfers. MUTATION: return True on
    absence — a pool with no per-pick times looks constructible and the
    multi-day-draft leak comes back."""
    ok, k = S.pick_has_timestamp({"pick_no": 1, "player_id": "x"})
    assert ok is False and "no time field" in k
    assert S.pick_has_timestamp({"pick_no": 1, "pick_time": 172})[0] is True
    assert S.pick_has_timestamp({"metadata": {"pick_time": 172}}) == (True, "metadata.pick_time")


def test_the_bid_is_looked_for_at_EVERY_path_before_concluding_there_is_none():
    """`history_export.py` reads t["settings"]["waiver_bid"], gets null for all 648
    waiver transactions across three seasons, and records "this league has no bids".
    THE LEAGUE SETTINGS DISAGREE: waiver_budget 100, waiver_type 1.

    Both cannot be right, and the failure is SELF-CONFIRMING — a reader pointed at
    the wrong path gets null, null reads as absence, and absence becomes a recorded
    fact. MUTATION: check one path. The wrong path returns 'no bids' forever and the
    conclusion is supported by data never consulted."""
    assert S.bid_path({"waiver_bid": 17}) == ("waiver_bid", 17)
    assert S.bid_path({"settings": {"waiver_bid": 5}}) == ("settings.waiver_bid", 5)
    assert S.bid_path({"metadata": {"waiver_bid": 3}}) == ("metadata.waiver_bid", 3)


def test_NO_BID_ANYWHERE_reports_the_paths_tried_rather_than_asserting_no_FAAB():
    """Absent is not zero and it is not 'no FAAB' either. A transaction with no bid
    means THIS transaction had no bid — a different claim from a statement about the
    league. MUTATION: return 0, or return 'no faab'."""
    path, why = S.bid_path({"type": "waiver", "adds": {}})
    assert path is None
    assert "no bid at any of" in why and "settings.waiver_bid" in why
