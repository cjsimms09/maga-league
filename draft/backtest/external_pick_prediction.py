#!/usr/bin/env python3
# TERRITORY: C
"""WHICH SOURCE PREDICTED **OUR ROOM'S** PICKS — the test Cory asked for.

He pushed back on "we hold no historical ADP for our own drafts" and he was
right. Everything this needs already exists:

  * `draft/data/league_history.json` carries **450 real picks** — 2023, 2024 and
    2025 at 150 each — keyed by Sleeper `player_id` with `pick_no` and
    `is_keeper`.
  * All three sources' historical ADP has ALREADY been fetched, by A's own
    `exp_source_grade`: FantasyPros 2023 = 358 rows parsed / 126 crosswalked,
    MFL 2023 `totalDrafts` 5011 and 2024 4485, FFC via
    `adp.fetch_adp(fmt, teams, year)` which `adp.historical_adp()` wraps.

THE BLOCKER WAS NEVER THE DATA — IT IS THE OUTCOME VARIABLE. `exp_source_grade`
computes `Spearman(-adp, REALIZED POINTS)`: which source orders VALUE best. This
grades against `pick_no`: where our ten managers actually took people. Same
inputs, same crosswalk, same seasons. Never run.

⚠ THIS FILE DECIDES NOTHING AND FETCHES NOTHING. It is the arithmetic, pure and
tested; A owns whether the result is produced and whether it moves anything. The
recommendation routed with it was to run it as evidence for 2027 and NOT to let
it touch the anchor before the 22nd.

THE THREE WAYS THIS COMPARISON LIES, each with a fail arm:

  1. **A keeper is not a market decision.** 2024 had 23 of them, 2025 had 20. It
     occupies a pick without anybody choosing from the pool, so grading a source
     on one grades it on a decision made a year earlier under different rules.
     Excluded by default and counted.

  2. **Sources cover different players.** FantasyPros crosswalked 126 in 2023,
     MFL far more. `rho` over 126 against `rho` over 200 is two questions with
     one label — the depth-normalisation defect this project has already paid for
     once. Everything is graded on the INTERSECTION, and the intersection is
     reported.

  3. **A year-scoped ADP is the accumulated season, not a pre-draft board.** It
     contains drafts that happened AFTER ours; D3 measures it directly — 2025
     complete reports 844 drafts against 2026 in progress at 112. That inflates
     every source and NOT equally, since accumulation windows differ (MFL: 5011
     drafts in 2023, 4485 in 2024). `total_drafts` therefore travels beside every
     coefficient, and the caveat is in the returned object rather than in a note
     somebody has to remember.
"""
from __future__ import annotations

import sys
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

#: Below this many shared players a rank correlation is arithmetic, not evidence:
#: two points give exactly +1 or -1 and read as a perfect source.
MIN_SHARED = 8


