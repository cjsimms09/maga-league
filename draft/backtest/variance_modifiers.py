# TERRITORY: A
"""ARE player_variance's MODIFIERS REAL? — fit them against realized outcomes.

Prereg: draft/backtest/VARIANCE-MODIFIER-PREREG.md, committed BEFORE this file
existed (commit order is the proof).

Cory, 2026-08-17: "The ceiling shouldn't be a calculated value?? It should be
different depending on the player." Then, on measuring the modifiers instead of
guessing them: "Do test".

WHAT IS BEING MEASURED. `player_variance` widens or narrows a player's season sd
using seven hand-set constants. The statistic here IS that multiplier —
`ratio_sd(flag=1) / ratio_sd(flag=0)` within a cell — so a measured value is
directly substitutable for a guessed one, and "the flag does nothing" reads as
1.0 rather than as an abstract p-value.

Run:  python3 draft/backtest/variance_modifiers.py
"""
from __future__ import annotations

import json
import random
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

GRADED = (2023, 2024, 2025)
POSITIONS = ("QB", "RB", "WR", "TE")
BOOTSTRAP = 4000
PERMUTATIONS = 400
SEED = 20260817

# ── THE ESTIMATOR WAS BROKEN ON THE FIRST RUN, AND ITS OWN CONTROL SAID SO ──
#
# v1 used MIN_CELL=12 / MIN_SIDE=5 and compared `sd(on)/sd(off)` against 1.0.
# The preregistered no-mechanism control — a flag assigned by player-id parity —
# came back at **1.649** where it must be ~1.0, which under prereg §4 VOIDS every
# number in that run. It was not a subtle failure: the committee flag read 11.5
# with its shuffled control at 4.9.
#
# The cause is not a coding slip but the statistic itself. A ratio of two
# small-sample standard deviations is biased AWAY from 1: sd is a noisy estimate,
# the ratio of two noisy estimates has a heavy right tail, and E[sd_a/sd_b] > 1
# even when the underlying dispersions are identical. With five players a side
# that bias swamps any real effect.
#
# Fixed two ways, and the second is the one that matters:
#   * bigger cells, so each sd is an estimate rather than a rumour;
#   * the measured value is judged against a PERMUTATION NULL built by
#     reshuffling the flag inside each cell, never against the constant 1.0.
#     Whatever bias the statistic carries is present in the null by
#     construction, so it cancels instead of being mistaken for a finding.
MIN_CELL = 40
MIN_SIDE = 15

#: Prereg §1. Structurally unmeasurable from committed data — reported as
#: REFUSED, never estimated. Substituting an end-of-season proxy for either
#: would grade hindsight.
REFUSED = {
    "VAR_BACKUP": ("needs depth_chart_order as it stood BEFORE each historical "
                   "season; depth charts here are live Sleeper state, 2026 only"),
    "VAR_INJURED": ("needs the injury designation carried at draft time in a "
                    "past season; never captured, live state only"),
}


def _weekly(season: int) -> dict:
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    out: dict[str, float] = {}
    for w in doc.get("weeks", []):
        for pid, pts in (w.get("points") or {}).items():
            out[pid] = out.get(pid, 0.0) + float(pts)
    return out


def _target_shares(season: int) -> dict[str, float]:
    """Mean weekly target share, from the committed component store."""
    doc = json.loads((HERE / f"component_stats_{season}.json").read_text())
    acc: dict[str, list] = {}
    for w in doc.get("weeks", []):
        for pid, row in (w.get("players") or {}).items():
            v = row.get("tgt_share")
            if isinstance(v, (int, float)):
                acc.setdefault(pid, []).append(float(v))
    return {p: st.fmean(v) for p, v in acc.items() if v}


def _capital() -> dict[str, dict]:
    out = {}
    for name in ("nflverse_draft_picks.json", "nflverse_draft_picks_2026.json"):
        p = HERE / name
        if not p.exists():
            continue
        picks = json.loads(p.read_text())["picks"]
        for c in (picks if isinstance(picks, list) else list(picks.values())):
            sid = c.get("sleeper_id")
            if sid:
                out[str(sid)] = c
    return out


