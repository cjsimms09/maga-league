# TERRITORY: A
"""THE EMPIRICAL DRAFT-VALUE STUDY — what actually happened, 2023-2025.

Preregistered in `draft/audit/empirical_draft_value_2026-08-16.md` §§0-3, which
was committed BEFORE this module produced a single number. Every threshold,
window, exclusion rule and stopping rule in here traces to a numbered clause
there; nothing was chosen after seeing a result.

WHAT THIS IS NOT. It is not a model study. `model_accuracy_v*.json` grades our
projection; `roster_construction_2026-08-16.md` grades archetypes against our
policy; `draft_replay_2025_vs_actual.md` grades the tool against Cory. This
module grades NOTHING of ours until §9, where own_v6 appears as one benchmark
row. The subject is the OUTCOMES: across 2023, 2024 and 2025, what did each
draft slot actually return, where did value actually fall off, and what
preseason-available signal actually separated the players who returned value
from the players who did not.

THE THREE THINGS THAT BOUND EVERY NUMBER IN HERE, repeated at the top because
a reader who quotes a table without them will be wrong:

  1. THERE IS NO NATIONAL HISTORICAL ADP. The price instrument is Cory's own
     10-team league draft, 150 picks x 3 seasons. Real, but one league.
  2. ROUNDS 1-3 ARE KEEPER ROUNDS in that league (30/23/20 keepers). The open
     market starts around pick 28-31. Early-round "slot value" here is a
     keeper ledger, not a market clearing, and every table says so.
  3. THREE SEASONS IS 3 OBSERVATIONS PER SLOT. Round-level cells have 30.
     Every cell carries n and a season-clustered bootstrap CI, and the
     stability rule (pooled CI excludes null AND same sign in >=2 of 3
     seasons) decides what may be called a finding.

Survivorship, per prereg §2.2: a drafted player with ZERO weekly rows in season
Y is MISSING DATA -- excluded from the primary arm and counted in its own table,
never zeroed. Arm Z runs the same computation with those picks zeroed, because a
pick that returned nothing did return nothing to the roster, and where the two
arms disagree in sign THAT is the finding.

Leakage, per prereg §2.4: the feature path may open seasons Y-1 and Y-2 only.
`test_empirical_draft_value.py` asserts it by tracing file opens.
"""
from __future__ import annotations

import json
import math
import random
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DRAFT = HERE.parent
DATA = DRAFT / "data"

# ── preregistered constants (prereg §§2-3) ──────────────────────────────────
SEASONS = (2023, 2024, 2025)
LAST_SCORED_WEEK = 17          # league last_scored_leg = 17, playoffs 16-17
POSITIONS = ("QB", "RB", "WR", "TE")
TEAMS = 10
ROUNDS = 15
# the shipped board's own starter counts (public/draft_data.json:replacement)
STARTER_RANK = {"RB": 21, "WR": 29, "QB": 10, "TE": 10}
BOARD_REPLACEMENT_2026 = {"RB": 179.30, "WR": 162.60, "QB": 341.72, "TE": 136.40}
# ^ RE-DERIVED 2026-08-17 from the first board published under the rulings
#   (opportunity layer off, K/DEF demoted). RB/WR/TE all fell — the +15%
#   cap that was inflating elite skill projections also propped up the
#   replacement levels beneath them. QB unchanged: the killed layer never
#   touched QBs (composite_z is WR/TE/RB-only), which was half the reason
#   Cory killed it.
CLIFF_WINDOW = {"RB": 48, "WR": 48, "QB": 30, "TE": 30}
CLIFF_DROP_MULT = 2.0          # prereg §3.2 detector 1
HIT_MULT = 1.25                # prereg §3.3 definition A
BUST_MULT = 0.60
ROUND_BANDS = (("1-3", 1, 3), ("4-6", 4, 6), ("7-10", 7, 10), ("11-15", 11, 15))
BOOTSTRAP = 2000
BH_Q = 0.10
SEED = 20260816


# ── loaders ─────────────────────────────────────────────────────────────────

def positions_record() -> dict:
    return json.loads((DATA / "player_positions.json").read_text())["positions"]


def weekly_points(season: int) -> dict:
    """{pid: {week: pts}} for weeks 1..17 from the committed store."""
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    out: dict[str, dict[int, float]] = {}
    for w in doc["weeks"]:
        wk = int(w["week"])
        if not 1 <= wk <= LAST_SCORED_WEEK:
            continue
        for pid, v in w["points"].items():
            out.setdefault(str(pid), {})[wk] = float(v)
    return out


_TOTALS_CACHE: dict = {}


def season_totals(season: int) -> tuple[dict, dict]:
    """({pid: weeks-1-17 total}, {pid: games with a row}) for ANY season 2021+.

    2023-2025 come from the committed weekly stores (the direct scored record);
    2021/2022 have no weekly store and are scored from the component stores
    under the frozen table — the parity-pinned construction `draft_replay_2025`
    uses for the same reason. Routing both through one function is what stops a
    caller reaching for a 2022 weekly store that does not exist, which is
    exactly how the first full run of this module died.
    """
    if season in _TOTALS_CACHE:
        return _TOTALS_CACHE[season]
    if season >= 2023:
        wk = weekly_points(season)
        res = ({pid: sum(r.values()) for pid, r in wk.items()},
               {pid: len(r) for pid, r in wk.items()})
    else:
        res = _totals_from_components(season)
    _TOTALS_CACHE[season] = res
    return res


def component_weeks(season: int) -> dict:
    doc = json.loads((HERE / f"component_stats_{season}.json").read_text())
    return {int(w["week"]): w["players"] for w in doc["weeks"]}


def advanced_weeks(season: int) -> dict:
    doc = json.loads((HERE / f"advanced_stats_{season}.json").read_text())
    return {int(w["week"]): w["players"] for w in doc["weeks"]}


def draft_capital() -> dict:
    """{pid: {'draft_round': r, 'draft_season': s}} — period-correct source."""
    doc = json.loads((HERE / "nflverse_draft_picks.json").read_text())
    out = {}
    for p in doc["picks"]:
        sid = p.get("sleeper_id")
        if sid is None:
            continue
        out[str(sid)] = {"draft_round": int(p["round"]),
                         "draft_season": int(p["season"])}
    return out


def board_ages() -> dict:
    """age AS OF 2026 from the committed board. GAP 3: survivorship-biased —
    a player only has an age here if he is on a 2026 board at all."""
    try:
        board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    except (OSError, ValueError):
        return {}
    return {str(p["player_id"]): float(p["age"])
            for p in board.get("players", []) if p.get("age") is not None}


