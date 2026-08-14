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

SEVEN WAYS A MUTATION RUN CAN LIE, and this gate refuses each by name:

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
  7. THE SUITE COULD NOT BE COLLECTED — pytest prints ERROR, not FAILED, so an
     unimportable test file greps as a GREEN baseline and everything measured
     against it comes back SURVIVED.

A verdict is KILLED only when the NAMED test failed, the baseline was green, the
mutant compiled and was UNIQUELY LOCATED, and the collection count held.
Everything else is INVALID or SURVIVED, and INVALID is never quietly treated as
either.

The sixth and seventh were found the same way the third was, by this gate failing
me. A target that existed in two functions came back SURVIVED against a line it
never touched. Then a test file needing its directory's conftest gave a green
baseline and three SURVIVED verdicts on a module whose tests all pass in CI.
Every refusal here was added after a run lied in that way — none anticipated.

Run: python3 -m pytest draft/tests/test_mutation_gate.py -q
"""
import json
import sys
import tempfile
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import mutation_gate as MG  # noqa: E402

#: A pid that cannot be running. Signals to `repair` that the declaring process
#: is gone — the abandoned-mutant case, as opposed to a concurrent run.
_DEAD_PID = 2 ** 22 + 7

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


#: The same subject, but the test is PARAMETRISED — the shape that produced a
#: `must_fail` entry which could never match. pytest prints `test_x[4]`; the
#: gate's verdict is exact membership against names it has already stripped.
PARAM_TESTS = '''
import sys
from pathlib import Path
import pytest
sys.path.insert(0, r"{d}")
import subject as S

@pytest.mark.parametrize("n", [4, 5])
def test_double_doubles(n):
    assert S.double(n) == n * 2
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


def test_a_PARAMETRISED_case_may_be_NAMED_THE_WAY_PYTEST_PRINTS_IT(tmp_path):
    """NAMING A CASE `test_x[param]` USED TO BE A NAME THAT COULD NEVER MATCH.

    The gate strips `path::` and `[param]` off what pytest REPORTED and never off
    what the caller CLAIMED, then decides the verdict by exact membership. So the
    obvious way to name a parametrised case — copy it out of pytest's own output —
    produced an entry that matched nothing: SURVIVED on a mutation the suite
    catches, which reads as a coverage hole and sends the reader to fix a test
    that works. Beside a second name that DID match it was quieter and worse: the
    run reported KILLED and the record kept a name that will never fire again.

    Both halves happened to me inside one unit, which is why the normalisation is
    now on both sides rather than one.

    MUTATION: normalise only `_failed_names` — the claim keeps its brackets, the
    verdict goes SURVIVED, and the mutation this file exists to catch is filed as
    uncaught."""
    src, _ = scenario(tmp_path)
    t = tmp_path / "test_param.py"
    t.write_text(PARAM_TESTS.format(d=str(Path(src).parent)))

    r = MG.check(src, "return x * 2", "return x * 3", [str(t)],
                 must_fail=["test_double_doubles[4]"])
    assert r["verdict"] == "KILLED", r
    # AND THE RECORD MUST CARRY THE NORMALISED NAME, not the one it was handed.
    # `test_mutation_manifest.py` looks each `must_fail` up against the `def test`
    # lines in the file; a bracketed name is absent from that list forever, so a
    # manifest holding one fails the cheap standing check every run.
    assert r["must_fail"] == ["test_double_doubles"], r["must_fail"]


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


# ── the seven ways a run lies, refused one at a time ───────────────────────
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


# ── the mutant a KILLED run leaves behind ──────────────────────────────────
def test_a_MUTANT_ABANDONED_BY_A_KILLED_RUN_is_repaired_before_it_is_read(tmp_path):
    """THE ONE THAT COST ME A COMMIT. A verification run was killed by a timeout.
    SIGTERM stops the interpreter without unwinding, so the `finally` restore
    never ran and a FATAL integrity check in the ADP module stayed on disk as
    `if False:`. What made it permanent rather than obvious was the NEXT run:
    `check` read the mutant as the original and, at the end, faithfully restored
    to it. After that no run could tell corrupt source from real source.

    So the repair must happen BEFORE the file is read, and this asserts the
    ordering, not just the repair. MUTATION: call `repair()` after `src =
    p.read_text(...)` — the mutant becomes the original and the test fails on the
    restored content."""
    src, tests = scenario(tmp_path)
    original = Path(src).read_text()
    mutant = original.replace("return x * 2", "return x * 999")
    Path(src).write_text(mutant)
    Path(MG._journal_path()).write_text(json.dumps(
        {"pid": _DEAD_PID, "file": src, "original": original, "mutated": mutant}))

    r = MG.check(src, "return x * 2", "return x * 3", [tests],
                 must_fail=["test_double_doubles"])
    assert r["verdict"] == "KILLED", r
    assert Path(src).read_text() == original, (
        "the abandoned mutant was adopted as the original — this is how a "
        "temporary corruption becomes a permanent one")
    assert not Path(MG._journal_path()).exists()


def test_a_LIVE_run_holding_a_mutation_makes_a_second_run_REFUSE(tmp_path):
    """The other half of the same incident: two gate runs mutating one tree
    overwrite each other's restores, and the loser's mutant is permanent. A
    concurrent run is not repairable — the pid is alive and the file is supposed
    to be mutated right now — so the only safe move is to refuse.

    MUTATION: treat a live pid as abandoned; the second run 'repairs' a file the
    first is still using, and both verdicts become fiction."""
    import os
    src, tests = scenario(tmp_path)
    original = Path(src).read_text()
    Path(MG._journal_path()).write_text(json.dumps(
        {"pid": os.getpid(), "file": src,        # alive by construction
         "original": original, "mutated": original.replace("2", "9")}))
    try:
        with pytest.raises(RuntimeError) as e:
            MG.check(src, "return x * 2", "return x * 3", [tests],
                     must_fail=["test_double_doubles"])
        assert "REFUSING TO START" in str(e.value)
        assert str(os.getpid()) in str(e.value), "name the process that holds it"
    finally:
        Path(MG._journal_path()).unlink(missing_ok=True)


def test_a_FILE_EDITED_AFTER_THE_KILL_is_not_silently_overwritten(tmp_path):
    """PRESERVE BEFORE YOU ALARM. If the file is neither the mutant nor the
    original, somebody edited it after the run died — and an automatic 'restore'
    would discard their work with no record. Refuse, keep the journal (it holds
    the original), and name the file.

    MUTATION: restore unconditionally once the pid is dead."""
    src, tests = scenario(tmp_path)
    original = Path(src).read_text()
    mutant = original.replace("return x * 2", "return x * 999")
    edited = original.replace("return x * 2", "return x * 2  # somebody's work")
    Path(src).write_text(edited)
    Path(MG._journal_path()).write_text(json.dumps(
        {"pid": _DEAD_PID, "file": src, "original": original, "mutated": mutant}))
    try:
        with pytest.raises(RuntimeError) as e:
            MG.check(src, "return x * 2", "return x * 3", [tests],
                     must_fail=["test_double_doubles"])
        assert "REFUSING TO START" in str(e.value)
        assert Path(src).read_text() == edited, "their edit must survive"
        assert Path(MG._journal_path()).exists(), "the journal still holds the original"
    finally:
        Path(MG._journal_path()).unlink(missing_ok=True)


def test_the_JOURNAL_IS_WRITTEN_BEFORE_THE_MUTATION_not_after(tmp_path):
    """The window this closes is small and is exactly where the kill landed: if
    the journal were written after the file, a process killed in between would
    leave a mutant that nothing on disk declares, and no later run could repair
    it. So the journal must describe the bytes that are on disk AT THE TIME they
    are on disk.

    Observed from inside the mutated window, by a probe test the gate itself runs
    while the subject is mutated. The probe RECORDS what it saw rather than
    asserting, because it also runs during the baseline — when no journal exists
    and no assertion is possible. Reading the record back is what keeps this from
    passing vacuously: a probe that silently never compared anything would leave
    `saw_journal` False.

    MUTATION: journal after the write — `saw_journal` is True and `matched` is
    False, because the file on disk is the mutant while the journal is not yet
    there or still describes nothing."""
    src, tests = scenario(tmp_path)
    seen = tmp_path / "seen.json"
    probe = tmp_path / "test_probe.py"
    probe.write_text(
        "import json\n"
        "from pathlib import Path\n"
        "J, SRC, SEEN = Path(r'%s'), Path(r'%s'), Path(r'%s')\n"
        "def test_probe_records_the_journal_against_the_file():\n"
        "    rec = json.loads(J.read_text()) if J.exists() else None\n"
        "    SEEN.write_text(json.dumps({\n"
        "        'saw_journal': rec is not None,\n"
        "        'matched': bool(rec) and rec['mutated'] == SRC.read_text(),\n"
        "        'differs': bool(rec) and rec['original'] != rec['mutated'],\n"
        "        'names_the_file': bool(rec) and rec['file'] == str(SRC)}))\n"
        % (str(MG._journal_path()), src, str(seen)))

    r = MG.check(src, "return x * 2", "return x * 3", [str(probe)],
                 must_fail=["test_probe_records_the_journal_against_the_file"])
    assert r["verdict"] == "SURVIVED" and r["failed"] == [], r

    got = json.loads(seen.read_text())
    assert got["saw_journal"], (
        "no journal existed while the file was mutated — a kill in that window "
        "leaves a mutant nothing on disk declares")
    assert got["matched"], (
        "the journal did not describe the bytes actually on disk, so `repair` "
        "would refuse it as foreign and the mutant would stay", got)
    assert got["differs"] and got["names_the_file"], got


# ── the two kills, for real: one catchable, one not ────────────────────────
def _reap(pgid):
    """Kill the runner AND the pytest it spawned, as one group.

    CI FOUND THIS, not the test. The job log ended with four `Terminate orphan
    process: pid (…) (python3)` lines. Killing the runner leaves the pytest it
    started still sleeping — it is a child of a dead parent, not of the test — so
    every re-run of these two mutations leaked a process that outlived the run
    that made it. Harmless here because the hold is short and the runner is
    ephemeral, but a test that litters is a test that will one day exhaust
    something at the worst moment, and "the runner cleaned up after me" is not a
    property to depend on.

    The group id is captured at spawn rather than looked up at kill time: once
    the leader is reaped, `getpgid` fails and the survivors are unreachable."""
    import os
    import signal
    try:
        os.killpg(pgid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def _run_until_mutated(tmp_path, hold=15):
    """Start a real `check` in a subprocess and return once the subject file is
    actually mutated on disk — the window a kill has to land in."""
    import os
    import subprocess
    import time
    src, _ = scenario(tmp_path)
    slow = tmp_path / "test_slow.py"
    slow.write_text("import time\ndef test_slow():\n    time.sleep(%d)\n" % hold)
    runner = tmp_path / "runner.py"
    runner.write_text(
        "import sys\n"
        "sys.path.insert(0, r'%s')\n"
        "import mutation_gate as MG\n"
        "MG.check(r'%s', 'return x * 2', 'return x * 3', [r'%s'],\n"
        "         must_fail=['test_slow'],\n"
        # A PRECOMPUTED BASELINE, only so the window opens at once: the baseline
        # run would otherwise sit through the whole hold before anything is
        # mutated, and these two tests would cost a minute to learn nothing extra.
        "         baseline={'failed': [], 'collected': 1, 'rc': 0})\n"
        % (str(HERE.parent / "backtest"), src, str(slow)))
    # OWN SESSION, so the runner and the pytest it spawns form one group that can
    # be reaped together. Without this the inner pytest survives the runner.
    proc = subprocess.Popen([sys.executable, "-B", str(runner)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=True)
    pgid = os.getpgid(proc.pid)
    for _ in range(600):
        if "return x * 3" in Path(src).read_text():
            return proc, src, pgid
        if proc.poll() is not None:
            _reap(pgid)
            raise AssertionError("the run exited before it mutated anything")
        time.sleep(0.1)
    _reap(pgid)
    raise AssertionError("the subject was never mutated — the window never opened")


def test_SIGTERM_MID_MUTATION_restores_the_file(tmp_path):
    """THE EXACT INCIDENT. A two-minute timeout killed a verification run with
    SIGTERM. The interpreter stops without unwinding, `finally` never runs, and
    `if s.get("row_count") != len(rows):` was left on disk as `if False:` — a
    FATAL integrity check disabled in the module that guards the ADP archive,
    which I then committed with a `git add -A` from another shell.

    A timeout is not an exceptional event here: the full manifest takes minutes,
    and every harness and CI runner that runs it has a timeout. MUTATION: drop
    the SIGTERM handler, and the tree is corrupt the first time a run is slow."""
    import signal
    import time
    proc, src, pgid = _run_until_mutated(tmp_path)
    try:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=30)
        for _ in range(50):                      # the handler restores, then dies
            if "return x * 2" in Path(src).read_text():
                break
            time.sleep(0.1)
        assert Path(src).read_text() == MODULE, (
            "SIGTERM left a mutant on disk: %r" % Path(src).read_text())
        assert not Path(MG._journal_path()).exists(), "the journal outlived the mutation"
    finally:
        _reap(pgid)
        Path(MG._journal_path()).unlink(missing_ok=True)


def test_SIGKILL_leaves_a_JOURNAL_that_the_next_run_repairs(tmp_path):
    """SIGKILL cannot be caught by anything, so the handler above is no defence —
    a container reclaimed, an OOM, `kill -9`. What survives is the journal, and
    the requirement is that the NEXT run finds it and puts the file back before
    reading it. Without that the second run adopts the mutant as the original and
    the corruption is permanent, which is what actually happened.

    MUTATION: skip the journal write, and a SIGKILLed run is unrecoverable —
    nothing on disk records what the original bytes were."""
    import signal
    proc, src, pgid = _run_until_mutated(tmp_path)
    proc.send_signal(signal.SIGKILL)
    proc.wait(timeout=30)
    _reap(pgid)          # the pytest it spawned outlives it otherwise

    assert "return x * 3" in Path(src).read_text(), "SIGKILL should leave the mutant"
    assert Path(MG._journal_path()).exists(), "nothing on disk declares the corruption"
    rec = json.loads(Path(MG._journal_path()).read_text())
    assert rec["file"] == src and rec["original"] == MODULE

    out = MG.repair()
    assert out["status"] == "repaired", out
    assert Path(src).read_text() == MODULE
    assert not Path(MG._journal_path()).exists()


def test_verify_manifest_SORTS_NON_KILLS_BY_WHAT_THE_READER_MUST_DO(tmp_path):
    """One list called `regressed` under one sentence — "the test no longer fails
    when its mutation is applied" — was true of one of the three things that can
    happen and the wrong instruction for the other two. A stale entry sends the
    reader hunting a weakened assertion that does not exist; an unverifiable run
    makes every other verdict in the same batch suspect and needs the tree fixed
    before anything else is believed.

    MUTATION: put every non-kill back in `regressed`."""
    mod = tmp_path / "m.py"
    mod.write_text("def f(x):\n    return x * 2\n\ndef g(x):\n    return x + 1\n")
    t = tmp_path / "test_m.py"
    t.write_text("import sys\nsys.path.insert(0, r'%s')\nimport m\n"
                 "def test_doubles():\n    assert m.f(4) == 8\n" % str(tmp_path))
    man = tmp_path / "man.json"
    MG.record(str(mod), [str(t)], [
        {"file": str(mod), "old_full": "return x * 2", "new": "return x * 3",
         "must_fail": ["test_doubles"], "verdict": "KILLED"},
        {"file": str(mod), "old_full": "return x + 1", "new": "return x + 2",
         "must_fail": ["test_doubles"], "verdict": "KILLED"},
        {"file": str(mod), "old_full": "a line no module contains",
         "new": "z", "must_fail": ["test_doubles"], "verdict": "KILLED"},
        {"file": str(mod), "old_full": "return x", "new": "return (x",
         "must_fail": ["test_doubles"], "verdict": "KILLED"},
    ], path=str(man))

    r = MG.verify_manifest(path=str(man), root=".")
    assert r["checked"] == 4 and r["killed"] == 1, r

    # g() is not covered by any assertion — a genuine hole, and the only entry
    # that belongs under "the test stopped failing".
    assert [x["verdict"] for x in r["regressed"]] == ["SURVIVED"], r["regressed"]
    # the missing target and the duplicated one are entries that no longer name a
    # line of this source; nothing is wrong with the test.
    assert sorted(x["verdict"] for x in r["stale"]) == [
        "AMBIGUOUS_TARGET", "TARGET_NOT_FOUND"], r["stale"]
    assert r["all_killed"] is False


def test_a_SUITE_THAT_CANNOT_BE_COLLECTED_is_INVALID_not_green(tmp_path):
    """THE SEVENTH LIE, and it cost me three false SURVIVEDs on a real module.

    `_failed_names` greps for `^FAILED`. pytest prints `ERROR` for a collection
    failure and no FAILED line at all — so a test file that cannot even be
    IMPORTED (a missing sys.path entry, a conftest that only applies when the
    whole directory is run) yields an empty failure list. That reads as a GREEN
    baseline, and then every mutation against it comes back SURVIVED, because
    nothing is capable of failing. SURVIVED is the actionable verdict: it sends
    you to write tests for coverage that already exists.

    `_collect_count` returns None exactly in that case, so the count is the
    signal. MUTATION: drop the guard — the verdict silently becomes SURVIVED."""
    src, _ = scenario(tmp_path)
    broken = tmp_path / "test_uncollectable.py"
    broken.write_text("import a_module_that_does_not_exist\n"
                      "def test_nothing():\n    assert True\n")
    r = MG.check(src, "return x * 2", "return x * 3", [str(broken)],
                 must_fail=["test_nothing"])
    assert r["verdict"] == "INVALID_BASELINE", r
    assert "COLLECTED" in r["detail"], r["detail"]
    assert r["verdict"] in MG.INVALID, "it proved nothing in either direction"


# ── THE JOURNAL MUST NOT BE SHARED WITH THE PROCESSES THE GATE SPAWNS ──────
#
# THIS FILE IS ONE OF THOSE PROCESSES. The manifest records mutations against
# `draft/backtest/mutation_gate.py` whose test path is `test_mutation_gate.py` —
# so every scheduled `verify_manifest` run spawns THIS SUITE as a child while the
# parent holds `mutation_gate.py` mutated on disk. And this suite writes and
# unlinks the journal, because it is the suite that tests the journal.
#
# OBSERVED, NOT REASONED, 2026-08-14 00:55 UTC, mid-run, against a known-good copy:
#
#   $ diff good.py draft/backtest/mutation_gate.py
#   <             "all_killed": bool(results) and all(
#   >             "all_killed": True and all(          <- LIVE MUTATION ON DISK
#   $ cat /tmp/mutation_gate_inflight.json
#     file: /tmp/pytest-of-root/pytest-1114/.../subject.py   <- a CHILD's tmp file
#     pid : 9183                                             <- not the parent
#
# The parent's restore record was gone while its mutant was on disk. A SIGKILL in
# that window leaves `"all_killed": True and all(...)` permanently — a gate that
# reports every batch as fully killed — with nothing on disk declaring it. That is
# the same shape as the incident the journal was written for, inside the journal.


def test_a_CHILD_PROCESS_GETS_ITS_OWN_JOURNAL_and_cannot_touch_the_parents():
    """THE FIX, ASSERTED WHERE IT FAILS. A child that writes the journal — which
    every run of this very suite does — must not be writing the parent's.

    MUTATION: drop the env var from `_pytest` and the child resolves the same
    path, clobbers the parent's record, and the parent's mutant loses the only
    thing on disk that could restore it."""
    import os
    parent = {"pid": os.getpid(), "file": "/parent/subject.py",
              "original": "ORIGINAL", "mutated": "MUTANT"}
    Path(MG._journal_path()).write_text(json.dumps(parent))
    try:
        t = Path(tempfile.mkdtemp()) / "test_child_clobbers.py"
        t.write_text(
            "import json, sys\n"
            "sys.path.insert(0, %r)\n" % str(Path(MG.__file__).resolve().parent) +
            "from pathlib import Path\n"
            "import mutation_gate as MG\n"
            "def test_child_writes_and_deletes_the_journal():\n"
            "    j = Path(MG._journal_path())\n"
            "    j.write_text(json.dumps({'pid': 1, 'file': 'x',\n"
            "                             'original': 'a', 'mutated': 'b'}))\n"
            "    assert j.exists()\n"
            "    j.unlink()\n")
        r = MG._pytest([str(t)])
        assert r.returncode == 0, r.stdout + r.stderr

        held = json.loads(Path(MG._journal_path()).read_text())
        assert held == parent, (
            "a child overwrote or deleted the parent's in-flight record — the "
            "parent's mutant is now unrecoverable and nothing on disk says so")
    finally:
        Path(MG._journal_path()).unlink(missing_ok=True)


def test_the_JOURNAL_PATH_is_read_PER_CALL_not_frozen_at_import(monkeypatch,
                                                                tmp_path):
    """`_pytest` sets the variable for the child AFTER this module is imported, so
    a path resolved at import time would ignore it and the isolation above would
    be decoration.

    MUTATION: resolve it once into a module constant — the child inherits the
    variable, ignores it, and writes to the parent's file anyway."""
    # ⚠ ASSERTED AGAINST THE SYSTEM TEMP DIR, NOT AGAINST "whatever this process
    # currently resolves". My first version captured the ambient value as `default`
    # and compared back to it — which passes standalone and FAILS when this suite
    # runs as a CHILD of a real gate run, because there the variable IS set and
    # `delenv` therefore changes the answer.
    #
    # The gate caught that itself: every mutation in the batch came back
    # INVALID_BASELINE naming this test, rather than crediting twenty-two kills
    # against a suite that was already red. A test whose result depends on who
    # launched it is not a fact about the code, and the refusal is the machinery
    # working — the isolation this test exists to prove is exactly what broke it.
    import tempfile as _tf
    monkeypatch.delenv(MG.JOURNAL_DIR_ENV, raising=False)
    assert MG._journal_path() == Path(_tf.gettempdir()) / "mutation_gate_inflight.json", (
        "a process nobody told must resolve the shared default — every existing "
        "caller and every other test in this file depends on that")
    monkeypatch.setenv(MG.JOURNAL_DIR_ENV, str(tmp_path))
    assert MG._journal_path() == tmp_path / "mutation_gate_inflight.json"


