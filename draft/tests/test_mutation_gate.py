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

SIX WAYS A MUTATION RUN CAN LIE, and this gate refuses each by name:

  1. THE BASELINE WAS ALREADY RED — a pre-existing failure is read as the kill.
  2. THE TARGET STRING WAS NOT THERE — nothing was mutated; the suite passes and
     it looks like survival.
  3. THE TARGET WAS NOT UNIQUE — the first occurrence is mutated, and it need not
     be the line the caller meant.
  4. THE MUTANT DOES NOT COMPILE — collection error, no test result at all.
  5. TESTS VANISHED — the mutation deleted or hid tests, so "fewer failures"
     means fewer tests, not better code.
  6. THE WRONG TEST FAILED — something unrelated broke, and a kill is credited to
     an assertion that never fired.

A verdict is KILLED only when the NAMED test failed, the baseline was green, the
mutant compiled and was UNIQUELY LOCATED, and the collection count held.
Everything else is INVALID or SURVIVED, and INVALID is never quietly treated as
either.

The sixth was found the same way the third was, by this gate failing me: a target
that existed in two functions came back SURVIVED against a line it never touched.
Every refusal here was added after a run lied in that way — none anticipated.

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


# ── the six ways a run lies, refused one at a time ─────────────────────────
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


def test_an_EMPTY_MANIFEST_is_not_all_killed(tmp_path):
    """THE GREEN TICK THAT VERIFIED NOTHING. The weekly job exits on `all_killed`,
    and the whole reason it does is this case: if the manifest is empty, renamed,
    or its modules key is stripped, then `checked` is 0, NOTHING RAN, and the
    regression list is empty because there was nothing to regress. An exit keyed
    on `regressed` alone reports success for a run that re-applied no mutation.

    I shipped that exact bug and found it by reading a run's log rather than
    trusting its green tick. `all_killed` must be False when `checked` is 0.
    MUTATION: `all_killed = not regressed` — the emptiness guard deleted."""
    p = tmp_path / "manifest.json"
    p.write_text('{"modules": {}}')
    out = MG.verify_manifest(str(p), root=str(tmp_path))
    assert out["checked"] == 0, out
    assert out["regressed"] == [], "nothing ran, so nothing can have regressed"
    assert out["all_killed"] is False, (
        "a run that checked nothing is not a passing run", out)


def test_a_MISSING_MANIFEST_RAISES_rather_than_reporting_a_clean_run(tmp_path):
    """The same failure one step earlier. A manifest that has been moved or
    deleted must stop the job, not read as an absence of findings — so this
    pins the raise. If a future caller wraps this in a try/except that yields
    `{}`, the empty-manifest assertion above is the second line of defence."""
    import pytest
    with pytest.raises(FileNotFoundError):
        MG.verify_manifest(str(tmp_path / "not_here.json"), root=str(tmp_path))


def test_an_AMBIGUOUS_TARGET_is_refused_rather_than_mutating_the_first_hit(tmp_path):
    """THE SIXTH LIE, and this gate shipped with it. `replace(old, new, 1)` takes
    the FIRST occurrence. When the target string exists in two functions, the one
    the caller meant can go untouched: the mutant still compiles, the named test
    correctly passes, and the verdict comes back SURVIVED — a coverage hole
    reported against a line that was never mutated. SURVIVED is the actionable
    verdict, so the lie costs a test written for a gap that does not exist.

    Found live on this very module: `doc = json.loads(p.read_text())` appears in
    both `record` and `verify_manifest`. MUTATION: drop the uniqueness check —
    and note the module below is built so the FIRST hit is the wrong one, which
    is the only arrangement under which the old code lies rather than guesses
    right by luck."""
    module = (
        "def unused(x):\n"
        "    scale = 2\n"          # first occurrence — nothing asserts on it
        "    return x * scale\n\n"
        "def double(x):\n"
        "    scale = 2\n"          # the one the caller means
        "    return x * scale\n\n"
        "def label(x):\n"
        '    return "big" if double(x) > 10 else "small"\n')
    src, tests = scenario(tmp_path, module=module)
    r = MG.check(src, "    scale = 2", "    scale = 3", [tests],
                 must_fail=["test_double_doubles"])
    assert r["verdict"] == "AMBIGUOUS_TARGET", r
    assert "2 times" in r["detail"], r["detail"]
    assert r["verdict"] in MG.INVALID, "ambiguity proves nothing in either direction"
    assert Path(src).read_text() == module, "refused before touching the file"


def test_an_AMBIGUOUS_TARGET_cannot_be_RECORDED_as_a_kill(tmp_path):
    """The mirror case, and the worse one. A SURVIVED wastes an afternoon; an
    ambiguous target that happens to kill gets written to the manifest, and the
    weekly job then re-applies it to the wrong site every Monday forever, in a
    file that keeps evolving underneath it. MUTATION: let ambiguity through
    `run_all` — the batch reports all_killed and `record` writes the entry."""
    module = (
        "def unused(x):\n"
        "    scale = 2\n"
        "    return x * scale\n\n"
        "def double(x):\n"
        "    scale = 2\n"
        "    return x * scale\n\n"
        "def label(x):\n"
        '    return "big" if double(x) > 10 else "small"\n')
    src, tests = scenario(tmp_path, module=module)
    res = MG.run_all(src, [("    scale = 2", "    scale = 3",
                            ["test_double_doubles"])], [tests])
    assert res["results"][0]["verdict"] == "AMBIGUOUS_TARGET", res
    assert res["invalid"] == 1 and res["killed"] == 0, res
    assert res["all_killed"] is False, "an ambiguous target is not a kill"


def test_an_EMPTY_BATCH_is_not_all_killed(tmp_path):
    """THE GREEN TICK THAT VERIFIED NOTHING, one level below the manifest. `all()`
    over an empty list is True, so a batch that ran no mutations at all reported
    `all_killed` — and `all_killed` is what every caller keys its exit on.

    The earlier form was `killed == len(results) and invalid == 0`, where 0 == 0
    holds for the empty batch. The second conjunct was implied by the first and
    could not be killed by any test; the case that actually bites was unguarded.
    MUTATION: drop `bool(results)`."""
    src, tests = scenario(tmp_path)
    res = MG.run_all(src, [], [tests])
    assert res["results"] == [] and res["killed"] == 0
    assert res["all_killed"] is False, (
        "a batch that mutated nothing has not killed everything", res)


def test_RECORDING_AN_EMPTY_RESULT_LIST_is_refused(tmp_path):
    """Where the empty batch would have landed. `record` refuses any non-KILLED
    verdict by scanning for one — and an empty list contains none, so the module
    would be filed with `"mutations": []`. That entry reads as coverage, verifies
    instantly, and never fails. MUTATION: drop the emptiness refusal."""
    import pytest
    p = tmp_path / "m.json"
    with pytest.raises(ValueError) as e:
        MG.record("draft/backtest/whatever.py", ["t.py"], [], path=str(p))
    assert "empty" in str(e.value).lower() or "no results" in str(e.value).lower()
    assert not p.exists(), "nothing may be written on the refusal path"