def picks_of(history, season, include_keepers=False) -> list:
    """Our room's real picks for one season, keepers removed.

    A KEEPER IS NOT A MARKET DECISION. It occupies a pick number without anybody
    choosing from the pool, and scoring a source on one silently rewards whichever
    source happens to rank keepers near their forfeit round. Roughly one pick in
    seven across our three drafts.

    ⚠ A SEASON IS NOT ONE DRAFT, AND 2023 IS THE PROOF. `league_history` holds
    FOUR drafts across three seasons: 2024 and 2025 flag their keepers INLINE on
    the single draft, while 2023 has a 150-pick main draft with `is_keeper: None`
    on every row PLUS a 30-pick record whose rows are all keepers and whose 30
    player_ids are all also in the main draft. That record is a keeper ROSTER, not
    a draft.

    This function used to concatenate them, which produced two failures in
    opposite directions from one cause. `include_keepers=True` returned 180 rows
    for a 150-pick draft, thirty of them the same players twice at two different
    pick numbers. `include_keepers=False` dropped the thirty FLAGGED rows and kept
    the same thirty players through the main draft, where nothing marks them — so
    it reported `keepers_excluded: 30` while excluding none of them, and 2023
    would have been graded on a population containing every keeper while 2024 and
    2025 were graded without theirs. Criterion 1, with the guard announcing it had
    already handled it.

    SO KEEPERS ARE RESOLVED SEASON-WIDE and pick numbers come from the PRIMARY
    draft — the one with the most picks, which is the only one whose numbers are
    draft positions. The keeper roster contributes identity and nothing else.

    AND THE PREMISE IS CHECKED RATHER THAN ASSUMED. All of that holds only while
    the secondary record is METADATA about players the primary already contains. A
    secondary draft holding somebody the primary lacks is a real supplemental
    draft, and quietly keeping only the primary would delete real picks — so it
    raises, by name.

    REFUSES A SEASON WE DO NOT HOLD, by name. Returning an empty list would let a
    typo in the year read as a draft where nobody picked anybody, and every
    coefficient computed after it would be about nothing.
    """
    seasons = {str(s.get("season")): s for s in (history or {}).get("seasons") or []}
    if str(season) not in seasons:
        raise ValueError(
            "no season %r in league_history — held seasons are %s. Refusing to "
            "grade an empty draft, which is what an empty list would become."
            % (season, sorted(seasons)))
    drafts = [d for d in seasons[str(season)].get("drafts") or [] if d.get("picks")]
    if not drafts:
        raise ValueError(
            "season %r holds no draft with any picks. Refusing rather than "
            "returning an empty list, which reads as a draft nobody picked in."
            % season)

    # THE PRIMARY IS THE FULL SLATE. A tie means two records both claim to be the
    # draft and nothing here can say which — picking either would be a guess
    # written into the outcome variable.
    drafts.sort(key=lambda d: -len(d.get("picks") or []))
    if len(drafts) > 1 and len(drafts[0]["picks"]) == len(drafts[1]["picks"]):
        raise ValueError(
            "season %r has two drafts of %d picks each and no way to tell which "
            "carries the real draft positions. Refusing to choose."
            % (season, len(drafts[0]["picks"])))
    primary, secondary = drafts[0], drafts[1:]

    ids_primary = {str(p.get("player_id")) for p in primary["picks"]}
    kept_ids = {str(p.get("player_id")) for d in drafts for p in d.get("picks") or []
                if p.get("is_keeper")}
    for d in secondary:
        extra = sorted({str(p.get("player_id")) for p in d.get("picks") or []}
                       - ids_primary)
        if extra:
            raise ValueError(
                "draft %r in season %r holds %d player(s) not in the primary "
                "draft (%s...) — that is a real SUPPLEMENTAL draft, not keeper "
                "metadata, and this function would silently delete those picks. "
                "Refusing." % (d.get("draft_id"), season, len(extra), extra[:5]))

    out = []
    for p in primary["picks"]:
        if p.get("player_id") is None or p.get("pick_no") is None:
            continue
        pid = str(p["player_id"])
        # SEASON-WIDE, not row-local. The flag may live on any draft of the season.
        is_keeper = bool(p.get("is_keeper")) or pid in kept_ids
        if is_keeper and not include_keepers:
            continue
        out.append({"player_id": pid,
                    "pick_no": float(p["pick_no"]),
                    "round": p.get("round"),
                    "is_keeper": is_keeper})
    return sorted(out, key=lambda x: x["pick_no"])


