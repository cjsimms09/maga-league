#!/usr/bin/env python3
# TERRITORY: A
# TERRITORY-GRANT: C raw_by_id raw stats stat_line pid append_snapshot proj_series score_stat_line scoring vendor fields beside points scores archiver register grant header 2026-08-19
"""THE WEEKLY PROJECTION SNAPSHOT — the one input with a real deadline.

WHY THIS AND NOT THE SHADOW LAYER. Cory asked whether a thin shadow-strategy
layer had a deadline nobody noticed. Measured from the league's own 540
team-weeks: the comparison is PAIRED, so the noise is the 11.44-point SD of the
slot two strategies disagree about — and even disagreeing EVERY week of a season,
the smallest detectable edge is 7.8 points, 64% of an average starter's output.
At a realistic disagreement rate (the opponent-dossier flip moved 8 of 1,152
draft decisions) the bar is 16 points. Seventeen weeks cannot tell two strategies
apart, so the field waits.

BUT THE DEADLINE IS REAL AND IT IS ON THIS OBJECT.

    a TOOL'S RECOMMENDATION at the moment   -> unrecoverable, must be captured live
    a SHADOW STRATEGY'S choice              -> f(roster, projections), recomputable
                                               in January IF BOTH INPUTS SURVIVE

Sleeper returns the roster retroactively. NOTHING ARCHIVES THE WEEKLY
PROJECTIONS: proj_series.json holds preseason snapshots only, grade-cron writes
calibration snapshots rather than inputs, and providers overwrite weekly numbers
in place. So the window that closes at week one is this file, not the layer —
and archiving it makes EVERY shadow strategy reconstructable in January rather
than the two or three we would guess at in August.

The second-order argument is the stronger one: a field chosen from a season of
residuals beats one chosen from the same priors that built the live core.

WHAT IT DELIBERATELY DOES NOT DO. It does not score, rank, or diff anything. It
writes down what the provider said, for the week it said it, and stops. Every
consumer is January's.

Run: python3 draft/weekly_proj_snapshot.py [--week N] [--date YYYY-MM-DD]
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import proj_series as PS          # noqa: E402
import sleeper_import as SI       # noqa: E402

OUT = HERE / "data" / "proj_series.json"


def nfl_state():
    """Sleeper's own state: season, season_type, week.

    NOT derived from the calendar. Week boundaries move (bye structure, a
    Thursday season opener, a flexed game), and a week number computed from a
    date is the kind of value that is right for four months and wrong in
    December — which is when it would matter and when nobody would check.
    """
    try:
        return SI._get("/state/nfl", ttl=60 * 30) or {}  # noqa: SLF001
    except Exception:  # noqa: BLE001
        return {}


def main() -> int:
    args = sys.argv[1:]
    week = None
    date = None
    for i, a in enumerate(args):
        if a == "--week" and i + 1 < len(args):
            week = int(args[i + 1])
        if a == "--date" and i + 1 < len(args):
            date = args[i + 1]
    if date is None:
        import time
        date = time.strftime("%Y-%m-%d", time.gmtime())
    st = nfl_state()

    # ── PRESEASON IS A CLEAN SKIP, NOT A FAILURE ────────────────────────────
    #
    # The schedule starts firing immediately and the season does not begin for
    # weeks. Exiting 1 every Sunday until week 1 would make this job RED BY
    # DESIGN for a month — and a job that is expected to be red is a job nobody
    # reads, which is the deploy-verify failure mode this repo already names.
    # Then the first genuine failure looks exactly like the twenty expected ones.
    #
    # So the two states are distinguished rather than collapsed: "the regular
    # season has not started" exits 0 and says so; "the regular season IS running
    # and I cannot tell which week" still refuses, because that is the case where
    # a guess would mislabel real data.
    season_type = str(st.get("season_type") or "").lower()
    if week is None and season_type and season_type != "regular":
        print(f"season_type is '{season_type}', not 'regular' — nothing to snapshot yet. "
              "Exiting CLEAN: a job that is red by design for a month is a job "
              "nobody reads, and then the first real failure looks like the "
              "twenty expected ones.")
        return 0

    if week is None:
        w = st.get("week")
        week = int(w) if w else None
    if not week:
        # REFUSE rather than snapshot under an unknown week. A snapshot filed
        # under the wrong week is worse than a missing one: January would grade a
        # strategy against inputs it never saw, which is the exp33 leak one level
        # down. A missing week is visible; a mislabelled one is not.
        print("! could not determine the NFL week and none was supplied. "
              "REFUSING to snapshot rather than filing it under a guess — a "
              "mislabelled week grades a strategy against inputs it never saw.")
        return 1

    season = str(os.environ.get("SEASON") or "").strip()
    if not season:
        season = str(st.get("season") or "")
    if not season:
        print("! no season; refusing")
        return 1

    print(f"snapshotting week {week} of {season} ({date})")
    raw = SI.fetch_projections(season, week=week)
    if not raw:
        print("! provider returned no rows for this week — NOT writing an empty "
              "snapshot. An empty week reads as 'the projections were empty', "
              "which is a claim; a missing week reads as 'we did not get one'.")
        return 1

    # Convert the provider's stat lines to OUR scoring, the same way the board
    # does — AND keep the raw stat line beside the scored points (TERRITORY-
    # GRANT: C, 2026-08-19): the scoring table is itself versioned, so a raw
    # line archived today can be RE-scored under a corrected table later,
    # while a stored point total alone cannot be un-scored back into the
    # stats that produced it.
    cfg_path = HERE / "config" / "league_config.json"
    scoring = {}
    if cfg_path.exists():
        scoring = (json.loads(cfg_path.read_text()) or {}).get("scoring") or {}
    if not scoring:
        print("! no scoring table in league_config; refusing rather than "
              "archiving points computed under an assumed table")
        return 1

    from scoring import score_stat_line
    proj = {}
    raw_by_id = {}
    for pid, row in (raw or {}).items():
        stats = row.get("stats") if isinstance(row, dict) and "stats" in row else row
        if not isinstance(stats, dict):
            continue
        pts = score_stat_line(stats, scoring)
        if pts:
            proj[str(pid)] = pts
            raw_by_id[str(pid)] = stats
    if not proj:
        print("! nothing scored above zero; refusing to write")
        return 1

    doc = json.loads(OUT.read_text()) if OUT.exists() else {"series": []}
    doc["series"] = PS.append_snapshot(doc.get("series") or [], date,
                                       "sleeper_weekly", proj, week=week,
                                       raw_by_id=raw_by_id)
    doc.setdefault("_note", "")
    if "in-season weekly" not in doc["_note"]:
        doc["_note"] = (doc["_note"] + " IN-SEASON WEEKLY snapshots (source "
                        "sleeper_weekly, keyed by week) are the ONLY input a "
                        "January shadow-strategy replay cannot recover: providers "
                        "overwrite weekly numbers in place. See "
                        "draft/weekly_proj_snapshot.py.").strip()
    OUT.write_text(json.dumps(doc, indent=1, sort_keys=True))
    n_weekly = sum(1 for s in doc["series"] if s.get("week") is not None)
    print(f"wrote {OUT}: {len(proj)} players for week {week}; "
          f"{n_weekly} weekly snapshot(s) archived")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
