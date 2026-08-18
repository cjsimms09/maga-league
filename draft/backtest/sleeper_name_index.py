#!/usr/bin/env python3
# TERRITORY: C (fetch + store) — built by the relay under register 4t.
"""A COMMITTED NAME -> SLEEPER-ID INDEX, WITH COLLISIONS NAMED RATHER THAN RESOLVED.

Register 4t. Two studies are blocked on the same missing join:

  * grading the expert-spread ceiling (`EXPERT-SPREAD-CEILING-PREREG.md` §3), and
  * **Cory's 2026-08-18 question — "should we see which experts drafted better in
    2025 then use those experts to apply to model for 2026"** — which needs each
    expert's ranks scored against realized outcomes.

FantasyPros keys players by NAME. `nflverse_weekly_points_*.json` keys realized points
by SLEEPER ID. Nothing committed in this repo joins the two, so both studies stop here.

── WHY NOT JUST USE THE 2026 BOARD'S NAMES ────────────────────────────────────

Because it would bias the result in exactly the direction that fakes a positive.
`public/draft_data.json` holds the players who are relevant in **2026**. Joining a
2024 study through it silently drops everyone who busted in 2024 and was out of the
league by 2026 — **the survivors stay and the failures vanish.** For a study whose
whole subject is upside, that is not a coverage limitation, it is a result generator.
The Sleeper pool keeps retired and inactive players, so it does not have that hole.

── COLLISIONS ARE REPORTED, NEVER SILENTLY RESOLVED ───────────────────────────

This repo's recurring defect is **a lookup that returns confidently and returns the
wrong row** — the mis-targeted register closure that matched a branch name inside a
quoted summary, the calibration that joined punters into a skill-position fit. So a
normalized name that maps to more than one player is **not** collapsed to a best
guess. It is stored as a list under `collisions` and **excluded from the usable
index**, so a caller gets no answer rather than a wrong one, and the size of what was
excluded is a number in the artifact instead of an invisible haircut.

Real cases this matters for: Michael Thomas (WR and S), Josh Allen (QB and LB),
Steve Smith, Adrian Peterson, Chris Johnson, Zach Miller.

Pure functions here; the fetch is CI-only (the sandbox proxy blocks the host).
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "sleeper_name_index.json"

#: The positions this league rosters. A DB named "Josh Allen" must not be allowed to
#: collide with the quarterback — register 4r is the same mistake in the calibration.
ROSTERED = ("QB", "RB", "WR", "TE")

_SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?", re.I)
_NONALPHA = re.compile(r"[^a-z ]+")
_SPACES = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """`Marvin Harrison Jr.` -> `marvin harrison`; `Amon-Ra St. Brown` -> `amonra st brown`.

    Suffixes go because FantasyPros and Sleeper disagree about them constantly, and a
    suffix mismatch is the single most common reason a real player reads as absent.
    Accents are folded for the same reason.
    """
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("'", "").replace("-", "").replace(".", " ")
    s = _NONALPHA.sub(" ", s)
    s = _SUFFIX.sub(" ", s)
    return _SPACES.sub(" ", s).strip()


def build_index(players_raw: dict) -> dict:
    """`{sleeper_id: {...}}` -> an index plus an explicit collision list.

    Only rostered positions enter. A name held by two rostered players enters
    `collisions` and NOT `index` — see the module docstring.
    """
    by_name = {}
    for pid, p in (players_raw or {}).items():
        if not isinstance(p, dict):
            continue
        pos = (p.get("position") or "").upper()
        if pos not in ROSTERED:
            continue
        full = p.get("full_name") or " ".join(
            x for x in (p.get("first_name"), p.get("last_name")) if x)
        key = normalize_name(full)
        if not key:
            continue
        by_name.setdefault(key, []).append({
            "player_id": str(pid), "name": full, "position": pos,
            "team": p.get("team"), "years_exp": p.get("years_exp"),
        })

    index, collisions = {}, {}
    for key, cands in by_name.items():
        if len(cands) == 1:
            index[key] = cands[0]
        else:
            collisions[key] = sorted(cands, key=lambda c: c["player_id"])
    return {"index": index, "collisions": collisions}


def lookup(index_artifact: dict, name: str):
    """Resolve one FantasyPros name, or return None.

    Returns None for a collision ON PURPOSE. A caller that wants a guess can look at
    `collisions` itself and make that choice explicitly, which is the difference
    between a decision and a drift.
    """
    return (index_artifact.get("index") or {}).get(normalize_name(name))


def coverage_against(index_artifact: dict, names) -> dict:
    """How many of `names` this index actually resolves, with the misses NAMED.

    A join that reports only its hit rate hides which rows it dropped, and the
    dropped rows are never random — they are the odd names, the rookies, and the
    players who left the league.
    """
    hit, missed, collided = 0, [], []
    coll = index_artifact.get("collisions") or {}
    for n in names:
        k = normalize_name(n)
        if k in (index_artifact.get("index") or {}):
            hit += 1
        elif k in coll:
            collided.append(n)
        else:
            missed.append(n)
    total = hit + len(missed) + len(collided)
    return {
        "asked": total, "resolved": hit,
        "unresolved_collision": len(collided), "unresolved_missing": len(missed),
        "resolved_pct": round(100.0 * hit / total, 2) if total else 0.0,
        "collided_names": sorted(collided)[:60],
        "missing_names": sorted(missed)[:60],
    }


def run(timeout=60):   # pragma: no cover  (egress, CI only)
    import sys
    sys.path.insert(0, str(HERE.parent))
    import sleeper_import as SL

    err = None
    built = {"index": {}, "collisions": {}}
    try:
        built = build_index(SL.fetch_players())
    except Exception as e:
        err = f"{type(e).__name__}: {e}"

    art = {
        "_territory": "TERRITORY: C — written by sleeper_name_index.py",
        "_what": ("Normalized player name -> Sleeper id, rostered positions only. "
                  "Built from Sleeper's full pool, which RETAINS retired and inactive "
                  "players — the 2026 board does not, and joining a 2024 study through "
                  "the board would drop the players who busted and left, which for an "
                  "UPSIDE study manufactures the result."),
        "_collisions": ("Names held by more than one rostered player are listed here and "
                        "deliberately EXCLUDED from `index`. A caller gets no answer "
                        "rather than a wrong one."),
        "fetch_error": err,
        "counts": {"index": len(built["index"]), "collisions": len(built["collisions"])},
        **built,
    }
    OUT.write_text(json.dumps(art, indent=1))
    return art


def main() -> int:   # pragma: no cover
    art = run()
    print("=" * 66)
    print("SLEEPER NAME INDEX")
    print("=" * 66)
    if art["fetch_error"]:
        print("FETCH ERROR:", art["fetch_error"])
        return 1
    c = art["counts"]
    print(f"  unique resolvable names : {c['index']}")
    print(f"  names EXCLUDED as ambiguous: {c['collisions']}")
    for k, v in sorted(art["collisions"].items())[:10]:
        print(f"    {k}: " + ", ".join(f"{x['name']}({x['position']})" for x in v))
    if c["index"] < 500:
        print("\n  REFUSING TO CALL THIS AN INDEX — too few names resolved.")
        return 1
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
