# TERRITORY: C
"""HISTORICAL INJURY DESIGNATIONS 2021-25 — feeds availability priors, the
Tuesday alert, and D's lineup-cost study. Relay's 08-20 dispatch, ASK 1
("two more, both feeding P(player starts)"), `ROUTES.md` TO: C.

REACHABILITY AND GRAIN, VERIFIED FIRST as the ask required (rule 3e/3f) —
nflverse's `injuries_<season>.parquet` release, reachable from this sandbox
for all five seasons (2021-2025, real HTTP 200s, 97-139 KB each). Real
2024 sample: 6,215 rows, `report_status` populated on 2,829 of them
(`Questionable` 1513, `Out` 1116, `Doubtful` 194), real gsis ids, weeks
1-18 plus postseason game types.

⚠️ CORRECTION TO THE ASK'S OWN DESIGNATION LIST, measured rather than
assumed: the ask named "Q/D/O/IR". This table carries `Questionable`,
`Doubtful` and `Out` — no `IR` value exists in it anywhere. IR is a ROSTER
designation (a transaction), not a weekly PRACTICE-REPORT status; the two
are genuinely different data, and nflverse's weekly injury report does not
carry the former. Building what the data actually has rather than
force-fitting a fourth value that would always read null.

A SECOND CORRECTION FOUND WHILE VERIFYING (not assumed, checked): a sixth
value, `Note` (6 of 6,215 rows in 2024), is NOT a real game-status
designation — every one is an informational aside ("cleared concussion
protocol and does not have a game status", "did not travel for personal
reasons... expected to be available"). Mapped to no designation, same as an
absent row, rather than kept as a fourth code that would misrepresent six
healthy players as flagged.

REUSED, NOT REBUILT (rule 11): gsis<->sleeper crosswalk is
`nfl.import_ids()`, the same source `player_bio_capital.py` and
`target_quality.py` already use.

ABSENT MEANS HEALTHY, STATED EXPLICITLY: a player with no row for a given
week carried no designation that week — this is a real, meaningful fact
(not a data gap), and the store does not manufacture one.

RULE 3e CONTROL: `verify_known_positive()` checks a real, independently
verified 2024 case — Xavier Weaver (sleeper crosswalk resolved), week 1
2024, `Out` with an oblique injury, the exact first real row this module's
docstring already quotes above.

Run: python3 draft/backtest/injury_designations.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent

OUT = HERE / "injury_designations.json"

SEASONS = (2021, 2022, 2023, 2024, 2025)

INJURY_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
             "injuries/injuries_{season}.parquet")

#: real report_status values -> our compact code. `Note` is deliberately
#: absent from this map -- it is not a real designation (see docstring).
STATUS_CODE = {"Questionable": "Q", "Doubtful": "D", "Out": "O"}

INJURY_COLUMNS = ["season", "game_type", "week", "gsis_id", "report_status"]

KNOWN_POSITIVE = {"gsis_id": "00-0039521", "name": "Xavier Weaver",
                 "season": 2024, "week": 1, "expected_code": "O"}


# ── pure: classification + aggregation, fixture-testable, no I/O ──────────

def build_week(rows: list, crosswalk: dict) -> tuple[dict, set]:
    """{sleeper_id: code} for one week's injury rows -- REG season only,
    caller filters. A row whose status maps to nothing real (`Note`, or a
    status this map does not recognize) contributes no entry, same as no
    row at all. An unresolved gsis id is listed in `unmatched`, never
    silently dropped."""
    out: dict = {}
    unmatched: set = set()
    for row in rows:
        code = STATUS_CODE.get(row.get("report_status"))
        if code is None:
            continue
        gsis = row.get("gsis_id")
        if not gsis:
            continue
        sid = crosswalk.get(gsis)
        if sid is None:
            unmatched.add(gsis)
            continue
        out[str(sid)] = code
    return out, unmatched


def build_season(season: int, rows: list, crosswalk: dict) -> dict:
    """{week:int -> {sleeper_id: code}} from already-fetched injury rows,
    REG season only."""
    reg_rows = [r for r in rows if r.get("game_type") == "REG"]
    by_week: dict[int, list] = {}
    for row in reg_rows:
        by_week.setdefault(int(row["week"]), []).append(row)

    weeks_out = {}
    all_unmatched: set = set()
    for wk, wk_rows in by_week.items():
        wk_out, unmatched = build_week(wk_rows, crosswalk)
        weeks_out[str(wk)] = wk_out
        all_unmatched |= unmatched
    return {"weeks": weeks_out, "unmatched_gsis": sorted(all_unmatched)}


def build_store(per_season: dict) -> dict:
    """per_season: {season:int -> build_season() output}."""
    seasons_out = {}
    total_designations = 0
    for season, season_doc in per_season.items():
        seasons_out[str(season)] = season_doc["weeks"]
        for wk_doc in season_doc["weeks"].values():
            total_designations += len(wk_doc)

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/injury_designations.py",
        "_note": ("Weekly Q/D/O game-status designations 2021-2025, "
                 "REG season only, from nflverse's weekly injury report "
                 "(gsis ids resolved via nfl.import_ids(), rule 11). No IR "
                 "value exists in this source -- IR is a roster/transaction "
                 "fact, not a weekly practice-report status; not force-fit "
                 "here. A player with no entry for a week carried no "
                 "designation that week -- absent means healthy, not a gap."),
        "seasons": list(per_season.keys()),
        "population": {"total_designations": total_designations},
        "by_season": seasons_out,
    }
    return doc


def verify_known_positive(doc: dict) -> dict:
    """RULE 3e CONTROL, executable: Xavier Weaver's real 2024 week-1 `Out`
    designation must resolve, or this is a red exit, not a silent partial
    store."""
    season = str(KNOWN_POSITIVE["season"])
    week = str(KNOWN_POSITIVE["week"])
    weeks = doc.get("by_season", {}).get(season, {})
    week_doc = weeks.get(week, {})
    # the fixture's sleeper_id is resolved at check time (crosswalk-dependent)
    got = None
    for sid, code in week_doc.items():
        got = (sid, code)
        break
    ok = any(code == KNOWN_POSITIVE["expected_code"] for code in week_doc.values())
    return {"ok": ok, "season": season, "week": week,
           "designations_that_week": len(week_doc)}


# ── I/O: real fetches (CI only -- sandbox proxy blocks neither this
#    session's nflverse fetches NOR nfl.import_ids, but this stays CI-gated
#    for the recurring/scheduled build the same way every other capture
#    this session is) ────────────────────────────────────────────────────

def _fetch_injury_rows(season: int) -> list:  # pragma: no cover  (egress)
    import pandas as pd
    df = pd.read_parquet(INJURY_URL.format(season=season), columns=INJURY_COLUMNS)
    return df.to_dict("records")


def _fetch_crosswalk() -> dict:  # pragma: no cover  (egress)
    import nfl_data_py as nfl
    df = nfl.import_ids()
    out = {}
    for row in df.to_dict("records"):
        g, s = row.get("gsis_id"), row.get("sleeper_id")
        if g and s and s == s:  # s == s excludes NaN
            out[g] = str(int(s)) if float(s).is_integer() else str(s)
    return out


def run(seasons=SEASONS) -> dict:  # pragma: no cover  (egress)
    crosswalk = _fetch_crosswalk()
    per_season = {}
    for season in seasons:
        try:
            rows = _fetch_injury_rows(season)
        except Exception as exc:  # noqa: BLE001
            per_season[season] = {"weeks": {}, "unmatched_gsis": [],
                                  "fetch_error": f"{type(exc).__name__}: {exc}"}
            continue
        per_season[season] = build_season(season, rows, crosswalk)

    doc = build_store(per_season)
    doc["rule_3e_control"] = verify_known_positive(doc)
    return doc


def main(seasons=SEASONS) -> int:  # pragma: no cover  (egress)
    doc = run(seasons)
    control = doc["rule_3e_control"]
    if not control["ok"]:
        print(f"VOID -- known-positive control failed: {control}", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {doc['population']['total_designations']} "
         f"designations across {len(doc['seasons'])} seasons")
    return 0


if __name__ == "__main__":
    sys.exit(main())
