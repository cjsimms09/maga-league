#!/usr/bin/env python3
# TERRITORY: A
"""THE USAGE ARM: PROJECT VOLUME, DERIVE TOUCHDOWNS — WALK-FORWARD, NOT LIVE.

Cory, 2026-11-10: *"How do we actually get better at projecting points for this
specific league?"*

THE THESIS, AND IT COMES FROM A MEASUREMENT RATHER THAN A HUNCH.
`projectability_by_component.py` split every scoring component into the part
that is a player TRAIT and the part that is week-to-week noise, under OUR
coefficients, over 1,878 player-seasons:

    volume      rush_yd RB 60% · rec WR 56% · rush_yd QB 53% · rec TE 52%
    touchdowns  rec_td TE 21% · rec_td WR 25% · rush_td QB 27% · pass_td 28%

Volume is roughly twice as projectable as scoring. So a projection that carries
a player's OWN trailing touchdowns forward is carrying mostly noise, and one
that projects volume and applies a TOUCHDOWN RATE to it should beat it. That is
the whole claim, and it is falsifiable in one number.

THE TWO ARMS, scored under this league's table so the comparison is about this
league:
  * `trailing_points` — the NULL. Mean of the player's own realized points over
    the trailing window. This is what "use recent form" means, and it is the
    thing to beat; a volume model that cannot beat it has earned nothing.
  * `usage_volume`    — projects each VOLUME component from the player's
    trailing mean, then replaces his trailing touchdowns with a POSITION-LEVEL
    rate per projected yard. Everything else identical.

WALK-FORWARD, STRICTLY. Week w is projected from weeks < w of the SAME season
only. No cross-season carry, no future weeks, no league rate computed on the
week being scored — the rate itself comes from prior weeks only. An arm that
sees the week it is pricing is the exp33 leak in a new costume.

⚠️ 2023 IS A BLIND FOLD held by P347's prereg. `FOLDS` excludes it and `main`
asserts that it is excluded.

⚠️ WHAT THIS IS NOT. It is NOT live and it does not enter `DEFAULT_ARMS`.
BLEND-SEARCH-DESIGN §4: *"An arm needs a full season of walk-forward grading
and a clean null before it prices anything Cory acts on."* This file is that
grading. Promotion is a separate, Cory-facing decision with the best-of-K gate
in front of it.

Run: python3 draft/backtest/usage_volume_arm.py
"""
from __future__ import annotations

import collections
import json
import math
import pathlib
import statistics as st

ROOT = pathlib.Path(__file__).resolve().parents[2]
CFG = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())["scoring"]
BLIND_FOLDS = {2023}
FOLDS = (2021, 2022, 2024, 2025)
#: weeks of history before a player is priced at all. 3 is the live promotion
#: rule's own minimum (PROMOTION_MIN_WEEKS) rather than a new constant.
MIN_TRAIL = 3
POSITIONS = ("QB", "RB", "WR", "TE")
#: the volume components per position, and the yardage each position's
#: touchdowns are earned through.
VOLUME = {
    "QB": (["pass_yd", "rush_yd", "pass_int", "fum_lost"],
           {"pass_td": "pass_yd", "rush_td": "rush_yd"}),
    "RB": (["rush_yd", "rec", "rec_yd", "fum_lost"],
           {"rush_td": "rush_yd", "rec_td": "rec_yd"}),
    "WR": (["rec", "rec_yd", "rush_yd", "fum_lost"],
           {"rec_td": "rec_yd", "rush_td": "rush_yd"}),
    "TE": (["rec", "rec_yd", "fum_lost"], {"rec_td": "rec_yd"}),
}


def load_weeks(season: int) -> list:
    p = ROOT / "draft" / "backtest" / f"component_stats_{season}.json"
    if not p.exists():
        return []
    out = []
    for entry in json.loads(p.read_text())["weeks"]:
        out.append((int(entry["week"]), entry.get("players") or {}))
    return sorted(out, key=lambda x: x[0])


def points(line: dict) -> float:
    """Our scoring, applied to a component line."""
    return sum(float(CFG.get(k, 0.0)) * float(line.get(k) or 0) for k in line)


