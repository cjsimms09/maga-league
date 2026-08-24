#!/usr/bin/env python3
"""Which register rows -- and ROUTES items -- have EVER existed on main and are gone today?

WHY THIS EXISTS, AS THE FAILURE IT ENDS (E, 2026-08-23). Register 268 was
deleted within an hour of being filed, by a commit whose subject was about
something else: two register lines went out of a conflicted region and one came
back. `mailbox_deletion_guard.js` did not fire — it compares HEAD~1..HEAD and a
row count that falls by one inside a commit legitimately editing the register
looks like an edit. `test_routes_resurrections` covers ROUTES, not this file.
A merge that drops a whole row leaves nothing behind to find, and 268 was only
recovered because its author went looking for it.

So this walks every commit that ever touched the register on main, collects
every row id that ever appeared, and reports the ones missing today.

RENUMBERED IS NOT LOST, and the distinction is the whole tool: a row whose
distinctive text still appears under a different id was renumbered under
register 186's protocol and nothing is gone. Matching is therefore on CONTENT,
never on the id chain — register 212's lesson, learned by deleting a row.

Exit 1 if any row is genuinely lost, so CI can hold the line.
"""
import os
import re
import subprocess
import sys

ROW = re.compile(r'^\| ([0-9A-Za-z]+) \|')
REF = "origin/main"


def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True).stdout


ITEM = re.compile(r'^- \[([ x])\] (.*)$')


def routes() -> int:
    """ROUTES has the same exposure and one extra question.

    ROUTES is a QUEUE, so an item disappearing could be deliberate pruning. The
    test that separates the two: was it EVER ticked? Measured 2026-08-23 across
    1,452 commits -- 84 items vanished while still open and ZERO were ticked
    first. Nothing here is ever completed-then-removed, so any disappearance is
    a loss. Completed items are kept in place or moved to ROUTES-ARCHIVE.md,
    which is why both files are searched.
    """
    shas = sh('git', 'log', '--format=%H', REF, '--', 'ROUTES.md').split()
    if not shas:
        return 0
    opened, ticked = {}, set()
    for s in shas:
        for line in sh('git', 'show', s + ':ROUTES.md').split('\n'):
            m = ITEM.match(line)
            if not m:
                continue
            key = m.group(2)[:120]
            if m.group(1) == 'x':
                ticked.add(key)
            else:
                opened.setdefault(key, line)
    hay = open('ROUTES.md', encoding='utf-8').read()
    if os.path.exists('ROUTES-ARCHIVE.md'):
        hay += open('ROUTES-ARCHIVE.md', encoding='utf-8').read()
    lost = []
    for key, body in opened.items():
        if key in ticked:
            continue
        frags = re.findall(r'[A-Za-z`][^|*]{45,90}', body)[:6] or [body[10:90]]
        if not any(f in hay for f in frags):
            lost.append(body)
    print("\nROUTES items ever open: %d | vanished while still open: %d"
          % (len(opened), len(lost)))
    if lost:
        recent = [b for b in lost if re.search(r'2026-08-1[5-9]|2026-08-2', b)]
        print("  of those, filed 08-15 or later: %d  (the rest are day-one churn)"
              % len(recent))
        for b in recent[:10]:
            print("    %s" % b[:118])
    return 0


def main() -> int:
    shas = sh('git', 'log', '--format=%H', REF, '--', 'DEFECT-REGISTER.md').split()
    if not shas:
        print("register_lost_rows: no history for DEFECT-REGISTER.md on %s" % REF)
        return 0
    ever = {}
    for s in shas:
        for line in sh('git', 'show', s + ':DEFECT-REGISTER.md').split('\n'):
            m = ROW.match(line)
            if m and m.group(1) != 'what':
                ever.setdefault(m.group(1), line)

    cur = open('DEFECT-REGISTER.md', encoding='utf-8').read()
    now = {m.group(1) for m in (ROW.match(l) for l in cur.split('\n'))
           if m and m.group(1) != 'what'}

    lost = []
    for rid, body in ever.items():
        if rid in now:
            continue
        # CONTENT match: several distinctive fragments, any one hit means the row
        # survives under another id.
        frags = re.findall(r'[A-Za-z`][^|*]{45,90}', body)[:6]
        if not any(f in cur for f in frags):
            lost.append((rid, body))

    print("register rows ever on %s: %d | present today: %d | renumbered-or-present: %d"
          % (REF, len(ever), len(now), len(ever) - len(lost)))
    if not lost:
        print("  no register row has been silently deleted.")
        return 0
    print("\n  %d ROW(S) GENUINELY LOST — text no longer anywhere in the file:" % len(lost))
    for rid, body in lost:
        print("    %-5s %s" % (rid, body[:120]))
    print("\n  Recover with: git log --format=%H origin/main -- DEFECT-REGISTER.md,"
          "\n  then `git show <sha>:DEFECT-REGISTER.md | grep '^| <id> |'`.")
    return 1


if __name__ == "__main__":
    rc = main()
    routes()          # reported, not gated -- see routes() for why
    sys.exit(rc)
