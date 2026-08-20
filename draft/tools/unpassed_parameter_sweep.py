"""TERRITORY: relay measures · A owns build.py

A PARAMETER THAT EXISTS AND IS NEVER PASSED DOES NOT CRASH. IT PRODUCES A CLEAN,
PLAUSIBLE, WRONG NUMBER. THIS FINDS THEM.

── WHY ────────────────────────────────────────────────────────────────────────

Register 5k, 2026-08-18: `build_manager_profiles` called
`managers_mod.build_profiles(...)` without `season_now` — a parameter that had
existed since the function was written. Python filled the default, the call site
read as correct, and the board shipped `rookie_affinity.league_rate = 0` for
**10 of 10 managers**. Full coverage, no information, no error anywhere.

That is the third instance of the shape on this board:

  * 4j  every dispersion field was `proj_mean x a per-band constant`
  * 4n  `adp_sd` had 617/617 coverage with 60% of the board sharing one default
  * 5k  `rookie_affinity` zero for every manager

**Three is a class.** And the class is invisible to the tests we have: a test
that asserts a field is present and numeric passes on all three.

── WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────

For every call `build.py` makes into a first-party `draft/` module, it compares
the callee's signature against what the call site actually supplies, and reports
every optional parameter left to its default.

**MOST OF THOSE ARE FINE, AND SAYING SO IS THE POINT.** A default that is inert
(`verbose=False`, `limit=None` meaning "no limit") is the reason defaults exist.
This tool CANNOT tell an inert default from a load-bearing one — that judgement
needs a human reading what the parameter does. So it reports, ranks, and does
not fail the build. A tool that reddened CI on every unsupplied default would be
switched off inside a day, and this project has an epitaph for that.

**⚠️ RULE 3e — IT SHIPS WITH A KNOWN-POSITIVE CONTROL, AND THE CONTROL IS REAL
RATHER THAN SYNTHETIC.** `--control` runs the sweep against the PRE-FIX
`build.py` (commit a65eb5fe) and asserts it flags `season_now` on
`build_profiles`. That is a defect we know was there, that we know cost a real
number on a real board. If the sweep cannot find the one it was built for, its
silence about everything else means nothing.

Run: python3 draft/tools/unpassed_parameter_sweep.py [--control] [--json]
Exit: 0 always in report mode. 1 if --control fails to reproduce the known hit.
"""
from __future__ import annotations

import argparse
import ast
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
BUILD = ROOT / "draft" / "build.py"
PRE_FIX_COMMIT = "a65eb5fe"          #: build.py before season_now was supplied

#: Parameters whose default is inert BY INSPECTION — checked one at a time, with
#: the reason, so this list is evidence and not a mute button. Anything not here
#: is reported, including things that turn out to be fine.
KNOWN_INERT = {
    "force": "a cache-bypass flag; changes WHEN work happens, not what it computes",
    "offline": "supplied explicitly at every call site that has a network path",
    "verbose": "logging only",
    "quiet": "logging only",
    "debug": "logging only",
}


