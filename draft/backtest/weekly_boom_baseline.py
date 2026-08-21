#!/usr/bin/env python3
# TERRITORY: D
"""THE WEEKLY BOOM BASELINE — the null every weekly-boom feature must beat.

Relay, ROUTES.md 2026-08-20, ASK 2 of the "two runnable-today builds" row:
"P(top-12 positional week) as a measured base rate per position x season,
2021-25, from the nflverse weekly stores — the null every weekly-boom
feature must beat, committed BEFORE any feature grades against it."

PREREGISTERED in `draft/WEEKLY-BOOM-BASELINE-PREREG-2026-08-21.md`, committed
before this file existed and before any rate was computed. The boom
definition, the tier buckets, the stability metric and the blind call all
come from that file; this module's job is to compute exactly what it
specifies.

TWO THINGS THE PREREG NAMES THAT THIS FILE ENFORCES IN CODE:

  1. THE DEGENERATE READING IS LABELED, NOT HIDDEN. The unconditional
     P(top-12 positional week) over the whole population is mechanically
     12/N_that_week and carries no football information. It is computed and
     emitted under `degenerate_unconditional` with its own warning string,
     because a number this easy to recompute will otherwise be quoted as a
     finding by someone who did not read the prereg.

  2. K/DEF ARE OUT OF SCOPE WITH A REASON. The component store's own
     `provenance.position_groups` is ["QB","RB","WR","TE"] — there is no
     kicker or defense row in this population at all. Emitted as
     `positions_out_of_scope` with the reason, never silently omitted.

REUSE, NOT REIMPLEMENTATION (Rule 11): `game_script_usage_interaction`'s
`load_component`, `load_points` and `prior_season_ppg` are imported, not
re-derived — the same prior-season-PPG construction the P286 and P292
studies were already graded on, so the tier buckets here mean the same
thing they mean there.

Zero-network: reads only committed files.

Run:  python3 draft/backtest/weekly_boom_baseline.py
      [--out draft/backtest/weekly_boom_baseline.json]
Test: python3 -m pytest draft/tests/test_weekly_boom_baseline.py -q
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import game_script_usage_interaction as GSI  # noqa: E402 — TERRITORY: D, imported not modified

POSITIONS = ("QB", "RB", "WR", "TE")
POSITIONS_OUT_OF_SCOPE = ("K", "DEF")
ALL_SEASONS = (2021, 2022, 2023, 2024, 2025)
TARGET_SEASONS = (2022, 2023, 2024, 2025)  # a tier needs a Y-1 season on disk.
BOOM_RANK = 12
MIN_GAMES = 4  # reused from own_model_v5.MU_MIN_GAMES via GSI.

#: prereg S3 — prior-season positional PPG rank buckets.
TIERS = (("T1", 1, 12), ("T2", 13, 24), ("T3", 25, 36), ("T4", 37, 10 ** 6))


def tier_of(rank: int) -> str:
    for name, lo, hi in TIERS:
        if lo <= rank <= hi:
            return name
    raise ValueError(f"rank {rank} fell through every tier bucket")


def positions_by_player_week(component_doc: dict) -> dict:
    """{(week, pid): pos} from the component store's own per-week `pos`.

    This is the join the prereg's S0 correction rests on: the weekly-points
    store is REBUILT from this component store and inherits its population,
    so this map covers the scoring population by construction. That is a
    tautology, not a validation — `coverage` in the output records it as
    one so the number is never re-read as evidence of a healthy join.
    """
    out = {}
    for wk in component_doc.get("weeks", []):
        for pid, r in (wk.get("players") or {}).items():
            pos = r.get("pos")
            if pos:
                out[(wk["week"], str(pid))] = pos
    return out


def weekly_scores(points_doc: dict, pos_map: dict) -> tuple[dict, dict]:
    """({(pos, week): [(pid, points)]}, coverage counts).

    A scoring row with no position label is COUNTED in `unlabeled`, never
    dropped silently and never assigned a guessed position.
    """
    by_pos_week: dict = {}
    coverage = {"scoring_player_weeks": 0, "labeled": 0, "unlabeled": 0,
                "out_of_scope_position": 0}
    for wk in points_doc.get("weeks", []):
        week = wk.get("week")
        for pid, pts in (wk.get("points") or {}).items():
            coverage["scoring_player_weeks"] += 1
            pos = pos_map.get((week, str(pid)))
            if pos is None:
                coverage["unlabeled"] += 1
                continue
            coverage["labeled"] += 1
            if pos not in POSITIONS:
                coverage["out_of_scope_position"] += 1
                continue
            by_pos_week.setdefault((pos, week), []).append((str(pid), float(pts)))
    return by_pos_week, coverage


def boom_sets(by_pos_week: dict) -> tuple[dict, dict]:
    """({(pos, week): set(pid)}, tie diagnostics).

    The top-BOOM_RANK scorers at a position that week. Ties AT the cutoff are
    reported rather than resolved cleverly — the store's own ordering breaks
    them, and how often that matters is a number the reader should see.
    """
    out, ties = {}, {"weeks_with_a_cutoff_tie": 0, "weeks": 0}
    for key, rows in by_pos_week.items():
        ties["weeks"] += 1
        ranked = sorted(rows, key=lambda r: -r[1])
        if len(ranked) > BOOM_RANK:
            if ranked[BOOM_RANK - 1][1] == ranked[BOOM_RANK][1]:
                ties["weeks_with_a_cutoff_tie"] += 1
        out[key] = {pid for pid, _ in ranked[:BOOM_RANK]}
    return out, ties


def synthetic_control_season(n_others: int = 30, weeks: int = 5) -> dict:
    """A season where `star` outscores everyone every week and `bench` scores
    zero every week; everyone else is mid-pack.

    MOVED HERE FROM THE TEST at register 198. It used to live only in
    `test_weekly_boom_baseline.py`, which meant the fixture and the assertions
    it feeds could not be reached by the run that writes the artifact. The
    test now imports THIS one, so there is a single definition and the two
    callers cannot drift (Rule 11).
    """
    by_pos_week = {}
    for w in range(1, weeks + 1):
        rows = [("star", 100.0), ("bench", 0.0)]
        rows += [(f"p{i}", 10.0 + i) for i in range(n_others)]
        by_pos_week[("WR", w)] = rows
    return by_pos_week


def controls() -> dict:
    """THE TWO CONTROLS — `GRADING-POLICY.md` requirement 3, register 198.

    known-POSITIVE — a planted every-week top scorer must come back at boom
    rate exactly 1.0.
    known-NEGATIVE — a planted never-scorer must come back at exactly 0.0.

    A harness that cannot produce those two is not measuring booms, and every
    rate in the artifact would be meaningless while looking entirely normal —
    which is the whole reason this study's degenerate unconditional reading is
    labeled in the artifact rather than trusted.
    """
    booms, _ties = boom_sets(synthetic_control_season())
    weeks = [k for k in booms if k[0] == "WR"]
    star = sum(1 for k in weeks if "star" in booms[k])
    bench = sum(1 for k in weeks if "bench" in booms[k])
    checks = [
        {"control": "fixture", "case": "the synthetic season built any weeks at all",
         "want": "> 0", "got": len(weeks), "ok": bool(weeks)},
        {"control": "known-positive", "case": "planted every-week top scorer booms every week",
         "want": len(weeks), "got": star, "ok": bool(weeks) and star == len(weeks)},
        {"control": "known-negative", "case": "planted never-scorer booms in no week",
         "want": 0, "got": bench, "ok": bench == 0},
    ]
    return {"ok": all(c["ok"] for c in checks), "checks": checks}


def print_controls(res: dict) -> None:
    bad = [c for c in res["checks"] if not c["ok"]]
    print(f"  controls: {len(res['checks']) - len(bad)}/{len(res['checks'])} pass")
    for c in bad:
        print(f"    RED  {c['control']} — {c['case']}: want {c['want']}, got {c['got']}")


def cli() -> int:
    """The exit code IS the verdict — register 198."""
    res = controls()
    print_controls(res)
    if not res["ok"]:
        print("\n  \u26d4 REFUSING: a control failed, so nothing below would be "
              "evidence of anything. Artifact NOT written.")
        return 1
    main()
    return 0


def prior_season_tiers(season: int) -> dict:
    """{pid: (pos, tier, prior_ppg)} from season Y-1 only.

    Rank is WITHIN position, over players clearing MIN_GAMES in Y-1 —
    so a tier means "he finished T1 at his own position last year," which
    is the thing a boom feature would have to beat.
    """
    prior = season - 1
    pos_map = positions_by_player_week(GSI.load_component(prior))
    ppg = GSI.prior_season_ppg(GSI.load_points(prior))

    pos_of: dict = {}
    for (_wk, pid), pos in pos_map.items():
        pos_of.setdefault(pid, pos)

    by_pos: dict = {}
    for pid, v in ppg.items():
        pos = pos_of.get(str(pid))
        if pos in POSITIONS:
            by_pos.setdefault(pos, []).append((str(pid), v))

    out = {}
    for pos, rows in by_pos.items():
        for rank, (pid, v) in enumerate(sorted(rows, key=lambda r: -r[1]), start=1):
            out[pid] = (pos, tier_of(rank), v)
    return out


def grade_season(season: int) -> dict:
    pos_map = positions_by_player_week(GSI.load_component(season))
    by_pos_week, coverage = weekly_scores(GSI.load_points(season), pos_map)
    booms, ties = boom_sets(by_pos_week)
    tiers = prior_season_tiers(season)

    # conditional: P(boom | pos, tier) over every eligible player's every
    # recorded week this season.
    hits: dict = {}
    weeks_seen: dict = {}
    for (pos, week), rows in by_pos_week.items():
        boom_pids = booms[(pos, week)]
        for pid, _pts in rows:
            t = tiers.get(pid)
            if t is None or t[0] != pos:
                continue  # no prior-season tier (rookie, <MIN_GAMES, or moved position)
            key = (pos, t[1])
            weeks_seen[key] = weeks_seen.get(key, 0) + 1
            if pid in boom_pids:
                hits[key] = hits.get(key, 0) + 1

    conditional = {}
    for pos in POSITIONS:
        for name, _lo, _hi in TIERS:
            key = (pos, name)
            n = weeks_seen.get(key, 0)
            conditional.setdefault(pos, {})[name] = {
                "player_weeks": n,
                "booms": hits.get(key, 0),
                "boom_rate": round(hits.get(key, 0) / n, 4) if n else None,
            }

    # the degenerate reading, computed and LABELED (prereg S2).
    degenerate = {}
    for pos in POSITIONS:
        wk_rows = [(w, rows) for (p, w), rows in by_pos_week.items() if p == pos]
        total = sum(len(rows) for _w, rows in wk_rows)
        boomed = sum(min(BOOM_RANK, len(rows)) for _w, rows in wk_rows)
        degenerate[pos] = {
            "player_weeks": total,
            "mean_players_per_week": round(total / len(wk_rows), 1) if wk_rows else None,
            "rate": round(boomed / total, 4) if total else None,
        }

    return {
        "season": season,
        "coverage": coverage,
        "cutoff_ties": ties,
        "conditional": conditional,
        "degenerate_unconditional": degenerate,
    }


def stability(seasons: list) -> dict:
    """prereg S4: range (max - min) of the T1 boom rate across target seasons.
    Lowest range = most stable."""
    out = {}
    for pos in POSITIONS:
        vals = []
        for s in seasons:
            r = s["conditional"][pos]["T1"]["boom_rate"]
            if r is not None:
                vals.append((s["season"], r))
        if not vals:
            out[pos] = None
            continue
        rates = [v for _s, v in vals]
        out[pos] = {
            "by_season": {str(s): v for s, v in vals},
            "min": min(rates), "max": max(rates),
            "range": round(max(rates) - min(rates), 4),
        }
    ranked = sorted((p for p in POSITIONS if out.get(p)),
                    key=lambda p: out[p]["range"])
    return {"t1_boom_rate": out,
            "most_stable": ranked[0] if ranked else None,
            "least_stable": ranked[-1] if ranked else None,
            "ranked_most_to_least_stable": ranked}


def main() -> dict:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "weekly_boom_baseline.json"))
    args = ap.parse_args()

    seasons = [grade_season(y) for y in TARGET_SEASONS]
    stab = stability(seasons)

    doc = {
        "_territory": "TERRITORY: D — produced by draft/backtest/weekly_boom_baseline.py",
        "_note": ("The null every weekly-boom feature must beat: P(top-12 positional "
                  "week | position, prior-season tier). Preregistered in "
                  "draft/WEEKLY-BOOM-BASELINE-PREREG-2026-08-21.md before any rate "
                  "was computed."),
        "prereg": "draft/WEEKLY-BOOM-BASELINE-PREREG-2026-08-21.md",
        "boom_rank": BOOM_RANK,
        "tiers": {name: [lo, hi] for name, lo, hi in TIERS},
        "min_games": MIN_GAMES,
        "target_seasons": list(TARGET_SEASONS),
        "positions": list(POSITIONS),
        "positions_out_of_scope": {
            "positions": list(POSITIONS_OUT_OF_SCOPE),
            "reason": ("the component store's own provenance.position_groups is "
                       "['QB','RB','WR','TE'] — there is no K or DEF row in this "
                       "population at all, so a boom rate for them is not "
                       "computable here. Declared, not silently omitted."),
        },
        "coverage_is_a_tautology": (
            "nflverse_weekly_points_<season>.json is REBUILT from component_stats_"
            "<season>.json and inherits its population (that store's own _note), so "
            "the position-label coverage below is 100% BY CONSTRUCTION. It is not "
            "evidence of a healthy join — there is no join to lose."),
        "degenerate_reading_warning": (
            "`degenerate_unconditional` is mechanically 12/N_players_that_week and "
            "carries NO football information. It is emitted only so it is not "
            "recomputed elsewhere and quoted as a finding. The usable null is "
            "`conditional`."),
        "seasons": seasons,
        "stability": stab,
    }
    Path(args.out).write_text(json.dumps(doc, indent=2))

    print(f"WEEKLY BOOM BASELINE — top-{BOOM_RANK}, {TARGET_SEASONS[0]}-{TARGET_SEASONS[-1]}")
    print(f"  positions out of scope: {list(POSITIONS_OUT_OF_SCOPE)} "
          f"(no rows in the population)")
    for s in seasons:
        c = s["coverage"]
        print(f"\n  {s['season']}: {c['scoring_player_weeks']} scoring player-weeks, "
              f"{c['unlabeled']} unlabeled, {c['out_of_scope_position']} out-of-scope pos"
              f"  | cutoff ties: {s['cutoff_ties']['weeks_with_a_cutoff_tie']}"
              f"/{s['cutoff_ties']['weeks']} weeks")
        for pos in POSITIONS:
            cells = s["conditional"][pos]
            parts = " ".join(
                f"{t}={cells[t]['boom_rate'] if cells[t]['boom_rate'] is not None else '--'}"
                f"(n{cells[t]['player_weeks']})" for t, _lo, _hi in TIERS)
            print(f"    {pos:3s} {parts}")
    print("\n  T1 BOOM-RATE STABILITY (range across target seasons; lower = more stable):")
    for pos in POSITIONS:
        d = stab["t1_boom_rate"][pos]
        if not d:
            print(f"    {pos:3s} --")
            continue
        by = " ".join(f"{s}:{v}" for s, v in d["by_season"].items())
        print(f"    {pos:3s} range={d['range']:.4f}   {by}")
    print(f"\n  most stable: {stab['most_stable']}   least stable: {stab['least_stable']}")
    print(f"  ranked: {' < '.join(stab['ranked_most_to_least_stable'])}")
    return doc


if __name__ == "__main__":
    sys.exit(cli())
