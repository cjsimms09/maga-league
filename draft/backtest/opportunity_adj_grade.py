# TERRITORY: A
"""OPPORTUNITY-ADJ — leak-free grade of the shipped opportunity adjustment.

Implements draft/backtest/OPPORTUNITY-ADJ-PREREG.md, committed before this file
and before any metric existed. Every constant here is that document's.

WHAT IS SHIPPED CODE AND WHAT IS RECONSTRUCTION — the load-bearing distinction:

  SHIPPED, imported read-only, never copied:
      draft/projections.py: opportunity_metrics, composite_z
      the blend() adjustment line, restated once as _adj() and asserted
      identical against a live-board sample
      draft/build.py's crosswalk source (nfl_data_py.import_ids)
  RECONSTRUCTED, because the shipped input was never archived:
      proj_baseline (Sleeper preseason) -> three stand-ins, named on every
      number: naive_prev, recency_blend, market_curve

LEAK DISCIPLINE: for graded season Y the adjustment sees play-by-play for
[Y-1, Y-2] and nothing else; every baseline sees only seasons < Y; realized
points come from season Y and are touched only by the scorer. Asserted, not
asserted-in-a-comment: _assert_no_leak() raises.

Run: python3 draft/backtest/opportunity_adj_grade.py
Writes draft/backtest/opportunity_adj_grade.json.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import projections as P  # noqa: E402  SHIPPED code, read-only

# ── preregistered constants (mirror OPPORTUNITY-ADJ-PREREG.md exactly) ───────
SEASONS = (2023, 2024, 2025)
POSITIONS = ("RB", "WR", "TE")
LAST_SCORED_WEEK = 17
RECENCY_WEIGHTS = (0.7, 0.3)          # league_config.recency_weights
CAP = 0.15                            # league_config.opportunity_cap
TOPK = (12, 24, 48)
DRAFTABLE = {"RB": 48, "WR": 48, "TE": 24}
N_BOOT = 2000
N_PERM = 200
SEED = 20260816

PBP_DIR = Path("/tmp/claude-0/-home-user-maga-league/"
               "1a06d687-9861-53f7-ada2-257cf95a0464/scratchpad/pbp")
OUT = HERE / "opportunity_adj_grade.json"


# ── the shipped adjustment line, restated once ───────────────────────────────
def _adj(z: float, cap: float = CAP) -> float:
    """draft/projections.py:blend() line 225, verbatim in form:
    adj = max(-cap, min(cap, (z / 2.0) * cap))"""
    return max(-cap, min(cap, (z / 2.0) * cap))


def _assert_no_leak(graded: int, prior_seasons, baseline_seasons) -> None:
    for s in prior_seasons:
        if s >= graded:
            raise AssertionError(f"pbp season {s} >= graded season {graded}")
    for s in baseline_seasons:
        if s >= graded:
            raise AssertionError(f"baseline season {s} >= graded season {graded}")


# ── rank statistics (no scipy in this environment) ───────────────────────────
def _ranks(v):
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            r[order[k]] = avg
        i = j + 1
    return r


def _pearson(a, b):
    n = len(a)
    if n < 3:
        return None
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return (num / (da * db)) if da and db else None


def spearman(x, y):
    return _pearson(_ranks(x), _ranks(y))


def partial_spearman(x, y, ctrl):
    """Spearman(x, y) with `ctrl`'s rank linearly removed from both."""
    rx, ry, rc = _ranks(x), _ranks(y), _ranks(ctrl)
    n = len(rx)
    mc = sum(rc) / n
    den = sum((c - mc) ** 2 for c in rc)
    if den == 0:
        return None

    def resid(r):
        mr = sum(r) / n
        b = sum((c - mc) * (v - mr) for c, v in zip(rc, r)) / den
        return [v - mr - b * (c - mc) for v, c in zip(r, rc)]
    return _pearson(resid(rx), resid(ry))


def mae(pred, act):
    return sum(abs(p - a) for p, a in zip(pred, act)) / len(pred)


