# TERRITORY: D
"""PROPS-WEEK1 — can a market signal available in AUGUST improve a preseason board?

Preregistered in draft/backtest/PROPS-WEEK1-PREREG.md, committed in its own
commit (9cbd9fa) before this file existed. Result: props_week1_arm.json.

WHY THIS EXISTS. The full-season props arm returned Spearman 0.93-0.97 against
own_v6's 0.66-0.74 and that is NOT projection skill: it sums lines from all 18
in-season weeks, so a week-17 line knows the season and an injured player has no
rows after he goes down. Its own module preregistered that asymmetry. This arm
uses ONLY week-1 lines, which close before any game of the season — the house
rule for a leak-free season-total feature (vegas_lines_2021_2026.json's _note).

RESEARCH ONLY, and it MODIFIES NOTHING OF ANOTHER LANE'S. Every shared piece —
the scoring table, week_implied_points, the name crosswalk, the own_v6
reproduction and the verdict rule — is IMPORTED from draft/tools/
props_season_projection.py (TERRITORY: A) rather than reimplemented, so the two
arms cannot drift apart and A's file is untouched.

THE CONSTRUCTION IS DELIBERATELY CRUDE: proj = week1_implied_points x 17, one
declared constant for every player at every position, nothing tuned. It does not
model availability — which is exactly the handicap own_v6 carries. Both arms are
preseason forecasts blind to what follows, and that shared blindness is what
makes the comparison fair where the full-season one was not.

Run: python3 draft/backtest/props_week1_arm.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "tools"))

import fetch_historical_props as FHP        # noqa: E402
import props_season_projection as PSP       # noqa: E402
import fetch_component_stats as FCS         # noqa: E402

# ── preregistered constants (PROPS-WEEK1-PREREG.md) ─────────────────────────
GRADED_SEASON = PSP.GRADED_SEASON           # 2025, matching the full-season arm
GAMES = 17                                  # declared, identical for everyone
SEASONS_AVAILABLE = (2023, 2024, 2025)      # week-1 stores on disk


def week1_weeks(season: int) -> list:
    """The week-1 store's weeks list, or [] when the store is absent."""
    p = FHP.store_path(season, scope="sample_week1")
    if not p.exists():
        return []
    return json.loads(p.read_text())["weeks"]


def control_store_is_week_one_only(weeks: list) -> dict:
    """CONTROL 1 from the prereg, and the calibration depends on it: the whole
    leak-free claim is that these lines close before any game. If the store
    holds a second week, this arm is measuring the same thing its sibling does
    and no number below may be read."""
    numbers = sorted({w.get("week") for w in weeks})
    return {"weeks_in_store": len(weeks), "week_numbers": numbers,
            "is_week_one_only": numbers == [1]}


def control_overlaps_full_season_week_one(season: int, week1_players: set) -> dict:
    """CONTROL 2: the same slate fetched two ways must agree. The full-season
    store's own week-1 slice and the week-1 store should cover substantially the
    same players; wild disagreement means one of the two fetches is wrong and
    neither arm means anything."""
    p = FHP.store_path(season, scope="full_season")
    if not p.exists():
        return {"status": "full_season store absent — control unavailable"}
    full = json.loads(p.read_text())["weeks"]
    slice_ = next((w for w in full if w.get("week") == 1), None)
    if not slice_:
        return {"status": "no week-1 slice in the full_season store"}
    other = set(slice_.get("players") or {})
    inter = week1_players & other
    return {
        "week1_store_players": len(week1_players),
        "full_season_week1_players": len(other),
        "overlap": len(inter),
        "overlap_rate_vs_week1_store": round(len(inter) / max(len(week1_players), 1), 4),
    }


#: EXCLUDED, and this is not a judgement call — it is a known store defect.
#: `empirical_draft_value.props_ordering()` documents it: the committed week-1
#: stores PREDATE the fetcher's AMERICAN_IMPOSSIBLE_BAND guard and still carry
#: `any_td` as DECIMAL ODDS, not expected touchdowns. Measured here on the 2025
#: store: values span 0.80-4.21 with a median of 2.69, and `line_to_points`
#: prices them at 6.0 points each — projecting Jalen Hurts at 786.9 points for
#: the season. The first run of this arm included the column and reported MAE
#: 249-362 against own_v6's 23-83; that was this defect, not a null.
#:
#: THE COST OF EXCLUDING IT IS REAL AND IS NOT HIDDEN: without any_td this
#: projection carries NO rushing or receiving touchdowns, which understates
#: goal-line backs and red-zone receivers by a systematic amount. So the arm is
#: a LOWER BOUND on what a week-1 props board could do — the same label
#: empirical_draft_value puts on its own ordering, for the same reason.
CORRUPT_MARKETS = ("any_td",)


