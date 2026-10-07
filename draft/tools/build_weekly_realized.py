#!/usr/bin/env python3
"""WRITE THE COMPONENT GRADER'S FEED — the file every reader was waiting for.

Cory, 2026-10-07: *"Are we learning?"* and *"Every week going forward needs to
work... in a way that helps us draft and manage better next year."*

── WHAT WAS MISSING ──────────────────────────────────────────────────────────

`component_specs.js` declares six rows. `component_grade.js` grades one.
`component_run.js` grades all six. `component_write.js` writes the artifact and
`standing-check.yml` runs it every day. Every one of those exists and works.

They all read `draft/data/weekly_realized.json`, AND NOTHING HAS EVER WRITTEN
IT. So the whole surface has reported `no_data` since it was built — honestly,
by design, naming the input it was waiting for. This is that input.

It could not have been written before today either: the feed needs realized
weekly outcomes, and `nflverse_weekly_points_2026.json` did not exist until the
realized fetch was fixed the same day (its annual size floors were discarding
the in-progress season as "a bad fetch").

── WHAT IT CAN FILL, AND WHAT IT HONESTLY CANNOT ─────────────────────────────

ONE of the six rows has every input on disk, and it is the one that matters
most for next year's draft:

  projection   our draft-board season projection, per week, against LAST
               SEASON'S PER-GAME AVERAGE — "the cheapest honest predictor".

The other five are not written, and the reason is per-row rather than a shrug:

  opportunity_adj  needs `proj_baseline` — the same projection WITHOUT the
                   ±15% opportunity adjustment. Not emitted by anything on
                   disk; the board keeps only the adjusted number.
  consensus        needs FantasyPros-alone and Sleeper-alone SEASON
                   projections. We hold those two WEEKLY (the projection
                   archive) and the season-level per-source store we do have
                   (`multisource_projections.json`) carries CBS / ESPN /
                   FFToday, which are different sources — grading the blend
                   against them would answer a different question under the
                   spec's name.
  replacement      needs realized weekly STARTS across the league.
  survival         needs replayed drafts with board state at each pick.
  weekly_claims    needs emitted per-matchup win probabilities paired with
                   final scores.

Writing a row with a substituted input would be worse than leaving it absent:
`no_data` is readable, and a row silently graded against the wrong baseline is
a number that looks like a finding.

── ⚠️ THE TRAP THIS FEED HAS TO AVOID, MEASURED ──────────────────────────────

`component_run.BUILDERS.projection` turns a missing prior into a baseline of
`{predicted: null}`, and `gradeComponent` then does
`Math.abs(Number(null) - realized)`. `Number(null)` IS `0`. So a player with no
2025 history is graded against a baseline that PREDICTED ZERO POINTS.

Measured in node, same two pairs, nothing else changed:

    baseline [{predicted: null}, ...]  ->  effect  +10.0   (we look brilliant)
    baseline [{predicted:   12}, ...]  ->  effect   -2.0   (we are worse)

Every rookie in the feed would manufacture a large fake positive effect for our
own projection. So this writer emits a `projection` row ONLY when BOTH the
projection and the prior exist, counts what it dropped and why, and
`test_weekly_realized_feed.py` holds that invariant so a future edit cannot
reintroduce it. The hazard in the builder is reported in the artifact rather
than silently worked around.

── WHY PER-GAME AND NOT PER-17 ───────────────────────────────────────────────

`prior_ppg` is last season's points divided by the games the player ACTUALLY
APPEARED IN, not by 17. A player who missed nine games is not a player who
averaged half as much, and dividing by a fixed 17 would hand our own
projection an easy win against an artificially deflated prior.

Run:  python3 draft/tools/build_weekly_realized.py [--season 2026] [--dry-run]
Exit: 1 if the realized store for the season is missing or holds no weeks.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"
OUT = ROOT / "draft" / "data" / "weekly_realized.json"

#: Season totals are divided by this in `component_run.BUILDERS.projection` to
#: reach a per-week prediction. Stated here so the feed and the reader cannot
#: drift: if that divisor ever changes, this constant is the other half of the
#: contract and the test compares them.
WEEKS_PER_SEASON = 17


def _load(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except ValueError:
        return {}


def weekly_points(season: str) -> dict:
    """{week: {sleeper_id: points}} from the realized store."""
    doc = _load(BT / f"nflverse_weekly_points_{season}.json")
    out = {}
    for w in doc.get("weeks") or []:
        pts = w.get("points") or {}
        if pts:
            out[int(w["week"])] = {str(k): float(v) for k, v in pts.items()}
    return out


def scoring_fingerprint(season: str) -> str:
    """The scoring rules the realized points were computed under.

    Carried into the artifact because a prior season's per-game average is only
    a fair baseline if BOTH seasons were scored the same way. Measured
    2026-10-07: 2025 and 2026 share `220bf4c671786351`, so the comparison is
    like-for-like. If they ever diverge this writer says so instead of
    comparing two different games.
    """
    for w in (_load(BT / f"nflverse_weekly_points_{season}.json").get("weeks") or []):
        fp = w.get("scoring_fingerprint")
        if fp:
            return str(fp)
    return ""


def prior_per_game(prior_season: str) -> dict:
    """{sleeper_id: points per game APPEARED} for the previous season."""
    tot, games = {}, {}
    for _wk, pts in weekly_points(prior_season).items():
        for pid, v in pts.items():
            tot[pid] = tot.get(pid, 0.0) + v
            games[pid] = games.get(pid, 0) + 1
    return {pid: round(tot[pid] / games[pid], 4) for pid in tot if games[pid]}


def positions(season: str) -> dict:
    """{sleeper_id: position} from the realized component store."""
    out = {}
    for w in (_load(BT / f"component_stats_{season}.json").get("weeks") or []):
        for pid, line in (w.get("players") or {}).items():
            pos = line.get("pos")
            if pos and pid not in out:
                out[pid] = str(pos)
    return out


def board_projection() -> dict:
    """{sleeper_id: season-total projection} — the shipped draft board's own."""
    doc = _load(BT / "own_projections_2026.json")
    return {str(k): float(v) for k, v in (doc.get("proj_ownmodel") or {}).items()
            if isinstance(v, (int, float))}


