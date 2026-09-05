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
import json, math, re, subprocess, sys, urllib.request
from datetime import datetime, timezone

REPO = "cjsimms09/maga-league"

# Every scheduled job that captures data or publishes an artifact, with the
# cadence a healthy one shows. Add a line when a new capture ships — a capture
# missing from this list is invisible to "go", which is how captures die.
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

WATCHED = [
    ("draft-data.yml",            "board build+publish (schedule)"),
    # waiver-reco-cron / lineup-reco-cron are NETLIFY scheduled functions,
    # not workflows — the Actions API cannot see them (asking it returned
    # HTTPError on this tool's own first run). Their health proof is the
    # probe line below, by design (register 287).
    ("reco-cron-probe.yml",       "capture-rail weekly proof (covers the two Netlify reco crons)"),
    # weekly-props-fetch.yml is DISPATCH-ONLY since 09-01 (Cory: no paid
    # props, no Odds API, ever — CLAUDE.md standing ruling). Watching it here
    # read "✅ paid Thursday props fetch" on every sweep, a green line for a
    # capture that is deliberately dead. The live props capture is the free
    # writer (Sleeper Picks + Underdog, Wed/Thu, register 467) and its census.
    ("free-props-writer.yml",     "FREE props → the arm's input file (Sleeper Picks + Underdog; the paid fetch is off by ruling)"),
    ("free-props-census.yml",     "per-market free-source census (Thu)"),
    ("bovada-lines-capture.yml",  "Thu open + Sun close game lines"),
    ("odds-capture.yml",          "Thu/Sun odds snapshots"),
    ("free-odds-probe.yml",       "free-source census Thu (P299)"),
    ("external-adp-capture.yml",  "nightly ADP snapshot"),
    ("ffanalytics-probe.yml",     "nightly multi-source projections"),
    ("weekly-proj-snapshot.yml",  "the 2027-gradeable proj freeze"),
    ("week-brief.yml",            "THIS-WEEK roster fact sheet (the roster rule's target)"),
    ("weekly-snap-counts.yml",    "nflverse snaps (Wed) — the usage arm's input, NO fallback"),
    ("own-weekly-proj.yml",       "our weekly projection emission (Wed/Thu)"),
    ("own-weekly-grade.yml",      "the Tuesday grader (reads the props file too)"),
    ("weekly-grade.yml",          "Tuesday component grades + tool-vs-random"),
    ("weekly-projection-archive.yml", "the 2027-gradeable weekly archive (Thu)"),
    ("kalshi-capture.yml",        "daily Kalshi ladders"),
]


# ── BOARD FRESHNESS, AS A PURE FUNCTION (A, 2026-09-01, register 460) ────────
#
# ⚠️ THIS CHECK HAD NO TEST AT ALL, AND ITS STALE ARM HAS NEVER FIRED. It was
# written into `main()`, which shells out to `git log origin/main` — so there
# was no seam to hand it a stale log through, and the only verdict anyone had
# ever seen it produce was the green one. That is the same hole registers 458
# and 459 closed on the three captures, in the tool whose entire job is to say
# whether the board is stale.
#
# It also carries a defect worth pinning FOREVER rather than remembering:
# `git log --grep` matched the whole commit MESSAGE, body included, so a PROSE
# commit whose body merely quotes "Player board: rebuild" was returned as the
# publish. Caught 2026-08-31 (register 447) only because I happened to have
# written such a commit that same day, which means it gave the right answer BY
# LUCK. Matching the SUBJECT in code is the fix; the known-negative below is
# what keeps it fixed.
#
# Returns (line, days, problem). `problem` is None when the board is fresh, and
# a human-readable reason otherwise — so the caller never re-derives the rule.
SUBJECTS = ("Draft board: rebuild", "Player board: rebuild")
STALE_AFTER_DAYS = 2


def gate_hot_lines(lines):
    """Which lines of a gate tool's output are ACTIONABLE, and the one to
    show inline when space allows only one.

    Register 488, 2026-09-05: the caller used to print `(hot or lines)[-1]`
    — the LAST matching line, alone — as if it were "the" reason a gate
    failed. `register_recheck_check.js` failed on 21 simultaneously-overdue
    rows the same day this was found, and the sweep's own report showed
    exactly ONE of them, picked by nothing more meaningful than sort order.
    The other 20 were invisible to "go"'s own agenda until someone ran the
    tool directly and read the whole thing by hand — which is the exact
    failure this file exists to prevent one layer up (a capture that ran and
    was not looked at). Returns (hot_lines, one_line_to_show) so the caller
    can both print an accurate count and keep a single-line summary.
    """
    hot = [l for l in lines
           if "✗" in l or "OVERDUE" in l or "due 20" in l
           or re.match(r"\s*\d+\s+2\d{3}-\d\d-\d\d\s+and\s+", l)]
    return hot, (hot or lines)[-1].strip()


