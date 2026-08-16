# TERRITORY: A
"""CHAOS DRILL (Cory's ruling, 2026-08-16) — draft-night-sync.yml's BASH, run for real.

The workflow cannot be dispatched from here, but its `run:` block is a bash
script and bash runs locally. This file EXTRACTS that script out of the YAML
(so it cannot drift from what GitHub executes), surrounds it with stub
`python3` / `git` / `sleep` executables whose behavior each scenario controls,
and runs it under `bash -e` — the same `-e` semantics GitHub Actions uses,
which already killed one retry loop in this workflow's history (see the
comment block inside the YAML itself).

WHAT EACH SCENARIO PROVES:
  1. one bad --sync response does NOT abort the night — the retry promise the
     2026-08-15 dry run resurrected stays alive, and the failure is echoed
     with its exit code;
  2. dry_run commits and pushes NOTHING while still proving the polling/exit
     mechanics;
  3. a rejected push rebases and retries, and says so;
  4. a second writer (rebase conflict) is named as the emergency it is, and a
     draft that ends with unpushed commits REFUSES to call itself complete —
     exit 1, "DO NOT trust the remote log";
  5. the completion regex in the YAML matches the REAL `--status` output — a
     drift pin, because the workflow greps for a line status() prints and
     nothing else ties the two files together;
  6. RESIDUALS, pinned as such (workflow YAML is out of this drill's write
     scope — a gate-classification agent's territory rule): (a) max_minutes
     elapsing exits GREEN with only a ::warning:: — an operator reading run
     status alone cannot tell "captured everything" from "gave up"; (b) a
     freeze-sha mismatch printed by --status does not stop the completion
     gate — ⚠ is echoed but the run still ends "draft complete", exit 0.
     Both are named in draft/audit/chaos_drill_2026-08-16.md and the runbook
     addendum tells the operator to read the log line, not the green check.

Run: python -m pytest draft/tests/chaos_drill_workflow_bash_test.py -q
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WF = ROOT / ".github" / "workflows" / "draft-night-sync.yml"
sys.path.insert(0, str(ROOT / "draft"))


# ── extract the run: | block — the ONE script this workflow executes ────────
def workflow_script() -> str:
    lines = WF.read_text().splitlines()
    starts = [i for i, l in enumerate(lines) if l.strip() == "run: |"]
    assert len(starts) == 1, "the workflow gained a second run block — re-derive"
    i = starts[0]
    indent = (len(lines[i]) - len(lines[i].lstrip())) + 2
    body = []
    for m in lines[i + 1:]:
        if not m.strip():
            body.append("")
        elif len(m) - len(m.lstrip()) >= indent:
            body.append(m[indent:])
        else:
            break
    text = "\n".join(body) + "\n"
    assert "log_draft_picks.py" in text and "git push" in text, \
        "extraction produced something that is not the sync script"
    return text


PY_STUB = r"""#!/usr/bin/env bash
# stub python3 — per-call canned output/exit, controlled by $STUB_STATE files
D="$STUB_STATE"
case "$*" in *--sync*) k=sync ;; *) k=status ;; esac
n=$(cat "$D/$k.count" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$D/$k.count"
out="$D/$k.$n.out"; [ -f "$out" ] || out="$D/$k.last.out"
rcf="$D/$k.$n.rc";  [ -f "$rcf" ] || rcf="$D/$k.last.rc"
[ -f "$out" ] && cat "$out"
exit "$(cat "$rcf" 2>/dev/null || echo 0)"
"""

GIT_STUB = r"""#!/usr/bin/env bash
# stub git — models exactly the states the sync script reads:
#   $STUB_STATE/dirty  : exit code for `git diff --quiet` (1 = log changed)
#   $STUB_STATE/ahead  : output of `git rev-list --count` (unpushed commits)
#   push.N.rc          : per-attempt push exits; success clears ahead
#   pull_rc            : `git pull --rebase` exit (1 = rebase conflict)
D="$STUB_STATE"
echo "git $*" >> "$D/git.log"
case "$1" in
  rev-list) cat "$D/ahead" 2>/dev/null || echo 0 ;;
  diff)     exit "$(cat "$D/dirty" 2>/dev/null || echo 0)" ;;
  commit)   echo 0 > "$D/dirty"; echo 1 > "$D/ahead" ;;
  push)     n=$(cat "$D/push.count" 2>/dev/null || echo 0); n=$((n+1))
            echo "$n" > "$D/push.count"
            rcf="$D/push.$n.rc"; [ -f "$rcf" ] || rcf="$D/push.last.rc"
            rc="$(cat "$rcf" 2>/dev/null || echo 0)"
            [ "$rc" = 0 ] && echo 0 > "$D/ahead"
            exit "$rc" ;;
  pull)     exit "$(cat "$D/pull_rc" 2>/dev/null || echo 0)" ;;
  rev-parse) echo deadbeefcafe ;;
