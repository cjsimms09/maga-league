# ROWS 13 / 13b — `snap_counts` does not feed `projections.py`

_TERRITORY: D — data stewardship. Written 2026-08-17, session D's second item._

**The register rows say `snap_counts` feeds `projections.py` and stops at
lifecycle step 6 (predicting, ungraded). It does not feed it, and it stops at
step 4.** The correct state was already committed, in the right place, on the
same day — `draft/capture_registry.py`. Two of my own lane's files disagreed
with it and nobody reconciled them.

Nothing was fetched and nothing was re-run. Every figure is read off a committed
file.

---

## WHAT I EXPECTED BEFORE LOOKING

Rule 3d, same discipline as row 18. **I expected to find `snap_share` computed
inside `opportunity_metrics`, reaching a board field, with no grader attached** —
i.e. the register's claim, a store stopped at step 6. The interesting question
would then have been how to grade a contribution already in production five days
before a draft.

**That is not what is there.** The question turned out to be the easier one, and
the defect turned out to be in my own lane's bookkeeping.

---

## 1. THE MEASUREMENT — four places checked, all agree

| where | what I looked for | result |
|---|---|---|
| **the board** `public/draft_data.json` | any snap-derived field, 682 rows, 56 distinct keys | **NONE** |
| **`own_model_v6.py`** (the live model) | any occurrence of `snap` | **0** |
| **`build.py`** | any occurrence of `snap` | 19 — **all `snapshot`**, zero snap-count |
| **`projections.py`** | the claimed consumer | mentions it **only to say it is not computed** (`:131-136`) |

`projections.py:131-136`, in `opportunity_metrics`' own docstring, corrected
2026-08-17:

> *"THE CONTRACT USED TO PROMISE `snap_share` AND `xfp_delta` AND NEITHER IS
> COMPUTED ANYWHERE."*

And `draft/capture_registry.py:138-144` already records the state exactly:

> *"STILL NOT ON THE BOARD, but no longer a data gap — the source was pulled
> 2026-08-17. What remains is a **WIRING gap: nothing joins snap share onto a
> board row yet, deliberately**, because a new input wired live five days before
> the draft is a worse instrument than a known one."*

**So `snap_counts` stops at step 4 — "are we using it to predict?" — not step 6.**

## 2. WHAT THIS CHANGES ABOUT THE ROWS

**Rows 13/13b's next action is unexecutable as written.** *"Grade the snap-share
contribution, or state why it is unmeasurable"* presumes a contribution. There
isn't one. There is nothing to grade, and that is not a measurement problem — it
is a wiring decision that has already been made and written down.

**Rows 13/13b and row 14 are the same row.** Both are step-4 stores: captured
weekly, reaching no prediction, awaiting a preregistered feature and a
measurement. They were filed as different shapes because the lifecycle table said
one predicts and the other does not. It doesn't.

**And the stop is NOT "UNEXAMINED".** `DATA-LIFECYCLE.md` marks it that way. The
registry gives a reason, it is deliberate, it is dated, and it is the same reason
the brief gives for everything else in §7: *nothing new ships before 08-22.*
**What the stop genuinely lacks is a re-test trigger** — which is register row
17, not rows 13/13b.

## 3. THE STORE ITSELF IS IN GOOD SHAPE — and it does the thing row 18 could not

Read off the files, per the "*it's captured* → row count and join rate" standard:

| season | stored player-weeks | weeks | join rate |
|---|---|---|---|
| 2021 | 7,212 | 22 | — |
| 2022 | 7,129 | 22 | — |
| 2023 | 7,147 | 22 | — |
| 2024 | 7,180 | 22 | **0.9919** |
| 2025 | 7,037 | 22 | — |
| **total** | **35,705** | | |

`pct` spans 0.000–1.000 with 101 distinct values; `share_volatility` carries a
real per-player `mean_pct` / `sd_pct`. **This input varies** — Rule 3d Q1 would
pass on it comfortably if anything consumed it.

