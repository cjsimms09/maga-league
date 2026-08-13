# TERRITORY: C
"""MUTATION COVERAGE AS A STANDING PROPERTY, NOT A CLAIM IN A COMMIT MESSAGE.

127 commits in this repo claim mutation kills. Nothing re-checks a single one.
That is the same defect I fixed for `waiver_replacement` one level up: evidence
that exists only in prose cannot be re-verified, so it does not become wrong
loudly — it becomes wrong SILENTLY, on the day somebody weakens the assertion the
kill was credited to.

The failure is concrete and cheap to imagine. A test named in a kill gets renamed
in a refactor, or trimmed because it looked redundant. The commit message still
says KILLED. Nothing anywhere disagrees. The coverage is gone and the record says
it is there.

THREE CHECKS, ALL CHEAP — no pytest is spawned, so this runs on every CI run:

  1. every `must_fail` test named in the manifest STILL EXISTS
  2. no recorded verdict is SURVIVED or INVALID — a claim that was never a kill
     has no business sitting in the record as evidence
  3. every mutation's `old` string is still present in its module

Check 3 goes red on a refactor, and that is correct rather than unfortunate: the
mutation evidence for the rewritten code genuinely no longer exists, and the fix
is to re-run the gate and update the manifest. The message says exactly that, so
it is one command rather than a puzzle.

The DEEP check — actually re-running every mutation — is `mutation_gate.run_all`
and is far too slow for per-commit CI. This is the fast standing guard that
catches the likely regression; the deep one is run deliberately.

Run: python3 -m pytest draft/tests/test_mutation_manifest.py -q
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "backtest"))

import mutation_gate as MG  # noqa: E402

MANIFEST = ROOT / "backtest" / "mutation_manifest.json"


def load():
    return json.loads(MANIFEST.read_text())


# THE DETECTORS, FACTORED OUT SO THEY CAN BE AIMED AT A PLANTED FAULT FIRST.
#
# My first version of the three tests below asserted only that the real manifest
# is clean — and the gate reported all three mutations SURVIVED, because a
# detector that can never find anything satisfies "nothing found" perfectly. That
# is the fourth time today this exact vacuity has appeared, and the fix is the
# same every time: prove the detector FIRES on a planted fault, THEN assert the
# real record is clean.
def _missing_tests(doc, root):
    out = []
    for mod, m in doc["modules"].items():
        names = set()
        for tf in m["tests"]:
            src = (root / tf).read_text()
            names |= {ln.split("(")[0][4:].strip()
                      for ln in src.splitlines() if ln.startswith("def test")}
        for mut in m["mutations"]:
            out += [(mod, t) for t in mut["must_fail"] if t not in names]
    return out


def _non_kills(doc):
    return [(mod, mut["must_fail"], mut["verdict"])
            for mod, m in doc["modules"].items() for mut in m["mutations"]
            if mut["verdict"] != "KILLED"]


def _stale_targets(doc, root):
    out = []
    for mod, m in doc["modules"].items():
        src = (root / mod).read_text()
        out += [(mod, mut["must_fail"]) for mut in m["mutations"]
                if mut["old"] not in src]
    return out


def _planted(doc, **kw):
    """A copy of the manifest with one deliberately bad mutation added."""
    import copy
    d = copy.deepcopy(doc)
    mod = next(iter(d["modules"]))
    d["modules"][mod]["mutations"].append(
        dict({"old": "x", "new": "y", "must_fail": ["test_a"],
              "verdict": "KILLED"}, **kw))
    return d, mod


def test_the_manifest_EXISTS_and_is_not_empty():
    """An empty manifest passes every check below vacuously. MUTATION: ship it
    empty — three green checks over nothing at all."""
    assert MANIFEST.exists(), "no manifest: mutation coverage is unverifiable again"
    d = load()
    n = sum(len(m["mutations"]) for m in d["modules"].values())
    assert n >= 10, "only %d mutations recorded — too few to be a real record" % n


def test_EVERY_must_fail_TEST_STILL_EXISTS():
    """THE LIKELY REGRESSION. A test named in a kill gets renamed or trimmed, the
    commit message still says KILLED, and nothing disagrees.

    MUTATION: skip the existence check — the record keeps asserting coverage that
    was deleted, which is worse than having no record."""
    d = load()
    planted, mod = _planted(d, must_fail=["test_that_was_deleted_in_a_refactor"])
    assert _missing_tests(planted, ROOT.parent) == [
        (mod, "test_that_was_deleted_in_a_refactor")], (
        "the detector cannot FIND a deleted test, so the assertion below is "
        "satisfied by a check that never fires")

    missing = _missing_tests(d, ROOT.parent)
    assert not missing, (
        "these tests were credited with a mutation kill and no longer exist: %s — "
        "the coverage is gone and the record still claims it" % missing)


def test_NO_RECORDED_VERDICT_IS_SURVIVED_OR_INVALID():
    """A SURVIVED is a coverage hole and an INVALID proved nothing. Either sitting
    in the record as evidence is the lie the gate was built to refuse, preserved
    in a file.

    MUTATION: accept any verdict — an INVALID_SYNTAX entry reads as a kill to
    every later reader."""
    d = load()
    planted, mod = _planted(d, verdict="SURVIVED")
    assert _non_kills(planted), (
        "the detector cannot FIND a SURVIVED entry, so the assertion below proves "
        "nothing about the real record")

    bad = _non_kills(d)
    assert not bad, "non-KILLED verdicts recorded as evidence: %s" % bad


def test_EVERY_MUTATION_TARGET_IS_STILL_PRESENT_IN_ITS_MODULE():
    """Goes red on a refactor, and that is the point: the evidence for the
    rewritten code genuinely no longer exists.

    MUTATION: skip it — the manifest silently describes code that is gone, and
    every entry reads as current."""
    d = load()
    planted, mod = _planted(d, old="a string no module has ever contained")
    assert _stale_targets(planted, ROOT.parent), (
        "the detector cannot FIND a target that is gone, so the assertion below "
        "is satisfied by a check that never fires")

    stale = _stale_targets(d, ROOT.parent)
    assert not stale, (
        "these mutation targets no longer exist in their module: %s. The code was "
        "refactored and the evidence did not follow. Re-run the gate on the new "
        "source and update draft/backtest/mutation_manifest.json." % stale)


def test_the_RECORDER_REFUSES_to_file_a_non_kill(tmp_path):
    """The manifest can only stay honest if writing to it is guarded too — a
    recorder that files whatever it is handed makes check 2 a formality.

    MUTATION: record everything — a SURVIVED is written, and the standing check
    that would have caught it is now failing on data the recorder created."""
    p = tmp_path / "m.json"
    good = [{"file": "a.py", "old": "x", "new": "y", "must_fail": ["test_a"],
             "verdict": "KILLED"}]
    bad = good + [{"file": "a.py", "old": "q", "new": "r",
                   "must_fail": ["test_b"], "verdict": "SURVIVED"}]
    MG.record("a.py", ["t.py"], good, path=str(p))
    assert len(json.loads(p.read_text())["modules"]["a.py"]["mutations"]) == 1
    try:
        MG.record("a.py", ["t.py"], bad, path=str(p))
    except ValueError as e:
        assert "SURVIVED" in str(e)
    else:
        raise AssertionError("a non-KILLED verdict must not be recordable")


# ── THE DEEP CHECK, WHICH IS THE ONLY ONE THAT CATCHES A HOLLOWED-OUT TEST ──
#
# The three checks above guard NAMES: a test deleted, a verdict that was never a
# kill, a target that no longer exists. None of them catches the subtler
# regression — a test kept at the same name whose assertions were weakened until
# they no longer fail. That one needs the mutation actually re-applied, which is
# far too slow for per-commit CI, so it runs on a schedule and the logic lives in
# the module rather than in the workflow YAML.

def test_verify_manifest_RE_RUNS_and_reports_per_mutation(tmp_path):
    """MUTATION: report a pass/fail count without naming which mutation stopped
    killing — a weekly job that says "21 of 22" sends the reader to diff 22
    entries by hand, which is how a scheduled check stops being read."""
    mod = tmp_path / "m.py"
    mod.write_text("def f(x):\n    return x * 2\n")
    t = tmp_path / "test_m.py"
    t.write_text("import sys\nsys.path.insert(0, r'%s')\nimport m\n"
                 "def test_doubles():\n    assert m.f(4) == 8\n" % str(tmp_path))
    man = tmp_path / "man.json"
    MG.record(str(mod), [str(t)],
              [{"file": str(mod), "old_full": "return x * 2", "new": "return x * 3",
                "must_fail": ["test_doubles"], "verdict": "KILLED"}], path=str(man))

    ok = MG.verify_manifest(path=str(man), root=".")
    assert ok["all_killed"] is True and ok["checked"] == 1

    # hollow the test out but KEEP ITS NAME — the exact regression the cheap
    # checks cannot see, because the name is still there and the target still is.
    t.write_text("import sys\nsys.path.insert(0, r'%s')\nimport m\n"
                 "def test_doubles():\n    assert True\n" % str(tmp_path))
    bad = MG.verify_manifest(path=str(man), root=".")
    assert bad["all_killed"] is False
    assert bad["regressed"] and bad["regressed"][0]["must_fail"] == ["test_doubles"], bad
    assert bad["regressed"][0]["verdict"] == "SURVIVED"
