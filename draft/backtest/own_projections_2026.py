#!/usr/bin/env python3
"""OUR OWN 2026 PROJECTIONS — wiring lab_projections.walk_forward() to the live board.

`walk_forward()` (lab_projections.py) has existed for a while: a leak-free,
self-derived projection built strictly from prior-season production, scored under
OUR OWN scoring engine, regressed to the positional mean, age-adjusted. It has been
used for backtest replay (exp33/exp35/exp_regression_cv all measure it) but was never
attached to the LIVE 2026 board — the board's own baseline comes from Sleeper's
provider stat line (see projections.py: baseline_from_projections).

WHY THIS DOESN'T NEED THE NETWORK ACCESS THAT'S BEEN BLOCKING EVERYTHING ELSE TODAY.
Every other Lab script that hit `sleeper_import.fetch_players()` needed it to build a
FULL players_meta (name/position/age for the crosswalk AND for walk_forward's own
inputs). We don't need a fresh Sleeper fetch for either: positions and ages for every
2026 board player are already in `public/draft_data.json` (this year's real board,
686 players), and the gsis<->sleeper crosswalk comes from `nfl_data_py.import_ids()`
alone (12,472 rows, both columns present) — grade.py's crosswalk_gsis_to_sleeper()
already prefers this source over the Sleeper-derived one and only falls back to the
latter for a small residual (documented there as 22 of 761 unmapped in an earlier run).

WHAT THIS SCRIPT DOES, AND WHAT IT DELIBERATELY DOES NOT DO.
Computes proj_ownmodel for every player already on the live 2026 board and writes it
alongside the existing proj_sleeper / proj_fantasypros columns — additive, exactly the
pattern FantasyPros was added under (build.py's own comment: "attach FantasyPros
projections... alongside the raw Sleeper baseline... never a build dependency").
It does NOT change proj_mean, proj_baseline, VORP, or anything the live rankings
read — DECISIONS-NEEDED.md #6 is explicit that swapping the projection source needs a
clean grade first ("unlike the ADP anchor... there is NO clean projection grade to
justify a swap yet"), and this script doesn't have one either. It computes the third
number and reports where it agrees and disagrees with what's already there — the same
diagnostic-only posture as the existing FP-vs-Sleeper divergence check (#000).

Run: python draft/backtest/own_projections_2026.py
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(REPO))

BOARD = REPO / "public" / "draft_data.json"
OUT = HERE / "own_projections_2026.json"


def main():
    import nfl_data_py as nfl
    import pandas as pd
    from lab_projections import walk_forward
    from scoring import score_stat_line
    import config_schema
    sys.path.insert(0, str(HERE))
    from grade import crosswalk_gsis_to_sleeper, nflverse_weekly_to_scoring

    board = json.loads(BOARD.read_text())
    season = int(board.get("league", {}).get("season") or 2026)
    # WANTED [season-2, season-1] = [2024, 2025]. 2025 weekly data 404s from
    # nflverse's parquet mirror as of this run (checked directly, not assumed) -
    # not yet published there, regardless of what date this environment reports.
    # Falls back one year further: [season-3, season-2] = [2023, 2024], both
    # confirmed reachable. Flagged in the output rather than silently swallowed -
    # a projection missing the most recent season is a materially weaker input,
    # and DECISIONS-NEEDED.md #6 already says not to swap sources blind.
    prior_years = [season - 3, season - 2]

    cfg = config_schema.load(REPO / "draft" / "config" / "league_config.json")
    scoring = cfg["scoring"]

    print(f"Fetching nflverse ID crosswalk...")
    ids_df = nfl.import_ids()
    crosswalk = crosswalk_gsis_to_sleeper([], ids_df)  # players_meta=[] -> ids_df-only
    print(f"  crosswalk: {len(crosswalk)} gsis->sleeper mappings")

    prior_seasons_points: dict[int, dict[str, float]] = {}
    games: dict[int, dict[str, int]] = {}
    for y in prior_years:
        print(f"Fetching nflverse weekly data for {y}...")
        df = nfl.import_weekly_data([y])
        pts, gm = {}, {}
        idc = "player_id" if "player_id" in df.columns else "gsis_id"
        for row in df.to_dict("records"):
            # import_weekly_data includes playoff rows (season_type == "POST") -
            # 257 of 5597 in 2024. Left in, good players' rate is inflated by
            # extra high-leverage games without a matching game-count correction,
            # which is exactly the kind of one-directional bias this project's
            # REGRESSION_WEIGHT work already treats as a real defect. Regular
            # season only, matching this league's own scoring window.
            if row.get("season_type") != "REG":
                continue
            gsis = str(row.get(idc))
            sid = crosswalk.get(gsis)
            if not sid:
                continue
            # nflverse's column names (passing_yards, receiving_tds, ...) are not
            # our scoring table's Sleeper-style keys (pass_yd, rec_td, ...) -
            # score_stat_line skips every key it can't find, silently scoring
            # everyone at 0. nflverse_weekly_to_scoring() is the existing
            # translation layer (grade.py) built for exactly this.
            stats = nflverse_weekly_to_scoring(row)
            p = score_stat_line(stats, scoring)
            pts[sid] = pts.get(sid, 0.0) + p
            gm[sid] = gm.get(sid, 0) + 1
        prior_seasons_points[y] = pts
        games[y] = gm
        print(f"  {y}: {len(pts)} players scored, {sum(gm.values())} player-games")

    players = board["players"]
    positions = {str(p["player_id"]): p.get("position") for p in players}
    ages = {str(p["player_id"]): p.get("age") for p in players}

    print(f"Running walk_forward() for {season}...")
    proj = walk_forward(season, prior_seasons_points, games, positions, ages)
    print(f"  {len(proj)} players projected")

    board_ids = {str(p["player_id"]) for p in players}
    coverage = len(set(proj) & board_ids)
    print(f"  coverage on live board: {coverage} / {len(board_ids)} players")

    # ── DEPTH-CHART DAMPENING — the fix for the finding parked earlier today ──
    #
    # walk_forward() has no opportunity/depth-chart signal: it regresses a
    # small-sample player toward the FULL positional mean regardless of whether
    # his 2026 role has collapsed since his last productive stretch. Measured
    # result before this: Kendre Miller (Sleeper 4.6, a buried backup) came out
    # at 90+ from the raw model — not noise, a systematic one-directional bias
    # (median RB ratio 1.33 despite every star correctly regressing BELOW 1.0).
    #
    # depth_chart_order is already on the live board for 538/686 players — no
    # new data source needed. Dampen the projection for anyone clearly buried,
    # leave it alone for anyone the board can't classify (absence of evidence is
    # not evidence of absence — matching board_activity.dormant()'s own stated
    # principle) and for depth_chart_order 1-2 (starter/clear backup, where the
    # raw model's regression is doing something defensible).
    #
    # THE MULTIPLIERS ARE NOT MEASURED. Labeled as such rather than presented as
    # calibrated — same discipline as WEIGHT_PROVENANCE in engine.js marking a
    # default apart from a measurement. A real calibration needs a held-out
    # season the same way REGRESSION_WEIGHT was tuned; this is a labeled-honest
    # starting point that fixes the visible symptom, not a finished feature.
    DEPTH_DAMPEN = {2: 0.45, 3: 0.30, 4: 0.20}  # order -> multiplier; >= next uses floor
    DEPTH_DAMPEN_FLOOR = 0.15
    # QB'S "2" IS NOT RB/WR/TE'S "2". First run dampened depth_chart_order>=3
    # uniformly and RB/WR/TE improved (median ratio 1.33->1.04, 1.15->0.89) but
    # QB DID NOT MOVE AT ALL (stayed 1.755) — checked why rather than assume the
    # fix worked everywhere: QB inflation was almost entirely players at
    # depth_chart_order 2 (Mason Rudolph, Andy Dalton, ...), which the first cut
    # exempted as "defensible". It isn't, for this one position: an NFL team
    # plays ONE quarterback barring injury, so QB2 means near-zero real snaps —
    # the same single-starter ("onesie") shape this project already treats QB/TE
    # differently for elsewhere (onesieState in engine.js). RB2/WR2/TE2 still see
    # real usage in committees and rotations; QB2 structurally does not. So the
    # dampening window starts one slot earlier for QB than for the others.
    ONESIE_QB_START = 2   # QB: dampen from backup on, matching the real NFL shape
    SKILL_START = 3        # RB/WR/TE: dampen from clear-3rd-string on
    # A PERCENTAGE DISCOUNT IS THE WRONG SHAPE FOR A BACKUP QB SPECIFICALLY.
    # Tried 0.45 first (same as RB/WR/TE order-2): Mason Rudolph 207 -> 93,
    # Kyle Allen 99 -> 44 — real movement, still 4-7x Sleeper's ~13. A backup
    # RB/WR/TE keeps SOME real opportunity (committee touches, 2-WR sets); a
    # backup QB gets close to ZERO unless the starter is hurt, which a
    # percentage-of-regressed-rate can't represent no matter how low the
    # percentage — the positional MEAN it regresses toward already assumes a
    # real chance of playing, which is the wrong assumption for this specific
    # slot. Floored much harder for QB order>=2 as a result (still a labeled
    # default, not a calibration).
    QB_DAMPEN = {2: 0.08, 3: 0.05}
    QB_DAMPEN_FLOOR = 0.04
    dampened = 0
    depth_chart = {str(p["player_id"]): p.get("depth_chart_order") for p in players}
    for pid, val in list(proj.items()):
        order = depth_chart.get(pid)
        if order is None:
            continue
        is_qb = positions.get(pid) == "QB"
        start = ONESIE_QB_START if is_qb else SKILL_START
        if order < start:
            continue
        table = QB_DAMPEN if is_qb else DEPTH_DAMPEN
        floor = QB_DAMPEN_FLOOR if is_qb else DEPTH_DAMPEN_FLOOR
        mult = table.get(int(order), floor)
        proj[pid] = round(val * mult, 2)
        dampened += 1
    print(f"  depth-chart dampening applied to {dampened} players "
          f"(QB from order 2, RB/WR/TE from order 3 — UNMEASURED default "
          f"multipliers, see comment)")

    # Diagnostic-only comparison against what's already on the board. No write-back.
    diffs = []
    for p in players:
        pid = str(p["player_id"])
        own = proj.get(pid)
        sleeper = p.get("proj_sleeper")
        if own is not None and sleeper:
            diffs.append({
                "player_id": pid, "name": p.get("name"), "position": p.get("position"),
                "proj_ownmodel": own, "proj_sleeper": sleeper,
                "ratio": round(own / sleeper, 3) if sleeper else None,
            })

    by_pos: dict[str, list[float]] = {}
    for d in diffs:
        by_pos.setdefault(d["position"], []).append(d["ratio"])
    print("\nMedian proj_ownmodel / proj_sleeper ratio by position:")
    for pos, ratios in sorted(by_pos.items()):
        ratios.sort()
        med = ratios[len(ratios) // 2]
        print(f"  {pos}: n={len(ratios)} median={med}")

    OUT.write_text(json.dumps({
        "season": season, "prior_years_used": prior_years,
        "note": f"Wanted [{season-2},{season-1}]; {season-1} 404s from nflverse's "
                f"parquet mirror as of this run, fell back to [{season-3},{season-2}].",
        "coverage": coverage, "board_size": len(board_ids),
        "proj_ownmodel": proj, "diagnostic_diffs": diffs[:50],
    }, indent=2))
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
