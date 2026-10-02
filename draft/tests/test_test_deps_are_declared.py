"""EVERY THIRD-PARTY MODULE THE SUITE IMPORTS MUST BE IN requirements.txt.

── WHY ────────────────────────────────────────────────────────────────────────

The board's acceptance gate runs `pip install -r draft/requirements.txt` and
then `pytest draft/tests`. A test importing something that file does not declare
does not skip and does not error distinctively — it raises ImportError, pytest
prints a plain `FAILED`, `gate_triage` sees an unclassified failure, and
**everything blocks by default**, which is the correct policy applied to a
phantom defect.

MEASURED, 2026-09-28 to 2026-10-01: `test_fill_byes_from_map.py` was added to
assert the bye backfill runs before the gate. It imports `yaml`. PyYAML was not
in requirements.txt and no other test in the suite imports it, so it failed on
every CI run while passing on every developer machine (this container's start
hook installs pyyaml separately). **A test written to stop the board being
blocked spent four days as the thing blocking it**, and the real in-season
failures underneath it were being read as the whole story.

requirements.txt already carried a warning about this exact class — *"its tests
run in the board gate, so a missing one here is the `requests` venv gap all over
again"*. A comment did not stop the third occurrence. This does.

── WHAT IT DOES NOT DO ────────────────────────────────────────────────────────

It does not police versions, imports inside `try:` blocks (a genuinely optional
dependency is a real pattern), or anything importable from the standard library.
It asks one question: if CI installs only requirements.txt, can every test in
this directory import what it reaches for?

Run: python3 -m pytest draft/tests/test_test_deps_are_declared.py -q
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / "draft" / "tests"
REQ = ROOT / "draft" / "requirements.txt"

#: Import name -> distribution name, where they differ. Kept tiny on purpose:
#: a long map here means the suite has grown dependencies nobody declared.
IMPORT_TO_DIST = {
    "yaml": "pyyaml",
    "bs4": "beautifulsoup4",
    "nfl_data_py": "nfl_data_py",
    "dateutil": "python-dateutil",
    "PIL": "pillow",
    "sklearn": "scikit-learn",
}

#: Importable without pip because they live beside the tests or on the path the
#: conftest sets up. Not third party, so not requirements.txt's business.
LOCAL_PREFIXES = ("draft", "tools", "backtest")


def _declared() -> set[str]:
    out = set()
    for line in REQ.read_text(encoding="utf8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        name = line.split("[")[0]
        for sep in (">=", "==", "<=", "~=", ">", "<", "!="):
            name = name.split(sep)[0]
        out.add(name.strip().lower().replace("_", "-"))
    return out


def _local_module_names() -> set[str]:
    """Anything importable from inside the repo is not a pip dependency."""
    names = set()
    for base in (ROOT / "draft", ROOT / "draft" / "tools", ROOT / "draft" / "backtest",
                 ROOT / "draft" / "tests", ROOT / "tools"):
        if base.is_dir():
            for p in base.glob("*.py"):
                names.add(p.stem)
            for p in base.iterdir():
                if p.is_dir() and (p / "__init__.py").exists():
                    names.add(p.name)
    return names


def _top_level_imports(path: Path) -> set[str]:
    """Modules imported UNCONDITIONALLY (not inside try/except ImportError).

    An import guarded by try/except is an optional dependency by construction and
    cannot block the gate, so it is out of scope.
    """
    tree = ast.parse(path.read_text(encoding="utf8"))

    guarded: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Try):
            for child in ast.walk(node):
                guarded.add(id(child))

    found = set()
    for node in ast.walk(tree):
        if id(node) in guarded:
            continue
        if isinstance(node, ast.Import):
            for a in node.names:
                found.add(a.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                found.add(node.module.split(".")[0])
    return found


def _third_party(names: set[str], local: set[str]) -> set[str]:
    std = getattr(sys, "stdlib_module_names", set())
    out = set()
    for n in names:
        if n in std or n in local or n.startswith(LOCAL_PREFIXES) or n == "pytest":
            continue
        out.add(n)
    return out


# ── controls (rule 3e) ──────────────────────────────────────────────────────

def test_CONTROL_the_requirements_parser_finds_the_known_entries():
    d = _declared()
    for expected in ("pandas", "numpy", "pytest", "requests", "lxml"):
        assert expected in d, f"{expected} is in requirements.txt but the parser missed it"


def test_CONTROL_the_import_scanner_finds_a_known_import():
    """It must see `yaml` in the file that caused this — or it proves nothing."""
    target = TESTS / "test_fill_byes_from_map.py"
    if not target.exists():
        pytest.skip("the file this control is anchored to is gone")
    assert "yaml" in _top_level_imports(target), \
        "the scanner cannot see the very import that blocked the board for four days"


def test_CONTROL_a_try_guarded_import_is_NOT_counted(tmp_path):
    f = tmp_path / "t_opt.py"
    f.write_text("try:\n    import some_optional_pkg\nexcept ImportError:\n    some_optional_pkg = None\n")
    assert "some_optional_pkg" not in _top_level_imports(f)


def test_CONTROL_an_unguarded_import_IS_counted(tmp_path):
    f = tmp_path / "t_req.py"
    f.write_text("import some_required_pkg\n")
    assert "some_required_pkg" in _top_level_imports(f)


# ── the sweep ───────────────────────────────────────────────────────────────

def test_every_third_party_import_in_the_suite_is_declared():
    declared = _declared()
    local = _local_module_names()
    missing: dict[str, list[str]] = {}

    for path in sorted(TESTS.glob("*.py")):
        try:
            imports = _top_level_imports(path)
        except SyntaxError:                                # not this file's job
            continue
        for mod in sorted(_third_party(imports, local)):
            dist = IMPORT_TO_DIST.get(mod, mod).lower().replace("_", "-")
            if dist not in declared:
                missing.setdefault(dist, []).append(path.name)

    assert not missing, (
        "these imports are not in draft/requirements.txt, so the board gate's "
        "`pip install -r draft/requirements.txt` will not provide them and the "
        "test will fail in CI as a BLOCKING, unexplained FAILED:\n  "
        + "\n  ".join(f"{d} — imported by {', '.join(f)}" for d, f in sorted(missing.items())))
