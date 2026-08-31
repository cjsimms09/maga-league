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
     lab-bot "Draft board: rebuild" commit), because a green repo with a
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
]


def last_run(workflow):
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/runs?per_page=1"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            runs = json.load(r).get("workflow_runs", [])
        if not runs:
            return ("never-run", None, None)
        run = runs[0]
        return (run["conclusion"] or run["status"], run["created_at"], run["event"])
    except Exception as e:  # noqa: BLE001 — a health check reports, it does not crash
        return (f"api-error: {type(e).__name__}", None, None)


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
        tail = (combined.splitlines() or ["(no output)"])[-1]
        print(f" {'✅' if ok else '🔴'} {tool.split('/')[-1]:30} {tail[:90]}")
        if not ok:
            red.append(f"{tool}: exit {p.returncode} — {tail[:120]}")

    print("\n── BOARD FRESHNESS ─────────────────────────────────────────")
    p = subprocess.run(["git", "log", "-1", "--format=%ci %s", "--grep",
                        "Draft board: rebuild", "origin/main"],
                       capture_output=True, text=True)
    line = p.stdout.strip() or "no publish commit found"
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
