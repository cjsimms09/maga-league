#!/usr/bin/env python3
"""V7 RESIDUAL LAB, RUN ONE — season level, 2025 fold, per AMENDMENT 1.

Cory, 2026-08-18: "okay! lets get V7 rolling and if its better, lets use it."
Frame: RESIDUAL-ARM-PROPOSAL.md (+ Amendment 1, committed before this file ran).

Ship `sleeper + λ·(x)`, λ = 0 IS the champion. Run one uses the two arms that
need no feature engineering because both live in the retained grade rows
(`sleeper_vs_fp_rows_2025.json`):

    arm_fp   x = fp_proj    − sleeper_proj   (the blend question, nested)
    arm_own  x = own_v6     − sleeper_proj   (our model as a CORRECTION, nested)

PRIOR ART, named before the numbers (prior_art discipline — these are known
results, not blind predictions): the C3 three-way grade already showed a fixed
50/50 FP blend wins WR/TE and loses QB, and own_v6 solo loses everywhere with
error correlation 0.64-0.90 against the parents. The residual frame's question
is different: fitted per-position λ with held-out error — own_v6 can help as a
partial correction even though it loses solo, and FP's λ tells us how much of
it to buy per position.

PROTOCOL (Amendment 1, fixed before running):
  * y = actual_2025 − sleeper_2025 per player; positions QB/RB/WR/TE.
  * non-negative λ per position: max(0, Σxy/Σx²) on the FIT half only.
  * TEAM-CLUSTERED player-split CV, 200 splits: half the NFL teams fit, half
    held; λ fitted on fit-half players, error scored on held-half players.
    LIMITATION, stated: team is the 2026 board team (draft_data), so ~10% of
    players (offseason movers) cluster under the wrong 2025 team — weakens
    cluster validity slightly, biases nothing directionally.
  * report per position: λ mean + [2.5, 97.5] percentile CI across splits ·
    held ΔMAE (challenger − champion, negative is better) with CI · held
    within-position Spearman for both.
  * startable pool reported beside the full population: top-24 QB/TE,
    top-48 RB/WR by the CHAMPION's own ranking (baseline picks the pool so
    the challenger cannot select its own grading population).
  * BEST-OF-K over {champion, arm_fp, arm_own} on cross-validated per-player
    absolute errors (each player's prediction averaged over splits where he
    was HELD).
  * SHIPS-IF: nothing ships from run one (Amendment 1). Cory's
    pre-authorization applies to the full graded bar, which one
    cross-validated season is not.

Run: python3 draft/backtest/exp_v7_residual_run1.py
Writes exp_v7_residual_run1.json next to this file.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROWS = HERE / "sleeper_vs_fp_rows_2025.json"
BOARD = HERE.parent.parent / "public" / "draft_data.json"
SEED = 20260818
POSITIONS = ("QB", "RB", "WR", "TE")
STARTABLE = {"QB": 24, "TE": 24, "RB": 48, "WR": 48}
SPLITS = 200


GAMES_FLOOR = 4          # Amendment 2: a one-game cameo rate is noise
ASSUMED_GAMES = 17.0     # projections are full-season; both sides divide alike
WEEKLY = HERE / "nflverse_weekly_points_2025.json"


def games_active():
    """weeks with a row = 'was on a field' (the store's own definition)."""
    d = json.loads(WEEKLY.read_text())
    g = {}
    for wk in d["weeks"]:
        for pid in (wk.get("points") or {}):
            g[pid] = g.get(pid, 0) + 1
    return g


def load(per_game=False):
    d = json.loads(ROWS.read_text())
    board = json.loads(BOARD.read_text())
    team = {str(p.get("player_id")): p.get("team") for p in board.get("players", [])}
    sleeper = {k: float(v) for k, v in d["rows"]["sleeper"].items()}
    arms = {
        "arm_fp": {k: float(v) for k, v in d["rows"]["fantasypros"].items()},
        "arm_own": {k: float(v) for k, v in d["rows"]["own_v6"].items()},
    }
    actual = {k: float(v) for k, v in d["actual"].items()}
    pos = d["positions"]
    if per_game:
        g = games_active()
        actual = {p: v / g[p] for p, v in actual.items() if g.get(p, 0) >= GAMES_FLOOR}
        sleeper = {p: v / ASSUMED_GAMES for p, v in sleeper.items()}
        arms = {a: {p: v / ASSUMED_GAMES for p, v in m.items()} for a, m in arms.items()}
    return sleeper, arms, actual, pos, team


def spearman(xs, ys):
    def rank(v):
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
    if len(xs) < 3:
        return None
    rx, ry = rank(xs), rank(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx) ** 0.5
    dy = sum((b - my) ** 2 for b in ry) ** 0.5
    return num / (dx * dy) if dx and dy else None


def fit_lambda(rows):
    """non-negative least-squares slope through the origin: y ≈ λx."""
    sxy = sum(x * y for x, y, *_ in rows)
    sxx = sum(x * x for x, y, *_ in rows)
    return max(0.0, sxy / sxx) if sxx > 0 else 0.0


def run(per_game=False):
    sleeper, arms, actual, pos, team = load(per_game=per_game)
    rng = random.Random(SEED)
    out = {"arms": {}}

    for arm_name, proj in arms.items():
        # population: everything this arm can price, champion included
        pids = [p for p in sleeper
                if p in proj and p in actual and pos.get(p) in POSITIONS]
        rows = [(proj[p] - sleeper[p], actual[p] - sleeper[p], p,
                 pos[p], team.get(p) or "UNK") for p in pids]
        teams = sorted({r[4] for r in rows})
        by_pos_pool = {}
        for q in POSITIONS:
            ranked = sorted((p for p in pids if pos[p] == q),
                            key=lambda p: -sleeper[p])
            by_pos_pool[q] = set(ranked[:STARTABLE[q]])

        lam = {q: [] for q in POSITIONS}
        dmae = {q: [] for q in POSITIONS}
        dmae_start = {q: [] for q in POSITIONS}
        held_pred = {}          # pid -> [challenger predictions when held]
        for _ in range(SPLITS):
            t = teams[:]
            rng.shuffle(t)
            fit_teams = set(t[: len(t) // 2])
            fit_rows = [r for r in rows if r[4] in fit_teams]
            held_rows = [r for r in rows if r[4] not in fit_teams]
            for q in POSITIONS:
                fq = [r for r in fit_rows if r[3] == q]
                hq = [r for r in held_rows if r[3] == q]
                if len(fq) < 8 or len(hq) < 8:
                    continue
                L = fit_lambda(fq)
                lam[q].append(L)
                ch = [abs(y - L * x) for x, y, *_ in hq]
                cp = [abs(y) for x, y, *_ in hq]
                dmae[q].append(sum(ch) / len(ch) - sum(cp) / len(cp))
                hs = [(x, y, p) for x, y, p, qq, tt in hq if p in by_pos_pool[q]]
                if len(hs) >= 5:
                    chs = [abs(y - L * x) for x, y, p in hs]
                    cps = [abs(y) for x, y, p in hs]
                    dmae_start[q].append(sum(chs) / len(chs) - sum(cps) / len(cps))
                for x, y, p, qq, tt in hq:
                    held_pred.setdefault(p, []).append(L * x)

        def ci(v):
            if not v:
                return None
            s = sorted(v)
            return {"mean": round(sum(v) / len(v), 4),
                    "ci95": [round(s[int(0.025 * len(s))], 4),
                             round(s[min(len(s) - 1, int(0.975 * len(s)))], 4)],
                    "n_splits": len(v)}

        # cross-validated per-player errors for best-of-K
        cv_err = {}
        for x, y, p, q, t in rows:
            preds = held_pred.get(p)
            if preds:
                cv_err[p] = abs(y - sum(preds) / len(preds))
        out["arms"][arm_name] = {
            "n_players": len(pids),
            "lambda": {q: ci(lam[q]) for q in POSITIONS},
            "delta_mae_full": {q: ci(dmae[q]) for q in POSITIONS},
            "delta_mae_startable": {q: ci(dmae_start[q]) for q in POSITIONS},
            "_cv_err": cv_err,
        }

    # BEST-OF-K on the intersection all three can price
    from best_of_k import best_of_k
    inter = set.intersection(*(set(out["arms"][a]["_cv_err"]) for a in out["arms"]))
    inter = sorted(inter)
    if len(inter) >= 30:
        errors = {"champion": [abs(actual[p] - sleeper[p]) for p in inter]}
        for a in out["arms"]:
            errors[a] = [out["arms"][a]["_cv_err"][p] for p in inter]
        out["best_of_k"] = best_of_k(errors)
        out["best_of_k"]["rows_are"] = f"{len(inter)} players priced by all arms, cross-validated errors"
    for a in out["arms"]:
        del out["arms"][a]["_cv_err"]

    out["_protocol"] = "AMENDMENT 1, RESIDUAL-ARM-PROPOSAL.md — committed before this ran"
    out["_ships"] = ("NOTHING from run one, by prereg. Cory's pre-authorization (A11) applies to "
                     "the full graded bar: lambda CI>0 at >=2 positions AND startable-pool gain "
                     "AND outside the best-of-K null band, on the graded folds.")
    return out


def main():
    import sys
    per_game = "--per-game" in sys.argv
    doc = run(per_game=per_game)
    doc["_grade"] = ("PER-GAME-WHEN-ACTIVE (Amendment 2: the no-injury skill lens, "
                     f">={GAMES_FLOOR} games floor)" if per_game
                     else "TOTAL POINTS (availability skill included)")
    name = "exp_v7_residual_run1_pergame.json" if per_game else "exp_v7_residual_run1.json"
    (HERE / name).write_text(json.dumps(doc, indent=1))
    print(doc["_grade"])
    for a, r in doc["arms"].items():
        print(f"== {a} (n={r['n_players']})")
        for q in POSITIONS:
            L = r["lambda"][q]
            D = r["delta_mae_full"][q]
            S = r["delta_mae_startable"][q]
            print(f"  {q}: lambda {L and L['mean']} {L and L['ci95']} | dMAE {D and D['mean']} "
                  f"{D and D['ci95']} | startable dMAE {S and S['mean']} {S and S['ci95']}")
    if "best_of_k" in doc:
        b = doc["best_of_k"]
        print("best_of_k winner:", b["winner"], "field_p:", b["field_p_value"], "survives:", b["survives"])
    print("wrote " + name)


if __name__ == "__main__":
    main()
