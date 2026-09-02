#!/usr/bin/env python3
# TERRITORY: relay
"""STALE ROW SWEEP — find open register rows the repo already answered.

Cory, 2026-08-31: of six rows A actually opened today, FOUR were stale, not
broken — 60's flex rule is live, 87's headline is arm-specific, 4t's ceiling
ruling shipped, 31's instrument decision was made eight days earlier.
"Nobody had walked back to the rows. how can we fix this for A?"

This is the fix's mechanical half. The signature of a stale row is almost
always the same: a LATER commit names the row's id in its subject ("Register
60 ...", "register 4t fixed ...") — the work happened, the walk-back didn't.
This tool cross-references every OPEN row against every commit subject that
mentions its id AFTER the row was filed, and prints the candidates newest-
evidence-first. It closes nothing itself: each candidate is a ten-second
verify-then-close for a HUMAN sweep (relay/E), so A only ever sees rows that
survive.

RULE 3e control: run with --control and the tool must find its own known
positives — rows Cory independently confirmed stale on 08-31 (60, 4t, 31).
If it cannot find what we already know is there, its nulls mean nothing.

Run:  python3 draft/tools/stale_row_sweep.py [--control]
"""
import json, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

REGISTER = "DEFECT-REGISTER.md"
KNOWN_POSITIVES = {"60", "4t", "31"}  # Cory-verified stale 2026-08-31
VOCAB = Path(__file__).resolve().parents[1] / "config" / "register_status_vocabulary.json"


def terminal_regex():
    """ONE vocabulary, read from draft/config/register_status_vocabulary.json —
    the same file register_recheck_check.js builds its TERMINAL from. Register
    469 (D, 09-02): this tool carried its own list (`✅ CLOSED` at one exact
    spacing, plus RESOLVED/ABANDONED) and read 52 unambiguously-terminal rows
    as OPEN — `✅ **CLOSED`, `🟢 CLOSED`, RULED, WITHDRAWN, SUPERSEDED and
    RETRACTED all missed — inside the burn-down list Cory ordered on 08-31.
    No hardcoded fallback: a silent fallback is how two guards drift apart
    (register 313), so an unreadable vocabulary is a loud exit, not a guess."""
    try:
        words = json.loads(VOCAB.read_text())["terminal"]
    except Exception as e:  # noqa: BLE001
        sys.exit(f"🔴 stale_row_sweep: cannot read {VOCAB} ({e}) — refusing a private list")
    if not words:
        sys.exit("🔴 stale_row_sweep: the vocabulary carries no `terminal` words")
    return re.compile(r"\b(" + "|".join(re.escape(w.upper()) for w in words) + r")\b")


TERMINAL = None  # built on first use so --help style imports stay cheap


def open_rows():
    """Open = the STATUS CELL carries no terminal word — the same reading as
    register_recheck_check.js `rows()`, ported line for line: one row per
    line, cells split on UNESCAPED pipes only (an escaped `\\|` inside a cell
    must not shift the columns — that misread five statuses on 08-18), status
    is the second-from-last cell, and ONLY that cell is read. The previous
    version searched the row's last 600 characters of prose, which cut both
    ways: `✅ **CLOSED` (bold) missed, and a first attempt at the fix that
    word-matched the prose flipped 102 rows, 50 of them false — "the loop is
    closed", "RULED out", "NOT retracted" (relay, 09-02, checked on the
    distribution before quoting the number — Rule 3i)."""
    global TERMINAL
    if TERMINAL is None:
        TERMINAL = terminal_regex()
    rows = {}
    for line in open(REGISTER).read().split("\n"):
        t = line.strip()
        if not t.startswith("|") or re.fullmatch(r"[|\-: ]+", t):
            continue
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", t.strip("|"))]
        if len(cells) < 4 or re.fullmatch(r"(#|what|question)", cells[0], re.I):
            continue
        rid, status = cells[0], cells[-2]
        if not re.fullmatch(r"\w{1,4}", rid):
            continue
        if TERMINAL.search(status.upper()):
            continue
        rows[rid] = re.sub(r"\s+", " ", cells[1])[:100]
    return rows


def commit_mentions():
    """id -> list of (date, sha, subject) for commits whose SUBJECT names it."""
    log = subprocess.run(
        ["git", "log", "--format=%h %ad %s", "--date=short", "origin/main"],
        capture_output=True, text=True).stdout
    hits = defaultdict(list)
    for line in log.splitlines():
        sha, date, subject = line.split(" ", 2) if line.count(" ") >= 2 else (line, "", "")
        for m in re.finditer(r"[Rr]egisters? (\w{1,4})\b", subject):
            hits[m.group(1)].append((date, sha, subject))
    return hits


def main():
    control = "--control" in sys.argv
    rows = open_rows()
    hits = commit_mentions()
    candidates = []
    for rid, head in rows.items():
        row_hits = hits.get(rid, [])
        if not row_hits:
            continue
        # Newest mention first. A mention whose subject sounds like completed
        # work is the stale signature; a mention that just FILES the row is not.
        newest = sorted(row_hits, reverse=True)[0]
        subj = newest[2].lower()
        filed_only = len(row_hits) == 1 and not re.search(
            r"fix|close|ship|land|done|in hand|correct|resolv|retire|repair", subj)
        if filed_only:
            continue
        candidates.append((newest[0], rid, newest[1], newest[2], head))

    candidates.sort(reverse=True)
    print(f"STALE-CANDIDATE SWEEP — {len(rows)} open rows, "
          f"{len(candidates)} mentioned by later commits:\n")
    for date, rid, sha, subject, head in candidates:
        print(f"  {rid:5} last mention {date} {sha}  «{subject[:80]}»")
        print(f"        row: {head[:90]}")
    print("\nEach line is a VERIFY-THEN-CLOSE, not a close: open the commit, "
          "check the row's premise against it, write the ✅ with the sha — "
          "or leave it open with a note saying why the commit did not settle it.")

    if control:
        found = {rid for _, rid, _, _, _ in candidates} | \
                {rid for rid in KNOWN_POSITIVES if rid not in rows}  # already closed = also fine
        missing = KNOWN_POSITIVES - found
        if missing:
            print(f"\n🔴 CONTROL FAILED: known-stale rows not found: {sorted(missing)} — "
                  "the sweep's nulls cannot be trusted.")
            return 1
        print(f"\n✅ CONTROL PASSED: all known-stale rows surfaced or already closed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
