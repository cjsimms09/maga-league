#!/usr/bin/env python3
# TERRITORY: relay
"""GO STATUS — the one command behind Cory's "go".

Cory, 2026-08-30, verbatim: "I need you to setup a workflow where I just have
to send go to you and everything that needs to be captured and done gets
done.. figure this out, be the project manager."

This is the mechanical half of that workflow (the judgment half is
GO-RUNBOOK.md). One run answers, from primary sources, the questions a
session would otherwise spend twenty minutes re-deriving:

  1. CAPTURE HEALTH — the last run of every scheduled workflow that captures
     or publishes something, straight from the Actions API (public repo, no
     token needed). A capture that is red or silent IS the finding.
  2. GATE HEALTH — both ledger gates run locally, verdicts printed.
  3. BOARD FRESHNESS — when the live board last actually published (the last
     lab-bot "Player board: rebuild" commit — "Draft board" before
     2026-08-31, and both are matched), because a green repo with a
     week-old board is not in-season ready.

Exit 0 = everything green. Exit 1 = at least one red thing, each printed
with enough context to act. The output is the agenda; the runbook says who
acts on each line.

Run:  python3 draft/tools/go_status.py          (network: api.github.com only)
"""
import json, subprocess, sys, urllib.request
from datetime import datetime, timezone

REPO = "cjsimms09/maga-league"

# Every scheduled job that captures data or publishes an artifact, with the
# cadence a healthy one shows. Add a line when a new capture ships — a capture
# missing from this list is invisible to "go", which is how captures die.
WATCHED = [
    ("draft-data.yml",            "board build+publish (schedule)"),
    # waiver-reco-cron / lineup-reco-cron are NETLIFY scheduled functions,
    # not workflows — the Actions API cannot see them (asking it returned
    # HTTPError on this tool's own first run). Their health proof is the
    # probe line below, by design (register 287).
    ("reco-cron-probe.yml",       "capture-rail weekly proof (covers the two Netlify reco crons)"),
    ("weekly-props-fetch.yml",    "paid Thursday props fetch"),
    ("bovada-lines-capture.yml",  "Thu open + Sun close game lines"),
    ("odds-capture.yml",          "Thu/Sun odds snapshots"),
    ("free-odds-probe.yml",       "free-source census Thu (P299)"),
    ("external-adp-capture.yml",  "nightly ADP snapshot"),
    ("ffanalytics-probe.yml",     "nightly multi-source projections"),
    ("weekly-proj-snapshot.yml",  "the 2027-gradeable proj freeze"),
    ("week-brief.yml",            "THIS-WEEK roster fact sheet (the roster rule's target)"),
]


def last_run(workflow, attempts=2):
    """⚠️ ONE RETRY, ADDED 2026-08-31 (A, register 447), because a transient
    blip was printing a RED agenda item for a healthy job.

    Observed live: this returned `api-error: HTTPError` for `draft-data.yml`
    minutes after that workflow's run finished SUCCESSFULLY; the same URL
    fetched cleanly on the next call. The report was honest — it says
    `api-error`, not `failure`, so it never claimed the capture was broken —
    but it still put a working job on the agenda, and a sweep that cries wolf
    is a sweep people stop reading (registers 388, 417, 422).

    An api-error that SURVIVES the retry is still reported and still red: "I
    could not ask" must never look like "I asked and it is fine" (rule 3e).
    """
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/runs?per_page=1"
    last_err = None
    for _ in range(max(1, attempts)):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                runs = json.load(r).get("workflow_runs", [])
            if not runs:
                return ("never-run", None, None)
            run = runs[0]
            return (run["conclusion"] or run["status"], run["created_at"], run["event"])
        except Exception as e:  # noqa: BLE001 — a health check reports, it does not crash
            last_err = e
    return (f"api-error: {type(last_err).__name__}", None, None)


