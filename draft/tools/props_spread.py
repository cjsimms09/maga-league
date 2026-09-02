#!/usr/bin/env python3
# TERRITORY: relay
"""PROPS SPREAD — the per-player weekly SD the E[$] solver has never had (P355).

`src/routes/lineup.js` prices P(weekly high) with `Normal(projection, sd)` per
starter, and `sd` falls back to ONE number per position (QB 8, RB 7, WR 7,
TE 6) because nothing upstream ever wrote a per-player spread. P355's claim is
that variance information, not mean accuracy, is where the $1,500 weekly-high
pot is won — and the props snapshot already carries the information: how
much a player's realized points scatter around his market-implied points
depends on HOW MUCH the market expects of him and how many markets price him.

MEASURED 2026-09-02 on 54 hydrated 2023-25 weeks × realized nflverse points
(11,560 player-weeks with a 2026 board position; the 4,578 without one are
retired/undrafted and dropped, not zeroed):

    residual sd (realized − implied), by implied-points bucket
    QB : 10-15 → 8.4   15-20 → 9.6   20+ → 9.6
    RB :  0-5 → 4.2     5-10 → 6.1   10-15 → 6.5   15-20 → 7.4
    WR :  0-5 → 4.1     5-10 → 6.1   10-15 → 7.0   15-20 → 8.3
    TE :  0-5 → 3.5     5-10 → 5.4   10-15 → 7.1

So the flat fallback is right in the middle and wrong at both ends by ±3 pts
of sd — and the tails are exactly the bench-vs-starter and stud-vs-scrub
calls the chase lineup turns on. The table is fitted as `sd ≈ a + b·implied`
per position (a straight line through the bucket sds, clipped to the
measured range), written to `draft/data/props_residual_sd.json`, and
`fetch_free_props.py` stamps `sd` on every priced player from it.

CONTROLS (Rule 3e — a spread table that cannot fail is not a measurement):
  C1 known-positive: shuffling implied points within a week must RAISE the
     residual sd (the market carries information; 10.25 vs 5.90 measured).
  C2 known-negative: feeding realized points as the implied points gives a
     residual sd of exactly 0 at every position.
  C3 shape: within every position the bucket sd is non-decreasing in implied
     points, or the fit is refused (a line through a non-monotone table
     would be a story, not a spread).

Run:  python3 draft/tools/props_spread.py [--write] [--json]
"""
import argparse
import glob
import json
import random
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
HYDRATED = ROOT / "draft" / "data" / "props_backtest"
REALIZED = ROOT / "draft" / "backtest" / "nflverse_weekly_points_{y}.json"
OUT = ROOT / "draft" / "data" / "props_residual_sd.json"
SEASONS = (2023, 2024, 2025)
BUCKETS = ((0, 5), (5, 10), (10, 15), (15, 20), (20, 99))
MIN_N = 30
POSITIONS = ("QB", "RB", "WR", "TE")


def load_pairs():
    """(pos, implied, realized) for every hydrated player-week with a realized
    score and a board position. Absent realized = not played, dropped."""
    pos = {str(r["player_id"]): r.get("position") for r in json.load(open(BOARD))["players"]}
    real = {}
    for y in SEASONS:
        for w in json.load(open(str(REALIZED).format(y=y)))["weeks"]:
            real[(y, int(w["week"]))] = w["points"]
    pairs, dropped_nopos, weeks = [], 0, set()
    for f in sorted(glob.glob(str(HYDRATED / "weekly_props_*_w*.json"))):
        d = json.load(open(f))
        y, wk = int(d["season"]), int(d["week"])
        r = real.get((y, wk))
        if not r:
            continue
        weeks.add((y, wk))
        for pid, p in d["players"].items():
            a = r.get(pid)
            if a is None:
                continue
            ps = pos.get(pid)
            if ps not in POSITIONS:
                dropped_nopos += 1
                continue
            pairs.append((ps, float(p["points"]), float(a), y, wk))
    return pairs, dropped_nopos, len(weeks)


def bucket_table(pairs):
    table = {}
    for P in POSITIONS:
        rows = [(p, a) for ps, p, a, *_ in pairs if ps == P]
        cells = []
        for lo, hi in BUCKETS:
            r = [(p, a) for p, a in rows if lo <= p < hi]
            if len(r) >= MIN_N:
                cells.append({"lo": lo, "hi": hi, "n": len(r),
                              "implied_mean": round(st.mean(p for p, _ in r), 2),
                              "bias": round(st.mean(a - p for p, a in r), 2),
                              "sd": round(st.pstdev([a - p for p, a in r]), 2)})
        table[P] = {"n": len(rows), "sd_all": round(st.pstdev([a - p for p, a in rows]), 2) if rows else None,
                    "buckets": cells}
    return table


