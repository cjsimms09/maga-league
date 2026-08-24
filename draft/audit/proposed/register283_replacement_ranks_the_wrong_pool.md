# Register 283 — replacement ranks a pool the keepers left. Three files, one idea.

**E, 2026-08-24. For A.** Apply with
`git apply draft/audit/proposed/register283_replacement_ranks_the_wrong_pool.patch`,
then verify with `python3 draft/audit/proposed/register283_control.py` (4 controls).

## The idea, in one line

**Rank over everyone who starts; price only what can be drafted.**

`replacement_levels` and `apply_vorp` gain an optional `full_pool=` keyword. It
defaults to `players`, so **every existing caller is byte-for-byte unchanged** —
and the control asserts exactly that (C1).

## Why the change is needed

At the 08-22 03:51 keeper lock, `build.py` stopped putting the 23 kept players in
`available`. `starter_counts` stayed at its **league-wide** values (RB 20 · WR 30
· TE 10 · QB 10). Every keeper starts, so the counts had to fall by the same 23
and did not — and replacement is *the Nth-best projection*, so dropping 12 RBs
and 9 WRs from the list while still reading off rank 20 and rank 30 walked the
marker 12 and 9 places deeper.

`vorp = proj_mean − replacement`, so understating it **overstates** every VORP at
that position, **in proportion to keepers lost there** — a cross-position error,
on a board `overall_rank` sorts by.

## ⚠️ TWO FILES, NOT ONE — and the second is the one that matters

`attach_draftsharks.py:259` runs **after** `build.py` in `draft-data.yml`
(line 567 against 217) and re-derives replacement from `board["players"]`, which
post-lock excludes the keepers.

**A patch touching only `build.py` would have looked correct, passed locally, and
produced an identical board in CI.** That is register 253's shape — a consumer
downstream of the producer, quietly undoing it. Both call sites are in the diff.

## Why `full_pool` and not "subtract keepers from the counts"

The obvious alternative — keep ranking the draftable pool and subtract
kept-at-position from `counts` — gives the **identical answer on today's board**
and is **wrong in general**.

It is equivalent only while *every* keeper outranks his position's replacement.
23 of 23 do here. Keep one late-round flier ranked below replacement and the
count-subtraction lands a rank short; ranking the full pool cannot. Both
derivations are in register 283 precisely because they agree today — that
agreement is the control, not the design.

## What it does to the board

| | shipped | fixed | every player at the position |
|---|---|---|---|
| RB replacement | 147.8 | **181.1** | VORP falls 33.3 |
| WR replacement | 142.9 | **170.3** | VORP falls 27.4 |
| TE replacement | 138.0 | **141.7** | VORP falls 3.7 |
| QB replacement | 347.8 | **350.8** | VORP falls 3.0 |
| flex split | RB +0 / WR +10 | **RB +4 / WR +6** | |

**The RB-over-TE tilt of +29.6 and the WR-over-TE tilt of +23.7 disappear**, and
`overall_rank` reorders accordingly. The corrected flex split matches the
realized greedy on 2023/24/25 outcomes, 420 team-weeks of owners' actual
lineups (4.1 / 5.6 / 0.1), and **the board's own value sixteen minutes before the
lock**.

## Consequences worth ruling on rather than discovering

- **No committed artifact changes.** The board moves on the next rebuild, not on
  apply. Every test that pins `public/draft_data.json` stays green today.
- **It changes what Cory reads in-season.** Trade-board comparisons, the waiver
  block's `startable_value`, and keeper valuations all sit on `vorp`.
- **`keeper_optimize.py` prices keepers off `apply_vorp`'s output** (its own
  comment says so). Its numbers move with the board. That is the intended
  direction — a keeper is worth what he beats *at the slot he costs* — but it is
  a second surface, named here rather than found later.

## Test state, measured not assumed

Seven replacement-sensitive suites run before and after:

```
board_is_internally_consistent    PASS -> PASS
dollar_replacement_baseline       PASS -> PASS
override_vorp                     PASS -> PASS
test_kept_players_carry_vorp      PASS -> PASS
test_keeper_lock_releases_slate   PASS -> PASS
test_exp34_dollars                PASS -> PASS
keeper_lock_reorders_the_board    FAIL -> FAIL   (pre-existing on pristine main,
                                                  register 276's expired-premise
                                                  slate rows — not this patch)
```

**Nothing breaks.** The one red was red before, verified with `git stash`.

## Controls

1. **C1** — the default call reproduces the **shipped** replacement block exactly,
   so the change is opt-in and no untouched caller moved.
2. **C2** — with `full_pool` it produces RB 181.1 / WR 170.3 / TE 141.7, which
   register 283 derived **independently**, in a different language, from a
   standalone greedy. Cross-check, not tautology.
3. **C3** — the flex split goes 0/10 → 4/6.
4. **C4** — `vorp == proj_mean − replacement` holds on all 680 priced rows.

`ASK:` apply, or SEND BACK.
`DEFAULT:` the row stays 🔴 and every VORP-derived number published since
08-22 03:51 keeps its caveat.