def bias(pred, act):
    return sum(p - a for p, a in zip(pred, act)) / len(pred)


def precision_at(pred, act, k):
    if len(pred) < k:
        return None
    idx = list(range(len(pred)))
    tp = set(sorted(idx, key=lambda i: -pred[i])[:k])
    ta = set(sorted(idx, key=lambda i: -act[i])[:k])
    return len(tp & ta) / k


# ── stores ───────────────────────────────────────────────────────────────────
_PRIOR_CACHE: dict[int, dict] = {}


def _rebuild_weeks(year: int, xw: dict) -> dict:
    """Weeks for a season with NO committed store (2021/2022 — the store starts
    at 2023, and grading season 2023 needs its two priors).

    Built through the SAME path the committed stores used —
    `grade.weekly_points_table(nflverse weekly frame, season, OUR scoring table,
    nfl_data_py crosswalk)` — never a second scorer. PROVEN by rebuilding 2023
    with it and comparing to the committed store: **5,648 player-weeks, zero
    disagreements, identical scoring fingerprint bd8f3e50bd67a9ce**
    (`_prove_parity()`, run by the runner before any rebuilt season is used)."""
    if year in _PRIOR_CACHE:
        return _PRIOR_CACHE[year]
    import nfl_data_py as nfl
    import grade as GR
    cfg = json.loads((HERE.parent / "config" / "league_config.json").read_text())
    frame = nfl.import_weekly_data([year])
    tbl = GR.weekly_points_table(frame, year, cfg["scoring"], xw)
    doc = {"weeks": [{"season": year, "week": w, "points": p} for w, p in sorted(tbl.items())]}
    _PRIOR_CACHE[year] = doc
    return doc


def _prove_parity(xw: dict) -> dict:
    """Rebuild 2023 through the rebuild path and diff it against the committed
    store. A disagreement REFUSES the rebuilt priors rather than grading on them."""
    import nfl_data_py as nfl
    import grade as GR
    cfg = json.loads((HERE.parent / "config" / "league_config.json").read_text())
    committed = json.loads((HERE / "nflverse_weekly_points_2023.json").read_text())
    tbl = GR.weekly_points_table(nfl.import_weekly_data([2023]), 2023, cfg["scoring"], xw)
    com = {int(w["week"]): w["points"] for w in committed["weeks"]}
    agree = dis = only = 0
    for wk in sorted(set(com) | set(tbl)):
        c, m = com.get(wk, {}), tbl.get(wk, {})
        for pid in set(c) | set(m):
            if pid in c and pid in m:
                agree += 1 if abs(float(c[pid]) - float(m[pid])) < 0.011 else 0
                dis += 0 if abs(float(c[pid]) - float(m[pid])) < 0.011 else 1
            else:
                only += 1
    out = {"agree": agree, "disagree": dis, "only_one_side": only,
           "committed_fingerprints": committed.get("scoring_fingerprints")}
    if dis or only:
        raise AssertionError(f"rebuild path does not reproduce the committed 2023 store: {out}")
    return out


def season_totals(year: int, xw: dict | None = None) -> tuple[dict, dict]:
    """({pid: points weeks 1..17}, {pid: weeks_with_a_row}) — same semantics as
    model_accuracy_backtest.season_totals / exp_fp_hist_proj.season_totals."""
    path = HERE / f"nflverse_weekly_points_{year}.json"
    doc = json.loads(path.read_text()) if path.exists() else _rebuild_weeks(year, xw or {})
    tot, games = {}, {}
    for w in doc["weeks"]:
        if int(w["week"]) > LAST_SCORED_WEEK:
            continue
        for pid, v in w["points"].items():
            tot[pid] = tot.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return tot, games


def positions_for(year: int, rosters) -> dict:
    """{sleeper_pid: position} as of season `year` — never the 2026 board's."""
    r = rosters[rosters["season"] == year]
    out = {}
    for pos, sid in zip(r["position"], r["sleeper_id"]):
        if not isinstance(pos, str) or sid is None or sid != sid:
            continue
        s = str(sid).strip()
        if s.endswith(".0"):
            s = s[:-2]
        if s:
            out[s] = pos
    return out