def build_rows() -> list[dict]:
    """One row per graded player-season, with a LEAK-FREE anchor and every
    fittable flag as it was knowable before that season.

    ABSENT IS EXCLUDED, NOT ZERO — a player with no weekly row in Y never took
    a snap, and counting that as a 0.0 outcome would invent the study's biggest
    effect. Prereg §4 declares the direction of the resulting bias: DOWNWARD on
    every dispersion, because the wildest outcome (a season that never happened)
    is the one systematically missing.
    """
    from model_accuracy_backtest import positions_record

    positions, cap = positions_record(), _capital()
    rows = []
    for season in GRADED:
        prior = _weekly(season - 1)
        now = _weekly(season)
        shares = _target_shares(season - 1)      # PRIOR-season usage: leak-free
        # Prior-season rank within position — the anchor's band.
        ranked: dict[str, list] = {}
        for pid, tot in prior.items():
            pos = positions.get(pid)
            if pos in POSITIONS:
                ranked.setdefault(pos, []).append((tot, pid))
        rank_of = {}
        for pos, arr in ranked.items():
            for i, (_t, pid) in enumerate(sorted(arr, reverse=True), start=1):
                rank_of[pid] = i

        for pid, anchor in prior.items():
            pos = positions.get(pid)
            if pos not in POSITIONS or anchor <= 0:
                continue
            realized = now.get(pid)
            if realized is None:          # absent != zero
                continue
            c = cap.get(pid)
            nfl_exp = (season - int(c["season"])) if c else None
            share = shares.get(pid)
            rows.append({
                "season": season, "player_id": pid, "position": pos,
                "anchor": anchor, "realized": float(realized),
                "ratio": float(realized) / anchor,
                "rank": rank_of.get(pid),
                "share": share, "nfl_exp": nfl_exp,
            })
    return rows


# ── the flags, exactly as player_variance defines them ──────────────────────

def flag_committee(r: dict):
    import projections as PJ
    if r["position"] not in ("RB", "WR", "TE") or r["share"] is None:
        return None
    if r["share"] >= PJ.VAR_WORKLOAD_HIGH:
        return False                       # bell-cow: the OTHER side of the split
    if 0 < r["share"] < PJ.VAR_WORKLOAD_LOW:
        return True
    return None                            # in between: not what the flag claims


def flag_second_year(r: dict):
    return None if r["nfl_exp"] is None else (r["nfl_exp"] == 1)


FLAGS = {
    # name -> (predicate, hand-set multiplier the code currently applies)
    "VAR_WORKLOAD_COMMITTEE": (flag_committee, None),
    "VAR_SECOND_YEAR": (flag_second_year, None),
}


def _hand_set_mults() -> dict:
    import projections as PJ
    base = st.fmean(PJ.POSITION_VARIANCE[p] for p in POSITIONS)
    return {
        # A modifier's implied multiplier is (1 + mod) against (1 + 0), since
        # player_variance adds to a multiplier of 1.0 before scaling `base`.
        "VAR_WORKLOAD_COMMITTEE": (1 + PJ.VAR_WORKLOAD_COMMITTEE)
                                  / (1 + PJ.VAR_WORKLOAD_BELLCOW),
        "VAR_SECOND_YEAR": 1 + PJ.VAR_SECOND_YEAR,
        "VAR_ROOKIE": 1 + PJ.VAR_ROOKIE,
        "_base": base,
    }


def band_of(rank):
    import projection_error as PE
    return PE.band_of(rank)


