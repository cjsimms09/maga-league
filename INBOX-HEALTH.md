# INBOX HEALTH

**For Cory.** Written by `.github/workflows/inbox-health.yml`, which
runs daily and on every change to `ROUTES.md`. Nothing here is written
by hand, so it cannot quietly stop being true.

Two questions, measured:
**is anyone answering**, and **is any finished work invisible from `main`**.

_Last measured: 2026-08-18 19:06 UTC_

```
============================================================================
ROUTES RESPONSE CHECK — is anyone answering?
============================================================================
  386 items · 230 open · 145 of those carry a DEFAULT (silence resolves them)
  2 BLOCKED — open, no default, 3+ days old. Silence answers nothing here.
  of 85 open item(s) with no default: 4 SAY they ask for nothing · 0 are BROADCASTS (same
  header in 3+ inboxes — a rule, not four decisions) · 81 declare NEITHER, so nobody
  can tell whether a decision is owed. That last number is the real state of the inbox.
  NEITHER IS SUBTRACTED: "no ask" is a loophole anyone can type, so the baseline stays
  comparable and the split prints beside it. Only the broadcast half is unfakeable —
  rewording is precisely what stops it matching.

  waiting on:
       2     4d oldest   A

  the five oldest:
    4d  2026-08-14 · C · 🔴 **MAIN IS RED FOR EVERY LANE AFTER THE 09:15 REBUILD — 13 tests, three cause
    3d  2026-08-15 · data/assumptions audit (Fable) · 📐 **THE 42% UNIFORMITY IS REAL DATA, NOT A RENDER

  DOES THE LOOP VISIBLY CLOSE? — ticked share by sender→recipient
  (a low rate is a QUESTION: real backlog, or answered and never ticked?)
    D → C                      5 items    20% ticked    4 open with NO default
    D → A                     27 items    26% ticked    6 open with NO default
    session E (red team) → A  11 items    27% ticked    7 open with NO default
    relay → B                 14 items    29% ticked    2 open with NO default
    relay/PM → A              17 items    29% ticked    4 open with NO default
    A → D                      8 items    38% ticked    2 open with NO default
    B → A                     18 items    39% ticked    5 open with NO default
    A → C                     17 items    41% ticked    0 open with NO default
    A → A                     27 items    48% ticked    2 open with NO default
    relay → A                 57 items    49% ticked    1 open with NO default
    this session → A           6 items    50% ticked    1 open with NO default
    relay/PM → B              14 items    50% ticked    7 open with NO default
    relay/PM → C              14 items    50% ticked    3 open with NO default
    relay/PM → E              10 items    60% ticked    3 open with NO default
    A → B                     34 items    65% ticked    0 open with NO default
    C → A                    100 items    70% ticked   15 open with NO default
    relay/PM → D               7 items    71% ticked    1 open with NO default
    E (red team) → A          28 items    75% ticked    0 open with NO default
    C → C                     13 items    92% ticked    0 open with NO default
    this session → C           7 items   100% ticked    0 open with NO default

  baseline 26  ->  now 2

  ✅ DOWN 24. Lower the baseline to 2 in draft/baseline/routes_backlog_baseline.json to lock the gain in —
     a ratchet nobody tightens is just a high-water mark.
============================================================================
```

```
============================================================================
LANE STATUS — work that exists but `main` cannot see
============================================================================
       18 commits     0h old  claude/fantasy-football-research-926y6z
        4 commits     1h old  claude/red-team-fantasy-football-97otna
  ⚠️    3 commits    27h old  claude/in-season-surface-fixes-6nyayc
        2 commits     0h old  claude/warroom-shell-rebuild-0817
        2 commits     0h old  review/draft-path-2026-08-18
        1 commits     1h old  claude/fp-range-fields-probe-diag
        1 commits     1h old  claude/shuffle-null-2026-08-18
        1 commits    44h old  sleeper-hist-proj-dispatch
        1 commits    44h old  sleeper-vs-fp-grade-dispatch

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
