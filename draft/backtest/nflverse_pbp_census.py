# TERRITORY: C
"""WHICH SEASONS THE BOARD'S OPPORTUNITY PRIORS ACTUALLY REST ON.

`draft/build.py` asks nfl_data_py for play-by-play seasons `[year-1, year-2]` and
records the resulting ROW COUNT in `provenance.opportunity_detail.pbp_rows`. It
never records WHICH SEASONS came back. Those are not the same fact, and the gap
matters here specifically: `import_weekly_data` 404s for 2025 in this
environment — I hit it building durability and had to recover 2025 games-played
from the weekly points store — so "the priors are built on the two most recent
seasons" was an assumption about a fetch that has demonstrably failed for one of
those seasons in a neighbouring API.

A prior silently falling back a year is the exact harm the live-vs-research
separation is for. `target_share`, `wopr`, `opportunity_*` and `games_expected`
are declared HISTORICAL_PRIOR, which says they describe a past season; it does
not say WHICH, and 2024-25 versus 2023-24 is the difference between a current
prior and a stale one that still reads as current everywhere it is printed.

WHAT MAKES IT CHECKABLE. Season row counts are large and distinct, so the sum of
a season pair identifies that pair. Measured from the parquet FOOTERS over HTTP
range requests — the count sits in the file metadata, so it costs ~120KB per
season instead of 20MB:

    2022 49434   2023 49665   2024 49492   2025 48771

For a 2026 board, 2024+2025 = 98263 and the board records 98263 exactly. The
nearest competing pair is 2022+2025 = 98205, 58 rows away — thin, and stated
rather than glossed: a season revision of that size could make a count identify
the WRONG pair rather than simply failing to match, which is the one way this
method fails confidently instead of loudly. The census test asserts the margin so
it moves when nflverse moves.

THIS IS AN INFERENCE AND IT SHOULD NOT HAVE TO BE. One line in the builder —
recording the seasons it asked for and the seasons it got — makes all of this
unnecessary, and that line is in A's lane, so it is routed rather than written
here. Until it exists, arithmetic over a published census is the strongest
statement available, and it is a great deal stronger than assuming.

REVISIONS. nflverse re-publishes completed seasons occasionally. A census that
stops matching means RE-VERIFY, not automatically a defect in the board — the
distinction is in the message, because a check that cries defect at its own stale
input is a check people learn to ignore.
"""
from __future__ import annotations

import json
from pathlib import Path

CENSUS = str(Path(__file__).resolve().parent / "nflverse_pbp_census.json")

#: How far a sum may sit from a season pair's total and still be called that pair.
#: ZERO, deliberately. The counts are exact and the nearest competing pair for a
#: 2026 board is 58 rows away; any tolerance at all would start admitting the
#: wrong pair, and "close enough" is how a stale season gets accepted.
EXACT = 0


def load(path: str = None) -> dict:
    p = Path(path or CENSUS)
    if not p.exists():
        return {}
    return json.loads(p.read_text())


def season_rows(census: dict = None) -> dict:
    """`{season:int -> rows:int}` for every season the census could measure."""
    c = census if census is not None else load()
    return {int(y): s["rows"] for y, s in (c.get("seasons") or {}).items()
            if s.get("rows") is not None}


def identify(pbp_rows, census: dict = None, size: int = 2) -> dict:
    """Which set of `size` seasons sums to `pbp_rows`.

    Returns the match and — the part that matters — says when it CANNOT tell.
    Four outcomes, and three of them are not an answer:

      matched     exactly one season set sums to the count
      ambiguous   more than one does. Reporting either would be a coin flip
                  presented as a measurement.
      unmatched   none does. Either the build used a different number of seasons,
                  or nflverse has revised one, or the count is not what it says.
      unmeasured  no census — say so rather than returning an empty match, which
                  reads downstream exactly like "nothing is wrong".
    """
    rows = season_rows(census)
    if not rows or pbp_rows is None:
        return {"status": "unmeasured", "seasons": None,
                "note": "no census (or no pbp_rows) — this says nothing either way"}

    from itertools import combinations
    hits = [c for c in combinations(sorted(rows), size)
            if abs(sum(rows[y] for y in c) - pbp_rows) <= EXACT]
    if len(hits) == 1:
        return {"status": "matched", "seasons": list(hits[0]),
                "sum": sum(rows[y] for y in hits[0])}
    if hits:
        return {"status": "ambiguous", "seasons": None,
                "candidates": [list(h) for h in hits],
                "note": "more than one season set sums to %d" % pbp_rows}
    near = sorted(((abs(sum(rows[y] for y in c) - pbp_rows), list(c))
                   for c in combinations(sorted(rows), size)))[:3]
    return {"status": "unmatched", "seasons": None, "nearest": near,
            "note": "no set of %d seasons sums to %d — the build may have used a "
                    "different number of seasons, or nflverse has revised one; "
                    "RE-VERIFY before calling it a defect" % (size, pbp_rows)}


def expected_seasons(league_year, size: int = 2) -> list:
    """The seasons a board for `league_year` is supposed to be priced off.

    `build.py` computes `[season - 1, season - 2]`. Restated here rather than
    imported because the point is to CHECK that computation, and a checker that
    imports the thing it checks agrees with it by construction.
    """
    y = int(league_year)
    return sorted(y - i for i in range(1, size + 1))


def audit(board: dict, census: dict = None) -> dict:
    """Does this board's opportunity prior rest on the seasons it should?

    Reads `provenance.opportunity_detail.pbp_rows` and the league year off the
    artifact, so the answer is about the board that shipped rather than about
    what the builder was asked to do.
    """
    prov = ((board or {}).get("provenance") or {})
    detail = (prov.get("opportunity_detail") or {})
    rows = detail.get("pbp_rows")
    league = ((board or {}).get("league") or {})
    year = league.get("year") or league.get("season")

    got = identify(rows, census)
    out = {"pbp_rows": rows, "league_year": year, "status": got["status"],
           "seasons": got.get("seasons"), "expected": None, "ok": None,
           "note": got.get("note")}
    if year is None:
        out["note"] = "the board does not state its league year — cannot say what " \
                      "seasons it SHOULD rest on"
        return out
    out["expected"] = expected_seasons(year)
    if got["status"] != "matched":
        return out                       # ok stays None: unknown is not a pass
    out["ok"] = out["seasons"] == out["expected"]
    if not out["ok"]:
        out["note"] = ("the opportunity prior rests on %s; a %s board should use "
                       "%s. A prior a season behind still prints as a current "
                       "number everywhere it appears."
                       % (out["seasons"], year, out["expected"]))
    return out
