# THREE DUPLICATE REGISTER ROWS, FOUND AUDITING FOR THEM AND FIXED WITH A GUARD

_TERRITORY: D. Written 2026-08-18. Not a Saturday item — register hygiene,
found while checking whether A had acted on any routed items._

## WHAT HAPPENED

Multiple parallel branches (mine and others') each carried the same finding
forward through their own merges into `main`. Because I had renumbered my own
rows to a `DS`-prefix specifically to **avoid** id collisions, and a later
independent merge on `main` **also** renumbered some of the same underlying
content (id-taken renumbering: `39→44`, `37→43`, `38→45`), the SAME finding
ended up living under two or three different ids at once — with `id`
uniqueness (`test_no_two_rows_share_an_id`) satisfied the whole time, because
the ids genuinely were different. The bug moved one column over from the one
the existing check watches.

## THE THREE PAIRS FOUND

| kept | deleted | finding |
|---|---|---|
| **31** | DS1 | the headline edge number misread in `CLAUDE.md` |
| **32** | DS2 | the asymmetric environment arm |
| **DS3** | 43 | the multiplicative-MAE-arm safety inventory |
| **44** | DS5 | the retraction of the duplicate opportunity-adjuster finding |
| **45** | DS4 | the pre-draft freeze carries a reverted policy |

*(Five deletions, but DS3/43 and the others share the "kept" column
differently — see below for which survivor was chosen and why.)*

**Which id survived was decided per pair, not by a rule:** `31`, `32`, `44`
and `45` won because they carried a later annotation (a relay note, or A's
actual answer) that their `DS`-numbered twin did not have. `DS3` won over `43`
for the opposite reason — nothing referenced `43` anywhere in the repo, while
`DS3` was already cited by name in `ROUTES.md` and three committed audit
docs, so keeping it was the smaller edit and the honest one.

**Every stale cross-reference the merge left behind was chased and fixed**,
not just the row ids themselves: row 32 pointed at "row 33" for content that
is now `DS3` (row 33 was independently reused for an unrelated finding by
someone else in the meantime); row 44 pointed at "row 38" for content that is
now `45`. Both fixed in place.

## THE GUARD

`test_no_two_DIFFERENT_ids_carry_the_same_finding`, in
`draft/tests/test_defect_register.py`, beside the existing (but
orthogonal) `test_no_two_rows_share_an_id`. It normalises each row's
headline — strips emoji/markup and a leading `(renumbered from X at
merge…)` annotation — and fails if the same normalised headline appears
under more than one id.

**The parenthetical-stripping step exists because the first version of this
check missed one of the three pairs** (`43`/`DS3`): the `(renumbered from 37
at merge — id taken)` prefix alone pushed the shared text past the 120-char
comparison window. Found by re-running the check against the live file after
believing it was done, not by inspection — the check caught its own author's
premature confidence.

**Known-positive control**: a synthetic fixture with two rows sharing a long,
verbatim-identical opening sentence under different ids, differing only after
that shared prefix — mirroring the real bug shape rather than an easy exact
match.

## WHAT THIS DOES NOT COVER

- **Not every dangling cross-reference in the file.** Two remain (`row 15`,
  `row 20b`) and both are benign, historical narrative — `15` was
  deliberately split into `15a/15b/15c` and says so; `20b` is prose
  describing what a future dispatch will answer, not a broken index lookup.
  Left alone rather than over-fixed.
- **Not a claim that this cannot recur.** The guard catches the *shape*, not
  the *cause* — parallel branches will keep producing this until the register
  has an actual reservation mechanism (a real fix, out of scope tonight).
- **Nothing else in the row content was touched** beyond the stale
  cross-references named above; no verdict, number, or status was changed.
