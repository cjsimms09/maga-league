# TERRITORY: A
"""EXPERT-SKILL-PREREG.md, executed. Offline only — committed stores.

Q1  does expert skill persist year-over-year? (gates everything)
Q2  FLAT vs CONTINUOUS vs TOP-10 weighting, walk-forward onto 2025.

Skill of expert e in season S = Spearman(e's positional order, realized order)
minus Spearman(consensus positional order, realized order), on exactly the
players e ranked that we can grade (min 30, else excluded BY NAME).

Run: python3 draft/backtest/expert_grading.py
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEASONS = (2023, 2024, 2025)
SKILL_POS = {"QB", "RB", "WR", "TE"}
MIN_COMMON = 30
SHUFFLES = 400
SEED = 42


def _norm(name: str) -> str:
    s = re.sub(r"[^a-z ]", "", (name or "").lower().replace(".", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def name_index():
    doc = json.loads((HERE / "sleeper_name_index.json").read_text())
    return {k: v for k, v in (doc.get("index") or {}).items()}


def realized(season: int) -> dict[str, float]:
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    totals: dict[str, float] = {}
    for wk in doc["weeks"]:
        for pid, pts in (wk.get("points") or {}).items():
            totals[pid] = totals.get(pid, 0.0) + float(pts)
    return totals


def experts_file(season: int) -> dict:
    return json.loads((HERE / f"fp_expert_ranks_{season}.json").read_text())


def spearman(xs, ys) -> float:
    """Average-rank Spearman, no scipy dependency."""
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


def graded_players(season: int):
    """FP rows crosswalked to a realized season total. Returns
    [(fp_row, realized_points)] for skill positions only."""
    idx = name_index()
    act = realized(season)
    out = []
    misses = 0
    for row in experts_file(season)["players"]:
        if (row.get("position") or "").upper() not in SKILL_POS:
            continue
        hit = idx.get(_norm(row.get("name")))
        if not hit or (hit.get("position") or "").upper() != (row.get("position") or "").upper():
            misses += 1
            continue
        pts = act.get(str(hit["player_id"]))
        if pts is None:
            continue  # never played that season — no realized ordering claim
        out.append((row, pts))
    return out, misses


def positional_order(pairs, rank_of):
    """rank_of(row) -> sortable rank or None. Returns parallel lists
    (ranks, realized) over rows where rank_of is not None."""
    xs, ys = [], []
    for row, pts in pairs:
        r = rank_of(row)
        if r is not None:
            xs.append(float(r))
            ys.append(-pts)  # more points = better = lower "realized rank"
    return xs, ys


def season_skills(season: int):
    """{expert_id: skill} for every expert clearing MIN_COMMON."""
    pairs, misses = graded_players(season)
    excluded = []
    skills = {}
    expert_ids = set()
    for row, _ in pairs:
        expert_ids.update((row.get("expert_ranks") or {}).keys())
    for e in expert_ids:
        sub = [(r, p) for r, p in pairs if e in (r.get("expert_ranks") or {})]
        if len(sub) < MIN_COMMON:
            excluded.append(e)
            continue
        ex, ey = positional_order(sub, lambda r: r["expert_ranks"][e])
        cx, cy = positional_order(sub, lambda r: r.get("rank_ecr"))
        skills[e] = spearman(ex, ey) - spearman(cx, cy)
    return skills, {"graded_players": len(pairs), "crosswalk_misses": misses,
                    "experts_scored": len(skills), "experts_excluded_min_n": len(excluded)}


def persistence(sa: dict, sb: dict, rng: random.Random):
    common = sorted(set(sa) & set(sb))
    if len(common) < 10:
        return {"status": "unmeasurable", "common_experts": len(common)}
    xa = [sa[e] for e in common]
    xb = [sb[e] for e in common]
    obs = spearman(xa, xb)
    null = []
    for _ in range(SHUFFLES):
        perm = xb[:]
        rng.shuffle(perm)
        null.append(spearman(xa, perm))
    null.sort()
    p95 = null[int(0.95 * len(null))]
    return {"status": "measured", "common_experts": len(common),
            "observed_rho": round(obs, 4), "shuffle_p95": round(p95, 4),
            "clears_null": obs > p95}


def weighted_consensus_score(season: int, weights: dict[str, float] | None):
    """Spearman of a (weighted) mean-of-expert-ranks ordering vs realized.
    weights None => FLAT over all experts present."""
    pairs, _ = graded_players(season)
    xs, ys = [], []
    for row, pts in pairs:
        er = row.get("expert_ranks") or {}
        if weights is None:
            use = er
        else:
            use = {e: r for e, r in er.items() if e in weights}
        if not use:
            continue
        if weights is None:
            m = sum(use.values()) / len(use)
        else:
            wsum = sum(weights[e] for e in use)
            if wsum <= 0:
                continue
            m = sum(r * weights[e] for e, r in use.items()) / wsum
        xs.append(m)
        ys.append(-pts)
    return round(spearman(xs, ys), 4), len(xs)


def main():
    rng = random.Random(SEED)
    out = {"_territory": "TERRITORY: A — written by expert_grading.py",
           "_prereg": "EXPERT-SKILL-PREREG.md", "seed": SEED,
           "min_common": MIN_COMMON, "seasons": list(SEASONS)}

    skills, diags = {}, {}
    for s in SEASONS:
        skills[s], diags[s] = season_skills(s)
    out["diagnostics"] = {str(s): d for s, d in diags.items()}

    out["q1_persistence"] = {
        "2023_to_2024": persistence(skills[2023], skills[2024], rng),
        "2024_to_2025": persistence(skills[2024], skills[2025], rng)}

    # Q2 walk-forward: 2025 weighted only by 2023+2024 skill.
    prior = {}
    for e in set(skills[2023]) | set(skills[2024]):
        vals = [skills[s][e] for s in (2023, 2024) if e in skills[s]]
        prior[e] = sum(vals) / len(vals)
    # CONTINUOUS: shift so weights are positive (rank-weighting needs >=0).
    lo = min(prior.values()) if prior else 0.0
    cont = {e: (v - lo) + 1e-6 for e, v in prior.items()}
    top10 = {e: 1.0 for e, _ in sorted(prior.items(), key=lambda kv: -kv[1])[:10]}

    flat, n_flat = weighted_consensus_score(2025, None)
    cw, n_cw = weighted_consensus_score(2025, cont)
    t10, n_t10 = weighted_consensus_score(2025, top10)
    out["q2_walk_forward_2025"] = {
        "FLAT": {"spearman_vs_realized": flat, "players": n_flat},
        "CONTINUOUS": {"spearman_vs_realized": cw, "players": n_cw},
        "TOP10": {"spearman_vs_realized": t10, "players": n_t10},
        "note": "higher is better; weights from 2023-24 skill only"}

    (HERE / "expert_skill_grading.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
