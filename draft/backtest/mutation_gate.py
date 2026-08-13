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

FIVE WAYS A MUTATION RUN LIES, each refused here by name:

  INVALID_BASELINE    the suite was already red; its own failure is credited to
                      the mutation and every kill in the batch is unearned
  TARGET_NOT_FOUND    nothing was mutated, so the suite passes — which looks
                      exactly like a mutation the tests could not catch
  INVALID_SYNTAX      the mutant does not compile; there is no test result at all
  INVALID_COLLECTION  tests disappeared, so fewer failures means fewer TESTS
  SURVIVED (wrong)    something unrelated broke and the kill is credited to an
                      assertion that never fired

KILLED requires ALL of: green baseline, target present, mutant compiles,
collection count unchanged, and THE NAMED TEST among the failures. Anything else
is SURVIVED or INVALID, and INVALID is never silently folded into either.

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
INVALID = ("INVALID_BASELINE", "TARGET_NOT_FOUND", "INVALID_SYNTAX",
           "INVALID_COLLECTION")


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

    try:
        p.write_text(src.replace(old, new, 1), encoding="utf-8")
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
        p.write_text(src, encoding="utf-8")
        _purge_pycache(str(p))


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
            "all_killed": killed == len(results) and invalid == 0,
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
