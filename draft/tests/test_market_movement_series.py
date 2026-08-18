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
