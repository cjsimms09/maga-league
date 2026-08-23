# PROPOSED DIFF — register 269, for A to accept or reject

**Session D, 2026-08-23.** Filed ahead of my stated 08-30 default, because
register 60's roster-shape test cannot start until `engine_ablation.js` runs,
and every engine-ablation measurement is blocked behind this.

**This is a proposal, not an edit.** All three files are TERRITORY: A and are
**unchanged on this branch** — the patch lives here as a file. Apply with:

```
git apply draft/audit/proposed/register269_kept_players_seat_filter.patch
```

---

## What it fixes

`kept_players` **changed meaning** at commit `4750fbce` ("Draft board: rebuild
2026-08-22"). Measured, not recalled — the eight boards before it carry 3 rows,
all `team_slot: 8`; that one carries **23 rows across slots 1-9**:

| board commit | date | `kept_players` |
|---|---|---|
| `4750fbce` | 2026-08-22 | **23 rows, slots 1-9** |
| `9758fa02` and the 7 before it | 2026-08-20..22 | 3 rows, slot 8 only |

Three tools read the whole list as *mine* and die at their own two-source guard:

```
Error: keeper sources disagree: config/keepers.json vs board kept_players
```

**The sources do agree.** `keepers.json` holds 23 rows too, and for slot 8 both
give exactly Ja'Marr Chase, Derrick Henry, Kenneth Walker. The guard is
comparing **3 config keepers against 23 board rows** — different-sized things.

## What the diff does — two legs, not one

Register 269 as filed named only leg 1. Leg 2 was found by running the patch.

**Leg 1 — filter to my seat.** `const MY_KEEPERS = board.kept_players` becomes
`(board.kept_players || []).filter(k => Number(k.team_slot) === MY_SLOT)`, in
all three files (in `engine_ablation.js` it is inline in the guard).

**Leg 2 — union both lists for the OPPONENT-keeper lookup.** With leg 1 alone,
`archetype_rooms.js` then throws `designated keeper not on board: Ashton
Jeanty`. `kept_players` is **fully disjoint** from `players`: **0 of the 23
kept ids appear in the 680-row pool.** So `new Map(ALL.map(...))` resolves
**none** of the 20 opponent keepers — Jeanty was just the first one it met.
`byId` is built from `ALL.concat(board.kept_players || [])`, the way the other
readers in this repo already do it.

## Verified, not asserted

| check | before | after |
|---|---|---|
| `archetype_rooms.js` | throws at the keeper guard | past both guards, simulating |
| `variance_portfolio.js` | throws at the keeper guard | past both guards, simulating |
| `engine_ablation.js` | throws at the keeper guard | past both guards, simulating |
| leg 1 alone, `archetype_rooms.js` | — | **still throws** on Jeanty — this is why leg 2 exists |
| filtered set vs `keepers.json` slot 8 | 23 vs 3 | **3 vs 3, set-equal both directions** |

**ONE OF THE THREE HAS NOW RUN TO COMPLETION.** `variance_portfolio.js`
finished 120 paired rooms per arm and printed a full table:

```
VARIANCE PORTFOLIO — 120 paired rooms/arm, seeds 1-120, tie band 2
  shipped    $total(cal) 656.9  $weekly 244.4  pHigh 16.29%  wk pts 117.4 ...
  var_tilt   $total(cal) 692.4  $weekly 258.3  pHigh 17.22%  wk pts 118.1 ...
  var_avoid  $total(cal) 655.3  $weekly 241.3  pHigh 16.09%  wk pts 117.4 ...
```

**STATED BOUNDARY — and it is the honest one.** That is one complete run, so
the patch is proven end-to-end for `variance_portfolio.js`. The other two were
still simulating when I filed this — past both guards, no completed run — so
for those I claim only that the blocker is gone, **not** that their numbers are
right. The three "before" throws and the leg-1-alone throw are complete
observed runs.

⚠️ **THE RUN REWRITES A COMMITTED ARTIFACT AS A SIDE EFFECT** —
`draft/data/variance_portfolio.json`, all 10,757 lines. That is register 58's
class. **I reverted it**; a patched tool A has not accepted must not leave its
output in the store. Worth knowing before you apply and run.

## What I did NOT do

Register 269's own broader recommendation — sweep for other readers assuming
the narrow meaning — **is done, and it found more than this row covers.** It is
**not** in this patch, because those files are B's and A's territory and the
defects are different in kind. Filed separately; see the register.

The rename the row recommends (`MY_KEEPERS` is the entire defect encoded as a
name) is **not** in this patch either — it touches call sites I would be
guessing at. A's call while applying.

`SEND BACK` is a complete answer if `kept_players` is meant to stay league-wide
and the *guards* are what should change — in which case the fix is at the
comparison, not the read, and the meaning change belongs in a comment on the
builder so the next reader does not re-derive it.