def grade_season(season: int) -> dict:
    """Walk forward through one season, scoring both arms on identical cells."""
    weeks = load_weeks(season)
    if not weeks:
        return {"status": f"no component store for {season}"}
    hist: dict = collections.defaultdict(list)          # pid -> [(week, line)]
    #: league touchdown rate per yard, accumulated from PRIOR weeks only
    td_yd: dict = collections.defaultdict(lambda: [0.0, 0.0])   # (pos,td_key) -> [tds, yds]
    rows = []
    for week, players in weeks:
        for pid, line in players.items():
            pos = line.get("pos")
            if pos not in POSITIONS:
                continue
            past = hist[pid]
            if len(past) < MIN_TRAIL:
                continue
            vol_keys, td_map = VOLUME[pos]
            actual = points({k: line.get(k) for k in line if k in CFG})

            # ── the NULL: mean of his own realized points so far
            null_proj = st.mean(points({k: l.get(k) for k in l if k in CFG})
                                for _w, l in past)

            # ── the ARM: trailing volume, touchdowns from a position rate
            proj_line = {}
            for k in vol_keys:
                proj_line[k] = st.mean(float(l.get(k) or 0) for _w, l in past)
            for td_key, yd_key in td_map.items():
                tds, yds = td_yd[(pos, td_key)]
                rate = (tds / yds) if yds > 50 else None
                if rate is None:
                    #: no prior league rate yet => fall back to his own trailing
                    #: mean, and say so rather than silently scoring zero
                    proj_line[td_key] = st.mean(float(l.get(td_key) or 0) for _w, l in past)
                else:
                    proj_line[td_key] = rate * proj_line.get(yd_key, 0.0)
            arm_proj = points(proj_line)
            rows.append({"pid": pid, "pos": pos, "week": week, "actual": actual,
                         "null": null_proj, "arm": arm_proj})
        # ── only AFTER scoring the week does it enter history or the rate
        for pid, line in players.items():
            pos = line.get("pos")
            if pos not in POSITIONS:
                continue
            hist[pid].append((week, line))
            for td_key, yd_key in VOLUME[pos][1].items():
                td_yd[(pos, td_key)][0] += float(line.get(td_key) or 0)
                td_yd[(pos, td_key)][1] += float(line.get(yd_key) or 0)
    return {"status": "graded", "rows": rows}


def summarise(rows: list) -> dict:
    out = {}
    for pos in POSITIONS + ("ALL",):
        sub = rows if pos == "ALL" else [r for r in rows if r["pos"] == pos]
        if len(sub) < 30:
            out[pos] = {"status": f"only {len(sub)} cells"}
            continue
        n_mae = st.mean(abs(r["null"] - r["actual"]) for r in sub)
        a_mae = st.mean(abs(r["arm"] - r["actual"]) for r in sub)
        #: PAIRED on identical cells, which is the only honest comparison here
        diffs = [abs(r["null"] - r["actual"]) - abs(r["arm"] - r["actual"]) for r in sub]
        m = st.mean(diffs)
        se = st.stdev(diffs) / math.sqrt(len(diffs)) if len(diffs) > 1 else 0.0
        out[pos] = {"n": len(sub), "null_mae": round(n_mae, 4), "arm_mae": round(a_mae, 4),
                    "arm_advantage": round(m, 4),
                    "ci95": [round(m - 1.96 * se, 4), round(m + 1.96 * se, 4)],
                    "arm_better_share": round(
                        sum(1 for d in diffs if d > 0) / len(diffs), 4)}
    return out


def main() -> int:
    assert not (set(FOLDS) & BLIND_FOLDS), "a blind fold is in FOLDS — remove it"
    print(f"folds {list(FOLDS)} (blind, excluded: {sorted(BLIND_FOLDS)})")
    print("null = the player's own trailing mean POINTS; "
          "arm = trailing VOLUME + a position TD rate\n")
    per_fold, pooled = {}, []
    for season in FOLDS:
        g = grade_season(season)
        if g.get("status") != "graded":
            print(f"{season}: {g.get('status')}"); continue
        pooled += g["rows"]
        per_fold[season] = summarise(g["rows"])
        a = per_fold[season]["ALL"]
        print(f"{season}: n={a['n']:<6} null MAE {a['null_mae']:.3f}  "
              f"arm MAE {a['arm_mae']:.3f}  advantage {a['arm_advantage']:+.3f} "
              f"CI {a['ci95']}")
    if not pooled:
        print("\nnothing graded"); return 1
    print()
    all_sum = summarise(pooled)
    print(f"{'pos':<5}{'n':>7}{'null MAE':>10}{'arm MAE':>9}{'advantage':>11}"
          f"{'95% CI':>22}{'arm better':>12}")
    for pos in POSITIONS + ("ALL",):
        s = all_sum[pos]
        if "n" not in s:
            print(f"{pos:<5}{s['status']:>7}"); continue
        print(f"{pos:<5}{s['n']:>7}{s['null_mae']:>10.3f}{s['arm_mae']:>9.3f}"
              f"{s['arm_advantage']:>+11.3f}"
              f"{str(s['ci95']):>22}{s['arm_better_share']:>11.0%}")
    (ROOT / "draft" / "data" / "usage_volume_arm.json").write_text(json.dumps({
        "_territory": "TERRITORY: A — draft/backtest/usage_volume_arm.py",
        "_what": ("walk-forward: does projecting VOLUME and deriving touchdowns "
                  "from a position rate beat a player's own trailing points?"),
        "_not_live": ("this arm is NOT in DEFAULT_ARMS and prices nothing. "
                      "BLEND-SEARCH-DESIGN §4 requires walk-forward grading and "
                      "a clean null first; promotion is a separate decision with "
                      "the best-of-K gate in front of it."),
        "_blind_folds_excluded": sorted(BLIND_FOLDS),
        "min_trailing_weeks": MIN_TRAIL,
        "per_fold": per_fold, "pooled": all_sum,
    }, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