def main():
    now = datetime.now(timezone.utc)
    print(f"GO STATUS — {now.isoformat(timespec='seconds')}\n")
    red = []

    print("── CAPTURE HEALTH ──────────────────────────────────────────")
    for wf, what in WATCHED:
        concl, at, event = last_run(wf)
        age = ""
        if at:
            dt = datetime.fromisoformat(at.replace("Z", "+00:00"))
            age = f"{(now - dt).total_seconds() / 3600:.0f}h ago"
        mark = "✅" if concl == "success" else "🔴"
        if concl != "success":
            red.append(f"{wf}: last run {concl} ({age or 'never'}) — {what}")
        print(f" {mark} {wf:28} {str(concl):18} {age:>9}  {what}")

    print("\n── GATE HEALTH ─────────────────────────────────────────────")
    for tool in ("draft/tools/prediction_ledger_check.js",
                 "draft/tools/register_recheck_check.js"):
        p = subprocess.run(["node", tool], capture_output=True, text=True)
        ok = p.returncode == 0
        # prediction_ledger_check prints failures to STDERR — reading stdout
        # alone printed "(no output)" beside a red gate, an alarm with no
        # information (caught by the first GO sweep, commit a2e5f3d2).
        combined = (p.stdout + "\n" + p.stderr).strip()
        lines = combined.splitlines() or ["(no output)"]
        # surface the ACTIONABLE line (an overdue/failing row), not whatever
        # happens to print last — the whole point is an agenda, not a shrug
        hot = [l for l in lines if "✗" in l or "OVERDUE" in l or "due 20" in l]
        tail = (hot or lines)[-1].strip()
        print(f" {'✅' if ok else '🔴'} {tool.split('/')[-1]:30} {tail[:90]}")
        if not ok:
            red.append(f"{tool}: exit {p.returncode} — {tail[:120]}")

    print("\n── BOARD FRESHNESS ─────────────────────────────────────────")
    # ⚠️ TWO SUBJECTS, BOTH REQUIRED (A, 2026-08-31, register 447 — touching the
    # relay's file because it is the same edit as the rename, and leaving it
    # would blind this check the moment the rename landed).
    #
    # Cory ruled the rebuild is "the waiver/wire pipeline now, stop calling it
    # the draft board", so draft-data.yml's commit subject became "Player
    # board: rebuild". Every publish BEFORE 2026-08-31 says "Draft board:
    # rebuild" and those are the answer until the next run, so matching only
    # the new string would report "no publish commit found" on a fresh repo.
    #
    # ⚠️⚠️ AND `git log --grep` WAS THE WRONG INSTRUMENT ALL ALONG — it matches the whole
    # commit MESSAGE, body included. Caught 2026-08-31 by the control for the
    # change above: the query returned *"Register 433 closed: the board
    # published — first green rebuild since 08-26"*, a PROSE commit of mine
    # whose body quotes the publish subject. It gave the right freshness by
    # luck, because I happened to write it the same day.
    #
    # So this check could report a stale board as fresh any time somebody
    # merely WROTE ABOUT a rebuild — which is the exact shape of a probe that
    # greens for the wrong reason. Match the SUBJECT, in code, where the
    # comparison is exact.
    #: No commit limit on purpose: this repo commits fast enough that a window
    #: of "the last N" could miss a publish from this morning and report a
    #: fresh board as missing — a guard that fires on ordinary work is a guard
    #: somebody deletes (registers 388, 417, 422).
    SUBJECTS = ("Draft board: rebuild", "Player board: rebuild")
    log = subprocess.run(["git", "log", "--format=%ci\t%s", "origin/main"],
                         capture_output=True, text=True).stdout
    hit = next((ln for ln in log.splitlines()
                if ln.split("\t", 1)[-1].startswith(SUBJECTS)), "")
    line = hit.replace("\t", " ").strip() or "no publish commit found"
    print(f"   last published board: {line[:100]}")
    try:
        pub = datetime.fromisoformat(line.split(" ")[0] + "T" + line.split(" ")[1] + line.split(" ")[2])
        days = (now - pub.astimezone(timezone.utc)).days
        if days >= 2:
            red.append(f"board is {days} days stale (last publish: {line[:40]})")
            print(f"   🔴 {days} days stale")
        else:
            print(f"   ✅ {days} day(s) old")
    except Exception:
        red.append(f"board freshness unparseable: {line[:60]}")

    print("\n── VERDICT ─────────────────────────────────────────────────")
    if red:
        print(f" 🔴 {len(red)} item(s) need action — this list IS the agenda:")
        for r in red:
            print(f"   • {r}")
        return 1
    print(" ✅ everything green — captures running, gates passing, board fresh.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