def signatures(pyfile: pathlib.Path) -> dict[str, list[str]]:
    """{function name: [optional parameter names]} for one module."""
    try:
        tree = ast.parse(pyfile.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return {}
    out: dict[str, list[str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        a = node.args
        positional = a.posonlyargs + a.args
        # the last len(defaults) positional params are the optional ones
        opt = [p.arg for p in positional[len(positional) - len(a.defaults):]] \
            if a.defaults else []
        opt += [p.arg for p in a.kwonlyargs]
        out[node.name] = opt
    return out


def first_party_signatures() -> dict[str, dict[str, list[str]]]:
    """{module stem: {function: [optional params]}} across draft/."""
    mods: dict[str, dict[str, list[str]]] = {}
    for p in sorted((ROOT / "draft").rglob("*.py")):
        if "/tests/" in str(p) or p.name.startswith("test_"):
            continue
        sigs = signatures(p)
        if sigs:
            mods[p.stem] = sigs
    return mods


def import_aliases(tree: ast.AST) -> dict[str, str]:
    """{local name: module stem} for `import x as y` and `from x import y`.

    ⚠️ THIS IS THE HALF THE FIRST VERSION DID NOT HAVE, AND ITS ABSENCE MADE THE
    SWEEP SILENT ON THE ONE DEFECT IT WAS BUILT FOR. `build_profiles` is defined
    in TWO first-party modules — `managers` (two optional params) and
    `opponent_profiles` (none) — so matching on the bare function NAME hit a
    collision, the ambiguity guard dropped it, and the control reported MISSED.

    A name collision silencing a probe is indistinguishable from a clean result,
    which is the entire reason the control exists. Resolving `managers_mod` back
    to `managers` makes the match exact instead of hopeful."""
    out: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                out[a.asname or a.name.split(".")[0]] = a.name.split(".")[-1]
        elif isinstance(node, ast.ImportFrom) and node.module:
            for a in node.names:
                out[a.asname or a.name] = node.module.split(".")[-1]
    return out


def call_sites(src: str) -> list[tuple[str, str, str | None, set[str], int]]:
    """[(enclosing function, callee, resolved module or None, kwargs, lineno)]."""
    tree = ast.parse(src)
    aliases = import_aliases(tree)
    out = []

    class V(ast.NodeVisitor):
        def __init__(self):
            self.where = "<module>"

        def visit_FunctionDef(self, node):          # noqa: N802
            prev, self.where = self.where, node.name
            self.generic_visit(node)
            self.where = prev

        visit_AsyncFunctionDef = visit_FunctionDef  # noqa: N815

        def visit_Call(self, node):                 # noqa: N802
            f = node.func
            name = mod = None
            if isinstance(f, ast.Attribute):
                name = f.attr
                if isinstance(f.value, ast.Name):
                    mod = aliases.get(f.value.id, f.value.id)
            elif isinstance(f, ast.Name):
                name = f.id
                mod = aliases.get(f.id)     # `from managers import build_profiles`
            if name:
                kw = {k.arg for k in node.keywords if k.arg}
                # **kwargs at the call site means we cannot know — record it
                if any(k.arg is None for k in node.keywords):
                    kw.add("**")
                out.append((self.where, name, mod, kw, node.lineno))
            self.generic_visit(node)

    V().visit(tree)
    return out


def sweep(build_src: str) -> list[dict]:
    mods = first_party_signatures()
    by_name: dict[str, list[str]] = {}
    ambiguous: set[str] = set()
    for _mod, sigs in mods.items():
        for fn, opt in sigs.items():
            if fn in by_name and by_name[fn] != opt:
                ambiguous.add(fn)
            by_name[fn] = opt

    findings = []
    for where, callee, mod, supplied, lineno in call_sites(build_src):
        # EXACT match first — module + function. Only fall back to the bare
        # name when the module is unknown AND the name is unambiguous.
        if mod and mod in mods and callee in mods[mod]:
            optional = mods[mod][callee]
            resolved = f"{mod}.{callee}"
        elif callee in by_name and callee not in ambiguous:
            optional = by_name[callee]
            resolved = callee
        else:
            continue
        if "**" in supplied:
            continue                                 # cannot know; not a finding
        missing = [p for p in optional
                   if p not in supplied and p not in KNOWN_INERT]
        if missing:
            findings.append({
                "caller": where, "callee": resolved, "line": lineno,
                "unpassed": missing,
            })
    return findings


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--control", action="store_true",
                    help="prove the sweep finds the ONE defect we know it should")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.control:
        # ── THE KNOWN POSITIVE ────────────────────────────────────────────
        # Rule 3e: a probe that has never returned a positive has not been
        # tested, only run. This runs against the real pre-fix source.
        try:
            old = subprocess.run(
                ["git", "show", f"{PRE_FIX_COMMIT}:draft/build.py"],
                cwd=ROOT, capture_output=True, text=True, check=True).stdout
        except subprocess.CalledProcessError as exc:
            print(f"CONTROL COULD NOT RUN — {PRE_FIX_COMMIT} unreachable: {exc}")
            return 1
        hits = sweep(old)
        got = [f for f in hits
               if f["callee"].endswith("build_profiles") and "season_now" in f["unpassed"]]
        now = sweep(BUILD.read_text(encoding="utf-8"))
        still = [f for f in now
                 if f["callee"].endswith("build_profiles") and "season_now" in f["unpassed"]]
        ok = bool(got) and not still
        print("KNOWN-POSITIVE CONTROL (register 5k / E13)")
        print(f"  pre-fix  {PRE_FIX_COMMIT}: season_now unpassed on build_profiles"
              f" -> {'FOUND' if got else 'MISSED'}")
        print(f"  today            : {'still unpassed' if still else 'supplied'}")
        print("  " + ("PASS — the sweep detects the defect it was built for, and "
                      "that defect is fixed today."
                      if ok else
                      "FAIL — a sweep that cannot find the one known instance "
                      "says nothing by finding nothing elsewhere."))
        return 0 if ok else 1

    findings = sweep(BUILD.read_text(encoding="utf-8"))
    if args.json:
        print(json.dumps(findings, indent=2))
        return 0

    print("UNPASSED PARAMETERS AT build.py CALL SITES")
    print("")
    if not findings:
        print("  none — every optional parameter is either supplied or known-inert.")
    for f in findings:
        print(f"  {f['caller']}:{f['line']}  ->  {f['callee']}()")
        print(f"      unpassed: {', '.join(f['unpassed'])}")
    print("")
    print(f"  {len(findings)} call site(s). REPORTED, NEVER BLOCKING — most defaults")
    print("  are inert and that is why defaults exist. This cannot tell an inert")
    print("  default from a load-bearing one; that needs a human reading what the")
    print("  parameter DOES. Run --control first if you doubt the sweep.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
