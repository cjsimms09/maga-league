#!/usr/bin/env python3
# TERRITORY: A
# TERRITORY-GRANT: C weekly ticker dollars mid oi status title series build_weekly weekly_snapshot_files WEEKLY_DATE_RE _dollars _mid _movers_for _ticker_series yes_bid_dollars yes_ask_dollars last_price_dollars open_interest_fp market movement task21 2026-08-19 out return committed adapter column rebuilt Idempotent PREREG population reason for if in def else
"""MARKET MOVEMENT SERIES — day-over-day price movement from the Kalshi
capture snapshots, consolidated into one grader-ready store.

THE POINT (task 21, movement-vs-outcome): each capture file is a
point-in-time snapshot and prices are UNRECOVERABLE once they move (the
capture job's own words). Movement — the difference between snapshots —
is the raw material of the movement-vs-outcome study
(`MOVEMENT-VS-OUTCOME-PREREG.md`), and nothing was assembling it: the
snapshots sat as N disconnected files. This tool builds
`draft/data/kalshi/movement_series.json`:

    series[player_code|stat|threshold] = [
        {"date", "last", "bid", "ask", "mid", "oi"}, ...   # chronological
    ]
    movers = largest |first-to-last| MID moves where BOTH endpoints have a
             two-sided book, for the human report

PRICE BASIS, learned from the first build's own false movers: the
snapshots' derived `p_at_least` comes from LAST TRADE, and an untraded
rung prints last=0.00 while its book sits at 0.68/0.81 — so "0.00 -> 0.83
movement" was a FIRST TRADE, not an opinion shift (JCHASE1 rec_yd 1000,
2026-08-16, caught before the store shipped). This store therefore keeps
last, bid, ask and OI uncollapsed per date — the capture's own rule — and
computes `mid` only when both sides exist. The prereg's study price is
mid-with-two-sided-book; everything else is visible but excluded.

IDEMPOTENT AND CUMULATIVE: re-run after any capture and it rebuilds from
every season_ladders_*.json present. It never deletes a date — a snapshot
file removed from disk removes its column, which is why the capture files
themselves stay committed.

THE WEEKLY ADAPTER (task 21 item 2, ROUTES.md 2026-08-19, "the
ticker-keyed adapter into the movement store" -- MOVEMENT-VS-OUTCOME-
PREREG.md's own §Population line: "a second adapter over
weekly_markets_*.json (join key = market ticker)"). Weekly per-game
markets have no stable cross-week (player, stat, threshold) ladder the
way season markets do -- a new market opens per player per game, so the
PREREG'S OWN SPEC keys this side by the raw Kalshi `ticker` string
directly, not the season side's derived key. Written to `weekly_series`
in the same store, same price-basis rule (mid only with a two-sided
book -- the false-mover lesson above applies identically: `weekly_markets
_*.json`'s `yes_bid_dollars`/`yes_ask_dollars` are the book, `last_price_
dollars` is the last trade and is NEVER the study price for the same
reason). Idempotent and cumulative the same way: rebuilt whole from every
committed `weekly_markets_*.json`, a snapshot removed from disk removes
its column.

REPORT ONLY, exit 0: the store is the deliverable, the printed movers are
a courtesy. Run: python3 draft/tools/market_movement_series.py
"""
from __future__ import annotations

import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KALSHI = ROOT / "draft" / "data" / "kalshi"
OUT = KALSHI / "movement_series.json"
DATE_RE = re.compile(r"season_ladders_(\d{4}-\d{2}-\d{2})\.json$")
WEEKLY_DATE_RE = re.compile(r"weekly_markets_(\d{4}-\d{2}-\d{2})\.json$")


def snapshot_files():
    out = []
    for f in sorted(glob.glob(str(KALSHI / "season_ladders_*.json"))):
        m = DATE_RE.search(f)
        if m:
            out.append((m.group(1), Path(f)))
    return out


def weekly_snapshot_files():
    out = []
    for f in sorted(glob.glob(str(KALSHI / "weekly_markets_*.json"))):
        m = WEEKLY_DATE_RE.search(f)
        if m:
            out.append((m.group(1), Path(f)))
    return out


def _dollars(v) -> float | None:
    """Kalshi's dollar-string fields ("0.0100", "1.0000") -> float, or None
    for anything unparseable -- absent is never zero (the same rule every
    other price in this store follows)."""
    if v is None:
        return None
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


def _mid(bid, ask):
    """The study price: mid ONLY where both sides of the book exist.
    0.0/None on either side is that side EMPTY, not a real quote -- the
    false-mover lesson this module's header names (JCHASE1 rec_yd 1000,
    2026-08-16): an untraded rung's last-trade print is not an opinion."""
    two_sided = bool(bid and ask)
    return round((bid + ask) / 2, 4) if two_sided else None


def _movers_for(series: dict) -> list:
    """Largest |first-to-last| MID moves, both endpoints two-sided --
    shared by the season and weekly sides so "what counts as a mover"
    cannot drift between them (rule 11)."""
    movers = []
    for key, pts in series.items():
        priced = [c for c in pts if c["mid"] is not None]
        if len(priced) >= 2:
            delta = priced[-1]["mid"] - priced[0]["mid"]
            if delta:
                movers.append({"key": key, "from": priced[0]["mid"],
                               "to": priced[-1]["mid"],
                               "delta": round(delta, 4),
                               "first_date": priced[0]["date"],
                               "last_date": priced[-1]["date"]})
    movers.sort(key=lambda m: -abs(m["delta"]))
    return movers