def league_drafts() -> dict:
    """{season: [ {pick_no, round, roster_id, pid, is_keeper} ]} for the three
    graded seasons.

    KEEPERS: 2024/2025 flag them inline on the 150-pick draft. 2023 does not —
    its keepers live in a SEPARATE 30-pick ledger draft whose picks mirror
    picks 1-30 of the main draft. Taking the union of flagged player_ids across
    every completed draft of the season handles both shapes, which is the same
    construction `draft_replay_2025.season_draft` uses.
    """
    doc = json.loads((DATA / "league_history.json").read_text())
    out: dict[int, list] = {}
    for srec in doc["seasons"]:
        season = int(srec["season"])
        if season not in SEASONS:
            continue
        drafts = [d for d in srec.get("drafts", []) if d.get("status") == "complete"]
        if not drafts:
            continue
        main = max(drafts, key=lambda d: len(d.get("picks", [])))
        keeper_pids = {str(p["player_id"]) for d in drafts
                       for p in d.get("picks", []) if p.get("is_keeper")}
        rows = []
        for p in sorted(main["picks"], key=lambda p: p["pick_no"]):
            pid = str(p["player_id"])
            rows.append({"pick_no": int(p["pick_no"]), "round": int(p["round"]),
                         "roster_id": int(p["roster_id"]), "pid": pid,
                         "is_keeper": pid in keeper_pids})
        out[season] = rows
    return out


# ── statistics (pure, no scipy) ─────────────────────────────────────────────

def mean(xs) -> float:
    xs = list(xs)
    return sum(xs) / len(xs) if xs else float("nan")


def median(xs) -> float:
    xs = sorted(xs)
    n = len(xs)
    if not n:
        return float("nan")
    m = n // 2
    return xs[m] if n % 2 else 0.5 * (xs[m - 1] + xs[m])


def sd(xs) -> float:
    xs = list(xs)
    if len(xs) < 2:
        return float("nan")
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def wilson(k: int, n: int, z: float = 1.96) -> tuple:
    """Wilson score interval — prereg §2.3. Never the normal approximation:
    hit rates in this study live near 0 and 1 where the normal interval leaves
    the unit interval and stops meaning anything."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def _pct(xs, q):
    xs = sorted(xs)
    if not xs:
        return float("nan")
    i = q * (len(xs) - 1)
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return xs[lo] if lo == hi else xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def cluster_boot(groups: dict, stat, reps: int = BOOTSTRAP, seed: int = SEED):
    """Season-clustered percentile bootstrap — prereg §2.3.

    `groups` is {season: [items]}. Each replicate resamples SEASONS with
    replacement and then items within each drawn season, so an effect carried
    by one year cannot present itself as a three-year effect: draw the other
    two years and it vanishes, and the interval widens to say so. `stat` takes
    the flat list of items and returns a float (or None to skip the replicate).
    """
    rng = random.Random(seed)
    keys = sorted(groups)
    if not keys:
        return (float("nan"), float("nan"))
    out = []
    for _ in range(reps):
        flat = []
        for _ in keys:
            k = rng.choice(keys)
            items = groups[k]
            if not items:
                continue
            flat.extend(items[rng.randrange(len(items))] for _ in items)
        if not flat:
            continue
        v = stat(flat)
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            out.append(v)
    if not out:
        return (float("nan"), float("nan"))
    return (_pct(out, 0.025), _pct(out, 0.975))


def rankdata(xs) -> list:
    """Average ranks, ties shared — the only ranking Spearman may use."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        r = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = r
        i = j + 1
    return ranks


def pearson(xs, ys) -> float:
    n = len(xs)
    if n < 3:
        return float("nan")
    mx, my = mean(xs), mean(ys)
    sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sxx = sum((a - mx) ** 2 for a in xs)
    syy = sum((b - my) ** 2 for b in ys)
    if sxx <= 0 or syy <= 0:
        return float("nan")
    return sxy / math.sqrt(sxx * syy)


def spearman(pairs) -> float:
    if len(pairs) < 3:
        return float("nan")
    xs = rankdata([p[0] for p in pairs])
    ys = rankdata([p[1] for p in pairs])
    return pearson(xs, ys)


def bh_reject(pvals: list, q: float = BH_Q) -> list:
    """Benjamini-Hochberg — prereg §2.3. Returns a bool per input position."""
    n = len(pvals)
    if not n:
        return []
    order = sorted(range(n), key=lambda i: pvals[i])
    keep = [False] * n
    kmax = -1
    for rank, i in enumerate(order, start=1):
        if pvals[i] <= q * rank / n:
            kmax = rank
    for rank, i in enumerate(order, start=1):
        if rank <= kmax:
            keep[i] = True
    return keep


def spearman_p(rho: float, n: int) -> float:
    """Two-sided p from the t approximation. Only ever used to FEED the BH
    screen; every reported verdict is the bootstrap CI, which does not assume
    normality. Stated so nobody reads a p here as the primary evidence.

    ⚠️ THIS FUNCTION SHIPPED WRONG ONCE AND THE BUG WAS INVISIBLE IN THE
    AGGREGATE. The first cut used a hand-rolled series for the incomplete beta
    that was simply incorrect: it returned p = 0.017 for rho = 0.02 on n = 44,
    where the true value is 0.90. Because a too-small p only ever makes BH more
    permissive, the failure surfaced as "186 of 187 tests survive FDR" — a
    result that looks like a strong study rather than a broken screen. It was
    caught by evaluating the function on hand-checkable inputs, which is now a
    test (`test_spearman_p_known_values`). Read that as the lesson: a
    multiplicity screen that rejects almost nothing is evidence about the
    screen, not about the data.
    """
    if n < 4 or math.isnan(rho) or abs(rho) >= 1.0:
        return 1.0
    t = rho * math.sqrt((n - 2) / (1 - rho * rho))
    df = n - 2
    return betainc(df / 2.0, 0.5, df / (df + t * t))


def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction for the incomplete beta (modified Lentz)."""
    MAXIT, EPS, FPMIN = 300, 3.0e-16, 1.0e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < EPS:
            break
    return h


def betainc(a: float, b: float, x: float) -> float:
    """Regularized incomplete beta I_x(a, b). Keeps this module scipy-free like
    the rest of the lab, but by the standard continued fraction rather than an
    invented series — see `spearman_p`."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    if x < (a + 1.0) / (a + b + 2.0):
        front = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
        return min(1.0, max(0.0, front * _betacf(a, b, x) / a))
    front = math.exp(lbeta + b * math.log(1.0 - x) + a * math.log(x))
    return min(1.0, max(0.0, 1.0 - front * _betacf(b, a, 1.0 - x) / b))


def ols(X: list, y: list) -> list:
    """Least squares with an intercept, via numpy. Returns coefficients with
    the intercept LAST so feature order matches the caller's list."""
    import numpy as np
    A = np.array([list(row) + [1.0] for row in X], dtype=float)
    b = np.array(y, dtype=float)
    coef, *_ = np.linalg.lstsq(A, b, rcond=None)
    return [float(c) for c in coef]


# ── the draftable universe and its survivorship accounting ──────────────────

_UNIVERSE_CACHE: dict = {}


def universe(season: int, positions: dict) -> dict:
    """{pos: [(pid, realized_pts)]} sorted desc — players with >=1 game in Y.

    Prereg §2.2: '>=1 weekly row' IS the inclusion test. A player with no row
    never took an offensive snap that season and is missing data, not a zero.
    """
    if season in _UNIVERSE_CACHE:
        return _UNIVERSE_CACHE[season]
    totals, games = season_totals(season)
    by_pos: dict[str, list] = {p: [] for p in POSITIONS}
    for pid, tot in totals.items():
        pos = positions.get(pid)
        if pos in by_pos and games.get(pid, 0) > 0:
            by_pos[pos].append((pid, tot))
    for pos in by_pos:
        by_pos[pos].sort(key=lambda t: -t[1])
    _UNIVERSE_CACHE[season] = by_pos
    return by_pos


