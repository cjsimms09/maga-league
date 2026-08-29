# TERRITORY: A
"""ungraded_season_leak — WHICH OF OUR COMMITTED NUMBERS ARE DILUTED BY A
SEASON NOBODY HAS PLAYED YET?

── THE INCIDENT ────────────────────────────────────────────────────────────

Register 419. `objective_dp.js` guarded its season loop with
`if (!season.weeks || !(season.drafts||[]).length) return;`. That held while
2026 carried no weeks. After the 08-22 draft the 2026 scaffolding landed
**18 weeks of zeros** — week 1 is 09-10, nothing has been played — and 2026
also has a 150-pick draft, so it walked through the guard and added TEN SEATS
THAT GRADE 0 FOR EVERY OWNER AND EVERY ARM. Every mean the tool reported was
diluted by exactly 30/40: +45.84/+29.33 became +34.38/+22.00, 0.75x to the
decimal.

The tool's own control A caught it and REFUSED to report. Nothing else would
have. **184 files in this repo read `league_history.json`**, and any of them
that tests a season for EXISTENCE rather than COMPLETENESS has the same bug
right now.

── WHY THIS IS DYNAMIC AND NOT A GREP ──────────────────────────────────────

A static sweep for the guard shape would be a heuristic over 184 files, and
this repo has been burned three times by hand sweeps that read as complete
(registers 95, 283, 23). The question is not "does this file look wrong", it
is "does this artifact's VALUE change when the unplayed season is removed" —
which is a measurement with a yes/no answer.

So: regenerate each registered artifact twice, once against the real
`league_history.json` and once against a copy with every INCOMPLETE season
stripped, and compare. An artifact that changes is contaminated. An artifact
that does not is clean, whatever its guard looks like.

⚠️ COMPLETENESS, NOT "SOMEBODY SCORED". A season qualifies only when EVERY
week it carries has been played. "Any week scored" is correct today and
becomes wrong on 2026-09-10, when a full-season grade would start running on
1 of 18 weeks — a subtler error than the zeros, arriving on a schedule with
nobody watching. Measured: 2023/2024/2025 carry 18 of 18 scored; 2026, 0.

⛔ Nothing is written into the repo. Both runs happen in throwaway git
worktrees (registers 58, 65, 109, 415).

Run: python3 draft/tools/ungraded_season_leak.py [--json PATH] [--id X]
     python3 draft/tools/ungraded_season_leak.py --self-test
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_artifact_freshness import (  # noqa: E402
    ROOT, REGISTRY_PATH, Sandbox, RegenerationError, regenerate,
    tolerant_equal, diff_paths, _strip_generation_time,
)

HISTORY_REL = "draft/data/league_history.json"


def is_complete_season(season: dict) -> bool:
    """Every week the season carries has somebody scoring in it."""
    weeks = list((season.get("weeks") or {}).values())
    if not weeks:
        return False
    return all(
        any(float((e or {}).get("points") or 0) > 0 for e in (entries or []))
        for entries in weeks
    )


def strip_incomplete(history: dict) -> tuple[dict, list]:
    """Return (history without incomplete seasons, the seasons removed)."""
    out = json.loads(json.dumps(history))
    kept, dropped = [], []
    for s in out.get("seasons", []):
        (kept if is_complete_season(s) else dropped).append(s)
    out["seasons"] = kept
    return out, [s.get("season") for s in dropped]


def reads_history(entry: dict) -> bool:
    """Only a generator that READS league_history can be contaminated by it.

    ⚠️ This narrows the RUN, never the VERDICT: an entry excluded here is
    reported as `not_applicable`, never as clean. "Did not check" and
    "checked and clean" must not look the same (rule 3e).
    """
    mod = ROOT / entry.get("owner_module", "")
    try:
        return "league_history" in mod.read_text(encoding="utf8", errors="replace")
    except OSError:
        return False


#: Run timestamps differ between the two arms by construction — they run
#: milliseconds apart — so comparing them would mark every stamped artifact
#: CONTAMINATED. `waiver_realized_level` writes plain `generated`, which
#: check_artifact_freshness does not strip (it only knows `_generated_at` /
#: `generated_at`), and it would have been a false positive here on the
#: timestamp alone. Its verdict rests on `joined: 734 vs 730` instead.
#: ⚠️ `built_at` stays UNSTRIPPED on purpose, exactly as in that module: a
#: changed `built_at` means an INPUT moved, which is signal, not noise.
RUN_TIME_KEYS = ("generated", "run_at", "ran_at")


def check(entry: dict, real: Sandbox, stripped: Sandbox) -> tuple[str, str]:
    try:
        a = regenerate(entry, cwd=real.path())
    except RegenerationError as e:
        return "ERROR", str(e)
    try:
        b = regenerate(entry, cwd=stripped.path())
    except RegenerationError as e:
        #: An artifact ABOUT the incomplete season legitimately cannot be built
        #: without it — `opponent_need_model.py:565` does
        #: `next(s for s in seasons if s["season"] == "2026")` and raises
        #: StopIteration. That is the generator being correct, not a defect,
        #: and calling it ERROR alongside a real crash would bury both.
        return "REQUIRES_IT", str(e).strip().splitlines()[-1][:160]
    a = _strip_generation_time(a, RUN_TIME_KEYS)
    b = _strip_generation_time(b, RUN_TIME_KEYS)
    if tolerant_equal(a, b):
        return "CLEAN", ""
    diffs = diff_paths(a, b)
    detail = "; ".join(f"{p}: with={x} without={y}" for p, x, y in diffs[:3])
    return "CONTAMINATED", detail


def self_test() -> int:
    passed = failed = 0

    def ck(name, ok, detail=None):
        nonlocal passed, failed
        if ok:
            passed += 1
            print(f"PASS  {name}")
        else:
            failed += 1
            print(f"FAIL  {name}" + (f"\n        {detail!r}"[:300] if detail is not None else ""))

    history = json.loads((ROOT / HISTORY_REL).read_text())
    seasons = {s["season"]: s for s in history["seasons"]}

    ck("C0 the live history has both shapes, so this test is not vacuous",
       any(is_complete_season(s) for s in seasons.values())
       and any(not is_complete_season(s) for s in seasons.values()),
       {k: is_complete_season(v) for k, v in seasons.items()})
    ck("  2026 is INCOMPLETE (18 weeks of zeros) and 2025 is complete",
       not is_complete_season(seasons["2026"]) and is_complete_season(seasons["2025"]))

    #: THE DATE TRAP, pinned as a test rather than as a comment. One scored
    #: week must NOT make a season count -- that is what breaks on 09-10.
    one_week = json.loads(json.dumps(seasons["2026"]))
    first = sorted(one_week["weeks"])[0]
    one_week["weeks"][first] = [{"points": 101.5}]
    ck("C1 KNOWN POSITIVE for the date trap — a season with ONE scored week of "
       "18 is still INCOMPLETE, which 'any week scored' would have passed",
       not is_complete_season(one_week))

    all_scored = json.loads(json.dumps(seasons["2026"]))
    for w in all_scored["weeks"]:
        all_scored["weeks"][w] = [{"points": 101.5}]
    ck("  and a season with EVERY week scored IS complete, so the predicate is "
       "not simply always-false", is_complete_season(all_scored))

    small, dropped = strip_incomplete(history)
    ck("C2 stripping removes exactly the incomplete seasons and keeps the rest",
       dropped == ["2026"] and len(small["seasons"]) == len(history["seasons"]) - 1,
       (dropped, len(small["seasons"])))

    #: C3 END-TO-END KNOWN POSITIVE: a command that reads the history and
    #: reports its season count must see a DIFFERENT number in the two
    #: sandboxes. If this passes, the stripping, the seeding and the
    #: comparison all work -- proven, not assumed.
    real, stripped_sb = Sandbox(), Sandbox()
    try:
        _seed_stripped(stripped_sb, small)
        counter = {"regenerate_command": [
            sys.executable, "-c",
            "import json;print(json.dumps({'n': len(json.load(open('"
            + HISTORY_REL + "'))['seasons'])}))"]}
        a = regenerate(counter, cwd=real.path())
        b = regenerate(counter, cwd=stripped_sb.path())
        ck("C3 KNOWN POSITIVE end-to-end — a probe that counts seasons sees 4 "
           "in the real sandbox and 3 in the stripped one",
           a == {"n": 4} and b == {"n": 3}, (a, b))

        blind = {"regenerate_command": [sys.executable, "-c",
                                        "import json;print(json.dumps({'n': 1}))"]}
        ck("  KNOWN NEGATIVE — a probe that ignores the history reports the same "
           "in both, so CLEAN is not what this tool says about everything",
           regenerate(blind, cwd=real.path()) == regenerate(blind, cwd=stripped_sb.path()))
    finally:
        real.close()
        stripped_sb.close()

    print(f"\n{passed}/{passed + failed} self-tests passed")
    return 1 if failed else 0


def _seed_stripped(sb: Sandbox, small: dict) -> None:
    """Write the stripped history into the sandbox, after it materialises."""
    (sb.path() / HISTORY_REL).write_text(json.dumps(small, indent=1))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", dest="out")
    ap.add_argument("--id", action="append", dest="ids", default=None)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()

    history = json.loads((ROOT / HISTORY_REL).read_text())
    small, dropped = strip_incomplete(history)
    if not dropped:
        print("Every season in league_history.json is COMPLETE — there is no "
              "ungraded season to leak, and this tool has nothing to measure "
              "today. That is a real answer, not a clean bill of health for "
              "the guards themselves.")
        return 0

    entries = json.loads(REGISTRY_PATH.read_text())["entries"]
    if args.ids:
        entries = [e for e in entries if e["id"] in set(args.ids)]

    print("UNGRADED-SEASON LEAK — which committed numbers move when a season "
          "nobody has played is removed?\n")
    print(f"  incomplete season(s) stripped: {', '.join(map(str, dropped))}")
    print(f"  {len(entries)} registry entries; only those whose owner_module reads "
          "league_history are RUN\n")

    real, stripped_sb = Sandbox(), Sandbox()
    rows = []
    try:
        _seed_stripped(stripped_sb, small)
        for e in entries:
            if not reads_history(e):
                rows.append({"id": e["id"], "status": "not_applicable",
                             "detail": "owner_module does not read league_history"})
                continue
            status, detail = check(e, real, stripped_sb)
            rows.append({"id": e["id"], "artifact_path": e["artifact_path"],
                         "status": status, "detail": detail})
            mark = {"CLEAN": "✅ clean", "CONTAMINATED": "🔴 CONTAMINATED",
                    "ERROR": "⚠️  errored",
                    "REQUIRES_IT": "🔵 is ABOUT that season"}[status]
            print(f"  {mark:18} {e['id']}")
            if detail:
                print(f"       {detail[:200]}")
    finally:
        real.close()
        stripped_sb.close()

    bad = [r for r in rows if r["status"] == "CONTAMINATED"]
    na = [r for r in rows if r["status"] == "not_applicable"]
    err = [r for r in rows if r["status"] == "ERROR"]
    req = [r for r in rows if r["status"] == "REQUIRES_IT"]
    print(f"\n  {len(bad)} contaminated · "
          f"{len(rows) - len(bad) - len(na) - len(err) - len(req)} clean · {len(err)} errored "
          f"· {len(req)} about that season by design · {len(na)} not applicable")
    print("\n  ⚠️  NOT-APPLICABLE IS NOT CLEAN. It means the generator does not read")
    print("      league_history at all, so this instrument cannot speak about it.")
    print("  ⚠️  A CONTAMINATED artifact is a number that is WRONG NOW, not one that")
    print("      might drift: it includes a season in which nobody has scored.")

    if args.out:
        Path(args.out).write_text(json.dumps({
            "_territory": "TERRITORY: A — draft/tools/ungraded_season_leak.py",
            "_answers": "register 419",
            "_note": "REPORT ONLY. Both arms run in throwaway git worktrees.",
            "stripped_seasons": dropped, "rows": rows,
            "contaminated": len(bad), "errored": len(err),
        }, indent=1) + "\n")
        print(f"\n  wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
