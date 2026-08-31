#!/usr/bin/env python3
# TERRITORY: A
"""VALIDATE THE STORE THE FIVE DECISION GRADERS READ.

`draft/data/league_history.json` is the only input to `start_sit_vs_random`,
`waiver_vs_random`, `drop_vs_random`, `keeper_vs_random` and
`draft_pick_vs_random`. Nothing else feeds them.

WHY THIS EXISTS. Until 2026-08-25 nothing validated it. A dozen studies READ it
and assert things about their own slice, but no check asked "is this store
sound" — so an export that fetched badly and wrote a plausible file would have
been committed, and five graders would have run green on it every Tuesday of the
season. That is the shape this repo keeps meeting: not a crash, a filter over
real data returning something believable.

It was found the same day the store was refreshed for the first time in sixteen
days (register 318), by `test_every_gate_can_fail` noticing that the new export
workflow commits data with nothing verifying it. The workflow had an inline
"did it land" check AFTER the commit; the house bar, which `standing-check` sets,
is BEFORE YOU COMMIT, RUN SOMETHING THAT CAN SAY NO. This is that something.

WHAT IT CHECKS, and every threshold below was measured against the real store
before it was written down rather than chosen:

  * four seasons present, each with 10 final rosters and 18 weeks
  * roster ids and owner ids distinct within a season (a collapsed join shows up
    here as 9 owners, not as an error)
  * no null player id, and NO PLAYER ON TWO ROSTERS — the integrity check that
    catches a merge writing the same roster twice
  * ~150 rostered players a season (measured 151/155/155/154)
  * at least one draft per season (2023 legitimately has TWO — the 150-pick main
    draft and the keeper ledger, which `test_data_assumptions` documents)
  * `built_at` parses and is not in the future
  * THE CURRENT SEASON IS PRESENT. An export that silently drops the live season
    is the one failure that makes every grader historical, which is register
    318's whole point.

WHAT IT DELIBERATELY DOES NOT CHECK: whether the numbers are RIGHT. This is a
soundness gate on shape and identity, not a claim about anyone's points. A gate
that tried to judge correctness here would either be vacuous or would need the
very data it is guarding.

Usage:
    python3 draft/tools/validate_league_history.py            # validate the store
    python3 draft/tools/validate_league_history.py --self-check   # prove it says NO

Exit 0 = sound. Exit 1 = refuse; the reasons are printed, one per line.
"""
from __future__ import annotations

import copy
import json
import pathlib
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
STORE = ROOT / "draft" / "data" / "league_history.json"

TEAMS = 10
WEEKS = 18
MIN_SEASONS = 4
MIN_ROSTERED = 130          # measured 151/155/155/154; a floor, not a pin
MAX_ROSTERED = 200


def validate(store: dict, today: str | None = None) -> list[str]:
    """Return a list of PROBLEMS. Empty means sound.

    Pure given its inputs — the clock is passed in, so the self-check below can
    exercise the future-stamp arm without waiting for a year to pass.
    """
    bad: list[str] = []
    seasons = store.get("seasons") or []
    if len(seasons) < MIN_SEASONS:
        bad.append(f"only {len(seasons)} season(s); expected at least {MIN_SEASONS}")

    stamp = str(store.get("built_at") or "")
    if not stamp:
        bad.append("no built_at — the store cannot be told from a stale copy")
    else:
        try:
            t = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
            now = (datetime.fromisoformat(today.replace("Z", "+00:00")) if today
                   else datetime.now(timezone.utc))
            if t > now:
                bad.append(f"built_at {stamp} is in the FUTURE — the clock or the "
                           "writer is wrong, and staleness checks downstream all "
                           "key on this")
        except ValueError:
            bad.append(f"built_at {stamp!r} does not parse")

    years = [str(s.get("season")) for s in seasons]
    if len(set(years)) != len(years):
        bad.append(f"duplicate season rows: {years}")

    for s in seasons:
        yr = s.get("season")
        rosters = s.get("final_rosters") or []
        if len(rosters) != TEAMS:
            bad.append(f"{yr}: {len(rosters)} final rosters, expected {TEAMS}")

        weeks = s.get("weeks") or {}
        n_weeks = len(weeks) if isinstance(weeks, dict) else len(weeks or [])
        if n_weeks != WEEKS:
            bad.append(f"{yr}: {n_weeks} weeks, expected {WEEKS}")

        if not (s.get("drafts") or []):
            bad.append(f"{yr}: no draft recorded")

        owners = [r.get("owner_id") for r in rosters]
        if any(o is None for o in owners):
            bad.append(f"{yr}: a roster has a null owner_id")
        if len(set(owners)) != len(owners):
            bad.append(f"{yr}: {len(set(owners))} distinct owners across "
                       f"{len(owners)} rosters — a join has collapsed")

        rids = [r.get("roster_id") for r in rosters]
        if len(set(rids)) != len(rids):
            bad.append(f"{yr}: duplicate roster_id values {rids}")

        seen: dict[str, int] = {}
        nulls = 0
        for r in rosters:
            for pid in (r.get("players") or []):
                if pid is None:
                    nulls += 1
                    continue
                seen[str(pid)] = seen.get(str(pid), 0) + 1
        if nulls:
            bad.append(f"{yr}: {nulls} null player id(s) on rosters")
        shared = sorted(p for p, c in seen.items() if c > 1)
        if shared:
            bad.append(f"{yr}: {len(shared)} player(s) appear on more than one "
                       f"roster (e.g. {shared[:4]}) — the same roster has been "
                       "written twice, or ownership is ambiguous")
        total = sum(seen.values())
        if not (MIN_ROSTERED <= total <= MAX_ROSTERED):
            bad.append(f"{yr}: {total} rostered players, outside "
                       f"[{MIN_ROSTERED}, {MAX_ROSTERED}]")

    # THE ONE THAT MAKES EVERY GRADER HISTORICAL IF IT SLIPS.
    if stamp and years:
        try:
            current = str((datetime.fromisoformat(today.replace("Z", "+00:00")) if today
                           else datetime.now(timezone.utc)).year)
            if current not in years:
                bad.append(f"the CURRENT season {current} is absent (have {sorted(years)}) "
                           "— every decision grader would run green on history alone, "
                           "which is register 318 exactly")
        except ValueError:
            pass
    return bad


