# TERRITORY: A
"""DO AGE AND OPPORTUNITY PREDICT A BIG SEASON, OUT OF SAMPLE?

Cory, 2026-08-19: *"Keep testing best ways to project upside!! Really need to
capture players that actually have it based on age or opportunity!"*

Prereg / prediction: **P122**.

── WHY THIS IS NOT A REPEAT OF TWO STUDIES WE ALREADY RAN ──────────────────
Three things have been measured and NONE of them is this question:

  · **P112** asked whether a player's OWN PAST right tail predicts his FUTURE
    right tail. Null, 4 of 4 folds. And whether his own CV beats a positional
    constant. Null, 0 of 4.
  · **The 08-19 age/opportunity study** asked whether age and opportunity
    predict CROSS-SOURCE DISAGREEMENT — what forecasters argue about. The
    apparent signal was entirely the `cv = sd/mean` denominator (raw-sd
    correlations +0.057 / −0.086 / −0.089 for RB/WR/TE).
  · Neither asked whether age or opportunity predict **a big season, next year,
    out of sample** — which is what Cory is actually asking for.

That cell is empty and it is constructible from committed stores with no
network: `component_stats_<season>.json` (per-week `tgt_share`, targets,
receptions) for the opportunity side, `nflverse_weekly_points_<season>.json`
for the outcome side, and the board's `age` for age. All join on sleeper_id.

── THE TRAP THIS DESIGN IS BUILT AROUND ────────────────────────────────────
**Opportunity predicts POINTS trivially** — a player with a 25% target share
scores more than one with 5%, and finding that would be a tautology dressed as
a finding. **Upside is not level.** So every outcome here is measured as a
RESIDUAL: the player's realized tail MINUS what his own next-season points
volume already implies, within position. What survives is the part of the tail
that opportunity information called in advance and volume did not.

Run: python3 draft/backtest/upside_predictors_lab.py [--out <path>]
"""
from __future__ import annotations

import json
import math
import random
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
BOARD = ROOT / "public" / "draft_data.json"

SEASONS = [2023, 2024, 2025]
MIN_WEEKS = 8            # a tail needs weeks behind it; named before the run
POSITIONS = ("QB", "RB", "WR", "TE")
SEED = 20260819
SHUFFLES = 4000


def _load(season: int, stem: str) -> dict | None:
    p = HERE / f"{stem}_{season}.json"
    return json.loads(p.read_text()) if p.exists() else None


def weekly_points(season: int) -> dict:
    """pid -> [points per week]. Absent weeks are ABSENT, never zero — a zero
    for a week a man did not play is an injury encoded as a bad game, and it is
    exactly what would manufacture a fake 'volatility' signal."""
    doc = _load(season, "nflverse_weekly_points")
    if not doc:
        return {}
    out = defaultdict(list)
    weeks = doc["weeks"]
    weeks = weeks if isinstance(weeks, list) else list(weeks.values())
    for w in weeks:
        for pid, pts in (w.get("points") or {}).items():
            if isinstance(pts, (int, float)):
                out[str(pid)].append(float(pts))
    return dict(out)


def opportunity(season: int) -> dict:
    """pid -> {pos, share_mean, share_trend, weeks}.

    `share_trend` is late-season mean minus early-season mean of `tgt_share` —
    a player whose role is GROWING, which is the thing a point projection
    anchored on last season's volume structurally cannot carry. That is the
    mechanism P122 predicts will clear where raw level does not.
    """
    doc = _load(season, "component_stats")
    if not doc:
        return {}
    per = defaultdict(list)
    pos_of = {}
    weeks = doc["weeks"]
    weeks = weeks if isinstance(weeks, list) else list(weeks.values())
    for w in weeks:
        wk = w.get("week")
        for pid, row in (w.get("players") or {}).items():
            sh = row.get("tgt_share")
            if row.get("pos"):
                pos_of[str(pid)] = row["pos"]
            if isinstance(sh, (int, float)):
                per[str(pid)].append((wk, float(sh)))
    out = {}
    for pid, rows in per.items():
        if len(rows) < MIN_WEEKS:
            continue
        rows.sort(key=lambda t: t[0])
        half = len(rows) // 2
        early = [v for _, v in rows[:half]]
        late = [v for _, v in rows[half:]]
        out[pid] = {
            "pos": pos_of.get(pid),
            "share_mean": st.mean(v for _, v in rows),
            "share_trend": st.mean(late) - st.mean(early),
            "weeks": len(rows),
        }
    return out