esac
exit 0
"""

SLEEP_STUB = "#!/usr/bin/env bash\nexit 0\n"

COMPLETE = "picks       : 150 of 150 logged"
INCOMPLETE = "picks       : 3 of 150 logged"


@pytest.fixture()
def rig(tmp_path):
    bin_dir = tmp_path / "bin"
    state = tmp_path / "state"
    bin_dir.mkdir(), state.mkdir()
    for name, body in (("python3", PY_STUB), ("git", GIT_STUB), ("sleep", SLEEP_STUB)):
        p = bin_dir / name
        p.write_text(body)
        p.chmod(0o755)
    script = tmp_path / "sync.sh"
    script.write_text(workflow_script())

    def put(name, text):
        (state / name).write_text(text if text.endswith("\n") or not text else text + "\n")

    def run(*, dry_run="false", max_minutes="1"):
        env = dict(os.environ)
        env.update({
            "PATH": f"{bin_dir}:{env['PATH']}",
            "STUB_STATE": str(state),
            "DRAFT_ID": "1234567890",
            "MAX_MINUTES": max_minutes,
            "DRY_RUN": dry_run,
            "RUNNER_TEMP": str(tmp_path),
            "GITHUB_REF_NAME": "main",
        })
        return subprocess.run(["bash", "-e", str(script)], env=env, timeout=120,
                              capture_output=True, text=True, cwd=str(tmp_path))

    def gitlog():
        f = state / "git.log"
        return f.read_text() if f.exists() else ""

    return type("Rig", (), {"put": staticmethod(put), "run": staticmethod(run),
                            "gitlog": staticmethod(gitlog), "state": state})


# ── 1. ONE BAD RESPONSE DOES NOT ABORT THE NIGHT ────────────────────────────
def test_1_a_failed_sync_call_is_echoed_and_RETRIED_not_fatal(rig):
    rig.put("sync.1.out", "REFUSING: Sleeper's picks payload is dict, not a list of picks.")
    rig.put("sync.1.rc", "1")
    rig.put("status.1.out", INCOMPLETE)
    rig.put("sync.2.out", json.dumps({"added": 147}))
    rig.put("status.2.out", COMPLETE)
    r = rig.run(dry_run="true")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "sync call failed (exit 1)" in r.stdout, "the retry promise is dead again"
    assert "REFUSING: Sleeper's picks payload" in r.stdout, \
        "the actual error text was swallowed — that is the bash -e trap returning"
    assert "draft complete — every pick logged, stopping." in r.stdout


# ── 2. DRY RUN TOUCHES NOTHING ──────────────────────────────────────────────
def test_2_dry_run_never_commits_and_never_pushes(rig):
    rig.put("sync.last.out", json.dumps({"added": 0}))
    rig.put("status.last.out", COMPLETE)
    rig.put("dirty", "1")           # even with a dirty tree on the runner
    r = rig.run(dry_run="true")
    assert r.returncode == 0
    log = rig.gitlog()
    assert "git commit" not in log and "git push" not in log, log
    assert "DRY RUN" in r.stdout


# ── 3. A REJECTED PUSH REBASES AND RETRIES, OUT LOUD ────────────────────────
def test_3_push_reject_rebases_retries_and_reports(rig):
    rig.put("dirty", "1")
    rig.put("push.1.rc", "1")       # first push rejected
    rig.put("push.last.rc", "0")    # retry lands
    rig.put("sync.last.out", json.dumps({"added": 1}))
    rig.put("status.last.out", COMPLETE)
    r = rig.run()
    assert r.returncode == 0, r.stdout + r.stderr
    assert "push rejected (attempt 1) — rebasing onto the remote and retrying" in r.stdout
    assert "logged and pushed a change to the pick log" in r.stdout
    assert "draft complete" in r.stdout


# ── 4. SECOND WRITER + UNPUSHED FINAL PICK = LOUD FAILURE, NOT GREEN ────────
def test_4_a_second_writer_is_NAMED_and_an_undurable_complete_REFUSES(rig):
    rig.put("dirty", "1")
    rig.put("push.last.rc", "1")    # every push rejected
    rig.put("pull_rc", "1")         # rebase conflicts: someone else edits the log
    rig.put("sync.last.out", json.dumps({"added": 1}))
    rig.put("status.last.out", COMPLETE)
    r = rig.run()
    assert r.returncode == 1, "complete-but-unpushed must not exit green:\n" + r.stdout
    assert "REBASE CONFLICT on the pick log itself — a second writer exists" in r.stdout
    assert "NOT pushed — pick log not durable" in r.stdout
    assert "DO NOT trust the remote log" in r.stdout


# ── 5. DRIFT PIN: the YAML's completion grep vs the REAL status() output ────
def test_5_the_completion_regex_matches_what_status_actually_prints(tmp_path, monkeypatch, capsys):
    m = re.search(r"grep -qE '([^']+)'", workflow_script())
    assert m, "completion grep not found in the workflow script"
    pattern = m.group(1)

    import hashlib
    import log_draft_picks as L
    players = [{"player_id": str(100 + i), "name": "P%d" % i, "position": "RB",
                "vorp": 5.0, "proj_mean": 5.0} for i in range(4)]
    payload = {"players": players, "my_picks": [2],
               "availability_by_pick": {},
               "pick_order": {"picks": [1, 2, 3]}}
    payload["_sha256_of_payload"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode()).hexdigest()
    fz = tmp_path / "freeze.json"
    fz.write_text(json.dumps(payload))
    monkeypatch.setattr(L, "FREEZE", fz)
    monkeypatch.setattr(L, "LOG", tmp_path / "log.jsonl")

    def status_out():
        L.status()
        return capsys.readouterr().out

    def greps(text):
        return subprocess.run(["grep", "-qE", pattern], input=text,
                              text=True).returncode == 0

    L.sync([{"pick_no": i, "player_id": str(100 + i)} for i in range(1, 3)])
    incomplete = status_out()
    assert not greps(incomplete), "2 of 3 must NOT read as complete:\n" + incomplete

    L.sync([{"pick_no": i, "player_id": str(100 + i)} for i in range(1, 4)])
    complete = status_out()
    assert greps(complete), ("status() and the workflow's completion grep have "
                             "drifted apart — the workflow would poll forever:\n"
                             + complete)


# ── 6. RESIDUALS — pinned so a fix (or a regression) shows up here ──────────
def test_6a_RESIDUAL_max_minutes_elapsing_exits_GREEN_with_only_a_warning(rig):
    """PINNED RESIDUAL, not an endorsement: the give-up path ends the job with
    exit 0, so the Actions UI shows the same green check for "captured all
    150" and "gave up at max_minutes". The ::warning:: line is the ONLY
    difference, which is why the runbook addendum makes reading the final log
    line an operator step. Fixing this means editing the YAML — out of this
    drill's write scope. If this test starts failing because the exit code
    became nonzero: good, delete the residual from the audit doc."""
    r = rig.run(max_minutes="0")
    assert "max_minutes (0) elapsed without the log reporting complete" in r.stdout
    assert r.returncode == 0   # ← the residual itself


def test_6b_RESIDUAL_a_freeze_mismatch_warning_does_not_stop_completion(rig):
    """--status prints the ⚠ mixed-freeze line AND the count line; the
    completion gate greps only the count. The ⚠ IS echoed into the run log
    (loud), but the run still ends "draft complete", exit 0 (misleading at a
    glance). Named in the audit doc; record()'s new append-time refusal makes
    the mix nearly unreachable in a single run — this covers a workflow
    re-run after a freeze swap."""
    rig.put("sync.last.out", json.dumps({"added": 0}))
    rig.put("status.last.out",
            "⚠ 2 row(s) joined to a DIFFERENT freeze: [1, 2]\n" + COMPLETE)
    rig.put("status.last.rc", "1")      # status() genuinely exits 1 here
    r = rig.run(dry_run="true")
    assert "DIFFERENT freeze" in r.stdout        # the loud half
    assert "draft complete" in r.stdout          # the misleading half — pinned
    assert r.returncode == 0
