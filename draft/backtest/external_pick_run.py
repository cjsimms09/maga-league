#!/usr/bin/env python3
# TERRITORY: C
"""RUN THE PICK-PREDICTION GRADE — which source priced OUR ROOM'S picks best.

Cory pushed back on "we hold no historical ADP for our own drafts" and he was
right; `external_pick_prediction` is the arithmetic that answers him and it has
never been executed. This is the missing half: it fetches nothing itself and
decides nothing, it just wires the two halves that already exist together and
prints what comes out.

WHAT IT REUSES RATHER THAN REDERIVES, because a crosswalk is exactly where a
second implementation hides:

  * `external_source_run.capture_ffc` / `.capture_fantasypros` — already fetch a
    YEAR's board and return it keyed by OUR Sleeper id, with the crosswalk counts
    and the provider's declared depth in `params`. They take `year` because the
    daily archive needed it; nothing new is required to point them at 2023.
  * `external_source_run.ffc_format` — our format and league size from the config
    that the board itself reads, never typed here.
  * `external_pick_prediction.season_report` — the grade, keepers resolved
    season-wide.

⚠ WHAT THIS RUN CANNOT ESCAPE, STATED UP FRONT RATHER THAN IN A FOOTNOTE. Two
things make every coefficient here softer than it looks, and neither is fixable
by running it more carefully:

  1. **A year-scoped ADP is the accumulated season, not a pre-draft board.** It
     contains drafts that happened AFTER ours, and the accumulation windows differ
     per source, so the inflation is unequal. `compare` returns `contaminated:
     True` and carries the depths beside every coefficient. Read the ORDERING of
     the sources, never the absolute value.
  2. **The crosswalk runs through TODAY'S Sleeper player export.** A 2023 board is
     matched by name against a 2026 pool, so a player whose team or listing
     changed can fail to match — and it fails at different rates per source and
     per year. That is a measurement about the past computed through the present,
     the defect class this project keeps paying for. It is not silently absorbed:
     the per-source matched counts travel in `params` and the run prints them, and
     everything is graded on the INTERSECTION so an uneven crosswalk cannot flatter
     one source with more coverage than another.

⚠ AND IT DECIDES NOTHING. Whether the result moves anything before the 22nd is
A's call and was routed as such. My own recommendation, routed with it: evidence
for 2027, not an input to this draft.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))


def sources_from(results) -> dict:
    """Per-source `result` dicts -> the `sources` and `depth` maps `compare` reads.

    THIS IS WHY IT IS A TESTED FUNCTION AND NOT FOUR LINES IN `main`. `compare`
    grades on the INTERSECTION of every source it is handed, so a source that
    produced nothing does not merely go missing — it empties the shared set and
    takes the whole season's comparison with it. The report then says
    `unmeasured, shared_n: 0`, which reads as "the sources cover different
    players" when what actually happened is that FantasyPros returned a 404.

    So a source that failed, or fetched an empty board, is DROPPED AND NAMED
    before it can reach the intersection.

    DEPTH IS None WHERE NONE WAS PUBLISHED, NEVER 0. FantasyPros publishes an
    expert consensus rather than a draft count; zero would sort it to the bottom
    of any depth ordering and make the contamination caveat read as "this source
    is the least contaminated", which is the opposite of what an unpublished
    count means.

    AND ONE SURVIVING SOURCE IS NOT A COMPARISON. The question is which source
    predicted our room best; with one there is no "which", and a lone rho of 0.72
    reads as an answer to it. `comparable` says so rather than leaving the reader
    to notice the table has one row.
    """
    sources, depth, dropped = {}, {}, []
    for r in results or []:
        name = str((r or {}).get("source"))
        if (r or {}).get("error"):
            dropped.append({"source": name, "reason": r["error"]})
            continue
        # A player the source LISTED but did not PRICE is not evidence about him.
        # Left in, he joins the intersection and `compare` casts a None with
        # float(), so the coefficient is computed over a population wider than
        # the prices behind it.
        rows = {str(k): float(v) for k, v in ((r or {}).get("rows") or {}).items()
                if v is not None}
        if not rows:
            dropped.append({"source": name,
                            "reason": "the fetch returned no priced players — "
                                      "dropped rather than passed through, because "
                                      "an empty table empties the intersection and "
                                      "the season would report `unmeasured` with "
                                      "nothing naming the cause"})
            continue
        sources[name] = rows
        # `.get` WITHOUT A DEFAULT OF 0 — see the docstring. A missing key and a
        # published zero must not become the same number.
        depth[name] = ((r or {}).get("params") or {}).get("total_drafts")
    note = None
    if len(sources) < 2:
        note = ("only %d source survived (%s) — this is not a comparison. Every "
                "coefficient below describes one source against our picks, and "
                "nothing in it says which source is better, because there is no "
                "second one to be better than."
                % (len(sources), ", ".join(sorted(sources)) or "none"))
    return {"sources": sources, "depth": depth, "dropped": dropped,
            "comparable": len(sources) >= 2, "note": note}


def main(argv=None):  # pragma: no cover  (egress, CI only)
    import argparse
    import json

    import external_pick_prediction as PP
    import external_source_run as SR

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--seasons", default="2023,2024,2025")
    ap.add_argument("--json-out", default=None)
    a = ap.parse_args(argv)
    seasons = [s.strip() for s in a.seasons.split(",") if s.strip()]

    try:
        import config_schema
        cfg = config_schema.load(HERE.parent / "config" / "league_config.json")
        fmt = SR.ffc_format(cfg)
        teams = int(cfg.get("teams") or 0)
        if teams <= 0:
            raise ValueError("no `teams` in the league config — FFC's board is "
                             "league-size specific and 10 is a guess, not a read")
    except Exception as e:                            # noqa: BLE001
        print("LEAGUE FORMAT UNREADABLE (%s: %s) — refusing to grade sources "
              "under parameters nobody chose." % (type(e).__name__, e))
        return 1
    print("format: %s, teams: %d (from the league config, not typed here)"
          % (fmt, teams))

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    positions = json.loads(
        (HERE.parent / "data" / "player_positions.json").read_text())["positions"]

    try:
        import sleeper_import as si
        pool = si.fetch_players()
    except Exception as e:                            # noqa: BLE001
        print("PLAYER POOL UNAVAILABLE (%s: %s) — no source can be crosswalked to "
              "our pick record, so nothing can be graded."
              % (type(e).__name__, e))
        return 1

    out = {"seasons": {}, "format": fmt, "teams": teams}
    for season in seasons:
        results = []
        # PER SOURCE, PER SEASON, AND CAUGHT SEPARATELY. A 2023 FFC failure must
        # not cost us 2023 FantasyPros or 2024 anything — the comparison is
        # between sources, so losing one silently is losing the question.
        for name, fn in (("ffc", lambda: SR.capture_ffc(pool, season, teams, fmt)),
                         ("fantasypros",
                          lambda: SR.capture_fantasypros(pool, season))):
            try:
                results.append(fn())
            except Exception as e:                    # noqa: BLE001
                results.append(SR.result(name, error="%s: %s" % (type(e).__name__, e)))
        asm = sources_from(results)
        for d in asm["dropped"]:
            print("  %s %s: DROPPED — %s" % (season, d["source"], d["reason"]))
        rep = PP.season_report(history, season, asm["sources"],
                               positions=positions, depth=asm["depth"])
        rep["comparable"] = asm["comparable"]
        rep["assembly_note"] = asm["note"]
        rep["dropped_sources"] = asm["dropped"]
        # THE CROSSWALK RATE TRAVELS WITH THE RESULT. It is the number that says
        # how much of the past this present-day pool could still resolve, and it
        # differs per source and per year.
        rep["matched"] = {r["source"]: (r.get("params") or {}).get("matched")
                          for r in results if not r.get("error")}
        out["seasons"][season] = rep
        print("%s: %s | shared %d | graded %d of %d picks (%d keepers out)"
              % (season, rep.get("status"), rep.get("shared_n", 0),
                 rep.get("picks_graded", 0), rep.get("picks_total", 0),
                 rep.get("keepers_excluded", 0)))
        for name, v in sorted((rep.get("sources") or {}).items()):
            print("    %-12s rho %+.4f  n=%d  total_drafts=%s"
                  % (name, v["rho"], v["n"], v["total_drafts"]))
        if asm["note"]:
            print("    ⚠ %s" % asm["note"])

    if a.json_out:
        Path(a.json_out).write_text(json.dumps(out, indent=1))
        print("wrote %s" % a.json_out)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
