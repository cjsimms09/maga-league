"""EVERY GATE CI RUNS MUST HAVE BEEN SEEN TO FAIL.

── WHY THIS FILE EXISTS, AND WHY IT IS DIFFERENT FROM THE OTHERS ──────────────

`PREDICTION-LEDGER.md` P69, filed 2026-08-18:

    "The gate that catches a defect class is written AFTER an instance of it,
    never before ... Graded FALSE if between now and 08-22 a gate lands that was
    written from the PATTERN rather than from a fresh instance."

Nothing failed to prompt this. Four instances of ONE shape turned up in a single
day — the Kalshi probe's six false nulls printed as answers, `intervention_rate`
scoring a pool that had gone empty, `prediction_ledger_check` collecting ids into
an array it never compared, `test_defect_register` iterating rows and never
comparing ids either. That is a rate, and the shape is always the same:

    A CHECK THAT CANNOT FAIL, REPORTED AS A CHECK THAT PASSED.

So this asks the question directly, of the gates themselves: for each tool CI runs
as a gate, is there a test that has actually SEEN it refuse something?

── WHAT IT FOUND ON THE DAY IT WAS WRITTEN ────────────────────────────────────

Seven gate tools. Five had a fail arm. Two had no test file at all:

  · `weekly_grade_runner.js` — turned out to carry its own fixture self-check
    against real 2023 box scores with hand-summed expected answers. That IS a
    fail arm; it just does not live in a test file. Recorded as such below.
  · `commitments_check.js` — nothing. And its own header argued for exactly this:
    *"a check whose firing condition cannot be exercised is a check nobody has
    seen fire"*, which is why it has a `--today` argument. The author saw the
    problem, built the hook, wrote the sentence, and no test ever used it.
    `draft/tests/commitments_check.test.js` now exercises all of it.

── THE BAR, AND WHY IT IS SPELT OUT ───────────────────────────────────────────

"Has a test file" is not the bar and would be theatre. The bar is a test that
constructs a bad input and asserts the gate REFUSES it — a FAIL ARM. A suite of
happy-path assertions on a gate is the vacuous shape wearing a test's clothes.

This is a HARD gate for the tools listed, not a ratchet: the list is small, the
fix is always writing one test, and there is no legacy pile to work off.

── AND THE SAME QUESTION ONE LEVEL OUT (second half of this file) ─────────────

A scheduled workflow that writes to the repo unattended, with nothing verifying
what it wrote, is this same shape with a cron on it. Measured 2026-08-18:

    24 scheduled workflows · 18 of them COMMIT data
      5 run a test suite before committing (draft-data, lab, self-audit,
        standing-check, market-capture)
      2 delegate to a script that self-checks (own-weekly-proj, weekly-grade)
     11 commit with nothing verifying  ← ratcheted below

That half is a RATCHET, not a wall, and the difference is deliberate: eleven new
reds four days before the draft would be switched off by Saturday.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Tools invoked as gates from CI workflows or package.json. Kept as an explicit
#: list rather than parsed out of the YAML, so ADDING a gate is a deliberate act
#: that lands here in the same commit — and so this file cannot go quiet by the
#: parse silently matching nothing, which is the very defect it exists to catch.
GATES = [
    "adp_drift_check.js",
    "commitments_check.js",
    "lane_status.js",
    "prediction_ledger_check.js",
    "register_recheck_check.js",
    "routes_response_check.js",
    "weekly_grade_runner.js",
]

#: A test that has SEEN the gate refuse. The project already writes these by name.
FAIL_ARM = re.compile(
    r"FAIL ARM|is DETECTED|can actually fail|KNOWN[- ]POSITIVE|"
    r"assert\.strictEqual\(\s*r\.status,\s*[12]|status,\s*[12]\)|"
    r"problems\.some\(|\.problems\.length\s*[>=]=?\s*[1-9]",
    re.I)

#: Gates whose fail arm lives INSIDE the tool rather than in a test file, with the
#: reason. An entry here is a claim about the tool's own source and is verified
#: below — it is not an exemption you can add by asserting one.
SELF_CHECKED = {
    "weekly_grade_runner.js": "resolution-pipe self-check (FIXTURE, not league evidence)",
}


def _test_files_for(tool: str):
    stem = tool.rsplit(".", 1)[0]
    return [p for p in [
        ROOT / "draft" / "tests" / f"{stem}.test.js",
        ROOT / "draft" / "tests" / f"test_{stem}.py",
        ROOT / "draft" / "tests" / f"{stem}.test.py",
    ] if p.exists()]


def test_CONTROL_every_named_gate_actually_exists():
    """Guards the way this file would go quiet: naming tools that are gone."""
    missing = [g for g in GATES if not (ROOT / "draft" / "tools" / g).exists()]
    assert not missing, f"GATES names tools that do not exist: {missing}"
    assert len(GATES) >= 7, f"the gate list shrank to {len(GATES)} — was that deliberate?"


#: ── DOES CI ACTUALLY READ THE GATE'S ANSWER? (A, 2026-09-01, register 461) ──
#:
#: A gate whose exit code is discarded is a gate that cannot refuse anything, no
#: matter how good its fail arm is. Requiring a fail arm from such a tool is
#: theatre in the other direction: the test file gets written, the check stays
#: inert, and the row above reads green.
#:
#: FOUND BY DERIVING THE GATE SET FROM THE WORKFLOWS instead of trusting the
#: hand-maintained list: `lane_status.js` is named in GATES and CI runs it in
#: TWO places — ci.yml:542 and inbox-health.yml:64 — and BOTH end in `|| true`.
#: Its refusal has never been able to stop anything.
#:
#: That is not necessarily wrong; a lane report may be informational on purpose.
#: What is wrong is it being indistinguishable from an enforced gate. So the
#: distinction is DECLARED and then CHECKED against the workflows, the same way
#: SELF_CHECKED is checked against the tool's source.
REPORT_ONLY = {
    "lane_status.js": "branch/lane inventory — informational, and CI runs it "
                      "`|| true` in ci.yml and inbox-health.yml. Kept in GATES "
                      "so it still needs a fail arm (the tool should be correct "
                      "about what it reports), but nothing may claim its exit "
                      "code stops a build.",
}


def _workflow_invocations(tool):
    """(enforced, report_only) counts of this tool across .github/workflows."""
    enforced = reported = 0
    pat = re.compile(r"(?:node|python3?|bash)\s+draft/tools/" + re.escape(tool) + r"([^\n]*)")
    for wf in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
        for m in pat.finditer(wf.read_text(errors="ignore")):
            rest = m.group(1)
            if "|| true" in rest or "|| echo" in rest:
                reported += 1
            else:
                enforced += 1
    return enforced, reported


def test_a_gate_whose_exit_code_CI_discards_is_declared_not_silent():
    """⚠️ THE HALF THE FAIL-ARM CHECK CANNOT SEE. A tool can have a perfect fail
    arm and still be unable to refuse anything, because every workflow that runs
    it appends `|| true`. Both states print the same in a green CI run.

    So each gate is classified from the WORKFLOWS, not from anybody's memory,
    and a gate that CI never enforces must say so in REPORT_ONLY with a reason.
    """
    undeclared, wrongly_declared = [], []
    for tool in GATES:
        enforced, reported = _workflow_invocations(tool)
        if enforced == 0 and tool not in REPORT_ONLY:
            undeclared.append(f"{tool}: {reported} invocation(s), ALL `|| true` — "
                              "CI never reads its answer, and nothing here said so")
        if enforced > 0 and tool in REPORT_ONLY:
            wrongly_declared.append(f"{tool}: declared REPORT_ONLY but CI reads its "
                                    f"exit code in {enforced} place(s) — the "
                                    "exemption is now false and hides a real gate")
    assert not undeclared, "\n  ".join([""] + undeclared)
    assert not wrongly_declared, "\n  ".join([""] + wrongly_declared)


def test_CONTROL_the_invocation_scan_can_tell_the_two_apart():
    """Rule 3e: the scan above is asserted to find nothing, and a scan that
    classifies everything the same way would pass forever. Prove it separates
    real cases in this repo — at least one gate CI enforces, and at least one it
    does not."""
    enforced_any = [g for g in GATES if _workflow_invocations(g)[0] > 0]
    report_any = [g for g in GATES if _workflow_invocations(g)[0] == 0
                  and _workflow_invocations(g)[1] > 0]
    assert enforced_any, ("no gate at all reads its exit code — the scan is "
                          "matching nothing and every arm above is vacuous")
    assert report_any, ("no gate is report-only; if that became true the "
                        "REPORT_ONLY exemption should be deleted, not left "
                        "standing as an unused escape hatch")


def test_every_gate_has_a_test_that_has_seen_it_refuse():
    """The bar is a FAIL ARM, not the existence of a test file."""
    bad = []
    for tool in GATES:
        if tool in SELF_CHECKED:
            continue
        files = _test_files_for(tool)
        if not files:
            bad.append(f"{tool}: NO TEST FILE — it runs in CI and has never been seen to fail")
            continue
        if not any(FAIL_ARM.search(p.read_text(encoding="utf8")) for p in files):
            bad.append(f"{tool}: has {[p.name for p in files]} but no fail arm — "
                       "every assertion is a happy path")
    assert not bad, (
        "gates CI trusts that nothing has ever watched refuse:\n  " + "\n  ".join(bad))


def test_a_SELF_CHECKED_exemption_must_be_true_of_the_TOOL_not_just_claimed():
    """An exemption list you can extend by writing in it is not a gate.

    So each entry names a string that must actually appear in the tool's source,
    and the tool must also be able to exit non-zero — a self-check that cannot
    fail is the same defect one level down.
    """
    for tool, marker in SELF_CHECKED.items():
        src = (ROOT / "draft" / "tools" / tool).read_text(encoding="utf8")
        assert marker in src, f"{tool} does not contain its claimed self-check {marker!r}"
        # THE FIRST VERSION OF THIS LINE WAS WRONG AND IT ACCUSED THE TOOL.
        # It matched `process.exit(1` literally, and `weekly_grade_runner.js` ends
        # with `process.exit(ok ? 0 : 1)` — a conditional exit, which is the normal
        # way to write this and satisfies the requirement exactly. The tool was
        # fine; my matcher was too narrow. Any exit that is not unconditionally
        # zero counts.
        assert re.search(r"process\.exit\((?!0\s*\))|exitCode\s*=\s*[1-9]", src), \
            f"{tool}'s self-check cannot make it exit non-zero — it is a report, not a gate"


def test_FAIL_ARM_this_check_can_itself_fail():
    """Rule 3e applied to this file: a probe with no demonstrated positive is a bug report."""
    assert FAIL_ARM.search("ok('FAIL ARM — an empty registry exits 2', ...)")
    assert FAIL_ARM.search("assert.strictEqual(r.status, 2)")
    assert not FAIL_ARM.search("ok('the happy path returns a list of rows', ...)"), \
        "the matcher accepts a pure happy-path suite, so it would never fail"


def test_CONTROL_the_live_gates_really_do_pass_this_today():
    """States the measured position rather than only guarding the future.

    On 2026-08-18: 7 gates, 6 with a fail arm in a test file, 1 self-checked.
    """
    with_arms = [g for g in GATES
                 if g not in SELF_CHECKED
                 and any(FAIL_ARM.search(p.read_text(encoding="utf8"))
                         for p in _test_files_for(g))]
    assert len(with_arms) == len(GATES) - len(SELF_CHECKED), \
        f"only {len(with_arms)} of {len(GATES) - len(SELF_CHECKED)} carry a fail arm"


def test_the_scan_tool_that_found_this_still_runs():
    """`vacuous_check_scan.py` is the wide version of this question. Keep it alive.

    It is a READING LIST, not a gate — its precision was measured at roughly 4 in 5
    on a hand-checked sample of five, which is fine for a list and not good enough
    to fail a build on. This asserts only that it still parses and still finds the
    shape somewhere, because a scanner returning zero is the defect it looks for.
    """
    import sys
    sys.path.insert(0, str(ROOT / "draft" / "tools"))
    import vacuous_check_scan as V
    hits = V.scan()
    assert len(hits) > 0, "the wide scan found nothing at all — check its regexes"
    assert os.path.exists(ROOT / "draft" / "tools" / "vacuous_check_scan.py")


# ── ONE LEVEL OUT: THE SCHEDULED JOBS THAT COMMIT DATA ──────────────────────────
# Same question as above, asked of the workflows instead of the gate tools. A
# scheduled job that writes to the repo unattended and has nothing verifying what
# it wrote is the vacuous-green shape with a cron on it: the run is green, the
# commit lands, and the only signal that it was wrong is a number that quietly
# moves.
#
# ⚠️ MY FIRST MEASUREMENT OF THIS WAS WRONG AND THE CORRECTION IS THE USEFUL PART.
# I asked "does any file under draft/tests/ mention this workflow's name?" — a
# one-directional proxy. `standing-check.yml` failed it and should not have: it
# runs `pytest test_sleeper_trending.py` and `node component_write.test.js` INSIDE
# ITSELF, under the step names "Test the capture and the check before trusting
# either" and "Test the writer before trusting what it writes". The relationship
# runs workflow→test and my grep only looked the other way.
#
# So the bar here is the one `standing-check` already sets, and it is house style
# rather than anything invented: BEFORE YOU COMMIT, RUN SOMETHING THAT CAN SAY NO.
# Either a test suite in the workflow, or a script that self-checks.
#
# MEASURED 2026-08-18: 24 scheduled workflows · 18 commit data · 5 run a test
# suite first (draft-data 8, lab 12, self-audit 4, standing-check 2,
# market-capture 1) · 2 delegate to a self-checking script (own-weekly-proj,
# weekly-grade) · 11 commit with nothing verifying.
#
# A RATCHET AT 11, NOT A WALL. Eleven reds four days before the draft would be
# switched off by Saturday — `intervention-rate` wrote that epitaph. It cannot get
# worse, and it comes down as lanes fix them.

WF_DIR = ROOT / ".github" / "workflows"
#: ⚠️ `CONTROL:` ADDED 2026-08-31 (A, register 443) BECAUSE THE DETECTOR DID NOT
#: KNOW THIS REPO'S OWN WORD FOR A SELF-CHECK. `week-brief.yml` landed today and
#: pushed this ratchet to 12, refusing the board publish. But
#: `draft/tools/build_week_brief.py` has FOUR real controls that refuse and
#: return non-zero — "🔴 CONTROL: Cory's roster not found or <10 players —
#: refusing to write" — and the workflow propagates that exit code and does not
#: commit. That IS the bar this file states in its own words: "BEFORE YOU
#: COMMIT, RUN SOMETHING THAT CAN SAY NO." The detector missed it only because
#: it matched on `self_check|FIXTURE|known-positive|sanity` and this project
#: writes `CONTROL:`.
#:
#: MEASURED before changing it, not after: adding `CONTROL:` reclassifies
#: EXACTLY ONE workflow — `week-brief` — and the count returns to 11. Nothing
#: else moves, so this is not a widened net, and THE BASELINE IS NOT RAISED.
#:
#: ⚠️ AND MY FIRST MEASUREMENT SAID THE OPPOSITE — "15 unverified, it gets
#: worse" — because I rebuilt the regex and dropped the `re.I`, so `FIXTURE`
#: and `sanity` stopped matching. Plausible, confident, wrong, and one keystroke
#: from being written into a register row. Caught only by running all three
#: variants side by side. Rule 3f, on the probe I wrote to check my own fix.
_SELF_CHECK = re.compile(r"self[_ -]?check|FIXTURE|known[- ]positive|sanity|CONTROL:", re.I)


def _scheduled_committing_workflows():
    out = []
    for w in sorted(WF_DIR.glob("*.yml")):
        src = w.read_text(encoding="utf8")
        if not re.search(r"^\s*schedule:", src, re.M):
            continue
        if "git commit" not in src:
            continue
        runs_tests = bool(re.search(r"(?:pytest|node)\s+\S*draft/tests/\S+", src))
        scripts = set(re.findall(r"(?:python3?|node)\s+((?:draft|src)/\S+\.(?:py|js))", src))
        self_checks = any((ROOT / s).exists()
                          and _SELF_CHECK.search((ROOT / s).read_text(errors="ignore"))
                          for s in scripts)
        out.append((w.stem, runs_tests or self_checks))
    return out


#: Lower this in the commit that earns it. A ratchet nobody tightens is a
#: high-water mark. See the paragraph above for what "verified" means here.
UNVERIFIED_COMMITTING_WORKFLOWS = 11


def test_scheduled_jobs_that_commit_data_do_not_grow_more_unverified():
    rows = _scheduled_committing_workflows()
    unverified = sorted(name for name, ok in rows if not ok)
    assert len(unverified) <= UNVERIFIED_COMMITTING_WORKFLOWS, (
        f"{len(unverified)} scheduled workflows commit data with nothing verifying it "
        f"(baseline {UNVERIFIED_COMMITTING_WORKFLOWS}):\n  " + "\n  ".join(unverified))


def test_CONTROL_the_workflow_scan_is_not_matching_nothing():
    """The way this check would die quietly: the glob or the regex stops matching."""
    rows = _scheduled_committing_workflows()
    assert len(rows) >= 15, f"only {len(rows)} scheduled committing workflows found"
    assert any(ok for _, ok in rows), "not one workflow reads as verified — the detector is blind"
    assert any(not ok for _, ok in rows), "every workflow reads as verified — too good to be true"


def test_standing_check_is_the_model_and_still_does_what_it_claims():
    """The KNOWN-POSITIVE. If this stops holding, the bar above lost its example."""
    src = (WF_DIR / "standing-check.yml").read_text(encoding="utf8")
    assert "before trusting" in src, "standing-check no longer states the test-first intent"
    assert re.search(r"pytest\s+\S*draft/tests/\S+", src), "it no longer runs its test"
    name, ok = next(r for r in _scheduled_committing_workflows() if r[0] == "standing-check")
    assert ok, "the detector no longer credits the workflow it was corrected by"


def test_THE_LIMIT_OF_THIS_CHECK_IS_STATED_NOT_HIDDEN():
    """Script detection is a regex over `run:` blocks and it MISSES inline python.

    `data-inventory` and `external-ingest-run` invoke their work through heredocs
    rather than a named script, so this reads them as running zero scripts and
    therefore unverified. That may be unfair to them — it is a limit of the
    measurement, not a finding about those two — and it is written down here so
    the number is not mistaken for a census.
    """
    for wf in ("data-inventory", "external-ingest-run"):
        src = (WF_DIR / f"{wf}.yml").read_text(encoding="utf8")
        found = re.findall(r"(?:python3?|node)\s+((?:draft|src)/\S+\.(?:py|js))", src)
        assert not found, (
            f"{wf} now invokes a named script {found} — re-check whether it is really "
            "unverified, because the reason it was counted so no longer applies")


def test_THE_GATES_LIST_IS_HAND_MAINTAINED_AND_THAT_LIMIT_IS_MEASURED():
    """⚠️ THE HONEST SIZE OF WHAT THIS FILE DOES NOT COVER (register 461).

    `GATES` is seven names typed by hand. Derived from the workflows instead —
    every `node|python3|bash draft/tools/X` whose exit code is READ (no
    `|| true`) — there are FIFTY-EIGHT such tools. Six of the seven listed are
    among them; the other fifty-two are not covered by the fail-arm rule above.

    THAT IS NOT FIFTY-TWO DEFECTS AND MUST NOT BE READ AS ONE. Most are
    PRODUCERS — `attach_draftsharks.py`, `emit_seat_plan.js`,
    `blended_projection.js` — whose non-zero exit means "it crashed", not "it
    refused". Demanding a fail arm from a producer is the vacuous shape wearing
    a gate's clothes, and a check that fires on a fifty-two-item pre-existing
    pile is a check people learn to skip (registers 388, 417, 422 are all that
    story).

    What IS a defect is that the list cannot notice its own growth: every one of
    the four "only ever seen its green arm" tools found on 2026-09-01 —
    waiver-reco-cron, lineup-reco-cron, weekly_proj_snapshot.py and
    go_status.py — was outside it, and the list gave no signal about any of them.

    So the number is pinned as a MEASUREMENT with a wide band, not as a target:
    it moves when the workflows change, and a large jump is a prompt to look
    rather than a failure. Splitting gates from producers needs a discriminator
    I cannot yet defend, and inventing one to make this number smaller would be
    fitting a taxonomy to a metric.
    """
    pat = re.compile(r"(?:node|python3?|bash)\s+(draft/tools/[\w./-]+)([^\n]*)")
    enforced = set()
    for wf in sorted(WF_DIR.glob("*.yml")):
        for m in pat.finditer(wf.read_text(errors="ignore")):
            if "|| true" in m.group(2) or "|| echo" in m.group(2):
                continue
            enforced.add(m.group(1).rsplit("/", 1)[-1])

    assert len(enforced) >= 40, (
        f"only {len(enforced)} enforced draft/tools invocations found — the scan "
        "is matching far less than it did (58 on 2026-09-01), so it is probably "
        "broken rather than the repo having shrunk")
    assert len(enforced) <= 90, (
        f"{len(enforced)} enforced draft/tools invocations, up from 58 on "
        "2026-09-01. Not a failure in itself — but the fail-arm rule above still "
        "covers seven hand-listed names, so re-read whether any of the new ones "
        "is a real GATE that nobody has watched refuse.")

    covered = enforced & set(GATES)
    assert len(covered) >= 6, (
        f"only {len(covered)} of the hand-listed GATES are enforced in a "
        f"workflow: {sorted(covered)}. The list has drifted away from what CI "
        "runs, which is how it stops meaning anything.")
