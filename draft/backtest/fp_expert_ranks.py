#!/usr/bin/env python3
# TERRITORY: C (fetch + store) — built by the relay under register 4t.
"""CAPTURE EVERY INDIVIDUAL EXPERT'S RANK FOR EVERY PLAYER.

Register 4t. Cory, 2026-08-18: "ceiling is a projected score that we will have to
get from outside source" / "we need to get them from somewhere!!!"

WHAT THE PROBE ESTABLISHED FIRST (run 32087333128, `discovery_ceiling_sources.json`):
six endpoints reachable, and **NOT ONE publishes a per-player point ceiling.** Not
FantasyPros' season projections (238KB, 58 keys), not their weekly projections, not
Sleeper's projections (2.9MB, 124 keys). The "get it from a source that states it"
plan has no source that states it. That is a real null and it is measured, not
assumed.

**BUT ONE ENDPOINT CARRIES SOMETHING BETTER THAN A STATED CEILING, AND WE HAVE BEEN
THROWING IT AWAY.** `consensus-rankings?type=draft&experts=show` returns, per player,
**each individual expert's rank** — 90 of them on Jahmyr Gibbs. Not `rank_min`/
`rank_max`/`rank_std`, which are FP's three-number SUMMARY of that spread and which
we also discard; the actual observed ranks, one per human.

── WHY THAT IS THE THING WE ACTUALLY WANTED ───────────────────────────────────

`proj_ceiling` today is `(the player's projection) x (the p90 realized/projected
ratio of a COHORT he is bucketed into)`. Register 4t: the deep cohorts are dominated
by players who never got a real role (`RB|33+` p50 **0.345**), so their p90 lands near
a typical PARTICIPATION outcome, and every RB from projection rank 33 down gets the
identical multiplier **1.794**. Kimani Vidal's stated best case is **95.1 points**.
It is a group statistic applied to individuals, which is why it cannot tell a
round-5 breakout from a round-15 dart throw.

An expert rank distribution has the opposite shape. It is **per player by
construction** — it is ninety humans independently answering "how good is THIS guy",
and their DISAGREEMENT about a specific player is exactly the quantity a cohort
average destroys. A late-round player half the industry likes and half ignores has a
wide spread; a consensus-boring player of the same projection has a narrow one. The
board cannot currently distinguish those two, and this is the field that can.

── THIS FILE ONLY CAPTURES. IT COMPUTES NO CEILING. ───────────────────────────

Deliberate, for two reasons:

  1. **Register 4t holds every ceiling change until after 08-22.** A third variant of
     a broken quantity, four days before the draft, is worse than the honest one.
  2. **Register 4s.** `regenerate()` silently lost the 2025 season because a fetch
     failed, the `missing` list was never surfaced, and the skip was never persisted
     — three silent layers stacked, and the artifact still looked complete. So this
     writes a STORE and nothing else, and the store records what it did NOT get:
     `players_without_experts`, `fetch_error`, and the expert count per player all
     live in the file. **A capture that cannot report its own gaps is how 4s
     happened.**

Rank -> points is a modelling decision with a real choice in it (overall rank or
POSITIONAL rank? which quantile of the expert spread?) and it belongs in a
preregistered study against this store, not smuggled into a fetcher.

CI-ONLY for the egress half — the sandbox proxy 403s api.fantasypros.com.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_YEAR = 2026

# ⚠️ `year` IS A REQUIRED ARGUMENT EVERYWHERE BELOW, AND THAT IS DELIBERATE.
#
# The first version of this file had `def run(year=YEAR)` with a module-level
# `YEAR = 2026`, and the workflow did `X.YEAR = 2025` before calling `X.main()`.
# **Python binds default arguments at DEFINITION time, so the assignment did
# nothing.** Run 32087677173 re-captured 2026, found the committed file byte-identical,
# printed "No change to the store", and **exited 0 — a job that reported success while
# capturing the wrong season and committing nothing.**
#
# That is the exact defect class this whole week has been about: a check that cannot
# fail, reported as a check that passed. Register 4s is the same shape — a season
# vanished and the artifact still looked complete.
#
# So the fix is not "remember to pass the year at the call site". The parameter is
# required, the captured season is asserted against the requested one, and
# `test_the_year_cannot_be_set_by_mutating_a_module_global` fails if a default
# ever comes back.


def store_path(year: int) -> Path:
    return HERE / f"fp_expert_ranks_{int(year)}.json"


URL = ("https://api.fantasypros.com/v2/json/nfl/{y}/consensus-rankings"
       "?type=draft&scoring=HALF&position=ALL&week=0&experts=show")

ROSTERED = ("QB", "RB", "WR", "TE")


def _int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def _float(v):
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def parse(payload) -> dict:
    """FP's `experts=show` response -> a store. Pure; every test drives this.

    Keeps the raw expert map verbatim (`{expert_id: rank}`) rather than reducing it
    to summary statistics here. Reducing early is what left us with a cohort p90 and
    no way back to the players inside it.
    """
    if isinstance(payload, str):
        payload = json.loads(payload)
    rows = payload.get("players") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        rows = []

    players, no_experts, non_rostered = [], [], 0
    for o in rows:
        if not isinstance(o, dict):
            continue
        name = o.get("player_name")
        if not name:
            continue
        pos = (o.get("player_position_id") or "").upper()
        if pos not in ROSTERED:
            non_rostered += 1
            continue
        raw = o.get("experts")
        # `{expert_id: rank}`; ranks arrive as STRINGS from FP and a silent str/int
        # mix is how a sort quietly reorders itself later.
        ranks = {}
        if isinstance(raw, dict):
            for eid, r in raw.items():
                ri = _int(r)
                if ri is not None:
                    ranks[str(eid)] = ri
        rec = {
            "fp_player_id": o.get("player_id"),
            "name": name,
            "position": pos,
            "team": o.get("player_team_id"),
            "rank_ecr": _int(o.get("rank_ecr")),
            "rank_min": _int(o.get("rank_min")),
            "rank_max": _int(o.get("rank_max")),
            "rank_ave": _float(o.get("rank_ave")),
            "rank_std": _float(o.get("rank_std")),
            "pos_rank": o.get("pos_rank"),
            "n_experts": len(ranks),
            "expert_ranks": ranks,
        }
        if not ranks:
            no_experts.append(name)
        players.append(rec)

    players.sort(key=lambda p: (p["rank_ecr"] is None, p["rank_ecr"] or 10**6))
    return {
        "players": players,
        "players_without_experts": no_experts,
        "non_rostered_dropped": non_rostered,
        "expert_names": (payload.get("expert_names")
                         if isinstance(payload, dict) else None) or {},
        "source_meta": _source_meta(payload),
    }


#: Payload fields that say WHEN and WHAT this ranking is. The first version of this
#: file dropped all of them, which is register 22's defect ("we keep one scalar and
#: discard the rest") reappearing in the fetcher written to fix it.
#:
#: ⚠️ `last_updated` IS LOAD-BEARING, NOT PROVENANCE TRIVIA. The entire grading plan
#: compares a season's PRESEASON expert ranks against that season's realized points.
#: If `?year=2025` returns ranks revised DURING or AFTER 2025, the arm is scored on
#: hindsight and will look excellent while being worthless. `2025`'s top-15 reads as
#: genuinely preseason by eye — Malik Nabers 7th and Brian Thomas Jr. 13th, both of
#: whom would sit far lower under hindsight — but an eyeball is not a check, and the
#: source hands us the timestamp for free.
_META_FIELDS = ("last_updated", "last_updated_ts", "year", "week", "type",
                "scoring", "ranking_type_name", "total_experts", "count")


def _source_meta(payload) -> dict:
    if not isinstance(payload, dict):
        return {}
    return {k: payload[k] for k in _META_FIELDS if k in payload}


def coverage(store: dict) -> dict:
    """What the store actually holds, stated so a reader does not have to derive it.

    `deep_with_experts` is the number that decides whether this is useful at all: the
    whole complaint is about players drafted from round 4 on, so expert coverage that
    stops at the top 60 would be a null for our purpose even at 100% of what FP
    serves.
    """
    ps = store.get("players") or []
    withexp = [p for p in ps if p.get("n_experts")]
    deep = [p for p in withexp if (p.get("rank_ecr") or 0) > 60]
    spreads = [p["rank_max"] - p["rank_min"] for p in withexp
               if p.get("rank_max") is not None and p.get("rank_min") is not None]
    return {
        "players": len(ps),
        "with_experts": len(withexp),
        "without_experts": len(ps) - len(withexp),
        "deep_with_experts": len(deep),
        "max_experts_on_a_player": max((p["n_experts"] for p in withexp), default=0),
        "min_experts_on_a_player": min((p["n_experts"] for p in withexp), default=0),
        "distinct_rank_spreads": len(set(spreads)),
        "why_distinct_spreads_matters": (
            "register 4j: 0 of 535 board players shared a proj_mean and differed on ANY "
            "dispersion field. A field with one value per band is not player-specific. "
            "This counts how many DIFFERENT spreads the source actually publishes."),
    }


def run(year: int, timeout=60):   # pragma: no cover  (egress, CI only)
    import re
    import fantasypros_adp as FP

    year = int(year)

    key = None
    try:
        html = FP._get(f"https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php?year={year}",
                       timeout)
        for bname in re.findall(r'//cdn\.fantasypros\.com/[^"\']*bundle-[^"\']+\.js', html)[:8]:
            m = FP._KEY_RE.search(FP._get("https:" + bname, timeout))
            if m:
                key = m.group(1)
                break
    except Exception as e:
        print(f"key hunt failed: {type(e).__name__}: {e}")

    url = URL.format(y=year)
    err = None
    store = {"players": [], "players_without_experts": [], "expert_names": {}}
    try:
        text = FP._get(url, timeout, headers=({"x-api-key": key} if key else None))
        store = parse(text)
    except Exception as e:
        err = f"{type(e).__name__}: {e}"

    # Register 79 — OUR fetch time, distinct from `source_meta.last_updated`
    # (FantasyPros' own field, extracted from their payload). Cory reads
    # expert_spread_2026.json at the table; a two-day-old scrape with no
    # date on it is not obviously stale on screen. `surface_parity.js`
    # already recognises `scraped_at` as a stamp key.
    import datetime
    scraped_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    art = {
        "_territory": "TERRITORY: C — written by fp_expert_ranks.py",
        "_what": ("Every individual expert's draft rank for every rostered-position player, "
                  "verbatim. NOT a ceiling — the raw material one can be built from."),
        "_why": ("Register 4t. Six sources probed (discovery_ceiling_sources.json, run "
                 "32087333128); NONE publishes a per-player point ceiling. This endpoint "
                 "publishes something better: the observed opinion distribution per player."),
        "_not_a_ceiling_yet": ("rank -> points is a modelling choice (overall or POSITIONAL "
                               "rank? which quantile of the spread?) and belongs in a "
                               "preregistered study against this store, not in a fetcher."),
        "season": year,
        "url": url,
        "scraped_at": scraped_at,
        "api_key_found": bool(key),
        "fetch_error": err,          # 4s: a failed fetch is recorded, never a shrug
        **store,
        "hindsight_warning": (
            "GRADING VALIDITY: `source_meta.last_updated` must predate the season this "
            "store is for. If FP revised these ranks DURING or AFTER the season, any arm "
            "scored on them is reading hindsight and will look excellent while being "
            "worthless. Check it before grading, do not assume it."),
        "coverage": coverage(store),
    }
    p = store_path(year)
    p.write_text(json.dumps(art, indent=1))
    return art


def main(argv=None) -> int:   # pragma: no cover
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=DEFAULT_YEAR)
    a = ap.parse_args(argv)

    art = run(a.year)
    c = art["coverage"]
    print("=" * 70)
    print(f"FP EXPERT RANK CAPTURE — {art['season']}")
    print("=" * 70)
    # The store must be for the season that was ASKED for. Run 32087677173 asked for
    # 2025, silently captured 2026, and reported success.
    if int(art["season"]) != int(a.year):
        print(f"  REFUSING: asked for {a.year}, captured {art['season']}.")
        return 1
    print(f"  wrote {store_path(a.year).name}")
    if art["fetch_error"]:
        print("FETCH ERROR:", art["fetch_error"])
        return 1
    print(f"  players (QB/RB/WR/TE)      : {c['players']}")
    print(f"  with individual expert ranks: {c['with_experts']}")
    print(f"  of those, ECR deeper than 60: {c['deep_with_experts']}   <- the rounds Cory cares about")
    print(f"  experts per player          : {c['min_experts_on_a_player']}..{c['max_experts_on_a_player']}")
    print(f"  DISTINCT rank spreads       : {c['distinct_rank_spreads']}")
    print(f"  players with NO experts     : {c['without_experts']}")
    if c["with_experts"] == 0:
        print("\n  REFUSING TO CALL THIS A CAPTURE — zero players carry expert ranks.")
        return 1
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
