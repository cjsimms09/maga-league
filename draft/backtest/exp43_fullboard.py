#!/usr/bin/env python3
"""EXPERIMENT 43 — THE FULL-BOARD PICK AUDIT.

Grades EVERY real pick by EVERY owner across all three drafts market-relative — no
replay, no counterfactual (see EXP43-PREREG.md). Consumes the richer per-pick rows
exp36 now emits ({season, roster_id, pick_no, round, position, adp, realized}) and
answers: which kinds of picks beat the market, does reaching ever pay and where, who
drafts well, are Cory's picks different, and does the dead zone show in residuals.

PURE. `run(rows, cory_seat=...)` takes the rows and returns the audit; the egress
that BUILDS the rows lives in exp36 (CI only). Unit-tested in test_exp43.py — no
egress needed for the tests. LEADS in realized-points RESIDUAL, the robust quantity;
dollars are roster-dependent and live in the strategy grid (exp 44).

Guards (pre-registered): n>=8 floor per reported cell; bootstrap 95% CI (percentile);
multiple-comparisons count + Benjamini-Hochberg FDR flag at q=0.10; leave-one-season-
out sign check for STABLE. Nothing installs — this is a surface.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

FLOOR = 8           # exp36's cell floor: report a cell only at n>=8
BOOT = 2000         # bootstrap resamples for CIs
FDR_Q = 0.10        # Benjamini-Hochberg false-discovery rate
ROUND_BANDS = [("R1-3", 1, 3), ("R4-7", 4, 7), ("R8-11", 8, 11), ("R12+", 12, 99)]
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
# reach = pick_no - adp; negative = fell to you, positive = you reached
REACH_BUCKETS = [("fell_far", -10**9, -20), ("fell", -20, -6), ("at_market", -6, 6),
                 ("reached", 6, 20), ("big_reach", 20, 10**9)]
MIDROUND_LO, MIDROUND_HI = 51, 90     # overall-pick dead-zone cross-check window


# ---- tiny stats (no numpy; deterministic bootstrap via a seeded LCG) ----------
def _mean(xs):
    return sum(xs) / len(xs) if xs else None


class _RNG:
    """Deterministic LCG so CI runs are reproducible without Math.random/numpy."""
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def idx(self, n):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s % n


def boot_ci(xs, seed=43, reps=BOOT, lo=2.5, hi=97.5):
    """Percentile bootstrap CI of the mean. Returns (lo, hi) or (None, None)."""
    n = len(xs)
    if n < 2:
        return (None, None)
    rng = _RNG(seed)
    means = []
    for _ in range(reps):
        acc = 0.0
        for _ in range(n):
            acc += xs[rng.idx(n)]
        means.append(acc / n)
    means.sort()
    def pct(p):
        k = min(len(means) - 1, max(0, int(round(p / 100 * (len(means) - 1)))))
        return means[k]
    return (round(pct(lo), 2), round(pct(hi), 2))


def _excludes_zero(ci):
    return ci[0] is not None and (ci[0] > 0 or ci[1] < 0)


def _p_two_sided_from_ci_reps(xs, seed=43, reps=BOOT):
    """Bootstrap two-sided p for mean != 0: 2*min(frac<=0, frac>=0)."""
    n = len(xs)
    if n < 2:
        return 1.0
    rng = _RNG(seed)
    le = ge = 0
    for _ in range(reps):
        acc = 0.0
        for _ in range(n):
            acc += xs[rng.idx(n)]
        m = acc / n
        if m <= 0:
            le += 1
        if m >= 0:
            ge += 1
    return min(1.0, 2.0 * min(le, ge) / reps)


def bh_flags(pvals, q=FDR_Q):
    """Benjamini-Hochberg: return a set of indices that survive FDR q."""
    m = len(pvals)
    if not m:
        return set()
    order = sorted(range(m), key=lambda i: pvals[i])
    survive = set()
    kmax = -1
    for rank, i in enumerate(order, start=1):
        if pvals[i] <= q * rank / m:
            kmax = rank
    for rank, i in enumerate(order, start=1):
        if rank <= kmax:
            survive.add(i)
    return survive


# ---- residual model: E[realized | adp] via ADP deciles ------------------------
def expected_by_adp_decile(rows):
    """Leaguewide realized-vs-ADP curve as decile-bin means. Returns a function
    adp -> expected realized. Robust + transparent (pre-registered)."""
    graded = [r for r in rows if r.get("adp") is not None and r.get("realized") is not None]
    if not graded:
        return (lambda a: None), []
    ordered = sorted(graded, key=lambda r: r["adp"])
    n = len(ordered)
    edges = [ordered[min(n - 1, int(round(k / 10 * n)))]["adp"] for k in range(1, 10)]
    bins = [[] for _ in range(10)]
    for r in ordered:
        b = 0
        while b < 9 and r["adp"] > edges[b]:
            b += 1
        bins[b].append(r["realized"])
    means = [(_mean(b) if b else None) for b in bins]
    # fill empty bins from nearest non-empty (rare)
    for i in range(10):
        if means[i] is None:
            for j in list(range(i, 10)) + list(range(i, -1, -1)):
                if means[j] is not None:
                    means[i] = means[j]
                    break

    def expected(adp):
        if adp is None:
            return None
        b = 0
        while b < 9 and adp > edges[b]:
            b += 1
        return means[b]
    return expected, edges


def with_residuals(rows):
    """Attach residual = realized - E[realized|adp] and reach = pick_no - adp."""
    expected, _edges = expected_by_adp_decile(rows)
    out = []
    for r in rows:
        rr = dict(r)
        exp = expected(r.get("adp"))
        rr["expected"] = round(exp, 2) if exp is not None else None
        rr["residual"] = (round(r["realized"] - exp, 2)
                          if (exp is not None and r.get("realized") is not None) else None)
        if r.get("pick_no") is not None and r.get("adp") is not None:
            rr["reach"] = round(r["pick_no"] - r["adp"], 1)
        else:
            rr["reach"] = None
        out.append(rr)
    return out


def _okey(r):
    """Stable owner identity: display_name if present (survives per-season roster_id
    reshuffles), else the raw roster_id (synthetic tests use roster_id alone)."""
    o = r.get("owner")
    return o if o is not None else r.get("roster_id")


def _band_of(rnd):
    for name, lo, hi in ROUND_BANDS:
        if rnd is not None and lo <= rnd <= hi:
            return name
    return None


def _cell(residuals, seed):
    xs = [x for x in residuals if x is not None]
    n = len(xs)
    if n < FLOOR:
        return {"n": n, "thin": True, "mean_residual": (round(_mean(xs), 2) if xs else None)}
    ci = boot_ci(xs, seed=seed)
    p = _p_two_sided_from_ci_reps(xs, seed=seed)
    return {"n": n, "thin": False, "mean_residual": round(_mean(xs), 2),
            "ci95": list(ci), "beats_market": bool(ci[0] is not None and ci[0] > 0),
            "p": round(p, 4)}


# ---- the five questions -------------------------------------------------------
def by_round_position(rows):
    cells, keys = {}, []
    for name, _lo, _hi in ROUND_BANDS:
        cells[name] = {}
        for pos in POSITIONS:
            res = [r["residual"] for r in rows if _band_of(r.get("round")) == name
                   and r.get("position") == pos]
            c = _cell(res, seed=hash((name, pos)) & 0xFFFF or 7)
            cells[name][pos] = c
            if not c["thin"]:
                keys.append((name, pos, c))
    _apply_fdr(keys)
    return cells


def does_reaching_pay(rows, within_position=None):
    out = {}
    keys = []
    src = [r for r in rows if within_position is None or r.get("position") == within_position]
    for name, lo, hi in REACH_BUCKETS:
        res = [r["residual"] for r in src
               if r.get("reach") is not None and lo <= r["reach"] < hi and r.get("residual") is not None]
        c = _cell(res, seed=(hash((name, within_position)) & 0xFFFF) or 11)
        out[name] = c
        if not c["thin"]:
            keys.append((name, within_position, c))
    _apply_fdr(keys)
    return out


def who_drafts_well(rows, name_by_seat=None):
    seats = sorted({_okey(r) for r in rows if _okey(r) is not None}, key=lambda x: str(x))
    out, keys = {}, []
    for seat in seats:
        res = [r["residual"] for r in rows if _okey(r) == seat and r.get("residual") is not None]
        c = _cell(res, seed=(hash(("owner", seat)) & 0xFFFF) or 13)
        c["owner"] = (name_by_seat or {}).get(str(seat), str(seat))
        out[str(seat)] = c
        if not c["thin"]:
            keys.append((seat, None, c))
    _apply_fdr(keys)
    return out


def cory_vs_field(rows, cory_seat):
    mine = [r["residual"] for r in rows if _okey(r) == cory_seat and r.get("residual") is not None]
    field = [r["residual"] for r in rows if _okey(r) != cory_seat and r.get("residual") is not None]
    mm, fm = _mean(mine), _mean(field)
    ci_mine = boot_ci(mine, seed=17)
    ci_field = boot_ci(field, seed=19)
    # difference bootstrap
    diff = None
    if len(mine) >= 2 and len(field) >= 2:
        rng = _RNG(23)
        diffs = []
        for _ in range(BOOT):
            a = sum(mine[rng.idx(len(mine))] for _ in range(len(mine))) / len(mine)
            b = sum(field[rng.idx(len(field))] for _ in range(len(field))) / len(field)
            diffs.append(a - b)
        diffs.sort()
        diff = {"mean": round(mm - fm, 2),
                "ci95": [round(diffs[int(0.025 * (len(diffs) - 1))], 2),
                         round(diffs[int(0.975 * (len(diffs) - 1))], 2)]}
    return {"cory": {"n": len(mine), "mean_residual": (round(mm, 2) if mm is not None else None),
                     "ci95": list(ci_mine)},
            "field": {"n": len(field), "mean_residual": (round(fm, 2) if fm is not None else None),
                      "ci95": list(ci_field)},
            "difference": diff,
            "verdict": (("different: " + ("Cory above field" if diff["mean"] > 0 else "Cory below field"))
                        if (diff and _excludes_zero(diff["ci95"])) else "not separable (CI includes 0)")}


def deadzone_crosscheck(rows):
    """RB vs WR mean residual in the mid-round window (overall pick 51-90)."""
    out = {}
    for pos in ("RB", "WR"):
        res = [r["residual"] for r in rows if r.get("position") == pos
               and r.get("pick_no") is not None and MIDROUND_LO <= r["pick_no"] <= MIDROUND_HI
               and r.get("residual") is not None]
        out[pos] = _cell(res, seed=(hash(("dz", pos)) & 0xFFFF) or 29)
    out["window"] = [MIDROUND_LO, MIDROUND_HI]
    return out


def _apply_fdr(keys):
    """Mutate each cell dict in `keys` with an fdr_survive flag over its family."""
    if not keys:
        return
    pv = [c.get("p", 1.0) for (_a, _b, c) in keys]
    survive = bh_flags(pv)
    for i, (_a, _b, c) in enumerate(keys):
        c["fdr_survive"] = i in survive
        if c.get("beats_market") and not c["fdr_survive"]:
            c["note"] = "nominal only (fails BH FDR q=0.10)"


def loso_sign_stable(rows, selector):
    """Sign-stable across leave-one-season-out refits? selector(rows)->mean or None."""
    seasons = sorted({r.get("season") for r in rows if r.get("season") is not None})
    if len(seasons) < 2:
        return None
    signs = []
    for drop in seasons:
        sub = [r for r in rows if r.get("season") != drop]
        m = selector(with_residuals(sub))
        if m is not None:
            signs.append(1 if m > 0 else (-1 if m < 0 else 0))
    return bool(signs) and len(set(signs)) == 1


def run(rows, cory_seat=None, name_by_seat=None):
    rows = with_residuals(rows)
    gradeable = [r for r in rows if r.get("residual") is not None]
    seasons = sorted({r.get("season") for r in gradeable if r.get("season") is not None})
    reach_overall = does_reaching_pay(rows)
    result = {
        "experiment": "43 — full-board pick audit (every pick, every owner, market-relative)",
        "n_gradeable_picks": len(gradeable),
        "seasons": seasons,
        "prereg": "EXP43-PREREG.md",
        "floor": FLOOR,
        "by_round_position_residual": by_round_position(rows),
        "does_reaching_pay_overall": reach_overall,
        "does_reaching_pay_by_position": {pos: does_reaching_pay(rows, within_position=pos)
                                          for pos in ("RB", "WR", "QB", "TE")},
        "who_drafts_well": who_drafts_well(rows, name_by_seat=name_by_seat),
        "deadzone_crosscheck": deadzone_crosscheck(rows),
        "caveat": ("Market-relative (residual vs the leaguewide realized-vs-ADP curve). "
                   "'Was it a good pick' (answered) != 'good pick FOR CORY' (roster-conditional, "
                   "deferred to the strategy grid exp 44). Leads in points-residual; dollars are "
                   "roster-dependent. No install — a skill/reliability surface."),
        "multiplicity": "each family prints n tested; BH FDR q=0.10 flags survivors (fdr_survive).",
        "source_tier": "league-primary",
    }
    if cory_seat is not None:
        result["cory_vs_field"] = cory_vs_field(rows, cory_seat)
        result["cory_seat"] = cory_seat
    return result


if __name__ == "__main__":   # pragma: no cover
    picks_path = HERE / "exp36_picks.json"
    if not picks_path.exists():
        print("exp36_picks.json not found — run exp36 (egress) first"); sys.exit(0)
    payload = json.loads(picks_path.read_text())
    rows = payload.get("picks") or payload
    cory = payload.get("cory_seat") if isinstance(payload, dict) else None
    names = payload.get("name_by_seat") if isinstance(payload, dict) else None
    out = run(rows, cory_seat=cory, name_by_seat=names)
    (HERE / "exp43.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({"n": out["n_gradeable_picks"], "seasons": out["seasons"],
                      "reach_overall": {k: v.get("mean_residual") for k, v in out["does_reaching_pay_overall"].items()}},
                     indent=2))
