# TERRITORY: A
"""IS THERE AN UPSIDE SIGNAL OUR CEILING DOES NOT CARRY?  (P112)

Cory, 2026-08-19: *"upside late... how can we measure upside better?"*

Prereg: `UPSIDE-MEASUREMENT-PREREG.md`, committed before this file ran.

WHAT IT DOES NOT RE-DERIVE. `weekly_volatility.json` already establishes that
CV persists year over year (rho 0.52 / 0.39 / 0.47 against a +/-0.13 null) and
that CV varies 1.78x WITHIN a projection band. Both are taken as given. The
open question is whether there is an ASYMMETRY -- a right tail -- that neither
the mean nor the CV already carries, because a symmetric spread measure cannot
tell a boom candidate from a bust candidate.

THE THREE QUESTIONS
  A  is the right tail just mean + k*sd with ONE k? (`tail_z` spread)
  B  is the right tail PERSISTENT after residualising on mean and cv?
  C  does the board's shipped `proj_ceiling` carry any of it, and do the
     `-x-player-cv` rows beat the band-constant rows?

THE NULL IS A PERMUTATION NULL, NOT A TEXTBOOK ONE, and it is the same shape
`weekly_volatility.py` uses so the numbers are comparable: shuffle the
season-t labels within position and re-take the correlation, many times. A
year-over-year rho only counts as signal if it sits outside that band.

Run: python3 draft/backtest/upside_measurement.py
"""
from __future__ import annotations

import json
import math
import random
import statistics as st
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent

SEASONS = [2021, 2022, 2023, 2024, 2025]
MIN_WEEKS = 8          # same floors as weekly_volatility.py, deliberately
MIN_MEAN = 3.0
POSITIONS = ("QB", "RB", "WR", "TE")
PERMUTATIONS = 2000
SEED = 20260819        # fixed: a permutation null that moves between runs is not a null


def load_weeks(season: int) -> dict[str, list[float]]:
    """{player_id: [weekly points]} — rows that EXIST. An absent row is absence,
    never a zero: a player who did not play did not score zero, he did not
    play, and averaging a fabricated zero into his tail is how a bye becomes a
    bust."""
    p = HERE / f"nflverse_weekly_points_{season}.json"
    if not p.exists():
        return {}
    doc = json.loads(p.read_text())
    out: dict[str, list[float]] = defaultdict(list)
    for wk in doc.get("weeks") or []:
        for pid, pts in (wk.get("points") or {}).items():
            if pts is None:
                continue
            out[str(pid)].append(float(pts))
    return out


def positions_map() -> dict[str, str]:
    p = DRAFT / "data" / "player_positions.json"
    if not p.exists():
        return {}
    d = json.loads(p.read_text())
    if isinstance(d, dict) and "positions" in d:
        d = d["positions"]
    return {str(k): v for k, v in d.items() if isinstance(v, str)}


