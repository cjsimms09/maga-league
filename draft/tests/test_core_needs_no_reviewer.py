# TERRITORY: A
"""THE CORE PRODUCT MUST RUN WITH ZERO OPENAI ACCESS. ENFORCED, NOT PROMISED.

Cory's permanent architectural requirement, 2026-08-14:

    "If my API access disappears tomorrow, the core must continue operating
     normally. ChatGPT should make the project better, not make the project
     possible."

And the distinction that matters most, in his words: there are TWO kinds of AI
here. The fantasy model learning from its own outcomes IS THE PRODUCT. ChatGPT
reviewing the development process is AN ENGINEERING TOOL. Do not couple them.

    CORE PRODUCT            deterministic engine + learning loop -> draft ->
                            outcomes -> learn.        ALWAYS WORKS.
    DEVELOPMENT / AUDIT     A + reviewer -> evidence. OPTIONAL ENHANCEMENT.

── WHY THIS IS A TEST AND NOT A PARAGRAPH IN A DOCUMENT ───────────────────

This repository has a standing rule against writing a second constitution, and a
longer history of prose that a mechanism quietly contradicted: a comment saying
`pick_order.picks` was the pick sequence while the artifact called it the board;
a keeper_slate reason asserting a mechanism that did not exist; a parity test
described as proof of correctness. In every case the words were right when
written and the code drifted underneath them.

A requirement that must hold in a year is a test, not a sentence. This one fails
the moment anything in the product path grows a dependency on a paid reviewer —
which is the only moment it matters.

── THE SIX PATHS THE REQUIREMENT NAMES ────────────────────────────────────

draft engine, projections, valuation/board, war room, freeze, pick logger,
replay/learning. All of them are checked below by import graph, not by
inspection.

Run: python -m pytest draft/tests/test_core_needs_no_reviewer.py -q
"""
from __future__ import annotations

import ast
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]

#: Every tree the product runs out of. `tools/` is deliberately ABSENT: that is
#: the development/audit side, and it is allowed to depend on a provider.
CORE_TREES = ("draft", "public/js", "src", "scripts")

#: Names that would mean a paid reviewer had reached the product path.
#:
#: ⚠️ ASSEMBLED FROM FRAGMENTS SO THIS LIST CANNOT MATCH ITSELF. Written as
#: plain literals, the guard went red on its own FORBIDDEN tuple -- the needles
#: are code, not comments, so comment-stripping does not reach them. That is the
#: SEVENTH absence-assertion trap this session, and it landed in the guard whose
#: own docstring warns about the trap. Splitting the literals is belt; excluding
#: this file below is braces.
FORBIDDEN = ("open" + "ai", "anthro" + "pic", "chat" + "gpt", "claude" + "_api",
             "independent" + "_review", "reviewer" + "_prompt",
             "reviewer" + "_schema")

#: The entry points that must import cleanly with no key in the environment.
CORE_MODULES = ("keepers", "adp", "grab_by", "freeze_pre_draft",
                "log_draft_picks", "season_stamp")


def _core_files():
    out = []
    for tree in CORE_TREES:
        base = ROOT / tree
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.suffix not in (".py", ".js", ".sh"):
                continue
            if "node_modules" in p.parts or "__pycache__" in p.parts:
                continue
            # THIS FILE NAMES THE FORBIDDEN STRINGS BY DEFINITION. Excluding
            # exactly one file, asserted below so the exemption cannot widen.
            if p.resolve() == Path(__file__).resolve():
                continue
            out.append(p)
    return out


CORE_FILES = _core_files()


def test_CONTROL_the_exemption_is_exactly_one_file():
    """An exemption that can grow is an exemption that will. Only this file is
    skipped, and only because it must name what it forbids."""
    assert Path(__file__).resolve() not in {p.resolve() for p in CORE_FILES}
    for tree in CORE_TREES:
        base = ROOT / tree
        if not base.exists():
            continue
        every = [p for p in base.rglob("*")
                 if p.suffix in (".py", ".js", ".sh")
                 and "node_modules" not in p.parts
                 and "__pycache__" not in p.parts]
        scanned = [p for p in CORE_FILES if str(p).startswith(str(base))]
        assert len(every) - len(scanned) <= 1, (
            f"{tree}: {len(every) - len(scanned)} files excluded from the scan, "
            "expected at most this one")


def test_CONTROL_the_scan_actually_covers_the_product():
    """A guard over an empty file list passes and proves nothing."""
    assert len(CORE_FILES) > 200, f"only {len(CORE_FILES)} core files scanned"
    names = {p.name for p in CORE_FILES}
    for must in ("build.py", "keepers.py", "adp.py", "survival.js", "engine.js",
                 "freeze_pre_draft.py", "log_draft_picks.py"):
        assert must in names, f"{must} not in the scanned set"


