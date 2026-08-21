# TERRITORY: C
"""WEEKLY PRACTICE-PARTICIPATION REPORTS — the source-hunt dispatch item 2:
"the absence model's LEADING indicator; our roster_state captures game-day
status, which is the LAGGING one." `ROUTES.md` TO: C, 2026-08-21.

REACHABLE, VERIFIED BEFORE BUILDING (rule 3e/3f) rather than assumed: the
SAME nflverse `injuries_<season>.parquet` release `injury_designations.py`
already fetches also carries `practice_status` — checked directly against
the real 2024 file before writing this module, not read from a schema doc.
This is a SEPARATE, ADDITIVE module rather than an edit to
`injury_designations.py` (rule 1e-class caution): that module is already
shipped and consumed by `opponent_tendency.py`'s injury-reaction join, and
changing its value shape to carry a second field risks a silent downstream
break for a store already relied on. Same source, same crosswalk (rule 11),
disjoint output file.

⚠️ ONE REAL LIMIT, STATED PLAINLY AGAINST THE ASK'S OWN FRAMING: the ask
wants "Wednesday's practice report... not Sunday's". Checked directly:
nflverse's injuries table carries exactly ONE row per player per week, not
a Wed/Thu/Fri sequence — the real 2024 sample's `date_modified` values land
on report-week Fridays (the last practice before Sunday), so this store is
the FINAL pre-game practice status, genuinely more granular and one day
EARLIER than the Sunday inactive list `roster_state`/`injury_designations`
already carry, but it is not a Wednesday-specific leading signal — no
source this session found publishes the daily sequence. Named honestly
rather than oversold.

REAL POPULATION MEASURED (2024): practice_status non-null on 5,178 of 6,215
rows (83%) vs report_status non-null on only 2,829 (46%) — practice
participation is populated on roughly DOUBLE the rows report_status is,
which is exactly the leading-indicator shape the ask expects: many players
who show up limited/DNP early in the week clear up and never reach a final
game-status designation at all.

A REAL DATA-QUALITY ARTIFACT FOUND AND EXCLUDED, NOT SILENTLY PASSED
THROUGH: 36 of 6,215 2024 rows carry `practice_status` as literal whitespace
garbage (`'\\n    '`), not a real value and not null — verified by hand
before writing the status map (rule 3f). These rows are treated the same as
an absent practice_status: no entry, not a manufactured fourth code.

Run: python3 draft/backtest/practice_participation.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Imported both as a package module and as a bare sibling (the test does
# `import practice_participation`), so both spellings have to work.
try:                                     # pragma: no cover
    from . import id_crosswalk as _CROSSWALK
except ImportError:                      # pragma: no cover
    import id_crosswalk as _CROSSWALK

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent

OUT = HERE / "practice_participation.json"

SEASONS = (2021, 2022, 2023, 2024, 2025)

INJURY_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
             "injuries/injuries_{season}.parquet")

#: real practice_status values -> our compact code. Whitespace-garbage rows
#: and `Note` rows are deliberately absent -- neither is a real designation
#: (see module docstring).
STATUS_CODE = {
    "Full Participation in Practice": "FP",
    "Limited Participation in Practice": "LP",
    "Did Not Participate In Practice": "DNP",
}

INJURY_COLUMNS = ["season", "game_type", "week", "gsis_id", "practice_status"]

KNOWN_POSITIVE = {"gsis_id": "00-0039521", "name": "Xavier Weaver",
                 "season": 2024, "week": 1, "expected_code": "DNP"}


# ── pure: classification + aggregation, fixture-testable, no I/O ──────────

def build_week(rows: list, crosswalk: dict) -> tuple[dict, set]:
    """{sleeper_id: code} for one week's practice rows. A garbage/`Note`
    value contributes no entry, same as no row at all. An unresolved gsis
    id is listed in `unmatched`, never silently dropped."""
    out: dict = {}
    unmatched: set = set()
    for row in rows:
        raw = row.get("practice_status")
        code = STATUS_CODE.get(raw.strip() if isinstance(raw, str) else raw)
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
    """{week:int -> {sleeper_id: code}} from already-fetched practice rows,
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
    seasons_out = {}
    total = 0
    for season, season_doc in per_season.items():
        seasons_out[str(season)] = season_doc["weeks"]
        for wk_doc in season_doc["weeks"].values():
            total += len(wk_doc)

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/practice_participation.py",
        "_note": ("Weekly FP/LP/DNP practice-participation status "
                 "2021-2025, REG season only, from nflverse's weekly "
                 "injury report's practice_status column (gsis ids "
                 "resolved via nfl.import_ids(), rule 11). This is the "
                 "FINAL pre-game practice report (typically Friday), not "
                 "a Wed/Thu/Fri sequence -- no source carries the daily "
                 "progression. Populated on roughly 2x the rows "
                 "injury_designations.json's report_status is (2024: 83% "
                 "vs 46%) -- a real leading-indicator population, players "
                 "who never escalate to a game-status designation still "
                 "show up here."),
        "seasons": list(per_season.keys()),
        "population": {"total_designations": total},
        "by_season": seasons_out,
    }
    return doc


