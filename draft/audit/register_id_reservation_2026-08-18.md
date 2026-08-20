# THE RACE BEHIND THE DUPLICATE ROWS, CLOSED — a committed watermark file

_TERRITORY: D. Written 2026-08-18, same evening as
`register_dedup_2026-08-18.md`. Not a Saturday item._

## THE GAP THE DEDUP FIX DID NOT CLOSE

Fixing the three duplicate rows treated the **symptom**. The **cause** was
never addressed: two branches, each computing *"the next free id"* by reading
their own stale copy of `DEFECT-REGISTER.md`, will independently land on the
same number. `test_no_two_rows_share_an_id` catches that collision at merge
time — but the observed fix for a collision was **"id taken, renumber the
newer row"**, which is exactly how a genuine duplicate (not two different
findings competing for one slot) survived as two rows under two ids. The
content-comparison guard added earlier catches that shape after the fact.
Neither stops the race itself from happening again tomorrow.

## THE FIX: a small, git-tracked watermark

`draft/tools/next_register_id.js`, `draft/data/register_id_watermark.json`.

Claiming an id reads the watermark's remembered high point, takes the max
against the live file's current max id, and **writes the advanced value back
to the tracked file as part of the same commit that adds the new row.**

**Why this actually helps, mechanically:** two branches that each claim an id
independently will each write a *different* value into their own copy of a
one-line JSON file. A later merge shows a **conflict on `next_numeric_id`** —
not a silent duplicate. Resolving a one-field numeric conflict ("take the
higher value") is a five-second, unambiguous fix. Reconciling two divergent
prose rows after the fact — what the dedup pass took an hour to do tonight —
is not.

**Why it also closes the specific bug that bit twice** (`37`→`43`, `38`/`39`
reused): the watermark's memory is authoritative for ids that no longer
appear in the live file at all — exactly the state after a row is deleted or
folded elsewhere. A file-derived "current max" forgets a deleted id
immediately; the watermark does not, ever.

## PROOF, NOT ASSERTION

`draft/tests/next_register_id.test.js`, 5 checks:

| check | what it proves |
|---|---|
| first claim | above the file's real current max |
| sequential claims | strictly increasing, never repeat |
| **fail-arm, the actual bug** | a claimed id is **not** reissued after its row is deleted |
| **control on the fail-arm** | without the watermark, the file-derived max **would** reissue it — proves the fix, not luck, does the work |
| two-branch race, reproduced on purpose | both branches independently claim the *same* id from the same start (confirms the race is real); a trivial `max()` merge resolution clears both |

## WHAT THIS DOES NOT DO

- **Does not enforce that anyone uses it.** A row filed by hand, without
  running the tool, is invisible to the watermark — the content-comparison
  guard (`register_dedup_2026-08-18.md`) is still the backstop for that case
  and stays in the test suite unchanged.
- **Does not retroactively fix anything.** The three rows fixed tonight are
  fixed; this only prevents the *next* one.
- **Does not resolve merge conflicts automatically.** A conflict on the
  watermark file still needs a human or agent to take the max — deliberately:
  an automatic resolution that silently drops one branch's claim would just
  move the race somewhere less visible.
- **Seeded at 47**, one past the register's real max at commit time
  (`46`), with an empty history — no id was burned to create it.
