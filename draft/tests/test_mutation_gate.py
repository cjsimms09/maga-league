# TERRITORY: C
"""THE GATE THAT MAKES "N MUTATIONS, N KILLS" MEAN SOMETHING.

Mutation testing is the primary evidence in this lane: apply the mutation first,
write the assertion second, and report the kill. Every such claim I have made
rests on an ad-hoc shell function that decided the verdict by GREPPING PYTEST'S
OUTPUT — and today one of them lied to me.

THE FAILURE, EXACTLY. A patch left an unbalanced parenthesis. The module stopped
importing, pytest reported a collection ERROR rather than a test failure, my grep
for `^FAILED|passed|failed` matched nothing, and the harness printed nothing at
all. I read the silence as "the mutation survived" and nearly recorded it. A
mutation that cannot even load is not evidence in either direction, and silence
is indistinguishable from survival.

FIVE WAYS A MUTATION RUN CAN LIE, and this gate refuses each by name:

  1. THE BASELINE WAS ALREADY RED — a pre-existing failure is read as the kill.
  2. THE TARGET STRING WAS NOT THERE — nothing was mutated; the suite passes and
     it looks like survival.
  3. THE MUTANT DOES NOT COMPILE — collection error, no test result at all.
  4. TESTS VANISHED — the mutation deleted or hid tests, so "fewer failures"
     means fewer tests, not better code.
  5. THE WRONG TEST FAILED — something unrelated broke, and a kill is credited to
     an assertion that never fired.

A verdict is KILLED only when the NAMED test failed, the baseline was green, the
mutant compiled, and the collection count held. Everything else is INVALID or
SURVIVED, and INVALID is never quietly treated as either.

Run: python3 -m pytest draft/tests/test_mutation_gate.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import mutation_gate as MG  # noqa: E402

MODULE = '''
def double(x):
    return x * 2

def label(x):
    return "big" if double(x) > 10 else "small"
'''

TESTS = '''
import sys
from pathlib import Path
sys.path.insert(0, r"{d}")
import subject as S

def test_double_doubles():
    assert S.double(4) == 8

def test_label_uses_the_threshold():
    assert S.label(6) == "big"
    assert S.label(2) == "small"
'''


def scenario(tmp_path, module=MODULE):
    d = tmp_path / "pkg"
    d.mkdir()
    (d / "subject.py").write_text(module)
    t = tmp_path / "test_subject.py"
    t.write_text(TESTS.format(d=str(d)))
    return str(d / "subject.py"), str(t)


# ── the verdict that is allowed to be a kill ───────────────────────────────
def test_a_REAL_kill_is_reported_as_KILLED_and_names_the_test(tmp_path):
    """The happy path, and it must name WHICH assertion did the killing.
    MUTATION: report KILLED on any failure — see the wrong-test case below."""
    src, tests = scenario(tmp_path)
    r = MG.check(src, "return x * 2", "return x * 3", [tests],
                 must_fail=["test_double_doubles"])
    assert r["verdict"] == "KILLED", r
    assert "test_double_doubles" in r["failed"]


def test_the_FILE_IS_RESTORED_afterwards(tmp_path):
    """A gate that leaves a mutant on disk poisons every later run in the session.
    MUTATION: skip the restore — the next check measures the previous mutation."""
    src, tests = scenario(tmp_path)
    before = Path(src).read_text()
    MG.check(src, "return x * 2", "return x * 3", [tests],
             must_fail=["test_double_doubles"])
    assert Path(src).read_text() == before


def test_it_restores_EVEN_WHEN_THE_RUN_BLOWS_UP(tmp_path):
    """The restore has to survive the failure path too, which is the only path
    where it matters. MUTATION: restore only on the success branch."""
    src, tests = scenario(tmp_path)
    before = Path(src).read_text()
    MG.check(src, "return x * 2", "return x * (", [tests],
             must_fail=["test_double_doubles"])
    assert Path(src).read_text() == before


# ── the five ways a run lies, refused one at a time ────────────────────────
def test_a_MUTANT_THAT_DOES_NOT_COMPILE_is_INVALID_not_survived(tmp_path):
    """THE ONE THAT LIED TO ME TODAY. An unbalanced paren makes pytest report a
    collection error; a harness grepping for FAILED sees nothing and prints
    nothing, and silence reads exactly like survival.

    MUTATION: skip the compile check — this returns SURVIVED, which is the false
    negative that lets a real defect through wearing a clean bill of health."""
    src, tests = scenario(tmp_path)
    r = MG.check(src, "return x * 2", "return x * (", [tests],
                 must_fail=["test_double_doubles"])
    assert r["verdict"] == "INVALID_SYNTAX", r
    assert "compile" in r["detail"].lower()


def test_a_TARGET_THAT_IS_NOT_THERE_is_INVALID_not_survived(tmp_path):
    """Nothing was mutated, so the suite passes — indistinguishable from a
    mutation the tests could not catch. MUTATION: return SURVIVED when the target
    is missing, and every typo in a patch becomes a coverage gap on the record."""
    src, tests = scenario(tmp_path)
    r = MG.check(src, "return x * 7", "return x * 3", [tests],
                 must_fail=["test_double_doubles"])
    assert r["verdict"] == "TARGET_NOT_FOUND", r


def test_a_RED_BASELINE_is_refused_before_anything_is_mutated(tmp_path):
    """A suite that was already failing credits its own failure to the mutation.
    MUTATION: skip the baseline — every kill in a red tree is unearned."""
    src, tests = scenario(tmp_path, module=MODULE.replace("x * 2", "x * 5"))
    r = MG.check(src, "return x * 5", "return x * 3", [tests],
                 must_fail=["test_double_doubles"])
    assert r["verdict"] == "INVALID_BASELINE", r
    assert "test_double_doubles" in r["detail"]


def test_TESTS_THAT_VANISH_are_INVALID_not_a_pass(tmp_path):
    """Fewer failures because there are fewer TESTS is not better code. A mutation
    that breaks collection of the test module itself would otherwise read as
    survival. MUTATION: compare only pass/fail and never the collected count."""
    src, tests = scenario(tmp_path)
    r = MG.check(tests, "def test_label_uses_the_threshold():",
                 "def _disabled_label():", [tests],
                 must_fail=["test_label_uses_the_threshold"])
    assert r["verdict"] == "INVALID_COLLECTION", r
    assert "2" in r["detail"] and "1" in r["detail"]


def test_THE_WRONG_TEST_FAILING_is_not_a_kill(tmp_path):
    """A kill credited to an assertion that never fired is worse than no kill: it
    records coverage that does not exist. MUTATION: accept any failure — and the
    named assertion is never actually exercised."""
    src, tests = scenario(tmp_path)
    r = MG.check(src, "return x * 2", "return x * 3", [tests],
                 must_fail=["test_label_uses_the_threshold"])
    assert r["verdict"] == "SURVIVED", r
    assert "test_double_doubles" in r["failed"]
    assert "did not fail" in r["detail"].lower()


def test_a_GENUINELY_UNCAUGHT_mutation_is_SURVIVED(tmp_path):
    """The other side, and the reason the gate is worth having: a change no test
    notices must be reported as a coverage hole, loudly and by name."""
    src, tests = scenario(tmp_path)
    r = MG.check(src, '"big" if double(x) > 10 else "small"',
                 '"big" if double(x) > 11 else "small"', [tests],
                 must_fail=["test_label_uses_the_threshold"])
    assert r["verdict"] == "SURVIVED", r
    assert r["failed"] == []


def test_a_multi_mutation_RUN_reports_every_verdict_and_a_summary(tmp_path):
    """One call per claim, so "9 mutations, 9 kills" is a machine's statement
    rather than mine. MUTATION: return only the count — an INVALID hidden inside
    a batch is exactly the lie this file exists to stop."""
    src, tests = scenario(tmp_path)
    res = MG.run_all(src, [
        ("return x * 2", "return x * 3", ["test_double_doubles"]),
        ("return x * 2", "return x * (", ["test_double_doubles"]),
        ("return x * 9", "return x * 3", ["test_double_doubles"]),
    ], [tests])
    assert [r["verdict"] for r in res["results"]] == [
        "KILLED", "INVALID_SYNTAX", "TARGET_NOT_FOUND"]
    assert res["killed"] == 1 and res["invalid"] == 2
    assert res["all_killed"] is False, "a batch with an INVALID is not all-killed"
