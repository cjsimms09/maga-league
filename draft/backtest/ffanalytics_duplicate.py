#!/usr/bin/env python3
# TERRITORY: A
"""DUPLICATE ffanalytics' projections_table() AND DIFF IT AGAINST OUR BOARD.

Prereg: `draft/FFANALYTICS-DUPLICATION-PREREG-2026-08-19.md`, P135 + P136,
committed before this ran.

Cory: *"we obviously can't do it ourselves, we need to look at other models and
duplicate"* -> then *"what about the model from the repos??? have we tested
them"*. **No. I had described it, not run it.** This runs it.

R is not installed and does not need to be. The value layer of
`ffanalytics::projections_table()` is four functions, all read out of
`R/calc_projections.R` and re-implemented here:

  wilcox.loc     L85-95   Hodges-Lehmann: median of pairwise averages + values.
                          Plain mean when n <= 2. **TAKES `w` AND IGNORES IT**
                          -- so their CENTRE is unweighted; only sd and the
                          quantiles are weighted. Noted in the prereg before
                          running so a null weighting effect reads as expected
                          rather than as a bug.
  whdquantile    L38-80   weighted Harrell-Davis: Kish effective n, Beta-CDF
                          cell weights, sum(w_i * x_(i)).
  weighted.sd    L7-21
  default_baseline L173   QB13 RB35 WR36 TE13 K8 DST3

REPORT ONLY. Writes no board field. `no_fit_guard`: nothing is selected here.

Run: python3 draft/backtest/ffanalytics_duplicate.py [--json <path>]
"""
from __future__ import annotations

import json
import math
import statistics as st
import sys
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent

MULTI = DRAFT / "data" / "multisource_projections.json"
BOARD = ROOT / "public" / "draft_data.json"

# ffanalytics R/calc_projections.R:173
DEFAULT_BASELINE = {"QB": 13, "RB": 35, "WR": 36, "TE": 13, "K": 8, "DEF": 3}
# ffanalytics R/calc_projections.R:106-110 (DST->DEF, our label)
DEFAULT_WEIGHTS = {"CBS": 0.145, "Yahoo": 0.0, "ESPN": 0.157, "NFL": 0.140,
                   "FFToday": 0.151, "NumberFire": 0.142, "FantasyPros": 0.0,
                   "FantasySharks": 0.142, "FantasyFootballNerd": 0.0,
                   "WalterFootball": 0.130, "RTSports": 0.123,
                   "FantasyData": 0.0, "FleaFlicker": 0.0, "FanDuel": 0.142}
PROBS = (0.05, 0.95)          # L467
OUR_Z = 1.28                  # draft/multisource_blend.py:51