**A note on 35,705 vs the brief's 35,869.** Not a discrepancy — two different
quantities. 35,869 is the sum of `join.skill_player_weeks` (what the source
offered); 35,705 is what survived the crosswalk and was stored. **164 rows,
0.46%, lost at the join, and the store says so itself:**

```json
"join": {"skill_player_weeks": 7202, "distinct_pfr_ids": 620,
         "resolved_to_gsis": 617, "resolved_to_sleeper": 615,
         "join_rate": 0.9919,
         "lost_at_pfr_to_gsis": 3, "lost_at_gsis_to_sleeper": 2}
```

**That is exactly the counter whose absence made row 18's question 2
unanswerable.** `fetch_snap_counts.py` records join survival per hop, in the
artifact, unprompted. `exp_weekly_env.py` records none for any arm. **The fetch
lane already meets the standard the study lane does not** — recorded here because
it is a ready-made example, not a thing to invent (see the ASK in `ROUTES.md`).

## 4. TWO STALE CLAIMS SURVIVE IN `projections.py` — parked, not touched

`draft/projections.py` is the Module 2 engine — **A's file.** Both are one-line
comment corrections; requests filed in `ROUTES.md` with replacement text.

1. **`:5`** — the module docstring still lists the engine's nudge inputs as
   *"target share, air yards, red-zone work, **snap share**"*. Snap share is not
   one of them. `:131` corrects the same promise for `opportunity_metrics` and
   the module header above it was left saying it.
2. **`:135`** — *"Snap share needs nflverse snap_counts, **which this repo has
   never pulled**"*. **False since 2026-08-17**; 35,705 player-weeks are
   committed with a weekly job.

Claim 2 is worth naming precisely, because the project already caught it once.
`draft/tests/test_capture_registry.py::test_snap_share_gap_narrowed_from_data_to_wiring_when_the_source_landed`
asserts, of the registry entry:

```python
assert "never pulled" not in why, "the source WAS pulled; this claim is stale"
```

**The identical false sentence was scrubbed from the registry and left standing
in the engine two directories away.** One fact, two homes, one of them tested —
the drift this repo finds in itself more than any other class.

## 5. WHAT I CHANGED

- **`DATA-LIFECYCLE.md`** — the `snap_counts` row now reads step **4**, predicts
  **❌**, with the registry's recorded reason and a re-test trigger.
- **`DEFECT-REGISTER.md`** rows 13/13b — corrected to the real stop, next action
  replaced with one that can actually be done, merged in shape with row 14.
- **`draft/tests/test_data_lifecycle_predicts_column.py`** — new, three checks,
  the middle one with the known-positive control that makes the other two mean
  something (§6).

**The weekly job keeps running.** Rule 3c, and it is not a close call: 2026 snap
counts cannot be re-fetched in 2027, and this store is the only per-player
dispersion input the project holds that is not `proj_mean × a constant`.

## 6. THE TEST, AND WHY IT CAN FAIL

`draft/tests/test_data_lifecycle_predicts_column.py`. The defect here was **a
claim in a table that no code checked**, so the fix is a check that reads both
sides.

1. **`test_the_board_field_detector_finds_fields_that_are_really_there`** — the
   **CONTROL**, and the other two are worthless without it. The same detector
   used below must find `wopr`, `target_share` and `opportunity_share` on the
   board, each non-null on 445 of 682 rows. Without this, "no snap field on the
   board" would pass just as happily on a detector that finds nothing at all —
   which is precisely the shape of the defect the whole project is cleaning up.
2. **`test_snap_counts_and_routes_reach_no_board_field`** — pins the measured
   fact. **Fails the day either one is wired**, which is the day the lifecycle
   table and the register rows must move with it.
3. **`test_data_lifecycle_agrees_with_the_board_about_what_predicts`** — parses
   `DATA-LIFECYCLE.md`'s own table and asserts its `snap_counts` and `routes_*`
   rows do not claim step ≥ 4. **This test fails on the file as it stood this
   morning**, which is the point: the table asserted a wiring that the board
   contradicted, and nothing could tell.
