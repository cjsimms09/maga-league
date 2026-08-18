#!/usr/bin/env python3
"""V7 RESIDUAL LAB, RUN TWO — three folds, feature arms, FP baseline.

Amendments 1-3 of RESIDUAL-ARM-PROPOSAL.md apply unchanged. Run two extends
run one in the two ways it named: MORE FOLDS (2023/2024/2025 — the retained
`fp_hist_rows.json` supplies a 3/3-authenticity-gated FantasyPros baseline
for every fold, where Sleeper exists only for 2025) and the first FEATURE
arms (Tier-1 axes with committed leak-free stores):

    arm_usage  x = prior-season volume z-score within position
               (targets + receptions weighted, from component_stats_{y-1})
    arm_eff    x = prior-season efficiency z-score within position
               (WOPR + EPA composite, from advanced_stats_{y-1})

Both are strictly prior-season inputs — leak-free at the season boundary by
construction (C's store-readiness table, the ">=1-week lag" rule at season
grain).

BLIND PREDICTIONS, written before this file first ran (the module is
committed before execution, same as run one):
  * usage: λ > 0 at RB and WR — volume persists year over year and FP's
    preseason number does not fully price a player's own prior share.
  * efficiency: λ ≈ 0 everywhere — PRIOR ART: pace_arm and
    advanced_efficiency_study both graded FALSE in-season; efficiency
    mean-reverts, and the season grain should not rescue it.

PROTOCOL per fold (identical to run one): y = actual − fp_baseline ·
non-negative per-position λ = max(0, Σxy/Σx²) on the fit half ·
team-clustered player-split CV, 200 splits (team = the FEATURE STORE's own
prior-season team, not the 2026 board — better than run one) · dual grade
(total + per-game-when-active, ≥4 games) · P@12/P@24 on CV predictions ·
BEST-OF-K per fold. ACROSS folds: a λ counts as replicated only when its CI
excludes zero in ≥2 of 3 folds on the SAME grade.

SHIPS-IF: unchanged (A11's bar). Three folds is the first run that can
actually meet it — and also the first that can honestly fail it.

Run: python3 draft/backtest/exp_v7_residual_run2.py [--per-game]
Writes exp_v7_residual_run2[_pergame].json next to this file.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = 20260819
POSITIONS = ("QB", "RB", "WR", "TE")
STARTABLE = {"QB": 24, "TE": 24, "RB": 48, "WR": 48}
SPLITS = 200
GAMES_FLOOR = 4
ASSUMED_GAMES = 17.0
FOLDS = (2023, 2024, 2025)

sys.path.insert(0, str(HERE))
from exp_fp_hist_proj import frozen_scoring_table, value_rows  # noqa: E402


def fp_baseline(year):
    d = json.loads((HERE / "fp_hist_rows.json").read_text())
    rows = d["years"][str(year)]["rows"]
    scored, _cov = value_rows(rows, frozen_scoring_table())
    out = {}
    for r in scored:
        if r.get("pid") and r.get("value") is not None:
            out[str(r["pid"])] = float(r["value"])
    return out


def actuals(year):
    d = json.loads((HERE / f"nflverse_weekly_points_{year}.json").read_text())
    tot, games = {}, {}
    for wk in d["weeks"]:
        for pid, v in (wk.get("points") or {}).items():
            tot[pid] = tot.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return tot, games


def prior_features(year):
    """{pid: (usage_raw, eff_raw, pos, team)} from the PRIOR season's stores."""
    py = year - 1
    comp = json.loads((HERE / f"component_stats_{py}.json").read_text())
    adv = json.loads((HERE / f"advanced_stats_{py}.json").read_text())
    agg = {}
    for wk in comp["weeks"]:
        for pid, r in (wk.get("players") or {}).items():
            a = agg.setdefault(pid, {"tgt": 0.0, "rec": 0.0, "pos": r.get("pos"),
                                     "team": r.get("team"), "wopr": 0.0, "epa": 0.0, "wk": 0})
            a["tgt"] += float(r.get("tgt") or 0)
            a["rec"] += float(r.get("rec") or 0)
            if r.get("team"):
                a["team"] = r["team"]
    for wk in adv["weeks"]:
        for pid, r in (wk.get("players") or {}).items():
            if pid in agg:
                agg[pid]["wopr"] += float(r.get("wopr") or 0)
                agg[pid]["epa"] += float(r.get("rec_epa") or 0)
                agg[pid]["wk"] += 1
    out = {}
    for pid, a in agg.items():
        usage = a["tgt"] + a["rec"]
        eff = (a["wopr"] + 0.1 * a["epa"]) / a["wk"] if a["wk"] else None
        out[pid] = (usage, eff, a["pos"], a["team"] or "UNK")
    return out


def zscore_within_pos(vals):
    """{pid: z} computed within each position over the provided (pid, v, pos)."""
    by = {}
    for pid, v, q in vals:
        by.setdefault(q, []).append((pid, v))
    out = {}
    for q, rows in by.items():
        xs = [v for _, v in rows]
        m = sum(xs) / len(xs)
        sd = (sum((v - m) ** 2 for v in xs) / len(xs)) ** 0.5 or 1.0
        for pid, v in rows:
            out[pid] = (v - m) / sd
    return out


def fit_lambda(rows):
    sxy = sum(x * y for x, y, *_ in rows)
    sxx = sum(x * x for x, y, *_ in rows)
    return max(0.0, sxy / sxx) if sxx > 0 else 0.0