def pick_rows(positions: dict) -> tuple[list, dict]:
    """Every draft pick, joined to its realized season. Returns (rows, survivorship).

    A row's `pts` is None when the player has no weekly row that season — that
    is Arm E's exclusion and Arm Z's zero, and keeping it as None rather than
    0.0 is what stops the two arms silently collapsing into each other.
    """
    drafts = league_drafts()
    rows, surv = [], {}
    for season in SEASONS:
        totals, games = season_totals(season)
        never, n_skill = [], 0
        for r in drafts[season]:
            pos = positions.get(r["pid"])
            pts = totals.get(r["pid"]) if games.get(r["pid"], 0) > 0 else None
            row = dict(r, season=season, pos=pos, pts=pts,
                       games=games.get(r["pid"], 0))
            rows.append(row)
            if pos in POSITIONS:
                n_skill += 1
                if pts is None:
                    never.append({"pick_no": r["pick_no"], "round": r["round"],
                                  "pid": r["pid"], "pos": pos,
                                  "is_keeper": r["is_keeper"]})
        surv[season] = {"skill_picks": n_skill, "never_played": len(never),
                        "never_played_picks": never,
                        "kdef_picks": sum(1 for r in drafts[season]
                                          if positions.get(r["pid"]) in ("K", "DEF")),
                        "unknown_position_picks": [r["pick_no"] for r in drafts[season]
                                                   if positions.get(r["pid"]) is None]}
    return rows, surv


def _arm(rows: list, arm: str) -> list:
    """Arm E excludes never-played picks; Arm Z zeroes them (prereg §2.2)."""
    out = []
    for r in rows:
        if r["pos"] not in POSITIONS:
            continue
        if r["pts"] is None:
            if arm == "E":
                continue
            out.append(dict(r, pts=0.0))
        else:
            out.append(r)
    return out


# ── Q1: the real value curve ────────────────────────────────────────────────

def q1_value_curve(rows: list) -> dict:
    out = {}
    for arm in ("E", "Z"):
        a = _arm(rows, arm)
        by_round = {}
        for rnd in range(1, ROUNDS + 1):
            sel = [r for r in a if r["round"] == rnd]
            groups = defaultdict(list)
            for r in sel:
                groups[r["season"]].append(r["pts"])
            lo, hi = cluster_boot(groups, lambda xs: mean(xs))
            per_season = {str(s): round(mean(v), 1) for s, v in sorted(groups.items())}
            keep = [r["pts"] for r in sel if r["is_keeper"]]
            open_ = [r["pts"] for r in sel if not r["is_keeper"]]
            by_round[rnd] = {
                "n": len(sel), "mean": round(mean([r["pts"] for r in sel]), 1),
                "median": round(median([r["pts"] for r in sel]), 1),
                "sd": round(sd([r["pts"] for r in sel]), 1),
                "min": round(min((r["pts"] for r in sel), default=float("nan")), 1),
                "max": round(max((r["pts"] for r in sel), default=float("nan")), 1),
                "ci95": [round(lo, 1), round(hi, 1)],
                "per_season_mean": per_season,
                "n_keeper": len(keep),
                "keeper_mean": round(mean(keep), 1) if keep else None,
                "n_open": len(open_),
                "open_mean": round(mean(open_), 1) if open_ else None,
            }
        # per-slot scatter: n=3 each, published as raw, never as a claim
        by_slot = {}
        for pk in range(1, TEAMS * ROUNDS + 1):
            sel = [r for r in a if r["pick_no"] == pk]
            if sel:
                by_slot[pk] = {"n": len(sel),
                               "pts": [round(r["pts"], 1) for r in sel],
                               "mean": round(mean([r["pts"] for r in sel]), 1)}
        # positional order curve: the k-th player at that position taken
        pos_order = {}
        for pos in POSITIONS:
            per_k = defaultdict(lambda: defaultdict(list))
            picks_k = defaultdict(list)
            for season in SEASONS:
                sel = sorted([r for r in a if r["season"] == season and r["pos"] == pos],
                             key=lambda r: r["pick_no"])
                for k, r in enumerate(sel, start=1):
                    per_k[k][season].append(r["pts"])
                    picks_k[k].append(r["pick_no"])
            rows_out = {}
            for k in sorted(per_k):
                g = {s: v for s, v in per_k[k].items()}
                flat = [x for v in g.values() for x in v]
                lo, hi = cluster_boot(g, lambda xs: mean(xs), reps=400)
                rows_out[k] = {"n": len(flat), "mean": round(mean(flat), 1),
                               "ci95": [round(lo, 1), round(hi, 1)],
                               "mean_pick_no": round(mean(picks_k[k]), 1)}
            pos_order[pos] = rows_out
        out[arm] = {"by_round": by_round, "by_slot": by_slot,
                    "by_positional_order": pos_order}
    return out


# ── Q2: cliffs ──────────────────────────────────────────────────────────────

def _piecewise_break(pts: list, lo: int = 4, hi_pad: int = 4) -> int | None:
    """Continuous two-segment least-squares fit; returns the 1-based rank of the
    minimising breakpoint. Continuity matters: a discontinuous fit will happily
    put the 'cliff' anywhere the level shifts, which on a monotone decreasing
    curve is everywhere."""
    n = len(pts)
    if n < lo + hi_pad + 2:
        return None
    xs = list(range(1, n + 1))
    best, best_k = None, None
    for k in range(lo, n - hi_pad):
        # basis: 1, x, max(0, x-k) — the hinge keeps the two segments joined
        X = [[x, max(0.0, x - k)] for x in xs]
        try:
            c = ols(X, pts)
        except Exception:
            continue
        pred = [c[0] * x + c[1] * max(0.0, x - k) + c[2] for x in xs]
        sse = sum((p - q) ** 2 for p, q in zip(pts, pred))
        if best is None or sse < best:
            best, best_k = sse, k
    return best_k