def compare(picks, sources: dict, positions: dict = None, depth: dict = None) -> dict:
    """Grade every source against where OUR ROOM actually took people.

    ON THE INTERSECTION, ALWAYS. Each source crosswalks a different subset, and a
    coefficient computed over a source's own coverage is a statement about that
    coverage as much as about its accuracy.

    Reports, per source:
      `rho`          Spearman(adp, pick_no). Higher = ordered our picks better.
                     ⚠ NOT `-adp`. The sibling experiment negates it because its
                     outcome is REALIZED POINTS, where low ADP should mean high
                     points — so the sign has to be flipped for "higher is
                     better" to hold. Here the outcome is a PICK NUMBER, and a
                     good source has low ADP at low pick number: the two run the
                     SAME way. I copied `-adp` across and my own fixture returned
                     -0.81 for a source that predicts almost perfectly. Same
                     expression, different quantity — the defect this project
                     keeps finding, in the file written to check for it.
      `by_position`  the median number of picks our room was EARLY relative to
                     that source. Positive = the room reached. This is the
                     reportable half: the room's bias is position-shaped — A
                     measured QB1 5.7 picks early and TE1 13.0 with RB and WR at
                     zero — and one rank correlation over 150 picks averages that
                     away entirely.
      `total_drafts` the source's own declared sample depth, or None. NEVER 0: a
                     source that publishes no count is not a shallow source.
    """
    from lab_projections import spearman            # unit-tested, reused not rewritten

    pick_of = {p["player_id"]: p["pick_no"] for p in (picks or [])}
    if not sources:
        return {"status": "unmeasured", "shared_n": 0, "sources": {},
                "note": "no sources supplied — nothing to compare"}
    shared = set(pick_of)
    for tbl in sources.values():
        shared &= set(tbl or {})
    shared = sorted(shared)
    if len(shared) < MIN_SHARED:
        return {"status": "unmeasured", "shared_n": len(shared),
                "shared_players": shared, "sources": {},
                "note": "only %d players are shared by our picks AND every source. "
                        "A rank correlation over that many is arithmetic rather "
                        "than evidence — two points give exactly +/-1." % len(shared)}

    out = {}
    for name, tbl in sources.items():
        adp = [float(tbl[pid]) for pid in shared]
        got = [pick_of[pid] for pid in shared]
        per = {}
        for pid in shared:
            pos = (positions or {}).get(pid)
            if pos:
                # POSITIVE = OUR ROOM TOOK HIM EARLIER THAN THE SOURCE PRICED HIM.
                per.setdefault(pos, []).append(float(tbl[pid]) - pick_of[pid])
        out[name] = {
            "n": len(shared),
            "rho": round(spearman(adp, got), 4),
            "by_position": {k: {"n": len(v),
                                "median_room_earlier_by": round(median(v), 1)}
                            for k, v in sorted(per.items())},
            # NONE, NOT ZERO. "The provider did not publish a count" and "nobody
            # drafted" are opposite readings of the same integer.
            "total_drafts": (depth or {}).get(name),
        }
    known = [v for v in (depth or {}).values() if v is not None]
    return {
        "status": "measured",
        "shared_n": len(shared), "shared_players": shared,
        "sources": out,
        # THE CONTAMINATION IS PART OF THE RESULT, not a footnote somebody has to
        # remember. It is never False for a year-scoped fetch.
        "contaminated": True,
        "depth_spread": {"min": min(known), "max": max(known)} if known else None,
        "caveat": (
            "A year-scoped ADP is the ACCUMULATED season average and contains "
            "drafts that happened after ours — D3 measures 844 drafts for a "
            "complete 2025 against 112 for 2026 in progress. Every coefficient "
            "here is inflated by hindsight, and NOT equally: accumulation windows "
            "differ per source, so the crowd that drafts latest gains the most. "
            "Read the ORDERING of the sources, never the absolute value, and read "
            "`total_drafts` beside it."),
    }


def season_report(history, season, sources: dict, positions: dict = None,
                  depth: dict = None) -> dict:
    """One season end to end: picks, keepers removed and counted, then the grade."""
    all_picks = picks_of(history, season, include_keepers=True)
    picks = [p for p in all_picks if not p["is_keeper"]]
    rep = compare(picks, sources, positions=positions, depth=depth)
    rep["season"] = str(season)
    rep["picks_total"] = len(all_picks)
    rep["picks_graded"] = len(picks)
    # COUNTED, NOT JUST DROPPED — a season whose keeper count jumps changes the
    # population being graded, and that has to be visible next to the result.
    rep["keepers_excluded"] = len(all_picks) - len(picks)
    return rep
