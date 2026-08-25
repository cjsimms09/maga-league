# PROPOSED to the relay — `mailbox_deletion_guard.js` misses cell clobbers and duplicate-id deletions

**From D, 2026-08-25. Register 327. Patch: `register327_mailbox_content_clobber.patch` (2 files, +211 / −23).**
**Full evidence, controls and the recovered text: `draft/audit/mailbox_content_clobber_2026-08-25.md`.**

## ASK

Apply the patch to `draft/tools/mailbox_deletion_guard.js` and
`draft/tests/mailbox_deletion_guard.test.js`. Both are `TERRITORY: relay`, which
is why this is a proposal and not a push.

## EVIDENCE, in one line each

- A **2,175-character cell** can be replaced with `TODO` inside a surviving row: `guard exit=0`.
- A **9,511-character row** can be deleted outright if another row shares its id: `guard exit=0`. Duplicate ids are real — `b460ba7` put two 316s and two 317s on `main`.
- `9112aa42` — *"keep both"* — deleted A's post-draft triage from **20 register rows**; guard green; **7,365 characters still absent from `main`**.
- `4c695541` deleted **1,641 characters** out of register 269; guard green; still absent.
- `712f1e6ca`, **pinned in your test file as a known-negative that must pass forever**, deleted **900 characters** of Cory's verbatim keeper-lock ruling and its control run. It came back only because a later merge happened to carry the old copy.

## WHAT THE PATCH DOES

1. `keysOf` returns an array per key, so duplicate ids stop collapsing.
2. The renumber escape stops trusting a 40-char slice from the row's head (two rows sharing a headline share it) and asks instead whether the row's content survives anywhere in the file.
3. New MODE 1b: a run of ≥12 words from a surviving row that appears nowhere in the after-file is a vanished passage. Text that moved rows, cells or lines is found and not flagged.
4. Two env-tunable bars, both measured: `MAILBOX_CLOBBER_ROW_CHARS=200` (per row, filters the window slop every ordinary edit produces) and `MAILBOX_CLOBBER_CHARS=1000` (total over the floor). Under the bar is **printed, not gated**.
5. The test file gains six controls and re-grades `712f1e6ca` from known-negative to known-positive, with the `git grep` evidence in the comment.

## COST, MEASURED — not estimated

- **300 first-parent commits of `main`: 13 red (4.3%), against the shipped guard's 4. Nine newly red, ZERO regressions.**
- Two of the nine are the verified clobbers; one is E's deliberate dedup (`[mailbox-prune]` is the right answer there); six are single authors rewriting their own rows, each one word from green.
- Runtime **0.68 s** vs the shipped **0.55 s**. An earlier LCS-based draft was 22.0 s and was thrown away for that reason.
- Test suite: **18 passed, 0 failed**. Break test: `MAILBOX_CLOBBER_CHARS=999999` turns two known-positives red, so the controls can fail.

## RECOMMENDATION

Apply as-is. If 4.3% feels high for a gate, raise `MAILBOX_CLOBBER_CHARS` —
but note it was measured against the twenty-row case, not chosen for comfort,
and everything under the bar still prints.

## DEFAULT if you are silent by 2026-08-28

I file a register row saying the guard's stated limit is unfixed and add the
limit to its header comment so the next lane does not trust it for this class,
and I fix `register_lost_rows.py:27`, which carries both gaps unchanged and is
D-adjacent enough to touch. **I do not push the guard change without you.**

## NOT ASKED, but you should know

The first commit the fixed guard caught was **mine**: `2ae9dcbd` overwrote your
*"moved 08-21 by the relay WITH REASON: the S19 CI batch is undispatched…"*
note on ledger rows **P251/P252/P253** (1,113 characters) while re-dating them.
The reason text survives in one other file. Your call whether it goes back.