def build():
    series = {}
    dates = []
    for date, path in snapshot_files():
        dates.append(date)
        doc = json.loads(path.read_text())
        for row in doc.get("ladders", []):
            pc, stat = row.get("player_code"), row.get("stat")
            if not pc or not stat:
                continue
            for rung in row.get("rungs", []):
                thr = rung.get("threshold")
                if thr is None:
                    continue
                bid, ask = rung.get("yes_bid"), rung.get("yes_ask")
                key = f"{pc}|{stat}|{thr:g}"
                series.setdefault(key, []).append(
                    {"date": date, "last": rung.get("last"),
                     "bid": bid, "ask": ask, "mid": _mid(bid, ask),
                     "oi": rung.get("open_interest")})
    movers = _movers_for(series)
    return {
        "_territory": "TERRITORY: A — written by draft/tools/market_movement_series.py (TERRITORY-GRANT: C, task 21 item 2, 2026-08-19)",
        "_prereg": "draft/backtest/MOVEMENT-VS-OUTCOME-PREREG.md",
        "_note": ("Chronological {last, bid, ask, mid, oi} per "
                  "(player_code|stat|threshold) across every committed "
                  "season_ladders snapshot; mid only where both book sides "
                  "exist — the study price. Rebuilt whole on each run — the "
                  "snapshots are the source of truth, this is their join."),
        "snapshot_dates": dates,
        "n_series": len(series),
        "n_two_sided_both_ends": sum(1 for k, v in series.items() if sum(c["mid"] is not None for c in v) >= 2),
        "n_with_movement": len(movers),
        "series": series,
        "top_movers": movers[:40],
    }


def _ticker_series(ticker: str) -> str | None:
    """The Kalshi SERIES ticker is everything before the first hyphen
    ("KXNFLPASSYDS-26AUG15DALSEA-SEAJMILROE6-75" -> "KXNFLPASSYDS") --
    metadata only, never part of the join key (the prereg's own words:
    "join key = market ticker")."""
    if not ticker or "-" not in ticker:
        return ticker or None
    return ticker.split("-", 1)[0]


def build_weekly():
    """The weekly adapter (task 21 item 2): join key is the raw Kalshi
    `ticker` (MOVEMENT-VS-OUTCOME-PREREG.md's own §Population line), NOT
    a derived (player, stat, threshold) -- weekly per-game markets open a
    NEW ticker each game, so there is no stable cross-week ladder key the
    way season markets have one. `title` is carried per-point (not just
    once) because a market's title can itself change between captures on
    Kalshi's side, and silently pinning it to the first-seen value would
    hide that."""
    series = {}
    dates = []
    for date, path in weekly_snapshot_files():
        dates.append(date)
        doc = json.loads(path.read_text())
        for kalshi_series, block in (doc.get("by_series") or {}).items():
            for m in block.get("markets", []):
                ticker = m.get("ticker")
                if not ticker:
                    continue
                bid = _dollars(m.get("yes_bid_dollars"))
                ask = _dollars(m.get("yes_ask_dollars"))
                series.setdefault(ticker, []).append(
                    {"date": date, "last": _dollars(m.get("last_price_dollars")),
                     "bid": bid, "ask": ask, "mid": _mid(bid, ask),
                     "oi": _dollars(m.get("open_interest_fp")),
                     "series": kalshi_series or _ticker_series(ticker),
                     "status": m.get("status"), "title": m.get("title")})
    movers = _movers_for(series)
    return {
        "_territory": "TERRITORY: A — written by draft/tools/market_movement_series.py (TERRITORY-GRANT: C, task 21 item 2, 2026-08-19)",
        "_prereg": "draft/backtest/MOVEMENT-VS-OUTCOME-PREREG.md",
        "_note": ("Chronological {last, bid, ask, mid, oi} per market "
                  "TICKER (the prereg's own join key for this side -- "
                  "weekly per-game markets have no stable cross-week "
                  "player|stat|threshold ladder) across every committed "
                  "weekly_markets snapshot; mid only where both book sides "
                  "exist, same price-basis rule as the season side. A "
                  "ticker with fewer than 2 priced snapshots is real and "
                  "kept -- the study's own >=2-snapshot population filter "
                  "applies at grading time, not here."),
        "snapshot_dates": dates,
        "n_series": len(series),
        "n_two_sided_both_ends": sum(1 for k, v in series.items() if sum(c["mid"] is not None for c in v) >= 2),
        "n_with_movement": len(movers),
        "series": series,
        "top_movers": movers[:40],
    }


def main() -> int:
    doc = build()
    weekly = build_weekly()
    doc["weekly_snapshot_dates"] = weekly["snapshot_dates"]
    doc["n_weekly_series"] = weekly["n_series"]
    doc["n_weekly_two_sided_both_ends"] = weekly["n_two_sided_both_ends"]
    doc["n_weekly_with_movement"] = weekly["n_with_movement"]
    doc["weekly_series"] = weekly["series"]
    doc["weekly_top_movers"] = weekly["top_movers"]
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"movement series: {doc['n_series']} series over "
          f"{len(doc['snapshot_dates'])} snapshots "
          f"({', '.join(doc['snapshot_dates'])}); "
          f"{doc['n_with_movement']} moved")
    for m in doc["top_movers"][:10]:
        print(f"  {m['key']}: {m['from']:.2f} -> {m['to']:.2f} "
              f"({m['delta']:+.2f})")
    print(f"weekly: {doc['n_weekly_series']} series over "
          f"{len(doc['weekly_snapshot_dates'])} snapshots "
          f"({', '.join(doc['weekly_snapshot_dates'])}); "
          f"{doc['n_weekly_with_movement']} moved")
    for m in doc["weekly_top_movers"][:10]:
        print(f"  {m['key']}: {m['from']:.2f} -> {m['to']:.2f} "
              f"({m['delta']:+.2f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
