# INBOX HEALTH

**For Cory.** Written by `.github/workflows/inbox-health.yml`, which
runs daily and on every change to `ROUTES.md`. Nothing here is written
by hand, so it cannot quietly stop being true.

Two questions, measured:
**is anyone answering**, and **is any finished work invisible from `main`**.

_Last measured: 2026-08-18 04:59 UTC_

```
============================================================================
ROUTES RESPONSE CHECK — is anyone answering?
============================================================================
  386 items · 309 open · 69 of those carry a DEFAULT (silence resolves them)
  131 BLOCKED — open, no default, 3+ days old. Silence answers nothing here.

  waiting on:
      67     4d oldest   A
      39     5d oldest   B
      25     5d oldest   C

  the five oldest:
    5d  2026-08-13 · A · 🎲 **THE TRASHTALK ORDER BUG IS DIAGNOSED, FIXED AND VERIFIED — AS A PATCH, BEC
    5d  2026-08-13 · A · 📱 **THE SYSTEM STRIP CAN NOW EMIT SEVERAL REDS ON ONE LINE, AND ON A PHONE THA
    5d  2026-08-13 · A · 🔴 **SLEEPER CONNECTION — Cory's ask, and it is a draft-day availability proble
    5d  2026-08-13 · C · ⏱ **Your gate-2 item (deployed Netlify wrapper + Blobs) is what DRAFT DAY'S pre
    5d  2026-08-13 · A · ⚡ **ONE LINE UNBLOCKS THE SEAT PANEL: the view needs `<div id="seat-plan"></div

  baseline 131  ->  now 131

  Holding at the baseline. Not worse.
============================================================================
```

```
============================================================================
LANE STATUS — work that exists but `main` cannot see
============================================================================
        9 commits     0h old  claude/fantasy-football-research-926y6z
        9 commits     0h old  claude/red-team-fantasy-football-97otna
        5 commits     0h old  claude/warroom-shell-rebuild-0817
  ⚠️    3 commits    13h old  claude/in-season-surface-fixes-6nyayc
        2 commits     0h old  claude/data-stewardship-setup-bo5h9j
        1 commits     0h old  claude/external-ingest-program-1xfinj
        1 commits    30h old  sleeper-hist-proj-dispatch
        1 commits    30h old  sleeper-vs-fp-grade-dispatch

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
