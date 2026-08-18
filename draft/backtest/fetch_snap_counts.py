# TERRITORY: A
"""SNAP COUNTS AND SNAP SHARE — the gap the docstring promised for months.

Cory, 2026-08-17: *"Above all!! Fix the data problem and make sure we don't have
other mistakes in our info!!"*

THE GAP THIS CLOSES. `projections.opportunity_metrics` documented a return
containing `snap_share` and it was **never computed anywhere** — the contract
promised a field the function did not produce, so a reader planned around it and
the absence read as a data gap rather than a missing feature. The contract was
corrected on 2026-08-17 rather than the field invented; this is the field.

WHY IT IS THE ONE THAT MATTERS. Every dispersion number on the board is
`proj_mean × (a per-band constant)` — the ceiling, the floor, the sd, the weekly
sd. That is why `ceiling` measured collinear with `value` and got zeroed, why
the phase grid could only discover that double-counting the projection is bad,
and why the variance modifiers could not be fitted. **A per-player signal is the
missing ingredient in all of it**, and snap share is the cleanest one available:
it is measured per player-week, it is not derived from the projection, and role
volatility is exactly what "this player has upside" means.

THE JOIN IS TWO HOPS AND IS ACCOUNTED FOR, NOT ASSUMED.
snap_counts keys on `pfr_player_id`; every store here keys on Sleeper's id.
There is no direct crosswalk, so:

    pfr_player_id --players.csv--> gsis_id --nfl_data_py.import_ids--> sleeper_id

Each hop loses rows and the loss is REPORTED per hop. A join that silently drops
40% of players produces a store that looks complete and describes a different
population — which is the defect class this whole day has been about.

Run:
    python3 draft/backtest/fetch_snap_counts.py --seasons 2021 2022 2023 2024 2025
    python3 draft/backtest/fetch_snap_counts.py --check     # join accounting only
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import statistics as st
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEASONS = (2021, 2022, 2023, 2024, 2025)
SKILL = ("QB", "RB", "WR", "TE")
SNAP_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
            "snap_counts/snap_counts_{season}.csv")
PLAYERS_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
               "players/players.csv")
UA = {"User-Agent": "maga-league/1.0"}

#: A season whose join rate falls below this is REPORTED AND REFUSED rather than
#: written. A partial store that looks whole is worse than no store — the reader
#: cannot tell "he had no snaps" from "our join lost him", and those are the two
#: facts this file exists to keep apart.
#:
#: RAISED 0.70 -> 0.95 ON 2026-08-17, because 0.70 was a guard that could not
#: guard. The five stored seasons join at 0.9882 / 0.9905 / 0.9919 / 0.9919 /
#: 0.9714 — a floor of 0.70 sat TWENTY-SEVEN POINTS below anything ever
#: observed, so the two-hop crosswalk could have silently lost a quarter of the
#: league and still written a green store. A threshold chosen to be safely
#: un-trippable is decoration; it reads as a check and functions as a comment.
#:
#: 0.95 is set below the worst season actually seen (0.9714) with room for a
#: normal bad year, and far above the level at which the store stops being
#: trustworthy. It is deliberately NOT set just under 0.9714: a bound tuned to
#: the current data would fire on ordinary variation and get widened again,
#: which is how a ratchet becomes a rubber stamp (see
#: draft/audit/adp_sd_ratchet_fired_2026-08-17.md for that exact argument).
MIN_JOIN_RATE = 0.95


def _get(url: str, timeout: int = 120) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


class NotPublished(Exception):
    """nflverse has no file for this season YET — distinct from a broken fetch.

    THIS DISTINCTION IS THE WHOLE REASON THE CLASS EXISTS. The weekly job runs
    from now through the season, and before week 1 there is no
    `snap_counts_2026.csv` at all. "Not published yet" is the EXPECTED state for
    a job scheduled ahead of kickoff, and it must exit green — a red run every
    week until September trains us to ignore the one job whose entire value is
    that it ran. A genuine failure (network, auth, malformed CSV) must still go
    red, so the two are never collapsed into one silent success.
    """


def crosswalk() -> tuple[dict, dict]:
    """(pfr_id -> gsis_id, gsis_id -> sleeper_id) with per-hop counts."""
    rows = list(csv.DictReader(io.StringIO(_get(PLAYERS_URL))))
    pfr_to_gsis = {r["pfr_id"]: r["gsis_id"] for r in rows
                   if r.get("pfr_id") and r.get("gsis_id")}
    import nfl_data_py as nfl
    ids = nfl.import_ids()
    gsis_to_sleeper = {}
    for _i, r in ids.iterrows():
        g, s = r.get("gsis_id"), r.get("sleeper_id")
        if isinstance(g, str) and g and s == s and s is not None:
            gsis_to_sleeper[g] = str(int(s)) if not isinstance(s, str) else s
    return pfr_to_gsis, gsis_to_sleeper


def season_rows(season: int) -> list[dict]:
    try:
        text = _get(SNAP_URL.format(season=season))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotPublished(f"nflverse has no snap_counts_{season}.csv yet") from e
        raise
    return list(csv.DictReader(io.StringIO(text)))


def build_season(season: int, pfr_to_gsis: dict, gsis_to_sleeper: dict) -> dict:
    """{week -> {sleeper_id -> {snaps, pct}}} plus the join accounting.

    ABSENT IS ABSENT. A player-week with no `offense_snaps` value is skipped, not
    written as zero: "did not play" and "played zero offensive snaps" are
    different, and only one of them is a fact this feed can assert.
    """
    raw = season_rows(season)
    skill = [r for r in raw if r.get("position") in SKILL
             and (r.get("offense_snaps") or "") != ""]
    weeks: dict = {}
    seen_pfr, hop1, hop2 = set(), set(), set()
    for r in skill:
        pfr = r.get("pfr_player_id") or ""
        seen_pfr.add(pfr)
        gsis = pfr_to_gsis.get(pfr)
        if not gsis:
            continue
        hop1.add(pfr)
        sid = gsis_to_sleeper.get(gsis)
        if not sid:
            continue
        hop2.add(pfr)
        try:
            snaps = float(r["offense_snaps"])
            pct = float(r["offense_pct"]) if (r.get("offense_pct") or "") != "" else None
        except (TypeError, ValueError):
            continue
        wk = weeks.setdefault(int(r["week"]), {})
        wk[sid] = {"snaps": snaps, "pct": pct}
    join = {
        "skill_player_weeks": len(skill),
        "distinct_pfr_ids": len(seen_pfr),
        "resolved_to_gsis": len(hop1),
        "resolved_to_sleeper": len(hop2),
        "join_rate": round(len(hop2) / len(seen_pfr), 4) if seen_pfr else 0.0,
        "lost_at_pfr_to_gsis": len(seen_pfr) - len(hop1),
        "lost_at_gsis_to_sleeper": len(hop1) - len(hop2),
    }
    return {"season": season, "weeks": weeks, "join": join}


def season_share_volatility(doc: dict) -> dict:
    """THE POINT OF THE PULL, computed here so it cannot be forgotten later.

    Per player: how much his snap SHARE moved week to week. This is a genuine
    PER-PLAYER dispersion measure — it is not derived from the projection, which
    is the property every existing dispersion field on the board lacks.
    """
    by_player: dict = {}
    for _wk, rows in (doc.get("weeks") or {}).items():
        for sid, v in rows.items():
            if v.get("pct") is not None:
                by_player.setdefault(sid, []).append(float(v["pct"]))
    out = {}
    for sid, vals in by_player.items():
        if len(vals) < 4:
            continue          # a volatility on three weeks is noise about noise
        out[sid] = {"weeks": len(vals), "mean_pct": round(st.fmean(vals), 4),
                    "sd_pct": round(st.pstdev(vals), 4)}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*", type=int, default=list(SEASONS))
    ap.add_argument("--check", action="store_true",
                    help="report join accounting and write nothing")
    args = ap.parse_args()

    print("building the two-hop crosswalk (pfr -> gsis -> sleeper) ...")
    pfr_to_gsis, gsis_to_sleeper = crosswalk()
    print(f"  pfr->gsis {len(pfr_to_gsis)} | gsis->sleeper {len(gsis_to_sleeper)}")

    ok = True
    for season in args.seasons:
        try:
            doc = build_season(season, pfr_to_gsis, gsis_to_sleeper)
        except NotPublished as e:
            # Green, and LOUD about why. See NotPublished's own docstring: this
            # is the expected state of the in-season job before week 1.
            print(f"{season}: {e} — nothing to write yet (expected before week 1)")
            continue
        j = doc["join"]
        vol = season_share_volatility(doc)
        doc["share_volatility"] = vol
        doc["_note"] = ("Offensive snap counts and snap share per player-week. "
                        "ABSENT IS ABSENT — a player-week with no offense_snaps "
                        "value is omitted, never written as zero. `share_volatility` "
                        "is the week-to-week sd of snap share: a PER-PLAYER "
                        "dispersion signal that is not derived from the projection, "
                        "which is the property every dispersion field already on "
                        "the board lacks.")
        print(f"{season}: {j['skill_player_weeks']} skill player-weeks, "
              f"join {j['join_rate']:.1%} "
              f"(lost {j['lost_at_pfr_to_gsis']} at pfr->gsis, "
              f"{j['lost_at_gsis_to_sleeper']} at gsis->sleeper), "
              f"{len(vol)} players with a usable volatility")
        if j["join_rate"] < MIN_JOIN_RATE:
            print(f"   REFUSING {season}: join rate below {MIN_JOIN_RATE:.0%} — a "
                  "partial store that looks whole is worse than none", file=sys.stderr)
            ok = False
            continue
        if not args.check:
            (HERE / f"snap_counts_{season}.json").write_text(json.dumps(doc, indent=1))
            print(f"   wrote snap_counts_{season}.json")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
