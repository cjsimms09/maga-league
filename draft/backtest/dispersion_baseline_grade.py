#!/usr/bin/env python3
# TERRITORY: D
"""GRADE THE THREE DISPERSION ARMS ALREADY LIVE ON THE BOARD, AGAINST REALIZED WEEKLY VOLATILITY.

Answers ROUTES.md A -> D, 2026-08-19 (recheck 08-21): "the question 'does cross-source
spread beat our fitted band constants' cannot be answered until we know what the band
constants score, and that half is constructible today with zero new data."

IT IS CONSTRUCTIBLE TODAY, AND MORE THAN "ONE HALF" ALREADY EXISTS TO GRADE. The live
board (public/draft_data.json, built 2026-08-19) is not choosing between two arms — it
is running THREE simultaneously, keyed by `proj_sd_source`: `cross-source-disagreement`
(308 players, multisource_blend.py), `measured-2023-25-error` (287, projection_error.py's
fitted (position, band) constant, REC-1), and `position_variance` (105, the original
hand-set Gaussian fallback for cells the band constant could not measure). That three-way
split is a natural experiment sitting on disk right now, not a hypothetical the next
rebuild will create.

REALIZED SIDE: `realized_variance_store.json` (C, register 2e/routing, 827 players,
2023-2025 measured separately, `nflverse_variance.weekly_variance()` unmodified). Player
ids are Sleeper ids in BOTH files (verified: draft_data.json's Gibbs is "9221" and the
identical id keys realized_variance_store.json) -- no crosswalk needed.

THE COMPARISON IS DELIBERATELY ASYMMETRIC AND THE ASYMMETRY IS NAMED, NOT HIDDEN.
`measured-2023-25-error` was FIT on exactly the outcome data it is graded against here
(the production `regenerate()` pools all of 2023-2025 with `exclude_season=None` -- see
projection_error.py's own docstring). This grade is therefore IN-SAMPLE for that arm and
its apparent accuracy is an upper bound, not a fair estimate of out-of-sample skill.
`cross-source-disagreement` was fit on NEITHER weekly volatility NOR any 2023-2025 outcome
-- it is pure same-season cross-provider spread on the CURRENT 2026 projections -- so its
number here is a genuine out-of-sample test. `position_variance` is a hand-set constant,
fit on nothing. If the in-sample arm does not clearly beat the two arms that were never
shown this data, that is informative; if it does, the margin cannot be trusted at face
value. Read the ratio and the CV-correlation together, not either alone (rule 3i: a number
is not a finding until you have seen the population it came from).

TWO SEPARATE QUESTIONS, BOTH GRADED. (1) LEVEL: does the arm's own weekly_sd magnitude
match realized weekly volatility (the `ratio` block -- exactly the question the 2026-08-14
`projection_spread_vs_realized.json` asked, but that study is now FIVE DAYS STALE: it
predates REC-1 (proj_sd_for wasn't wired until 08-17) and predates the cross-source arm
shipping entirely, so `season_sd = mean_proj * var` was the WHOLE mechanism when it ran,
never `PE.proj_sd_for`. It was also "produced by commands typed into a shell... nobody else
could reproduce them" (nflverse_run.py's own words) and was never routed into ROUTES.md,
DEFECT-REGISTER.md or PREDICTION-LEDGER.md (checked: zero hits in all three) -- an orphaned
finding, the exact failure rule 3g exists to catch. This module supersedes it with a
reproducible, committed, re-runnable measurement.) (2) SHAPE: within an arm, does a player
predicted MORE volatile than his positional peers actually turn out more volatile
(Spearman rank correlation of predicted vs realized coefficient-of-variation, scale-free
so QBs and TEs pool honestly) -- the level can be biased by a constant and still be useful
if the SHAPE is right, which is the question a drafter deciding "who is the safer floor
play at this price" actually needs answered.

CAVEATS, STATED RATHER THAN BURIED. `realized_variance_store` seasons with `status !=
"measured"` (too few games, a position-prior fill) are EXCLUDED here -- an imputed season
graded against itself would not be a measurement. A player needs at least one measured
season to enter this grade; K/DEF are absent from the board's three-arm split entirely
(they use their own K/DEF calibration path) and are not graded here. This is WEEKLY
volatility, not the season-total ESTIMATION ERROR `measured-2023-25-error`'s sd_ratio was
originally fit to predict (projection_error.py's own docstring names these as different
risks) -- `realized_variance_store.py`'s own docstring chose weekly volatility as the
target anyway, deliberately, per the routing order that commissioned it ("does cross-source
spread predict realized variance better than our fitted band constants"), so this module
follows that same operationalization rather than re-litigating it.
"""
from __future__ import annotations

import json
from pathlib import Path
from statistics import mean, pstdev

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

DRAFT_DATA = ROOT / "public" / "draft_data.json"
REALIZED_STORE = HERE / "realized_variance_store.json"
OUT = HERE / "dispersion_baseline_grade.json"

MIN_N_FOR_CORR = 10


def _realized_weekly_sd(entry: dict) -> tuple:
    """Mean weekly_sd and mean weekly points across MEASURED seasons only for
    one player's realized_variance_store entry. Returns (sd, mean_pts, n_seasons)
    or (None, None, 0) if nothing measured."""
    sds, means_ = [], []
    for season_row in (entry or {}).values():
        if season_row.get("status") == "measured":
            sds.append(float(season_row["weekly_sd"]))
            means_.append(float(season_row["mean_points"]))
    if not sds:
        return None, None, 0
    return mean(sds), mean(means_), len(sds)


