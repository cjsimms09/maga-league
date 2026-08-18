# ROW 16 — the two Vegas copies: one is committed, the other never was

_TERRITORY: D — data stewardship. Written 2026-08-17, session D's third item._

**Row 16 says two copies of the same Vegas lines exist and nobody has checked
they agree. Only one of them is in the repository.** The second — the
`spread_line`/`total_line` columns inside the pbp pull — was reported by C and
never committed, so the diff the row asks for has no second input to join
against.

**That is a lane boundary, not a data gap.** The nflverse pbp release was probed
today and answers **HTTP 200**. Fetching is C's lane, so the fetch is parked with
an exact spec and the reconciler is built, proven, and waiting.

---

## WHAT I EXPECTED BEFORE LOOKING

Rule 3d, same as the previous two items. **I expected to find both copies
committed and to spend the session diffing them**, with the likely outcome being
coverage differences (this store is REG-only; the pbp copy includes postseason)
rather than value disagreements, since both descend from the same nflverse
release.

**The diff could not be run at all.** So the session went to the two things that
could be done honestly: proving the reconciler works, and validating the copy we
do hold.

---

## 1. THERE IS ONE COMMITTED COPY, NOT TWO

Searched every committed JSON for `spread_line`: **exactly one file**,
`draft/backtest/vegas_lines_2021_2026.json`. The figure row 16 cites for the
second copy — *3 seasons, 854 games incl. post* — appears nowhere in the
repository except the relay's paraphrase of C's report (`ROUTES.md:239`).

The pbp copy is real, but it lives inside a live `import_pbp_data()` call. It
is not an artifact; it is a column in a dataframe that existed during one of C's
runs and was never written down.

**Which is itself the finding worth recording.** Row 16 was filed as *"nobody has
checked they agree."* The truer statement is **"one of the two copies was never
retained, so nobody could."** A quantity observed once in memory and reported in
prose is not a second copy — it is a claim about one.

**Reachability, probed 2026-08-17** (the "response code from an attempt made this
week" standard):

| URL | code |
|---|---|
| `…/releases/download/schedules/games.csv` (this store's source) | **200** |
| `…/releases/download/pbp/play_by_play_2024.parquet` | **200** |

So question 2 of the lifecycle chain — *can we get it* — is **yes, today**.

## 2. THE RECONCILER IS BUILT AND PROVEN

`draft/tests/test_vegas_lines_reconcile.py` ships `reconcile()`, joining on
`(season, week, home, away)` exactly as the row specifies, and **the real
cross-copy test runs the moment a second copy lands** at
`draft/backtest/vegas_lines_pbp.json`. Until then it skips, and the skip message
carries the reason rather than an excuse.

**It refuses to inner-join.** Rows present on one side only are reported as
`only_a` / `only_b`, never dropped. That is deliberate: a silent intersection is
what made register row 18's oracle unanswerable, and here it would hide the one
difference we already expect — this store is REG-only, the pbp copy includes
postseason. A reconciler that quietly intersected would report a clean diff over
a shrunken population and call it agreement.

Three controls prove it can fail, all passing:

| control | proves |
|---|---|
| seeded 0.5-point spread revision | a real disagreement is **found**, at the right key and field |
| a week-19 row on one side only | a coverage gap surfaces as `only_b`, **not** as a disagreement |
| **one of the real 1,426 rows perturbed** | key construction works on **real** rows across all six seasons, not just fixtures |

The last one matters most: a self-join of the real store against itself would be
true by construction and prove nothing. Perturbing exactly one row and requiring
exactly one hit is what makes it evidence.

## 3. THE COMMITTED COPY IS CLEAN — including one thing that looks like a defect and is not

Every check below is new, runs on the real store, and **was verified to fail on
purpose** (§5).

| check | result |
|---|---|
| stored counts vs the provenance block | **match, all six seasons** |
| the 205 `games_without_lines_dropped` | **fully explained**: 272 − 67 = 205, all 2026 fixtures not yet lined. No 2021-25 game was silently lost |
| duplicate fixtures | **0**, all seasons |
| a team playing twice in one week | **0**, all seasons |
| REG-only (max week ≤ 18) | **holds**; 2026 runs weeks 1-5 |
| sign convention (the `_note`'s own cited control) | **holds** — 2021 wk1 TB home, `spread_line` **+10.0** |
| absent-is-absent: nulls, or a line stored as `0` | **none** |

**And the one that would read as a bug to a naive check.** 2022 stores **271**
games where every other full season stores 272. A "272 per season" assertion
would flag it. It is correct: **BUF@CIN, week 17, abandoned after Damar Hamlin's
cardiac arrest and never replayed.** The store shows exactly two teams at 16
games — BUF and CIN — and no such fixture in week 17. That is now pinned as a
named test, so the next person to see 271 does not re-investigate it, and so a
*different* missing game cannot hide behind the same number.

2026 lines are present for weeks 1-4 in full (16 each) and 3 games of week 5 —
the book has not priced further out. Absent, not zero. Working as intended.

## 4. WHAT THIS DOES NOT COVER

- **The cross-copy diff itself has not run.** Everything above validates one copy
  and the machinery; it says nothing about whether the two agree. Row 16 stays
  open on that.
- **`_note` correction from row 18 still pending** — the `_note` this store
  carries is C's to fix and is parked separately.
- **No claim about which copy would win a disagreement.** If they differ, the
  question is which one feeds a number Cory sees, and that is A's ruling.

## 5. THE TESTS, AND THE FOUR BREAKS THAT PROVE THEM

Twelve checks in `draft/tests/test_vegas_lines_reconcile.py` (11 pass, 1 skips on
the missing second copy). Deliberate breakage, each caught by the right test:

| break | caught by |
|---|---|
| invert the sign convention (TB +10.0 → −10.0) | `test_the_sign_convention_control_the_note_cites_still_holds` |
| store a missing line as `0.0` | `test_absent_is_absent_no_line_is_ever_stored_as_zero` |
| silently drop a real 2024 game | the real-store reconciler control (row count 1,426) |
| leak a week-19 postseason row in | `test_the_store_is_regular_season_only_as_its_note_claims` |

**One honest note on break 3:** I expected the dropped-games test to catch it and
it did not — updating `games_per_season` alongside the deletion keeps
`272 − 67 = 205` true. The real-store control caught it instead, on the flattened
row count. Recorded because the drop test is narrower than it looks: it proves
the 205 figure is *explained*, not that no game went missing.
