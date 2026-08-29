#!/usr/bin/env python3
"""TERRITORY: A.  IS THIS INTERPRETER THE ONE THE SUITE WAS WRITTEN FOR?

── WHY THIS EXISTS (register 378) ─────────────────────────────────────────

On 2026-08-27 I read a pytest summary with nine blocking failures and spent an
hour treating them as standing debt. Eight of them were this container missing
packages that `draft/requirements.txt` DECLARES and that `ci.yml` installs:
four tests failed on `lxml`, three on `nfl_data_py`, and one on its own Rule 3e
control being unable to reach a source it needed those packages to read. With
the three installed, all eight passed — 17/17, 39/39, 8/8.

THE PROBLEM IS NOT THE MISSING PACKAGE. It is that a `ModuleNotFoundError`
renders in a pytest summary EXACTLY like a defect: same red `FAILED` line, same
node id, no hint that the cause is the machine rather than the code. Eight of
them looked like eight findings.

And this repo predicted it in writing. `draft/requirements.txt` says of its own
HTML parsers: *"its tests run in the board gate, so a missing one here is the
`requests` venv gap all over again"* — so 08-27 was at least the second time.

So: ONE line that answers "is my environment the one CI runs?" before a red
suite gets read as a finding.

── WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT ──────────────────────

It compares DISTRIBUTIONS, not import names, via `importlib.metadata`. Those
differ often enough to matter — `beautifulsoup4` imports as `bs4`, `nfl_data_py`
keeps its underscore — and a hand-maintained name map is one more thing to
drift. The requirements file is the only source of truth.

It does NOT check versions. `>=2.0` style floors are what the file carries, and
resolving them properly means a resolver; a missing package is the failure that
actually happened and the one this catches.

REPORT ONLY by default: exit 0 with a verdict, so it can be run reflexively.
`--strict` exits 1 when something declared is absent, for a caller that wants
to gate on it.

Run:  python3 draft/tools/check_python_env.py [--strict]
      python3 draft/tools/check_python_env.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
REQUIREMENTS = ROOT / "draft" / "requirements.txt"


def declared(text: str) -> list[str]:
    """Distribution names from a requirements file, comments and pins stripped.

    Kept deliberately simple: this file is hand-written and small. Anything it
    cannot parse is DROPPED rather than guessed at, because a mangled name would
    report a phantom missing package — which is the same false-finding shape
    this tool exists to prevent.
    """
    names = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        m = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)", line)
        if m:
            names.append(m.group(1))
    return names


def missing(names: list[str]) -> list[str]:
    """Which declared distributions are not installed for THIS interpreter."""
    from importlib.metadata import PackageNotFoundError, version
    out = []
    for n in names:
        try:
            version(n)
        except PackageNotFoundError:
            out.append(n)
        except Exception:
            # An unreadable dist is not an absent one; say nothing rather than
            # report a package that is probably fine.
            pass
    return out


def self_test() -> int:
    """Rule 3e: this prints "environment matches" on every healthy machine,
    which is indistinguishable from a checker that cannot detect anything. So
    it proves both directions on demand, against known answers."""
    fails = []

    # KNOWN-POSITIVE — a distribution that cannot exist must be reported.
    ghost = "a-distribution-that-does-not-exist-0000"
    if missing([ghost]) != [ghost]:
        fails.append("a nonexistent distribution was NOT reported missing")

    # KNOWN-NEGATIVE — pytest is running this, so it is installed.
    if missing(["pytest"]):
        fails.append("pytest reported missing while it is demonstrably running")

    # The parser drops comments, pins and blank lines, and keeps the name.
    got = declared(
        "# a comment\n\npandas>=2.0\nlxml\nrequests  # trailing comment\n"
        "nfl_data_py>=0.3.2\n-r other.txt\n"
    )
    want = ["pandas", "lxml", "requests", "nfl_data_py"]
    if got != want:
        fails.append(f"parser: got {got!r}, want {want!r}")

    # And the real file parses to something non-empty — a parser that silently
    # returns [] would report a perfect environment on every machine.
    if REQUIREMENTS.exists() and len(declared(REQUIREMENTS.read_text())) < 3:
        fails.append("the real requirements file parsed to fewer than 3 names")

    for f in fails:
        print("FAIL  " + f)
    print(f"\n{4 - len(fails)}/4 self-tests passed")
    return 1 if fails else 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()

    if not REQUIREMENTS.exists():
        print(f"no requirements file at {REQUIREMENTS} — nothing to compare against")
        return 0

    names = declared(REQUIREMENTS.read_text())
    gone = missing(names)

    print("PYTHON ENV vs draft/requirements.txt   (register 378)")
    print(f"  interpreter : {sys.executable}")
    print(f"  declared    : {len(names)} distribution(s)")
    if not gone:
        print("  ✅ every declared distribution is installed — a red suite here is "
              "about the CODE, not the machine.")
        return 0

    print(f"  ⛔ MISSING {len(gone)}: " + ", ".join(gone))
    print()
    print("  READ ANY RED PYTEST RUN ON THIS MACHINE WITH THAT IN MIND. A missing")
    print("  package fails as `ModuleNotFoundError` inside whatever test imports it,")
    print("  which renders in the summary exactly like a defect — on 2026-08-27 that")
    print("  cost an hour and eight false findings (register 378).")
    print()
    print("  Fix:  pip install -r draft/requirements.txt")
    return 1 if "--strict" in argv else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
