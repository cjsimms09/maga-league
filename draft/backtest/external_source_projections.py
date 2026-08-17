# TERRITORY: C
"""EXTERNAL SOURCE PROJECTIONS — per-player RAW rows from Sleeper and FantasyPros,
joined on our sleeper_id. Nothing here is scored, compared to a realized outcome,
or graded. That is TERRITORY: A's call — see `draft/backtest/source_blend_2025.py`
and `SOURCE-BLEND-2025-PREREG.md`. This module gets the rows.

WHY THIS EXISTS, VERBATIM. Cory has asked since 08-16 whether the board should be
drafting off Sleeper, FantasyPros, or a blend, and it "DEFINITELY EFFECTS DRAFT
RECOMMENDATIONS." The question could not be answered because three committed
files said Sleeper had no gradeable per-player history — and none of them had
actually asked the API. `sleeper_hist_proj.json` (committed `0f9ecbe2` on `main`)
shows 2025 passed every leak gate. The blocker was false, the same shape as the
2025-routes finding: a gap of ours, filed as a gap of theirs.

BOTH SOURCES ARE PROXY-BLOCKED FROM THIS SANDBOX AND REACHABLE FROM ACTIONS,
measured 2026-08-17:
    api.sleeper.app          -> connect_rejected, gateway 403 to CONNECT
    www.fantasypros.com      -> connect_rejected, gateway 403 to CONNECT
    api.fantasypros.com      -> connect_rejected, gateway 403 to CONNECT
Same policy-denial shape the MFL discovery finding already established — not a
TLS problem, not a "the source is down" problem, a route this sandbox does not
have. `.github/workflows/external-source-projections-2025.yml` runs this from
Actions, where every FP artifact this repo already holds was fetched from.

DISPATCH FROM `main`, NOT A WORKTREE BRANCH. The 08-16 Sleeper history probe was
dispatched from a feature branch; the push guard correctly refused to write to
`main`, the verdict printed to a log, and the answer was lost for a day. The
workflow here carries the same guard for the same reason and says so loudly
rather than silently discarding the run.

THE JOIN IS THE SAME CROSSWALK `exp_fp_hist_proj` ALREADY USES AND TRUSTS:
`adp.build_index(sleeper_players)` + `adp.match_player(fp_row, index)` — not a
second crosswalk that could drift from the first (rule 11).

WHAT COUNTS AS "GOT THE ROW". A player is JOINED only if he has stats from BOTH
sources. Sleeper-only and FP-only players are real and are counted in
`diagnostics`, but they do not appear in `players` — a row this module cannot
place on both sides is not a joined row, and reporting it as one would hand
`source_blend_2025.py` a population it did not ask for.

RAW STAT LINES, NEVER A COMPUTED POINT TOTAL. `scoring.py`'s own rule: "A
provider's precomputed points are never trusted: they encode *that provider's*
league, not ours." Scoring belongs to whoever grades, because a scoring table
can be corrected after the fact and a raw stat line can always be re-scored — a
stored point total cannot be un-scored back into the stats that produced it.

TWO REAL DEFECTS FOUND WHILE BUILDING THIS, IN `source_blend_2025.py` (TERRITORY:
A, relay branch, not touched here — routed):

  1. `json.loads((HERE.parent / "config.json").read_text())` reads a file that
     does not exist anywhere in this repo. The real path is
     `draft/config/league_config.json`. Verified: `draft/config.json` is absent
     on `main`, on the relay branch, and on this branch. The run would raise
     `FileNotFoundError` before any egress happens.

  2. `sl_raw.get("players", [])` on Sleeper's actual return shape always yields
     an empty list. `sleeper_import.fetch_projections()` returns `{pid: row}`
     (a dict), never `{"players": [...]}` — confirmed by monkeypatching `_get`
     and calling it: `sl_raw.get("players", [])` on a real 2-player payload
     returned `[]`. The Sleeper arm would silently grade on zero rows rather
     than raising, and the known-positive-control check would likely mask it
     as "NAIVE beat both sources" (a broken harness) without naming which half
     broke.

Run: python3 draft/backtest/external_source_projections.py [--year 2025]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

YEAR = 2025
OUT = HERE / "external_source_projections_2025.json"


def sleeper_rows(sleeper_proj: dict) -> dict:
    """{sleeper_id: stat_line} out of whatever shape Sleeper's projection
    endpoint actually served.

    ⚠ TOLERATES BOTH `{pid: {"stats": {...}}}` AND `{pid: {<stat keys>}}`
    because `sleeper_import._rows_with_stats` (the function that SCORES which
    endpoint shape won) already treats both as valid — a reader here that
    trusted only the nested form would silently drop every row on whichever
    season serves the flat one, with no error to say so.
    """
    out: dict[str, dict] = {}
    for pid, row in (sleeper_proj or {}).items():
        if not isinstance(row, dict):
            continue
        # THE FLAT-SHAPE FALLBACK APPLIES ONLY WHEN "stats" IS ABSENT, not
        # merely falsy. `{"stats": None}` falling back to the WHOLE row (which
        # still carries `"stats": None` as one of its own keys) is how the
        # first version of this function shipped a garbage entry: the row
        # LOOKED non-empty because it still had a key in it. Found by the gate.
        if "stats" in row:
            stats = row["stats"]
        else:
            stats = row
        if isinstance(stats, dict) and stats:
            out[str(pid)] = dict(stats)
    return out


def join_by_sleeper_id(sleeper_stats: dict, fp_rows: list, index: dict) -> tuple[dict, dict]:
    """Join FantasyPros rows onto our sleeper_id via the shared crosswalk.

    Returns `(joined, diagnostics)`. `joined` is
    `{sleeper_id: {sleeper_stats, fp_stats, fp_match_method, fp_fpts}}` for
    players present in BOTH sources.

    ⚠ AMBIGUITY IS THE CROSSWALK'S PROBLEM, NOT THIS FUNCTION'S. `match_player`
    already resolves same-name collisions by position then team (see
    `adp.match_player`); this function trusts whatever id comes back and does
    not re-decide it, which is the two-definitions-that-drift shape rule 11
    warns about.
    """
    import adp as ADP

    fp_by_id: dict[str, dict] = {}
    unmatched = 0
    method_counts: dict[str, int] = {}
    for row in (fp_rows or []):
        sid, how = ADP.match_player(row, index)
        if not sid:
            unmatched += 1
            continue
        method_counts[how] = method_counts.get(how, 0) + 1
        # LAST WRITER FOR A DUPLICATE SLEEPER ID IS A COUNTED COLLISION, not a
        # silent overwrite — two FP rows resolving to the same sleeper_id would
        # otherwise lose one with no trace.
        if sid in fp_by_id:
            method_counts["_collision_overwritten"] = method_counts.get(
                "_collision_overwritten", 0) + 1
        fp_by_id[str(sid)] = {"stats": row.get("stats") or {}, "match_method": how,
                              "fp_fpts": row.get("fp_fpts")}

    joined: dict[str, dict] = {}
    for pid, s_stats in (sleeper_stats or {}).items():
        fp = fp_by_id.get(pid)
        if fp is None:
            continue
        joined[pid] = {"sleeper_stats": s_stats, "fp_stats": fp["stats"],
                       "fp_match_method": fp["match_method"], "fp_fpts": fp["fp_fpts"]}

    diagnostics = {
        "sleeper_rows": len(sleeper_stats or {}),
        "fp_rows": len(fp_rows or []),
        "fp_unmatched_to_sleeper_id": unmatched,
        "fp_matched_to_sleeper_id": len(fp_by_id),
        "joined_rows": len(joined),
        "sleeper_only": sorted(set(sleeper_stats or {}) - set(fp_by_id)),
        "fp_only": sorted(set(fp_by_id) - set(sleeper_stats or {})),
        "match_methods": method_counts,
    }
    return joined, diagnostics


def _void(reason: str, **extra) -> dict:
    """A run that could not complete is VOID, never an empty result reported
    as a clean zero. Same discipline `source_blend_2025.void` and
    `sleeper_hist_proj` use: the first failing gate IS the verdict, and it
    carries no rows with it."""
    return {"status": "VOID", "reason": reason,
           "_territory": "TERRITORY: C — produced by "
                          "draft/backtest/external_source_projections.py",
           "_note": "VOID is not zero rows. Nothing here licenses a claim "
                    "that either source lacks 2025 projections.",
           **extra}


def fetch_and_join(year: int = YEAR) -> dict:  # pragma: no cover  (egress; CI only)
    """The impure half: real fetches, then the pure join above. -> the document
    written to disk. Every early return is a VOID with a stated reason."""
    import adp as ADP
    import fantasypros_adp as FP
    import raw_capture as RAW
    import sleeper_import as SL

    players = SL.fetch_players()
    if not players:
        return _void("Sleeper player index unreachable — a fact about the "
                     "runner, not about either source")
    index = ADP.build_index(players)
    position_of = {str(pid): (p or {}).get("position") for pid, p in players.items()}
    team_of = {str(pid): (p or {}).get("team") for pid, p in players.items()}
    name_of = {str(pid): (p or {}).get("full_name")
                        or " ".join(filter(None, [(p or {}).get("first_name"),
                                                  (p or {}).get("last_name")]))
              for pid, p in players.items()}

    sl_raw = SL.fetch_projections(str(year))
    if not sl_raw:
        return _void("Sleeper projections egress failed — a fact about the "
                     "runner, not about the source")
    sleeper_stats = sleeper_rows(sl_raw)
    if not sleeper_stats:
        return _void("Sleeper returned a payload but no row carried a "
                     "readable stat line — the endpoint shape may have "
                     "changed again; see sleeper_import._PROJECTION_PATHS",
                    sleeper_rows_before_filter=len(sl_raw))

    text, url, diag = FP.fetch_projections(year)
    if not text:
        return _void("FantasyPros egress failed — a fact about the runner, "
                     "not about the source", fp_diag=diag)
    # RE-PARSE, NEVER RE-FETCH. Same primitive source_blend_2025.py calls, kept
    # rather than re-implemented (rule 11) — a 2027 re-read of what FP actually
    # served does not cost a second fetch.
    RAW.retain("fantasypros_projections", year, text, url, diag)
    fp_rows = FP.parse_projections(text)
    if not fp_rows:
        return _void("FantasyPros responded but parsed to zero rows — the "
                     "page shape likely changed; the raw bytes are retained "
                     "under draft/data/raw/fantasypros_projections/ for "
                     "re-parsing without a second fetch", fp_diag=diag)

    joined, diagnostics = join_by_sleeper_id(sleeper_stats, fp_rows, index)
    if not joined:
        return _void("both sources returned rows but the crosswalk placed "
                     "none of them on both sides — likely a name-matching "
                     "regression, not an absence of data",
                    diagnostics=diagnostics)

    for pid, entry in joined.items():
        entry["name"] = name_of.get(pid)
        entry["position"] = position_of.get(pid)
        entry["team"] = team_of.get(pid)

    return {
        "status": "captured",
        "year": year,
        "_territory": "TERRITORY: C — produced by "
                       "draft/backtest/external_source_projections.py",
        "_note": ("RAW STAT LINES from both sources, joined on our sleeper_id "
                  "via the same crosswalk exp_fp_hist_proj uses. NOTHING HERE "
                  "IS SCORED, COMPARED TO A REALIZED OUTCOME, OR GRADED — see "
                  "draft/backtest/source_blend_2025.py (TERRITORY: A) for "
                  "that. Re-run to refresh; this file is overwritten, not "
                  "appended, because it is a snapshot of two live endpoints, "
                  "not a historical series."),
        "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fp_url": url,
        "diagnostics": diagnostics,
        "players": joined,
    }


def main() -> int:  # pragma: no cover  (egress; CI only)
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=YEAR)
    args = ap.parse_args()

    doc = fetch_and_join(args.year)
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    if doc.get("status") == "VOID":
        print(f"VOID — {doc['reason']}", file=sys.stderr)
        return 1
    d = doc["diagnostics"]
    print(f"joined {d['joined_rows']} players "
         f"(sleeper {d['sleeper_rows']}, fp {d['fp_rows']}, "
         f"fp_unmatched {d['fp_unmatched_to_sleeper_id']}, "
         f"sleeper_only {len(d['sleeper_only'])}, fp_only {len(d['fp_only'])})")
    print(f"wrote {OUT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