def q2_cliffs(positions: dict) -> dict:
    per_pos = {}
    for pos in POSITIONS:
        win = CLIFF_WINDOW[pos]
        season_curves, flags, breaks = {}, {}, {}
        for season in SEASONS:
            u = universe(season, positions)[pos]
            curve = [p for _, p in u[:win]]
            season_curves[str(season)] = [round(c, 1) for c in curve]
            drops = [curve[i] - curve[i + 1] for i in range(len(curve) - 1)]
            med = median(drops)
            flags[str(season)] = [i + 1 for i, d in enumerate(drops)
                                  if med > 0 and d > CLIFF_DROP_MULT * med]
            breaks[str(season)] = _piecewise_break(curve)
        # stability rule: flagged in >=2 of 3 seasons
        counts = defaultdict(int)
        for v in flags.values():
            for k in v:
                counts[k] += 1
        stable = sorted(k for k, c in counts.items() if c >= 2)
        # bootstrap the breakpoint, season-clustered over the three curves
        rng = random.Random(SEED)
        boots = []
        for _ in range(400):    # 400: each replicate refits ~44 piecewise OLS
            picked = [season_curves[str(rng.choice(SEASONS))] for _ in SEASONS]
            avg = [mean([c[i] for c in picked]) for i in range(win)]
            b = _piecewise_break(avg)
            if b:
                boots.append(b)
        pooled_curve = [mean([season_curves[str(s)][i] for s in SEASONS])
                        for i in range(win)]
        per_pos[pos] = {
            "window": win,
            "per_season_curve": season_curves,
            "pooled_curve": [round(c, 1) for c in pooled_curve],
            "local_drop_flags_per_season": flags,
            "local_drop_flags_stable_2of3": stable,
            "piecewise_break_per_season": breaks,
            "piecewise_break_pooled": _piecewise_break(pooled_curve),
            "piecewise_break_ci95": [round(_pct(boots, 0.025)), round(_pct(boots, 0.975))]
            if boots else None,
            "board_starter_rank": STARTER_RANK[pos],
            "board_replacement_2026_projection_space": BOARD_REPLACEMENT_2026[pos],
            "realized_at_board_rank": {
                str(s): round(universe(s, positions)[pos][STARTER_RANK[pos] - 1][1], 1)
                for s in SEASONS},
            "realized_at_board_rank_pooled_mean": round(mean(
                [universe(s, positions)[pos][STARTER_RANK[pos] - 1][1] for s in SEASONS]), 1),
            "draftable_pool_size": {str(s): len(universe(s, positions)[pos])
                                    for s in SEASONS},
        }
    return per_pos


# ── Q3: hit / bust ──────────────────────────────────────────────────────────

def _loo_round_expectation(rows: list) -> dict:
    """expected(season, round) = mean over the OTHER two seasons (prereg §3.3).
    Grading a season against a curve that includes it would guarantee the hit
    and bust rates average out to the definition, which measures nothing."""
    per = defaultdict(lambda: defaultdict(list))
    for r in rows:
        per[r["round"]][r["season"]].append(r["pts"])
    out = {}
    for rnd, bys in per.items():
        for season in SEASONS:
            others = [x for s, v in bys.items() if s != season for x in v]
            out[(season, rnd)] = mean(others) if others else float("nan")
    return out


def q3_hit_bust(rows: list, positions: dict) -> dict:
    out = {}
    for arm in ("E", "Z"):
        a = _arm(rows, arm)
        exp = _loo_round_expectation(a)
        # rank of each drafted player within his position that season
        rank_of = {}
        for season in SEASONS:
            for pos, lst in universe(season, positions).items():
                for i, (pid, _) in enumerate(lst, start=1):
                    rank_of[(season, pid)] = (pos, i)
        graded = []
        for r in a:
            e = exp.get((r["season"], r["round"]), float("nan"))
            lab = "NEUTRAL"
            if not math.isnan(e) and e > 0:
                if r["pts"] >= HIT_MULT * e:
                    lab = "HIT"
                elif r["pts"] <= BUST_MULT * e:
                    lab = "BUST"
            pr = rank_of.get((r["season"], r["pid"]))
            starter = bool(pr and pr[1] <= STARTER_RANK[pr[0]])
            graded.append(dict(r, expected=e, label=lab, starter=starter,
                               pos_rank=(pr[1] if pr else None)))

        def summarize(sel):
            n = len(sel)
            if not n:
                return None
            hits = sum(1 for r in sel if r["label"] == "HIT")
            busts = sum(1 for r in sel if r["label"] == "BUST")
            starters = sum(1 for r in sel if r["starter"])
            g = defaultdict(list)
            for r in sel:
                g[r["season"]].append(r["pts"])
            lo, hi = cluster_boot(g, lambda xs: mean(xs))
            return {"n": n,
                    "hit_rate": round(hits / n, 3), "hit_ci95": [round(x, 3) for x in wilson(hits, n)],
                    "bust_rate": round(busts / n, 3), "bust_ci95": [round(x, 3) for x in wilson(busts, n)],
                    "starter_rate": round(starters / n, 3),
                    "starter_ci95": [round(x, 3) for x in wilson(starters, n)],
                    "mean_pts": round(mean([r["pts"] for r in sel]), 1),
                    "mean_pts_ci95": [round(lo, 1), round(hi, 1)],
                    "sd_pts": round(sd([r["pts"] for r in sel]), 1)}

        by_pos = {p: summarize([r for r in graded if r["pos"] == p]) for p in POSITIONS}
        by_round = {rnd: summarize([r for r in graded if r["round"] == rnd])
                    for rnd in range(1, ROUNDS + 1)}
        by_band = {}
        for name, lo_r, hi_r in ROUND_BANDS:
            by_band[name] = {p: summarize([r for r in graded
                                           if r["pos"] == p and lo_r <= r["round"] <= hi_r])
                             for p in POSITIONS}
            by_band[name]["ALL"] = summarize([r for r in graded if lo_r <= r["round"] <= hi_r])
        by_keeper = {"keeper": summarize([r for r in graded if r["is_keeper"]]),
                     "open_market": summarize([r for r in graded if not r["is_keeper"]])}

        # the folk-wisdom test, preregistered §3.3
        early = [r for r in graded if r["round"] <= 6]
        rb = [r for r in early if r["pos"] == "RB"]
        wr = [r for r in early if r["pos"] == "WR"]
        g_rb = defaultdict(list)
        g_wr = defaultdict(list)
        for r in rb:
            g_rb[r["season"]].append(r["pts"])
        for r in wr:
            g_wr[r["season"]].append(r["pts"])
        diff_by_season = {str(s): round(mean(g_rb.get(s, [float("nan")])) -
                                        mean(g_wr.get(s, [float("nan")])), 1)
                          for s in SEASONS}
        merged = {s: [("RB", x) for x in g_rb.get(s, [])] + [("WR", x) for x in g_wr.get(s, [])]
                  for s in SEASONS}

        def _d(items):
            r_ = [v for t, v in items if t == "RB"]
            w_ = [v for t, v in items if t == "WR"]
            return (mean(r_) - mean(w_)) if r_ and w_ else None

        dlo, dhi = cluster_boot(merged, _d)
        signs = [v for v in diff_by_season.values() if not math.isnan(v)]
        out[arm] = {
            "by_position": by_pos, "by_round": by_round,
            "by_band_and_position": by_band, "by_keeper_status": by_keeper,
            "early_rb_vs_wr_rounds_1_6": {
                "rb_n": len(rb), "wr_n": len(wr),
                "rb_mean": round(mean([r["pts"] for r in rb]), 1) if rb else None,
                "wr_mean": round(mean([r["pts"] for r in wr]), 1) if wr else None,
                "rb_minus_wr": round(mean([r["pts"] for r in rb]) -
                                     mean([r["pts"] for r in wr]), 1) if rb and wr else None,
                "ci95": [round(dlo, 1), round(dhi, 1)],
                "per_season_diff": diff_by_season,
                "same_sign_seasons": sum(1 for v in signs if v > 0) if signs else 0,
                "rb_starter_rate": round(sum(1 for r in rb if r["starter"]) / len(rb), 3) if rb else None,
                "wr_starter_rate": round(sum(1 for r in wr if r["starter"]) / len(wr), 3) if wr else None,
            },
            "graded_n": len(graded),
        }
    return out


# ── Q4: what separated hits from busts ──────────────────────────────────────

