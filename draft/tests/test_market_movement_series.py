# TERRITORY: A
# TERRITORY-GRANT: C weekly ticker dollars mid oi status title series build_weekly wk market snap task21 2026-08-19 def return None monkeypatch setattr assert doc top_movers delta from m abs tmp_path KALSHI false-mover lesson Kalshi's dollar-string fields last bid ask same the that is not a to for if in and print len sorted glob json load loads dumps text write_text path str f d v c k key value tuple dict list of on side both two market's title status oi n_series n_with_movement n_two_sided_both_ends series_ this side's own the its it as -- not so exists only when here first second
"""The movement store must FIRE on real movement and must NOT manufacture
movement from untraded rungs — the exact false-positive its first build
produced (rule 3e both ways: a positive arm AND the named artifact arm)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import market_movement_series as M  # noqa: E402


def _snap(tmp, date, last, bid, ask, oi=10.0):
    doc = {"ladders": [{"player_code": "TPLAYER1", "stat": "rec_yd",
                        "rungs": [{"threshold": 1000.0, "last": last,
                                   "yes_bid": bid, "yes_ask": ask,
                                   "open_interest": oi}]}]}
    (tmp / f"season_ladders_{date}.json").write_text(json.dumps(doc))


def test_FAIL_ARM_two_sided_movement_is_detected(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    _snap(tmp_path, "2026-08-16", last=0.5, bid=0.48, ask=0.52)
    _snap(tmp_path, "2026-08-17", last=0.7, bid=0.68, ask=0.72)
    doc = M.build()
    assert doc["n_with_movement"] == 1
    m = doc["top_movers"][0]
    assert abs(m["delta"] - 0.2) < 1e-6 and m["from"] == 0.5


def test_FAIL_ARM_first_trade_on_untraded_rung_is_not_movement(tmp_path,
                                                               monkeypatch):
    """The JCHASE1 shape: last goes 0.00 -> 0.83 because a first trade
    happened, while the book barely moved. Movement must be judged on
    MID, and a one-sided earlier book excludes the cell entirely."""
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    _snap(tmp_path, "2026-08-16", last=0.0, bid=0.68, ask=0.0)   # one-sided
    _snap(tmp_path, "2026-08-17", last=0.83, bid=0.80, ask=0.84)
    doc = M.build()
    assert doc["n_with_movement"] == 0, (
        "a first trade on a previously one-sided book was reported as "
        "market movement — the exact artifact the mid basis exists to kill")
    cells = doc["series"]["TPLAYER1|rec_yd|1000"]
    assert cells[0]["mid"] is None and cells[1]["mid"] is not None


def test_last_bid_ask_oi_kept_uncollapsed(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    _snap(tmp_path, "2026-08-16", last=0.5, bid=0.48, ask=0.52, oi=43.0)
    c = M.build()["series"]["TPLAYER1|rec_yd|1000"][0]
    assert (c["last"], c["bid"], c["ask"], c["oi"]) == (0.5, 0.48, 0.52, 43.0)


def test_rebuild_is_idempotent_and_chronological(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    _snap(tmp_path, "2026-08-17", last=0.6, bid=0.58, ask=0.62)
    _snap(tmp_path, "2026-08-16", last=0.5, bid=0.48, ask=0.52)
    a = M.build()
    b = M.build()
    assert a == b
    assert [c["date"] for c in a["series"]["TPLAYER1|rec_yd|1000"]] == [
        "2026-08-16", "2026-08-17"]


def test_live_store_known_positive():
    """Rule 3e on the real snapshots: the committed captures must yield a
    non-trivial two-sided population, or the capture (not this tool) has
    degraded and someone needs to look."""
    doc = M.build()
    assert doc["n_series"] > 500 and doc["n_two_sided_both_ends"] > 100, (
        f"live capture population collapsed: {doc['n_series']} series, "
        f"{doc['n_two_sided_both_ends']} two-sided — check the capture job")


# ── the weekly adapter (task 21 item 2, ROUTES.md 2026-08-19) ─────────────

def _wk_snap(tmp, date, markets, series="KXNFLPASSYDS"):
    doc = {"by_series": {series: {"description": "x", "markets": markets}}}
    (tmp / f"weekly_markets_{date}.json").write_text(json.dumps(doc))


def _wk_market(ticker, last=None, bid=None, ask=None, oi=None,
              status="active", title="t"):
    def d(v):
        return None if v is None else f"{v:.4f}"
    return {"ticker": ticker, "status": status, "title": title,
           "last_price_dollars": d(last), "yes_bid_dollars": d(bid),
           "yes_ask_dollars": d(ask), "open_interest_fp": d(oi)}


def test_weekly_FAIL_ARM_two_sided_movement_is_detected(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    ticker = "KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75"
    _wk_snap(tmp_path, "2026-08-17", [_wk_market(ticker, last=0.5, bid=0.48, ask=0.52)])
    _wk_snap(tmp_path, "2026-08-18", [_wk_market(ticker, last=0.7, bid=0.68, ask=0.72)])
    doc = M.build_weekly()
    assert doc["n_with_movement"] == 1
    m = doc["top_movers"][0]
    assert m["key"] == ticker
    assert abs(m["delta"] - 0.2) < 1e-6 and m["from"] == 0.5


def test_weekly_FAIL_ARM_first_trade_on_untraded_market_is_not_movement(
        tmp_path, monkeypatch):
    """Same false-mover lesson as the season side, on Kalshi's dollar-
    string fields: an untraded market's last-trade print is not an
    opinion shift."""
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    ticker = "KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75"
    _wk_snap(tmp_path, "2026-08-17", [_wk_market(ticker, last=0.0, bid=0.68, ask=0.0)])
    _wk_snap(tmp_path, "2026-08-18", [_wk_market(ticker, last=0.83, bid=0.80, ask=0.84)])
    doc = M.build_weekly()
    assert doc["n_with_movement"] == 0, (
        "a first trade on a previously one-sided market was reported as "
        "movement — the exact artifact the mid basis exists to kill")
    cells = doc["series"][ticker]
    assert cells[0]["mid"] is None and cells[1]["mid"] is not None


def test_weekly_dollar_strings_parsed_to_float():
    assert M._dollars("0.0100") == 0.01
    assert M._dollars("1.0000") == 1.0
    assert M._dollars(None) is None
    assert M._dollars("not-a-number") is None


def test_weekly_last_bid_ask_oi_status_title_kept_uncollapsed(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    ticker = "KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75"
    _wk_snap(tmp_path, "2026-08-17",
            [_wk_market(ticker, last=0.5, bid=0.48, ask=0.52, oi=43.0,
                       status="finalized", title="Jalen Milroe: 75+ passing yards")])
    c = M.build_weekly()["series"][ticker][0]
    assert (c["last"], c["bid"], c["ask"], c["oi"]) == (0.5, 0.48, 0.52, 43.0)
    assert c["status"] == "finalized"
    assert c["title"] == "Jalen Milroe: 75+ passing yards"
    assert c["series"] == "KXNFLPASSYDS"


def test_weekly_market_with_no_ticker_is_skipped_not_crashed(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    bad = _wk_market("placeholder")
    bad["ticker"] = None
    _wk_snap(tmp_path, "2026-08-17", [bad])
    doc = M.build_weekly()
    assert doc["n_series"] == 0


def test_weekly_ticker_series_prefix_extraction():
    assert M._ticker_series(
        "KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75") == "KXNFLPASSYDS"
    assert M._ticker_series("NOHYPHENS") == "NOHYPHENS"
    assert M._ticker_series(None) is None
    assert M._ticker_series("") is None


def test_weekly_rebuild_is_idempotent_and_chronological(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    ticker = "KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75"
    _wk_snap(tmp_path, "2026-08-18", [_wk_market(ticker, last=0.6, bid=0.58, ask=0.62)])
    _wk_snap(tmp_path, "2026-08-17", [_wk_market(ticker, last=0.5, bid=0.48, ask=0.52)])
    a = M.build_weekly()
    b = M.build_weekly()
    assert a == b
    assert [c["date"] for c in a["series"][ticker]] == ["2026-08-17", "2026-08-18"]


def test_weekly_two_sided_helper_reused_from_season_side():
    # rule 11 pin -- both sides must compute "mid" through the SAME
    # function, or the price-basis rule can drift between them silently
    assert M._mid(0.4, 0.6) == 0.5
    assert M._mid(0.0, 0.6) is None
    assert M._mid(0.4, 0.0) is None
    assert M._mid(None, 0.6) is None


def test_weekly_ticker_with_fewer_than_two_snapshots_is_kept_not_dropped(
        tmp_path, monkeypatch):
    """The prereg's >=2-snapshot population filter is a GRADING-time
    rule, not a build-time one -- a single-snapshot ticker is a real,
    honest fact the store should still show."""
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    ticker = "KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75"
    _wk_snap(tmp_path, "2026-08-17", [_wk_market(ticker, last=0.5, bid=0.48, ask=0.52)])
    doc = M.build_weekly()
    assert ticker in doc["series"]
    assert len(doc["series"][ticker]) == 1


def test_weekly_live_store_known_positive():
    """Rule 3e on the real captures: the committed weekly_markets_*.json
    files must yield a non-trivial population, or the capture (not this
    adapter) has degraded."""
    doc = M.build_weekly()
    assert doc["n_series"] > 50, (
        f"live weekly capture population collapsed: {doc['n_series']} "
        "series — check the capture job")


def test_main_writes_both_season_and_weekly_fields(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "KALSHI", tmp_path)
    monkeypatch.setattr(M, "OUT", tmp_path / "movement_series.json")
    ticker = "KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75"
    _snap(tmp_path, "2026-08-16", last=0.5, bid=0.48, ask=0.52)
    _wk_snap(tmp_path, "2026-08-17", [_wk_market(ticker, last=0.5, bid=0.48, ask=0.52)])
    M.main()
    doc = json.loads((tmp_path / "movement_series.json").read_text())
    assert "series" in doc and "weekly_series" in doc
    assert doc["n_weekly_series"] == 1
