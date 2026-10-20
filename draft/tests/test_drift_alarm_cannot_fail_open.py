"""THE DEPLOY-DRIFT ALARM MUST NOT GO GREEN WHEN IT CANNOT SEE THE ANSWER.

Cory, 2026-10-20: *"did you deploy?? i dont see way a square up with one click"*

He could not see it because NOTHING HAD DEPLOYED SINCE 2026-09-17. Production
served commit `1c3ec642` for 33 days — **396 commits behind, with four stranded
SERVED files** including the `views/bank.ejs` and `src/routes/member.js` of the
change he was looking for — and `site-check.yml` reported SUCCESS every single
day of it.

── HOW A WORKING CHECK STAYED GREEN ──────────────────────────────────────────

The drift block runs `git diff <deployed>..HEAD`. `actions/checkout@v4` had no
`fetch-depth`, so it clones at DEPTH 1 and the deployed commit is simply not in
the repository. The diff fails, and the code filed that as a NOTE —
*"deployed commit not found locally (force-push or shallow clone)"* — which does
not set the exit code.

**So the alarm failed open exactly when the drift was worst.** The further
behind production falls, the more certain it is that the deployed commit lies
outside a shallow clone. A check that is reliable only while there is nothing to
report is not a check.

It is also the load-bearing one: `netlify-ignore.sh`'s own header cites it as
the reason an 8-hour deploy-batching window is safe to have — *"without it this
would be silent stranding, which is the failure the opt-in gate had."* It was
silent stranding.

Run: python3 -m pytest draft/tests/test_drift_alarm_cannot_fail_open.py -q
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

WF = ROOT / ".github" / "workflows" / "site-check.yml"
SRC = WF.read_text(encoding="utf8")


def test_site_check_clones_FULL_HISTORY():
    """Without this the drift check cannot reach the deployed commit, and the
    whole alarm is decoration."""
    assert "fetch-depth: 0" in SRC, (
        "site-check.yml checks out shallow again — `git diff <deployed>..HEAD` "
        "cannot see a deployed commit that is more than one commit back, and "
        "the alarm goes green on a stale production site")
    # and it must be attached to the checkout, not left floating in a comment
    m = re.search(r"uses:\s*actions/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth:\s*0", SRC)
    assert m, "fetch-depth: 0 is present but not wired to the checkout step"


def test_an_UNDIFFABLE_deployed_commit_is_a_PROBLEM_not_a_note():
    """⚠️ THE ASSERTION THAT COST A MONTH. "I cannot tell whether prod is
    stale" must never render as "prod is fine".

    `problems` sets the exit code; `notes` are printed and ignored. The
    un-diffable branch appended to `notes`.
    """
    branch = SRC[SRC.index("if names.returncode != 0:"):]
    branch = branch[:branch.index("else:")]
    assert "problems.append" in branch, (
        "a deployed commit that cannot be diffed is being filed as a NOTE "
        "again — that is the exact failure that hid 396 commits of drift")
    assert "notes.append" not in branch, (
        "the un-diffable case still routes to notes, which do not fail the run")


def test_the_RED_verdict_still_sets_the_exit_code():
    """The other half: when the diff DOES work and the verdict is red, it must
    still be a problem. Guarded so fixing the fail-open case cannot
    accidentally break the path that already worked."""
    # quoted exactly as the workflow writes it — my first version asserted
    # double quotes and the code uses single, which failed on the correct code
    assert re.search(r"if v\['level'\] == 'red':\s*\n\s*problems\.append\(v\['message'\]\)", SRC), \
        "a red drift verdict no longer sets the exit code"


def test_the_LIVE_drift_today_is_RED_when_history_is_available():
    """Rule 3e: an alarm that has only ever been quiet has not been tested.
    Run against real history, the same code must call the real situation red.

    ⚠️ Written so it does NOT depend on prod staying stale — it asserts the
    verdict matches what the files say, which holds once prod catches up too.
    That is the trap this repo keeps finding: a test that needs the defect to
    persist goes red for succeeding.
    """
    import subprocess
    import deploy_drift as DD

    dep = "1c3ec6425a558aa774cfa4f327d73ebfbf2a8a22"
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                          capture_output=True, text=True).stdout.strip()
    names = subprocess.run(["git", "diff", "--name-only", f"{dep}..{head}"],
                           cwd=ROOT, capture_output=True, text=True)
    if names.returncode != 0:
        import pytest
        pytest.skip("this clone lacks the historical deployed commit")
    changed = [x for x in names.stdout.splitlines() if x.strip()]
    v = DD.assess(changed, dep, head, len(changed))
    served = v["served"] + v["draft"]
    # the verdict must AGREE with whether served files actually moved
    assert (v["level"] == "red") == bool(served), (
        f"verdict {v['level']} disagrees with {len(served)} stranded "
        f"served/draft file(s): {served[:5]}")
    if served:
        assert "behind" in v["message"]