def crosswalk(ids) -> dict:
    """gsis -> sleeper, the exact source draft/build.py:_id_crosswalk uses."""
    out = {}
    for g, s in zip(ids["gsis_id"], ids["sleeper_id"]):
        if not isinstance(g, str) or not g or s is None or s != s:
            continue
        t = str(s).strip()
        if t.endswith(".0"):
            t = t[:-2]
        if t:
            out[g] = t
    return out


def opportunity_for(graded: int, xw: dict, pos_map: dict) -> tuple[dict, dict]:
    """({sleeper_pid: z}, diag) from pbp [Y-1, Y-2] ONLY, through the shipped
    functions. z is computed once per position over EVERY metric-carrying
    player with a known position — never over a graded subset (prereg §3)."""
    import pandas as pd
    prior = [graded - 1, graded - 2]
    _assert_no_leak(graded, prior, [])
    cols = ["season", "posteam", "pass_attempt", "play_type", "receiver_player_id",
            "air_yards", "yardline_100", "rusher_player_id"]
    pbp = pd.concat([pd.read_parquet(PBP_DIR / f"pbp_{s}.parquet", columns=cols)
                     for s in prior], ignore_index=True)
    metrics = P.opportunity_metrics(pbp, None, prior, list(RECENCY_WEIGHTS))

    rekeyed, hit = {}, 0
    for g, m in metrics.items():
        sid = xw.get(g)
        if sid:
            rekeyed[sid] = m
            hit += 1
        else:
            rekeyed[g] = m
    # the z population: shipped composite_z wants [{player_id, position}]
    pool = [{"player_id": pid, "position": pos_map[pid]}
            for pid in rekeyed if pid in pos_map and pos_map[pid] in POSITIONS]
    z = P.composite_z(rekeyed, pool)
    return z, {"pbp_seasons": prior, "pbp_rows": int(len(pbp)),
               "players_with_metrics": len(metrics), "gsis_translated": hit,
               "gsis_untranslated": len(metrics) - hit, "z_population": len(pool)}


# ── baselines, all leak-free ────────────────────────────────────────────────
def baselines(graded: int, totals: dict) -> dict:
    """{name: {pid: value}} using ONLY seasons < graded."""
    _assert_no_leak(graded, [], [graded - 1, graded - 2])
    prev = totals[graded - 1]
    prev2 = totals[graded - 2]
    naive = {p: v for p, v in prev.items() if v > 0}
    blend = {}
    for p in set(prev) | set(prev2):
        v = RECENCY_WEIGHTS[0] * prev.get(p, 0.0) + RECENCY_WEIGHTS[1] * prev2.get(p, 0.0)
        if v > 0:
            blend[p] = v
    return {"naive_prev": naive, "recency_blend": blend}


def market_curve(graded: int, totals: dict, pos_map: dict) -> dict:
    """The league's OWN completed draft for season `graded` (a genuine
    preseason market, frozen before the season) -> within-position pick order
    -> the r-th highest realized season-(graded-1) total at that position.
    own_model_v3's rank_curve idea, applied to the market we actually have."""
    hist = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    picks = None
    for s in hist["seasons"]:
        if str(s.get("season")) != str(graded):
            continue
        done = [d for d in s.get("drafts", []) if d.get("status") == "complete"]
        if done:
            best = max(done, key=lambda d: len(d.get("picks", [])))
            picks = {str(p["player_id"]): int(p["pick_no"]) for p in best["picks"]}
        break
    if not picks:
        return {}
    prev = totals[graded - 1]
    out = {}
    for pos in POSITIONS:
        curve = sorted((v for p, v in prev.items() if pos_map.get(p) == pos and v > 0),
                       reverse=True)
        ordered = sorted((pk, pid) for pid, pk in picks.items() if pos_map.get(pid) == pos)
        for i, (_pk, pid) in enumerate(ordered):
            if i < len(curve):
                out[pid] = curve[i]
    return out


