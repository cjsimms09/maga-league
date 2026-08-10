"""CI-LOOP INTEGRITY GUARD — every Python test file must resolve AND execute.

The failure family this closes (same disease the JS side got a guard for when
stages/stack_routes/movement_line were found outside the CI loop): a rename leaves
callers importing a name that no longer exists, and it stays invisible because
nothing was running. exp33-36 imported spearman/walk_forward/CFG from the wrong
'projections' module for 15+ commits while CI was dark — two source files were
both named `projections`, so `sys.modules` served whichever loaded first.

pytest already fails LOUDLY on an import error at collection (that is finally how
the break surfaced once CI ran). What pytest does NOT catch is the OTHER half:

  1. a file that collects ZERO tests — a silent no-op that reads as "green";
  2. two source modules sharing a name — a collision that only errors under a
     specific collection ORDER, so it can pass in isolation and fail in the suite.

This guard catches both, in-suite, so the next occurrence fails a test instead of
going dark:
  * every test_*.py compiles and defines at least one collectible test;
  * no two importable source modules under draft/ share a bare module name (the
    exact `projections` vs `projections` trap), so a same-name collision can never
    silently poison sys.modules again.
"""
import ast
from collections import defaultdict
from pathlib import Path

TESTS = Path(__file__).resolve().parent
DRAFT = TESTS.parent
SELF = Path(__file__).name


def _test_files():
    return sorted(p for p in TESTS.glob("test_*.py") if p.name != SELF)


def test_every_test_file_compiles_and_has_a_test():
    """A test_*.py that collects zero tests is a silent no-op — pytest passes it.
    Assert each compiles and defines at least one `test_*` function or `Test*`
    class, so a file that quietly stopped testing anything fails loudly."""
    no_tests, broken = [], []
    for f in _test_files():
        try:
            tree = ast.parse(f.read_text(), filename=str(f))
        except SyntaxError as e:
            broken.append(f"{f.name}: {e}")
            continue
        has_test = any(
            (isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test"))
            or (isinstance(n, ast.ClassDef) and n.name.startswith("Test"))
            for n in tree.body)
        if not has_test:
            no_tests.append(f.name)
    assert not broken, "test files that do not compile:\n" + "\n".join(broken)
    assert not no_tests, ("test files that collect ZERO tests (silent no-op — a file "
                          "that stopped testing reads as green):\n" + "\n".join(no_tests))


def test_no_two_source_modules_share_a_bare_name():
    """The `projections` trap: draft/projections.py and draft/backtest/projections.py
    were both importable as bare `projections`, so `sys.modules` served whichever
    loaded first and the exp modules got the wrong one. Assert no bare module name
    is claimed by two files on the import roots the Lab actually inserts, so this
    collision cannot recur silently.

    SCOPE WIDENED 2026-08-10 (found by rule 10: copying a module into draft/tools
    produced a real collision that this guard did not notice). It scanned only
    draft/ and draft/backtest/, but a sweep of every `sys.path.insert` in the Lab
    shows `parents[1] / "tools"` and the tests directory itself are also inserted
    — draft/tools holds five importable modules, including merge_completeness,
    which is itself one of the guards this project relies on. A collision there
    would poison sys.modules exactly as `projections` did, and silently.

    The roots below are the ones actually inserted somewhere in draft/**. If a new
    import root is added, add it here — the failure mode is silent, so an
    unscanned root is worse than no guard, which is the whole lesson of the
    original bug."""
    roots = [DRAFT, DRAFT / "backtest", DRAFT / "tools", TESTS]
    by_name = defaultdict(list)
    for root in roots:
        for p in root.glob("*.py"):
            if p.name == "__init__.py":
                continue
            by_name[p.stem].append(str(p.relative_to(DRAFT)))
    clashes = {name: paths for name, paths in by_name.items() if len(paths) > 1}
    assert not clashes, ("bare module names claimed by >1 file on the Lab import roots "
                         "(a sys.modules collision waiting to happen — rename one):\n"
                         + "\n".join(f"  {n}: {ps}" for n, ps in clashes.items()))
