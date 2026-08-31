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
import re, subprocess, sys
from collections import defaultdict

REGISTER = "DEFECT-REGISTER.md"
KNOWN_POSITIVES = {"60", "4t", "31"}  # Cory-verified stale 2026-08-31


def open_rows():
    t = open(REGISTER).read()
    rows = {}
    for m in re.finditer(r"\n\| (\w{1,4}) \|(.*?)(?=\n\| \w{1,4} \||\Z)", t, re.S):
        rid, cell = m.group(1), m.group(2)
        parts = [p.strip() for p in cell.split("|")]
        stat = " ".join(parts[2:4]).upper() if len(parts) > 3 else ""
        if re.search(r"✅ CLOSED|CLOSED 0|CLOSED \d|RESOLVED|ABANDONED|\[2027\] PARKED", stat):
            continue
        rows[rid] = re.sub(r"\s+", " ", parts[0])[:100]
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