LEAK_FREE_FEATURES = (
    "prior_pts", "prior_ppg", "prior_games", "prior2_pts", "age_Y",
    "tgt_share", "wopr", "ay_share", "rec_epa_pg", "rush_epa_pg",
    "pass_epa_pg", "cpoe", "racr", "opp_pg", "pts_per_opp",
    "draft_round", "nfl_exp",
)


def _mean_of(weeks: dict, pid: str, key: str):
    vals = [w[pid][key] for w in weeks.values() if pid in w and key in w[pid]]
    return mean(vals) if vals else None


def _sum_of(weeks: dict, pid: str, key: str) -> float:
    return sum(w[pid].get(key, 0) for w in weeks.values() if pid in w)


def preseason_features(season: int, positions: dict) -> dict:
    """Every feature strictly from seasons Y-1 and Y-2 (prereg §2.4).

    `team_change` is NOT built here on purpose. Its only committed source is
    component_stats_Y, an in-season file; it is quarantined to
    `team_change_sensitivity` where its provenance travels with it.
    """
    y1, y2 = season - 1, season - 2
    tot1, games1 = season_totals(y1)
    tot2, _ = season_totals(y2)
    comp1 = component_weeks(y1)
    adv1 = advanced_weeks(y1)
    ages = board_ages()
    cap = draft_capital()
    out = {}
    for pid, t1 in tot1.items():
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        g1 = games1.get(pid, 0)
        if g1 <= 0:
            continue
        tgt = _sum_of(comp1, pid, "tgt")
        rush = _sum_of(comp1, pid, "rush_att")
        opp = tgt + rush
        age26 = ages.get(pid)
        c = cap.get(pid)
        # `nflverse_draft_picks.json` spans 2021-2025, so it holds rows for NFL
        # drafts that had not happened yet in season Y's preseason. A player
        # needing a Y-1 profile cannot be one of them, but the guard is written
        # anyway so the period-correctness claim does not rest on that argument.
        if c is not None and c["draft_season"] > season:
            c = None
        out[pid] = {
            "pos": pos,
            "prior_pts": t1,
            "prior_ppg": t1 / g1,
            "prior_games": float(g1),
            "prior2_pts": tot2.get(pid),
            "age_Y": (age26 - (2026 - season)) if age26 is not None else None,
            "tgt_share": _mean_of(comp1, pid, "tgt_share"),
            "wopr": _mean_of(adv1, pid, "wopr"),
            "ay_share": _mean_of(adv1, pid, "ay_share"),
            "rec_epa_pg": _mean_of(adv1, pid, "rec_epa"),
            "rush_epa_pg": _mean_of(adv1, pid, "rush_epa"),
            "pass_epa_pg": _mean_of(adv1, pid, "pass_epa"),
            "cpoe": _mean_of(adv1, pid, "cpoe"),
            "racr": _mean_of(adv1, pid, "racr"),
            "opp_pg": opp / g1 if g1 else None,
            "pts_per_opp": (t1 / opp) if opp > 0 else None,
            "draft_round": float(c["draft_round"]) if c else None,
            "nfl_exp": float(season - c["draft_season"]) if c else None,
        }
    return out


_FROZEN_TABLE: dict = {}


def frozen_table() -> dict:
    """The league's scoring table, memoized.

    ⚠️ THE REASON THIS FUNCTION EXISTS, and it is not stylistic. Upstream,
    `fetch_component_stats.frozen_scoring_table()` reads the table out of
    `nflverse_weekly_points_2023.json`. The table is league CONFIGURATION — the
    same rules in every season, one fingerprint pinned across all three stores —
    but the FILE it lives in is a 2023 outcome store. Left alone, building
    season-2023 features opens a 2023 outcome file, and the leakage test that
    traces file opens goes red on a read that is innocent in substance and
    indistinguishable from a real leak in form.

    Fetching it once, before any feature is built, keeps the trace honest
    instead of teaching the test to ignore a filename. `draft_replay_2025.py`
    hit exactly this and solved it exactly this way; the leakage test asserts
    the memo is warm before the feature path runs, so this cannot silently
    regress into a real exemption.
    """
    if not _FROZEN_TABLE:
        import sys
        sys.path.insert(0, str(HERE))
        import fetch_component_stats as FCS   # noqa: E402
        _FROZEN_TABLE.update(FCS.frozen_scoring_table())
    return dict(_FROZEN_TABLE)


def _totals_from_components(season: int) -> tuple[dict, dict]:
    """2021/2022 points scored from the component store under the frozen table —
    the same parity-pinned construction `draft_replay_2025` uses for its
    walk-forward substrate. Imported lazily so the 2023+ path never touches it."""
    import sys
    sys.path.insert(0, str(HERE))
    import fetch_component_stats as FCS   # noqa: E402
    wk = FCS.scored_weekly_points(season, frozen_table(), LAST_SCORED_WEEK)
    return ({pid: sum(float(v) for v in r.values()) for pid, r in wk.items()},
            {pid: len(r) for pid, r in wk.items()})


