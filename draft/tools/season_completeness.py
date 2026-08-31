# TERRITORY: A
"""ONE ANSWER TO "HAS THIS SEASON ACTUALLY BEEN PLAYED?" — the Python side.

`draft/tools/season_completeness.js` is the JavaScript side. Two languages
need the predicate, so there are two implementations and that is a risk, not
a design: `draft/tests/test_season_completeness_agrees.py` asserts they give
the SAME answer for every season in the live `league_history.json`, so a
divergence is a red test rather than two tools quietly disagreeing about
which seasons count.

── WHY IT EXISTS (register 419) ────────────────────────────────────────────

`objective_dp.js` guarded its season loop with `if (!season.weeks || ...)`.
That held while 2026 carried no weeks. After the 08-22 draft the scaffolding
landed EIGHTEEN WEEKS OF ZEROS — week 1 is 09-10 — and 2026 also has a
150-pick draft, so it walked through and added ten seats grading 0 for every
owner and every arm, diluting every mean by exactly 30/40.

Register 420 then found the same shape in `exp25_deadzone.load_picks()`,
which is shared by three studies: it loops `for s in hist["seasons"]` with no
guard and attaches `realized` points per season, so every 2026 pick enters
carrying a realized value of 0.0.

── THE PREDICATE IS "COMPLETE", AND THE DIFFERENCE IS A DATE ───────────────

⚠️ The obvious version asks whether ANY week has realized points. That is
correct today and becomes WRONG ON 2026-09-10, when week 1 is played: 2026
would satisfy it and enter a full-season measurement on 1 of 18 weeks — a
subtler error than the zeros, arriving on a schedule with nobody watching. A
season qualifies only when EVERY week it carries has been played.

Measured 2026-08-29: 2023, 2024 and 2025 carry 18 of 18 scored weeks; 2026
carries 0 of 18.

⛔ THIS IS FOR MEASUREMENTS THAT NEED REALIZED OUTCOMES. A study that reads
only DRAFT PICKS should NOT use it — the 2026 draft really happened on 08-22
and is legitimate evidence of how owners draft. `opponent_profiles.py` is
exactly that case and is deliberately left alone. Filtering is not always the
right answer; knowing is.

Run: python3 draft/tools/season_completeness.py   (self-test)
"""
from __future__ import annotations

from typing import Any


def is_complete_season(season: Any) -> bool:
    """Every week the season carries has somebody scoring in it."""
    weeks = list(((season or {}).get("weeks") or {}).values())
    if not weeks:
        return False
    return all(
        any(float((e or {}).get("points") or 0) > 0 for e in (entries or []))
        for entries in weeks
    )


def split_by_completeness(seasons) -> tuple[list, list]:
    """(complete, incomplete). Returns both so the caller can ANNOUNCE the
    exclusion rather than drop it silently — an exclusion nobody can see is
    the defect register 419 was built out of."""
    complete, incomplete = [], []
    for s in seasons or []:
        (complete if is_complete_season(s) else incomplete).append(s)
    return complete, incomplete


def _self_test() -> int:
    import json
    import pathlib

    passed = failed = 0

    def ck(name, ok, detail=None):
        nonlocal passed, failed
        if ok:
            passed += 1
            print(f"PASS  {name}")
        else:
            failed += 1
            print(f"FAIL  {name}" + (f"\n        {detail!r}"[:240] if detail is not None else ""))

    def scored(n):
        return {"weeks": {str(i): [{"points": 101.5}] for i in range(1, n + 1)}}

    def zeros(n):
        return {"weeks": {str(i): [{"points": 0}] for i in range(1, n + 1)}}

    ck("KNOWN NEGATIVE — 18 weeks of ZEROS is not a played season (the 2026 shape)",
       is_complete_season(zeros(18)) is False)
    ck("KNOWN POSITIVE — 18 weeks all scored IS (the 2023-25 shape)",
       is_complete_season(scored(18)) is True)

    one = zeros(18)
    one["weeks"]["1"] = [{"points": 101.5}]
    ck("⭐ ONE scored week of 18 is still INCOMPLETE — the assertion that stops "
       "09-10 from silently re-opening register 419", is_complete_season(one) is False)

    ck("no weeks at all is incomplete", is_complete_season({"weeks": {}}) is False)
    ck("a missing weeks key does not raise", is_complete_season({}) is False)
    ck("None does not raise", is_complete_season(None) is False)
    ck("a week whose entries are None does not raise and is incomplete",
       is_complete_season({"weeks": {"1": None}}) is False)

    c, i = split_by_completeness([scored(18), zeros(18), scored(18)])
    ck("split_by_completeness partitions and loses nothing", len(c) == 2 and len(i) == 1)

    root = pathlib.Path(__file__).resolve().parent.parent.parent
    try:
        hist = json.loads((root / "draft" / "data" / "league_history.json").read_text())
        got = {s["season"]: is_complete_season(s) for s in hist["seasons"]}
        ck("AGAINST THE LIVE FILE — 2023/2024/2025 complete, 2026 not",
           got.get("2023") and got.get("2024") and got.get("2025")
           and got.get("2026") is False, got)
    except OSError as e:
        ck("AGAINST THE LIVE FILE — league_history.json readable", False, str(e))

    print(f"\n{passed}/{passed + failed} self-tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_self_test())