def percentile(xs: list[float], q: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    i = q * (len(s) - 1)
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return s[lo] if lo == hi else s[lo] + (s[hi] - s[lo]) * (i - lo)


def spearman(pairs: list[tuple[float, float]]) -> float | None:
    """Rank correlation. Returns None below 10 pairs rather than a number
    nobody should read."""
    if len(pairs) < 10:
        return None

    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    a = ranks([p[0] for p in pairs])
    b = ranks([p[1] for p in pairs])
    ma, mb = st.mean(a), st.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = math.sqrt(sum((x - ma) ** 2 for x in a))
    db = math.sqrt(sum((y - mb) ** 2 for y in b))
    return None if da == 0 or db == 0 else num / (da * db)


def permutation_band(pairs, rng, n=PERMUTATIONS):
    """The 95% band of rho under label shuffling — the honest null for a
    small, non-independent panel."""
    ys = [p[1] for p in pairs]
    rhos = []
    for _ in range(n):
        rng.shuffle(ys)
        r = spearman(list(zip([p[0] for p in pairs], ys)))
        if r is not None:
            rhos.append(r)
    rhos.sort()
    if not rhos:
        return None
    return [round(percentile(rhos, 0.025), 4), round(percentile(rhos, 0.975), 4)]


def build() -> dict:
    pos = positions_map()
    per_season: dict[int, dict[str, dict]] = {}
    for s in SEASONS:
        wk = load_weeks(s)
        rows = {}
        for pid, xs in wk.items():
            if len(xs) < MIN_WEEKS:
                continue
            m = st.mean(xs)
            if m < MIN_MEAN:
                continue
            if pos.get(pid) not in POSITIONS:
                continue
            sd = st.pstdev(xs) if len(xs) > 1 else 0.0
            if sd <= 0:
                continue
            p90 = percentile(xs, 0.90)
            rows[pid] = {
                "pos": pos[pid], "weeks": len(xs),
                "mean": round(m, 3), "sd": round(sd, 3), "cv": round(sd / m, 4),
                "p90": round(p90, 3), "max": round(max(xs), 3),
                # THE QUANTITY THE WHOLE STUDY TURNS ON: how far the good weeks
                # reach in units of this player's OWN spread. If every player
                # shares one value, upside is fully described by level and
                # spread and there is nothing further to measure.
                "tail_z": round((p90 - m) / sd, 4),
            }
        per_season[s] = rows
    return per_season


def residualise(rows: dict[str, dict]) -> dict[str, float]:
    """`tail_z` with mean and cv projected out, WITHIN position — so a QB's
    tail is compared to other QBs' and not to a kicker-shaped distribution.
    Two-variable OLS by hand; no dependency, and the arithmetic is visible."""
    out = {}
    by_pos = defaultdict(list)
    for pid, r in rows.items():
        by_pos[r["pos"]].append(pid)
    for p, pids in by_pos.items():
        if len(pids) < 12:
            for pid in pids:
                out[pid] = rows[pid]["tail_z"]
            continue
        X = [(rows[i]["mean"], rows[i]["cv"]) for i in pids]
        y = [rows[i]["tail_z"] for i in pids]
        mx1 = st.mean(x[0] for x in X); mx2 = st.mean(x[1] for x in X); my = st.mean(y)
        s11 = sum((x[0] - mx1) ** 2 for x in X)
        s22 = sum((x[1] - mx2) ** 2 for x in X)
        s12 = sum((x[0] - mx1) * (x[1] - mx2) for x in X)
        s1y = sum((x[0] - mx1) * (yy - my) for x, yy in zip(X, y))
        s2y = sum((x[1] - mx2) * (yy - my) for x, yy in zip(X, y))
        det = s11 * s22 - s12 * s12
        if abs(det) < 1e-9:
            for pid in pids:
                out[pid] = rows[pid]["tail_z"]
            continue
        b1 = (s22 * s1y - s12 * s2y) / det
        b2 = (s11 * s2y - s12 * s1y) / det
        b0 = my - b1 * mx1 - b2 * mx2
        for pid, x, yy in zip(pids, X, y):
            out[pid] = yy - (b0 + b1 * x[0] + b2 * x[1])
    return out


def main() -> None:
    rng = random.Random(SEED)
    per_season = build()

    # ---- Q-A: is the right tail one shape for everyone? -------------------
    allz = [r["tail_z"] for s in SEASONS for r in per_season.get(s, {}).values()]
    qa = {
        "n": len(allz),
        "p25": round(percentile(allz, 0.25), 4),
        "p50": round(percentile(allz, 0.50), 4),
        "p75": round(percentile(allz, 0.75), 4),
        "iqr": round(percentile(allz, 0.75) - percentile(allz, 0.25), 4),
    }
    qa["verdict"] = ("SPREAD — shape information exists beyond level and spread"
                     if qa["iqr"] >= 0.30 else
                     "TIGHT — one distribution shape fits everyone; the current "
                     "construct is adequate and upside cannot be measured better "
                     "from outcomes alone")

    # ---- Q-B: is the RESIDUAL right tail persistent? ----------------------
    resid = {s: residualise(per_season.get(s, {})) for s in SEASONS}
    qb = []
    for a, b in zip(SEASONS, SEASONS[1:]):
        shared = sorted(set(resid.get(a, {})) & set(resid.get(b, {})))
        pairs = [(resid[a][pid], resid[b][pid]) for pid in shared]
        rho = spearman(pairs)
        band = permutation_band(list(pairs), rng) if rho is not None else None
        # CONTROL, and it is the arm that makes the null readable: the RAW cv
        # persistence over the same population must reproduce the committed
        # 0.39-0.52. If it does not, this harness is not measuring what
        # weekly_volatility.py measured and no verdict below is trustworthy.
        cvp = [(per_season[a][pid]["cv"], per_season[b][pid]["cv"]) for pid in shared]
        rho_cv = spearman(cvp)
        qb.append({
            "from": a, "to": b, "n": len(pairs),
            "rho_residual_tail": None if rho is None else round(rho, 4),
            "null_95": band,
            "status": ("signal" if rho is not None and band
                       and (rho < band[0] or rho > band[1]) else "null"),
            "CONTROL_rho_cv": None if rho_cv is None else round(rho_cv, 4),
        })

    doc = {
        "_territory": "TERRITORY: A — draft/backtest/upside_measurement.py",
        "_note": "P112. Realised upside only. Says nothing about whether a "
                 "signal found here is DRAFTABLE — Q-B is that bridge.",
        "prereg": "draft/backtest/UPSIDE-MEASUREMENT-PREREG.md",
        "seasons": SEASONS, "min_weeks": MIN_WEEKS, "min_mean": MIN_MEAN,
        "positions": list(POSITIONS), "permutations": PERMUTATIONS, "seed": SEED,
        "players_by_season": {str(s): len(per_season.get(s, {})) for s in SEASONS},
        "Q_A_tail_shape": qa,
        "Q_B_residual_persistence": qb,
    }
    out = HERE / "upside_measurement.json"
    out.write_text(json.dumps(doc, indent=1))

    print("P112 — UPSIDE MEASUREMENT\n")
    print(f"  population: {doc['players_by_season']}")
    print(f"\n  Q-A  tail_z p25/p50/p75 = {qa['p25']} / {qa['p50']} / {qa['p75']}"
          f"   IQR {qa['iqr']}")
    print(f"       {qa['verdict']}")
    print("\n  Q-B  residual right-tail persistence (mean and cv projected out)")
    for r in qb:
        print(f"       {r['from']}->{r['to']}  n={r['n']:4}  rho={r['rho_residual_tail']}"
              f"  null95={r['null_95']}  {r['status'].upper()}"
              f"   | CONTROL cv-rho {r['CONTROL_rho_cv']}")
    print(f"\n  wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
