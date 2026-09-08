# INBOX HEALTH

**For Cory.** Written by `.github/workflows/inbox-health.yml`, which
runs daily and on every change to `ROUTES.md`. Nothing here is written
by hand, so it cannot quietly stop being true.

Two questions, measured:
**is anyone answering**, and **is any finished work invisible from `main`**.

_Last measured: 2026-09-08 14:28 UTC_

```
============================================================================
ROUTES RESPONSE CHECK — is anyone answering?
============================================================================
  1043 items · 339 open · 333 of those carry a DEFAULT (silence resolves them)
  4 BLOCKED — open, no default, 3+ days old. Silence answers nothing here.
  of 6 open item(s) with no default: 0 SAY they ask for nothing · 0 are BROADCASTS (same
  header in 3+ inboxes — a rule, not four decisions) · 6 declare NEITHER, so nobody
  can tell whether a decision is owed. That last number is the real state of the inbox.
  NEITHER IS SUBTRACTED: "no ask" is a loophole anyone can type, so the baseline stays
  comparable and the split prints beside it. Only the broadcast half is unfakeable —
  rewording is precisely what stops it matching.

  waiting on:
       2     4d oldest   B
       1     3d oldest   A
       1     4d oldest   C

  the five oldest:
    4d  2026-09-04 · A → C · 🔴→🟢 **I FIXED A RED CAPTURE IN YOUR FILE — `weekly_projection_archive.py`
    4d  2026-09-04 · A → B · ❓ **ONE QUESTION, AND IT DECIDES A GUARD'S SHAPE (register 483): does the w
    3d  2026-09-05 · relay → A · 🧯 **SIX PIECES OF FINISHED, CI-GREEN WORK WERE ON NO BRANCH AND NOT ON
    3d  2026-09-05 · relay → B · 🎁 **YOUR THREE OWNER-FACING FEATURES WERE NEVER ON `main` — THEY ARE N

  DOES THE LOOP VISIBLY CLOSE? — ticked share by sender→recipient
  (a low rate is a QUESTION: real backlog, or answered and never ticked?)
    E → B                     15 items    13% ticked    0 open with NO default
    relay → E                 19 items    16% ticked    1 open with NO default
    E → A                    111 items    26% ticked    0 open with NO default
    Cory (via relay) → A       6 items    33% ticked    0 open with NO default
    relay → D                 20 items    40% ticked    0 open with NO default
    A → E                     23 items    48% ticked    2 open with NO default
    relay → A                143 items    56% ticked    2 open with NO default
    D → C                      5 items    60% ticked    0 open with NO default
    D → A                    113 items    60% ticked    0 open with NO default
    relay → C                 33 items    67% ticked    1 open with NO default
    A → A                     82 items    68% ticked    0 open with NO default
    B → A                     69 items    70% ticked    0 open with NO default
    A → D                     14 items    86% ticked    0 open with NO default
    A → C                     38 items    89% ticked    0 open with NO default
    C → C                     14 items    93% ticked    0 open with NO default
    C → A                    136 items    94% ticked    0 open with NO default
    relay → B                 21 items    95% ticked    0 open with NO default
    A → B                     74 items    99% ticked    0 open with NO default
    session E (red team) → A  13 items   100% ticked    0 open with NO default
    this session → A           6 items   100% ticked    0 open with NO default
    E (red team) → A          28 items   100% ticked    0 open with NO default
    relay/PM → A              17 items   100% ticked    0 open with NO default
    C → B                      8 items   100% ticked    0 open with NO default
    relay/PM → B              14 items   100% ticked    0 open with NO default
    relay/PM → C              14 items   100% ticked    0 open with NO default
    this session → C           7 items   100% ticked    0 open with NO default
    relay/PM → D               7 items   100% ticked    0 open with NO default
    B → E                     14 items   100% ticked    0 open with NO default
    relay/PM → E              10 items   100% ticked    0 open with NO default

  baseline 0  ->  now 4

  ❌ THE BACKLOG GREW BY 4. Answer them, add a DEFAULT so silence resolves them, or SEND BACK.
     A ratchet that only reports is the thing that failed here already.
============================================================================
```

```
============================================================================
LANE STATUS — work that exists but `main` cannot see
============================================================================
  ⚠️  180 commits   106h old  claude/data-stewardship-setup-bo5h9j
  ⚠️   83 commits    57h old  claude/warroom-shell-rebuild-0817
  ⚠️   82 commits    57h old  claude/external-ingest-program-1xfinj
        2 commits   115h old  claude/beautiful-pascal-b8voov
        1 commits     1h old  claude/focused-carson-2lfeys
        1 commits    72h old  claude/happy-faraday-umhfxu

  ⚠️  3 branch(es) look STRANDED — 3+ commits, 12h+ old, unmerged.
     ROUTES.md cannot show you these: it lists what a lane WROTE DOWN,
     and an unrouted branch is indistinguishable from an idle lane.

  (11 branch(es) older than 5d not shown — old divergence, not stranded work.)

  NEXT, BEFORE MERGING ANY OF THESE:
    node draft/tools/routes_branch_reconcile.js   — what work here is `main` blind to?
    node draft/tools/reopen_risk.js              — what closed fix would merging it UNDO?
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