# ── the regularised incomplete beta, because scipy is not installed ─────────
def _betacf(a: float, b: float, x: float) -> float:
    """Lentz's continued fraction for I_x(a,b). Standard NR formulation."""
    tiny, eps, itmax = 1e-30, 3e-16, 300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d
    for m in range(1, itmax + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < eps:
            break
    return h


def pbeta(x: float, a: float, b: float) -> float:
    """I_x(a,b) — R's pbeta(x, a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
             + a * math.log(x) + b * math.log1p(-x))
    front = math.exp(lbeta)
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                          + b * math.log1p(-x) + a * math.log(x)) \
        * _betacf(b, a, 1.0 - x) / b


# ── the three ffanalytics estimators ────────────────────────────────────────
def wilcox_loc(vec, w=None):
    """R L85-95. `w` is accepted and IGNORED, exactly as in the original."""
    v = [float(x) for x in vec]
    if len(v) <= 2:
        return sum(v) / len(v) if v else float("nan")
    pair_avg = sorted(v + [(a + b) / 2.0 for a, b in combinations(v, 2)])
    return st.median(pair_avg)


def weighted_sd(x, w):
    """R L7-21."""
    n = len(x)
    if n <= 1:
        return 0.0
    sw = sum(w)
    mu = sum(xi * wi for xi, wi in zip(x, w)) / sw
    num = sum(wi * (xi - mu) ** 2 for xi, wi in zip(x, w))
    return math.sqrt(num / (sw * (n - 1) / n))


def whdquantile(x, w, probs=PROBS):
    """R L38-80. Weighted Harrell-Davis (Akinshin 2023)."""
    pairs = [(xi, wi) for xi, wi in zip(x, w) if wi is not None and wi > 0]
    if len(pairs) <= 1:
        return [float("nan")] * len(probs)
    pairs.sort(key=lambda t: t[0])
    xs = [t[0] for t in pairs]
    ws = [t[1] for t in pairs]
    nw = sum(ws) ** 2 / sum(wi * wi for wi in ws)      # Kish effective n
    tot = sum(ws)
    ws = [wi / tot for wi in ws]
    cdf_probs, acc = [0.0], 0.0
    for wi in ws:
        acc += wi
        cdf_probs.append(acc)
    out = []
    for p in probs:
        a, b = (nw + 1.0) * p, (nw + 1.0) * (1.0 - p)
        q = [pbeta(cp, a, b) for cp in cdf_probs]
        cell = [q[i + 1] - q[i] for i in range(len(q) - 1)]
        out.append(sum(c * xi for c, xi in zip(cell, xs)))
    return out


# ── controls ────────────────────────────────────────────────────────────────
def controls(players) -> dict:
    c = {}

    # C2 — pbeta against values known in closed form.
    ok = (abs(pbeta(0.3, 1, 1) - 0.3) < 1e-9
          and abs(pbeta(0.5, 4, 4) - 0.5) < 1e-9
          and abs(pbeta(0.25, 2, 5) - (1 - pbeta(0.75, 5, 2))) < 1e-9)
    c["C2_pbeta_known_values"] = {
        "ok": ok, "why": "I_x(1,1)=x; I_.5(a,a)=.5; I_x(a,b)=1-I_(1-x)(b,a). "
                         "Hand-rolled because scipy is absent."}

    # C3 — wilcox.loc against the R source's own stated behaviour.
    c["C3_wilcox_known_values"] = {
        "ok": abs(wilcox_loc([1, 2, 3]) - 2.0) < 1e-12
              and abs(wilcox_loc([10.0, 20.0]) - 15.0) < 1e-12,
        "why": "symmetric triple -> 2; n<=2 returns the plain mean (R L88)"}

    # C4 — quantiles must bracket, and the median must behave.
    xs = [float(i) for i in range(1, 102)]
    med = whdquantile(xs, [1.0] * len(xs), (0.5,))[0]
    br = all(min(xs) <= q <= max(xs) for q in whdquantile(xs, [1.0] * 101, PROBS))
    c["C4_whd_brackets_and_median"] = {
        "ok": br and abs(med - 51.0) < 0.5,
        "got_median": round(med, 3),
        "why": "every quantile inside [min,max]; equal weights on 1..101 -> ~51"}

    # C1 — THE STRONG ONE. Reproduce the committed artifact's own mean.
    worst, worst_id = 0.0, None
    for pid, r in players.items():
        vals = list(r["by_source"].values())
        got = sum(vals) / len(vals)
        d = abs(got - float(r["mean"]))
        if d > worst:
            worst, worst_id = d, pid
    c["C1_reproduces_committed_mean"] = {
        "ok": worst < 0.011, "worst_abs_diff": round(worst, 5),
        "worst_player": worst_id,
        "why": "if this harness cannot reproduce numbers ALREADY IN THE REPO, "
               "no difference it reports downstream is real"}
    return c


# ── the two boards ──────────────────────────────────────────────────────────
def build(players, use_ffa_estimators: bool, use_ffa_baseline: bool,
          board_pos: dict) -> dict:
    """One arm. Returns {pid: {points, floor, ceiling, pos}} plus VOR."""
    rows = {}
    for pid, r in players.items():
        pos = board_pos.get(pid) or r.get("position")
        if pos not in DEFAULT_BASELINE:
            continue
        srcs = list(r["by_source"].items())
        vals = [v for _, v in srcs]
        ws = [DEFAULT_WEIGHTS.get(s, 0.0) for s, _ in srcs]
        if not any(w > 0 for w in ws):
            ws = [1.0] * len(vals)
        if use_ffa_estimators:
            pts = wilcox_loc(vals)
            if len(vals) >= 2:
                fl, ce = whdquantile(vals, ws, PROBS)
            else:
                fl = ce = pts
        else:
            pts = sum(vals) / len(vals)
            sd = st.pstdev(vals) if len(vals) > 1 else 0.0
            fl, ce = pts - OUR_Z * sd, pts + OUR_Z * sd
        rows[pid] = {"points": pts, "floor": fl, "ceiling": ce, "pos": pos}

    # VOR — ffanalytics L497-508: subtract the baseline-rank player's OWN
    # points / floor / ceiling, each ranked separately.
    for pos, rank in DEFAULT_BASELINE.items():
        grp = [r for r in rows.values() if r["pos"] == pos]
        if not grp:
            continue
        if use_ffa_baseline:
            k = min(rank, len(grp)) - 1
            ref_p = sorted((r["points"] for r in grp), reverse=True)[k]
            ref_f = sorted((r["floor"] for r in grp), reverse=True)[k]
            ref_c = sorted((r["ceiling"] for r in grp), reverse=True)[k]
        else:
            ref_p = ref_f = ref_c = OUR_REPL.get(pos, 0.0)
        for r in grp:
            r["points_vor"] = r["points"] - ref_p
            r["floor_vor"] = r["floor"] - ref_f
            r["ceiling_vor"] = r["ceiling"] - ref_c
    return rows


OUR_REPL: dict = {}


def order(rows, key="points_vor"):
    return [pid for pid, _ in sorted(rows.items(),
                                     key=lambda kv: -kv[1].get(key, -1e9))]


def moved(a_order, b_order, top=50, thresh=3):
    """How many of a_order's top `top` move by >= thresh in b_order."""
    bpos = {pid: i for i, pid in enumerate(b_order)}
    n = 0
    for i, pid in enumerate(a_order[:top]):
        j = bpos.get(pid)
        if j is None or abs(j - i) >= thresh:
            n += 1
    return n


def main() -> int:
    multi = json.loads(MULTI.read_text())
    board = json.loads(BOARD.read_text())
    players = multi["players"]
    bp = {str(p["player_id"]): p.get("position") for p in board["players"]}
    for p in board["players"]:
        if p.get("position") in DEFAULT_BASELINE and p.get("replacement"):
            OUR_REPL.setdefault(p["position"], float(p["replacement"]))

    ctl = controls(players)

    ours = build(players, False, False, bp)
    est_only = build(players, True, False, bp)
    base_only = build(players, False, True, bp)
    ffa = build(players, True, True, bp)

    # C5 — baseline sanity
    ok5 = True
    for pos, rank in DEFAULT_BASELINE.items():
        grp = sorted((r["points"] for r in ffa.values() if r["pos"] == pos),
                     reverse=True)
        if grp and rank <= len(grp):
            k = min(rank, len(grp)) - 1
            got = max(r["points_vor"] for r in ffa.values() if r["pos"] == pos
                      and abs(r["points"] - grp[k]) < 1e-9)
            if abs(got) > 1e-6:
                ok5 = False
    ctl["C5_baseline_player_has_zero_vor"] = {
        "ok": ok5, "why": "the reference player's own VOR must be exactly 0"}

    all_ok = all(v["ok"] for v in ctl.values())

    o_ord = order(ours)
    p135 = {"estimators_only_moved": moved(o_ord, order(est_only)),
            "baseline_only_moved": moved(o_ord, order(base_only)),
            "both_moved": moved(o_ord, order(ffa))}
    p135["TRUE"] = p135["estimators_only_moved"] < p135["baseline_only_moved"]

    # P136 — ceiling_rank vs rank inside ffanalytics' OWN output
    r_ord, c_ord = order(ffa, "points_vor"), order(ffa, "ceiling_vor")
    cpos = {pid: i for i, pid in enumerate(c_ord)}
    diffs = [abs(cpos[pid] - i) for i, pid in enumerate(r_ord[:100])]
    p136 = {"top100_moving_5plus": sum(1 for d in diffs if d >= 5),
            "median_abs_move": sorted(diffs)[len(diffs) // 2],
            "max_move": max(diffs)}
    p136["TRUE"] = p136["top100_moving_5plus"] >= 25

    print("DUPLICATING ffanalytics::projections_table() — P135 / P136\n")
    for k, v in ctl.items():
        print("  %s %s" % ("OK " if v["ok"] else "!! ", k))
    if not all_ok:
        print("\n  !! A CONTROL FAILED. Nothing below is a measurement.\n")

    print("\n  P135 — top-50 players moving >=3 ranks vs our board:")
    print("     estimators only (HL + weighted HD) : %3d" % p135["estimators_only_moved"])
    print("     baseline only (QB13/RB35/WR36/...)  : %3d" % p135["baseline_only_moved"])
    print("     both (full ffanalytics)             : %3d" % p135["both_moved"])
    print("     P135 %s" % ("TRUE" if p135["TRUE"] else "FALSE"))

    print("\n  P136 — inside ffanalytics' OWN output, ceiling_rank vs rank (top 100):")
    print("     moving >=5 places: %d of 100   median move %d   max %d"
          % (p136["top100_moving_5plus"], p136["median_abs_move"], p136["max_move"]))
    print("     P136 %s" % ("TRUE" if p136["TRUE"] else "FALSE"))

    # what the band estimator actually does, since that is Cory's question
    wid_ours = [r["ceiling"] - r["floor"] for r in ours.values()
                if r["ceiling"] is not None]
    wid_ffa = [r["ceiling"] - r["floor"] for r in ffa.values()
               if r["ceiling"] is not None]
    bands = {"our_median_band_width": round(st.median(wid_ours), 1),
             "ffanalytics_median_band_width": round(st.median(wid_ffa), 1)}
    print("\n  band width (ceiling - floor), median: ours %.1f  ffanalytics %.1f"
          % (bands["our_median_band_width"], bands["ffanalytics_median_band_width"]))

    rep = {"_territory": "TERRITORY: A — draft/backtest/ffanalytics_duplicate.py",
           "_prereg": "draft/FFANALYTICS-DUPLICATION-PREREG-2026-08-19.md",
           "_note": "REPORT ONLY. Writes no board field. no_fit_guard.",
           "controls": ctl, "controls_all_passed": all_ok,
           "our_replacement_used": OUR_REPL,
           "ffanalytics_baseline": DEFAULT_BASELINE,
           "P135": p135, "P136": p136, "bands": bands,
           "n_players": len(ours)}
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(
            json.dumps(rep, indent=1))
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