def _sd_ratio(rows: list[dict], pred, rng: random.Random,
              shuffle=False) -> dict | None:
    """ratio_sd(flag=1) / ratio_sd(flag=0), pooled over cells.

    Pooled by taking each cell's two dispersions and averaging the RATIO across
    cells weighted by cell size — never by pooling the raw ratios, which would
    let cell composition masquerade as a flag effect (that is exactly what the
    shuffled control is there to catch, and pooling wrong would defeat it).
    """
    cells: dict = {}
    for r in rows:
        f = pred(r)
        if f is None:
            continue
        cells.setdefault((r["season"], r["position"], band_of(r["rank"])),
                         []).append((bool(f), r["ratio"]))
    num = den = 0.0
    used = 0
    for _k, members in cells.items():
        if len(members) < MIN_CELL:
            continue
        vals = [v for _f, v in members]
        flags = [f for f, _v in members]
        if shuffle:
            flags = flags[:]
            rng.shuffle(flags)
        on = [v for f, v in zip(flags, vals) if f]
        off = [v for f, v in zip(flags, vals) if not f]
        if len(on) < MIN_SIDE or len(off) < MIN_SIDE:
            continue
        s_on, s_off = st.pstdev(on), st.pstdev(off)
        if s_off <= 0:
            continue
        w = len(members)
        num += w * (s_on / s_off)
        den += w
        used += 1
    if not den or used < 2:
        return None
    return {"mult": num / den, "cells_used": used}


def permutation_null(rows: list[dict], pred, rng: random.Random) -> list[float]:
    """The flag reshuffled inside each cell, many times. Carries the estimator's
    own bias, so the comparison below is bias-free by construction."""
    out = []
    for _ in range(PERMUTATIONS):
        g = _sd_ratio(rows, pred, rng, shuffle=True)
        if g:
            out.append(g["mult"])
    return sorted(out)


def grade_flag(rows: list[dict], name: str, pred, rng: random.Random) -> dict:
    point = _sd_ratio(rows, pred, rng)
    if point is None:
        return {"flag": name, "verdict": "NO DATA",
                "why": f"fewer than 2 cells cleared MIN_CELL={MIN_CELL} / "
                       f"MIN_SIDE={MIN_SIDE}"}

    null = permutation_null(rows, pred, rng)
    if len(null) < 50:
        return {"flag": name, "verdict": "NO DATA",
                "why": "permutation null could not be built on enough cells"}
    null_med = st.median(null)
    n_lo, n_hi = null[int(0.025 * len(null))], null[int(0.975 * len(null)) - 1]
    # Two-sided permutation p: how often a SHUFFLED flag separates the
    # dispersions at least as far from the null centre as the real one does.
    obs_dev = abs(point["mult"] - null_med)
    p = (sum(1 for v in null if abs(v - null_med) >= obs_dev) + 1) / (len(null) + 1)

    per_season = {}
    for s in GRADED:
        g = _sd_ratio([r for r in rows if r["season"] == s], pred, rng)
        per_season[str(s)] = round(g["mult"], 3) if g else None

    hand = _hand_set_mults().get(name)
    outside = bool(point["mult"] < n_lo or point["mult"] > n_hi)
    seasons_agree = sum(1 for v in per_season.values()
                        if v is not None and ((v > null_med) == (point["mult"] > null_med)))
    supported = bool(outside and p < 0.05 and seasons_agree >= 2)
    # The BIAS-CORRECTED multiplier: the observed ratio relative to what a
    # meaningless flag produces on this same data. THIS is the number that would
    # replace a hand-set constant, never the raw ratio.
    corrected = point["mult"] / null_med if null_med else None
    return {
        "flag": name, "raw_mult": round(point["mult"], 3),
        "null_median": round(null_med, 3),
        "corrected_mult": round(corrected, 3) if corrected else None,
        "null_95": [round(n_lo, 3), round(n_hi, 3)],
        "permutation_p": round(p, 4),
        "cells_used": point["cells_used"], "by_season": per_season,
        "hand_set_mult": round(hand, 3) if hand else None,
        "clauses": {"outside_permutation_null": outside, "p_below_05": p < 0.05,
                    "seasons_agree_ge_2": seasons_agree >= 2},
        "verdict": "SUPPORTED" if supported else "NOT SUPPORTED",
    }