def verify_known_positive(doc: dict) -> dict:
    """RULE 3e CONTROL: Xavier Weaver's real 2024 week-1 practice status
    (Did Not Participate In Practice -> DNP) must resolve."""
    season = str(KNOWN_POSITIVE["season"])
    week = str(KNOWN_POSITIVE["week"])
    week_doc = doc.get("by_season", {}).get(season, {}).get(week, {})
    ok = any(code == KNOWN_POSITIVE["expected_code"] for code in week_doc.values())
    return {"ok": ok, "season": season, "week": week,
           "designations_that_week": len(week_doc)}


# ── I/O: real fetches (CI only, egress-gated same as injury_designations) ──

def _fetch_practice_rows(season: int) -> list:  # pragma: no cover  (egress)
    import pandas as pd
    df = pd.read_parquet(INJURY_URL.format(season=season), columns=INJURY_COLUMNS)
    return df.to_dict("records")


def _fetch_crosswalk() -> dict:  # pragma: no cover  (egress)
    """gsis_id -> sleeper_id, from nflverse's player crosswalk.

    ⚠️ VERSION-TOLERANT, AND THE REASON FIRST GIVEN FOR IT WAS WRONG. This
    called `nfl.import_ids()` flat and CI went red with `module 'nfl_data_py'
    has no attribute 'import_ids'` while the same call worked locally. That was
    read as an upstream rename under an unpinned requirement. **It was a test
    leaking a one-attribute fake into `sys.modules` with no cleanup, so every
    later test in the session saw a module with neither name** (A, `e12b3c2e`,
    register 219; leak fixed there). Confirmed rather than accepted: pre-fix,
    this file passes ALONE and fails when run after the leaking one.

    The first fallback written for it — `import_players` — was measured
    afterwards and **carries `gsis_id` and no `sleeper_id`**, so it would not
    have cured a real rename either (E, register 232). The chain stays anyway:
    the dependency really is unpinned and this really was a single flat call.

    The chain now ends somewhere no rename can reach — see
    `id_crosswalk.DYNASTYPROCESS_IDS_URL`, which is the file `import_ids`
    itself reads. All three sources return the SAME 6,183 pairs, checked.
    """
    return _CROSSWALK.crosswalk()


def run(seasons=SEASONS) -> dict:  # pragma: no cover  (egress)
    crosswalk = _fetch_crosswalk()
    per_season = {}
    for season in seasons:
        try:
            rows = _fetch_practice_rows(season)
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
    yrs = tuple(int(a) for a in sys.argv[1:]) or SEASONS
    sys.exit(main(yrs))
