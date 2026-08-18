#!/usr/bin/env python3
# TERRITORY: relay — every lane's gates, none of their code. This reads tests and
# gate tools only, and it never edits anything.
"""WHICH OF OUR CHECKS CANNOT FAIL, AND ARE REPORTED AS CHECKS THAT PASSED?

── WHY THIS EXISTS, AND WHY IT IS DIFFERENT FROM EVERY OTHER TOOL HERE ────────

`PREDICTION-LEDGER.md` P69, filed 2026-08-18:

    "The gate that catches a defect class is written AFTER an instance of it,
    never before ... Graded FALSE if between now and 08-22 a gate lands that was
    written from the PATTERN rather than from a fresh instance."

This is that gate. Nothing failed to prompt it. Four separate instances of ONE
shape turned up in a single day, which is a rate rather than a run of bad luck:

  · the Kalshi probe returned six false nulls and printed each as an answer;
  · `intervention_rate.js` scored a pool that had gone empty;
  · `prediction_ledger_check.js` collected ids into `seen` and never compared
    them, so two rows sharing an id printed "none overdue";
  · `test_defect_register.py` iterated rows and never compared ids either.

**THE SHAPE, stated once:** a check asserts that a suspicious set is EMPTY, and
nothing anywhere proves the check ever looks at a non-empty set. `assert not
problems` passes just as cheerfully when `problems` could not have been populated
— when the glob matched no files, the filter matched no rows, the regex stopped
matching after a rename. Green, and meaningless.

**THE CURE THIS PROJECT ALREADY BELIEVES IN** is the known-positive control, and
several suites carry one by name: *"CONTROL — the detector is not merely finding
nothing everywhere"*. This tool asks which suites DON'T.

── WHAT IT REPORTS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────

For each test function it finds an emptiness assertion in, it asks whether the
same function (or its module, for shared helpers) ever asserts that something is
NON-empty. If not, the function is reported.

**IT PROPOSES QUESTIONS, IT DOES NOT JUDGE** — the same rule `prior_art.py` and
`stale_blockers.py` follow. Plenty of hits will be fine: a test with a hand-built
fixture two lines above cannot be vacuous, and no static rule can see that. The
output is a reading list, and the count is a ratchet, not a verdict.

Run:  python3 draft/tools/vacuous_check_scan.py
      python3 draft/tools/vacuous_check_scan.py --list
"""
from __future__ import annotations

import argparse
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY_DIRS = ("draft/tests",)
JS_DIRS = ("draft/tests", "draft/tools")

#: `assert not X`, `assert X == []`, `assert len(X) == 0`, `assertEqual(X, [])`.
#: The claim "nothing bad was found", which is the half that can go vacuous.
EMPTY_ASSERT = re.compile(
    r"assert\s+not\s+\w|assert\s+\w+\s*==\s*(\[\]|\{\}|0\b)|"
    r"assert\s+len\(\s*\w+\s*\)\s*==\s*0|assertEqual\([^,]+,\s*\[\]\)|"
    r"deepStrictEqual\([^,]+,\s*\[\]\)|strictEqual\([^,]+\.length,\s*0\)")

#: The antidote: any claim that something is NON-empty, i.e. the check has teeth.
#:
#: ⚠️ I REWROTE THIS TO FIX A SLOWDOWN AND IT WAS NOT THE CAUSE — corrected here
#: rather than left standing, because an unchecked sentence in a comment is how
#: this project's last four bad days started.
#:
#: The scan took 43 seconds. I guessed a re-split inside a loop (fixed it; no
#: change), then guessed catastrophic backtracking in the old version of THIS
#: pattern — `assert\s+\w+[^\n]*\b(>=?|>)\s*[1-9]`, an unbounded wildcard inside
#: an alternation, which certainly looks like the culprit — rewrote it, and the
#: number did not move either. **cProfile then said 42.7 of the 43 seconds were in
#: `ast._splitlines_no_ff`**, called 517 times by `ast.get_source_segment`. See
#: `_seg` below. Two plausible diagnoses, both wrong, neither cheap to unlearn.
#:
#: The rewrite is kept anyway — these alternatives are simpler and cannot backtrack
#: — but it is a tidy-up, not the fix, and the hit count moved 175 → 198 because
#: dropping `assert\s+\w+\s*,` stopped crediting a bare `assert x, msg` as a
#: non-emptiness claim, which it never really was.
NONEMPTY_ASSERT = re.compile(
    r">\s*0\b|>=\s*[1-9]|!=\s*0\b|\.length\s*>|len\([^()]{0,40}\)\s*[>!]|"
    r"assert\s+any\(|assert\.ok\(|assertTrue\(|ok\(")

#: A test whose name or docstring SAYS it is the control gets credit for it —
#: this project writes them explicitly and the convention should be rewarded.
CONTROL_HINT = re.compile(r"CONTROL|KNOWN[- ]POSITIVE|FAIL ARM|can actually fail|"
                          r"not merely finding nothing|fixture", re.I)


#: THE PRECISION FILTER, AND IT IS THE WHOLE DIFFERENCE BETWEEN A TOOL AND NOISE.
#:
#: The first cut reported 182 hits. Sampling five by hand: four were the real shape
#: and one — `test_discoverability.py:33`, `assert not lo and "rec" in why` — was a
#: boolean returned by a hand-built fixture two lines above, which cannot go empty
#: for any reason and is not what this is looking for.
#:
#: A vacuous pass needs a collection that can be empty for an ENVIRONMENTAL reason:
#: a glob that matched nothing, a file that moved, a parse that changed shape, a
#: regex that stopped matching after a rename. A literal built in the test body
#: cannot do that. So flag only functions that reach the filesystem or a parser —
#: directly, or through a module-level helper they call.
ENVIRONMENTAL = re.compile(
    r"\bglob\(|\.rglob\(|\bopen\(|read_text\(|json\.load|iterdir\(|\bsubprocess|"
    r"\.split\(\"\\n\"\)|re\.(findall|finditer|search)\(|check_output\(|"
    r"loads\(|\.iterdir\b|Path\(")