def _spearman(pairs: list) -> tuple:
    """(rho, n) -- None rho if fewer than MIN_N_FOR_CORR pairs or no variance."""
    if len(pairs) < MIN_N_FOR_CORR:
        return None, len(pairs)

    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        out = [0.0] * len(v)
        for r, i in enumerate(order):
            out[i] = r + 1
        return out

    a = ranks([x for x, _ in pairs])
    b = ranks([y for _, y in pairs])
    ma, mb = mean(a), mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = (sum((x - ma) ** 2 for x in a) ** 0.5) * (sum((y - mb) ** 2 for y in b) ** 0.5)
    if den == 0:
        return None, len(pairs)
    return round(num / den, 4), len(pairs)


def build_rows(draft_data: dict, realized_store: dict) -> list:
    """One row per board player who also has a measured realized-variance entry.
    Pure -- fixture-testable without touching either committed file."""
    realized_players = realized_store.get("players") or {}
    rows = []
    for p in draft_data.get("players") or []:
        pid = str(p.get("player_id"))
        entry = realized_players.get(pid)
        if entry is None:
            continue
        r_sd, r_mean, n_seasons = _realized_weekly_sd(entry)
        if r_sd is None:
            continue
        source = p.get("proj_sd_source")
        proj_mean = p.get("proj_mean")
        weekly_sd = p.get("weekly_sd")
        if source is None or proj_mean is None or weekly_sd is None or not proj_mean:
            continue
        rows.append({
            "player_id": pid, "name": p.get("name"), "position": p.get("position"),
            "arm": source,
            "board_weekly_sd": float(weekly_sd),
            "board_cv": round(float(weekly_sd) / float(proj_mean), 4),
            "realized_weekly_sd": round(r_sd, 4),
            "realized_cv": round(r_sd / r_mean, 4) if r_mean else None,
            "realized_seasons_measured": n_seasons,
        })
    return rows


def grade(rows: list) -> dict:
    """Pure. Groups by arm (and arm x position), reports the LEVEL ratio and the
    SHAPE (CV rank) correlation for each group. A group under MIN_N_FOR_CORR
    reports its ratio but `rho: None` -- a correlation off a handful of players
    is noise wearing a measurement's clothes (same rule projection_error.py's
    MIN_N applies to a thin band)."""
    by_arm = {}
    for r in rows:
        by_arm.setdefault(r["arm"], []).append(r)

    out = {}
    for arm, grp in by_arm.items():
        board_mean = mean(x["board_weekly_sd"] for x in grp)
        real_mean = mean(x["realized_weekly_sd"] for x in grp)
        ratio = round(board_mean / real_mean, 3) if real_mean else None
        cv_pairs = [(x["board_cv"], x["realized_cv"]) for x in grp
                    if x["realized_cv"] is not None]
        rho, n_corr = _spearman(cv_pairs)
        by_pos = {}
        for pos in sorted({x["position"] for x in grp}):
            pg = [x for x in grp if x["position"] == pos]
            pb_mean = mean(x["board_weekly_sd"] for x in pg)
            pr_mean = mean(x["realized_weekly_sd"] for x in pg)
            p_pairs = [(x["board_cv"], x["realized_cv"]) for x in pg
                       if x["realized_cv"] is not None]
            p_rho, p_n = _spearman(p_pairs)
            by_pos[pos] = {
                "n": len(pg),
                "ratio_board_over_realized": round(pb_mean / pr_mean, 3) if pr_mean else None,
                "cv_spearman": p_rho, "cv_spearman_n": p_n,
            }
        out[arm] = {
            "n": len(grp),
            "ratio_board_over_realized": ratio,
            "cv_spearman": rho, "cv_spearman_n": n_corr,
            "by_position": by_pos,
        }
    return out


def document(rows: list, cal: dict) -> dict:
    return {
        "_territory": "TERRITORY: D — produced by draft/backtest/dispersion_baseline_grade.py",
        "_note": ("Grades all three dispersion arms live on the 2026-08-19 board against "
                  "realized_variance_store.json's measured weekly volatility, 2023-2025. "
                  "See module docstring for the in-sample/out-of-sample asymmetry, the "
                  "level-vs-shape distinction, and why this supersedes the orphaned "
                  "2026-08-14 projection_spread_vs_realized.json."),
        "board_built_at": None,  # filled by main() from the live draft_data.json
        "n_players_graded": len(rows),
        "by_arm": cal,
        "rows": rows,
    }


def main() -> int:  # pragma: no cover  (reads committed files, writes an artifact)
    draft_data = json.loads(DRAFT_DATA.read_text())
    realized_store = json.loads(REALIZED_STORE.read_text())
    rows = build_rows(draft_data, realized_store)
    cal = grade(rows)
    doc = document(rows, cal)
    doc["board_built_at"] = draft_data.get("built_at")
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    print("graded %d players across %d arms; wrote %s"
         % (len(rows), len(cal), OUT.name))
    for arm, g in sorted(cal.items()):
        print("  %-24s n=%-4d ratio=%s cv_spearman=%s (n=%d)"
             % (arm, g["n"], g["ratio_board_over_realized"],
                g["cv_spearman"], g["cv_spearman_n"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
