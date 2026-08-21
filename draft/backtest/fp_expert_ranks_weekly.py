# TERRITORY: C
"""WEEKLY EXPERT-CONSENSUS-RANK CAPTURE — pull-list refill #2, item (3).

P129 (rookie-premium grade) needs season-END comparisons against ECR AS IT
STOOD each week, and this project holds zero historical weekly ECR —
`fp_expert_ranks.py` (register 4t) captures only the PRESEASON draft-time
ranking (`type=draft&week=0`), one snapshot per season, never in-season.
Every week not captured before it happens is unrecoverable, same shape as
register 155.

REUSED, NOT REBUILT (rule 11): `fp_expert_ranks.parse()` already handles
this exact payload shape (`players[].experts`, the raw per-expert rank map,
`rank_ecr`/`rank_min`/`rank_max`/`rank_std`) — the weekly response is the
same JSON shape with a different `type`/`week` query, not a different
parser. Imported directly, not copied.

THE URL SHAPE IS UNCONFIRMED, self-discovering the same way
`weekly_projection_archive.py`'s FP weekly-projections fetch already does
(that file's own candidates are hardcoded to `week=draft`/`week=0`; no
weekly consensus-rankings endpoint has ever been probed from this repo
either). `type=draft` is confirmed live (register 4t's own capture); the
in-season equivalent is commonly `type=weekly` or `type=ros` in
FantasyPros' own API convention but NEITHER has been confirmed against
this plan — CI-only egress tries both, keeps whichever parses >= 20 players
with real expert ranks, and records what it tried either way so a miss
shows the real endpoint next run instead of contributing nothing.

RULE 3e: `positive_control.py`-style floor — the capture is VOID, never a
misleadingly-thin commit, if fewer than 20 players carry expert ranks.

Snapshot files, one per week, committed:
  draft/backtest/fp_expert_ranks_weekly_<season>_w<week>.json

Run: python3 draft/backtest/fp_expert_ranks_weekly.py --year 2026 --week 1
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))  # weekly_proj_snapshot.py lives in
                                       # draft/, one level up from
                                       # draft/backtest/ -- a real CI
                                       # failure (ModuleNotFoundError) the
                                       # first time this workflow ran with
                                       # a `working-directory: draft/backtest`
                                       # override, since HERE alone never
                                       # covered draft/'s own modules

from fp_expert_ranks import parse  # noqa: E402  -- rule 11, not re-derived

MIN_PLAYERS_WITH_EXPERTS = 20  # rule 3e floor

#: `type=draft`/`week=0` is confirmed live (register 4t); the in-season
#: equivalents are UNCONFIRMED -- FantasyPros' own API convention for this
#: endpoint family, tried in order, first to clear the floor wins.
_WEEKLY_TYPE_CANDIDATES = ("weekly", "ros")

_URL_TMPL = ("https://api.fantasypros.com/v2/json/nfl/{y}/consensus-rankings"
            "?type={t}&scoring=HALF&position=ALL&week={w}&experts=show")


def store_path(year: int, week: int) -> Path:
    return HERE / f"fp_expert_ranks_weekly_{int(year)}_w{int(week)}.json"


def build_snapshot(year: int, week: int, store: dict, url: str,
                   fetch_error: str | None, scraped_at: str) -> dict:
    """Pure assembly -- same shape discipline as fp_expert_ranks.py's `art`
    dict, fixture-testable without any network call."""
    return {
        "_territory": "TERRITORY: C — written by fp_expert_ranks_weekly.py",
        "_what": "Every individual expert's IN-SEASON rank for every rostered "
                "player, verbatim, one snapshot per week.",
        "_why": ("Pull-list refill #2 item 3: P129 needs season-end vs. "
                 "as-it-stood ECR comparisons, and this project held zero "
                 "historical weekly ECR before this file."),
        "season": year,
        "week": week,
        "url": url,
        "scraped_at": scraped_at,
        "fetch_error": fetch_error,  # register 4s discipline: never a shrug
        **store,
    }


def run(year: int, week: int, timeout: int = 60) -> dict:  # pragma: no cover  (egress; CI only)
    import re

    import fantasypros_adp as FP

    key = None
    diag = {"type_tried": []}
    try:
        html = FP._get(  # noqa: SLF001  -- reused, not re-derived
            f"https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php?year={year}",
            timeout)
        for bname in re.findall(r'//cdn\.fantasypros\.com/[^"\']*bundle-[^"\']+\.js', html)[:8]:
            m = FP._KEY_RE.search(FP._get("https:" + bname, timeout))  # noqa: SLF001
            if m:
                key = m.group(1)
                break
    except Exception as e:  # noqa: BLE001
        diag["key_hunt_error"] = f"{type(e).__name__}: {e}"

    chosen_url, chosen_store, err = None, None, None
    for t in _WEEKLY_TYPE_CANDIDATES:
        url = _URL_TMPL.format(y=year, t=t, w=week)
        try:
            text = FP._get(url, timeout, headers=({"x-api-key": key} if key else None))  # noqa: SLF001
            store = parse(text)
            n = store["coverage"]["with_experts"] if "coverage" in store else len(
                [p for p in store["players"] if p.get("n_experts")])
            diag["type_tried"].append({"type": t, "url": url[:160], "with_experts": n})
            if n >= MIN_PLAYERS_WITH_EXPERTS:
                chosen_url, chosen_store = url, store
                break
        except Exception as e:  # noqa: BLE001
            diag["type_tried"].append({"type": t, "url": url[:160],
                                       "error": f"{type(e).__name__}: {e}"})

    if chosen_store is None:
        err = f"no candidate cleared the {MIN_PLAYERS_WITH_EXPERTS}-player floor: {diag}"
        chosen_store = {"players": [], "players_without_experts": [], "expert_names": {}}
        chosen_url = _URL_TMPL.format(y=year, t=_WEEKLY_TYPE_CANDIDATES[0], w=week)

    scraped_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return build_snapshot(year, week, chosen_store, chosen_url, err, scraped_at)


def main(argv=None) -> int:  # pragma: no cover  (egress; CI only)
    import argparse

    import weekly_proj_snapshot as WPS  # noqa: E402 -- nfl_state(), rule 11

    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--week", type=int, default=None)
    a = ap.parse_args(argv)

    year, week = a.year, a.week
    if year is None or week is None:
        st = WPS.nfl_state()
        season_type = str(st.get("season_type") or "").lower()
        if season_type and season_type != "regular":
            print(f"season_type is '{season_type}', not 'regular' -- no in-season "
                 "week to capture yet. Exiting CLEAN (same discipline as "
                 "weekly_projection_archive.py).")
            return 0
        week = week or (int(st["week"]) if st.get("week") else None)
        year = year or (int(st["season"]) if st.get("season") else None)
    if not week or not year:
        print("! could not determine season/week and none was supplied -- "
             "REFUSING rather than capturing under a guess", file=sys.stderr)
        return 1

    art = run(year, week)
    n = len([p for p in art["players"] if p.get("n_experts")])
    if art.get("fetch_error") or n < MIN_PLAYERS_WITH_EXPERTS:
        print(f"VOID -- {n} players with experts, floor is {MIN_PLAYERS_WITH_EXPERTS}. "
             f"error: {art.get('fetch_error')}", file=sys.stderr)
        return 1
    p = store_path(year, week)
    p.write_text(json.dumps(art, indent=1))
    print(f"wrote {p.name}: {n} players with expert ranks, url={art['url']}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