def run_fold(year, per_game, rng):
    base = fp_baseline(year)
    tot, games = actuals(year)
    feats = prior_features(year)

    if per_game:
        actual = {p: tot[p] / games[p] for p in tot if games.get(p, 0) >= GAMES_FLOOR}
        base = {p: v / ASSUMED_GAMES for p, v in base.items()}
    else:
        actual = tot

    pids = [p for p in base if p in actual and p in feats
            and feats[p][2] in POSITIONS]
    uz = zscore_within_pos([(p, feats[p][0], feats[p][2]) for p in pids])
    ez = zscore_within_pos([(p, feats[p][1], feats[p][2]) for p in pids
                            if feats[p][1] is not None])
    arms = {"arm_usage": uz, "arm_eff": ez}

    fold = {"n_players": len(pids), "arms": {}}
    for arm, xmap in arms.items():
        rows = [(xmap[p], actual[p] - base[p], p, feats[p][2], feats[p][3])
                for p in pids if p in xmap]
        teams = sorted({r[4] for r in rows})
        pool = {}
        for q in POSITIONS:
            ranked = sorted((p for p in pids if feats[p][2] == q and p in base),
                            key=lambda p: -base[p])
            pool[q] = set(ranked[:STARTABLE[q]])
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

        def ci(v):
            if not v:
                return None
            srt = sorted(v)
            return {"mean": round(sum(v) / len(v), 4),
                    "ci95": [round(srt[int(0.025 * len(srt))], 4),
                             round(srt[min(len(srt) - 1, int(0.975 * len(srt)))], 4)]}

        cv_pred = {p: sum(v) / len(v) for p, v in held_pred.items()}

        def p_at(n, q, challenger):
            pl = [p for p in pids if feats[p][2] == q and p in cv_pred and p in base]
            if len(pl) < n + 4:
                return None
            truth = set(sorted(pl, key=lambda p: -actual[p])[:n])
            key = (lambda p: -(base[p] + cv_pred[p])) if challenger else (lambda p: -base[p])
            return round(len(truth & set(sorted(pl, key=key)[:n])) / n, 3)

        fold["arms"][arm] = {
            "lambda": {q: ci(lam[q]) for q in POSITIONS},
            "delta_mae_full": {q: ci(dmae[q]) for q in POSITIONS},
            "delta_mae_startable": {q: ci(dmae_st[q]) for q in POSITIONS},
            "P@12": {q: {"champ": p_at(12, q, False), "chal": p_at(12, q, True)} for q in POSITIONS},
            "_cv_err": {p: abs((actual[p] - base[p]) - cv_pred[p]) for p in cv_pred},
        }
    return fold


def run(per_game=False):
    rng = random.Random(SEED)
    out = {"folds": {}, "_grade": "per-game" if per_game else "total"}
    for y in FOLDS:
        out["folds"][str(y)] = run_fold(y, per_game, rng)

    from best_of_k import best_of_k
    for y, fold in out["folds"].items():
        errs = {}
        inter = None
        for arm, r in fold["arms"].items():
            keys = set(r["_cv_err"])
            inter = keys if inter is None else inter & keys
        if inter and len(inter) >= 30:
            inter = sorted(inter)
            # champion errors from any arm's rows: |y| = |actual - base|; recompute
            base = fp_baseline(int(y))
            tot, games = actuals(int(y))
            actual = ({p: tot[p] / games[p] for p in tot if games.get(p, 0) >= GAMES_FLOOR}
                      if per_game else tot)
            if per_game:
                base = {p: v / ASSUMED_GAMES for p, v in base.items()}
            errs["champion"] = [abs(actual[p] - base[p]) for p in inter]
            for arm, r in fold["arms"].items():
                errs[arm] = [r["_cv_err"][p] for p in inter]
            fold["best_of_k"] = {k: v for k, v in best_of_k(errs).items()
                                 if k in ("winner", "field_p_value", "survives", "k", "n_rows")}
        for arm in fold["arms"]:
            del fold["arms"][arm]["_cv_err"]

    # ACROSS-FOLD REPLICATION — the number that talks to the ships-if bar
    rep = {}
    for arm in ("arm_usage", "arm_eff"):
        rep[arm] = {}
        for q in POSITIONS:
            hits = 0
            for y in out["folds"]:
                L = out["folds"][y]["arms"][arm]["lambda"].get(q)
                D = out["folds"][y]["arms"][arm]["delta_mae_full"].get(q)
                if L and D and L["ci95"][0] > 0 and D["ci95"][1] < 0:
                    hits += 1
            rep[arm][q] = f"{hits}/3 folds with lambda CI>0 AND dMAE CI<0"
    out["replication"] = rep
    return out


def main():
    per_game = "--per-game" in sys.argv
    doc = run(per_game=per_game)
    name = "exp_v7_residual_run2_pergame.json" if per_game else "exp_v7_residual_run2.json"
    (HERE / name).write_text(json.dumps(doc, indent=1))
    print(json.dumps(doc["replication"], indent=1))
    for y, f in doc["folds"].items():
        b = f.get("best_of_k")
        if b:
            print(y, "best_of_k:", b["winner"], "p", b["field_p_value"], "survives", b["survives"])
    print("wrote", name)


if __name__ == "__main__":
    main()
