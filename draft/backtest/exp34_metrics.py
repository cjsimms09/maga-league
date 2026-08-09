"""EXP 34 — the pure metric functions (policy-level measuring stick).

No egress, no I/O. Operates on two record shapes the egress main assembles:

  POOL (per real pick): [{pid, our_proj, adp, realized}, ...] — every player
       actually on the board at that pick, with our walk-forward projection, the
       market ADP, and realized rest-of-season points.
  DECISION (per real pick): {season, round, pick_no, took_realized,
       adp_best_realized, forgone_value, adp_distance, dispersion,
       crosses_cliff, ...} — my actual pick vs the ADP-preferred available.

Everything here is unit-tested in test_exp34_metrics.py against a fixture, so a
bug in the statistic is caught in the sandbox, not discovered in a CI number.

The direction convention: a metric is "higher = orders realized value better".
For our projection that is spearman(our_proj, realized); for ADP (lower is better)
that is spearman(-adp, realized). A deviation "HIT" = took_realized > adp_best_realized.
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lab_projections import spearman   # reused, already unit-tested in the Lab


# ─────────────────────────────────────────────────────────────── bootstrap ──
def bootstrap_ci(xs: list[float], iters: int = 5000, seed: int = 34) -> tuple[float, float]:
    """Deterministic percentile-bootstrap 95% CI of the mean. Pure LCG, no numpy —
    a metric that moves between runs is not a metric."""
    xs = [x for x in xs if x is not None]
    if len(xs) < 2:
        return (float("nan"), float("nan"))
    state = seed & 0x7FFFFFFF
    def rnd():
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF
    n = len(xs)
    means = []
    for _ in range(iters):
        means.append(sum(xs[int(rnd() * n)] for _ in range(n)) / n)
    means.sort()
    return (round(means[int(0.025 * iters)], 3), round(means[int(0.975 * iters)], 3))


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 3) if xs else float("nan")


def _verdict(mean, lo, hi, n):
    """Inconclusive when the CI spans zero (or n too thin) — which the
    pre-registration reads as arguing for the anchor to bind HARDER, not as a tie."""
    if n < 2 or lo != lo or (lo <= 0 <= hi):
        return "inconclusive"
    return "beat" if mean > 0 else "lost"


# ──────────────────────────────────── 1. RANK CORRELATION over the pool ──────
def pool_correlations(pool: list[dict]) -> dict | None:
    """One pick's pool: how well each ordering ranks realized value.
    Skips a pool with <3 gradeable players (a correlation on two points is noise)."""
    rows = [r for r in pool if r.get("realized") is not None]
    if len(rows) < 3:
        return None
    realized = [r["realized"] for r in rows]
    rho_our = spearman([r["our_proj"] for r in rows], realized)
    rho_mkt = spearman([-r["adp"] for r in rows], realized)   # -adp: higher = market prefers
    return {"rho_our": rho_our, "rho_market": rho_mkt, "diff": rho_our - rho_mkt,
            "pool_n": len(rows)}


def aggregate_correlations(pools: list[list[dict]]) -> dict:
    """Mean per-pick correlation for each ordering, bootstrap CI over PICKS, and
    the paired difference (our - market) — the primary metric."""
    per = [pc for pc in (pool_correlations(p) for p in pools) if pc]
    our = [c["rho_our"] for c in per]
    mkt = [c["rho_market"] for c in per]
    diff = [c["diff"] for c in per]
    dlo, dhi = bootstrap_ci(diff)
    return {"n_picks": len(per),
            "rho_our_mean": _mean(our), "rho_our_ci": bootstrap_ci(our),
            "rho_market_mean": _mean(mkt), "rho_market_ci": bootstrap_ci(mkt),
            "diff_mean": _mean(diff), "diff_ci": [dlo, dhi],
            "verdict": _verdict(_mean(diff), dlo, dhi, len(per))}


# ─────────────────────────────────────────── 2. TOP-N SET VALUE ──────────────
def topn_value(pools: list[list[dict]], n: int) -> dict:
    """Mean realized points of OUR top-n vs the MARKET's top-n of the available
    pool, per pick, aggregated. A rec is not wrong because #1 busted if #2/#3 hit."""
    deltas, ours, mkts = [], [], []
    for pool in pools:
        rows = [r for r in pool if r.get("realized") is not None]
        if len(rows) < n:
            continue
        our_top = sorted(rows, key=lambda r: -r["our_proj"])[:n]
        mkt_top = sorted(rows, key=lambda r: r["adp"])[:n]
        ov = _mean([r["realized"] for r in our_top])
        mv = _mean([r["realized"] for r in mkt_top])
        ours.append(ov); mkts.append(mv); deltas.append(ov - mv)
    lo, hi = bootstrap_ci(deltas)
    return {"n": n, "picks": len(deltas), "our_mean": _mean(ours), "market_mean": _mean(mkts),
            "delta_mean": _mean(deltas), "delta_ci": [lo, hi],
            "verdict": _verdict(_mean(deltas), lo, hi, len(deltas))}