def _self_check() -> int:
    """RULE 3e — prove it can say NO before its silence is worth anything.

    A validator that has only ever returned "sound" has not been tested, only
    run. Each arm below breaks ONE thing in a copy of the real store and
    requires the corresponding refusal.
    """
    if not STORE.exists():
        print("self-check: no store on disk to mutate")
        return 1
    good = json.loads(STORE.read_text())
    base = validate(good)
    if base:
        print("self-check CANNOT RUN: the real store is already failing:")
        for b in base:
            print("   -", b)
        return 1

    cases = []

    d = copy.deepcopy(good); d["seasons"] = d["seasons"][:1]
    cases.append(("a truncated store", d, "season"))

    d = copy.deepcopy(good); d["seasons"][0]["final_rosters"].pop()
    cases.append(("a season missing a team", d, "final rosters"))

    d = copy.deepcopy(good)
    d["seasons"][0]["final_rosters"][1]["owner_id"] = \
        d["seasons"][0]["final_rosters"][0]["owner_id"]
    cases.append(("two rosters with the same owner", d, "collapsed"))

    d = copy.deepcopy(good)
    first = d["seasons"][0]["final_rosters"][0]["players"][0]
    d["seasons"][0]["final_rosters"][1]["players"].append(first)
    cases.append(("a player on two rosters", d, "more than one"))

    d = copy.deepcopy(good); d["seasons"][0]["weeks"] = {}
    cases.append(("a season with no weeks", d, "weeks"))

    d = copy.deepcopy(good); d["built_at"] = "2099-01-01T00:00:00+00:00"
    cases.append(("a built_at in the future", d, "FUTURE"))

    d = copy.deepcopy(good); d["seasons"][0]["final_rosters"][0]["players"] = [None, None]
    cases.append(("null player ids", d, "null player"))

    ok = True
    for name, doc, want in cases:
        got = validate(doc)
        hit = any(want.lower() in g.lower() for g in got)
        print(f"  {'PASS' if hit else 'FAIL'}  refuses {name}")
        if not hit:
            ok = False
            print(f"        expected a problem mentioning {want!r}, got: {got or '[]'}")

    # AND THE OTHER DIRECTION: the untouched store must still be sound, or the
    # arms above could be passing because everything fails.
    print(f"  {'PASS' if not base else 'FAIL'}  accepts the real store unmodified")
    return 0 if ok else 1


def main() -> int:
    if "--self-check" in sys.argv:
        return _self_check()
    if not STORE.exists():
        print(f"REFUSING: {STORE} does not exist")
        return 1
    try:
        store = json.loads(STORE.read_text())
    except ValueError as e:
        print(f"REFUSING: {STORE.name} does not parse: {e}")
        return 1
    problems = validate(store)
    if problems:
        print(f"REFUSING to trust {STORE.name} — {len(problems)} problem(s):")
        for p in problems:
            print("   -", p)
        return 1
    seasons = [str(s.get("season")) for s in store.get("seasons") or []]
    print(f"league_history.json is sound: {len(seasons)} seasons {sorted(seasons)}, "
          f"built_at {store.get('built_at')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
