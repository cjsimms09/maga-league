# TERRITORY: A
"""Tests for draft/tools/fetch_kalshi.py — the season-ladder capture.

Fixtures are built in the EXACT shape the live probe returned
(free-betting-probe.yml, 2026-08-16), including the dollars-denominated field
names that a previous read got wrong: last_price_dollars / yes_bid_dollars /
open_interest_fp, NOT volume / open_interest / yes_bid. Reading the wrong keys
made every live market look empty and nearly got a real market dismissed as
dead, so the vocabulary itself is pinned here.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import fetch_kalshi as FK  # noqa: E402


def _mkt(ticker, last=None, bid=None, ask=None, oi=None, status="active"):
    """A market row in Kalshi's real dollars-denominated shape."""
    d = {"ticker": ticker, "status": status, "close_time": "2027-02-02T00:00:00Z"}
    if last is not None:
        d["last_price_dollars"] = last
    if bid is not None:
        d["yes_bid_dollars"] = bid
    if ask is not None:
        d["yes_ask_dollars"] = ask
    if oi is not None:
        d["open_interest_fp"] = oi
    return d


# ── ticker parsing ────────────────────────────────────────────────────────

def test_parse_market_reads_the_real_ticker_shape():
    m = _mkt("KXNFLSEASONRECYDS-27C1000-ZFLOWERS4", last=0.51, oi=1004.38)
    got = FK.parse_market(m)
    assert got["series"] == "KXNFLSEASONRECYDS"
    assert got["stat"] == "rec_yd"
    assert got["player_code"] == "ZFLOWERS4"
    assert got["threshold"] == 1000.0
    assert got["last"] == 0.51
    assert got["open_interest"] == 1004.38


def test_parse_market_accepts_the_legacy_field_names_too():
    # If Kalshi ever reverts to volume/open_interest/yes_bid, the capture must
    # degrade rather than silently zero every price — that exact misread
    # happened on 2026-08-16 and looked like a dead market.
    m = {"ticker": "KXNFLSEASONREC-27C120-TKELCE87", "status": "active",
         "last_price": 0.22, "yes_bid": 0.20, "open_interest": 55}
    got = FK.parse_market(m)
    assert got["last"] == 0.22
    assert got["yes_bid"] == 0.20
    assert got["open_interest"] == 55.0


def test_parse_market_rejects_winner_take_all_rungs():
    # KXNFLFFLEADER-27ROOK-ZBRANCH17 is "#1 ranked fantasy rookie" — not a
    # threshold on a player's own total, so it cannot join a distribution.
    assert FK.parse_market(_mkt("KXNFLFFLEADER-27ROOK-ZBRANCH17", last=0.0)) is None


def test_parse_market_rejects_series_we_do_not_model():
    assert FK.parse_market(_mkt("KXNFLSPREAD-26SEP10-NE", last=0.5)) is None
    assert FK.parse_market(_mkt("garbage", last=0.5)) is None


def test_excluded_series_are_documented_not_just_absent():
    # A future reader must find out WHY, or they will "helpfully" add them.
    for k in ("KXNFLFFLEADER", "KXNFLFFPTS", "KXNFLANYTD"):
        assert k in FK.EXCLUDED_SERIES
        assert len(FK.EXCLUDED_SERIES[k]) > 20
    assert not (set(FK.EXCLUDED_SERIES) & set(FK.SERIES_TO_STAT))


# ── ladders ───────────────────────────────────────────────────────────────

def _flowers():
    """Zay Flowers' real 2026-08-16 ladder, prices as measured."""
    rows = [
        _mkt("KXNFLSEASONRECYDS-27C750-ZFLOWERS4", last=0.69, oi=10.0),
        _mkt("KXNFLSEASONRECYDS-27C1000-ZFLOWERS4", last=0.51, oi=1004.38),
        _mkt("KXNFLSEASONRECYDS-27C1250-ZFLOWERS4", last=0.33, oi=31.0),
        _mkt("KXNFLSEASONRECYDS-27C1500-ZFLOWERS4", last=0.17, oi=239.34),
    ]
    return [FK.parse_market(m) for m in rows]


def test_build_ladders_groups_and_sorts_by_threshold():
    lads = FK.build_ladders(_flowers())
    rungs = lads[("ZFLOWERS4", "rec_yd")]
    assert [r["threshold"] for r in rungs] == [750.0, 1000.0, 1250.0, 1500.0]


def test_coherence_passes_the_real_flowers_ladder():
    c = FK.ladder_coherence(_flowers())
    assert c["monotone"] is True
    assert c["priced_rungs"] == 4 and c["unpriced_rungs"] == 0


def test_coherence_catches_a_stale_rung():
    # Terry McLaurin, measured: 1250+ at 0.18 but 1500+ at 0.19 — clearing a
    # HARDER bar cannot be more likely. That is staleness, and it is a
    # data-quality signal to report, not noise to smooth away.
    rows = [FK.parse_market(m) for m in [
        _mkt("KXNFLSEASONRECYDS-27C1250-TMCLAURIN17", last=0.18),
        _mkt("KXNFLSEASONRECYDS-27C1500-TMCLAURIN17", last=0.19),
    ]]
    c = FK.ladder_coherence(rows)
    assert c["monotone"] is False
    assert c["violations"][0]["lower"] == 1250.0
    assert c["violations"][0]["upper"] == 1500.0


