#!/usr/bin/env python3
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
themselves stay committed. Weekly-market movement is NOT built here yet:
those files carry raw market rows per series and their join key is the
market ticker, not a (player, stat, threshold) — a second adapter when
the weekly study starts (declared, not forgotten; the prereg names it).

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


def snapshot_files():
    out = []
    for f in sorted(glob.glob(str(KALSHI / "season_ladders_*.json"))):
        m = DATE_RE.search(f)
        if m:
            out.append((m.group(1), Path(f)))
    return out


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
                two_sided = bool(bid and ask)   # 0.0 = that side is empty
                key = f"{pc}|{stat}|{thr:g}"
                series.setdefault(key, []).append(
                    {"date": date, "last": rung.get("last"),
                     "bid": bid, "ask": ask,
                     "mid": round((bid + ask) / 2, 4) if two_sided else None,
                     "oi": rung.get("open_interest")})
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
    return {
        "_territory": "TERRITORY: A — built by draft/tools/market_movement_series.py",
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


def main() -> int:
    doc = build()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"movement series: {doc['n_series']} series over "
          f"{len(doc['snapshot_dates'])} snapshots "
          f"({', '.join(doc['snapshot_dates'])}); "
          f"{doc['n_with_movement']} moved")
    for m in doc["top_movers"][:10]:
        print(f"  {m['key']}: {m['from']:.2f} -> {m['to']:.2f} "
              f"({m['delta']:+.2f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