def fit_lines(table):
    """sd ≈ a + b·implied per position through the bucket (implied_mean, sd)
    points; the fit is clipped to [min bucket sd, max bucket sd] at use time
    so a line never extrapolates past what was measured."""
    fits = {}
    for P, t in table.items():
        cells = t["buckets"]
        if len(cells) < 2:
            continue
        xs = [c["implied_mean"] for c in cells]
        ys = [c["sd"] for c in cells]
        mx, my = st.mean(xs), st.mean(ys)
        b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
        a = my - b * mx
        fits[P] = {"a": round(a, 3), "b": round(b, 4), "sd_min": min(ys), "sd_max": max(ys),
                   "implied_min": min(xs), "implied_max": max(xs), "buckets_used": len(cells)}
    return fits


def sd_for(pos, implied, fits):
    """The per-player weekly sd for a priced player; None when the position
    is not in the table (K/DEF — the solver keeps its own fallback there)."""
    f = fits.get(pos)
    if not f or implied is None:
        return None
    v = f["a"] + f["b"] * float(implied)
    return round(min(max(v, f["sd_min"]), f["sd_max"]), 2)


def controls(pairs, table):
    out = []
    # C1 known-positive: shuffled implied within week must be worse
    random.seed(1)
    byweek = {}
    for ps, p, a, y, wk in pairs:
        byweek.setdefault((y, wk), []).append((p, a))
    true_res = [a - p for _, p, a, *_ in pairs]
    sh = []
    for v in byweek.values():
        ps_ = [p for p, _ in v]
        random.shuffle(ps_)
        sh += [a - p for p, (_, a) in zip(ps_, v)]
    c1 = st.pstdev(sh) > st.pstdev(true_res) * 1.2
    out.append({"id": "C1", "what": "shuffling implied points within a week raises residual sd by >20%",
                "true_sd": round(st.pstdev(true_res), 2), "shuffled_sd": round(st.pstdev(sh), 2), "ok": c1})
    # C2 known-negative: implied == realized -> sd 0 everywhere
    perfect = [(ps, a, a, y, wk) for ps, p, a, y, wk in pairs]
    t2 = bucket_table(perfect)
    c2 = all(c["sd"] == 0 for P in t2 for c in t2[P]["buckets"])
    out.append({"id": "C2", "what": "a perfect forecast measures sd 0 at every position/bucket", "ok": c2})
    # C3 shape: bucket sd non-decreasing in implied within each position
    bad = [P for P, t in table.items()
           if any(t["buckets"][i]["sd"] > t["buckets"][i + 1]["sd"] + 0.05 for i in range(len(t["buckets"]) - 1))]
    out.append({"id": "C3", "what": "within each position the bucket sd is non-decreasing in implied points",
                "violations": bad, "ok": not bad})
    return out


def build():
    pairs, dropped, weeks = load_pairs()
    table = bucket_table(pairs)
    ctl = controls(pairs, table)
    fits = fit_lines(table) if all(c["ok"] for c in ctl) else {}
    return {
        "_territory": "TERRITORY: relay — produced by draft/tools/props_spread.py (P355's feed)",
        "_what": ("Per-position residual sd of realized weekly points around market-implied points, by "
                  "implied-points bucket, and a clipped linear fit sd ≈ a + b·implied. fetch_free_props.py "
                  "stamps `sd` on every priced player from `fits`; the E[$] solver reads p.sd. REPORT-ONLY "
                  "until P355 grades — the point-estimate solver stays the default (A's call)."),
        "_controls_rule": "fits are EMPTY when any control fails; a consumer must treat that as no feed, not sd 0",
        "measured": {"seasons": list(SEASONS), "weeks": weeks, "player_weeks": len(pairs),
                     "dropped_no_board_position": dropped, "min_bucket_n": MIN_N},
        "controls": ctl,
        "table": table,
        "fits": fits,
        "solver_fallback_for_reference": {"QB": 8, "RB": 7, "WR": 7, "TE": 6},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    doc = build()
    if a.json:
        print(json.dumps(doc, indent=1))
    else:
        m = doc["measured"]
        print(f"PROPS SPREAD — {m['player_weeks']} player-weeks, {m['weeks']} weeks, "
              f"{m['dropped_no_board_position']} dropped (no 2026 board position)")
        for c in doc["controls"]:
            print(f"  {'✅' if c['ok'] else '🔴'} {c['id']} {c['what']}"
                  + (f" — {c['true_sd']} vs {c['shuffled_sd']}" if c["id"] == "C1" else "")
                  + (f" — violations {c['violations']}" if c["id"] == "C3" and c["violations"] else ""))
        for P, t in doc["table"].items():
            cells = " ".join(f"{c['lo']}-{c['hi']}:{c['sd']}(n={c['n']})" for c in t["buckets"])
            f = doc["fits"].get(P)
            print(f"  {P}: sd_all {t['sd_all']} | {cells}"
                  + (f" | fit sd ≈ {f['a']} + {f['b']}·implied, clipped [{f['sd_min']}, {f['sd_max']}]" if f else " | NO FIT"))
    if not doc["fits"]:
        print("🔴 a control failed — nothing written")
        return 1
    if a.write:
        OUT.write_text(json.dumps(doc, indent=1) + "\n")
        print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
