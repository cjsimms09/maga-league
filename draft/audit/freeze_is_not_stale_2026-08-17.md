# E's tenth sweep — the draft-day instruction rests on a premise that is no longer true

**Session E (red team), 2026-08-17.**

`DRAFT-WEEK-BRIEF.md` §4 gives Cory **the one irreversible action in the plan**,
and it is a `rm`. The brief is right that it deletes nothing recoverable and
right to say *"rehearse it first"*. So I rehearsed it — and the rehearsal
answered a different question than the one it was set to answer.

---

## WHAT THE BRIEF SAYS

> **One action on draft day** — re-take the pre-draft freeze AFTER the final
> board build. `draft/data/pre_draft_freeze_2026.json` is from 08-14 and is
> missing **fourteen** declared fields.

and, in the closing paragraph:

> The deselected `repo_parity` set includes **two deliberate red flags** — the
> ADP-sd ratchet and **the stale freeze** — which are evidence awaiting a human,
> not broken builds.

## WHAT IS ACTUALLY TRUE

The rehearsal, run exactly as the brief prescribes (writes to a temp path,
touches nothing):

```
$ PRE_DRAFT_FREEZE_PATH=<tmp> python3 draft/freeze_pre_draft.py
froze 682 players x 12 picks -> rehearsal.json
payload sha256: 98f580261a2ea898194cf13cfa72a692723184b7d3d776b81e2cb60356c98d39

$ PRE_DRAFT_FREEZE_PATH=<tmp> python3 draft/freeze_pre_draft.py --verify
freeze intact: 682 players, 12 picks, built from artifact 2026-08-16T14:10:12Z
```

**And the committed freeze's payload hash is the same string:**

```
committed draft/data/pre_draft_freeze_2026.json : 98f580261a2ea898...
freshly generated from today's board            : 98f580261a2ea898...
IDENTICAL PAYLOAD: True
```

| claim | status |
|---|---|
| the freeze is "from 08-14" | **false** — re-taken in `60f3487`, *"The freeze is re-taken and the integrate gate learns the publication gate's selection"* |
| "missing fourteen declared fields" | **false** — 0 of 44 declared `PLAYER_FIELDS` missing |
| the freeze is a live `repo_parity` red flag | **false** — `test_freeze_not_stale.py` passes **3/3**, including its `repo_parity` node |

**So one of the brief's "two deliberate red flags" is one flag.** The ADP-sd
ratchet remains genuinely open and is Cory's decision (C2); the freeze was fixed
and the brief was not updated.

## WHY THIS IS WORTH A ROW RATHER THAN A SHRUG

**The action the brief prescribes is still correct.** The board rebuilds nightly,
so a freeze built from the 08-16 artifact *will* be stale by 08-22 and re-taking
it after the final build is right. **Nothing here says skip the step.**

**What is wrong is the reason given for it** — and the step is a `rm` on the one
artifact the whole 2027 grading rests on. A destructive instruction justified by
a premise the reader can check and find false is an instruction someone talks
themselves out of. Whoever runs the runbook on 08-22 will verify the freeze,
find it intact with 0 missing fields, and have to decide on the spot whether the
brief is wrong or they are.

**The correct justification is one line and does not depend on any defect:**
*re-take the freeze after the final board build because the board changes
nightly and the freeze must record the board Cory actually drafted from.* That
reason cannot go stale.

**This is the stale-citation class the brief's own §5 says resisted gating** —
*"a comment asserting another module's constant"* — here as a document asserting
another artifact's state. §5 was honest that this class is caught by reading
rather than by machinery, and this is what catching one by reading looks like.

## ROUTING

**To the relay**, who owns `DRAFT-WEEK-BRIEF.md` (*"Who wrote this: the
research-relay session"*). Two edits, both small:

1. §4 — replace *"is from 08-14 and is missing fourteen declared fields"* with
   the durable reason above.
2. Closing paragraph — *"two deliberate red flags"* is now one; the freeze is
   green.

**Not routed to A**: nothing about the board, the model or the gate changes, and
`test_draft_week_brief_numbers.py` pins the brief's numbers against their
artifacts but cannot pin a *sentence* whose subject was fixed elsewhere.

**A note on my own instrument, since I nearly filed the opposite finding.** My
first check unioned field names over the first 50 rows and reported "0 missing"
for both files — which would have looked like a contradiction of the brief
without establishing anything, because a field absent from *some* rows survives a
union. The finding only became solid once I ran the project's own
`test_freeze_not_stale.py` (which reads `PLAYER_FIELDS` rather than a copy) and
compared payload hashes. **Three times today my first instrument was the wrong
one; this is the third, and the fix each time was to use the tool the repo
already had.**
