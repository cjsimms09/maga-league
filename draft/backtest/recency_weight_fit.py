# TERRITORY: A
"""V7 candidate C3 — the recency blend weights, FITTED per position.

own_model_v2 blends the two prior seasons at RECENCY_WEIGHTS = (0.7, 0.3) —
a hand-set constant that was never fitted, found by Cory's resource review.
This measures the best w per position: predict season y+1 totals with
w*y + (1-w)*(y-1), score by Spearman against realized y+1 (the ordering is
what the board consumes), sweep w in 0.05 steps, WALK-FORWARD honest — every
(y-1, y, y+1) triple uses only completed seasons, and the 5d-corrected
stores (18 regular weeks, no playoff phantoms).

Population: players with >=8 scored games in ALL THREE seasons of a triple
(the blend is only defined where both inputs exist) — declared, and the
survivor caveat carries: this fits the weights for players with history,
which is exactly the population v2's blend prices.

Output: per position, the Spearman at each w for each triple, the mean-best
w, and the incumbent 0.7's gap to it. A gap inside noise = the hand-set
number was fine and we will finally KNOW that.

Run: python3 draft/backtest/recency_weight_fit.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEASONS = (2021, 2022, 2023, 2024, 2025)
POSITIONS = ("QB", "RB", "WR", "TE")
MIN_GAMES = 8
WS = [round(w * 0.05, 2) for w in range(0, 21)]


def season_data(season):
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    totals, games = {}, {}
    for wk in doc["weeks"]:
        for pid, pts in (wk.get("points") or {}).items():
            totals[pid] = totals.get(pid, 0.0) + float(pts)
            if float(pts) != 0.0:
                games[pid] = games.get(pid, 0) + 1
    return totals, games


def positions_map():
    doc = json.loads((HERE / "sleeper_name_index.json").read_text())["index"]
    return {str(v["player_id"]): (v.get("position") or "").upper()
            for v in doc.values()}


def spearman(xs, ys):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    n = len(rx)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx) ** 0.5
    dy = sum((b - my) ** 2 for b in ry) ** 0.5
    return num / (dx * dy) if dx and dy else 0.0


def build() -> dict:
    pos_of = positions_map()
    data = {y: season_data(y) for y in SEASONS}
    triples = [(SEASONS[i], SEASONS[i + 1], SEASONS[i + 2])
               for i in range(len(SEASONS) - 2)]
    out = {}
    for pos in POSITIONS:
        per_triple = {}
        for y0, y1, y2 in triples:
            t0, g0 = data[y0]
            t1, g1 = data[y1]
            t2, g2 = data[y2]
            pids = [p for p in t2
                    if pos_of.get(p) == pos
                    and g0.get(p, 0) >= MIN_GAMES and g1.get(p, 0) >= MIN_GAMES
                    and g2.get(p, 0) >= MIN_GAMES]
            if len(pids) < 20:
                per_triple[f"{y0}-{y1}->{y2}"] = {"status": "too thin", "n": len(pids)}
                continue
            actual = [t2[p] for p in pids]
            curve = {}
            for w in WS:
                pred = [w * t1[p] + (1 - w) * t0[p] for p in pids]
                curve[str(w)] = round(spearman(pred, actual), 4)
            best_w = max(curve, key=curve.get)
            per_triple[f"{y0}-{y1}->{y2}"] = {
                "n": len(pids), "best_w": float(best_w),
                "rho_at_best": curve[best_w],
                "rho_at_incumbent_0.7": curve["0.7"],
                "gap_incumbent_to_best": round(curve[best_w] - curve["0.7"], 4)}
        meas = [t for t in per_triple.values() if "best_w" in t]
        out[pos] = {"per_triple": per_triple,
                    "mean_best_w": round(sum(t["best_w"] for t in meas) / len(meas), 3) if meas else None,
                    "mean_gap_0.7_to_best": round(sum(t["gap_incumbent_to_best"] for t in meas) / len(meas), 4) if meas else None}
    doc = {"_territory": "TERRITORY: A — written by recency_weight_fit.py",
           "_what": ("V7 C3: per-position recency weight w for the two-season "
                     "blend, fitted walk-forward on the 5d-corrected stores. "
                     "The incumbent 0.7 was hand-set and never measured; a "
                     "small gap means it was fine and we finally know it."),
           "incumbent": 0.7, "curves": out}
    (HERE / "recency_weight_fit.json").write_text(json.dumps(doc, indent=1))
    return doc


if __name__ == "__main__":
    d = build()
    for pos, c in d["curves"].items():
        print(f"{pos}: mean best w {c['mean_best_w']} "
              f"(incumbent 0.7, mean rho gap {c['mean_gap_0.7_to_best']})")
