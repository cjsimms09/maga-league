# TERRITORY: C
"""AGE / ROOKIE FLAG / NFL DRAFT CAPITAL — the ceiling program's one missing
fetch (relay's 08-20 dispatch, `draft/CEILING-PROGRAM-PREREG-2026-08-20.md`
§2). Cory's own named ceiling features -- age (position-specific curve),
rookie flag, draft capital spent -- were the only three of his five NOT on
disk. Static, historical, leak-safe by construction: none of it can move
retroactively once a player is drafted or born.

TWO nflverse-data GitHub release sources, both reachable from this sandbox
(verified 2026-08-20, same as every other source built this session even
though Sleeper/FantasyPros are not):
  rosters/roster_<season>.parquet    one file per season, 2021-2026 --
                                     birth_date, rookie_year, gsis_id AND
                                     sleeper_id already joined by nflverse
                                     itself. Unioned across all six seasons
                                     because no single season's roster
                                     covers every player relevant across the
                                     window (a 2021 veteran may be retired by
                                     2026; a 2026 rookie was not in 2021).
  draft_picks/draft_picks.parquet    one file, full history -- round, pick,
                                     team, gsis_id.

⚠️ CAUGHT BEFORE SHIPPING: the first version of this module filtered
draft_picks to `season >= 2015`, on the assumption that older rows carry a
legacy gsis_id format that would not join anyway. Checked, not assumed: Tom
Brady's 2000 draft row carries `gsis_id: 00-0019596` -- the SAME modern
format, matching his roster row exactly -- and the season filter mislabeled
him `draft_capital: "UDFA"`, the wrong answer for a 6th-round pick, for every
veteran drafted before 2015. The real defect is a small number of RECENT
late-round picks who never made an active roster and carry a non-standard
gsis_id (measured: 265 of 3,078 picks since 2015, mostly players who never
appear in any roster file) -- filtered by gsis_id FORMAT
(`^\d{2}-\d{7}$`), not by season, which is the criterion that is actually
true.

SLEEPER_ID FALLBACK: ~84% of skill-position roster rows already carry a
sleeper_id from nflverse itself (measured on the 2024 file before assuming
it). The remainder falls back to `nfl.import_ids()`'s own gsis<->sleeper
crosswalk (confirmed reachable) -- NOT re-derived name matching, an existing
join reused per rule 11.

AGE-AS-OF-SEASON: computed at September 1 of each season (the standard
fantasy convention -- close enough to kickoff that it does not
misclassify a player across a birthday during the season) from `birth_date`,
which does not change and needs no per-season fetch of its own.

DRAFT CAPITAL: `UDFA` is an explicit label, never a null -- a null reads as
"unknown" where the truth is "went undrafted", and those are different facts
a ceiling model needs to tell apart.

RULE 3e CONTROL: `verify_top170_coverage()` checks against the LIVE 2026
board's own top 170 by `overall_rank` -- the exact population the routed ask
named -- and is a FAIL ARM the module ships with (see the test file).

Run: python3 draft/backtest/player_bio_capital.py
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent

OUT = HERE / "player_bio_capital.json"

SEASONS = (2021, 2022, 2023, 2024, 2025, 2026)

ROSTER_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
             "rosters/roster_{season}.parquet")
DRAFT_PICKS_URL = ("https://github.com/nflverse/nflverse-data/releases/"
                   "download/draft_picks/draft_picks.parquet")

ROUND_LABELS = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th"}


def draft_capital_label(round_: int | None) -> str:
    if round_ is None:
        return "UDFA"
    return ROUND_LABELS.get(int(round_), f"{int(round_)}th")


def age_as_of_season(birth_date: str | None, season: int) -> float | None:
    """Age as of Sept 1 of `season` -- the standard fantasy-season convention,
    from a birth_date that never changes."""
    if not birth_date:
        return None
    try:
        y, m, d = (int(x) for x in str(birth_date).split("-"))
        born = date(y, m, d)
    except (ValueError, TypeError):
        return None
    ref = date(season, 9, 1)
    age = ref.year - born.year - ((ref.month, ref.day) < (born.month, born.day))
    return round(age + 0.0, 1)


def build_bio_table(roster_rows_by_season: dict) -> dict:
    """{gsis_id: {name, position, birth_date, rookie_year, sleeper_id}} --
    unioned across every season passed in. FIRST non-null value wins per
    field (birth_date/rookie_year should agree across a player's own rows;
    disagreement would be a real nflverse data defect, not something to
    silently average away)."""
    out: dict = {}
    for season in sorted(roster_rows_by_season):
        for row in roster_rows_by_season[season]:
            gsis = row.get("gsis_id")
            if not gsis:
                continue
            rec = out.setdefault(gsis, {"name": None, "position": None,
                                        "birth_date": None, "rookie_year": None,
                                        "sleeper_id": None})
            for k in ("name", "position", "birth_date", "rookie_year", "sleeper_id"):
                src_k = "full_name" if k == "name" else k
                v = row.get(src_k)
                if rec[k] is None and v is not None:
                    # parquet round-trips birth_date as a native date/Timestamp,
                    # not a string -- normalize now, at the one place every
                    # value enters this table, so nothing downstream has to
                    # guess the type or fail to serialize it later.
                    rec[k] = str(v) if k == "birth_date" else v
    return out


_MODERN_GSIS_RE = re.compile(r"^\d{2}-\d{7}$")


def build_draft_table(draft_rows: list) -> dict:
    """{gsis_id: {season, round, pick, team}} -- one entry per player (a
    player is drafted exactly once). Filtered by gsis_id FORMAT, not by
    draft season -- a season cutoff mislabeled every veteran drafted before
    2015 as UDFA in an earlier version of this function (Tom Brady's 2000
    draft row carries the same modern-format gsis_id as his roster row; the
    real defect is a small number of RECENT late-round picks who never made
    an active roster and never got a modern gsis_id assigned at all)."""
    out: dict = {}
    for row in draft_rows:
        gsis = row.get("gsis_id")
        season = row.get("season")
        if not gsis or not season or not _MODERN_GSIS_RE.match(str(gsis)):
            continue
        out.setdefault(gsis, {"season": int(season), "round": row.get("round"),
                              "pick": row.get("pick"), "team": row.get("team")})
    return out


def resolve_sleeper_id(bio: dict, fallback_crosswalk: dict) -> dict:
    """Fill any missing `sleeper_id` from the gsis<->sleeper fallback
    crosswalk (nfl.import_ids(), reused per rule 11) -- does not overwrite a
    sleeper_id nflverse's own roster file already provided."""
    for gsis, rec in bio.items():
        if not rec.get("sleeper_id") and gsis in fallback_crosswalk:
            rec["sleeper_id"] = fallback_crosswalk[gsis]
    return bio


