#!/usr/bin/env python3
# TERRITORY: A
"""WHERE IS THIS LEAGUE'S PROJECTION ERROR RECOVERABLE, AND WHERE IS IT NOISE?

Cory, 2026-11-10: *"How do we actually get better at projecting points for this
specific league? Our edge should be finding the most accurate point predictions
for our league."*

The honest version of that question is not "which position is worst" — it is
"which part of a player's points is a TRAIT we could learn, and which part is
week-to-week noise no model can have." This splits every scoring component that
way, weighted by OUR coefficients, so the answer is about this league rather
than about fantasy football in general.

THE METHOD. For each player-season with >= MIN_WEEKS games, each component's
point contribution (coefficient x stat) gives:
  * BETWEEN sd — the spread of PLAYER AVERAGES. A trait. Projectable.
  * WITHIN sd  — the typical week-to-week swing around a player's own average.
                 Noise, in the sense that no projection can know it in advance.
  * projectable share = between^2 / (between^2 + within^2).

⚠️ WHAT THE FLOOR IS AND IS NOT. A projection that knew every player's TRUE
weekly mean would still miss by the within-player spread, so
floor_MAE ~= within_sd * sqrt(2/pi) for a normal variate. Fantasy points are
RIGHT-SKEWED, so that constant understates the floor — which makes the
"recoverable" gap an UPPER BOUND on what better modelling can win, not a
target. Quoted as such wherever it appears.

⚠️ 2023 IS A BLIND FOLD held by P347's preregistration and is NOT read here.

WHAT IT FOUND, 2026-11-10 (2021/2022/2024/2025/2026, 1,878 player-seasons):

  1. OUR SCORING DIFFERS FROM STANDARD HALF-PPR IN EXACTLY ONE WAY THAT
     MATTERS: pass_td 6.0 against the reference 4.0 (the only other difference,
     st_td, is zero for us and rare). We already re-score provider stat lines
     under our own table, so that arithmetic edge is taken.

  2. AND THAT ONE RULE IS WHY QB IS OUR HARDEST POSITION. `pass_td` carries
     7.69 points of mean QB value with a WITHIN-player sd of 5.65 and is only
     28% projectable — the largest single noise source in the league. Our
     6-point rule amplifies the least predictable component by 50% over
     standard scoring. QB's total projectable share is 32%, the lowest of the
     four, and its live MAE/sd of 0.765 is the worst. QB is hard BECAUSE OF A
     RULE WE CHOSE, not because the position is mysterious.

  3. THE PATTERN THAT TELLS US WHAT TO BUILD: touchdowns are 21-33%
     projectable; VOLUME is 46-60%.
         rush_yd RB 60% · rec WR 56% · rush_yd QB 53% · rec TE 52% · rec_yd ~48%
         rec_td TE 21% · rec_td WR 25% · rush_td QB 27% · pass_td 28%
     So the edge is to project VOLUME precisely and DERIVE touchdowns from it,
     never to guess who scores. That is the `usage` axis, which
     projection_breadth.js reports as having no live arm.

  4. RECOVERABLE ERROR IS ~A THIRD EVERYWHERE, SO VOLUME OF SLOTS DECIDES
     PRIORITY: per week QB has the biggest per-player gap (2.75 pts) but only
     20% of the league's total recoverable error, while WR has 36% because
     there are ~4x as many WR slots. Fix WR first; QB's per-player gap is
     partly our own rule fighting us.

Run: python3 draft/backtest/projectability_by_component.py
"""
from __future__ import annotations

import collections
import json
import math
import pathlib
import statistics as st

ROOT = pathlib.Path(__file__).resolve().parents[2]
CFG = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())["scoring"]
#: 2023 withheld on purpose — P347's blind fold. Do not add it.
SEASONS = [2021, 2022, 2024, 2025, 2026]
BLIND = {2023}
COMPONENTS = {
    "QB": ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "fum_lost"],
    "RB": ["rush_yd", "rush_td", "rec", "rec_yd", "rec_td", "fum_lost"],
    "WR": ["rec", "rec_yd", "rec_td", "rush_yd", "rush_td", "fum_lost"],
    "TE": ["rec", "rec_yd", "rec_td", "fum_lost"],
}
MIN_WEEKS = 6
#: live 2026 per-position MAE and graded slot counts, from
#: draft/data/weekly_own/grades_2026.json (the champion arm, weeks 1-7).
LIVE_MAE = {"QB": (8.274, 250), "RB": (4.260, 599),
            "WR": (3.895, 978), "TE": (3.398, 533)}
K_NORMAL = math.sqrt(2 / math.pi)