def q4_separators(rows: list, positions: dict) -> dict:
    feats = {s: preseason_features(s, positions) for s in SEASONS}
    totals = {s: season_totals(s) for s in SEASONS}
    exp = _loo_round_expectation(_arm(rows, "E"))
    drafted = {(r["season"], r["pid"]): r for r in _arm(rows, "E")}

    # sample (a)/(b): every player with a Y-1 profile who played in Y
    obs = []
    for s in SEASONS:
        tot, games = totals[s]
        for pid, f in feats[s].items():
            if games.get(pid, 0) <= 0:
                continue
            realized = tot[pid]
            d = drafted.get((s, pid))
            e = exp.get((s, d["round"])) if d else None
            obs.append({"season": s, "pid": pid, "pos": f["pos"], "f": f,
                        "realized": realized,
                        "resid_vs_naive": realized - f["prior_pts"],
                        "resid_vs_slot": (realized - e) if (d and e is not None
                                                            and not math.isnan(e)) else None})

    result = {"n_observations": len(obs),
              "coverage": {}, "univariate": {}, "multivariate": {}}
    # feature coverage — GAP 3 lives here and must be visible
    for f in LEAK_FREE_FEATURES:
        have = sum(1 for o in obs if o["f"].get(f) is not None)
        result["coverage"][f] = {"n": have, "pct": round(100.0 * have / len(obs), 1)}

    fam_p, fam_key = [], []
    for outcome in ("realized", "resid_vs_naive", "resid_vs_slot"):
        result["univariate"][outcome] = {}
        for pos in POSITIONS:
            result["univariate"][outcome][pos] = {}
            for fname in LEAK_FREE_FEATURES:
                pairs_by_season = defaultdict(list)
                for o in obs:
                    if o["pos"] != pos:
                        continue
                    v, y = o["f"].get(fname), o[outcome]
                    if v is None or y is None:
                        continue
                    pairs_by_season[o["season"]].append((v, y))
                flat = [p for v in pairs_by_season.values() for p in v]
                if len(flat) < 12:
                    result["univariate"][outcome][pos][fname] = {"n": len(flat),
                                                                 "verdict": "insufficient n"}
                    continue
                rho = spearman(flat)
                lo, hi = cluster_boot(pairs_by_season, spearman)
                per_season = {str(s): round(spearman(v), 3)
                              for s, v in sorted(pairs_by_season.items()) if len(v) >= 6}
                signs = [v for v in per_season.values() if not math.isnan(v)]
                same = max(sum(1 for v in signs if v > 0), sum(1 for v in signs if v < 0))
                excl = not (math.isnan(lo) or math.isnan(hi)) and (lo > 0 or hi < 0)
                verdict = ("FINDING" if excl and same >= 2 else
                           "one-season, not replicated" if excl else
                           "not distinguishable from noise")
                p = spearman_p(rho, len(flat))
                fam_p.append(p)
                fam_key.append((outcome, pos, fname))
                result["univariate"][outcome][pos][fname] = {
                    "n": len(flat), "spearman": round(rho, 3),
                    "ci95": [round(lo, 3), round(hi, 3)],
                    "per_season": per_season, "same_sign_seasons": same,
                    "p_raw": round(p, 5), "verdict": verdict}

    keep = bh_reject(fam_p, BH_Q)
    for (outcome, pos, fname), k in zip(fam_key, keep):
        result["univariate"][outcome][pos][fname]["bh_q10_survives"] = bool(k)
    result["bh_family_size"] = len(fam_p)
    result["bh_survivors"] = sum(1 for k in keep if k)

    # multivariate: standardized OLS per position, complete cases only
    for outcome in ("realized", "resid_vs_naive"):
        result["multivariate"][outcome] = {}
        for pos in POSITIONS:
            sel = [o for o in obs if o["pos"] == pos and o[outcome] is not None]
            use = [f for f in LEAK_FREE_FEATURES
                   if sum(1 for o in sel if o["f"].get(f) is not None) >= 0.7 * len(sel)]
            cc = [o for o in sel if all(o["f"].get(f) is not None for f in use)]
            if len(cc) < 4 * len(use) or not use:
                result["multivariate"][outcome][pos] = {
                    "n_complete": len(cc), "features": use,
                    "verdict": "insufficient complete cases for a stable fit"}
                continue
            cols = {f: [float(o["f"][f]) for o in cc] for f in use}
            mu = {f: mean(cols[f]) for f in use}
            sg = {f: (sd(cols[f]) or 1.0) for f in use}
            X = [[(o["f"][f] - mu[f]) / sg[f] for f in use] for o in cc]
            y = [o[outcome] for o in cc]
            coef = ols(X, y)
            pred = [sum(c * v for c, v in zip(coef[:-1], row)) + coef[-1] for row in X]
            ybar = mean(y)
            ss_res = sum((a - b) ** 2 for a, b in zip(y, pred))
            ss_tot = sum((a - ybar) ** 2 for a in y)
            groups = defaultdict(list)
            for o, row in zip(cc, X):
                groups[o["season"]].append((row, o[outcome]))

            def _fit(items, j=None):
                XX = [it[0] for it in items]
                yy = [it[1] for it in items]
                try:
                    c = ols(XX, yy)
                except Exception:
                    return None
                return c[j]
            cis = {}
            for j, f in enumerate(use):
                lo, hi = cluster_boot(groups, lambda it, j=j: _fit(it, j), reps=400)
                cis[f] = [round(lo, 2), round(hi, 2)]
            result["multivariate"][outcome][pos] = {
                "n_complete": len(cc), "features": use,
                "coef_points_per_sd": {f: round(c, 2) for f, c in zip(use, coef[:-1])},
                "coef_ci95": cis,
                "intercept": round(coef[-1], 2),
                "r2": round(1 - ss_res / ss_tot, 3) if ss_tot > 0 else None}

    # quarantined team_change sensitivity (prereg §2.4)
    tc = {}
    for pos in POSITIONS:
        by_season = defaultdict(list)
        for s in SEASONS:
            c_prev = component_weeks(s - 1)
            c_now = component_weeks(s)

            def team_of(weeks, pid):
                for w in sorted(weeks):
                    if pid in weeks[w] and "team" in weeks[w][pid]:
                        return weeks[w][pid]["team"]
                return None
            for o in obs:
                if o["season"] != s or o["pos"] != pos or o["resid_vs_naive"] is None:
                    continue
                a, b = team_of(c_prev, o["pid"]), team_of(c_now, o["pid"])
                if a and b:
                    by_season[s].append((1.0 if a != b else 0.0, o["resid_vs_naive"]))
        flat = [p for v in by_season.values() for p in v]
        if len(flat) < 12:
            tc[pos] = {"n": len(flat), "verdict": "insufficient n"}
            continue
        ch = [y for x, y in flat if x == 1.0]
        st = [y for x, y in flat if x == 0.0]
        lo, hi = cluster_boot(by_season, lambda it: (
            mean([y for x, y in it if x == 1.0]) - mean([y for x, y in it if x == 0.0])
            if any(x == 1.0 for x, _ in it) and any(x == 0.0 for x, _ in it) else None))
        tc[pos] = {"n_changed": len(ch), "n_stayed": len(st),
                   "mean_resid_changed": round(mean(ch), 1) if ch else None,
                   "mean_resid_stayed": round(mean(st), 1) if st else None,
                   "diff": round(mean(ch) - mean(st), 1) if ch and st else None,
                   "ci95": [round(lo, 1), round(hi, 1)],
                   "_provenance": "team label read from component_stats_Y — "
                                  "quarantined, NOT in the primary leak-free model"}
    result["team_change_sensitivity"] = tc
    return result


# ── Q5: hindsight board and how much preseason signal reached it ────────────

def _name_to_pid() -> dict:
    """{normalized name: pid}, from the repo's own board name map and matcher.

    Reused rather than reinvented: `draft_replay_2025.name_map` walks four
    committed boards and `adp.normalize_name` is the matcher every ADP join in
    this repo already uses, initials/apostrophes/accents and all.
    """
    import sys
    sys.path.insert(0, str(DRAFT / "tools"))
    sys.path.insert(0, str(DRAFT))
    import draft_replay_2025 as RP     # noqa: E402
    import adp as ADP                  # noqa: E402
    out = {}
    for pid, nm in RP.name_map().items():
        out.setdefault(ADP.normalize_name(nm), str(pid))
    return out


