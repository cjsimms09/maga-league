# TERRITORY: C
"""Run a mutation and return a verdict that cannot be a false negative.

WHY THIS EXISTS. Mutation testing is the primary evidence in this lane — apply
the mutation first, write the assertion second, report the kill — and every such
claim rested on an ad-hoc shell function that decided the verdict by GREPPING
PYTEST'S OUTPUT. Today one of them lied.

A patch left an unbalanced parenthesis. The module stopped importing, pytest
reported a collection ERROR instead of a test failure, the grep for
`^FAILED|passed|failed` matched nothing, and the harness printed nothing at all.
Silence is indistinguishable from survival, and I nearly recorded it as one.

SIX WAYS A MUTATION RUN LIES, each refused here by name:

  INVALID_BASELINE    the suite was already red; its own failure is credited to
                      the mutation and every kill in the batch is unearned
  TARGET_NOT_FOUND    nothing was mutated, so the suite passes — which looks
                      exactly like a mutation the tests could not catch
  AMBIGUOUS_TARGET    the target appears more than once; the FIRST occurrence is
                      mutated, which need not be the line the caller meant
  INVALID_SYNTAX      the mutant does not compile; there is no test result at all
  INVALID_COLLECTION  tests disappeared, so fewer failures means fewer TESTS
  SURVIVED (wrong)    something unrelated broke and the kill is credited to an
                      assertion that never fired

KILLED requires ALL of: green baseline, target present AND UNIQUE, mutant
compiles, collection count unchanged, and THE NAMED TEST among the failures.
Anything else is SURVIVED or INVALID, and INVALID is never silently folded into
either.

The sixth was found by this gate failing me the way the shell function did: a
target that existed in two functions reported SURVIVED against a line it had not
touched. Every refusal in this list was added after a run lied in exactly that
way; none of them were anticipated.

`run_all` reports `all_killed` as False when any result is INVALID, because a
batch summary that counts an INVALID as a kill is the same lie one level up.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

#: Verdicts that mean "this run proved nothing" — never a kill, never a survival.
INVALID = ("INVALID_BASELINE", "TARGET_NOT_FOUND", "AMBIGUOUS_TARGET",
           "INVALID_SYNTAX", "INVALID_COLLECTION")

#: WHERE AN IN-FLIGHT MUTATION IS DECLARED, so that a run which is KILLED rather
#: than finished cannot leave a mutant behind in a working tree.
#:
#: THIS COST ME A COMMIT. A verification run was killed by a two-minute timeout.
#: SIGTERM terminates the interpreter without unwinding, so the `finally` that
#: restores the file never ran and `if s.get("row_count") != len(rows):` stayed on
#: disk as `if False:` — a FATAL integrity check silently disabled in the module
#: that guards the ADP archive. Two things then made it permanent rather than
#: obvious: the NEXT run read the mutant as the original and dutifully "restored"
#: to it, and a `git add -A` in another shell committed it.
#:
#: Deliberately OUTSIDE the repository. A marker inside the tree is one `git add
#: -A` away from being committed, which is the failure it exists to prevent. It
#: lives for the duration of one mutation and is removed on every exit path.
JOURNAL = Path(__import__("tempfile").gettempdir()) / "mutation_gate_inflight.json"


def _pid_alive(pid: int) -> bool:
    import os
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:      # alive, owned by somebody else
        return True
    except OSError:
        return False
    return True


def repair(journal=None) -> dict:
    """Restore a mutant abandoned by a run that was KILLED, and say so out loud.

    Called at the top of every `check`, so the repair happens before anything
    reads the file — the ordering is the whole point. Today's damage was not the
    abandoned mutant itself; it was the NEXT run reading the mutant as the
    original and restoring to it, which turned a temporary corruption into a
    permanent one that no later run could distinguish from real source.

    FOUR STATES, and only one of them writes:

      clean      no journal — nothing was in flight
      in_flight  the declaring process is STILL ALIVE. Two gate runs mutating the
                 same tree corrupt each other; this refuses to start rather than
                 racing, which is the other half of what happened today.
      repaired   the declaring process is gone and the file still holds exactly
                 the mutant it declared, byte for byte — so the original is put
                 back and the journal cleared.
      foreign    the process is gone but the file is NEITHER the mutant nor the
                 original. Somebody edited it in between. PRESERVE BEFORE YOU
                 ALARM: refuse to write, keep the journal, and name the file — an
                 automatic "restore" here would silently discard real work.
    """
    j = Path(journal or JOURNAL)
    if not j.exists():
        return {"status": "clean"}
    try:
        rec = json.loads(j.read_text())
    except (ValueError, OSError) as e:                              # noqa: BLE001
        return {"status": "foreign", "detail": "unreadable journal %s: %s" % (j, e)}

    if _pid_alive(rec.get("pid", -1)):
        return {"status": "in_flight", "pid": rec["pid"], "file": rec["file"],
                "detail": "another mutation run (pid %s) has %s mutated RIGHT NOW"
                          % (rec.get("pid"), rec.get("file"))}

    p = Path(rec["file"])
    now = p.read_text(encoding="utf-8") if p.exists() else None
    if now == rec["original"]:
        j.unlink()
        return {"status": "clean", "detail": "the killed run had already restored"}
    if now != rec["mutated"]:
        return {"status": "foreign", "file": rec["file"],
                "detail": "%s is neither the mutant nor the original — it was "
                          "edited after the run died. REFUSING to overwrite; the "
                          "journal is kept at %s and holds the original." % (p, j)}
    p.write_text(rec["original"], encoding="utf-8")
    _purge_pycache(str(p))
    j.unlink()
    return {"status": "repaired", "file": rec["file"],
            "detail": "restored %s — a previous run (pid %s) was killed while it "
                      "held a mutation" % (p, rec.get("pid"))}


def _declare(p: Path, original: str, mutated: str):
    """Write the journal and arm the signal handlers, THEN mutate. Never after.

    A journal written after the mutation leaves a window in which the file is
    corrupt and nothing on disk says so — which is precisely the window that a
    timeout kill lands in.

    SIGTERM and SIGINT are the ones that actually happen: a CI job cancelled, a
    harness timeout, a Ctrl-C. Both terminate without unwinding, so `finally`
    never runs; the handler restores and then re-raises the default so the
    process still dies the way the sender asked it to. SIGKILL cannot be caught
    at all, and that is what the journal is for.
    """
    import os
    import signal
    JOURNAL.write_text(json.dumps({
        "pid": os.getpid(), "file": str(p),
        "original": original, "mutated": mutated}))

    def _restore_and_die(signum, frame):                            # pragma: no cover
        try:
            p.write_text(original, encoding="utf-8")
            _purge_pycache(str(p))
            JOURNAL.unlink(missing_ok=True)
            sys.stderr.write("mutation_gate: caught signal %d — restored %s\n"
                             % (signum, p))
        finally:
            signal.signal(signum, signal.SIG_DFL)
            os.kill(os.getpid(), signum)

    prev = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            prev[sig] = signal.signal(sig, _restore_and_die)
        except (ValueError, OSError):
            # Not the main thread, or the platform will not have it. The journal
            # still covers this case on the next run.
            pass
    return prev


def _undeclare(prev):
    import signal
    for sig, handler in (prev or {}).items():
        try:
            signal.signal(sig, handler)
        except (ValueError, OSError):
            pass
    JOURNAL.unlink(missing_ok=True)


def _pytest(args, timeout=600):
    """Run pytest in a subprocess with BYTECODE CACHING OFF.

    THE GATE'S OWN TESTS CAUGHT THIS AND IT IS THE SAME DEFECT ONE LEVEL DOWN.
    Python validates a `.pyc` by (mtime, size). A mutation like `x * 2` -> `x * 3`
    changes NEITHER — same length, and written within the filesystem's mtime
    granularity — so the interpreter reuses the stale bytecode and runs the
    ORIGINAL code against the mutated source. The verdict comes back SURVIVED,
    and it is a lie of exactly the kind this module exists to refuse: a
    verification step that quietly did not run.

    `-p no:cacheprovider` is pytest's cache, which is a different thing and does
    not help. `PYTHONDONTWRITEBYTECODE` stops new writes; `_purge_pycache`
    removes anything already there.
    """
    import os
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    return subprocess.run([sys.executable, "-B", "-m", "pytest", *args, "-q",
                           "-p", "no:cacheprovider"],
                          capture_output=True, text=True, timeout=timeout, env=env)


def _purge_pycache(path: str):
    """Drop any cached bytecode for `path` — see `_pytest` for why it matters."""
    p = Path(path)
    cache = p.parent / "__pycache__"
    if cache.is_dir():
        for f in cache.glob(p.stem + ".*.pyc"):
            try:
                f.unlink()
            except OSError:
                pass


def _failed_names(stdout: str) -> list:
    """Test names pytest reported as FAILED, from the summary lines."""
    out = []
    for line in stdout.splitlines():
        m = re.match(r"^FAILED\s+(\S+)", line.strip())
        if m:
            out.append(m.group(1).split("::")[-1].split("[")[0])
    return out


def _collected(stdout: str):
    """How many tests pytest COLLECTED, or None if it never said.

    None matters and is not zero: a run that never reported a count cannot be
    compared against one that did, and treating the absence as zero would make
    every such run look like a total collapse.
    """
    m = re.search(r"(\d+)\s+tests?\s+collected", stdout) or \
        re.search(r"collected\s+(\d+)\s+items?", stdout)
    return int(m.group(1)) if m else None


def _collect_count(test_paths):
    """Ask pytest how many tests it can COLLECT, in its own dedicated run.

    THE GATE'S OWN TESTS CAUGHT THIS ONE TOO. The count was being scraped from
    the ordinary `-q` run — and `-q` prints no collection line at all, only dots
    and `18 passed`. So the count was None on BOTH sides, the comparison was
    skipped, and a mutation that made tests VANISH sailed through as a clean
    result. A guard that silently does not apply is worse than no guard, because
    the report still lists it.

    `--collect-only -q` ends with `N tests collected`, which is the number this
    guard is actually about. A collection ERROR yields no count, and None is
    returned rather than 0 so it reads as "could not ask", not "nothing there".
    """
    r = _pytest([*test_paths, "--collect-only"])
    return _collected(r.stdout)


def _compiles(path: str):
    try:
        compile(Path(path).read_text(encoding="utf-8"), path, "exec")
        return True, None
    except SyntaxError as e:
        return False, "the mutant does not compile: %s at line %s" % (e.msg, e.lineno)


def check(target_file: str, old: str, new: str, test_paths, must_fail,
          *, baseline=None) -> dict:
    """Apply one mutation, run the tests, restore, and return a verdict.

    `must_fail` is the assertion the mutation is CLAIMED to be caught by. Naming
    it is the point: without it, an unrelated breakage is credited as a kill and
    the record shows coverage that does not exist.
    """
    # BEFORE THE FILE IS READ, NOT AFTER. A mutant abandoned by a killed run is
    # recoverable right up until something reads it as the original — and the
    # thing that reads it as the original is this line. Repairing afterwards
    # would be restoring the file to the mutant.
    fixed = repair()
    if fixed["status"] == "in_flight":
        raise RuntimeError(
            "REFUSING TO START — %s. Two gate runs mutating one tree overwrite "
            "each other's restores, and the loser's mutant becomes permanent."
            % fixed["detail"])
    if fixed["status"] == "foreign":
        raise RuntimeError("REFUSING TO START — %s" % fixed["detail"])
    if fixed["status"] == "repaired":
        print("mutation_gate: %s" % fixed["detail"])

    p = Path(target_file)
    src = p.read_text(encoding="utf-8")
    must = [must_fail] if isinstance(must_fail, str) else list(must_fail)
    res = {"file": str(p), "old": old[:80], "old_full": old, "new": new,
           "must_fail": must,
           "verdict": None, "detail": None, "failed": [],
           "collected_before": None, "collected_after": None}

    if old not in src:
        # NOTHING WAS MUTATED. The suite will pass, and a pass here is
        # indistinguishable from a mutation the tests could not catch.
        return dict(res, verdict="TARGET_NOT_FOUND",
                    detail="the target string is not present in %s — nothing was "
                           "mutated, so a green suite proves nothing" % p.name)

    n_sites = src.count(old)
    if n_sites > 1:
        # THE SIXTH LIE, and the one this gate shipped with. `replace(old, new, 1)`
        # takes the FIRST occurrence, which need not be the one the caller meant.
        # Found live: a target present in both `record` and `verify_manifest`
        # mutated `record`, left the intended line untouched, still compiled, the
        # named test correctly passed, and the verdict came back SURVIVED — a
        # coverage hole reported against a line that was never touched. SURVIVED is
        # the actionable verdict, so this sends you to write a test for a gap that
        # does not exist. The mirror case is worse: an ambiguous target that
        # happens to kill gets RECORDED, and the weekly job re-applies it to the
        # wrong site forever. A mutation whose location is ambiguous is not
        # evidence in either direction. Disambiguate by extending the target with
        # a neighbouring line.
        return dict(res, verdict="AMBIGUOUS_TARGET",
                    detail="the target string appears %d times in %s — "
                           "replace(…, 1) would mutate the first occurrence, which "
                           "is not necessarily the intended one; extend the target "
                           "until it is unique" % (n_sites, p.name))

    # BASELINE FIRST, ALWAYS. A suite that is already red credits its own failure
    # to the mutation, and every kill measured against it is unearned.
    if baseline is None:
        b = _pytest([*test_paths])
        baseline = {"failed": _failed_names(b.stdout),
                    "collected": _collect_count(test_paths), "rc": b.returncode}
    res["collected_before"] = baseline.get("collected")
    if baseline.get("failed"):
        return dict(res, verdict="INVALID_BASELINE",
                    detail="the suite is ALREADY RED before mutating: %s"
                           % ", ".join(baseline["failed"][:6]))

    mutated = src.replace(old, new, 1)
    prev = _declare(p, src, mutated)     # journal + signal handlers FIRST
    try:
        p.write_text(mutated, encoding="utf-8")
        _purge_pycache(str(p))

        ok, why = _compiles(str(p))
        if not ok:
            # THE ONE THAT LIED. pytest reports a collection error, a grep for
            # FAILED matches nothing, and the silence reads as survival.
            return dict(res, verdict="INVALID_SYNTAX", detail=why)

        r = _pytest([*test_paths])
        res["failed"] = _failed_names(r.stdout)
        res["collected_after"] = _collect_count(test_paths)

        if (res["collected_before"] is not None
                and res["collected_after"] is not None
                and res["collected_after"] != res["collected_before"]):
            # FEWER FAILURES BECAUSE THERE ARE FEWER TESTS IS NOT BETTER CODE.
            return dict(res, verdict="INVALID_COLLECTION",
                        detail="collected %d tests before the mutation and %d after "
                               "— tests vanished rather than failed"
                               % (res["collected_before"], res["collected_after"]))

        hit = [t for t in must if t in res["failed"]]
        if hit:
            return dict(res, verdict="KILLED",
                        detail="killed by %s" % ", ".join(hit))
        return dict(res, verdict="SURVIVED",
                    detail="%s did not fail (failures: %s)"
                           % (", ".join(must), ", ".join(res["failed"]) or "none"))
    finally:
        # RESTORED ON EVERY PATH, including the ones that raise. A gate that
        # leaves a mutant on disk poisons every later check in the session — and
        # so does a stale .pyc of the mutant, which outlives the source.
        #
        # `finally` covers every path the interpreter UNWINDS. It does not cover
        # the paths where the interpreter is stopped: a timeout, a cancelled CI
        # job, a Ctrl-C, a kill. Those are what `_declare` arms handlers and a
        # journal for, and they are not hypothetical — one of them disabled a
        # FATAL check in the ADP module and I committed it.
        p.write_text(src, encoding="utf-8")
        _purge_pycache(str(p))
        _undeclare(prev)


def run_all(target_file: str, mutations, test_paths) -> dict:
    """`[(old, new, must_fail), ...]` -> per-mutation verdicts plus a summary.

    One call per claim, so "9 mutations, 9 kills" becomes a machine's statement
    rather than mine. `all_killed` is False if ANY result is INVALID: a summary
    that folds an INVALID into a kill is the same lie one level up.
    """
    b = _pytest([*test_paths])
    baseline = {"failed": _failed_names(b.stdout),
                "collected": _collect_count(test_paths), "rc": b.returncode}
    results = [check(target_file, old, new, test_paths, must, baseline=baseline)
               for old, new, must in mutations]
    killed = sum(1 for r in results if r["verdict"] == "KILLED")
    invalid = sum(1 for r in results if r["verdict"] in INVALID)
    return {"results": results, "killed": killed, "invalid": invalid,
            "survived": sum(1 for r in results if r["verdict"] == "SURVIVED"),
            # `bool(results)` IS THE POINT, not defensive noise. `all()` over an
            # empty list is True, so a batch that ran NO mutations would report
            # all_killed — the green tick that verified nothing, the same defect
            # as an empty manifest passing `verify_manifest`, one level up and
            # feeding `record`. The earlier form was `killed == len(results) and
            # invalid == 0`; the second conjunct is implied by the first (KILLED
            # is not in INVALID) and so could never be killed by any test, while
            # the case that actually bites went unguarded.
            "all_killed": bool(results) and all(
                r["verdict"] == "KILLED" for r in results),
            "baseline_green": not baseline["failed"]}


#: Where verified kills are recorded. A kill claimed only in a commit message
#: cannot be re-checked, so it does not become wrong loudly — it becomes wrong
#: SILENTLY, the day somebody weakens the assertion it was credited to.
MANIFEST = str(Path(__file__).resolve().parent / "mutation_manifest.json")


def record(module: str, tests, results, path: str = None) -> dict:
    """File verified kills against a module, replacing that module's entry.

    REFUSES ANYTHING BUT A KILL. A SURVIVED is a coverage HOLE and an INVALID
    proved nothing; either one sitting in the record as evidence is precisely the
    lie this module was built to refuse, preserved in a file where it outlives the
    session that produced it. The standing test asserts the same thing, but a
    recorder that files whatever it is handed makes that test a formality — it
    would be failing on data the recorder itself created.
    """
    path = path or MANIFEST
    if not results:
        # NO EVIDENCE IS NOT CLEAN EVIDENCE. The refusal below scans the results
        # for a non-kill, and an empty list has none — so this would file the
        # module with `"mutations": []`, which reads downstream as "covered" and
        # re-verifies instantly and forever. `verify_manifest` would count it as
        # zero checks and, before today, still have exited green.
        raise ValueError(
            "refusing to record %s with NO results: an empty mutation list is "
            "not a clean bill of health, it is an unwritten test" % module)
    bad = [r for r in results if r.get("verdict") != "KILLED"]
    if bad:
        raise ValueError(
            "refusing to record %d non-KILLED verdict(s) as evidence: %s"
            % (len(bad), [(r.get("verdict"), r.get("must_fail")) for r in bad]))
    p = Path(path)
    doc = json.loads(p.read_text()) if p.exists() else {
        "_territory": "TERRITORY: C — written by draft/backtest/mutation_gate.record",
        "_note": ("Verified mutation kills. Each entry is a mutation that was APPLIED "
                  "and whose NAMED test failed, with a green baseline and an unchanged "
                  "collection count. draft/tests/test_mutation_manifest.py checks these "
                  "cheaply on every run; re-running them for real is run_all()."),
        "version": 1, "modules": {}}
    doc["modules"][module] = {
        "tests": list(tests),
        "mutations": [{"old": r["old_full"] if "old_full" in r else r["old"],
                       "new": r.get("new", ""), "must_fail": r["must_fail"],
                       "verdict": r["verdict"]} for r in results]}
    p.write_text(json.dumps(doc, indent=1))
    return doc


def verify_manifest(path: str = None, root: str = None) -> dict:
    """RE-RUN every recorded mutation. The only check that catches a hollowed test.

    The cheap standing checks in `test_mutation_manifest.py` guard NAMES — a test
    deleted, a verdict that was never a kill, a target that has been refactored
    away. None of them sees the subtler regression: a test kept at the same name
    whose assertions were weakened until they no longer fail. For that the
    mutation has to actually be re-applied, which is too slow for per-commit CI
    and is why this runs on a schedule.

    It NAMES what regressed. A weekly job reporting "21 of 22" sends the reader to
    diff 22 entries by hand, and a scheduled check that costs an afternoon to read
    is a scheduled check that stops being read.

    AND IT SORTS THEM BY WHAT THE READER HAS TO DO. Every non-kill used to land in
    one list called `regressed`, under one sentence — "the test no longer fails
    when its mutation is applied". That is true of exactly one of the three
    things that can happen, and it is the wrong instruction for the other two:

      regressed     SURVIVED. The assertion was weakened while keeping its name.
                    THE FAILURE THIS JOB EXISTS FOR. Fix: restore the assertion.
      stale         TARGET_NOT_FOUND / AMBIGUOUS_TARGET / INVALID_SYNTAX. The
                    entry no longer names exactly one line of the current source,
                    or no longer applies cleanly to it. Nothing is wrong with the
                    test. Fix: re-run the gate and update the manifest.
      unverifiable  INVALID_BASELINE / INVALID_COLLECTION. Nothing could be
                    measured at all — the tree was red, or tests vanished. Every
                    other verdict in the same run is suspect. Fix the tree first.

    All three fail the job. Telling them apart is what stops a reader hunting a
    weakened assertion that does not exist.
    """
    import os
    stale_verdicts = ("TARGET_NOT_FOUND", "AMBIGUOUS_TARGET", "INVALID_SYNTAX")
    p = Path(path or MANIFEST)
    doc = json.loads(p.read_text())
    base = Path(root) if root else Path(__file__).resolve().parent.parent.parent
    out = {"checked": 0, "killed": 0, "regressed": [], "stale": [],
           "unverifiable": [], "all_killed": None}
    for mod, m in doc["modules"].items():
        target = mod if os.path.isabs(mod) else str(base / mod)
        tests = [t if os.path.isabs(t) else str(base / t) for t in m["tests"]]
        for mut in m["mutations"]:
            r = check(target, mut["old"], mut["new"], tests, mut["must_fail"])
            out["checked"] += 1
            if r["verdict"] == "KILLED":
                out["killed"] += 1
                continue
            entry = {"module": mod, "must_fail": mut["must_fail"],
                     "verdict": r["verdict"], "detail": r["detail"]}
            bucket = ("stale" if r["verdict"] in stale_verdicts
                      else "unverifiable" if r["verdict"] in INVALID
                      else "regressed")
            out[bucket].append(entry)
    # `checked > 0` refuses the manifest that could not be read: an empty run has
    # nothing in any bucket, and without this the job goes green having verified
    # nothing. That exact exit condition shipped once.
    out["all_killed"] = out["checked"] > 0 and out["killed"] == out["checked"]
    return out