def load() -> tuple[dict, dict]:
    assert not (set(SEASONS) & BLIND), "a blind fold is in SEASONS — remove it"
    by = collections.defaultdict(lambda: collections.defaultdict(list))
    pos_of = {}
    for s in SEASONS:
        p = ROOT / "draft" / "backtest" / f"component_stats_{s}.json"
        if not p.exists():
            continue
        for entry in json.loads(p.read_text())["weeks"]:
            for pid, row in (entry.get("players") or {}).items():
                pos = row.get("pos")
                if pos not in COMPONENTS:
                    continue
                key = (s, pid)
                pos_of[key] = pos
                for c in COMPONENTS[pos]:
                    by[key][c].append(float(CFG.get(c, 0.0)) * float(row.get(c) or 0))
    return by, pos_of


def measure() -> dict:
    by, pos_of = load()
    out = {"_territory": "TERRITORY: A — draft/backtest/projectability_by_component.py",
           "_what": ("per-component between/within variance under THIS league's "
                     "scoring; projectable share and an optimistic MAE floor"),
           "_blind_folds_excluded": sorted(BLIND),
           "seasons": SEASONS, "positions": {}}
    for pos, comps in COMPONENTS.items():
        keys = [k for k, v in by.items()
                if pos_of[k] == pos and len(v[comps[0]]) >= MIN_WEEKS]
        if len(keys) < 20:
            out["positions"][pos] = {"status": f"only {len(keys)} player-seasons"}
            continue
        rows, tb, tw = {}, 0.0, 0.0
        for c in comps:
            means = [st.mean(by[k][c]) for k in keys]
            withins = [st.pstdev(by[k][c]) for k in keys if len(by[k][c]) > 1]
            b, w = st.pstdev(means), st.mean(withins)
            tb += b * b
            tw += w * w
            rows[c] = {"mean_pts": round(st.mean(means), 3),
                       "between_sd": round(b, 3), "within_sd": round(w, 3),
                       "projectable": round(b * b / (b * b + w * w), 4) if (b or w) else None}
        within_total = math.sqrt(tw)
        floor = K_NORMAL * within_total
        mae, n = LIVE_MAE[pos]
        out["positions"][pos] = {
            "n_player_seasons": len(keys), "components": rows,
            "projectable_share": round(tb / (tb + tw), 4),
            "within_sd_total": round(within_total, 3),
            "optimistic_floor_mae": round(floor, 3),
            "live_mae_2026": mae, "graded_slots_2026": n,
            "recoverable_per_week": round(mae - floor, 3),
            "recoverable_share_of_live_mae": round((mae - floor) / mae, 4),
            "recoverable_x_slots": round((mae - floor) * n, 1),
            "_floor_caveat": ("normal-variate constant on right-skewed points, so "
                              "the floor is OPTIMISTIC and the recoverable gap is "
                              "an UPPER bound, not a target"),
        }
    tot = sum(v["recoverable_x_slots"] for v in out["positions"].values()
              if "recoverable_x_slots" in v)
    for pos, v in out["positions"].items():
        if "recoverable_x_slots" in v:
            v["share_of_all_recoverable"] = round(v["recoverable_x_slots"] / tot, 4)
    return out


def main() -> int:
    d = measure()
    (ROOT / "draft" / "data" / "projectability_by_component.json").write_text(
        json.dumps(d, indent=1) + "\n")
    print(f"seasons {d['seasons']}  (blind folds excluded: {d['_blind_folds_excluded']})\n")
    for pos in ("QB", "RB", "WR", "TE"):
        v = d["positions"][pos]
        if "components" not in v:
            print(f"{pos}: {v['status']}"); continue
        print(f"=== {pos} — {v['n_player_seasons']} player-seasons, "
              f"{v['projectable_share']:.0%} projectable overall ===")
        print(f"  {'component':<10}{'mean pts':>9}{'between':>9}{'within':>8}{'projectable':>13}")
        for c, r in sorted(v["components"].items(),
                           key=lambda kv: -(kv[1]["between_sd"] ** 2 + kv[1]["within_sd"] ** 2)):
            print(f"  {c:<10}{r['mean_pts']:>9.2f}{r['between_sd']:>9.2f}"
                  f"{r['within_sd']:>8.2f}{r['projectable']:>12.0%}")
        print(f"  live MAE {v['live_mae_2026']:.3f} · optimistic floor "
              f"{v['optimistic_floor_mae']:.2f} · recoverable "
              f"{v['recoverable_per_week']:.2f}/wk "
              f"({v['recoverable_share_of_live_mae']:.0%}) · "
              f"{v['share_of_all_recoverable']:.0%} of all recoverable error\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
