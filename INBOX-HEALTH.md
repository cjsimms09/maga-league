# INBOX HEALTH

**For Cory.** Written by `.github/workflows/inbox-health.yml`, which
runs daily and on every change to `ROUTES.md`. Nothing here is written
by hand, so it cannot quietly stop being true.

Two questions, measured:
**is anyone answering**, and **is any finished work invisible from `main`**.

_Last measured: 2026-08-18 13:23 UTC_

```
============================================================================
ROUTES RESPONSE CHECK — is anyone answering?
============================================================================
  435 items · 273 open · 106 of those carry a DEFAULT (silence resolves them)
  66 BLOCKED — open, no default, 3+ days old. Silence answers nothing here.
  of 167 open item(s) with no default: 4 SAY they ask for nothing · 9 are BROADCASTS (same
  header in 3+ inboxes — a rule, not four decisions) · 154 declare NEITHER, so nobody
  can tell whether a decision is owed. That last number is the real state of the inbox.
  NEITHER IS SUBTRACTED: "no ask" is a loophole anyone can type, so the baseline stays
  comparable and the split prints beside it. Only the broadcast half is unfakeable —
  rewording is precisely what stops it matching.

  waiting on:
      38     5d oldest   B
      25     5d oldest   C
       2     4d oldest   A
       1     4d oldest   E

  the five oldest:
    5d  2026-08-13 · A · 🎲 **THE TRASHTALK ORDER BUG IS DIAGNOSED, FIXED AND VERIFIED — AS A PATCH, BEC
    5d  2026-08-13 · A · 📱 **THE SYSTEM STRIP CAN NOW EMIT SEVERAL REDS ON ONE LINE, AND ON A PHONE THA
    5d  2026-08-13 · A · 🔴 **SLEEPER CONNECTION — Cory's ask, and it is a draft-day availability proble
    5d  2026-08-13 · C · ⏱ **Your gate-2 item (deployed Netlify wrapper + Blobs) is what DRAFT DAY'S pre
    5d  2026-08-13 · A · ⚡ **ONE LINE UNBLOCKS THE SEAT PANEL: the view needs `<div id="seat-plan"></div

  DOES THE LOOP VISIBLY CLOSE? — ticked share by sender→recipient
  (a low rate is a QUESTION: real backlog, or answered and never ticked?)
    relay → B                  8 items     0% ticked    1 open with NO default
    relay/PM → B              14 items     0% ticked   14 open with NO default
    D → C                      5 items     0% ticked    5 open with NO default
    relay/PM → C              14 items     0% ticked   10 open with NO default
    this session → C           7 items     0% ticked    7 open with NO default
    C → C                     14 items     0% ticked   14 open with NO default
    relay/PM → E              10 items     0% ticked    9 open with NO default
    session E (red team) → E   7 items     0% ticked    0 open with NO default
    A → C                     12 items     8% ticked    4 open with NO default
    relay → A                 46 items    13% ticked    5 open with NO default
    relay/PM → A              19 items    16% ticked    8 open with NO default
    A → D                      6 items    17% ticked    2 open with NO default
    B → A                     11 items    18% ticked    6 open with NO default
    C → B                     10 items    20% ticked    8 open with NO default
    A → B                     50 items    30% ticked   27 open with NO default
    relay/PM → D               7 items    43% ticked    3 open with NO default
    A → A                     20 items    55% ticked    2 open with NO default
    D → A                     22 items    64% ticked    1 open with NO default
    C → A                     83 items    81% ticked   14 open with NO default
    E (red team) → A          28 items    93% ticked    0 open with NO default

  baseline 65  ->  now 66

  ❌ THE BACKLOG GREW BY 1. Answer them, add a DEFAULT so silence resolves them, or SEND BACK.
     A ratchet that only reports is the thing that failed here already.
============================================================================
```

```
============================================================================
LANE STATUS — work that exists but `main` cannot see
============================================================================
       22 commits     0h old  claude/warroom-shell-rebuild-0817
       12 commits     0h old  claude/external-ingest-program-1xfinj
        4 commits     0h old  claude/fantasy-football-research-926y6z
  ⚠️    3 commits    21h old  claude/in-season-surface-fixes-6nyayc
        1 commits    39h old  sleeper-hist-proj-dispatch
        1 commits    38h old  sleeper-vs-fp-grade-dispatch

  ⚠️  1 branch(es) look STRANDED — 3+ commits, 12h+ old, unmerged.
     ROUTES.md cannot show you these: it lists what a lane WROTE DOWN,
     and an unrouted branch is indistinguishable from an idle lane.
============================================================================
```

## How to read this

**BLOCKED** counts asks that are open, carry no `DEFAULT`, and are 3+ days
old. An ask WITH a default is fine at any age — silence resolves it, which is
what `OPERATING-MODEL.md` intends. An ask WITHOUT one blocks whoever sent it,
indefinitely, and until 08-18 nothing in this repo measured that.

**The number only has to go DOWN.** It is a ratchet, not a target: the check
fails when the backlog grows, never merely because it is large. Failing on all
131 four days before a draft would go red for weeks and get switched off, which
is how the previous guard died.

**Stranded** lanes have commits `main` has never seen. `ROUTES.md` cannot show
you these — it lists what a lane wrote down, so a branch with nineteen commits
and no routed entry looks identical to an idle lane. That is the exact shape of
D's work on 08-18.