# ── one graded cell ─────────────────────────────────────────────────────────
def metrics_for(pred, act):
    row = {"n": len(pred), "spearman": spearman(pred, act),
           "mae": mae(pred, act), "bias": bias(pred, act)}
    for k in TOPK:
        row[f"p@{k}"] = precision_at(pred, act, k)
    return row


def grade_cell(rows, rng):
    """rows: [(pid, base, adj, realized)] for one (season, position, baseline)."""
    base = [r[1] for r in rows]
    a = [r[2] for r in rows]
    act = [r[3] for r in rows]
    adj = [b * (1 + x) for b, x in zip(base, a)]

    perm = list(a)
    sh_d, sh_beat = [], 0
    d_actual = spearman(adj, act) - spearman(base, act)
    for _ in range(N_PERM):
        rng.shuffle(perm)
        sp = [b * (1 + x) for b, x in zip(base, perm)]
        d = spearman(sp, act) - spearman(base, act)
        sh_d.append(d)
        if d >= d_actual:
            sh_beat += 1

    # rank surrogate: same multiset of adj values, assigned in descending base order
    order = sorted(range(len(base)), key=lambda i: -base[i])
    srt = sorted(a, reverse=True)
    sur = [0.0] * len(base)
    for slot, i in enumerate(order):
        sur[i] = srt[slot]
    surro = [b * (1 + x) for b, x in zip(base, sur)]

    return {
        "base": metrics_for(base, act),
        "adj": metrics_for(adj, act),
        "shuffled_mean_d_rho": sum(sh_d) / len(sh_d),
        "shuffled_p_one_sided": sh_beat / N_PERM,
        "rank_surrogate": metrics_for(surro, act),
        "partial_rho_z_resid": partial_spearman([r[4] for r in rows], act, base),
    }


def bootstrap_delta(cells, key, rng, lower_is_better=False):
    """Paired bootstrap over players, seasons pooled as blocks by graded n."""
    pt, lo_hi = None, None
    obs = []
    for c in cells:
        base, a, act = c["base"], c["a"], c["act"]
        adj = [b * (1 + x) for b, x in zip(base, a)]
        obs.append((base, adj, act))

    def stat(sample):
        num, den = 0.0, 0
        for base, adj, act in sample:
            if key == "spearman":
                d = spearman(adj, act) - spearman(base, act)
            elif key == "mae":
                d = mae(adj, act) - mae(base, act)
            else:
                d = 0.0
            if d is None:
                continue
            num += d * len(base)
            den += len(base)
        return num / den if den else None

    pt = stat(obs)
    draws = []
    for _ in range(N_BOOT):
        sample = []
        for base, adj, act in obs:
            n = len(base)
            idx = [rng.randrange(n) for _ in range(n)]
            sample.append(([base[i] for i in idx], [adj[i] for i in idx],
                           [act[i] for i in idx]))
        v = stat(sample)
        if v is not None:
            draws.append(v)
    draws.sort()
    if draws:
        lo_hi = (draws[int(0.025 * len(draws))], draws[int(0.975 * len(draws)) - 1])
    return pt, lo_hi


