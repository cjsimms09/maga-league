# INBOX HEALTH

**For Cory.** Written by `.github/workflows/inbox-health.yml`, which
runs daily and on every change to `ROUTES.md`. Nothing here is written
by hand, so it cannot quietly stop being true.

Two questions, measured:
**is anyone answering**, and **is any finished work invisible from `main`**.

_Last measured: 2026-08-20 12:51 UTC_

```
============================================================================
ROUTES RESPONSE CHECK — is anyone answering?
============================================================================
  584 items · 90 open · 87 of those carry a DEFAULT (silence resolves them)
  0 BLOCKED — open, no default, 3+ days old. Silence answers nothing here.
  of 3 open item(s) with no default: 3 SAY they ask for nothing · 0 are BROADCASTS (same
  header in 3+ inboxes — a rule, not four decisions) · 0 declare NEITHER, so nobody
  can tell whether a decision is owed. That last number is the real state of the inbox.
  NEITHER IS SUBTRACTED: "no ask" is a loophole anyone can type, so the baseline stays
  comparable and the split prints beside it. Only the broadcast half is unfakeable —
  rewording is precisely what stops it matching.

  DOES THE LOOP VISIBLY CLOSE? — ticked share by sender→recipient
  (a low rate is a QUESTION: real backlog, or answered and never ticked?)
    relay → E                  9 items     0% ticked    0 open with NO default
    A → E                     13 items    31% ticked    0 open with NO default
    relay → D                  9 items    33% ticked    0 open with NO default
    A → A                     58 items    59% ticked    0 open with NO default
    D → C                      5 items    60% ticked    0 open with NO default
    A → B                     69 items    68% ticked    0 open with NO default
    C → B                      7 items    86% ticked    1 open with NO default
    A → D                     14 items    86% ticked    0 open with NO default
    A → C                     35 items    89% ticked    0 open with NO default
    relay → C                 10 items    90% ticked    0 open with NO default
    relay/PM → E              10 items    90% ticked    0 open with NO default
    E (red team) → A          28 items    96% ticked    0 open with NO default
    relay → A                 66 items    97% ticked    0 open with NO default
    B → A                     29 items   100% ticked    0 open with NO default
    C → A                    128 items   100% ticked    0 open with NO default
    D → A                     41 items   100% ticked    0 open with NO default
    session E (red team) → A  13 items   100% ticked    0 open with NO default
    this session → A           6 items   100% ticked    0 open with NO default
    relay/PM → A              17 items   100% ticked    0 open with NO default
    relay → B                 16 items   100% ticked    0 open with NO default
    relay/PM → B              14 items   100% ticked    0 open with NO default
    relay/PM → C              14 items   100% ticked    0 open with NO default
    this session → C           7 items   100% ticked    0 open with NO default
    C → C                     13 items   100% ticked    0 open with NO default
    relay/PM → D               7 items   100% ticked    0 open with NO default

  baseline 0  ->  now 0

  Holding at the baseline. Not worse.
============================================================================
```

```
============================================================================
LANE STATUS — work that exists but `main` cannot see
============================================================================
      108 commits     0h old  claude/red-team-fantasy-football-97otna
       82 commits     0h old  claude/fantasy-football-research-926y6z
       52 commits     0h old  claude/warroom-shell-rebuild-0817
       46 commits     0h old  claude/data-stewardship-setup-bo5h9j
       34 commits     0h old  claude/external-ingest-program-1xfinj
  ⚠️    3 commits    42h old  review/draft-path-2026-08-18
        1 commits    86h old  sleeper-hist-proj-dispatch
        1 commits    86h old  sleeper-vs-fp-grade-dispatch

  ⚠️  1 branch(es) look STRANDED — 3+ commits, 12h+ old, unmerged.
     ROUTES.md cannot show you these: it lists what a lane WROTE DOWN,
     and an unrouted branch is indistinguishable from an idle lane.

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