def test_NO_CORE_FILE_REFERENCES_A_PAID_REVIEWER():
    """The requirement itself. Comments are stripped first: this file and others
    DISCUSS the reviewer, and a guard that trips on its own prose is the
    absence-assertion trap this session hit six times."""
    hits = []
    for p in CORE_FILES:
        src = p.read_text(errors="ignore")
        if p.suffix == ".py":
            body = "\n".join(l for l in src.splitlines()
                             if not l.lstrip().startswith("#"))
            body = re.sub(r'"""[\s\S]*?"""', "", body)
        elif p.suffix == ".js":
            body = re.sub(r"/\*[\s\S]*?\*/", "", src)
            body = "\n".join(l for l in body.splitlines()
                             if not l.lstrip().startswith("//"))
        else:
            body = "\n".join(l for l in src.splitlines()
                             if not l.lstrip().startswith("#"))
        low = body.lower()
        for bad in FORBIDDEN:
            if bad in low:
                hits.append(f"{p.relative_to(ROOT)}: {bad}")
    assert not hits, (
        "the product path now depends on a paid reviewer:\n  "
        + "\n  ".join(hits)
        + "\nThe core must run with zero API access. The reviewer is an "
          "engineering tool, not a runtime dependency.")


def test_NO_CORE_PYTHON_IMPORTS_A_PROVIDER_SDK():
    """Import graph rather than substring — an aliased or indirect import would
    slip past a grep, and this is the check that has to hold in a year."""
    bad = []
    for p in CORE_FILES:
        if p.suffix != ".py":
            continue
        try:
            tree = ast.parse(p.read_text(errors="ignore"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            mods = []
            if isinstance(node, ast.Import):
                mods = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                mods = [node.module or ""]
            for m in mods:
                root = m.split(".")[0].lower()
                if root in ("openai", "anthropic"):
                    bad.append(f"{p.relative_to(ROOT)} imports {m}")
    assert not bad, "\n".join(bad)


def test_THE_CORE_MODULES_IMPORT_WITH_NO_KEY_IN_THE_ENVIRONMENT():
    """Executed, not read. A module that reached for a key at import time would
    pass every static check above and still break a keyless draft night."""
    env = {k: v for k, v in os.environ.items()
           if k not in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY")}
    # `season_stamp` lives in draft/backtest, not draft/. Both trees are on the
    # path in every real invocation; hard-coding only one made this fail for a
    # reason that had nothing to do with API keys.
    env["PYTHONPATH"] = os.pathsep.join(
        [str(ROOT / "draft"), str(ROOT / "draft" / "backtest")])
    code = "import " + ", ".join(CORE_MODULES)
    r = subprocess.run([sys.executable, "-c", code], env=env,
                       capture_output=True, text=True, cwd=str(ROOT))
    assert r.returncode == 0, (
        f"core modules do not import without an API key:\n{r.stderr[-2000:]}")


def test_THE_FREEZE_AND_PICK_LOG_RUN_WITH_NO_KEY():
    """The two irreversible draft-night paths, exercised end to end keyless.
    These are the ones where a dependency would cost something unrecoverable."""
    env = {k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"}
    for args in (["draft/freeze_pre_draft.py", "--verify"],
                 ["draft/log_draft_picks.py", "--status"]):
        r = subprocess.run([sys.executable] + args, env=env,
                           capture_output=True, text=True, cwd=str(ROOT))
        assert r.returncode == 0, (
            f"{args[0]} failed with no API key:\n{r.stderr[-1500:]}")


def test_NO_WORKFLOW_MAKES_A_MODEL_JOB_DEPEND_ON_THE_REVIEWER():
    """A model workflow that `needs:` the reviewer job would couple them at the
    CI layer even with the code clean — the coupling would be in YAML, where no
    import graph looks."""
    wf = ROOT / ".github" / "workflows"
    offenders = []
    for f in sorted(wf.glob("*.yml")):
        if f.name == "independent-review.yml":
            continue                      # the reviewer may depend on itself
        src = f.read_text(errors="ignore")
        body = "\n".join(l for l in src.splitlines()
                         if not l.lstrip().startswith("#"))
        if re.search(r"independent[-_]review|OPENAI_API_KEY", body):
            offenders.append(f.name)
    assert not offenders, (
        "these model/product workflows reference the reviewer: "
        + ", ".join(offenders)
        + ". A reviewer outage would stop them, which is the single point of "
          "failure this requirement forbids.")


@pytest.mark.skipif(not (ROOT / "tools" / "independent_review.py").exists(),
                    reason="harness not present on this branch — which is "
                           "itself the point: the core must not need it")
def test_THE_HARNESS_IS_ABSENT_OR_PRESENT_AND_THE_CORE_DOES_NOT_CARE():
    """The relationship, stated as an assertion. This test SKIPS when the
    harness is missing and passes when it is there — and every test above
    passes either way. That is what 'optional enhancement' means operationally."""
    assert (ROOT / "tools" / "independent_review.py").exists()
