#!/usr/bin/env python3
"""V8 RUN ONE — does the WR source-disagreement signal replicate?

Prereg: V8-RUN1-PREREG.md, committed with this module BEFORE first run.
Blind predictions: ledger P98, filed in the same commit. The claim, its
provenance table, the fold design, the declared conditional 2023 fold and
the SHIPS-IF bar all live in the prereg — this docstring does not restate
them so the two can never drift.

Frame (V7 run one's, unchanged): y = actual − market · x = own_v6 −
market · per-position non-negative λ = max(0, Σxy/Σx²) on the fit half ·
team-clustered player-split CV, 200 splits, teams = component-store
majority team (no row → "UNK", one shared cluster, declared) · dual grade
(total; per-game ≥ 4 games, market/17) · startable pools by market
ordering · P@12/P@24 on CV predictions · best-of-K with the market
champion in the field.

Ship gate (total grade only): the WR-only corrected map through the
shared harness's §3 verdict on BOTH frames — 2024 (market = FP, λ from
this run's CV mean) and 2025 (market = Sleeper, λ = LAMBDA_SHIP_2025 =
0.81, V7 run one's own-arm CV mean, fixed here in advance). Error
correlation vs the market baseline reported per the standing costume
rule — transparency for a correction arm, not a kill switch (prereg).

Run: python3 draft/backtest/exp_v8_source_disagreement.py [--per-game]
Writes exp_v8_source_disagreement[_pergame].json next to this file.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from exp_v7_residual_run2 import actuals, fp_baseline  # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402
from model_accuracy_grade import grade  # noqa: E402
from own_model_v2 import board_ages  # noqa: E402
from v7_candidate_grade import (  # noqa: E402
    POSITIONS as HPOS, RECENCY_WEIGHTS, build_stack, make_blend, verdict)

SEED = 20260820
SPLITS = 200
GAMES_FLOOR = 4
ASSUMED_GAMES = 17.0
POSITIONS = ("QB", "RB", "WR", "TE")
STARTABLE = {"QB": 24, "TE": 24, "RB": 48, "WR": 48}
LAMBDA_SHIP_2025 = 0.81   # V7 run one own-arm WR CV mean, fixed pre-run
FOLDS = {2024: (2022, 2023),          # confirmatory
         2023: (2021, 2022)}          # conditional: backcast never built


def own_backcast(graded, priors):
    positions = positions_record()
    ages = board_ages()
    hand = make_blend({p: RECENCY_WEIGHTS[0] for p in HPOS},
                      positions, priors=priors)
    return build_stack(hand, positions, ages, graded=graded, priors=priors)


def majority_team(year):
    d = json.loads((HERE / f"component_stats_{year}.json").read_text())
    counts = {}
    for wk in d["weeks"]:
        for pid, r in (wk.get("players") or {}).items():
            if r.get("team"):
                counts.setdefault(pid, {}).setdefault(r["team"], 0)
                counts[pid][r["team"]] += 1
    return {pid: max(c, key=c.get) for pid, c in counts.items()}


def fit_lambda(rows):
    sxy = sum(x * y for x, y, *_ in rows)
    sxx = sum(x * x for x, y, *_ in rows)
    return max(0.0, sxy / sxx) if sxx > 0 else 0.0


def _ci(v):
    if not v:
        return None
    srt = sorted(v)
    return {"mean": round(sum(v) / len(v), 4),
            "ci95": [round(srt[int(0.025 * len(srt))], 4),
                     round(srt[min(len(srt) - 1, int(0.975 * len(srt)))], 4)],
            "n_splits": len(v)}


def cv_arm(rows, pool, teams, rng):
    """The run-one CV loop verbatim: rows = (x, y, pid, pos, team)."""
    lam = {q: [] for q in POSITIONS}
    dmae = {q: [] for q in POSITIONS}
    dmae_st = {q: [] for q in POSITIONS}
    held_pred = {}
    for _ in range(SPLITS):
        t = teams[:]
        rng.shuffle(t)
        fit_teams = set(t[: len(t) // 2])
        fr = [r for r in rows if r[4] in fit_teams]
        hr = [r for r in rows if r[4] not in fit_teams]
        for q in POSITIONS:
            fq = [r for r in fr if r[3] == q]
            hq = [r for r in hr if r[3] == q]
            if len(fq) < 8 or len(hq) < 8:
                continue
            L = fit_lambda(fq)
            lam[q].append(L)
            ch = [abs(y - L * x) for x, y, *_ in hq]
            cp = [abs(y) for x, y, *_ in hq]
            dmae[q].append(sum(ch) / len(ch) - sum(cp) / len(cp))
            hs = [(x, y) for x, y, p, qq, tt in hq if p in pool[q]]
            if len(hs) >= 5:
                dmae_st[q].append(sum(abs(y - L * x) for x, y in hs) / len(hs)
                                  - sum(abs(y) for x, y in hs) / len(hs))
            for x, y, p, qq, tt in hq:
                held_pred.setdefault(p, []).append(L * x)
    cv_pred = {p: sum(v) / len(v) for p, v in held_pred.items()}
    return lam, dmae, dmae_st, cv_pred


def run_fold(year, priors, per_game, rng):
    base = fp_baseline(year)
    own = own_backcast(year, priors)
    tot, games = actuals(year)
    positions = positions_record()
    team = majority_team(year)

    if per_game:
        actual = {p: tot[p] / games[p] for p in tot
                  if games.get(p, 0) >= GAMES_FLOOR}
        base = {p: v / ASSUMED_GAMES for p, v in base.items()}
        own = {p: v / ASSUMED_GAMES for p, v in own.items()}
    else:
        actual = tot

    pids = [p for p in base if p in own and p in actual
            and positions.get(p) in POSITIONS]
    rows = [(own[p] - base[p], actual[p] - base[p], p,
             positions[p], team.get(p, "UNK")) for p in pids]
    teams = sorted({r[4] for r in rows})
    pool = {}
    for q in POSITIONS:
        ranked = sorted((p for p in pids if positions[p] == q),
                        key=lambda p: -base[p])
        pool[q] = set(ranked[:STARTABLE[q]])

    lam, dmae, dmae_st, cv_pred = cv_arm(rows, pool, teams, rng)

    def p_at(n, q, challenger):
        pl = [p for p in pids if positions[p] == q and p in cv_pred]
        if len(pl) < n + 4:
            return None
        truth = set(sorted(pl, key=lambda p: -actual[p])[:n])
        key = ((lambda p: -(base[p] + cv_pred[p])) if challenger
               else (lambda p: -base[p]))
        return round(len(truth & set(sorted(pl, key=key)[:n])) / n, 3)

    from best_of_k import best_of_k
    common = sorted(set(cv_pred) & set(pids))
    bok = None
    if len(common) >= 30:
        errs = {"champion": [abs(actual[p] - base[p]) for p in common],
                "arm_own_delta": [abs((actual[p] - base[p]) - cv_pred[p])
                                  for p in common]}
        bok = {k: v for k, v in best_of_k(errs).items()
               if k in ("winner", "field_p_value", "survives", "k", "n_rows")}

    fold = {
        "n_players": len(pids),
        "lambda": {q: _ci(lam[q]) for q in POSITIONS},
        "delta_mae_full": {q: _ci(dmae[q]) for q in POSITIONS},
        "delta_mae_startable": {q: _ci(dmae_st[q]) for q in POSITIONS},
        "P@12": {q: {"champ": p_at(12, q, False), "chal": p_at(12, q, True)}
                 for q in POSITIONS},
        "P@24": {q: {"champ": p_at(24, q, False), "chal": p_at(24, q, True)}
                 for q in POSITIONS},
        "best_of_k": bok,
    }

    if not per_game:
        lam_wr = fold["lambda"]["WR"]["mean"] if fold["lambda"]["WR"] else 0.0
        corrected = {p: base[p] + (lam_wr * (own[p] - base[p])
                                   if positions[p] == "WR" else 0.0)
                     for p in pids}
        g_base = grade({p: base[p] for p in pids}, actual, positions)
        g_arm = grade(corrected, actual, positions)
        fold["ship_gate_fp_frame"] = {
            "lambda_used": lam_wr,
            "verdict": verdict(g_base, g_arm),
            "wr_cells": {"base": _cells(g_base, "WR"), "arm": _cells(g_arm, "WR")},
            "err_corr_WR": err_corr(corrected, base, actual, positions, pids),
        }
    return fold


def _cells(g, pos):
    c = g["cells"][pos]
    return {"spearman": c.get("spearman"), "mae": c.get("mae")}


def err_corr(arm_map, base_map, actual, positions, pids):
    ps = [p for p in pids if positions.get(p) == "WR"]
    ea = [arm_map[p] - actual.get(p, 0.0) for p in ps]
    eb = [base_map[p] - actual.get(p, 0.0) for p in ps]
    if len(ps) < 8:
        return None
    ma, mb = sum(ea) / len(ea), sum(eb) / len(eb)
    sa = (sum((x - ma) ** 2 for x in ea)) ** 0.5
    sb = (sum((x - mb) ** 2 for x in eb)) ** 0.5
    if not sa or not sb:
        return None
    return round(sum((x - ma) * (y - mb) for x, y in zip(ea, eb)) / (sa * sb), 4)


def sleeper_frame_2025():
    """The 2025 leg of the ship gate: sleeper + LAMBDA_SHIP_2025·(own −
    sleeper) at WR, graded against the same rows file run one used."""
    d = json.loads((HERE / "sleeper_vs_fp_rows_2025.json").read_text())
    sleeper, own = d["rows"]["sleeper"], d["rows"]["own_v6"]
    actual, positions = d["actual"], d["positions"]
    pids = [p for p in sleeper if p in own and p in actual
            and positions.get(p) in POSITIONS]
    corrected = {p: sleeper[p] + (LAMBDA_SHIP_2025 * (own[p] - sleeper[p])
                                  if positions[p] == "WR" else 0.0)
                 for p in pids}
    base_map = {p: sleeper[p] for p in pids}
    g_base = grade(base_map, actual, positions)
    g_arm = grade(corrected, actual, positions)
    return {
        "lambda_used": LAMBDA_SHIP_2025,
        "verdict": verdict(g_base, g_arm),
        "wr_cells": {"base": _cells(g_base, "WR"), "arm": _cells(g_arm, "WR")},
        "err_corr_WR": err_corr(corrected, base_map, actual, positions, pids),
    }


def run(per_game=False):
    rng = random.Random(SEED)
    out = {"_prereg": "V8-RUN1-PREREG.md; blind predictions ledger P98",
           "_grade": "per-game" if per_game else "total", "folds": {}}
    for year, priors in FOLDS.items():
        try:
            out["folds"][str(year)] = run_fold(year, priors, per_game, rng)
        except Exception as e:  # the declared-conditional 2023 fold may fail
            out["folds"][str(year)] = {
                "status": "BUILD FAILED — reported, not dropped (prereg)",
                "error": f"{type(e).__name__}: {e}"}
            if year == 2024:
                raise   # the confirmatory fold failing is a run failure
    if not per_game:
        out["ship_gate_sleeper_frame_2025"] = sleeper_frame_2025()
    return out


def main():
    per_game = "--per-game" in sys.argv
    doc = run(per_game=per_game)
    name = ("exp_v8_source_disagreement_pergame.json" if per_game
            else "exp_v8_source_disagreement.json")
    (HERE / name).write_text(json.dumps(doc, indent=1))
    for y, f in doc["folds"].items():
        if "lambda" in f:
            print(y, "WR lambda:", f["lambda"]["WR"],
                  "WR dMAE:", f["delta_mae_full"]["WR"])
            if f.get("best_of_k"):
                print(y, "best_of_k:", f["best_of_k"])
        else:
            print(y, f.get("status"), f.get("error", "")[:120])
    print("wrote", name)


if __name__ == "__main__":
    main()
