# INBOX HEALTH

**For Cory.** Written by `.github/workflows/inbox-health.yml`, which
runs daily and on every change to `ROUTES.md`. Nothing here is written
by hand, so it cannot quietly stop being true.

Two questions, measured:
**is anyone answering**, and **is any finished work invisible from `main`**.

_Last measured: 2026-09-02 00:00 UTC_

```
============================================================================
ROUTES RESPONSE CHECK — is anyone answering?
============================================================================
  973 items · 376 open · 307 of those carry a DEFAULT (silence resolves them)
  65 BLOCKED — open, no default, 3+ days old. Silence answers nothing here.
  of 69 open item(s) with no default: 5 SAY they ask for nothing · 0 are BROADCASTS (same
  header in 3+ inboxes — a rule, not four decisions) · 64 declare NEITHER, so nobody
  can tell whether a decision is owed. That last number is the real state of the inbox.
  NEITHER IS SUBTRACTED: "no ask" is a loophole anyone can type, so the baseline stays
  comparable and the split prints beside it. Only the broadcast half is unfakeable —
  rewording is precisely what stops it matching.

  waiting on:
      19    14d oldest   A
      10    14d oldest   E
      10    13d oldest   B
       9    14d oldest   D
       4    10d oldest   Cory
       3     9d oldest   relay
       3    13d oldest   C
       2    13d oldest   A/B

  the five oldest:
    14d  2026-08-19 · E → A · 🔴 **REPLY TO `ROSTER-CONSTRUCTION-CALL.md`: RELAXING TE'S CAP TO AN ALREAD
    14d  2026-08-19 · C → D · 🎯 **CORY RULED ON THE ROSTER-CONSTRUCTION TARGET — verbatim: "We should be
    14d  2026-08-19 · C → E · 🎯 **CORY RULED ON THE ROSTER-CONSTRUCTION TARGET — verbatim: "We should be
    13d  2026-08-20 · relay → A · 🔬 **AUDIT-PACKAGE ADDENDUM: question 2 (the friction constant) now has
    13d  2026-08-20 · relay → A · 🚂 **FULL STEAM — **CORY, VERBATIM (08-20): "everyones full task list s

  DOES THE LOOP VISIBLY CLOSE? — ticked share by sender→recipient
  (a low rate is a QUESTION: real backlog, or answered and never ticked?)
    Cory (via relay) → A       6 items     0% ticked    1 open with NO default
    E → A                    105 items    12% ticked   14 open with NO default
    E → B                     15 items    13% ticked    1 open with NO default
    relay → E                 15 items    13% ticked    1 open with NO default
    relay → D                 19 items    26% ticked    4 open with NO default
    A → E                     15 items    40% ticked    0 open with NO default
    D → A                    102 items    51% ticked   10 open with NO default
    relay → A                123 items    53% ticked   14 open with NO default
    relay → C                 30 items    53% ticked    3 open with NO default
    B → A                     68 items    57% ticked    9 open with NO default
    D → C                      5 items    60% ticked    0 open with NO default
    A → A                     76 items    63% ticked    1 open with NO default
    relay → B                 21 items    76% ticked    4 open with NO default
    A → D                     14 items    86% ticked    0 open with NO default
    A → C                     36 items    89% ticked    0 open with NO default
    relay/PM → E              10 items    90% ticked    0 open with NO default
    C → C                     14 items    93% ticked    0 open with NO default
    A → B                     74 items    93% ticked    1 open with NO default
    C → A                    135 items    95% ticked    0 open with NO default
    session E (red team) → A  13 items   100% ticked    0 open with NO default
    this session → A           6 items   100% ticked    0 open with NO default
    E (red team) → A          28 items   100% ticked    0 open with NO default
    relay/PM → A              17 items   100% ticked    0 open with NO default
    C → B                      8 items   100% ticked    0 open with NO default
    relay/PM → B              14 items   100% ticked    0 open with NO default
    relay/PM → C              14 items   100% ticked    0 open with NO default
    this session → C           7 items   100% ticked    0 open with NO default
    relay/PM → D               7 items   100% ticked    0 open with NO default
    B → E                      7 items   100% ticked    0 open with NO default

  baseline 0  ->  now 65

  ❌ THE BACKLOG GREW BY 65. Answer them, add a DEFAULT so silence resolves them, or SEND BACK.
     A ratchet that only reports is the thing that failed here already.
============================================================================
```

```
============================================================================
LANE STATUS — work that exists but `main` cannot see
============================================================================
      160 commits     0h old  claude/data-stewardship-setup-bo5h9j
  ⚠️  109 commits    32h old  claude/fantasy-football-research-926y6z
  ⚠️   67 commits    30h old  claude/external-ingest-program-1xfinj
        2 commits    33h old  claude/happy-faraday-qsy49d
        2 commits    32h old  claude/warroom-shell-rebuild-0817
        1 commits     9h old  claude/happy-faraday-b6jnbe

  ⚠️  2 branch(es) look STRANDED — 3+ commits, 12h+ old, unmerged.
     ROUTES.md cannot show you these: it lists what a lane WROTE DOWN,
     and an unrouted branch is indistinguishable from an idle lane.

  (5 branch(es) older than 5d not shown — old divergence, not stranded work.)

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
