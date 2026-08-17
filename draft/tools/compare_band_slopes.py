#!/usr/bin/env python3
# TERRITORY: relay — the deliverable register 4q asks for: two slopes, side by side.
"""DOES SPLITTING THE `33+` BAND FIX THE INVERTED UPSIDE CURVE?

Cory, 2026-08-17: "so even in later rounds your saying i shouldnt look for
upside? this goes against every fantasy footbal theory ever and doesnt make
sense." He is right. This measures whether the proposed fix repairs it.

THE DEFECT (register 4p / 4q). Median `proj_ceiling / proj_mean` on the live
board DECLINES with ADP — 1.640, 1.506, 1.434, 1.434, 1.434, 1.317 — so the
model claims a round-12 flier has proportionally LESS upside than a
first-rounder. The mechanism is that `BAND_EDGES = (3, 8, 16, 32)` pools **935
of 1,304 graded players into one `33+` cell per position**, and inside a cell
the ceiling is a constant multiple of the mean. Three consecutive ADP bands
sharing 1.434 to three decimals is that cell showing through.

WHAT THIS COMPARES. Two bundle sets produced by the SAME pipeline
(`draft/backtest/cli.py`), differing only in `PROJECTION_BAND_EDGES`. Reusing
cli rather than re-deriving the bundles is deliberate: a second implementation
of the fit would make any difference impossible to attribute to the bands.

READ THE VERDICT CAREFULLY — IT IS NOT "DID THE NUMBERS MOVE".
A finer split MUST move the numbers; that is arithmetic, not evidence. The
question is whether the SLOPE stops being inverted, i.e. whether deep bands
stop being told they have the least upside. A split that moves everything and
leaves the slope pointing down has not fixed anything.

Run: python3 draft/tools/compare_band_slopes.py CURRENT.json SPLIT.json
"""
from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

SKILL = ("QB", "RB", "WR", "TE")


def _players(bundle_doc):
    out = []
    docs = bundle_doc if isinstance(bundle_doc, list) else [bundle_doc]
    for d in docs:
        for b in (d.get("bundles") or [d]) if isinstance(d, dict) else []:
            for p in (b.get("players") or []):
                out.append(p)
    return out


def slope(players):
    """Median ceiling/mean by within-position projection rank band.

    Ranked HERE rather than trusting a stored rank, so both sides are bucketed
    identically no matter what edges produced them — otherwise the comparison
    would be between two different questions.
    """
    rows = [p for p in players
            if p.get("position") in SKILL
            and isinstance(p.get("proj_mean"), (int, float)) and p["proj_mean"] > 0
            and isinstance(p.get("proj_ceiling"), (int, float)) and p["proj_ceiling"] > 0]
    by_pos = {}
    for p in rows:
        by_pos.setdefault(p["position"], []).append(p)
    buckets = {}
    for pos, ps in by_pos.items():
        ps.sort(key=lambda x: -x["proj_mean"])
        for i, p in enumerate(ps, 1):
            band = ("1-8" if i <= 8 else "9-16" if i <= 16 else "17-32" if i <= 32
                    else "33-48" if i <= 48 else "49-72" if i <= 72
                    else "73-100" if i <= 100 else "101-150" if i <= 150 else "151+")
            buckets.setdefault(band, []).append(p["proj_ceiling"] / p["proj_mean"])
    return {b: (round(st.median(v), 4), len(v)) for b, v in buckets.items()}


ORDER = ("1-8", "9-16", "17-32", "33-48", "49-72", "73-100", "101-150", "151+")


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    cur = slope(_players(json.loads(Path(sys.argv[1]).read_text())))
    new = slope(_players(json.loads(Path(sys.argv[2]).read_text())))
    if not cur or not new:
        print("REFUSING: one side has no gradeable players — that is a pipeline "
              "failure, not a result about bands.")
        return 1

    print("CEILING / MEAN BY PROJECTION-RANK BAND — current bands vs split bands\n")
    print(f"  {'band':10s} {'current':>10s} {'split':>10s} {'change':>10s}    n")
    for b in ORDER:
        c, n = cur.get(b, (None, 0))
        s, _ = new.get(b, (None, 0))
        if c is None and s is None:
            continue
        ch = f"{s - c:+.4f}" if (c is not None and s is not None) else "-"
        print(f"  {b:10s} {str(c):>10s} {str(s):>10s} {ch:>10s} {n:>4d}")

    def deep_vs_shallow(d):
        deep = [d[b][0] for b in ("73-100", "101-150", "151+") if b in d]
        shal = [d[b][0] for b in ("1-8", "9-16") if b in d]
        return (st.median(deep) if deep else None, st.median(shal) if shal else None)

    dc, sc = deep_vs_shallow(cur)
    dn, sn = deep_vs_shallow(new)
    print("\n  THE QUESTION IS THE SLOPE, NOT THE MOVEMENT:")
    if None in (dc, sc, dn, sn):
        print("    cannot compare — a needed band is missing on one side.")
        return 1
    print(f"    current: deep {dc:.4f} vs shallow {sc:.4f}  ->  "
          f"{'INVERTED (deep has LESS upside)' if dc < sc else 'deep has more upside'}")
    print(f"    split:   deep {dn:.4f} vs shallow {sn:.4f}  ->  "
          f"{'STILL INVERTED' if dn < sn else 'REPAIRED (deep has more upside)'}")
    if dn < sn:
        print("\n    ⚠️ THE SPLIT DID NOT REPAIR THE SLOPE. Finer bands move numbers by")
        print("       arithmetic; that is not evidence. If deep players still read as")
        print("       the most predictable on the board, the band width was NOT the")
        print("       whole cause and the POPULATION question (register 4q: condition")
        print("       the p90 on players who actually got a role) is the remaining one.")
    else:
        print("\n    ✅ The slope is no longer inverted. This is necessary, NOT sufficient:")
        print("       it must still beat the current bands in Cory's replay seat before")
        print("       anything ships. A prettier curve is not an edge.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
