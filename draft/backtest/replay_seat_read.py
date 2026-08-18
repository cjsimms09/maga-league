# TERRITORY: D
"""HOW THE ALL-SEATS REPLAY SHOULD BE READ — and whether "best drafter" is in it.

`replay_league_table.json` (TERRITORY: A) is the project's headline edge
measurement. Four prose files quote ONE cell of it — ds7mmet's seat, -163.43 —
and label that owner "the league's best drafter".

The artifact's own `honesty` list forbids exactly that read:

    "the drafter-skill ranking is tool-independent ... but surplus is skill +
     luck on ~36 picks per owner; only the top3-vs-bottom-half group contrast
     is quotable"

and the audit doc's preregistered small-n rule says:

    "No 'best drafter' is crowned on a margin the table itself can't support"

This module recomputes the read. It reads A's artifact, joins each seat's tool
delta to that owner's tool-INDEPENDENT drafter rank, and asks the one question
the headline presumes an answer to: does the tool's per-seat delta track how
good the opposing drafter is?

Rule 3d applies to the answer, so the permutation null carries a known-positive
control: the same statistic is run against a variable it MUST correlate with
(each owner's own delta), and the check fails if that control does not fire.

Emits: draft/backtest/replay_seat_read.json
Run:   python draft/backtest/replay_seat_read.py
"""
from __future__ import annotations

import json
import random
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "draft" / "data" / "replay_league_table.json"
#: Read (never written) only to express the floor as a share of the model's own
#: error. Its `baseline_mae` is own_v6's weekly MAE over the 2023/24 joined
#: population -- the same units a projection study reports.
WEEKLY_ARM = ROOT / "draft" / "backtest" / "vegas_team_arm.json"
OUT = Path(__file__).with_suffix(".json")

PERMUTATIONS = 5000
SEED = 20260818

#: To compare a projection study's DeltaMAE (points per player-week) against a
#: seat delta (points per season) they must share units. This is the GENEROUS
#: conversion: it assumes every point of projection error removed becomes a
#: point of starter production, which is an upper bound and not a claim -- a
#: better projection only helps through better RANKING, and the replay's own
#: policy does not convert accuracy into picks one-for-one.
#:
#: 9 starters (sleeper_league_settings.json roster_positions, BN excluded) x
#: 15 scored regular-season weeks (playoff_week_start 16).
STARTER_WEEKS_PER_SEASON = 9 * 15


def _rank(values: list[float]) -> list[float]:
    """Average ranks, ties shared."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        shared = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = shared
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float:
    ra, rb = _rank(a), _rank(b)
    n = len(ra)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return 0.0 if den == 0 else num / den


def permutation_p(a: list[float], b: list[float], seed: int) -> tuple[float, float]:
    """Two-sided p for |rho| under label shuffling, and the null's p95."""
    obs = spearman(a, b)
    rng = random.Random(seed)
    shuffled = list(b)
    hits, draws = 0, []
    for _ in range(PERMUTATIONS):
        rng.shuffle(shuffled)
        r = spearman(a, shuffled)
        draws.append(abs(r))
        if abs(r) >= abs(obs):
            hits += 1
    draws.sort()
    return (hits + 1) / (PERMUTATIONS + 1), draws[int(0.95 * len(draws))]


def load() -> dict:
    table = json.loads(TABLE.read_text())
    baseline = table["pooled"]["baseline"]
    skill = {r["owner"]: r["surplus_per_pick"] for r in table["drafter_study"]["ranking"]}
    rank = {r["owner"]: r["rank"] for r in table["drafter_study"]["ranking"]}

    seats = []
    for seat, row in baseline.items():
        if seat == "_summary":
            continue
        owner = row["owner"]
        seats.append(
            {
                "seat": int(seat),
                "owner": owner,
                "tool_delta_realistic": row["realistic"]["mean_delta"],
                "tool_delta_optimal": row["optimal"]["mean_delta"],
                "per_year": row["realistic"]["per_year"],
                "drafter_surplus_per_pick": skill[owner],
                "drafter_rank": rank[owner],
            }
        )
    seats.sort(key=lambda s: s["tool_delta_realistic"])
    return {"table": table, "seats": seats}