def _seg(node, lines: list) -> str:
    """The source of `node`, sliced from a pre-split list.

    ⚠️ NOT `ast.get_source_segment`, AND THE REASON IS MEASURED. That helper calls
    `ast._splitlines_no_ff`, which re-splits the WHOLE FILE on every call. This
    scanner made 517 of those calls on one test file and spent **42.7 of its 43
    seconds inside it** — cProfile, after two wrong guesses of mine (a re-split in
    a loop, then regex backtracking) neither of which moved the number. Slicing a
    list that was split once is the same answer in milliseconds.
    """
    lo = (node.lineno or 1) - 1
    hi = getattr(node, "end_lineno", None) or node.lineno
    return "\n".join(lines[lo:hi])


def _reachable_src(node, src: str, helpers: dict) -> str:
    """The function's own source plus that of any module-level helper it calls.

    ONE LEVEL, NOT TRANSITIVE. Enough to see `intruders = _positions() - ROSTERED`
    for what it is — `_positions()` reads an artifact, so the set can be empty
    because the artifact moved — without turning this into a call-graph analysis
    whose own correctness would then need a check.
    """
    called = {n.func.id for n in ast.walk(node)
              if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    return src + "\n" + "\n".join(helpers.get(c, "") for c in called)


def py_findings(path: Path) -> list:
    """Test functions asserting emptiness with nothing proving they can see it."""
    try:
        src = path.read_text(encoding="utf8")
        tree = ast.parse(src)
    except (SyntaxError, OSError):
        return []
    module_has_control = bool(CONTROL_HINT.search(src))
    lines = src.split("\n")
    helpers = {n.name: _seg(n, lines) for n in tree.body
               if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    # module-level statements too: `fails` in test_byes.py is populated up there
    module_level = "\n".join(_seg(n, lines) for n in tree.body
                             if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef,
                                                   ast.ClassDef)))
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not node.name.startswith("test"):
            continue
        seg = _seg(node, lines)
        if not EMPTY_ASSERT.search(seg):
            continue
        if NONEMPTY_ASSERT.search(seg) or CONTROL_HINT.search(seg):
            continue
        reach = _reachable_src(node, seg, helpers) + "\n" + module_level
        if not ENVIRONMENTAL.search(reach):
            continue
        out.append((path, node.lineno, node.name, module_has_control))
    return out


def js_findings(path: Path) -> list:
    """The same question for JS gates, which have no ast module here.

    Coarser on purpose: JS checks in this repo are written as `ck(name, cond)` or
    `ok(name, fn)`, so the unit is a BLOCK, and a block is what gets reported.
    """
    try:
        src = path.read_text(encoding="utf8")
    except OSError:
        return []
    if "ck(" not in src and "ok(" not in src and "assert" not in src:
        return []
    module_has_control = bool(CONTROL_HINT.search(src))
    # SPLIT ONCE. The first version re-split the whole file inside the loop to
    # build each window, which made a 6-file scan take 42 seconds — slow enough
    # that the gate importing it would have been the slowest thing in CI, and
    # slow gates get moved out of the default run, which is how a check stops
    # running without anybody deciding to stop running it.
    lines = src.split("\n")
    out = []
    for i, line in enumerate(lines, start=1):
        if not EMPTY_ASSERT.search(line):
            continue
        # a ±12-line window stands in for "the same test"
        window = "\n".join(lines[max(0, i - 13):i + 12])
        if NONEMPTY_ASSERT.search(window) or CONTROL_HINT.search(window):
            continue
        out.append((path, i, line.strip()[:70], module_has_control))
    return out


def scan(root: Path = ROOT) -> list:
    found = []
    for d in PY_DIRS:
        for f in sorted((root / d).glob("**/*.py")):
            found += py_findings(f)
    for d in JS_DIRS:
        for f in sorted((root / d).glob("**/*.js")):
            if f.name.endswith(".test.js") or "test" in f.name or d.endswith("tools"):
                found += js_findings(f)
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="print every hit, not a sample")
    a = ap.parse_args()

    hits = scan()
    print("=" * 78)
    print("CHECKS THAT MAY NOT BE ABLE TO FAIL — no non-emptiness claim nearby")
    print("=" * 78)
    no_control = [h for h in hits if not h[3]]
    print(f"  {len(hits)} assertion(s) of the shape \"nothing bad was found\" with no")
    print(f"  visible proof the check can see anything · {len(no_control)} of them in a")
    print("  file that carries NO control of any kind — read those first.\n")

    show = hits if a.list else no_control[:25]
    for path, line, what, _ in show:
        print(f"  {path.relative_to(ROOT)}:{line}  {what}")
    if not a.list and len(no_control) > 25:
        print(f"  … and {len(no_control) - 25} more (--list for all)")

    print("\n  Each line is a QUESTION — can this check fail? — never an answer.")
    print("  A hand-built fixture two lines up makes a hit fine, and no static rule")
    print("  can see that. The COUNT is the thing to ratchet; the list is a reading")
    print("  list. Written from the pattern, not from an instance: ledger P69.")
    print("=" * 78)
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