def parity_control(rows: list[dict], rng: random.Random) -> dict:
    """Prereg §4: a flag with NO mechanism must come out indistinguishable from
    its own permutation null. A pipeline that finds an effect here is broken and
    every number beside it is void.

    THIS CONTROL ALREADY EARNED ITS KEEP. On the first run it read 1.649 against
    a required ~1.0 and voided that entire run — see the estimator note at the
    top of this file. It is checked against the permutation null rather than
    against the constant 1.0, for exactly the reason that run failed.
    """
    pred = lambda r: int(r["player_id"][-1]) % 2 == 0  # noqa: E731
    g = _sd_ratio(rows, pred, rng)
    if not g:
        return {"mult": None, "sane": False, "why": "no cells"}
    null = permutation_null(rows, pred, rng)
    if len(null) < 50:
        return {"mult": round(g["mult"], 3), "sane": False,
                "why": "null too small"}
    med = st.median(null)
    lo, hi = null[int(0.025 * len(null))], null[int(0.975 * len(null)) - 1]
    return {"mult": round(g["mult"], 3), "null_median": round(med, 3),
            "null_95": [round(lo, 3), round(hi, 3)],
            "corrected_mult": round(g["mult"] / med, 3) if med else None,
            "sane": bool(lo <= g["mult"] <= hi)}


def run() -> dict:
    rng = random.Random(SEED)
    rows = build_rows()
    results = [grade_flag(rows, n, pred, rng) for n, (pred, _h) in FLAGS.items()]
    parity = parity_control(rows, rng)

    hand = _hand_set_mults()
    return {
        "_territory": "TERRITORY: A",
        "prereg": "draft/backtest/VARIANCE-MODIFIER-PREREG.md",
        "status": "graded",
        "n_player_seasons": len(rows),
        "graded_seasons": list(GRADED),
        "anchor": "prior-season total (leak-free; no historical projection exists)",
        "statistic": "ratio_sd(flag=1) / ratio_sd(flag=0), pooled across cells",
        "results": results,
        "refused": [{"flag": k, "why": v} for k, v in sorted(REFUSED.items())],
        "negative_control_parity": parity,
        "hand_set_multipliers": {k: round(v, 3) for k, v in hand.items()},
        "limitations": [
            "prior-season total is a cruder anchor than a projection, so these "
            "dispersions are an UPPER bound on dispersion around a real one",
            "survivorship: players with no weekly row in Y are excluded, which "
            "biases every dispersion DOWNWARD",
            "2021/2022 weekly stores are rebuilt offline (exact 2023 reproduction)",
            "fitting sd ratios on 3 seasons of cells is thin, and the deep bands "
            "carrying the most players are the most survivorship-distorted",
        ],
    }


def main() -> int:
    doc = run()
    (HERE / "variance_modifiers.json").write_text(json.dumps(doc, indent=1))
    print(f"{doc['n_player_seasons']} graded player-seasons\n")
    print(f"{'flag':26} {'raw':>9} {'null 95%':>16} {'corrected':>9} "
          f"{'hand-set':>9} {'perm p':>7}  verdict")
    for r in doc["results"]:
        if r["verdict"] in ("NO DATA",):
            print(f"{r['flag']:26} {'—':>9} {'—':>16} {'—':>9} {'—':>8}  "
                  f"NO DATA ({r['why']})")
            continue
        nn = f"[{r['null_95'][0]},{r['null_95'][1]}]"
        print(f"{r['flag']:26} {r['raw_mult']:9.3f} {nn:>16} "
              f"{r['corrected_mult']:9.3f} {(r['hand_set_mult'] or 0):9.3f} "
              f"{r['permutation_p']:7.3f}  {r['verdict']}")
    for r in doc["refused"]:
        print(f"{r['flag']:26} {'REFUSED':>9}  {r['why'][:60]}")
    p = doc["negative_control_parity"]
    print(f"\nnegative control (player-id parity, no mechanism): "
          f"{p['mult']}  sane={p['sane']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