def board_freshness(log_text, now):
    """The publish commit is the FIRST line of `git log --format=%ci\t%s` whose
    SUBJECT starts with a publish subject — first because git log is
    reverse-chronological, subject because a body is not a publish.

    ⚠️ BOTH SUBJECTS ARE REQUIRED. Cory ruled the rebuild is "the waiver/wire
    pipeline now" on 2026-08-31 and the subject became "Player board: rebuild";
    every publish before that says "Draft board: rebuild" and those are the
    answer until the next run. Matching only the new string would report "no
    publish commit found" on a repo that has simply not rebuilt today.
    """
    hit = next((ln for ln in (log_text or "").splitlines()
                if ln.split("\t", 1)[-1].startswith(SUBJECTS)
                and "\t" in ln), "")
    line = hit.replace("\t", " ").strip() or "no publish commit found"
    if not hit:
        return line, None, "no publish commit found in origin/main's history"
    try:
        parts = line.split(" ")
        pub = datetime.fromisoformat(parts[0] + "T" + parts[1] + parts[2])
    except Exception:
        return line, None, f"board freshness unparseable: {line[:60]}"
    #: TOTAL SECONDS, NOT `.days` — `timedelta.days` TRUNCATES, so a board 47
    #: hours old reported "1 day" and sat one hour short of the alarm for a
    #: whole extra day. Measured in days as a float, compared at the same bar.
    age = (now - pub.astimezone(timezone.utc)).total_seconds() / 86400.0
    #: FLOORED, NOT ROUNDED. `round(1.958, 1)` is 2.0, so a 47-hour-old board
    #: printed "✅ 2.0 day(s) old" against a documented 2-day bar — a reader
    #: would reasonably conclude the alarm was broken. Flooring keeps the
    #: DISPLAYED age at or below the age the DECISION used, so the number and
    #: the verdict can never contradict each other.
    days = math.floor(age * 10) / 10.0
    if age >= STALE_AFTER_DAYS:
        return line, days, f"board is {days} days stale (last publish: {line[:40]})"
    return line, days, None


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
        hot, tail = gate_hot_lines(lines)
        count_note = f" [{len(hot)} actionable line(s)]" if len(hot) > 1 else ""
        print(f" {'✅' if ok else '🔴'} {tool.split('/')[-1]:30} {tail[:90]}{count_note}")
        if not ok:
            if len(hot) > 1:
                red.append(f"{tool}: exit {p.returncode} — {len(hot)} rows need action, "
                            f"e.g. {tail[:100]} (run the tool directly for the full list)")
            else:
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
    log = subprocess.run(["git", "log", "--format=%ci\t%s", "origin/main"],
                         capture_output=True, text=True).stdout
    line, days, problem = board_freshness(log, now)
    print(f"   last published board: {line[:100]}")
    if problem:
        red.append(problem)
        print(f"   🔴 {problem}")
    else:
        print(f"   ✅ {days} day(s) old")

    print("\n── SOURCE REGISTRY ─────────────────────────────────────────")
    # FUTURE-PROOF-2027 §6: every data class names a primary and a fallback.
    # Advisory, not red: a class whose primary is failing is already red above
    # by workflow; this line is the "and there is no fallback" fact, which is
    # what turns a bad night into a dark arm.
    try:
        reg = json.load(open(ROOT / "draft" / "data" / "source_registry.json"))
        gaps = []
        for c in reg["classes"]:
            fb = (c["fallback"].get("source") or "").upper()
            nofb = fb.startswith("NONE")
            uncaptured = "none" in (c["primary"].get("workflow") or "").lower()
            mark = "⚠" if (nofb or uncaptured) else "✅"
            note = "NOT CAPTURED" if uncaptured else ("no fallback" if nofb else "fallback: " + (c["fallback"].get("source") or "")[:40])
            print(f" {mark} {c['class']:26} {note}")
            if uncaptured or nofb:
                gaps.append(c["class"])
        if gaps:
            print(f"   ⚠ {len(gaps)} class(es) with a single door or none — C's registry rows, not tonight's red list")
    except Exception as e:  # noqa: BLE001
        print(f" 🔴 registry unreadable: {type(e).__name__}: {e}")
        red.append(f"source_registry.json unreadable — {e}")

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