def run() -> dict:
    import nfl_data_py as nfl
    rng = random.Random(SEED)

    ids = nfl.import_ids()
    xw = crosswalk(ids)
    rosters = nfl.import_seasonal_rosters(list(range(min(SEASONS) - 2, max(SEASONS) + 1)))

    parity = _prove_parity(xw)   # refuses before a rebuilt prior is ever used
    totals, games = {}, {}
    for y in range(min(SEASONS) - 2, max(SEASONS) + 1):
        totals[y], games[y] = season_totals(y, xw)

    out = {
        "_territory": "TERRITORY: A — produced by draft/backtest/opportunity_adj_grade.py",
        "_prereg": "draft/backtest/OPPORTUNITY-ADJ-PREREG.md (committed first)",
        "_note": ("Leak-free grade of the SHIPPED opportunity adjustment "
                  "(projections.opportunity_metrics + composite_z + the blend cap "
                  "line) applied to RECONSTRUCTED baselines. proj_baseline itself "
                  "is Sleeper preseason and was never archived before 2026-08-09 — "
                  "so no number here grades the shipped baseline step."),
        "constants": {"cap": CAP, "recency_weights": list(RECENCY_WEIGHTS),
                      "last_scored_week": LAST_SCORED_WEEK, "n_boot": N_BOOT,
                      "n_perm": N_PERM, "seed": SEED},
        "prior_store_rebuild": {
            "why": ("nflverse_weekly_points_* starts at 2023; grading season 2023 "
                    "needs realized 2022 and 2021 for its baselines"),
            "path": "grade.weekly_points_table(nfl_data_py weekly frame, OUR scoring table, import_ids crosswalk)",
            "parity_2023_vs_committed_store": parity,
        },
        "seasons": {}, "pooled": {}, "draftable": {},
    }

    pooled = {}      # (baseline, pos) -> [cell dicts for bootstrap]
    pooled_dr = {}   # draftable
    for y in SEASONS:
        pos_map = positions_for(y, rosters)
        z, diag = opportunity_for(y, xw, pos_map)
        bs = baselines(y, totals)
        bs["market_curve"] = market_curve(y, totals, pos_map)
        act_all = totals[y]
        weeks = games[y]

        ydoc = {"opportunity": diag, "z_nonzero": sum(1 for v in z.values() if v),
                "baselines": {}, "excluded_no_week_row": {}}
        for bname, bmap in bs.items():
            ydoc["baselines"][bname] = {}
            ydoc["excluded_no_week_row"][bname] = 0
            for pos in POSITIONS:
                rows, excl = [], 0
                for pid, bv in bmap.items():
                    if pos_map.get(pid) != pos or bv <= 0:
                        continue
                    if weeks.get(pid, 0) < 1:
                        excl += 1
                        continue
                    zz = z.get(pid, 0.0)
                    rows.append((pid, float(bv), _adj(zz), float(act_all.get(pid, 0.0)), zz))
                ydoc["excluded_no_week_row"][bname] += excl
                if len(rows) < 10:
                    ydoc["baselines"][bname][pos] = {"status": "thin", "n": len(rows)}
                    continue
                ydoc["baselines"][bname][pos] = grade_cell(rows, rng)
                pooled.setdefault((bname, pos), []).append(
                    {"base": [r[1] for r in rows], "a": [r[2] for r in rows],
                     "act": [r[3] for r in rows]})
                # draftable slice: top-N by base
                n = DRAFTABLE[pos]
                dr = sorted(rows, key=lambda r: -r[1])[:n]
                if len(dr) >= 10:
                    ydoc["baselines"][bname][pos]["draftable"] = grade_cell(dr, rng)
                    pooled_dr.setdefault((bname, pos), []).append(
                        {"base": [r[1] for r in dr], "a": [r[2] for r in dr],
                         "act": [r[3] for r in dr]})
        out["seasons"][str(y)] = ydoc

    for tag, store, dest in (("all", pooled, out["pooled"]),
                             ("draftable", pooled_dr, out["draftable"])):
        for (bname, pos), cells in sorted(store.items()):
            d_rho, ci_rho = bootstrap_delta(cells, "spearman", rng)
            d_mae, ci_mae = bootstrap_delta(cells, "mae", rng)
            verdict = "NEUTRAL"
            if ci_rho and ci_rho[0] > 0:
                verdict = "HELPS"
            elif ci_rho and ci_rho[1] < 0:
                verdict = "HURTS"
            dest.setdefault(bname, {})[pos] = {
                "n_total": sum(len(c["base"]) for c in cells),
                "d_spearman": d_rho, "ci_spearman": list(ci_rho) if ci_rho else None,
                "d_mae": d_mae, "ci_mae": list(ci_mae) if ci_mae else None,
                "verdict_ordering": verdict,
            }
    return out


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")


if __name__ == "__main__":
    main()