def season_projection(weeks: list, scoring_cfg: dict) -> dict:
    """{key: week1_implied_points * GAMES}, built from the `point`-quoted
    markets only. Absent stays absent — a player with no week-1 line is simply
    not here, never zero and never imputed."""
    wk1 = next((w for w in weeks if w.get("week") == 1), None)
    if not wk1:
        return {}
    clean = {name: {m: v for m, v in stats.items() if m not in CORRUPT_MARKETS}
             for name, stats in (wk1.get("players") or {}).items()}
    clean = {name: stats for name, stats in clean.items() if stats}
    per_game = PSP.week_implied_points(clean, scoring_cfg)
    return {k: round(v * GAMES, 2) for k, v in per_game.items()}


def main() -> dict:
    weeks = week1_weeks(GRADED_SEASON)
    if not weeks:
        raise SystemExit(f"no week-1 props store for {GRADED_SEASON}")

    c1 = control_store_is_week_one_only(weeks)
    scoring_cfg = FCS.frozen_scoring_table()

    by_name = season_projection(weeks, scoring_cfg)
    c2 = control_overlaps_full_season_week_one(GRADED_SEASON, set(by_name))

    # crosswalk names -> sleeper ids, reusing A's index and matcher
    name_idx = PSP.build_name_index()
    matched, unmatched = {}, []
    for name, pts in by_name.items():
        pid = PSP.match_player_name(name, name_idx)
        if pid is None:
            unmatched.append(name)
        else:
            matched[pid] = pts

    h2h_full, _v6 = PSP.grade_props_vs_v6(matched)
    h2h = h2h_full["head_to_head_shared_population"]
    verdict = PSP.verdict_vs_v6(h2h)

    result = {
        "_territory": "TERRITORY: D — research artifact, produced by "
                      "draft/backtest/props_week1_arm.py",
        "preregistration": "draft/backtest/PROPS-WEEK1-PREREG.md",
        "status": "graded",
        "graded_season": GRADED_SEASON,
        "excluded_markets": {
            "markets": list(CORRUPT_MARKETS),
            "why": "the committed week-1 stores predate fetch_historical_props' "
                   "AMERICAN_IMPOSSIBLE_BAND guard and carry any_td as DECIMAL "
                   "ODDS (0.80-4.21, median 2.69), which line_to_points prices at "
                   "6.0 each. Documented in empirical_draft_value.props_ordering(), "
                   "which excludes it for the same reason.",
            "cost": "no rushing or receiving touchdowns are represented, so this "
                    "arm UNDERSTATES goal-line backs and red-zone receivers and is "
                    "a LOWER BOUND, not a fair estimate of a week-1 props board."},
        "construction": f"proj = week1_implied_points x GAMES({GAMES}), "
                        f"point-quoted markets only; "
                        "declared constant, identical for every player, nothing "
                        "tuned; availability deliberately not modelled, which is "
                        "the same handicap own_v6 carries",
        "controls": {
            "store_is_week_one_only": c1,
            "overlap_with_full_season_week1": c2,
        },
        "coverage": {
            "week1_props_forecasts": len(matched),
            "unmatched_names": sorted(unmatched)[:20],
            "unmatched_count": len(unmatched),
            "crosswalk_loss_rate": round(len(unmatched) / max(len(by_name), 1), 4),
        },
        "arm": h2h_full,
        "promotion_bar_vs_v6": verdict,
        "leak_free_basis": (
            "Week-1 lines close BEFORE any game of the season, the house rule "
            "for a season-total feature (vegas_lines_2021_2026.json's _note). "
            "This arm therefore does NOT carry the in-season information "
            "asymmetry that makes the full-season arm's 0.93-0.97 Spearman "
            "unusable as evidence about a preseason board."),
        "seasons_not_graded": {
            "seasons": [s for s in SEASONS_AVAILABLE if s != GRADED_SEASON],
            "why": "grade_props_vs_v6 reproduces own_v6 for GRADED_SEASON only; "
                   "extending it means touching A's model code. The stores are "
                   "on disk — two more folds, named rather than dropped."},
    }
    (HERE / "props_week1_arm.json").write_text(json.dumps(result, indent=1) + "\n")
    print(f"wrote {HERE / 'props_week1_arm.json'}")
    print(f"CONTROL week-1 only: {c1['is_week_one_only']}  weeks={c1['week_numbers']}")
    print(f"CONTROL overlap: {json.dumps(c2)}")
    print(f"coverage: {len(matched)} forecasts, {len(unmatched)} unmatched "
          f"({result['coverage']['crosswalk_loss_rate']:.1%} loss)")
    for pos, v in h2h.items():
        if v.get("status") != "measured":
            print(f"  {pos}: {v.get('status')}")
            continue
        print(f"  {pos}: n={v['n']:3d}  props MAE {v['props_season']['mae']:7.2f} "
              f"vs v6 {v['own_v6']['mae']:7.2f}   "
              f"rho {v['props_season']['spearman']:.4f} vs {v['own_v6']['spearman']:.4f}")
    print(f"CLEARS: {verdict['clears']}")
    return result


if __name__ == "__main__":
    main()