def build_store(bio: dict, draft: dict, seasons=SEASONS) -> dict:
    by_sleeper: dict = {}
    unmatched_sleeper = []
    for gsis, rec in bio.items():
        sid = rec.get("sleeper_id")
        if not sid:
            unmatched_sleeper.append({"gsis_id": gsis, "name": rec.get("name")})
            continue
        d = draft.get(gsis)
        age_by_season = {str(s): age_as_of_season(rec.get("birth_date"), s) for s in seasons}
        rookie_year = rec.get("rookie_year")
        is_rookie_by_season = {str(s): (rookie_year is not None and int(rookie_year) == s)
                               for s in seasons}
        by_sleeper[str(sid)] = {
            "gsis_id": gsis, "name": rec.get("name"), "position": rec.get("position"),
            "birth_date": rec.get("birth_date"),
            "age_by_season": age_by_season,
            "rookie_year": rookie_year,
            "is_rookie_by_season": is_rookie_by_season,
            "draft_season": d["season"] if d else None,
            "draft_round": d["round"] if d else None,
            "draft_pick": d["pick"] if d else None,
            "draft_team": d["team"] if d else None,
            "draft_capital": draft_capital_label(d["round"] if d else None),
        }

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/player_bio_capital.py",
        "_note": "Age-as-of-season (Sept 1), rookie flag, and NFL draft "
                 "capital, keyed by sleeper_id -- Cory's three named ceiling "
                 "features that were not on disk (CEILING-PROGRAM-PREREG). "
                 "Static and leak-safe: birth_date/rookie_year/draft slot "
                 "cannot move retroactively. `draft_capital` is 'UDFA' for "
                 "an undrafted player, never null -- a null would mean "
                 "'unknown', which is a different fact.",
        "seasons": list(seasons),
        "population": {
            "total_bio_rows": len(bio),
            "matched_to_sleeper": len(by_sleeper),
            "unmatched_no_sleeper_id": len(unmatched_sleeper),
        },
        "unmatched_sample": unmatched_sleeper[:30],
        "players": by_sleeper,
    }
    return doc