def main() -> dict:
    data = load()
    seats = data["seats"]

    deltas = [s["tool_delta_realistic"] for s in seats]
    skills = [s["drafter_surplus_per_pick"] for s in seats]
    seat_years = [v for s in seats for v in s["per_year"].values()]

    rho = spearman(deltas, skills)
    p, null_p95 = permutation_p(deltas, skills, SEED)

    # KNOWN-POSITIVE CONTROL: the statistic against a variable it MUST track.
    # If this does not fire, the test above could not have fired either.
    control_rho = spearman(deltas, [s["tool_delta_optimal"] for s in seats])
    control_p, _ = permutation_p(
        deltas, [s["tool_delta_optimal"] for s in seats], SEED + 1
    )

    worst = seats[0]
    best_drafter = min(seats, key=lambda s: s["drafter_rank"])

    n = len(seat_years)
    sd = st.pstdev(seat_years)
    mean = st.mean(seat_years)
    mde_weekly = 1.96 * sd / n**0.5 / STARTER_WEEKS_PER_SEASON
    arm = json.loads(WEEKLY_ARM.read_text())
    baseline_mae = st.mean(s["baseline_mae"] for s in arm["seasons"].values())

    result = {
        "_territory": "TERRITORY: D — reads draft/data/replay_league_table.json, never writes it",
        "_question": "does the tool's per-seat delta track how good the opposing drafter is?",
        "source": "draft/data/replay_league_table.json",
        "seats": seats,
        "spread": {
            "seat_years": n,
            "mean": round(mean, 2),
            "sd": round(sd, 2),
            "sd_over_abs_mean": round(sd / abs(mean), 2),
            "positive": sum(1 for v in seat_years if v > 0),
            "min": min(seat_years),
            "max": max(seat_years),
            "seat_means_mean": round(st.mean(deltas), 2),
            "seat_means_sd": round(st.pstdev(deltas), 2),
            "seats_tool_wins": sum(1 for v in deltas if v > 0),
            # The binding constraint on every future edge claim: with this
            # spread, an improvement smaller than this cannot be seen in 30
            # samples. OPTIMISTIC — seat-years inside a year share a board
            # vintage and a player pool, so the true floor is higher.
            "se_of_mean": round(sd / n**0.5, 2),
            "min_detectable_effect_95pct": round(1.96 * sd / n**0.5, 1),
            "starter_weeks_per_season": STARTER_WEEKS_PER_SEASON,
            # The same floor expressed in the units a projection study reports,
            # so the two can be compared without hand-waving.
            "min_detectable_delta_mae_per_player_week": round(mde_weekly, 4),
            "model_baseline_weekly_mae": round(baseline_mae, 4),
            "baseline_source": "vegas_team_arm.json (own_v6, 2023/24 joined rows)",
            # THE READABLE FORM. Not "orders of magnitude" -- a share of the
            # error the projection model actually makes.
            "min_detectable_effect_as_pct_of_model_error": round(
                100 * mde_weekly / baseline_mae, 1
            ),
        },
        "skill_tracking": {
            "spearman_delta_vs_drafter_skill": round(rho, 3),
            "permutation_p": round(p, 4),
            "null_p95_abs_rho": round(null_p95, 3),
            "n_seats": len(seats),
            "fires": p < 0.05,
        },
        "known_positive_control": {
            "what": "same statistic, realistic vs optimal arm in the same seats",
            "spearman": round(control_rho, 3),
            "permutation_p": round(control_p, 4),
            "fires": control_p < 0.05,
        },
        "the_claim_under_test": {
            "quoted_in": [
                "CLAUDE.md",
                "OWNERS.md",
                "ROUTES.md (two entries)",
            ],
            "quoted_as": "the tool ties Cory (-6.5) and loses to the league's best drafter (-163)",
            "worst_seat_owner": worst["owner"],
            "worst_seat_delta": worst["tool_delta_realistic"],
            "worst_seat_owner_drafter_rank": worst["drafter_rank"],
            "actual_best_drafter": best_drafter["owner"],
            "actual_best_drafter_rank": best_drafter["drafter_rank"],
            "tool_delta_vs_actual_best_drafter": best_drafter["tool_delta_realistic"],
            "claim_holds": worst["drafter_rank"] == 1,
        },
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    return result


if __name__ == "__main__":
    r = main()
    s, k, c, cl = (
        r["spread"],
        r["skill_tracking"],
        r["known_positive_control"],
        r["the_claim_under_test"],
    )
    print(f"{'owner':13s} {'seat':>4s} {'toolD':>8s} {'skill/pick':>10s} {'rank':>4s}")
    for row in r["seats"]:
        print(
            f"{row['owner']:13s} {row['seat']:>4d} {row['tool_delta_realistic']:8.1f} "
            f"{row['drafter_surplus_per_pick']:10.2f} {row['drafter_rank']:>4d}"
        )
    print()
    print(
        f"spread: {s['seat_years']} seat-years, mean {s['mean']:+.1f}, sd {s['sd']:.1f} "
        f"({s['sd_over_abs_mean']}x the mean), {s['positive']}/{s['seat_years']} positive"
    )
    print(
        f"floor in study units: {s['min_detectable_delta_mae_per_player_week']:.3f} "
        f"MAE pts/player-week = {s['min_detectable_effect_as_pct_of_model_error']}% "
        f"of own_v6's own weekly error ({s['model_baseline_weekly_mae']:.2f})"
    )
    print(
        f"skill tracking: rho {k['spearman_delta_vs_drafter_skill']:+.3f}, "
        f"p={k['permutation_p']}, fires={k['fires']}"
    )
    print(
        f"control:        rho {c['spearman']:+.3f}, p={c['permutation_p']}, "
        f"fires={c['fires']}"
    )
    print()
    print(
        f"worst seat is {cl['worst_seat_owner']} ({cl['worst_seat_delta']:+.1f}), "
        f"drafter rank {cl['worst_seat_owner_drafter_rank']} of 10"
    )
    print(
        f"actual rank-1 drafter is {cl['actual_best_drafter']}; "
        f"tool delta there {cl['tool_delta_vs_actual_best_drafter']:+.1f}"
    )
    print(f"CLAIM HOLDS: {cl['claim_holds']}")
