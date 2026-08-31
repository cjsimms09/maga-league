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


#: ONE predicate, imported rather than restated — register 408's lesson, and
#: `test_season_completeness_agrees.py` pins the Python module against the
#: JavaScript one on the live history so the two cannot drift apart.
from season_completeness import is_complete_season  # noqa: E402


def _week_was_played(entries) -> bool:
    return any(float((e or {}).get("points") or 0) > 0 for e in (entries or []))


def strip_incomplete(history: dict, mode: str = "weeks") -> tuple[dict, list]:
    """Return (history with the unplayed data removed, what was removed).

    ── TWO MODES, AND `weeks` IS THE DEFAULT (register 423) ────────────────

    `whole` drops every incomplete SEASON. That was this tool's only mode and
    it CONFLATES TWO CAUSES — the distinction is D's, from
    `league_history_contamination_sweep.py`, and it is better than mine: the
    2026 season carries a REAL COMPLETED DRAFT *and* 180 zero owner-weeks, so
    dropping the season also removes a legitimate draft record. A study that
    reads only picks then "changes" for a reason that is entirely the
    counterfactual's fault, and I papered over that with a hand-declared
    per-entry exemption (register 420, `opponent_profiles`).

    `weeks` keeps the season and removes only the weeks nobody has played. The
    zeros — the thing that actually contaminates a mean — are gone; the draft
    record survives. A picks-only study comes back CLEAN with no declaration
    at all, which is the exemption made STRUCTURAL instead of asserted.

    `whole` stays available because it is the stronger counterfactual: it
    answers "does this season reach the number AT ALL", which is the right
    question when the suspicion is about the draft record rather than the
    points.
    """
    out = json.loads(json.dumps(history))
    if mode == "whole":
        kept, dropped = [], []
        for s in out.get("seasons", []):
            (kept if is_complete_season(s) else dropped).append(s)
        out["seasons"] = kept
        return out, [s.get("season") for s in dropped]

    removed = []
    for s in out.get("seasons", []):
        weeks = s.get("weeks") or {}
        gone = [w for w, entries in weeks.items() if not _week_was_played(entries)]
        for w in gone:
            del weeks[w]
        if gone:
            removed.append(f"{s.get('season')}:{len(gone)}wk")
    return out, removed


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

    #: ⚠️ THE DETERMINISM CONTROL, AND IT EARNED ITS PLACE IMMEDIATELY.
    #: This tool compares two SEPARATE RUNS, so a study that does not
    #: reproduce itself will differ for reasons that have nothing to do with
    #: the stripped season — and it will differ in exactly the way real
    #: contamination looks. `exp_inverse_adjuster.py` was reported
    #: CONTAMINATED on `per_season.2024.rounds[2].top3[2].value_rank`; run
    #: TWICE IN THE SAME SANDBOX it moves on the same field. The finding was
    #: mine, not the data's. So the real arm runs twice and disagreement with
    #: itself is reported as its own verdict, never as contamination.
    try:
        a2 = regenerate(entry, cwd=real.path())
    except RegenerationError as e:
        return "ERROR", "second run of the determinism control failed: " + str(e)
    a_s = _strip_generation_time(a, RUN_TIME_KEYS)
    if not tolerant_equal(a_s, _strip_generation_time(a2, RUN_TIME_KEYS)):
        d = diff_paths(a_s, _strip_generation_time(a2, RUN_TIME_KEYS))
        return "NONDETERMINISTIC", "; ".join(
            f"{p}: run1={x} run2={y}" for p, x, y in d[:3])

    try:
        b = regenerate(entry, cwd=stripped.path())
    except RegenerationError as e:
        #: An artifact ABOUT the incomplete season legitimately cannot be built
        #: without it — `opponent_need_model.py:565` does
        #: `next(s for s in seasons if s["season"] == "2026")` and raises
        #: StopIteration. That is the generator being correct, not a defect,
        #: and calling it ERROR alongside a real crash would bury both.
        return "REQUIRES_IT", str(e).strip().splitlines()[-1][:160]
    a = a_s
    b = _strip_generation_time(b, RUN_TIME_KEYS)
    if tolerant_equal(a, b):
        return "CLEAN", ""
    diffs = diff_paths(a, b)
    detail = "; ".join(f"{p}: with={x} without={y}" for p, x, y in diffs[:3])

    #: ── AN EXEMPTION MUST BE DECLARED, NEVER INFERRED ─────────────────────
    #: Some studies read ONLY DRAFT PICKS. The 2026 draft really happened on
    #: 08-22, so for those the incomplete season is evidence, not
    #: contamination — `opponent_profiles.py` profiles how owners draft and
    #: contains no reference to points or weeks at all. Without this the tool
    #: would flag a CORRECT study red on every run forever, which is the
    #: "a guard that fires on ordinary work is a guard people delete" failure
    #: register 388 names and register 417 watched kill an alarm outright.
    #:
    #: ⚠️ It is opt-in per entry and carries a REASON, so an exemption is a
    #: recorded decision rather than a silence. The tool still MEASURES the
    #: difference and still prints it — what changes is the verdict, not the
    #: evidence. Register 420.
    if entry.get("incomplete_seasons_are_intended"):
        why = entry.get("incomplete_seasons_reason") or "no reason recorded — add one"
        return "BY_DESIGN", why + "  ·  differs at: " + detail[:160]
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

    small, dropped = strip_incomplete(history, "whole")
    ck("C2 WHOLE mode removes exactly the incomplete seasons and keeps the rest",
       dropped == ["2026"] and len(small["seasons"]) == len(history["seasons"]) - 1,
       (dropped, len(small["seasons"])))

    #: C2b — the mode this tool now DEFAULTS to (register 423). The season
    #: survives, carrying its real draft; only the unplayed weeks go.
    wk, wdrop = strip_incomplete(history, "weeks")
    wseasons = {x["season"]: x for x in wk["seasons"]}
    ck("C2b WEEKS mode keeps EVERY season — the 2026 draft record survives",
       len(wk["seasons"]) == len(history["seasons"]) and "2026" in wseasons,
       [x["season"] for x in wk["seasons"]])
    ck("  and strips 2026's unplayed weeks to nothing while 2025 keeps all 18",
       len(wseasons["2026"].get("weeks") or {}) == 0
       and len(wseasons["2025"].get("weeks") or {}) == 18,
       (len(wseasons["2026"].get("weeks") or {}),
        len(wseasons["2025"].get("weeks") or {}), wdrop))
    ck("  and the DRAFT is untouched, which is the whole reason for this mode",
       len(((wseasons["2026"].get("drafts") or [{}])[0]).get("picks") or [])
       == len((([x for x in history["seasons"] if x["season"] == "2026"][0]
                .get("drafts") or [{}])[0]).get("picks") or []))

    #: C3 END-TO-END KNOWN POSITIVE: a command that reads the history and
    #: reports its season count must see a DIFFERENT number in the two
    #: sandboxes. If this passes, the stripping, the seeding and the
    #: comparison all work -- proven, not assumed.
    real, stripped_sb = Sandbox(), Sandbox()
    try:
        _seed_stripped(stripped_sb, wk)
        counter = {"regenerate_command": [
            sys.executable, "-c",
            "import json;print(json.dumps({'n': len(json.load(open('"
            + HISTORY_REL + "'))['seasons'])}))"]}
        a = regenerate(counter, cwd=real.path())
        b = regenerate(counter, cwd=stripped_sb.path())
        ck("C3 KNOWN POSITIVE end-to-end — a probe that counts seasons sees 4 "
           "in the real sandbox and 4 in the WEEKS-stripped one, because the "
           "season survives; only its unplayed weeks are gone",
           a == {"n": 4} and b == {"n": 4}, (a, b))

        #: C3b THE KNOWN POSITIVE FOR THE NEW DEFAULT. C3 above now asserts the
        #: season count is UNCHANGED, which is the point of weeks mode but is a
        #: negative — on its own it cannot tell "the strip worked and seasons
        #: survive" from "the strip did nothing". A probe counting WEEKS must
        #: move: 4x18 = 72 real, 54 with 2026's unplayed 18 gone.
        weekcount = {"regenerate_command": [
            sys.executable, "-c",
            "import json;h=json.load(open('" + HISTORY_REL + "'));"
            "print(json.dumps({'w': sum(len(s.get('weeks') or {}) "
            "for s in h['seasons'])}))"]}
        wa = regenerate(weekcount, cwd=real.path())
        wb = regenerate(weekcount, cwd=stripped_sb.path())
        ck("C3b KNOWN POSITIVE for WEEKS mode — a probe counting weeks sees 72 "
           "in the real sandbox and 54 in the stripped one, so the strip did "
           "something even though the season count did not move",
           wa == {"w": 72} and wb == {"w": 54}, (wa, wb))

        blind = {"regenerate_command": [sys.executable, "-c",
                                        "import json;print(json.dumps({'n': 1}))"]}
        ck("  KNOWN NEGATIVE — a probe that ignores the history reports the same "
           "in both, so CLEAN is not what this tool says about everything",
           regenerate(blind, cwd=real.path()) == regenerate(blind, cwd=stripped_sb.path()))

        #: C4 KNOWN POSITIVE for the DETERMINISM CONTROL. Without this, a
        #: study that disagrees with itself reads as CONTAMINATED -- which is
        #: exactly what exp_inverse_adjuster did, and the finding was mine
        #: rather than the data's.
        flaky = {"artifact_path": "draft/data/_leak_flaky_probe.json",
                 "regenerate_writes_artifact": True,
                 "regenerate_command": [
                     sys.executable, "-c",
                     "import json,random,pathlib;pathlib.Path("
                     "'draft/data/_leak_flaky_probe.json').write_text("
                     "json.dumps({'n': random.random()}))"]}
        st, _ = check(flaky, real, stripped_sb)
        ck("C4 KNOWN POSITIVE — a study that disagrees with ITSELF is reported "
           "NONDETERMINISTIC, never CONTAMINATED", st == "NONDETERMINISTIC", st)

        steady = dict(flaky, regenerate_command=[
            sys.executable, "-c",
            "import json,pathlib;pathlib.Path("
            "'draft/data/_leak_flaky_probe.json').write_text(json.dumps({'n': 1}))"])
        st2, _ = check(steady, real, stripped_sb)
        ck("  KNOWN NEGATIVE — a steady study that ignores the history is CLEAN, "
           "so the control does not simply label everything unreproducible",
           st2 == "CLEAN", st2)
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
    ap.add_argument("--mode", choices=("weeks", "whole"), default="weeks",
                    help="weeks (default): keep the season, drop only unplayed "
                         "weeks. whole: drop the incomplete season entirely — the "
                         "stronger counterfactual, but it also removes a real "
                         "draft record (register 423).")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()

    history = json.loads((ROOT / HISTORY_REL).read_text())
    small, dropped = strip_incomplete(history, args.mode)
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
    print(f"  mode: {args.mode}  ·  stripped: {', '.join(map(str, dropped))}")
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
                    "REQUIRES_IT": "🔵 is ABOUT that season",
                    "NONDETERMINISTIC": "🟣 NOT REPRODUCIBLE",
                    "BY_DESIGN": "🔵 INCLUDES IT ON PURPOSE"}[status]
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
    nd = [r for r in rows if r["status"] == "NONDETERMINISTIC"]
    bd = [r for r in rows if r["status"] == "BY_DESIGN"]
    print(f"\n  {len(bad)} contaminated · "
          f"{len(rows) - len(bad) - len(na) - len(err) - len(req) - len(nd) - len(bd)} clean · "
          f"{len(err)} errored · {len(nd)} not reproducible · {len(bd)} by design · "
          f"{len(req)} about that season by design · {len(na)} not applicable")
    if nd:
        print("\n  🟣 A NOT-REPRODUCIBLE study cannot be judged by this instrument at all:")
        print("      it disagrees with ITSELF between two runs in the same sandbox, so any")
        print("      difference across the two arms is unattributable. That is its own")
        print("      defect and it is louder than staleness — a committed artifact nobody")
        print("      can reproduce. Register 420.")
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
