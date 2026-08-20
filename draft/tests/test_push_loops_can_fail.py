# TERRITORY: A
"""CAN EVERY PUSH RETRY LOOP ACTUALLY FAIL?

Register 123: a capture run committed inside the runner, failed all four push
attempts, and exited 0. The loop was
`for i in 1 2 3 4; do git pull --rebase && git push && break; sleep; done`
under `set -uo pipefail` -- no `-e`, so four failures simply fall through and
the step goes green having stored nothing. The CI checkout is discarded when the
job ends, so an unpushed commit is gone.

That row says the idiom is "copied across this repo's capture workflows". THIS
TEST IS HOW THAT CLAIM STAYS TRUE OR STOPS BEING TRUE, instead of being
re-litigated by hand every time someone remembers it.

⚠️ AND IT EXISTS BECAUSE MY FIRST TWO MEASUREMENTS OF IT WERE BOTH WRONG, IN
OPPOSITE DIRECTIONS, AND BOTH LOOKED CREDIBLE:

  probe 1 said 37 broken -- it only looked INSIDE `do ... done`, and the
          correct idiom puts the failure path AFTER the loop
          (`echo "::error::"; exit 1`). I nearly reported 37 broken workflows.
  probe 2 said 1 broken -- it looked at the loop plus 25 following lines, and
          missed `rc=1` ... `exit "$rc"` further down the same step.
  probe 3 says 0 -- scanning the WHOLE STEP, which is the unit that decides
          whether a failure is visible.

Two of the three were caught only by opening the file and reading it. The
scope of a probe IS the probe.

Run: python3 draft/tests/test_push_loops_can_fail.py
"""
import glob
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
WF = sorted(glob.glob(os.path.join(ROOT, ".github", "workflows", "*.yml")))

LOOP = re.compile(r"^\s*(for|while|until)\b.*\bdo\b")
DONE = re.compile(r"^\s*done\b")
STEP = re.compile(r"^\s*- name:")
# A failure is VISIBLE if the step can end non-zero or annotate the run as an
# error. `::warning::` alone is deliberately NOT enough -- register 123's whole
# point is that a warning on a green step is invisible.
FAILS = re.compile(r"exit\s+1|exit\s+\"?\$\{?\w+|::error::")


def audit():
    broken, ok = [], []
    for f in WF:
        lines = open(f).read().split("\n")
        for i, l in enumerate(lines):
            if not LOOP.search(l):
                continue
            end = None
            for j in range(i + 1, len(lines)):
                if DONE.search(lines[j]):
                    end = j
                    break
                if STEP.search(lines[j]):
                    break
            if end is None:
                continue
            body = "\n".join(lines[i:end + 1])
            if "git push" not in body:
                continue
            # THE WHOLE STEP is the scope: a failure path anywhere in it makes
            # the failure visible, wherever the author chose to put it.
            tail = []
            for j in range(end + 1, len(lines)):
                if STEP.search(lines[j]):
                    break
                tail.append(lines[j])
            scope = body + "\n" + "\n".join(tail)
            entry = (os.path.basename(f), i + 1)
            (ok if FAILS.search(scope) else broken).append(entry)
    return broken, ok


_fails = []


def ck(name, cond, detail=None):
    if cond:
        print("PASS  " + name)
    else:
        _fails.append(name)
        print("FAIL  " + name + ("  — " + repr(detail)[:400] if detail is not None else ""))


broken, ok = audit()

ck("CONTROL — the repo actually HAS push retry loops, so this test has "
   "something to check (rule 3e: a check that can never fire is not a check)",
   len(ok) + len(broken) >= 20, {"found": len(ok) + len(broken)})

ck("every push retry loop can FAIL VISIBLY — no loop can run out of attempts "
   "and let its step go green having stored nothing (register 123)",
   not broken, broken)

# FAIL ARM: the detector must actually catch register 123's exact shape.
BAD = """      - name: fake
        run: |
          for i in 1 2 3 4; do
            git pull --rebase && git push && break
            sleep 5
          done
          echo done
"""
import tempfile  # noqa: E402

with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, "bad.yml")
    open(p, "w").write(BAD)
    saved = WF[:]
    WF[:] = [p]
    b2, o2 = audit()
    WF[:] = saved
ck("FAIL ARM — the detector catches register 123's exact loop when it is "
   "handed one, so a green result above means something",
   len(b2) == 1 and not o2, {"broken": b2, "ok": o2})

print("\n  %d push retry loops audited, %d without a visible failure path"
      % (len(ok) + len(broken), len(broken)))
# ── PYTEST ENTRY POINT, ADDED 2026-08-20 ────────────────────────────────────
#
# ⚠️ THIS FILE COLLECTED **ZERO** TESTS UNDER PYTEST AND HAD BEEN READING AS
# GREEN. It is named test_*.py, so the gate's `pytest draft/tests` imports it —
# the checks above run at IMPORT and the old tail called sys.exit(1) on failure.
# pytest reports that as a collection ERROR, not a FAILED line. The board gate
# greps for "^FAILED" to decide what broke, found nothing, and refused to
# publish with "no FAILED lines parsed — treating as BLOCKING". That is the gate
# behaving correctly on a file I wrote badly, and it cost Cory a board rebuild
# the night before keeper lock.
#
# Found by test_ci_loop_integrity, which exists for exactly this: "a test_*.py
# that collects zero tests is a silent no-op — pytest passes it."
#
# The checks still run at import, so the standalone `python3 <file>` output is
# unchanged. This just gives pytest something to collect and fail on.


def test_all_checks_pass():
    assert not _fails, "%d check(s) failed: " % len(_fails) + "; ".join(_fails)


if __name__ == "__main__":
    print("\n%d checks, %d failed" % (3, len(_fails)))
    if _fails:
        print("FAILED")
        sys.exit(1)