def verify_top170_coverage(doc: dict, board: dict, top_n: int = 170) -> dict:
    """RULE 3e CONTROL, executable: at least 90% of the board's own top-170
    (by overall_rank) must join with a birthdate AND a draft round-or-UDFA
    label, or this is a red exit, not a silent partial store."""
    all_players = list(board.get("players") or []) + list(board.get("kept_players") or [])
    ranked = sorted((p for p in all_players if p.get("overall_rank") is not None),
                    key=lambda p: p["overall_rank"])[:top_n]
    hits, misses = 0, []
    for p in ranked:
        row = doc["players"].get(str(p["player_id"]))
        if row and row.get("birth_date") and row.get("draft_capital"):
            hits += 1
        else:
            misses.append({"player_id": p["player_id"], "name": p.get("name")})
    n = len(ranked)
    rate = round(100 * hits / n, 1) if n else 0.0
    return {"checked": n, "hits": hits, "misses": len(misses),
           "coverage_pct": rate, "ok": rate >= 90.0, "missed_players": misses[:30]}


def _fetch_parquet_records(url: str) -> list:  # pragma: no cover  (egress)
    import pandas as pd
    return pd.read_parquet(url).to_dict("records")


def _fetch_id_crosswalk() -> dict:  # pragma: no cover  (egress)
    import nfl_data_py as nfl
    df = nfl.import_ids()
    out = {}
    for row in df.to_dict("records"):
        g, s = row.get("gsis_id"), row.get("sleeper_id")
        if g and s and s == s:  # s == s excludes NaN
            out[g] = str(int(s)) if float(s).is_integer() else str(s)
    return out


def run(seasons=SEASONS) -> dict:  # pragma: no cover  (egress)
    roster_rows_by_season = {s: _fetch_parquet_records(ROSTER_URL.format(season=s))
                             for s in seasons}
    draft_rows = _fetch_parquet_records(DRAFT_PICKS_URL)
    fallback_crosswalk = _fetch_id_crosswalk()

    bio = build_bio_table(roster_rows_by_season)
    bio = resolve_sleeper_id(bio, fallback_crosswalk)
    draft = build_draft_table(draft_rows)
    doc = build_store(bio, draft, seasons)

    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    doc["rule_3e_control"] = verify_top170_coverage(doc, board)
    return doc


def main(seasons=SEASONS) -> int:  # pragma: no cover  (egress)
    doc = run(seasons)
    control = doc["rule_3e_control"]
    if not control["ok"]:
        print(f"VOID -- top-170 coverage {control['coverage_pct']}% is under "
             "the 90% floor", file=sys.stderr)
        print(f"missed: {control['missed_players']}", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {doc['population']['matched_to_sleeper']} "
         f"players, top-170 coverage {control['coverage_pct']}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
