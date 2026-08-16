# TERRITORY: A
"""PLAYER-WEEK PROJECTION SKILL — the shipped projector's known skill at ship time.

WHAT THIS VALIDATES. src/weekly_player_projection.js ships arm 'ours': a
strictly-prior per-player weekly expectation — the board's season projection on
a per-week basis, pulled toward the player's own in-season realized mean as
weeks accumulate (prior weighted as 3 pseudo-weeks; below is the same
arithmetic in Python). Before it emits a single live forecast, this script
measures that construction against the committed 2023/2024 weekly stores
(realized points under OUR scoring), under exp_weekly_env's eval protocol:
every input for week w computed from weeks < w of the same season; MAE / bias /
within-week Spearman, per position.

COMMITTED DATA ONLY — no egress. The stores are
draft/backtest/nflverse_weekly_points_{2023,2024}.json (Sleeper-id keyed,
scored with our table at capture time, fingerprint-stamped) and
draft/data/player_positions.json.

THE PRIOR STAND-IN, STATED. Production's prior is the board's proj_mean/17 —
no committed board exists for 2023/2024, so the historical prior is rebuilt
the way lab_projections.walk_forward builds era-honest projections: the PRIOR
season's per-game rate, regressed 0.35 toward the positional mean (its
REGRESSION_WEIGHT), availability-discounted by 15.5/17 (its EXPECTED_GAMES).
2024's prior comes from the 2023 store; 2023 has no committed 2022 store, so
2023 validates the realized-mean regime only and SAYS SO in the output. This
is a stand-in of the same species as the production prior, not the production
prior itself — the number it yields is the projector's plausible skill, and
the live loop's grading is what measures the real thing.

CROSS-CHECK. The pure running-mean baseline here must land near
exp_weekly_env.json's committed baseline (2023 MAE 5.67 n=2179, 2024 MAE 5.74
n=2259) — same protocol, different pipeline (their frames vs our stores). A
large gap means the stores and the experiment disagree about reality and the
verdict below cannot be trusted.

K IS DECLARED, NOT TUNED: 3 pseudo-weeks, fixed before this ran (it mirrors
exp_weekly_env's MIN_PRIOR_APPEARANCES). The K sweep below MEASURES the
choice's cost; it does not install a different one.

Run: python3 draft/backtest/player_week_projection_skill.py
Writes draft/backtest/player_week_projection_skill.json.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Shipped constants (src/weekly_player_projection.js — keep in lockstep).
PRIOR_PSEUDO_WEEKS = 3
MIN_REALIZED_ONLY = 3
# exp_weekly_env eval protocol (its preregistered constants, reused).
FIRST_EVAL_WEEK = 5
LAST_EVAL_WEEK = 18
MIN_PRIOR_APPEARANCES = 3
RELEVANCE_FLOOR = 5.0
# lab_projections CFG constants for the historical prior stand-in.
REGRESSION_WEIGHT = 0.35
EXPECTED_GAMES = 15.5
MIN_GAMES_FOR_RATE = 4
SEASON_LENGTH = 17
POSITIONS = ("QB", "RB", "WR", "TE")
K_SWEEP = (2, 3, 4)


def load_store(season: int) -> dict:
    """{week: {player_id: points}} for regular-season weeks 1..18."""
    p = HERE / f"nflverse_weekly_points_{season}.json"
    d = json.loads(p.read_text())
    return {int(w["week"]): {str(k): float(v) for k, v in w["points"].items()}
            for w in d["weeks"] if 1 <= int(w["week"]) <= LAST_EVAL_WEEK}


def load_positions() -> dict:
    d = json.loads((HERE.parent / "data" / "player_positions.json").read_text())
    return {str(k): v for k, v in d["positions"].items()}


# ── strictly-prior features ──────────────────────────────────────────────────

def appearances_before(weeks: dict, pid: str, week: int, include_zero: bool) -> list:
    """The player's appearance points in weeks < week. A store row IS an
    appearance (nflverse emits rows only for games played); include_zero=True
    is exp_weekly_env parity, False is the shipped live-feed rule (a live 0.0
    is DNP-indistinguishable, so production drops it — measured both ways)."""
    out = []
    for w in sorted(weeks):
        if w >= week:
            break
        pts = weeks[w].get(pid)
        if pts is None:
            continue
        if pts == 0.0 and not include_zero:
            continue
        out.append(pts)
    return out


def season_prior(prior_weeks: dict, positions: dict) -> dict:
    """{pid: per-week prior} from the PRIOR season's store — walk_forward-lite:
    per-game rate over that season's appearances, regressed toward the
    positional mean, discounted by expected availability."""
    rates, games = {}, {}
    for pid in {p for wk in prior_weeks.values() for p in wk}:
        pts = [prior_weeks[w][pid] for w in prior_weeks if pid in prior_weeks[w]]
        if not pts:
            continue
        rates[pid] = sum(pts) / len(pts)
        games[pid] = len(pts)
    by_pos: dict = {}
    for pid, r in rates.items():
        pos = positions.get(pid)
        if pos in POSITIONS and games[pid] >= MIN_GAMES_FOR_RATE:
            by_pos.setdefault(pos, []).append(r)
    baseline = {p: sum(v) / len(v) for p, v in by_pos.items()}
    out = {}
    for pid, rate in rates.items():
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        base = baseline.get(pos, 0.0)
        trust = min(1.0, games[pid] / (MIN_GAMES_FOR_RATE * 2.0))
        own = trust * rate + (1 - trust) * base
        regressed = (1 - REGRESSION_WEIGHT) * own + REGRESSION_WEIGHT * base
        out[pid] = regressed * (EXPECTED_GAMES / SEASON_LENGTH)
    return out


def blend(prior_pw, realized, k=PRIOR_PSEUDO_WEEKS):
    """The shipped arithmetic: prior as k pseudo-weeks, realized as itself.
    Returns None where the shipped module refuses (absent)."""
    n = len(realized)
    if prior_pw is not None:
        return (k * prior_pw + sum(realized)) / (k + n)
    if n >= MIN_REALIZED_ONLY:
        return sum(realized) / n
    return None


# ── metrics ──────────────────────────────────────────────────────────────────

def spearman(a, b):
    if len(a) < 3:
        return None

    def rank(vals):
        order = sorted(range(len(vals)), key=lambda i: vals[i])
        ranks = [0.0] * len(vals)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1.0
            for t in range(i, j + 1):
                ranks[order[t]] = avg
            i = j + 1
        return ranks

    ra, rb = rank(a), rank(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    da = math.sqrt(sum((x - ma) ** 2 for x in ra))
    db = math.sqrt(sum((y - mb) ** 2 for y in rb))
    return num / (da * db) if da and db else None


def metrics(rows):
    """rows: [(pred, actual, pos, week)] -> overall + per-position table."""
    def agg(sub):
        if not sub:
            return {"n": 0, "mae": None, "bias": None, "spearman_weekly": None}
        errs = [p - a for p, a, *_ in sub]
        by_week: dict = {}
        for p, a, _pos, w in sub:
            by_week.setdefault(w, []).append((p, a))
        sps = [s for s in (spearman([p for p, _ in v], [a for _, a in v])
                           for v in by_week.values()) if s is not None]
        return {
            "n": len(sub),
            "mae": round(sum(abs(e) for e in errs) / len(errs), 4),
            "bias": round(sum(errs) / len(errs), 4),
            "spearman_weekly": round(sum(sps) / len(sps), 4) if sps else None,
        }

    out = {"overall": agg(rows)}
    for pos in POSITIONS:
        out[pos] = agg([r for r in rows if r[2] == pos])
    return out


# ── the eval sets ────────────────────────────────────────────────────────────

def eval_running_mean(weeks: dict, positions: dict, include_zero: bool):
    """exp_weekly_env's baseline protocol: weeks 5-18, ≥3 prior appearances,
    prior mean ≥ 5.0, appeared this week. Prediction = prior running mean."""
    rows = []
    for w in range(FIRST_EVAL_WEEK, LAST_EVAL_WEEK + 1):
        for pid, actual in weeks.get(w, {}).items():
            pos = positions.get(pid)
            if pos not in POSITIONS:
                continue
            hist = appearances_before(weeks, pid, w, include_zero)
            if len(hist) < MIN_PRIOR_APPEARANCES:
                continue
            mean = sum(hist) / len(hist)
            if mean < RELEVANCE_FLOOR:
                continue
            rows.append((mean, actual, pos, w))
    return rows


def eval_shipped(weeks: dict, prior_pw: dict, positions: dict,
                 first_week: int, last_week: int, k=PRIOR_PSEUDO_WEEKS):
    """The shipped construction over every player it would price (same
    eligibility as production grading: the player appeared this week, and the
    projector produced a number rather than refusing)."""
    rows, refused = [], 0
    for w in range(first_week, last_week + 1):
        for pid, actual in weeks.get(w, {}).items():
            pos = positions.get(pid)
            if pos not in POSITIONS:
                continue
            hist = appearances_before(weeks, pid, w, include_zero=False)
            pred = blend(prior_pw.get(pid), hist, k)
            if pred is None:
                refused += 1
                continue
            rows.append((pred, actual, pos, w))
    return rows, refused


def main():
    positions = load_positions()
    store23 = load_store(2023)
    store24 = load_store(2024)
    prior24 = season_prior(store23, positions)

    result = {
        "_territory": "TERRITORY: A — research artifact, produced by "
                      "draft/backtest/player_week_projection_skill.py",
        "validates": "src/weekly_player_projection.js arm 'ours' "
                     "(player-week-projection-v1)",
        "protocol": "exp_weekly_env eval semantics: strictly-prior inputs, "
                    "MAE/bias/within-week Spearman vs realized under OUR scoring",
        "prior_stand_in": "2024 prior = 2023 per-game rate regressed 0.35 to "
                          "positional mean x 15.5/17 (lab_projections constants). "
                          "2023 has no committed 2022 store: realized-mean regime only.",
        "cross_check_target": {"2023": {"mae": 5.6729, "n": 2179},
                               "2024": {"mae": 5.7369, "n": 2259},
                               "source": "exp_weekly_env.json committed baseline"},
        "seasons": {},
    }

    for yr, store in (("2023", store23), ("2024", store24)):
        parity = eval_running_mean(store, positions, include_zero=True)
        shipped_hist = eval_running_mean(store, positions, include_zero=False)
        result["seasons"][yr] = {
            "running_mean_parity": metrics(parity),
            "running_mean_zero_excluded": metrics(shipped_hist),
        }

    # APPLES-TO-APPLES: the blend on EXACTLY the running-mean baseline's
    # eligibility set (weeks 5-18, ≥3 prior appearances, prior mean ≥ floor).
    # The full-population number below covers players the baseline refuses
    # (low-relevance, early-week), which are systematically easier — comparing
    # across the two populations would flatter the blend.
    same_set = []
    for w in range(FIRST_EVAL_WEEK, LAST_EVAL_WEEK + 1):
        for pid, actual in store24.get(w, {}).items():
            pos = positions.get(pid)
            if pos not in POSITIONS:
                continue
            hist = appearances_before(store24, pid, w, include_zero=False)
            if len(hist) < MIN_PRIOR_APPEARANCES or sum(hist) / len(hist) < RELEVANCE_FLOOR:
                continue
            pred = blend(prior24.get(pid), hist)
            if pred is None:
                continue
            same_set.append((pred, actual, pos, w))
    result["seasons"]["2024"]["shipped_blend_on_baseline_set"] = metrics(same_set)

    shipped_full, refused = eval_shipped(store24, prior24, positions, 2, LAST_EVAL_WEEK)
    early, early_refused = eval_shipped(store24, prior24, positions, 2, 4)
    result["seasons"]["2024"]["shipped_blend_weeks2_18"] = metrics(shipped_full)
    result["seasons"]["2024"]["shipped_blend_weeks2_18"]["refused_absent"] = refused
    result["seasons"]["2024"]["shipped_blend_weeks2_4"] = metrics(early)
    result["seasons"]["2024"]["shipped_blend_weeks2_4"]["refused_absent"] = early_refused

    # prior-only vs blend on the early weeks: what the pseudo-week weighting buys
    prior_only = [(prior24[pid], a, positions.get(pid), w)
                  for w in range(2, 5) for pid, a in store24.get(w, {}).items()
                  if pid in prior24 and positions.get(pid) in POSITIONS]
    result["seasons"]["2024"]["prior_only_weeks2_4"] = metrics(prior_only)

    sweep = {}
    for k in K_SWEEP:
        rows, _ = eval_shipped(store24, prior24, positions, 2, LAST_EVAL_WEEK, k)
        sweep[str(k)] = {"mae": metrics(rows)["overall"]["mae"], "n": len(rows)}
    result["k_sweep_2024"] = {"declared_k": PRIOR_PSEUDO_WEEKS, "sweep": sweep,
                              "note": "measured, not installed — K stays 3"}

    out = HERE / "player_week_projection_skill.json"
    out.write_text(json.dumps(result, indent=1))
    print(f"wrote {out}\n")
    for yr in ("2023", "2024"):
        s = result["seasons"][yr]
        print(f"{yr} running-mean parity     : n={s['running_mean_parity']['overall']['n']} "
              f"mae={s['running_mean_parity']['overall']['mae']}")
    ab = result["seasons"]["2024"]["shipped_blend_on_baseline_set"]
    print(f"2024 blend on baseline set : n={ab['overall']['n']} mae={ab['overall']['mae']} "
          f"bias={ab['overall']['bias']} sp={ab['overall']['spearman_weekly']}")
    sb = result["seasons"]["2024"]["shipped_blend_weeks2_18"]
    print(f"2024 shipped blend w2-18   : n={sb['overall']['n']} mae={sb['overall']['mae']} "
          f"bias={sb['overall']['bias']} sp={sb['overall']['spearman_weekly']}")
    for pos in POSITIONS:
        print(f"  {pos}: n={sb[pos]['n']} mae={sb[pos]['mae']} bias={sb[pos]['bias']}")
    print("k sweep:", {k: v["mae"] for k, v in sweep.items()})
    return result


if __name__ == "__main__":
    main()