def build(season: str) -> dict:
    prior = str(int(season) - 1)
    realized = weekly_points(season)
    proj = board_projection()
    ppg = prior_per_game(prior)
    pos = positions(season)

    rows, dropped = [], {"no_projection": 0, "no_prior": 0}
    seen_no_proj, seen_no_prior = set(), set()
    for wk in sorted(realized):
        for pid in sorted(realized[wk]):
            if pid not in proj:
                dropped["no_projection"] += 1
                seen_no_proj.add(pid)
                continue
            # ⚠️ NOT OPTIONAL. A null prior is graded as a prediction of ZERO by
            # component_run's builder, which fabricates a large positive effect
            # for our own projection. See the module header's measurement.
            if pid not in ppg:
                dropped["no_prior"] += 1
                seen_no_prior.add(pid)
                continue
            rows.append({
                "week": wk,
                "player_id": pid,
                "position": pos.get(pid),
                "proj_mean": round(proj[pid], 4),
                "prior_ppg": ppg[pid],
                "realized": round(realized[wk][pid], 4),
            })

    fp_now, fp_prior = scoring_fingerprint(season), scoring_fingerprint(prior)
    doc = {
        "_territory": "TERRITORY: A — produced by draft/tools/build_weekly_realized.py",
        "_what": ("The component grader's feed. COMPONENT-KEYED ARRAYS, which is "
                  "the shape component_write.loadRealized reads; a box-score-shaped "
                  "file would parse cleanly and be read as 'no data' (register 154)."),
        "projection": rows,
        "_absent": {
            "opportunity_adj": "needs proj_baseline (the projection WITHOUT the "
                               "±15% opportunity adjustment); nothing on disk emits it",
            "consensus": "needs FantasyPros-alone and Sleeper-alone SEASON "
                         "projections. We hold those weekly, not seasonal; the "
                         "seasonal per-source store carries CBS/ESPN/FFToday, which "
                         "would answer a different question under this spec's name",
            "replacement": "needs realized weekly STARTS across the league",
            "survival": "needs replayed drafts with the board state at each pick",
            "weekly_claims": "needs emitted per-matchup win probabilities paired "
                             "with final weekly scores",
        },
        "_method_sensitivity": {
            "why_this_is_here": (
                "The `projection` row compares a SEASON TOTAL (divided by 17) to "
                "points realized in games the player ACTUALLY PLAYED. A season "
                "total carries a missed-games allowance that per-game realized "
                "points do not, so the divisor is a methodological choice and the "
                "verdict has to be shown to survive it before it is quoted as a "
                "finding. Measured 2026-10-07 on weeks 1-4."),
            "all_players": {
                "n_obs": 1021, "players": 320,
                "proj_mean_over_17": {"bias": -2.1991, "mae": 4.6936,
                                      "effect": -0.1037, "mde": 0.3675,
                                      "verdict": "noise"},
                "proj_mean_over_games_played_2025": {"bias": -0.0433, "mae": 5.7897,
                                                     "effect": -1.2001, "mde": 0.3885,
                                                     "verdict": "hurting"},
                "read_this_as": (
                    "THE TWO DISAGREE, so the full-population verdict is NOT a "
                    "finding. The de-biased arm divides a season total by as few "
                    "as ONE game for players who barely appeared in 2025, which "
                    "inflates MAE rather than revealing a worse model — note the "
                    "bias goes to ~0 while MAE goes UP by a point."),
            },
            "established_players_14plus_games_2025": {
                "n_obs": 563, "players": 160,
                "proj_mean_over_17": {"bias": -2.5761, "mae": 5.3071,
                                      "effect": -0.1371, "mde": 0.3876,
                                      "verdict": "noise"},
                "proj_mean_over_games_played_2025": {"bias": -2.1923, "mae": 5.2833,
                                                     "effect": -0.1134, "mde": 0.3785,
                                                     "verdict": "noise"},
                "read_this_as": (
                    "BOTH DIVISORS AGREE: noise. On the population where the "
                    "method ambiguity does not bite, our draft-board projection "
                    "does not beat last season's per-game average at a size worth "
                    "acting on — effect -0.11 to -0.14 MAE points against a "
                    "detection floor of ~0.38 and a materiality bar of 1.0. The "
                    "design COULD have seen a material effect and did not. "
                    "Reproduced at 16+ games too (382 obs, both arms noise)."),
            },
            "the_standing_bias": (
                "Separately from the verdict: the bias is -2.2 to -3.0 points per "
                "player-week in EVERY arm and subset. Our season projection "
                "divided by 17 systematically under-predicts what players score "
                "in the games they actually play. That is the missed-games "
                "allowance showing up as a per-week shortfall, and it is a real "
                "property of reading a season total as a weekly forecast."),
            "reproduce": (
                "node -e with src/component_grade.js + src/component_specs.js over "
                "this file's `projection` array, swapping the divisor; see the "
                "commit that added this block."),
        },
        "_hazard_in_the_reader": (
            "component_run.BUILDERS.projection maps a missing prior to "
            "{predicted: null}, and gradeComponent computes "
            "Math.abs(Number(null) - realized). Number(null) is 0, so a player "
            "with no prior season is graded against a baseline that predicted "
            "ZERO. Measured: the same two pairs score +10.0 with a null baseline "
            "and -2.0 with a true one. This writer therefore emits a projection "
            "row only when BOTH inputs exist; it does not patch the reader."),
        "provenance": {
            "built": _dt.date.today().isoformat(),
            "season": season,
            "prior_season": prior,
            "weeks": sorted(realized),
            "rows": len(rows),
            "players": len({r["player_id"] for r in rows}),
            "dropped": dropped,
            "dropped_players": {"no_projection": len(seen_no_proj),
                                "no_prior": len(seen_no_prior)},
            "weeks_per_season_divisor": WEEKS_PER_SEASON,
            "scoring_fingerprint": fp_now,
            "prior_scoring_fingerprint": fp_prior,
            "scoring_comparable": bool(fp_now) and fp_now == fp_prior,
            "sources": [
                f"draft/backtest/nflverse_weekly_points_{season}.json (realized)",
                f"draft/backtest/nflverse_weekly_points_{prior}.json (prior_ppg)",
                "draft/backtest/own_projections_2026.json (proj_ownmodel)",
                f"draft/backtest/component_stats_{season}.json (position)",
            ],
        },
    }
    return doc


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2026")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    doc = build(a.season)
    pv = doc["provenance"]
    if not pv["weeks"]:
        print(f"::error::no realized weeks for {a.season} — "
              f"draft/backtest/nflverse_weekly_points_{a.season}.json is missing "
              "or empty. The feed is not written: an empty feed reads as 'the "
              "season is quiet', which is a claim, and an absent one reads as "
              "'we do not have it yet'.")
        return 1

    print(f"weeks {pv['weeks']}  rows {pv['rows']}  players {pv['players']}")
    print(f"dropped: {pv['dropped']} "
          f"(distinct players: {pv['dropped_players']})")
    print(f"scoring comparable with {pv['prior_season']}: {pv['scoring_comparable']} "
          f"({pv['scoring_fingerprint'][:12]} vs {pv['prior_scoring_fingerprint'][:12]})")
    if not pv["scoring_comparable"]:
        print("::warning::the two seasons were scored differently, so last "
              "season's per-game average is not a like-for-like baseline")
    if a.dry_run:
        print("(dry run — nothing written)")
        return 0
    OUT.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