def props_ordering() -> tuple[dict, dict]:
    """Week-1 player props -> an implied season ordering (prereg §3.5, arm 3).

    ⚠️ THE ANYTIME-TD COLUMN IS UNUSABLE AND IS EXCLUDED. Measured on the
    committed week-1 stores: Christian McCaffrey's 2024 `any_td` is 4.21 and a
    cornerback's is 1.68 — those are not expected touchdowns for one game. The
    column is the decimal-odds corruption `fetch_historical_props.py` now
    guards against in `AMERICAN_IMPOSSIBLE_BAND` ("the 21-33x corruption the
    2026-08-16 anytime-TD column shipped with"); the guard landed in the
    fetcher, the committed week-1 stores predate it and still carry the bad
    values. Using it would silently reorder the whole board.

    So this ordering is built ONLY from the `point`-quoted markets, converted
    under the frozen table and scaled x17. That means IT CARRIES NO RUSHING OR
    RECEIVING TOUCHDOWNS, which understates goal-line backs and red-zone
    receivers by a systematic amount. It is therefore a LOWER BOUND on what a
    props board could do, is labelled as such everywhere it appears, and is
    never the headline.
    """
    tbl = frozen_table()
    n2p = _name_to_pid()
    ranks, diag = {}, {}
    for season in SEASONS:
        path = HERE / f"historical_props_week1_{season}.json"
        try:
            doc = json.loads(path.read_text())
        except (OSError, ValueError):
            diag[str(season)] = {"status": "store absent"}
            continue
        players = doc["weeks"][0]["players"]
        rank, matched, unmatched, no_lines = {}, 0, 0, 0
        for name, mk in players.items():
            pid = n2p.get(_normalize(name))
            if pid is None:
                unmatched += 1
                continue
            pts = (mk.get("pass_yd", 0.0) * tbl["pass_yd"]
                   + mk.get("pass_td", 0.0) * tbl["pass_td"]
                   + mk.get("rush_yd", 0.0) * tbl["rush_yd"]
                   + mk.get("rec_yd", 0.0) * tbl["rec_yd"]
                   + mk.get("rec", 0.0) * tbl["rec"])
            if pts <= 0:
                no_lines += 1
                continue
            matched += 1
            rank[pid] = -pts * LAST_SCORED_WEEK      # negative: lower rank = better
        ranks[season] = rank
        diag[str(season)] = {"props_rows": len(players), "name_matched": matched,
                             "name_unmatched": unmatched,
                             "matched_but_no_point_line": no_lines,
                             "markets_used": ["pass_yd", "pass_td", "rush_yd",
                                              "rec_yd", "rec"],
                             "markets_excluded": ["any_td (corrupted in the "
                                                  "committed store — see docstring)"]}
    return (ranks if len(ranks) == len(SEASONS) else {}), diag


def _normalize(name: str) -> str:
    import sys
    sys.path.insert(0, str(DRAFT))
    import adp as ADP    # noqa: E402
    return ADP.normalize_name(name)


def own_v6_ordering(positions: dict) -> tuple[dict, dict]:
    """own_v6 walk-forward, market arm removed — prereg §3.5, arm 4.

    BENCHMARK ONLY, and it is built by IMPORTING `draft_replay_2025.
    build_projections` unmodified rather than reimplementing it. Reimplementing
    would produce a number that is ours-shaped twice over: a study grading our
    model against a copy of our model that drifted. The market arm is removed
    upstream for the reason that file states — v5/v6's market input IS the
    league draft, which is one of the things being compared here.
    """
    import sys
    sys.path.insert(0, str(DRAFT / "tools"))
    import draft_replay_2025 as RP     # noqa: E402
    ages = RP.board_ages()
    ranks, diag = {}, {}
    for season in SEASONS:
        try:
            proj = RP.build_projections(season, positions, ages)
        except Exception as exc:                     # pragma: no cover
            diag[str(season)] = {"status": f"unavailable: {type(exc).__name__}"}
            continue
        ranks[season] = {pid: -float(v) for pid, v in proj.items()}
        diag[str(season)] = {"projected_players": len(proj),
                             "arm": "own_v6 walk-forward, market arm removed",
                             "source": "draft/tools/draft_replay_2025.build_projections "
                                       "(imported unmodified)"}
    return (ranks if len(ranks) == len(SEASONS) else {}), diag


def q5_hindsight(rows: list, positions: dict) -> dict:
    drafts = league_drafts()
    out = {"capture": {}, "spearman_vs_hindsight": {}, "random_floor": {}}
    rng = random.Random(SEED)

    market_rank: dict[int, dict] = {}
    for s in SEASONS:
        market_rank[s] = {r["pid"]: r["pick_no"] for r in drafts[s]}

    naive_rank: dict[int, dict] = {}
    for s in SEASONS:
        tot, games = season_totals(s - 1)
        naive_rank[s] = {pid: -v for pid, v in tot.items() if games.get(pid, 0) > 0}

    orderings = {"market_league_draft": market_rank, "naive_prior_season_points": naive_rank}

    props_rank, props_diag = props_ordering()
    if props_rank:
        orderings["week1_props_implied_x17"] = props_rank
    own_rank, own_diag = own_v6_ordering(positions)
    if own_rank:
        orderings["own_v6_walkforward_BENCHMARK_ONLY"] = own_rank
    out["_ordering_diagnostics"] = {"week1_props": props_diag, "own_v6": own_diag}

    for name, rank in orderings.items():
        out["capture"][name] = {}
        out["spearman_vs_hindsight"][name] = {}
        for pos in POSITIONS:
            K = STARTER_RANK[pos]
            per_season, rhos = {}, {}
            for s in SEASONS:
                u = universe(s, positions)[pos]
                best = sum(p for _, p in u[:K])
                have = [(rank[s][pid], p) for pid, p in u if pid in rank[s]]
                have.sort(key=lambda t: t[0])
                got = sum(p for _, p in have[:K])
                per_season[str(s)] = {
                    "capture": round(got / best, 3) if best > 0 else None,
                    "sum_top_k": round(got, 1), "hindsight_top_k": round(best, 1),
                    "ranked_players_in_pool": len(have), "pool": len(u)}
                if len(have) >= 8:
                    rhos[str(s)] = round(spearman([(-r_, p) for r_, p in have]), 3)
            caps = [v["capture"] for v in per_season.values() if v["capture"] is not None]
            out["capture"][name][pos] = {
                "per_season": per_season,
                "mean_capture": round(mean(caps), 3) if caps else None,
                "min": round(min(caps), 3) if caps else None,
                "max": round(max(caps), 3) if caps else None}
            out["spearman_vs_hindsight"][name][pos] = rhos

    # random floor — draw K from the draftable pool
    for pos in POSITIONS:
        K = STARTER_RANK[pos]
        vals = []
        for s in SEASONS:
            u = universe(s, positions)[pos]
            best = sum(p for _, p in u[:K])
            pts = [p for _, p in u]
            for _ in range(BOOTSTRAP):
                draw = rng.sample(pts, K) if len(pts) >= K else pts
                vals.append(sum(draw) / best if best > 0 else 0.0)
        out["random_floor"][pos] = {"mean": round(mean(vals), 3),
                                    "ci95": [round(_pct(vals, 0.025), 3),
                                             round(_pct(vals, 0.975), 3)]}
    # the same gap in POINTS, because a capture percentage is not a decision.
    # per-team headroom divides the whole league's starter pool by 10 teams:
    # a 10-team league's top-K IS every team's starters, so one owner's share of
    # a league-wide gap is a tenth of it.
    headroom = {}
    for name, byp in out["capture"].items():
        rows_h = {}
        for pos, v in byp.items():
            gaps = [x["hindsight_top_k"] - x["sum_top_k"] for x in v["per_season"].values()]
            rows_h[pos] = {
                "league_wide_points_left_per_season": round(mean(gaps), 1),
                "per_team_points_per_season": round(mean(gaps) / TEAMS, 1),
                "per_team_points_per_week": round(mean(gaps) / TEAMS / LAST_SCORED_WEEK, 2)}
        rows_h["ALL_POSITIONS"] = {
            "per_team_points_per_season": round(
                sum(r["per_team_points_per_season"] for r in rows_h.values()), 1),
            "per_team_points_per_week": round(
                sum(r["per_team_points_per_week"] for r in rows_h.values()), 2)}
        headroom[name] = rows_h
    out["headroom_to_perfect_hindsight"] = headroom

    # how concentrated is hindsight value — the bound behind the bound
    conc = {}
    for pos in POSITIONS:
        rowsp = {}
        for s in SEASONS:
            u = universe(s, positions)[pos]
            tot = sum(p for _, p in u)
            K = STARTER_RANK[pos]
            rowsp[str(s)] = {"share_top_k": round(sum(p for _, p in u[:K]) / tot, 3),
                             "share_top_5": round(sum(p for _, p in u[:5]) / tot, 3),
                             "pool": len(u)}
        conc[pos] = rowsp
    out["hindsight_concentration"] = conc
    return out