# ─────────────────────────── 3+sensitivity. BUCKETED HIT-RATE CURVES ─────────
def _bucket(value, edges: list[float]) -> int:
    for i, e in enumerate(edges):
        if value < e:
            return i
    return len(edges)


def bands(decisions: list[dict], key: str, edges: list[float], labels: list[str]) -> list[dict]:
    """Bucket decisions by decision[key] and report, per band: n, hit rate (took
    beat the ADP-preferred available on realized), and mean realized delta with CI.
    This is the shared engine for the forgone-value bands, the ADP-distance bands,
    and the board-position / round / dispersion sensitivity curves."""
    buckets = {i: [] for i in range(len(edges) + 1)}
    for d in decisions:
        v = d.get(key)
        if v is None or d.get("took_realized") is None or d.get("adp_best_realized") is None:
            continue
        buckets[_bucket(v, edges)].append(d)
    out = []
    for i, ds in buckets.items():
        deltas = [d["took_realized"] - d["adp_best_realized"] for d in ds]
        hits = sum(1 for x in deltas if x > 0)
        lo, hi = bootstrap_ci(deltas)
        out.append({"band": labels[i] if i < len(labels) else f"band{i}",
                    "n": len(ds),
                    "hit_rate": round(hits / len(ds), 3) if ds else None,
                    "mean_delta": _mean(deltas), "ci": [lo, hi],
                    "verdict": _verdict(_mean(deltas), lo, hi, len(ds)),
                    "thin": len(ds) < 8})
    return out


def cliff_split(decisions: list[dict]) -> dict:
    """Tier-cliff proximity as a two-group split: deviations that CROSS a tier
    boundary vs stay INSIDE one. If crossing is where we lose, the anchor should be
    stronger near cliffs and can relax inside tiers."""
    groups = {"crosses_cliff": [], "within_tier": []}
    for d in decisions:
        if d.get("took_realized") is None or d.get("adp_best_realized") is None or d.get("crosses_cliff") is None:
            continue
        groups["crosses_cliff" if d["crosses_cliff"] else "within_tier"].append(d)
    res = {}
    for g, ds in groups.items():
        deltas = [d["took_realized"] - d["adp_best_realized"] for d in ds]
        hits = sum(1 for x in deltas if x > 0)
        lo, hi = bootstrap_ci(deltas)
        res[g] = {"n": len(ds), "hit_rate": round(hits / len(ds), 3) if ds else None,
                  "mean_delta": _mean(deltas), "ci": [lo, hi], "thin": len(ds) < 8}
    return res


# ── the deviation-cost accounting the reframe requires ───────────────────────
def forgone_value(decision: dict) -> float | None:
    """value(ADP-preferred available) - value(our pick), in OUR projected points —
    what the deviation actually cost at market price. Positive = we paid to reach."""
    a, t = decision.get("adp_best_proj"), decision.get("took_proj")
    return None if a is None or t is None else round(a - t, 2)
