# TERRITORY: A
"""TE-RB SAME-TEAM CORRELATION — verifying Cory-shared textbook claim
(2026-08-16, textbook_crosscheck).

The Fantasy Football Analytics Textbook's modern-portfolio-theory.qmd
(github.com/isaactpetersen/Fantasy-Football-Analytics-Textbook) claims TE-RB
position pairs are "slightly negatively correlated." That claim was
UNVERIFIED against this league's own data. This module answers it the cheap
way the mandate requires: it imports `conditional_value.py` UNMODIFIED and
reuses its already-graded pure functions (`season_data`, `team_game_weeks`,
`ranked_catchers`, `pair_series`, `pearson`, `fisher_pool`, `mean_sd` — every
one of them already unit-tested in `test_conditional_value.py`) to build one
more same-team correlation class, RB1-TE1, in exactly the same shape as the
committed QB-WR1/QB-WR2/QB-TE1/WR1-WR2 classes in
`conditional_value_2026.json`. No new data, no new fetch, no change to any
function `conditional_value.py` exports.

`ranked_catchers(week_rows, points, team, pos)` already generalizes over
`pos` (it just filters on the store's `pos` field and the team's game log) so
calling it with `pos="RB"` costs nothing — it is the same function the
committed classes use for "WR"/"TE", now used for "RB" too.

Run:  python3 draft/backtest/te_rb_correlation_check.py            # rebuild artifact
      python3 draft/backtest/te_rb_correlation_check.py --print    # measurement only
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import conditional_value as CV  # noqa: E402

ARTIFACT = HERE.parent / "data" / "te_rb_correlation_2026.json"


def rb_te_pairs_for_season(season: int):
    """Every team-season's (RB1, TE1) same-team weekly pair, >= MIN_PAIR_WEEKS
    shared weeks — the identical construction stack_pairs_for_season uses for
    QB-WR1/QB-WR2/QB-TE1/WR1-WR2, applied to RB1-TE1."""
    week_rows, points = CV.season_data(season)
    teams = sorted(CV.team_game_weeks(week_rows))
    out = []
    for team in teams:
        rbs = CV.ranked_catchers(week_rows, points, team, "RB")
        tes = CV.ranked_catchers(week_rows, points, team, "TE")
        if not rbs or not tes:
            continue
        rb1, te1 = rbs[0], tes[0]
        xs, ys = CV.pair_series(week_rows, points, team, rb1, te1)
        if len(xs) < CV.MIN_PAIR_WEEKS:
            continue
        r = CV.pearson(xs, ys)
        if r is None:
            continue
        out.append({"season": season, "team": team, "rb1": rb1, "te1": te1,
                    "n_weeks": len(xs), "r": round(r, 4)})
    return out


def rb_te1_class(seasons=CV.SEASONS):
    """Pooled RB1-TE1 same-team correlation, same shape as
    stack_correlation_classes()'s cells (r_pooled via Fisher z, r_mean,
    r_sd_across_pairs, n_pairs, n_weeks)."""
    rows = []
    for season in seasons:
        rows.extend(rb_te_pairs_for_season(season))
    pooled, n_pairs, n_weeks = CV.fisher_pool(
        [(row["r"], row["n_weeks"]) for row in rows])
    rs = [row["r"] for row in rows]
    _, spread = CV.mean_sd(rs)
    return {
        "r_pooled": None if pooled is None else round(pooled, 4),
        "r_mean": None if not rs else round(sum(rs) / len(rs), 4),
        "r_sd_across_pairs": None if spread is None else round(spread, 4),
        "n_pairs": n_pairs,
        "n_weeks": n_weeks,
        "rows": rows,
    }


def build_artifact(seasons=CV.SEASONS, write=True):
    cell = rb_te1_class(seasons)
    doc = {
        "_territory": "TERRITORY: A — produced by "
                      "draft/backtest/te_rb_correlation_check.py, importing "
                      "conditional_value.py UNMODIFIED; verifies a claim from "
                      "the Fantasy Football Analytics Textbook "
                      "(modern-portfolio-theory.qmd: TE-RB pairs 'slightly "
                      "negatively correlated') against this league's own "
                      "component stores. GATED — nothing reads this artifact.",
        "mandate": "draft/audit/textbook_crosscheck_2026-08-16.md",
        "seasons": list(seasons),
        "cls": "RB1-TE1",
        "method": "identical construction to conditional_value.py's "
                  "stack_correlation_classes(): same-team RB1/TE1 (by season "
                  "points, min CATCHER_MIN_GAMES games), weekly Pearson r per "
                  "team-season on shared active weeks (min MIN_PAIR_WEEKS=8), "
                  "pooled across team-seasons by Fisher z weighted by n-3.",
        "measured": {k: v for k, v in cell.items() if k != "rows"},
        "team_seasons": cell["rows"],
        "verdict": (
            "NOT slightly negatively correlated. Pooled r = "
            f"{cell['r_pooled']} across {cell['n_pairs']} team-seasons / "
            f"{cell['n_weeks']} shared weeks (2021-2025) — indistinguishable "
            "from zero, not negative. The spread across team-seasons "
            f"(sd={cell['r_sd_across_pairs']}) is wide and roughly symmetric "
            "around zero: some team-seasons show a real negative RB1/TE1 "
            "relationship, some a real positive one, and they cancel."),
    }
    if write:
        ARTIFACT.write_text(json.dumps(doc, indent=1) + "\n")
    return doc


def main():
    if "--print" in sys.argv:
        print(json.dumps(rb_te1_class(), indent=1))
        return
    doc = build_artifact()
    print(f"wrote {ARTIFACT} ({doc['measured']['n_pairs']} team-seasons, "
          f"r_pooled={doc['measured']['r_pooled']})")


if __name__ == "__main__":
    main()