def test_a_CHILD_CANNOT_EVEN_SEE_THE_PARENTS_DECLARATION_mid_run(tmp_path):
    """END TO END, THROUGH `check` — and rewritten because my first version of it
    PASSED WITH THE FIX REVERTED.

    That version asserted the subject was restored afterwards. It always is: the
    parent restores from its own IN-MEMORY copy in a `finally`, so the journal is
    irrelevant on every path except the one where the parent DIES. A test that
    cannot fail for the reason it names is not evidence, and I nearly filed it as
    a kill.

    What actually matters is whether the parent's declaration is REACHABLE by the
    child while the mutation is live. So the child reports what it can see at its
    own journal path, and the parent reads that back.

    MUTATION: share the directory (drop the env var in `_pytest`, or resolve the
    path at import) — the child sees the parent's declaration, which means it can
    also overwrite or delete it, which is the whole defect."""
    d = tmp_path / "pkg"
    d.mkdir()
    src = d / "subject.py"
    src.write_text(MODULE)
    original = src.read_text()
    seen = tmp_path / "seen.txt"

    t = tmp_path / "test_reports_what_it_sees.py"
    t.write_text(
        "import sys\n"
        "sys.path.insert(0, %r)\n" % str(d) +
        "sys.path.insert(0, %r)\n" % str(Path(MG.__file__).resolve().parent) +
        "from pathlib import Path\n"
        "import mutation_gate as MG\n"
        "import subject as S\n"
        "def test_double_doubles():\n"
        "    j = Path(MG._journal_path())\n"
        "    Path(%r).write_text('%%s|%%s' %% (j.exists(), j))\n" % str(seen) +
        # AND THE CLOBBER THIS SUITE REALLY PERFORMS, a dozen times over.
        "    j.unlink(missing_ok=True)\n"
        "    assert S.double(4) == 8\n")

    r = MG.check(str(src), "return x * 2", "return x * 3", [str(t)],
                 must_fail=["test_double_doubles"])
    assert r["verdict"] == "KILLED", r

    visible, child_path = seen.read_text().split("|")
    assert visible == "False", (
        "the child could SEE the parent's in-flight declaration at %s while the "
        "parent held %s mutated — so it can delete it, and a kill in that window "
        "leaves the mutant permanent with nothing on disk declaring it"
        % (child_path, src))
    assert child_path != str(MG._journal_path()), (
        "child and parent resolved the SAME journal path: %s" % child_path)
    assert src.read_text() == original
