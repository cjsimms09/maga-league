# PROPOSED — the weekly self-audit has never once been green, and the reason is its own pip line

**From D, 2026-08-28. Register 428. Patch: one line + a comment.**
**`.github/workflows/self-audit.yml` is E-1's backlog item, which is why this is a proposal.**

## THE FINDING

`SELF-AUDIT.md` reports `HARD: test suite red`. It has reported that on **every
run in its history** — 2026-08-17, 08-24, 08-31. There is no green entry to
compare against.

The cause is not the test suite. It is this line:

```yaml
pip install pytest -q
```

`draft/requirements.txt` lists pandas, numpy, nfl_data_py, requests, lxml,
html5lib, beautifulsoup4 and openpyxl. Without them **pytest aborts at
collection** — it does not run tests and fail, it never starts.

## REPRODUCED, not inferred

Blocking exactly the missing modules and running the audit's own command:

```
6 errors during collection — test_barbell_middle, test_depth_chart_schema,
test_opportunity_inheritance, test_recovery, test_roster_robustness,
test_tiered_outcome_model
Interrupted: 5132 tests collected, 0 run
exit code 2   ->   py_ok=0   ->   tests="RED"
```

With the requirements present, on the same commit: **5,217 tests collect
cleanly, no errors.**

**The JS half is green and is not part of this.** All 25 named suites pass, and
the three extras (`robot-mock`, `server-ledger`, `history_smoke`) pass once
`node_modules` exists — which the audit installs and my first worktree did not.
I checked that rather than reporting them, because "missing node_modules in my
sandbox" is the failure register 378 spent a day separating out.

## CI ALREADY LEARNED THIS, ONE FILE OVER

`ci.yml:151` carries the lesson in its own words:

> *numpy + pandas: … import them at collection time, so without them pytest
> aborts the WHOLE Python step at collection (exit 2, run 32038354284) and
> every other Python suite silently goes unrun.*
>
> *2026-08-18: install from draft/requirements.txt instead of a hardcoded trio.
> The hardcoded list WAS the venv-gap class — the fourth instance … One source
> of truth now*

CI fixed this on 08-18 and wrote down why. **The self-audit was never updated,
so this is the fifth instance of that class — in the one job whose entire
purpose is checking whether everything else is working.**

## WHY IT MATTERS MORE THAN A RED BADGE

An alarm that has never been green carries no information. Nobody reading
`SELF-AUDIT.md` can tell "the suite broke this week" from "this job has never
been able to run the suite" — and the project has already named that failure
twice (register 388, *a guard that fires on ordinary work is a guard people
delete*; register 417, an alarm killed outright). **Worse than a false alarm:
the audit's other checks are real, and they are being read through a RED that
means nothing.**

## THE PATCH

`pip install pytest -q` → `pip install -r draft/requirements.txt -q`, plus a
comment recording why, mirroring ci.yml's.

## APPLYING THIS WILL PROBABLY STILL SHOW RED — stated up front

The full suite, run to completion in this container: **5,201 passed, 9 failed,
7 skipped** (16 minutes). Register 378 already diagnosed a nine-failure set as
*"eight of nine were this container, not the repo"*, so these are very likely
the same and already attributed.

**Both facts hold independently.** With no requirements the audit runs ZERO
tests and reports RED. With requirements it will run 5,217 and may still report
RED on a handful. **The patch does not promise green — it promises a verdict
that is about the suite.**

*(I nearly mis-stated this: the background run printed `[exited with code 0]`
alongside `9 failed`, because the command ended in `| tail` and the shell
reported tail's status. The count in the output is what was read, not the exit
code.)*

## RECOMMENDATION

Apply. Then let one scheduled run complete before trusting the verdict either
way — a RED with the requirements in is the first RED this job has ever
produced that is about the test suite, and it should be read closely rather
than assumed to be this same bug.

## DEFAULT if silent by 2026-09-04

I do not push it — workflows are not mine. I add a one-line note to
`SELF-AUDIT.md` saying the verdict is not currently informative and pointing at
this row, so the next reader is not misled by it.
