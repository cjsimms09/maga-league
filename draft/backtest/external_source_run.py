#!/usr/bin/env python3
# TERRITORY: C
"""THE RUNNER FOR THE PER-SOURCE ARCHIVE — egress here, decisions in pure functions.

A's ask, routed 2026-08-14: "extend `adp_series` to the shape you already built
for MFL — per SOURCE, per player, per day, with `total_drafts`." This is that,
and `external_source_capture.py` is the store it writes to.

⚠ WHY THIS IS A MODULE AND NOT A HEREDOC IN THE WORKFLOW. The first version of
this step was fifty lines of Python inside `external-adp-capture.yml`, and it
guessed at both providers' APIs: it called `FP.fetch(year)` as though it returned
html (it returns `(text, url, diag)`), and keyed FFC rows on `entry["player_id"]`,
a field FFC does not send. Both guesses fail SILENTLY into a zero-row day — the
step goes green, the archive gains a dated row with nothing in it, and the
comparison it exists for is quietly a comparison of nothing. Code inside YAML
cannot be tested, which is exactly how those two defects got written.

⚠ WHY IT USES A's BUILDERS RATHER THAN ITS OWN CROSSWALK. `build_adp_table` and
`build_fantasypros_table` already produce each source's board keyed by OUR player
id, BEFORE `merge_primary_over_ffc` collapses them. Reusing them is not laziness,
it is the correctness requirement Cory stated: values being compared must be
derived from the same thing. A second crosswalk written here would drift from the
board's, and then "FFC prices Allen at 12, FantasyPros at 27" could be two
different players wearing one id — a bug that reads as a finding.

WHAT IT REFUSES. A source that fails, or that returns nothing, is NOT WRITTEN. A
dated row with an empty board is worse than an absent day: absence is visible in
`days_missing_a_source`, an empty board is counted as covered. And one source
failing must never stop another being recorded — the whole point of holding the
alternatives is that they are independent.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(HERE.parent) not in sys.path:                  # draft/ — A's adp.py lives there
    sys.path.insert(0, str(HERE.parent))

import external_source_capture as S  # noqa: E402

#: Field names a provider might use for "how many drafts is this average over".
#: DECLARED, not guessed at the call site, and the whole payload meta is stored
#: verbatim beside it so a name that is on none of these lists is still
#: recoverable next August. The recurring defect in this project is a consumer
#: reading a field name its author believed in; this is the cheap inoculation.
#:
#: ⚠ `total` IS DELIBERATELY NOT ON THIS LIST. It reads as "total drafts" and as
#: "total players" with equal ease, and a WRONG depth is worse than an unknown
#: one — unknown is visible and argues for nothing, wrong silently decides the
#: anchor. Ordered most-specific first and searched FIELD-MAJOR, so a payload
#: carrying both a draft count and some other sample size cannot have its meaning
#: flipped by where the provider chose to nest them.
DEPTH_KEYS = ("total_drafts", "num_drafts", "draft_count", "n_drafts", "drafts",
              "sample_size")


def declared_depth(meta) -> dict:
    """How many drafts the average is over, and WHICH FIELD SAID SO.

    A's item turns on this number ("FFC's coverage is proven, its DEPTH is not"),
    and the honest answers are three, not two: a value, a stated absence, or an
    unreadable payload. Returning 0 for "the provider did not say" would make a
    source with unknown depth indistinguishable from a source nobody drafted —
    and the second reading argues for switching the anchor away from it.
    """
    if not isinstance(meta, dict):
        return {"value": None, "field": None,
                "note": "no payload meta to read — depth UNKNOWN, not zero"}
    scopes = (meta, meta.get("meta") if isinstance(meta.get("meta"), dict) else {})
    for k in DEPTH_KEYS:
        for scope in scopes:
            v = (scope or {}).get(k)
            if v is None:
                continue
            try:
                return {"value": int(v), "field": k, "note": None}
            except (TypeError, ValueError):
                return {"value": None, "field": k,
                        "note": "field %r present but not a number (%r)" % (k, v)}
    return {"value": None, "field": None,
            "note": "provider declared no draft count in %s — depth UNKNOWN, not "
                    "zero; the raw meta is stored verbatim" % sorted(meta)}


def ffc_format(cfg: dict, derive=None, formats=None) -> str:
    """FFC's path segment for OUR scoring — the board's own derivation, validated.

    ⚠ TWO SEPARATE FAILURES, BOTH SILENT, BOTH HIT. `fetch_adp` does
    `FORMATS.get(fmt, "half-ppr")`, so an unrecognised format string is not an
    error — it is quietly replaced. My first version passed `"half_ppr"` with an
    UNDERSCORE, which is not a FORMATS key; it fetched the right board only
    because the default happened to be the answer, while `build_adp_table`'s
    report recorded a format string the module does not recognise.

    And the value itself is DERIVED BY `build._ffc_format`, not typed here.
    Cory's rule is that values being compared must come from the same thing: the
    archived FFC price has to be the price the board's anchor would have used, so
    a second copy of the rec>=0.75/0.25 rule in this lane is exactly the
    divergence the rule forbids. `derive`/`formats` are injectable so the refusal
    below is testable without egress.
    """
    if derive is None:
        import build as B                              # cheap: no import-time egress
        derive = B._ffc_format
    if formats is None:
        import adp as A
        formats = A.FORMATS
    rec = ((cfg or {}).get("scoring") or {}).get("rec")
    if rec is None:
        # NOT DEFAULTED. A missing scoring block means we do not know our own
        # format, and archiving half-PPR under that ignorance writes a guess into
        # the evidence — the same null-as-absence this whole lane keeps finding.
        raise ValueError(
            "no `scoring.rec` in the league config, so FFC's format cannot be "
            "derived. Refusing to archive a format nobody chose — a guessed "
            "format reads as a deliberate one a year later.")
    fmt = derive(cfg)
    if fmt not in formats:
        raise ValueError(
            "derived FFC format %r is not one of %s. `fetch_adp` would swallow "
            "this into its default and fetch a DIFFERENT league format than "
            "`params` claims to describe." % (fmt, sorted(formats)))
    return fmt


def result(name: str, rows: dict = None, sd: dict = None, params: dict = None,
           note: str = None, error: str = None) -> dict:
    """One source's outcome for one day, as a VALUE rather than a side effect.

    Separating "what happened" from "what gets written" is what makes the refusal
    below testable without egress.
    """
    return {"source": str(name), "rows": rows, "sd": sd,
            "params": dict(params or {}), "note": note, "error": error}


def apply_results(series: list, year, observed_at: str, results: list) -> tuple:
    """Write only the sources that actually produced a board. -> (series, verdicts).

    THREE OUTCOMES PER SOURCE, and the middle one is the one that matters:
      recorded — a real board, stored
      empty    — the fetch worked and returned nothing. NOT WRITTEN. A dated row
                 with no board behind it reads as a covered day for ever after,
                 and `days_missing_a_source` — the instrument that notices a
                 source going dark — would count it as present.
      failed   — an exception, named. Also not written, and INDEPENDENT: FFC
                 raising must not cost us FantasyPros, because the entire reason
                 this archive exists is to hold the alternatives separately.
    """
    verdicts = []
    for r in results or []:
        name = r.get("source")
        if r.get("error"):
            verdicts.append({"source": name, "verdict": "failed", "rows": 0,
                             "note": r["error"]})
            continue
        rows = r.get("rows") or {}
        live = {k: v for k, v in rows.items() if v is not None}
        if not live:
            verdicts.append({"source": name, "verdict": "empty", "rows": 0,
                             "note": "the fetch returned no priced players — NOT "
                                     "written, because a dated empty board counts "
                                     "as a covered day for ever afterwards"})
            continue
        series = S.append_day(series, name, year, observed_at, live,
                              sd=r.get("sd"), params=r.get("params"),
                              note=r.get("note"))
        verdicts.append({"source": name, "verdict": "recorded", "rows": len(live),
                         "note": None})
    return series, verdicts


def summary(verdicts: list) -> str:
    """One line for the log, naming every source and its outcome.

    NAMES THE ABSENT ONES. A summary that lists only what worked is how a source
    goes dark for a fortnight without anyone noticing — the failure this archive's
    `days_missing_a_source` exists to catch, reproduced in the log line above it.
    """
    if not verdicts:
        return ("NO SOURCE ATTEMPTED — nothing written. This is a statement about "
                "the run, not about the providers.")
    got = [v for v in verdicts if v["verdict"] == "recorded"]
    parts = ["%s:%s" % (v["source"], v["rows"] if v["verdict"] == "recorded"
                        else v["verdict"].upper()) for v in verdicts]
    head = ("recorded %d/%d source(s)" % (len(got), len(verdicts))) if got else \
        ("NO SOURCE CAPTURED — nothing written; the day's MFL snapshot is "
         "committed and unaffected")
    return "%s — %s" % (head, ", ".join(parts))


# ---------------------------------------------------------------------------
# egress — CI only, and every one of these returns a `result` rather than raising
# ---------------------------------------------------------------------------

def capture_ffc(sleeper_players, year, teams, fmt):  # pragma: no cover
    """FFC's own board, keyed by our player id, pre-merge.

    ⚠ `strict_top_n=0` ON PURPOSE, AND IT IS NOT A RELAXED FILTER. That gate makes
    `build_adp_table` REFUSE when a top-N player fails to crosswalk, because a
    BOARD built on a broken anchor is worse than no board. This is not building a
    board — it is archiving what the source said on a day that cannot be
    refetched, and throwing the observation away over a nickname variant would
    destroy the evidence permanently to protect a decision nobody is making here.
    The gate's information is not discarded: `matched`, `unmatched_count` and the
    collision counts travel in `params`, so a day where the crosswalk degraded is
    visible in the archive rather than absent from it.
    """
    import adp as A
    payload = A.fetch_adp(fmt, teams, int(year))       # cached; build_adp_table reuses it
    meta = {k: v for k, v in (payload or {}).items() if k != "players"}
    depth = declared_depth(payload)
    table = A.build_adp_table(sleeper_players, fmt=fmt, teams=teams, year=int(year),
                              strict_top_n=0)
    rows = {pid: r["adp"] for pid, r in table["adp"].items() if r.get("adp") is not None}
    # FFC PUBLISHES A STANDARD DEVIATION AND THE MERGE DESTROYS IT TOO — the
    # merged row keeps `ffc-published` sd only where FFC also priced the player,
    # which is 4 of 215. It is the same unrefetchable measurement as the mean and
    # costs one dict to keep. `fitted` sds are NOT stored: a number derived from
    # the mean by our own clamp is not something the provider said, and archiving
    # it as if it were is how a fitted value becomes evidence a year later.
    sd = {pid: r["adp_sd"] for pid, r in table["adp"].items()
          if r.get("adp_sd") is not None and r.get("adp_sd_source") == "ffc"}
    rep = table["report"]
    return result(
        "ffc", rows=rows, sd=sd,
        params={"format": fmt, "teams": teams, "year": int(year),
                "endpoint": "fantasyfootballcalculator/api/v1/adp",
                "total_drafts": depth["value"], "total_drafts_field": depth["field"],
                "total_drafts_note": depth["note"],
                "provider_meta": meta,
                # ⚠ WHAT IS AND IS NOT MATCHED, AS DATA RATHER THAN PROSE.
                # A's correction (Cory caught it): `adp.py:67` — FFC publishes
                # `standard`, `ppr`, `half-ppr`, `2qb`, `dynasty`, every one a
                # RECEPTION or ROSTER-SHAPE axis. There is NO passing-TD
                # parameter, so FFC is 4-point passing TDs exactly like
                # FantasyPros. "Our exact settings" was false on the one rule
                # that produces the whole measured gap, and it was about to be
                # written into every row of this archive daily. A false claim
                # stored beside real numbers is worse than no claim — a year
                # from now it is indistinguishable from a measurement.
                "format_axes_matched": ["reception scoring", "teams"],
                "format_axes_unmatched": [
                    "passing TD value: our league scores 6.0, the market default "
                    "is 4.0, and FFC serves no parameter for it — this source is "
                    "4.0 like every other public source"],
                "parsed": rep.get("parsed"), "matched": rep.get("matched"),
                "unmatched": rep.get("unmatched_count"),
                "collisions": rep.get("collisions"),
                "dropped_to_collision": rep.get("dropped_to_collision"),
                "published_sd_rows": len(sd)},
        note="real human drafts at our reception scoring and league size, but NOT "
             "at our passing TD value — FFC exposes no such parameter, so this is "
             "4.0 and we score 6.0; crosswalked by draft/adp.py:build_adp_table, "
             "the same one the board uses")


def capture_fantasypros(sleeper_players, year, half_ppr=True):  # pragma: no cover
    """FantasyPros' own board, keyed by our player id, pre-merge.

    `min_rows=1` for the same reason `strict_top_n=0` is set above: that threshold
    exists so a thin FP fetch can never DEGRADE the board below its FFC baseline,
    which is a statement about anchoring and not about archiving. A thin day is
    still what FantasyPros said on a day nobody can refetch — and it is not
    silently accepted as a full board either: `rows_parsed` and `matched` travel
    in `params`, and a fetch that yields nothing is refused by `apply_results`.
    """
    import adp as A
    rows_t, diag = A.build_fantasypros_table(sleeper_players, year=int(year),
                                             half_ppr=half_ppr, min_rows=1)
    if rows_t is None:
        return result("fantasypros", rows={},
                      params={"scoring": "HALF" if half_ppr else "PPR",
                              "year": int(year), **diag},
                      note=diag.get("reason"))
    return result(
        "fantasypros",
        rows={pid: r["adp"] for pid, r in rows_t.items() if r.get("adp") is not None},
        # NO sd MAP: FantasyPros publishes no standard deviation, so every value
        # in `adp_sd` here is our own clamp fitted from the mean. Storing it would
        # archive our arithmetic as the provider's opinion.
        params={"scoring": "HALF" if half_ppr else "PPR", "year": int(year),
                "endpoint": "fantasypros consensus-rankings?type=adp",
                # DEPTH IS UNKNOWN AND SAID SO. FP publishes an expert consensus,
                # not a draft count; recording 0 or omitting the field would let a
                # depth comparison silently treat "not published" as "shallow".
                "total_drafts": None,
                "total_drafts_note": "FantasyPros publishes expert consensus, not "
                                     "a draft sample — depth is not applicable "
                                     "rather than zero",
                # THE SAME UNMATCHED AXIS, ON THIS SOURCE TOO — and that is the
                # finding, not a caveat. No public source prices 6-point passing
                # TDs, so the QB bias CANNOT be fixed by choosing between them:
                # it is structural. Recording the limitation on one source only
                # would read as the other being clean, which is the original
                # error with the sources swapped.
                "format_axes_matched": ["reception scoring"],
                "format_axes_unmatched": [
                    "passing TD value: our league scores 6.0, the market default "
                    "is 4.0, and this consensus is drawn from 4.0 drafts",
                    "league size: FantasyPros consensus is not league-size "
                    "specific; FFC's is"],
                "rows_parsed": diag.get("fp_rows_parsed"),
                "matched": diag.get("fp_matched"), "unmatched": diag.get("fp_unmatched"),
                "collisions": diag.get("fp_collisions"),
                "dropped_to_collision": diag.get("fp_dropped_to_collision"),
                "fp_url": diag.get("fp_url")},
        note="expert consensus at HALF scoring; crosswalked by "
             "draft/adp.py:build_fantasypros_table, the same one the board uses")


def main(argv=None):  # pragma: no cover  (egress, CI only)
    import argparse
    import datetime

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--year", default="2026")
    ap.add_argument("--date", default=None,
                    help="observation date (UTC today if omitted) — passed in so "
                         "the archive logic stays clock-free and testable")
    a = ap.parse_args(argv)
    day = a.date or datetime.datetime.now(datetime.timezone.utc).date().isoformat()

    # ── OUR FORMAT AND OUR LEAGUE SIZE, FROM THE CONFIG THE BOARD READS ──────
    # Both were literals in the first draft (`teams=10`, `fmt="half_ppr"`), and
    # the second was not even a valid FFC format — it worked only because
    # `fetch_adp` defaults an unknown string to half-PPR. An archive whose
    # `params` describe a format it did not actually fetch is worse than no
    # archive: the comparison it exists for silently spans two scoring systems.
    try:
        import config_schema
        cfg = config_schema.load(HERE.parent / "config" / "league_config.json")
        fmt = ffc_format(cfg)
        teams = int(cfg.get("teams") or 0)
        if teams <= 0:
            raise ValueError("no `teams` in the league config — FFC's board is "
                             "league-size specific and 10 is a guess, not a read")
    except Exception as e:                            # noqa: BLE001
        print("LEAGUE FORMAT UNREADABLE (%s: %s) — refusing to archive a board "
              "under parameters nobody chose. The day's MFL snapshot is committed "
              "and unaffected." % (type(e).__name__, e))
        return 1
    print("format: %s, teams: %d (derived from the league config, not typed here)"
          % (fmt, teams))

    # ONE PLAYER DUMP FOR BOTH SOURCES. Both crosswalks index the same Sleeper
    # pool; fetching it twice would double a 5MB pull for no gain, and fetching a
    # DIFFERENT dump per source would put the two boards on two id spaces — the
    # precise failure this file's docstring refuses.
    results = []
    try:
        import sleeper_import as si
        pool = si.fetch_players()
    except Exception as e:                            # noqa: BLE001
        print("PLAYER POOL UNAVAILABLE (%s: %s) — no source can be crosswalked, so "
              "nothing is written. The day's MFL snapshot is committed and "
              "unaffected." % (type(e).__name__, e))
        return 1

    for name, fn in (("ffc", lambda: capture_ffc(pool, a.year, teams, fmt)),
                     ("fantasypros", lambda: capture_fantasypros(pool, a.year))):
        try:
            results.append(fn())
        except Exception as e:                        # noqa: BLE001
            # CAUGHT PER SOURCE, DELIBERATELY. `build_adp_table` raises on a
            # crosswalk it cannot account for, and that refusal is right — but it
            # is a refusal about FFC, and letting it propagate would silently cost
            # us FantasyPros' board on the same unrefetchable day.
            results.append(result(name, error="%s: %s" % (type(e).__name__, e)))

    series, verdicts = apply_results(S.load(), a.year, day, results)
    line = summary(verdicts)
    print(line)
    for v in verdicts:
        if v["verdict"] != "recorded":
            print("  %s: %s — %s" % (v["source"], v["verdict"].upper(), v["note"]))
    if any(v["verdict"] == "recorded" for v in verdicts):
        S.save(series)
        cov = S.coverage(series, a.year)
        print("archive: %d day(s), sources %s"
              % (len(cov["days"]), sorted(cov["sources"])))
        # ── THE ANSWER, ON THE DAY IT BECOMES ANSWERABLE ─────────────────────
        # PER POSITION, because the whole reason A routed this is a QB-shaped
        # effect: FantasyPros' consensus comes from 4-point-passing-TD drafts and
        # we play 6, which moves quarterbacks and nothing else. A whole-board
        # median over 700 players averages that to nothing — the exact shape of
        # hiding a real finding inside a healthy-looking number.
        #
        # `positions_for_history` rather than the live board: it merges
        # `player_positions.json` UNDER the board, so a player who leaves the
        # board mid-August still has a position tomorrow. Reported, never fatal —
        # the prices are the perishable thing and they are already saved above.
        pos = {}
        try:
            import waiver_replacement as W
            pos = W.positions_for_history()
        except Exception as e:                        # noqa: BLE001
            print("  positions unavailable (%s: %s) — the per-position split is "
                  "SKIPPED, not zero; the prices are saved either way"
                  % (type(e).__name__, e))
        d = S.disagreement(series, a.year, day, pos)
        if d["status"] == "measured":
            for pair, v in d["pairs"].items():
                print("  %s: %d shared, median %+0.1f picks overall"
                      % (pair, v["shared"], v["median_pick_difference"]))
                for p, b in sorted(v["by_position"].items()):
                    print("      %-3s n=%-4d median %+0.1f" % (p, b["n"], b["median"]))
                if not v["by_position"]:
                    print("      per-position split UNMEASURED — no position map, "
                          "so this is one number about seven hundred players")
        else:
            print("  disagreement UNMEASURED — %s" % d["note"])
        return 0
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