def _spearman(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 8:
        return None

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

    rx, ry = rank(xs), rank(ys)
    mx, my = st.mean(rx), st.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    dy = math.sqrt(sum((b - my) ** 2 for b in ry))
    return None if dx == 0 or dy == 0 else num / (dx * dy)


def _perm_p(xs: list[float], ys: list[float], obs: float) -> float:
    """Shuffle the OUTCOME against the feature. The honest null for a
    correlation on a small non-independent panel."""
    rng = random.Random(SEED)
    ys = ys[:]
    hits = 0
    for _ in range(SHUFFLES):
        rng.shuffle(ys)
        r = _spearman(xs, ys)
        if r is not None and abs(r) >= abs(obs):
            hits += 1
    return hits / SHUFFLES


def _residual_tail(pids: list[str], pts: dict) -> dict:
    """Realized p90 with the player's own SEASON VOLUME projected out, within
    position. This is the whole design: p90 raw is a level measure and would
    make opportunity look predictive by tautology.
    """
    tail, total = {}, {}
    for pid in pids:
        v = sorted(pts.get(pid) or [])
        if len(v) < MIN_WEEKS:
            continue
        idx = max(0, int(round(0.9 * (len(v) - 1))))
        tail[pid] = v[idx]
        total[pid] = sum(v)
    if len(tail) < 8:
        return {}
    xs = [total[p] for p in tail]
    ys = [tail[p] for p in tail]
    mx, my = st.mean(xs), st.mean(ys)
    den = sum((a - mx) ** 2 for a in xs)
    beta = (sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / den) if den else 0.0
    return {p: tail[p] - (my + beta * (total[p] - mx)) for p in tail}


def run() -> dict:
    board = json.loads(BOARD.read_text()) if BOARD.exists() else {"players": []}
    age_now = {str(p["player_id"]): p["age"] for p in board.get("players", [])
               if p.get("age") and p.get("player_id")}

    folds, diag = {}, {}
    for train_season in SEASONS[:-1]:
        test_season = train_season + 1
        opp = opportunity(train_season)
        nxt = weekly_points(test_season)
        if not opp or not nxt:
            diag[f"{train_season}->{test_season}"] = "store missing"
            continue

        rows = []
        for pid, o in opp.items():
            if o["pos"] not in POSITIONS:
                continue
            if pid not in nxt:
                continue
            a = age_now.get(pid)
            # age AT THAT SEASON, derived from the 2026 board's age
            age_then = (a - (2026 - train_season)) if a is not None else None
            rows.append((pid, o, age_then))
        resid = _residual_tail([r[0] for r in rows], nxt)
        rows = [r for r in rows if r[0] in resid]
        if len(rows) < 20:
            diag[f"{train_season}->{test_season}"] = f"only {len(rows)} joined"
            continue

        fold = {"n": len(rows), "test_season": test_season}
        for feat, get in (
            ("age", lambda r: r[2]),
            ("opportunity_level", lambda r: r[1]["share_mean"]),
            ("opportunity_trend", lambda r: r[1]["share_trend"]),
        ):
            sub = [r for r in rows if get(r) is not None]
            if len(sub) < 20:
                fold[feat] = {"n": len(sub), "rho": None, "p": None,
                              "note": "too few with this feature"}
                continue
            xs = [float(get(r)) for r in sub]
            ys = [resid[r[0]] for r in sub]
            rho = _spearman(xs, ys)
            fold[feat] = {"n": len(sub),
                          "rho": None if rho is None else round(rho, 4),
                          "p": None if rho is None else round(_perm_p(xs, ys, rho), 4)}
        folds[f"{train_season}->{test_season}"] = fold

    # A CONTROL WITH A KNOWN ANSWER (rule 3e). Correlate the residual tail
    # against ITSELF-plus-noise: the machinery must return a high rho and a low
    # p, or a null anywhere above means "cannot detect", not "nothing there".
    ctrl = {}
    if folds:
        k = sorted(folds)[0]
        ts = int(k.split("->")[1])
        opp = opportunity(ts - 1)
        nxt = weekly_points(ts)
        resid = _residual_tail([p for p in opp if p in nxt], nxt)
        if len(resid) >= 20:
            rng = random.Random(SEED)
            pids = sorted(resid)
            ys = [resid[p] for p in pids]
            xs = [resid[p] + rng.gauss(0, st.pstdev(ys) * 0.5) for p in pids]
            rho = _spearman(xs, ys)
            ctrl = {"n": len(pids), "rho": round(rho, 4),
                    "p": round(_perm_p(xs, ys, rho), 4),
                    "note": "known-positive: outcome vs itself plus noise. If "
                            "this does not clear, every null above means the "
                            "instrument is blind, not that the effect is absent."}

    signals = []
    for feat in ("age", "opportunity_level", "opportunity_trend"):
        ps = [f[feat]["p"] for f in folds.values()
              if f.get(feat, {}).get("p") is not None]
        rhos = [f[feat]["rho"] for f in folds.values()
                if f.get(feat, {}).get("rho") is not None]
        if ps and all(p < 0.05 for p in ps) and len({r > 0 for r in rhos}) == 1:
            signals.append(feat)

    return {
        "_territory": "TERRITORY: A — draft/backtest/upside_predictors_lab.py",
        "_prereg": "P122",
        "_estimand": ("out-of-sample realized weekly p90 with the player's own "
                      "next-season VOLUME projected out, within position — so a "
                      "level effect cannot masquerade as an upside effect"),
        "seed": SEED, "shuffles": SHUFFLES, "min_weeks": MIN_WEEKS,
        "folds": folds, "skipped": diag,
        "known_positive_control": ctrl,
        "clears_every_fold_same_sign": signals,
        "verdict": ("NO PREDICTOR CLEARS EVERY FOLD WITH A CONSISTENT SIGN"
                    if not signals else "clears: " + ", ".join(signals)),
    }


def main() -> int:
    doc = run()
    print("UPSIDE PREDICTORS — residual tail, out of sample")
    print(f"  estimand: {doc['_estimand']}")
    c = doc["known_positive_control"]
    if c:
        print(f"\n  KNOWN-POSITIVE CONTROL: n={c['n']} rho={c['rho']} p={c['p']}"
              + ("   ✅ the instrument can detect a real effect"
                 if c["p"] < 0.05 else "   ⛔ BLIND — every null below is meaningless"))
    for fold, f in sorted(doc["folds"].items()):
        print(f"\n  {fold}  (n={f['n']}, outcome season {f['test_season']})")
        for feat in ("age", "opportunity_level", "opportunity_trend"):
            v = f.get(feat, {})
            if v.get("rho") is None:
                print(f"    {feat:20} — {v.get('note', 'not computable')}")
            else:
                star = "  *" if v["p"] < 0.05 else ""
                print(f"    {feat:20} n={v['n']:4}  rho {v['rho']:+.4f}  p {v['p']:.4f}{star}")
    if doc["skipped"]:
        print(f"\n  skipped: {json.dumps(doc['skipped'])}")
    print(f"\n  VERDICT: {doc['verdict']}")

    if "--out" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--out") + 1])
        out.write_text(json.dumps(doc, indent=1))
        print(f"  wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