# ── Q6: allocation by round from outcomes ───────────────────────────────────

def realized_replacement(positions: dict) -> dict:
    """{pos: pooled realized points at the league's starter rank}, 2023-25.

    This is the OUTCOME-space replacement level, and it is the only currency in
    which the Q6 allocation table means anything — see that function's note.
    """
    return {pos: mean([universe(s, positions)[pos][STARTER_RANK[pos] - 1][1]
                       for s in SEASONS]) for pos in POSITIONS}


def q6_allocation(rows: list, positions: dict) -> dict:
    """Marginal value per (round, position) cell.

    ⚠️ THE PREREGISTERED FORM OF THIS INSTRUMENT (§3.6) IS DEGENERATE AND THE
    REPAIR IS DECLARED HERE RATHER THAN QUIETLY APPLIED. §3.6 said to score an
    allocation by summing `E[points | round, pos]`. Run as written, that
    allocator drafts fifteen quarterbacks: under 6-point passing touchdowns a
    round-15 QB cell averages 241.0 points against a round-15 RB cell's 28.8,
    so RAW POINTS make the objective monotone in "take another QB" and the
    enumeration is meaningless.

    Raw points are the wrong currency for a positional allocation question —
    what a pick is worth is what it returns ABOVE what that position's
    replacement returns. So the table below carries BOTH: the preregistered raw
    `mean`, exactly as fixed, AND `vor_mean`, the same cell measured against the
    position's pooled REALIZED replacement (§3.2's realized-rank level, outcome
    space on both sides of the subtraction). The verdict reads off vor_mean; the
    raw column stays so the preregistered instrument and its failure are both
    visible. This is a post-hoc repair of a preregistration that was wrong, and
    it is labelled as one.
    """
    a = _arm(rows, "E")
    repl = realized_replacement(positions)
    cells = {}
    for rnd in range(1, ROUNDS + 1):
        for pos in POSITIONS:
            sel = [r for r in a if r["round"] == rnd and r["pos"] == pos]
            g = defaultdict(list)
            for r in sel:
                g[r["season"]].append(r["pts"])
            lo, hi = cluster_boot(g, mean) if sel else (float("nan"), float("nan"))
            cells[(rnd, pos)] = {
                "n": len(sel),
                "mean": round(mean([r["pts"] for r in sel]), 1) if sel else None,
                "ci95": [round(lo, 1), round(hi, 1)] if sel else None,
                "vor_mean": round(mean([r["pts"] for r in sel]) - repl[pos], 1) if sel else None,
                "vor_ci95": [round(lo - repl[pos], 1), round(hi - repl[pos], 1)] if sel else None,
                "seasons_present": sorted(str(s) for s in g)}
    # widest-vs-difference diagnostic: is any allocation separable at all?
    widths = [c["ci95"][1] - c["ci95"][0] for c in cells.values()
              if c["ci95"] and not any(math.isnan(x) for x in c["ci95"])]
    table = {f"R{r}_{p}": cells[(r, p)] for r in range(1, ROUNDS + 1) for p in POSITIONS}
    # best-VOR position per round, and whether it is separable from the runner-up
    per_round = {}
    for rnd in range(1, ROUNDS + 1):
        have = [(p, cells[(rnd, p)]) for p in POSITIONS if cells[(rnd, p)]["n"] >= 3]
        if not have:
            per_round[rnd] = {"verdict": "no cell with n>=3"}
            continue
        have.sort(key=lambda t: -t[1]["vor_mean"])
        best, rest = have[0], have[1:]
        sep = bool(rest) and best[1]["vor_ci95"][0] > max(r[1]["vor_ci95"][1] for r in rest)
        per_round[rnd] = {
            "ranking": [{"pos": p, "n": c["n"], "vor_mean": c["vor_mean"],
                         "vor_ci95": c["vor_ci95"]} for p, c in have],
            "best": best[0],
            "separable_from_runner_up": sep}
    return {"cells": table,
            "realized_replacement_used": {p: round(v, 1) for p, v in repl.items()},
            "best_position_per_round_by_vor": per_round,
            "rounds_where_best_is_separable": [r for r, v in per_round.items()
                                               if v.get("separable_from_runner_up")],
            "median_cell_ci_width": round(median(widths), 1) if widths else None,
            "mean_cell_n": round(mean([c["n"] for c in cells.values()]), 1),
            "empty_cells": sum(1 for c in cells.values() if c["n"] == 0),
            "_limitation": ("marginal-value table, NOT a draft simulation: it "
                            "assumes a pick at (round,pos) returns the cell mean "
                            "regardless of availability, cascade or opponent "
                            "response. Prereg §3.6 fixes in advance that where "
                            "this disagrees with the archetype simulation and the "
                            "disagreement does not survive its own CI, the "
                            "archetype simulation is the instrument trusted.")}


# ── run ─────────────────────────────────────────────────────────────────────

def run() -> dict:
    frozen_table()          # warm the memo BEFORE any feature is built (see its docstring)
    positions = positions_record()
    rows, surv = pick_rows(positions)
    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/empirical_draft_value.py",
        "_note": ("EMPIRICAL draft-value study, 2023-25. Preregistered in "
                  "draft/audit/empirical_draft_value_2026-08-16.md §§0-3 before "
                  "any number here existed. OUTCOMES study, not a model study. "
                  "Price instrument is Cory's own 10-team league draft (no "
                  "national historical ADP exists in-repo and FFC is egress-"
                  "blocked here); its rounds 1-3 are KEEPER rounds, so early-slot "
                  "value is a keeper ledger, not a market clearing. Three seasons "
                  "= 3 observations per slot; read the n and the CI on every cell "
                  "before quoting it."),
        "seasons": list(SEASONS),
        "scoring": "frozen table — 0.5 PPR, 6-pt pass TD, 0.04/pass yd, weeks 1-17",
        "survivorship": surv,
        "q1_value_curve": q1_value_curve(rows),
        "q2_cliffs": q2_cliffs(positions),
        "q3_hit_bust": q3_hit_bust(rows, positions),
        "q4_separators": q4_separators(rows, positions),
        "q5_hindsight": q5_hindsight(rows, positions),
        "q6_allocation": q6_allocation(rows, positions),
    }


def main() -> None:
    out = run()
    (HERE / "empirical_draft_value.json").write_text(json.dumps(out, indent=1) + "\n")
    print("wrote empirical_draft_value.json")


if __name__ == "__main__":
    main()
