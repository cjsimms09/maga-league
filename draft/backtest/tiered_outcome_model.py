# TERRITORY: C
"""TIERED OUTCOME MODEL — a distribution over outcome classes, not a mean.

Preregistration: `draft/backtest/TIERED-OUTCOME-PREREG.md`, committed in an
EARLIER commit than this file. Read it first; it fixes the tiers, the
population, the walk-forward, the model class and the bar, and nothing in here
is allowed to move any of them.

WHAT THIS IS FOR, in one sentence: two late-round WRs both projected for 140
points are the SAME pick under a mean, and Cory's stated draft thesis is that
"fantasy is won by drafting stud players in later rounds" — a claim a mean
cannot express and a class distribution can. This module tests that claim
directly and is prepared to publish the null.

WHAT OPENFPL ACTUALLY DOES (mined from the repo; the paper is unreachable from
this sandbox and was not read): a per-position median ensemble of
xgboost/randforest REGRESSORS emitting one continuous `prediction`. Its four
famous names — Zeros / Blanks / Tickers / Haulers — are EVALUATION STRATA on
the realized outcome, the column headings of an RMSE table. Predicting a
distribution over the strata is OUR step, not OpenFPL's. What we take from
OpenFPL is (a) grade inside the outcome bands that matter rather than with one
global number and (b) position-specific handling.

STORE LOCATION. The component/advanced stat stores are A-lane files. On a tree
that carries them they sit beside this module; `TIERED_STORE_DIR` overrides the
directory so the experiment can run in a worktree that does not (a lane may not
commit another lane's files). It is unset in CI, where the tests run on
fixtures and the store-dependent tests skip.

Run: python draft/backtest/tiered_outcome_model.py
Writes draft/backtest/tiered_outcome_model.json.
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from scoring import score_stat_line  # noqa: E402

OUT = HERE / "tiered_outcome_model.json"

# ── PREREGISTERED CONSTANTS — every one of these is fixed in the prereg ──────
TIERS = ("BUST", "REPLACEMENT", "STARTER", "LEAGUE-WINNER")
LEAGUE_WINNER = 3
POSITIONS = ("QB", "RB", "WR", "TE")
# league-wide starting slots per position; K IS the replacement-level rank
# (vorp.py: "The Nth-ranked player at each position is replacement level"),
# flex split quoted from vorp.py's measured 2026 board: RB+1 / WR+9 / TE+0.
K_SLOTS = {"QB": 10, "RB": 21, "WR": 29, "TE": 10}
K_SLOTS_DEDICATED_ONLY = {"QB": 10, "RB": 20, "WR": 20, "TE": 10}   # sensitivity S2

LAST_SCORED_WEEK = 17
TEST_SEASONS = (2023, 2024, 2025)
LABEL_SEASONS = (2021, 2022, 2023, 2024, 2025)
STORE_LABEL_SEASONS = (2023, 2024, 2025)     # weekly-points stores exist
DERIVED_LABEL_SEASONS = (2021, 2022)         # recomputed from component stats
LATE_ROUND_FIRST_PICK = 61                   # 10 teams => rounds 7-15
RIDGE_LAMBDA = 1.0
CALIBRATION_EDGES = (0.0, 0.05, 0.10, 0.20, 0.35, 1.0001)
BOOTSTRAP_DRAWS = 2000
BOOTSTRAP_SEED = 20260816
RECENCY_WEIGHTS = (0.7, 0.3)

FEATURES = (
    "pts_y1", "ppg_y1", "games_y1", "pts_y2", "has_y2",
    "tgt_share_y1", "wopr_y1", "ay_share_y1",
    "rec_epa_pg", "rush_epa_pg", "pass_epa_pg",
    "opp_pg", "td_per_opp",
)
# advanced keys whose absence inside a present row is MISSING, not zero
_EPA_KEYS = ("rec_epa", "rush_epa", "pass_epa", "cpoe", "racr")


def assert_walk_forward(train_seasons, test_season: int) -> None:
    """REFUSE a fit that can see its own test season. The one assertion this
    whole experiment is worthless without."""
    bad = [s for s in train_seasons if int(s) >= int(test_season)]
    if bad:
        raise AssertionError(
            f"leak: training seasons {sorted(bad)} are not strictly before the "
            f"graded season {test_season}")


def assert_feature_seasons(feature_seasons, test_season: int) -> None:
    bad = [s for s in feature_seasons if int(s) >= int(test_season)]
    if bad:
        raise AssertionError(
            f"leak: feature seasons {sorted(bad)} are not strictly before the "
            f"graded season {test_season}")


def store_dir() -> Path:
    override = os.environ.get("TIERED_STORE_DIR")
    return Path(override) if override else HERE


def _load(name: str) -> dict:
    return json.loads((store_dir() / name).read_text())


# ── LABELS ──────────────────────────────────────────────────────────────────

def scoring_table() -> dict:
    """The committed scoring table the weekly-points stores were scored under.

    Read from the store rather than from league_config so a derived season and
    a stored season can never be scored under two different rule sets — the
    exact defect nflverse_weekly_store.py's fingerprint exists to refuse.
    """
    doc = json.loads((HERE / "nflverse_weekly_points_2023.json").read_text())
    return doc["weeks"][0]["scoring"]


def _fingerprints() -> dict:
    out = {}
    for y in STORE_LABEL_SEASONS:
        doc = json.loads((HERE / f"nflverse_weekly_points_{y}.json").read_text())
        out[y] = doc.get("scoring_fingerprints")
    return out


def totals_from_store(season: int) -> tuple[dict, dict]:
    """({pid: points}, {pid: weeks_with_a_row}) for weeks 1..17, from the
    committed weekly-points store. Identical basis to model_accuracy_backtest."""
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    totals: dict[str, float] = {}
    games: dict[str, int] = {}
    for w in doc["weeks"]:
        if int(w["week"]) > LAST_SCORED_WEEK:
            continue
        for pid, v in w["points"].items():
            totals[pid] = totals.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return totals, games


def totals_derived(season: int) -> tuple[dict, dict]:
    """The same thing recomputed from component_stats with our scoring table.

    Only legitimate because verify_derivation() proves it reproduces the
    committed store exactly on the seasons where both exist.
    """
    scoring = scoring_table()
    comp = _load(f"component_stats_{season}.json")
    totals: dict[str, float] = {}
    games: dict[str, int] = {}
    for w in comp["weeks"]:
        if int(w["week"]) > LAST_SCORED_WEEK:
            continue
        for pid, row in w["players"].items():
            totals[pid] = totals.get(pid, 0.0) + score_stat_line(row, scoring)
            games[pid] = games.get(pid, 0) + 1
    return {p: round(v, 2) for p, v in totals.items()}, games


def verify_derivation(seasons=(2023, 2024)) -> dict:
    """THE GATE. Re-derive from component_stats and compare, player-week by
    player-week, against the committed points store. Preregistered: if this
    does not match exactly, the derived label seasons are refused."""
    scoring = scoring_table()
    report = {}
    for season in seasons:
        store_rows: dict[tuple[str, int], float] = {}
        doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
        for w in doc["weeks"]:
            if int(w["week"]) > LAST_SCORED_WEEK:
                continue
            for pid, v in w["points"].items():
                store_rows[(pid, int(w["week"]))] = float(v)
        derived_rows: dict[tuple[str, int], float] = {}
        comp = _load(f"component_stats_{season}.json")
        for w in comp["weeks"]:
            if int(w["week"]) > LAST_SCORED_WEEK:
                continue
            for pid, row in w["players"].items():
                derived_rows[(pid, int(w["week"]))] = score_stat_line(row, scoring)
        common = set(store_rows) & set(derived_rows)
        worst = max((abs(store_rows[k] - derived_rows[k]) for k in common), default=None)
        report[season] = {
            "player_weeks_compared": len(common),
            "only_in_points_store": len(set(store_rows) - set(derived_rows)),
            "only_in_component_store": len(set(derived_rows) - set(store_rows)),
            "max_abs_difference": worst,
            "exact": worst is not None and worst < 1e-9,
        }
    report["gate"] = "pass" if all(report[s]["exact"] for s in seasons) else "fail"
    return report


def season_totals(season: int) -> tuple[dict, dict]:
    if season in STORE_LABEL_SEASONS:
        return totals_from_store(season)
    return totals_derived(season)


def positions_for(season: int) -> dict:
    """{pid: pos} from that season's own component rows (modal position), with
    the committed positions record as fallback. A player with neither is
    dropped and counted by the caller."""
    counts: dict[str, dict[str, int]] = {}
    comp = _load(f"component_stats_{season}.json")
    for w in comp["weeks"]:
        for pid, row in w["players"].items():
            pos = row.get("pos")
            if pos in POSITIONS:
                counts.setdefault(pid, {})
                counts[pid][pos] = counts[pid].get(pos, 0) + 1
    out = {pid: max(sorted(c), key=lambda p: (c[p], p)) for pid, c in counts.items()}
    try:
        rec = json.loads((HERE.parent / "data" / "player_positions.json").read_text())
        for pid, pos in rec["positions"].items():
            if pid not in out and pos in POSITIONS:
                out[pid] = pos
    except (OSError, ValueError, KeyError):
        pass
    return out


def tier_labels(season: int, k_slots: dict | None = None) -> tuple[dict, dict]:
    """({pid: tier_index}, diagnostics) by positional finish rank over the FULL
    realized field of that season — not over our population, so the definition
    does not move when the population does."""
    k_slots = k_slots or K_SLOTS
    totals, _games = season_totals(season)
    pos_map = positions_for(season)
    by_pos: dict[str, list] = {p: [] for p in POSITIONS}
    unpositioned = 0
    for pid, pts in totals.items():
        pos = pos_map.get(pid)
        if pos not in POSITIONS:
            unpositioned += 1
            continue
        by_pos[pos].append((pts, pid))
    labels: dict[str, int] = {}
    field = {}
    for pos, rows in by_pos.items():
        rows.sort(key=lambda r: (-r[0], r[1]))
        k = k_slots[pos]
        lw_cut = math.ceil(k / 2)
        for i, (_pts, pid) in enumerate(rows):
            r = i + 1
            if r <= lw_cut:
                labels[pid] = 3
            elif r <= k:
                labels[pid] = 2
            elif r <= 2 * k:
                labels[pid] = 1
            else:
                labels[pid] = 0
        field[pos] = {"field_size": len(rows), "K": k, "league_winner_cut": lw_cut,
                      "points_at_league_winner_cut":
                          round(rows[lw_cut - 1][0], 2) if len(rows) >= lw_cut else None,
                      "points_at_replacement_K":
                          round(rows[k - 1][0], 2) if len(rows) >= k else None}
    return labels, {"unpositioned_players_dropped": unpositioned, "by_position": field}


# ── FEATURES (season Y-1 and Y-2 only) ──────────────────────────────────────

def _component_season(season: int) -> tuple[dict, dict]:
    """({pid: aggregated component totals}, {pid: games}) for weeks 1..17."""
    agg: dict[str, dict] = {}
    games: dict[str, int] = {}
    comp = _load(f"component_stats_{season}.json")
    for w in comp["weeks"]:
        if int(w["week"]) > LAST_SCORED_WEEK:
            continue
        for pid, row in w["players"].items():
            bucket = agg.setdefault(pid, {})
            for k, v in row.items():
                if k in ("pos", "team"):
                    continue
                bucket[k] = bucket.get(k, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return agg, games


def _advanced_season(season: int) -> dict:
    """{pid: {key: (sum, n_rows_where_present)}} for weeks 1..17."""
    agg: dict[str, dict] = {}
    adv = _load(f"advanced_stats_{season}.json")
    for w in adv["weeks"]:
        if int(w["week"]) > LAST_SCORED_WEEK:
            continue
        for pid, row in w["players"].items():
            bucket = agg.setdefault(pid, {})
            for k, v in row.items():
                if k == "pos":
                    continue
                s, n = bucket.get(k, (0.0, 0))
                bucket[k] = (s + float(v), n + 1)
            # `_rows` is the denominator the ZERO-STRIPPED share keys (wopr,
            # ay_share) need: absence inside a present row IS a zero for them,
            # so they divide by every row. The EPA keys divide by their own
            # presence count instead, because their absence is missing data.
            bucket["_rows"] = (bucket.get("_rows", (0.0, 0))[0] + 1.0,
                               bucket.get("_rows", (0.0, 0))[1] + 1)
    return agg


def features_for(target_season: int) -> tuple[dict, dict]:
    """{pid: {feature: value, 'pos': pos}} strictly from seasons < target."""
    y1, y2 = target_season - 1, target_season - 2
    assert_feature_seasons((y1, y2), target_season)

    comp1, games1 = _component_season(y1)
    adv1 = _advanced_season(y1)
    pts1, _g1 = season_totals(y1)
    try:
        pts2, _g2 = season_totals(y2)
    except (OSError, ValueError):
        pts2 = {}
    pos1 = positions_for(y1)

    feats: dict[str, dict] = {}
    for pid, agg in comp1.items():
        pos = pos1.get(pid)
        if pos not in POSITIONS:
            continue
        g = float(games1.get(pid, 0)) or 1.0
        p1 = float(pts1.get(pid, 0.0))
        a = adv1.get(pid, {})
        rows = a.get("_rows", (0.0, 0))[1] or 1

        def _epa_pg(key: str) -> float:
            s, n = a.get(key, (0.0, 0))
            return s / g if n else 0.0

        def _share(key: str) -> float:
            s, _n = a.get(key, (0.0, 0))
            return s / rows

        opp = float(agg.get("tgt", 0.0)) + float(agg.get("rush_att", 0.0)) \
            + float(agg.get("pass_att", 0.0))
        tds = float(agg.get("rec_td", 0.0)) + float(agg.get("rush_td", 0.0)) \
            + float(agg.get("pass_td", 0.0))
        has_y2 = 1.0 if pid in pts2 else 0.0
        feats[pid] = {
            "pos": pos,
            "pts_y1": p1,
            "ppg_y1": p1 / g,
            "games_y1": float(games1.get(pid, 0)),
            "pts_y2": float(pts2.get(pid, 0.0)),
            "has_y2": has_y2,
            "tgt_share_y1": float(agg.get("tgt_share", 0.0)) / g,
            "wopr_y1": _share("wopr"),
            "ay_share_y1": _share("ay_share"),
            "rec_epa_pg": _epa_pg("rec_epa"),
            "rush_epa_pg": _epa_pg("rush_epa"),
            "pass_epa_pg": _epa_pg("pass_epa"),
            "opp_pg": opp / g,
            "td_per_opp": (tds / opp) if opp > 0 else 0.0,
        }
    diag = {"feature_season": y1, "second_prior_season": y2,
            "players_with_prior_row": len(feats)}
    return feats, diag


# ── DESIGN MATRIX ───────────────────────────────────────────────────────────

def zscore_within_position(rows: list[dict]) -> np.ndarray:
    """PREREG § 3: features z-scored within (position, SEASON) — the season half
    matters, because a training set spanning three seasons would otherwise carry
    season-level drift into the fit. A zero-variance column inside a cell becomes
    exactly 0, never NaN."""
    x = np.array([[float(r[f]) for f in FEATURES] for r in rows], dtype=float)
    out = np.zeros_like(x)
    cells = np.array([f"{r['pos']}|{r.get('season', 0)}" for r in rows])
    for cell in sorted(set(cells)):
        m = cells == cell
        if not m.any():
            continue
        block = x[m]
        mu = block.mean(axis=0)
        sd = block.std(axis=0)
        sd[sd < 1e-9] = np.inf          # -> z = 0 for a constant column
        out[m] = (block - mu) / sd
    return out


def position_dummies(rows: list[dict]) -> np.ndarray:
    """QB is the base level; three shift columns."""
    d = np.zeros((len(rows), 3), dtype=float)
    for i, r in enumerate(rows):
        for j, pos in enumerate(("RB", "WR", "TE")):
            if r["pos"] == pos:
                d[i, j] = 1.0
    return d


# ── PROPORTIONAL-ODDS ORDINAL LOGISTIC ──────────────────────────────────────

def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -60.0, 60.0)))


def _unpack(theta_raw: np.ndarray) -> np.ndarray:
    """(t0, a1, a2) -> ordered cutpoints, by construction."""
    t0 = theta_raw[0]
    return np.array([t0, t0 + np.exp(theta_raw[1]),
                     t0 + np.exp(theta_raw[1]) + np.exp(theta_raw[2])])


def _nll_and_grad(params: np.ndarray, x: np.ndarray, y: np.ndarray,
                  n_pen: int, lam: float) -> tuple[float, np.ndarray]:
    theta_raw, beta = params[:3], params[3:]
    cuts = _unpack(theta_raw)
    eta = x @ beta
    s = _sigmoid(cuts[None, :] - eta[:, None])          # (n, 3)
    ds = s * (1.0 - s)
    n = len(y)
    p = np.empty(n)
    dp_dcut = np.zeros((n, 3))
    dp_deta = np.zeros(n)
    m0, m1, m2, m3 = (y == 0), (y == 1), (y == 2), (y == 3)
    p[m0] = s[m0, 0]
    dp_dcut[m0, 0] = ds[m0, 0]
    dp_deta[m0] = -ds[m0, 0]
    p[m1] = s[m1, 1] - s[m1, 0]
    dp_dcut[m1, 1] = ds[m1, 1]
    dp_dcut[m1, 0] = -ds[m1, 0]
    dp_deta[m1] = -(ds[m1, 1] - ds[m1, 0])
    p[m2] = s[m2, 2] - s[m2, 1]
    dp_dcut[m2, 2] = ds[m2, 2]
    dp_dcut[m2, 1] = -ds[m2, 1]
    dp_deta[m2] = -(ds[m2, 2] - ds[m2, 1])
    p[m3] = 1.0 - s[m3, 2]
    dp_dcut[m3, 2] = -ds[m3, 2]
    dp_deta[m3] = ds[m3, 2]

    p = np.clip(p, 1e-12, 1.0)
    nll = float(-np.log(p).sum() + 0.5 * lam * float(beta[:n_pen] @ beta[:n_pen]))

    w = -1.0 / p
    g_cut = (dp_dcut * w[:, None]).sum(axis=0)
    g_eta = dp_deta * w
    g_beta = x.T @ g_eta
    g_beta[:n_pen] += lam * beta[:n_pen]
    # chain through the ordered parameterization
    g_raw = np.array([
        g_cut.sum(),
        (g_cut[1] + g_cut[2]) * np.exp(theta_raw[1]),
        g_cut[2] * np.exp(theta_raw[2]),
    ])
    return nll, np.concatenate([g_raw, g_beta])


def fit_ordinal(x: np.ndarray, y: np.ndarray, n_penalized: int,
                lam: float = RIDGE_LAMBDA, iters: int = 4000) -> np.ndarray:
    """Deterministic gradient descent with an adaptive step. No randomness, no
    tuning: lam and iters are fixed in the preregistration."""
    params = np.zeros(3 + x.shape[1])
    params[0] = -1.0
    params[1] = 0.0
    params[2] = 0.0
    step = 1e-3
    nll, grad = _nll_and_grad(params, x, y, n_penalized, lam)
    for _ in range(iters):
        trial = params - step * grad
        t_nll, t_grad = _nll_and_grad(trial, x, y, n_penalized, lam)
        if t_nll < nll:
            params, nll, grad = trial, t_nll, t_grad
            step *= 1.15
        else:
            step *= 0.5
            if step < 1e-14:
                break
    return params


def predict_proba(params: np.ndarray, x: np.ndarray) -> np.ndarray:
    cuts = _unpack(params[:3])
    eta = x @ params[3:]
    s = _sigmoid(cuts[None, :] - eta[:, None])
    p = np.empty((len(eta), 4))
    p[:, 0] = s[:, 0]
    p[:, 1] = s[:, 1] - s[:, 0]
    p[:, 2] = s[:, 2] - s[:, 1]
    p[:, 3] = 1.0 - s[:, 2]
    return np.clip(p, 1e-12, 1.0)


# ── SMALL STATS HELPERS (no scipy in this repo) ─────────────────────────────

def spearman(a, b) -> float:
    """Tie-averaged rank correlation."""
    n = len(a)
    if n < 3:
        return float("nan")

    def ranks(v):
        order = sorted(range(n), key=lambda i: v[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1.0
            for t in range(i, j + 1):
                r[order[t]] = avg
            i = j + 1
        return r

    ra, rb = ranks(list(a)), ranks(list(b))
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    da = math.sqrt(sum((ra[i] - ma) ** 2 for i in range(n)))
    db = math.sqrt(sum((rb[i] - mb) ** 2 for i in range(n)))
    return float(num / (da * db)) if da > 0 and db > 0 else float("nan")


def wilson(k: int, n: int, z: float = 1.6449) -> tuple[float, float]:
    """Wilson interval; z = 1.6449 is the 90% two-sided level."""
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1.0 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


# ── THE EXPERIMENT ──────────────────────────────────────────────────────────

def _rows_for_season(season: int, k_slots: dict, survivorship_zero: bool):
    """The population for one test season plus everything needed to grade it."""
    feats, fdiag = features_for(season)
    labels, ldiag = tier_labels(season, k_slots)
    totals_y, _games_y = season_totals(season)

    rows, excluded_no_season_row = [], 0
    for pid, f in feats.items():
        if pid not in totals_y:
            excluded_no_season_row += 1
            if not survivorship_zero:
                continue
            realized = 0.0
            tier = 0
        else:
            realized = float(totals_y[pid])
            if pid not in labels:
                continue
            tier = labels[pid]
        r = dict(f)
        r["pid"] = pid
        r["season"] = season
        r["realized"] = realized
        r["tier"] = tier
        rows.append(r)
    diag = dict(fdiag)
    diag.update(ldiag)
    diag["excluded_no_season_row"] = excluded_no_season_row
    diag["population"] = len(rows)
    return rows, diag


def _market(season: int) -> dict:
    """{pid: pick_no} from the league's own completed draft. A missing draft is
    a refusal, never a zero."""
    doc = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    for s in doc["seasons"]:
        if str(s.get("season")) != str(season):
            continue
        drafts = [d for d in s.get("drafts", []) if d.get("status") == "complete"]
        if not drafts:
            return {}
        best = max(drafts, key=lambda d: len(d.get("picks", [])))
        return {str(p["player_id"]): int(p["pick_no"]) for p in best["picks"]}
    return {}


def _replacement_y1(season: int, k_slots: dict) -> dict:
    """The K-th ranked realized total at each position in season Y-1 — the
    leak-free positional offset both the forecast and the truth are measured
    against when ranking across positions."""
    totals, _g = season_totals(season - 1)
    pos_map = positions_for(season - 1)
    out = {}
    for pos in POSITIONS:
        vals = sorted((t for pid, t in totals.items() if pos_map.get(pid) == pos),
                      reverse=True)
        k = k_slots[pos]
        out[pos] = float(vals[k - 1]) if len(vals) >= k else (float(vals[-1]) if vals else 0.0)
    return out


def _baseline_scores(rows: list[dict], market: dict) -> dict:
    """{model: [score per row]}. Higher is better for every model."""
    naive = [r["pts_y1"] for r in rows]
    w1, w2 = RECENCY_WEIGHTS
    blend = [w1 * r["pts_y1"] + w2 * r["pts_y2"] if r["has_y2"] else r["pts_y1"]
             for r in rows]
    # market: earlier pick is better; undrafted ranks behind every drafted man
    mk = []
    for r in rows:
        pick = market.get(r["pid"])
        mk.append(-float(pick) if pick is not None else -999.0)
    return {"naive_prev": naive, "recency_blend": blend, "market": mk}


def own_v6_predictions(season: int) -> tuple[dict | None, str]:
    """own_v6's season forecast, rebuilt from ITS OWN committed modules — no
    reimplementation here, every call is A-lane code.

    Returns (None, reason) whenever it cannot be built, which is the normal case
    for 2023 and 2024: v6's chain needs two prior weekly-points stores and
    2021/2022 have none. Never substituted with something else.
    """
    if season != 2025:
        return None, ("unavailable — own_v6 needs two prior weekly-points "
                      "stores; only 2023+2024 exist, so 2025 is its only "
                      "buildable season")
    try:
        import own_model_v6 as V6
        from own_model_v2 import (board_ages, features_for as v2_features,
                                  fit_transition, predict, _baselines)
        from model_accuracy_backtest import season_totals as mab_totals, positions_record
        from own_model_v3 import (build_v3, league_draft_picks, market_ranks,
                                  rank_curve)
        from own_model_v4 import (build_v4, qb_active_games,
                                  qb_availability_correction, weekly_points)
        import fetch_component_stats as FCS
        import own_model_v5 as V5
    except ImportError as exc:
        return None, f"unavailable — own-model modules not on this tree ({exc})"
    try:
        positions = positions_record()
        ages = board_ages()
        fits = fit_transition(v2_features(2024, (2023,), positions, ages),
                              mab_totals(2024)[0])
        v2 = predict(v2_features(2025, (2023, 2024), positions, ages), fits)
        blend = _baselines(2025, (2023, 2024))["recency_blend"]
        picks = league_draft_picks(2025)
        curve = rank_curve(2024, positions)
        mrank = market_ranks(picks, positions)
        v3 = build_v3(v2, blend, mrank, curve, positions)
        corr, _mu = qb_availability_correction(
            qb_active_games(weekly_points(2024), positions))
        v4 = build_v4(v3, blend, corr, positions)
        comp = V5.comp_opinion(2025, (2023, 2024), positions, ages,
                               FCS.implied_team_totals(2025, 1, 1))
        v5 = V5.build_v5(v3, comp, blend, corr, mrank, curve, positions)
        return V6.build_v6(v4, v5, positions), "rebuilt from own_model_v6.build_v6"
    except (OSError, ValueError, KeyError, AssertionError) as exc:
        return None, f"unavailable — own_v6 chain refused ({exc})"


def _tier_means(train_rows: list[dict]) -> dict:
    """m_k per (position, tier) from TRAINING seasons only."""
    acc: dict[tuple, list] = {}
    for r in train_rows:
        acc.setdefault((r["pos"], r["tier"]), []).append(r["realized"])
    out = {}
    for pos in POSITIONS:
        pos_all = [r["realized"] for r in train_rows if r["pos"] == pos]
        fallback = sum(pos_all) / len(pos_all) if pos_all else 0.0
        for t in range(4):
            vals = acc.get((pos, t), [])
            out[f"{pos}|{t}"] = sum(vals) / len(vals) if vals else fallback
    return out


def _precision_at(pred_scores, truth_scores, n: int) -> float:
    idx = sorted(range(len(pred_scores)), key=lambda i: -pred_scores[i])[:n]
    true_idx = set(sorted(range(len(truth_scores)), key=lambda i: -truth_scores[i])[:n])
    if not idx:
        return float("nan")
    return len([i for i in idx if i in true_idx]) / float(len(idx))


def _hits_at(scores, is_winner, k: int) -> int:
    idx = sorted(range(len(scores)), key=lambda i: -scores[i])[:k]
    return int(sum(1 for i in idx if is_winner[i]))


def _hits_summed(by_season: dict, name: str, k: int) -> int:
    """Sum over seasons of hits@k inside THAT season's cell.

    A drafter drafts once a season, so a single ranking pooled across three
    seasons is not a decision anyone makes — it silently concentrates the top-k
    on whichever season the model was most confident in. The one-list version
    is reported too, marked as such, and the verdict is taken on this one.
    """
    total = 0
    for y in sorted(by_season):
        cell = by_season[y]
        if name not in cell["scores"]:
            continue
        total += _hits_at(cell["scores"][name], cell["is_winner"], k)
    return total


def _bootstrap_diff_summed(by_season: dict, name_a: str, name_b: str, k: int,
                           draws=BOOTSTRAP_DRAWS):
    """Paired bootstrap of (summed hits@k of A) − (summed hits@k of B),
    resampling players WITHIN each season and re-ranking inside it."""
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    seasons = sorted(by_season)
    prepped = []
    for y in seasons:
        cell = by_season[y]
        if name_a not in cell["scores"] or name_b not in cell["scores"]:
            continue
        prepped.append((np.asarray(cell["scores"][name_a], dtype=float),
                        np.asarray(cell["scores"][name_b], dtype=float),
                        np.asarray(cell["is_winner"], dtype=bool)))
    if not prepped:
        return {"status": "unmeasurable"}
    diffs = np.zeros(draws)
    for d in range(draws):
        tot = 0.0
        for a, b, wnr in prepped:
            n = len(wnr)
            idx = rng.integers(0, n, n)
            aa, bb, ww = a[idx], b[idx], wnr[idx]
            tot += ww[np.argsort(-aa, kind="stable")[:k]].sum()
            tot -= ww[np.argsort(-bb, kind="stable")[:k]].sum()
        diffs[d] = tot
    lo, hi = np.percentile(diffs, [5.0, 95.0])
    return {"status": "measured", "mean_diff": round(float(diffs.mean()), 3),
            "ci90": [float(lo), float(hi)],
            "excludes_zero": bool(lo > 0 or hi < 0)}


def run(k_slots: dict | None = None, survivorship_zero: bool = False) -> dict:
    k_slots = k_slots or K_SLOTS
    gate = verify_derivation()

    seasons: dict[int, dict] = {}
    diags: dict[int, dict] = {}
    for y in (2022,) + TEST_SEASONS:
        rows, diag = _rows_for_season(y, k_slots, survivorship_zero)
        seasons[y] = rows
        diags[y] = diag

    per_season = {}
    all_test_rows, all_probs = [], []
    late_by_season: dict[int, dict] = {}
    wide_by_season: dict[int, dict] = {}
    v6_status: dict[str, str] = {}
    for y in TEST_SEASONS:
        train_years = [t for t in (2022, 2023, 2024) if t < y]
        assert_walk_forward(train_years, y)
        train = [r for t in train_years for r in seasons[t]]
        test = seasons[y]
        if len(train) < 50 or len(test) < 50:
            per_season[y] = {"status": "unmeasurable", "n_train": len(train),
                             "n_test": len(test)}
            continue

        xtr = np.hstack([zscore_within_position(train), position_dummies(train)])
        xte = np.hstack([zscore_within_position(test), position_dummies(test)])
        ytr = np.array([r["tier"] for r in train])
        params = fit_ordinal(xtr, ytr, n_penalized=len(FEATURES))
        probs = predict_proba(params, xte)

        means = _tier_means(train)
        exp_pts = np.array([sum(probs[i, t] * means[f"{r['pos']}|{t}"] for t in range(4))
                            for i, r in enumerate(test)])

        market = _market(y)
        base = _baseline_scores(test, market)
        base["tiered_expected_points"] = list(exp_pts)
        base["tiered_p_league_winner"] = list(probs[:, LEAGUE_WINNER])
        v6_pred, v6_reason = own_v6_predictions(y)
        v6_status[str(y)] = v6_reason
        v6_missing = 0
        if v6_pred is not None:
            col = []
            for r in test:
                v = v6_pred.get(r["pid"])
                if v is None:
                    v6_missing += 1
                    col.append(-1e9)      # no forecast ranks last, and is counted
                else:
                    col.append(float(v))
            base["own_v6"] = col
            v6_status[str(y)] = (f"{v6_reason}; covers {len(test) - v6_missing} "
                                 f"of {len(test)} graded players, "
                                 f"{v6_missing} without a forecast ranked last")

        realized = [r["realized"] for r in test]
        # 1. ordering, within position
        ordering = {}
        for name, sc in base.items():
            cells = {}
            for pos in POSITIONS:
                # a MISSING forecast (own_v6 sentinel) is dropped, never scored
                # as an opinion; the market's "undrafted" IS an opinion and stays
                idx = [i for i, r in enumerate(test)
                       if r["pos"] == pos and sc[i] > -1e8]
                cells[pos] = (round(spearman([sc[i] for i in idx],
                                             [realized[i] for i in idx]), 4)
                              if len(idx) >= 10 else None)
            ordering[name] = cells

        # 2. draftable region, on VORP so positions are comparable
        repl = _replacement_y1(y, k_slots)
        truth_vorp = [realized[i] - repl[test[i]["pos"]] for i in range(len(test))]
        precision = {}
        for name, sc in base.items():
            if name in ("market", "tiered_p_league_winner"):
                pv = sc      # already a cross-position ordering, not points
            else:
                pv = [sc[i] - repl[test[i]["pos"]] if sc[i] > -1e8 else sc[i]
                      for i in range(len(test))]
            precision[name] = {f"top{n}": round(_precision_at(pv, truth_vorp, n), 4)
                               for n in (12, 24, 48)}

        # 3. THE KEY CELL — late rounds
        late_idx = [i for i, r in enumerate(test)
                    if market.get(r["pid"]) is not None
                    and market[r["pid"]] >= LATE_ROUND_FIRST_PICK]
        late = {"n": len(late_idx),
                "n_true_league_winners": int(sum(1 for i in late_idx
                                                 if test[i]["tier"] == LEAGUE_WINNER))}
        is_w = [test[i]["tier"] == LEAGUE_WINNER for i in late_idx]
        late_by_season[y] = {"is_winner": is_w,
                             "scores": {n: [s[i] for i in late_idx]
                                        for n, s in base.items()}}
        if len(late_idx) >= 20:
            for name, sc in base.items():
                late[name] = {f"hits_at_{k}": _hits_at([sc[i] for i in late_idx], is_w, k)
                              for k in (10, 20)}
        # 3b. the same cell widened to every undrafted player in the population
        wide_idx = [i for i, r in enumerate(test)
                    if market.get(r["pid"]) is None
                    or market[r["pid"]] >= LATE_ROUND_FIRST_PICK]
        wide_by_season[y] = {
            "is_winner": [test[i]["tier"] == LEAGUE_WINNER for i in wide_idx],
            "scores": {n: [s[i] for i in wide_idx] for n, s in base.items()
                       if n != "market"},   # undrafted players all tie: no order
        }
        per_season[y] = {
            "status": "measured",
            "n_train": len(train), "n_test": len(test),
            "train_seasons": train_years,
            "tier_counts_test": {TIERS[t]: int(sum(1 for r in test if r["tier"] == t))
                                 for t in range(4)},
            "ordering_spearman_within_position": ordering,
            "draftable_region_precision_on_vorp": precision,
            "late_round_cell": late,
        }
        for i, r in enumerate(test):
            rec = dict(r)
            rec["p_league_winner"] = float(probs[i, LEAGUE_WINNER])
            rec["expected_points"] = float(exp_pts[i])
            rec["market_pick"] = market.get(r["pid"])
            rec["naive_prev"] = r["pts_y1"]
            rec["recency_blend"] = (RECENCY_WEIGHTS[0] * r["pts_y1"]
                                    + RECENCY_WEIGHTS[1] * r["pts_y2"]
                                    if r["has_y2"] else r["pts_y1"])
            all_test_rows.append(rec)
            all_probs.append(probs[i])

    pooled = _pooled(all_test_rows, late_by_season, wide_by_season)
    return {
        "_territory": "TERRITORY: C — produced by draft/backtest/tiered_outcome_model.py",
        "_note": ("Tiered outcome model. Preregistered in "
                  "draft/backtest/TIERED-OUTCOME-PREREG.md, committed FIRST. "
                  "OpenFPL's four names are evaluation strata on the realized "
                  "outcome, not predicted classes — predicting the "
                  "distribution is our step, not theirs."),
        "preregistration": "draft/backtest/TIERED-OUTCOME-PREREG.md",
        "arm": {"k_slots": k_slots, "survivorship_zero": survivorship_zero},
        "derivation_gate": gate,
        "scoring_fingerprints": _fingerprints(),
        "label_sources": {**{str(y): "weekly points store" for y in STORE_LABEL_SEASONS},
                          **{str(y): "derived from component_stats (gated)"
                             for y in DERIVED_LABEL_SEASONS}},
        "population_diagnostics": {str(y): diags[y] for y in sorted(diags)},
        "per_season": {str(y): per_season[y] for y in sorted(per_season)},
        "pooled": pooled,
        "baselines_unavailable": {
            "sleeper": ("UNMEASURABLE — no pre-2026 Sleeper or FantasyPros "
                        "projection was ever archived (proj_series.json starts "
                        "2026-08-09) and a retroactive fetch leaks (exp33)."),
            "own_v6": v6_status,
        },
    }


def _pooled(rows: list[dict], late_by_season: dict, wide_by_season: dict) -> dict:
    if not rows:
        return {"status": "unmeasurable"}
    realized = [r["realized"] for r in rows]
    p_lw = [r["p_league_winner"] for r in rows]
    exp_pts = [r["expected_points"] for r in rows]
    is_w = [r["tier"] == LEAGUE_WINNER for r in rows]

    # 4. calibration of P(LEAGUE-WINNER)
    buckets = []
    for lo, hi in zip(CALIBRATION_EDGES[:-1], CALIBRATION_EDGES[1:]):
        idx = [i for i, p in enumerate(p_lw) if lo <= p < hi]
        if not idx:
            buckets.append({"bucket": f"[{lo:.2f},{hi:.2f})", "n": 0})
            continue
        k = sum(1 for i in idx if is_w[i])
        obs = k / len(idx)
        pred = sum(p_lw[i] for i in idx) / len(idx)
        w_lo, w_hi = wilson(k, len(idx))
        buckets.append({
            "bucket": f"[{lo:.2f},{hi:.2f})", "n": len(idx),
            "mean_predicted": round(pred, 4), "observed": round(obs, 4),
            "observed_ci90": [round(w_lo, 4), round(w_hi, 4)],
            "predicted_inside_observed_ci": bool(w_lo <= pred <= w_hi),
        })
    measured = [b for b in buckets if b["n"] > 0]
    misses = sum(1 for b in measured if not b["predicted_inside_observed_ci"])

    # 5. the honest null — is P(top tier) just the mean re-expressed?
    redundancy = {}
    for name in ("recency_blend", "naive_prev", "expected_points"):
        cells = {}
        for pos in POSITIONS:
            idx = [i for i, r in enumerate(rows) if r["pos"] == pos]
            if len(idx) < 10:
                cells[pos] = None
                continue
            key = name if name != "expected_points" else "expected_points"
            cells[pos] = round(spearman([p_lw[i] for i in idx],
                                        [rows[i][key] for i in idx]), 4)
        vals = [v for v in cells.values() if v is not None]
        cells["pooled_min_abs"] = round(min(abs(v) for v in vals), 4) if vals else None
        cells["pooled_mean"] = round(sum(vals) / len(vals), 4) if vals else None
        redundancy[name] = cells

    # 3b. THE KEY CELL, summed over test seasons (a drafter drafts once a year)
    late_cell = _late_cell(late_by_season, rows,
                           lambda r: (r.get("market_pick") is not None
                                      and r["market_pick"] >= LATE_ROUND_FIRST_PICK))
    wide_cell = _late_cell(wide_by_season, rows,
                           lambda r: (r.get("market_pick") is None
                                      or r["market_pick"] >= LATE_ROUND_FIRST_PICK),
                           one_list=False)

    return {
        "n_graded_player_seasons": len(rows),
        "overall_spearman_within_position_expected_points": {
            pos: (round(spearman([exp_pts[i] for i, r in enumerate(rows) if r["pos"] == pos],
                                 [realized[i] for i, r in enumerate(rows) if r["pos"] == pos]), 4)
                  if sum(1 for r in rows if r["pos"] == pos) >= 10 else None)
            for pos in POSITIONS},
        "calibration_p_league_winner": {
            "buckets": buckets,
            "buckets_missing_their_interval": misses,
            "verdict": ("MISCALIBRATED" if misses >= 2 else "calibration bar met"),
        },
        "late_round_cell": late_cell,
        "late_round_cell_widened_to_undrafted": wide_cell,
        "redundancy_vs_mean": redundancy,
        "verdict": _verdict(late_cell, redundancy, misses),
    }


def _verdict(late_cell: dict, redundancy: dict, calibration_misses: int) -> dict:
    """The preregistered bar, applied mechanically. No judgement here — every
    threshold is quoted from TIERED-OUTCOME-PREREG.md § 7."""
    p_lw = late_cell.get("tiered_p_league_winner", {}).get("hits_at_10")
    rivals = {n: late_cell[n]["hits_at_10"] for n in MEAN_BASELINE_NAMES
              if n in late_cell and isinstance(late_cell[n], dict)
              and len(late_cell[n].get("seasons_contributing", [])) == 3}
    boot = (late_cell.get("bootstrap_p_lw_minus_best_mean") or {}).get("k10", {})
    beats_all = bool(rivals) and p_lw is not None and all(p_lw > v for v in rivals.values())
    confirmed = beats_all and bool(boot.get("excludes_zero")) and boot.get("mean_diff", 0) > 0

    rho = {n: redundancy[n].get("pooled_mean") for n in redundancy}
    redundant = any(v is not None and v >= 0.95 for v in rho.values())

    if calibration_misses >= 2:
        headline = "MISCALIBRATED"
    elif confirmed:
        headline = "CONFIRMED"
    elif redundant:
        headline = "REDUNDANT"
    else:
        headline = "NULL"
    return {
        "headline": headline,
        "cory_thesis_confirmed": bool(confirmed),
        "late_round_hits_at_10": {"tiered_p_league_winner": p_lw, **rivals},
        "beats_every_mean_baseline_at_10": beats_all,
        "bootstrap_excludes_zero": bool(boot.get("excludes_zero")),
        "redundancy_pooled_mean_spearman": rho,
        "redundant_at_the_0_95_bar": redundant,
        "calibration_buckets_missing_their_interval": calibration_misses,
        "reading": ("headline is taken in the preregistered order: "
                    "MISCALIBRATED leads if >=2 of 5 reliability buckets miss, "
                    "then CONFIRMED, then REDUNDANT, then NULL"),
    }


MEAN_BASELINE_NAMES = ("tiered_expected_points", "recency_blend", "naive_prev",
                       "market", "own_v6")


def _late_cell(by_season: dict, rows: list[dict], keep, one_list: bool = True) -> dict:
    """The late-round cell: hits@k summed over seasons, the winner among the
    mean baselines, and a paired bootstrap of P(LEAGUE-WINNER) against it."""
    members = [r for r in rows if keep(r)]
    n_w = int(sum(1 for r in members if r["tier"] == LEAGUE_WINNER))
    cell = {"n": len(members), "n_true_league_winners": n_w,
            "base_rate": round(n_w / len(members), 4) if members else None,
            "per_season_n": {str(y): len(by_season[y]["is_winner"])
                             for y in sorted(by_season)},
            "per_season_true_league_winners": {str(y): int(sum(by_season[y]["is_winner"]))
                                               for y in sorted(by_season)}}
    if not by_season:
        return cell
    names = sorted({n for y in by_season for n in by_season[y]["scores"]})
    for name in names:
        contributing = [y for y in sorted(by_season) if name in by_season[y]["scores"]]
        cell[name] = {f"hits_at_{k}": _hits_summed(by_season, name, k)
                      for k in (10, 20)}
        # own_v6 exists for 2025 alone, so its hits are a ONE-season sum and are
        # NOT comparable to a three-season sum. The field says so in the artifact
        # rather than leaving a reader to notice.
        cell[name]["seasons_contributing"] = contributing
        cell[name]["chance_expectation_at_10"] = round(
            sum(10.0 * sum(by_season[y]["is_winner"]) / len(by_season[y]["is_winner"])
                for y in contributing if by_season[y]["is_winner"]), 2)
    present_means = [n for n in MEAN_BASELINE_NAMES if n in names
                     and len(cell[n]["seasons_contributing"]) == len(by_season)]
    if not present_means:
        return cell
    best = max(present_means, key=lambda n: (cell[n]["hits_at_10"], n))
    cell["best_mean_baseline_at_10"] = best
    cell["bootstrap_p_lw_minus_best_mean"] = {
        f"k{k}": _bootstrap_diff_summed(by_season, "tiered_p_league_winner", best, k)
        for k in (10, 20)}
    cell["chance_expectation_at_10"] = (
        round(sum(len(by_season[y]["is_winner"]) and
                  10.0 * sum(by_season[y]["is_winner"]) / len(by_season[y]["is_winner"])
                  for y in by_season), 2))
    if one_list:
        # the alternative reading of "pooled", reported so the choice is visible
        merged = {"is_winner": [w for y in sorted(by_season)
                                for w in by_season[y]["is_winner"]]}
        merged["scores"] = {}
        for name in names:
            merged["scores"][name] = [s for y in sorted(by_season)
                                      for s in by_season[y]["scores"].get(name, [])]
        cell["one_list_across_seasons_not_used_for_the_verdict"] = {
            name: {f"hits_at_{k}": _hits_at(merged["scores"][name],
                                            merged["is_winner"], k)
                   for k in (10, 20)}
            for name in names if len(merged["scores"][name]) == len(merged["is_winner"])}
    return cell


def main() -> None:
    doc = run()
    doc["sensitivity_S2_dedicated_slots_only"] = _sensitivity(K_SLOTS_DEDICATED_ONLY, False)
    doc["sensitivity_S1_survivorship_absent_as_zero"] = _sensitivity(K_SLOTS, True)
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    p = doc["pooled"]
    print("late-round cell:", json.dumps(p.get("late_round_cell", {}), indent=1)[:1200])
    print("calibration:", p["calibration_p_league_winner"]["verdict"])


def _sensitivity(k_slots: dict, survivorship_zero: bool) -> dict:
    d = run(k_slots=k_slots, survivorship_zero=survivorship_zero)
    return {"arm": d["arm"], "pooled": d["pooled"]}


if __name__ == "__main__":
    main()
