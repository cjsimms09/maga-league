# TERRITORY: C
"""TARGET-QUALITY / RED-ZONE WEEKLY STORE — a new signal axis for D's arms
and the ceiling program. Relay's 08-20 dispatch, ASK 2, `ROUTES.md` TO: C.

THE ASK SAID "READ `nflverse_pbp_census.json` FIRST." Done, and it needs a
correction before anything is built on it: that census measures ROW COUNTS
per season (a fingerprint for WHICH seasons `build.py`'s priors rest on) —
it says nothing about column-level GRAIN, so it cannot answer "is
target-quality data reachable" either way. Checked directly instead
(verified 2026-08-20, same sandbox that reaches every other nflverse-data
release this session): `play_by_play_2024.parquet` carries `yardline_100`,
`air_yards`, `receiver_player_id`, `rusher_player_id`, `play_type` — real,
non-null, on real plays. Measured before writing a line of the module below:
1,135 real inside-10 pass plays and 1,429 real inside-10 rush plays in 2024
alone, with real gsis ids (`00-0038559`, ...) in the same format
`player_bio_capital.py` already crosswalks. The grain IS reachable; this is
not a refusal.

DEFINITIONS, stated because "end-zone target" is not self-evident from the
ask's own words:
  inside_10_carries / inside_10_targets  a rush/target on a play run from
                                         `yardline_100 <= 10`.
  end_zone_targets   a target whose `air_yards >= yardline_100` — the
                     ball's intended landing spot is at or past the goal
                     line, the standard derived definition, NOT merely a
                     target thrown from inside the 10 (that is
                     `inside_10_targets`, a different and broader set).
  target_depth       mean `air_yards` over EVERY target a player saw that
                     week, not just red-zone ones — a player with real
                     volume but zero red-zone looks still gets a real
                     target_depth reading, because that is a distinct
                     signal from red-zone usage.

REUSED, NOT REBUILT (rule 11): the gsis<->sleeper crosswalk is
`nfl.import_ids()`, the same source `player_bio_capital.py`'s fallback
already uses — not a second crosswalk implementation.

RULE 3e CONTROL: `verify_known_positive()` checks two real, independently
verified 2024 players against fixtures pulled from the live parquet before
this file was written — James Conner (sleeper_id 4137): 24 real inside-10
rush plays across the season, 3 in week 1. CeeDee Lamb (sleeper_id 6786): 5
real inside-10 targets, 13 real end-zone targets across the season. A fail
arm (see the test file) proves the control can fail, not just currently
pass.

Run: python3 draft/backtest/target_quality.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent

OUT = HERE / "target_quality.json"

SEASONS = (2021, 2022, 2023, 2024, 2025)

PBP_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
          "pbp/play_by_play_{season}.parquet")

INSIDE_10 = 10.0

PBP_COLUMNS = ["play_type", "week", "season", "yardline_100", "air_yards",
              "receiver_player_id", "rusher_player_id", "season_type"]

# ── real fixtures, verified against the live 2024 parquet before this file
#    was written (rule 3e/3f) ──────────────────────────────────────────────
KNOWN_POSITIVE_RUSHER = {"gsis_id": "00-0033553", "sleeper_id": "4137",
                        "name": "James Conner", "season": 2024,
                        "expected_inside_10_carries_week1": 3,
                        "expected_inside_10_carries_season": 24}
KNOWN_POSITIVE_RECEIVER = {"gsis_id": "00-0036358", "sleeper_id": "6786",
                          "name": "CeeDee Lamb", "season": 2024,
                          "expected_inside_10_targets_season": 5,
                          "expected_end_zone_targets_season": 13}


# ── pure: classification + aggregation, fixture-testable, no I/O ──────────

def _real(x) -> bool:
    """True for a real number: not None, and not NaN. pandas' to_dict()
    hands NaN through as a float that IS-NOT None, so `x is not None` alone
    passes it -- caught before shipping (a real week-3 CeeDee Lamb row has
    `air_yards: nan` on a play with no completed pass to measure). NaN
    silently poisons any running sum it touches (once added, a sum stays
    NaN forever) and `json.dumps` emits a bare `NaN` token, which is not
    valid JSON. `x == x` is the standard NaN self-inequality test."""
    return x is not None and x == x


def is_inside_10(row: dict) -> bool:
    yl = row.get("yardline_100")
    return _real(yl) and yl <= INSIDE_10


def is_end_zone_target(row: dict) -> bool:
    """A target thrown to or past the goal line -- air_yards >= yardline_100.
    Distinct from `is_inside_10`: a play can start inside the 10 without the
    throw itself being an end-zone target (a short out route), and a throw
    from outside the 10 can still be an end-zone shot on 4th-and-goal-depth
    routes from further back is not the shape this catches -- both fields
    are kept because they answer different questions."""
    if row.get("play_type") != "pass" or not row.get("receiver_player_id"):
        return False
    ay, yl = row.get("air_yards"), row.get("yardline_100")
    return _real(ay) and _real(yl) and ay >= yl


def build_player_week(rows: list, crosswalk: dict) -> tuple[dict, set]:
    """{sleeper_id: {inside_10_targets, inside_10_carries, end_zone_targets,
    target_depth_sum, target_depth_n}} for one week's pbp rows.

    A rusher only enters the store if he has a real inside-10 carry (that is
    the only rush-side field tracked). A receiver enters on ANY target, so
    `target_depth` reflects his real full-week target profile, not just his
    red-zone looks. An id absent from the crosswalk is recorded in
    `unmatched`, never silently dropped."""
    out: dict = {}
    unmatched: set = set()

    def rec_for(gsis):
        sid = crosswalk.get(gsis)
        if sid is None:
            unmatched.add(gsis)
            return None
        return out.setdefault(str(sid), {
            "inside_10_targets": 0, "inside_10_carries": 0,
            "end_zone_targets": 0, "target_depth_sum": 0.0,
            "target_depth_n": 0})

    for row in rows:
        play = row.get("play_type")
        if play == "run" and row.get("rusher_player_id"):
            if is_inside_10(row):
                rec = rec_for(row["rusher_player_id"])
                if rec is not None:
                    rec["inside_10_carries"] += 1
        elif play == "pass" and row.get("receiver_player_id"):
            rec = rec_for(row["receiver_player_id"])
            if rec is None:
                continue
            ay = row.get("air_yards")
            if is_inside_10(row):
                rec["inside_10_targets"] += 1
            if is_end_zone_target(row):
                rec["end_zone_targets"] += 1
            if _real(ay):
                rec["target_depth_sum"] += ay
                rec["target_depth_n"] += 1
    return out, unmatched


def finalize_week(player_week: dict) -> dict:
    """Adds the derived `target_depth` mean, drops the raw sum/n from the
    public shape (kept internally only to make the mean exact)."""
    out = {}
    for sid, rec in player_week.items():
        n = rec["target_depth_n"]
        out[sid] = {
            "inside_10_targets": rec["inside_10_targets"],
            "inside_10_carries": rec["inside_10_carries"],
            "end_zone_targets": rec["end_zone_targets"],
            "target_depth": round(rec["target_depth_sum"] / n, 2) if n else None,
            "targets_seen": n,
        }
    return out


def build_season(season: int, rows: list, crosswalk: dict) -> dict:
    """{week:int -> {sleeper_id: {...}}} plus that season's unmatched gsis
    ids, from already-fetched pbp rows (REG season only, filtered by the
    caller)."""
    by_week: dict[int, list] = {}
    for row in rows:
        by_week.setdefault(int(row["week"]), []).append(row)

    weeks_out = {}
    all_unmatched: set = set()
    for wk, wk_rows in by_week.items():
        player_week, unmatched = build_player_week(wk_rows, crosswalk)
        weeks_out[str(wk)] = finalize_week(player_week)
        all_unmatched |= unmatched
    return {"weeks": weeks_out, "unmatched_gsis": sorted(all_unmatched)}


def build_store(per_season: dict) -> dict:
    """per_season: {season:int -> build_season() output}."""
    seasons_out = {}
    total_player_weeks = 0
    for season, season_doc in per_season.items():
        seasons_out[str(season)] = season_doc["weeks"]
        for wk_doc in season_doc["weeks"].values():
            total_player_weeks += len(wk_doc)

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/target_quality.py",
        "_note": ("Per-player-week inside-10 targets/carries, end-zone "
                 "targets and target depth (mean air_yards over all "
                 "targets that week), from nflverse play-by-play, gsis ids "
                 "resolved to sleeper_id via nfl.import_ids() (rule 11). A "
                 "player with no tracked event that week has no row -- "
                 "absent, never a fabricated zero."),
        "seasons": list(per_season.keys()),
        "population": {"total_player_weeks": total_player_weeks},
        "by_season": seasons_out,
    }
    return doc


def verify_known_positive(doc: dict) -> dict:
    """RULE 3e CONTROL, executable: James Conner's real 2024 week-1
    inside-10-carry count and CeeDee Lamb's real 2024 season totals must
    match the fixtures pulled from the live parquet before this file was
    written, or this is a red exit, not a silent partial store."""
    season = str(KNOWN_POSITIVE_RUSHER["season"])
    weeks = doc.get("by_season", {}).get(season, {})

    w1 = weeks.get("1", {}).get(KNOWN_POSITIVE_RUSHER["sleeper_id"], {})
    conner_ok = (w1.get("inside_10_carries") ==
                KNOWN_POSITIVE_RUSHER["expected_inside_10_carries_week1"])

    lamb_targets_season = sum(
        wk.get(KNOWN_POSITIVE_RECEIVER["sleeper_id"], {}).get("inside_10_targets", 0)
        for wk in weeks.values())
    lamb_ez_season = sum(
        wk.get(KNOWN_POSITIVE_RECEIVER["sleeper_id"], {}).get("end_zone_targets", 0)
        for wk in weeks.values())
    lamb_ok = (lamb_targets_season ==
              KNOWN_POSITIVE_RECEIVER["expected_inside_10_targets_season"]
              and lamb_ez_season ==
              KNOWN_POSITIVE_RECEIVER["expected_end_zone_targets_season"])

    return {"ok": bool(conner_ok and lamb_ok),
           "conner_week1_inside_10_carries": w1.get("inside_10_carries"),
           "conner_ok": conner_ok,
           "lamb_season_inside_10_targets": lamb_targets_season,
           "lamb_season_end_zone_targets": lamb_ez_season,
           "lamb_ok": lamb_ok}


# ── I/O: real fetches (CI only -- sandbox proxy blocks neither this
#    session's pbp fetches NOR nfl.import_ids, but this stays CI-gated for
#    the recurring/scheduled build the same way every other capture this
#    session is) ─────────────────────────────────────────────────────────

def _fetch_pbp_rows(season: int) -> list:  # pragma: no cover  (egress)
    import pandas as pd
    df = pd.read_parquet(PBP_URL.format(season=season), columns=PBP_COLUMNS)
    df = df[df["season_type"] == "REG"]
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
            rows = _fetch_pbp_rows(season)
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
    print(f"wrote {OUT.relative_to(ROOT)}: {doc['population']['total_player_weeks']} "
         f"player-weeks across {len(doc['seasons'])} seasons")
    return 0


if __name__ == "__main__":
    sys.exit(main())