def test_unpriced_rungs_are_excluded_and_counted_never_zeroed():
    rows = [FK.parse_market(m) for m in [
        _mkt("KXNFLSEASONREC-27C60-TKELCE87", last=0.80),
        _mkt("KXNFLSEASONREC-27C120-TKELCE87"),          # no price at all
    ]]
    c = FK.ladder_coherence(rows)
    assert c["priced_rungs"] == 1 and c["unpriced_rungs"] == 1
    # An unpriced rung must NOT be read as probability zero, which would
    # fabricate a confident "he will not clear 120 receptions".
    assert c["monotone"] is True


# ── implied distribution ──────────────────────────────────────────────────

def test_implied_distribution_differences_the_survival_curve():
    d = FK.implied_distribution(_flowers())
    assert [s["p_at_least"] for s in d["survival"]] == [0.69, 0.51, 0.33, 0.17]
    masses = {(b["lo"], b["hi"]): b["mass"] for b in d["buckets"]}
    assert masses[(750.0, 1000.0)] == pytest.approx(0.18)
    assert masses[(1000.0, 1250.0)] == pytest.approx(0.18)
    assert masses[(1250.0, 1500.0)] == pytest.approx(0.16)
    assert masses[(1500.0, None)] == pytest.approx(0.17)


def test_expectation_is_a_floor_and_is_labelled_as_one():
    d = FK.implied_distribution(_flowers())
    # Every bucket credited at its LOWER edge, and the open top bucket at
    # 1500 though its true mean is higher.
    expected = 0.18 * 750 + 0.18 * 1000 + 0.16 * 1250 + 0.17 * 1500
    assert d["expectation_lower_bound"] == pytest.approx(expected, abs=0.01)
    assert "floor" in d["note"] and "UNDERSTATES" in d["note"]


def test_p_breakout_is_directly_available():
    # The whole point for late-round picks: two players with a similar mean
    # are different picks if one has 17% at 1500+ and the other 3%.
    d = FK.implied_distribution(_flowers())
    assert d["p_top_rung"] == 0.17 and d["top_threshold"] == 1500.0


def test_a_single_rung_is_not_a_distribution():
    one = [FK.parse_market(_mkt("KXNFLSEASONRSHYDS-27C1000-SBARKLEY26", last=0.62))]
    assert FK.implied_distribution(one) is None


# ── capture health ────────────────────────────────────────────────────────

def test_summarize_reports_thinness_rather_than_hiding_it():
    rows = _flowers() + [FK.parse_market(m) for m in [
        _mkt("KXNFLSEASONRECYDS-27C1250-STALE1", last=0.18),
        _mkt("KXNFLSEASONRECYDS-27C1500-STALE1", last=0.19),   # incoherent
        _mkt("KXNFLSEASONREC-27C120-NOPRICE9"),                # unpriced
    ]]
    h = FK.summarize(FK.build_ladders(rows))
    assert h["player_stat_ladders"] == 3
    assert h["ladders_with_2plus_rungs"] == 2
    assert h["incoherent_ladders"] == 1
    assert h["ladders_with_any_price"] == 2
    assert h["total_open_interest"] == pytest.approx(1284.72)


# ── the weekly series: self-activating, so nobody has to remember ─────────
#
# Cory, 2026-08-16: "Let's make sure the Kalshi weekly get built when it can!
# Do not forget." Every game-level series was dormant that day, so the
# not-forgetting is a daily poll that starts working by itself rather than a
# note in a doc.


def test_weekly_series_are_registered_and_separate_from_season_ones():
    # Mixing them would let a per-game market join a season ladder, which
    # would silently corrupt the distribution reconstruction.
    assert not (set(FK.WEEKLY_SERIES) & set(FK.SERIES_TO_STAT))
    for k in ("KXNFLANYTD", "KXNFLRSHATT", "KXNFLWEEKCOMPETE"):
        assert k in FK.WEEKLY_SERIES


def test_availability_markets_are_carried():
    # These are the two no projection model we own can produce, and the
    # start/sit study put QB — the slot most driven by availability — below a
    # coin flip. Losing them to a tidy-up would be a real regression.
    avail = [k for k, v in FK.WEEKLY_SERIES.items() if "availab" in v.lower()]
    assert set(avail) == {"KXNFLWEEKCOMPETE", "KXNFLCOMPETE"}


def test_rushing_attempts_is_kept_and_labelled_as_role():
    assert "role" in FK.WEEKLY_SERIES["KXNFLRSHATT"].lower()


def test_weekly_series_are_not_parsed_by_the_season_ladder_parser():
    # fetch_weekly stores RAW on purpose: these markets' ticker grammar is
    # unconfirmed while dormant, and inventing a parse for a shape nobody has
    # seen is exactly how the anytime-TD column shipped wrong by 21-33x.
    assert FK.parse_market({"ticker": "KXNFLANYTD-26SEP10-SBARKLEY26",
                            "last_price_dollars": 0.55}) is None
