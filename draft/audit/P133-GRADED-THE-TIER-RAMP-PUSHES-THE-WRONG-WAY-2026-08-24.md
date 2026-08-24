# P133 graded FALSE — the tier ramp moves the roster *deeper*, which is the opposite of what it was filed to do

**E (red team), 2026-08-24**, two days before P133's 08-26 date. Reproduce with
`node draft/tools/tier_ramp_probe.js` — 8 controls, all must print OK or the
probe voids its own output and exits 1.

---

## 1. The prereg said to grade this on the seat replay. It cannot be.

`TIER-RAMP-PREREG-2026-08-19.md` §1 rests on one enabling claim: we now have
*"real cross-source ceiling/floor, not a per-band constant."* That is true of the
**live 2026 board** and false of the **seat replay's bundles**.

`build_bundle.py`'s `attach_dispersion` writes `proj_ceiling = proj_mean ×
p90_ratio(position, rank-band)` and says so in its own docstring: *"the measured
ceiling is still proj_mean × a per-cell constant … cannot speak to whether an
individual player is worth taking for his upside."*

I did not take that on the docstring's word — the neighbouring comment in
`engine.js` still describes the pre-08-17 `1.35 × proj_mean`, which has been
wrong for a week. **Measured instead, as a paired control on the same 597
players**, spread of `proj_ceiling / proj_mean` *within* each (position,
rank-band) cell:

| board | within-cell sd/mean |
|---|---|
| bundle-style ceilings (known negative, constant by construction) | **0.0000** in 12 of 12 cells |
| live 2026 board (Draft Sharks) | **0.0804** mean, range 0.0215 – 0.3260 |

On a bundle, `effective_mean = proj_mean × m(pos, tier, band)` — constant inside
a cell, so the arm **cannot reorder two players in the same cell**. It can only
tilt between cells, and the p90 ratio's largest swings are positional (RB
1.66–1.86 against TE 33+ 1.14). A T1−T0 delta there would be a **positional tilt
wearing an upside argument's clothes**. That is `lab_ceiling_degeneracy.js`'s
finding one step removed: not *"could not have come out any other way"*, but
*"will come out for a reason other than the one being tested."*

So P133-b was run where the mechanism is visible: the live board, Cory's real
twelve picks, room drained in ADP order.

## 2. The arm changes two things at once, and the prereg names only one

The prereg describes the shipped mechanism as *"a flat ceiling weight (0.45)
ramped by `autoWeights` — but by ROUND, not by tier."* It is **also switched off
entirely for the first 60% of the draft** — `CFG.CEILING_LATE_FROM = 0.6`, zero
before pick 90 — which the prereg does not mention.

T1 as specified replaces `proj_mean` at **every** pick, so it changes the axis
(round → tier) *and* removes the late-only gate. That is the combined arm this
harness family refuses everywhere else. **`T1_gated` holds the gate and moves
only the axis**, and the split is clean:

| arm | picks identical to T0 (of 12) | first six picks |
|---|---|---|
| **T1** (as preregistered) | **4** | Odunze · Hubbard · **Kittle** · Pierce · **Bryce Young** · White |
| **T1_gated** (axis only) | **8** | *identical to T0 through pick 88* |

**Half the divergence the prereg would have measured is the gate, not the tier
axis.** T1_gated's first divergence is pick 108.

## 3. P133-b: FALSE, and the metric was live

> *"T1 should draft MORE tier-1-talent-fallen-to-a-late-round players than T0,
> identifiable as players with `tier ≤ 3` taken after round 8 … If T1 does not
> show this shift, the mechanism itself has failed regardless of what P133-a
> says, and that is the more informative failure to report."*

| arm | as written | skill positions only |
|---|---|---|
| T0_prereg (`ceiling 0.45`) | 2 | **0** |
| T0_live (`ceiling 0.0`, shipped) | 2 | **0** |
| T1 | 2 | **0** |
| T1_gated | 2 | **0** |

Two things about that table, and both matter more than the zeros.

**The metric as written counts kickers and defences.** All four arms' late
`tier ≤ 3` rows are their K and their DEF — 8 and 6 tiers deep between them, so
the third-best available reaches tier 3. Reported both ways and never
substituted: the preregistered number is 2, and it measures nothing.

**BASE RATE BEFORE SCORE — and this is what turns the zero into a result.** A
metric returning 0 for every arm *including both controls* cannot distinguish
*"the arm did not do it"* from *"nobody could have."* So: how many `tier ≤ 3`
skill players were still on the board at each of Cory's seven late picks?

```
pick   88   93  108  113  128  133  148
avail   7    6    5    4    2    2    1
```

**The metric was live at every one of them and no arm ever took one.** This is a
real FALSE, not an unanswerable null.

## 4. And it is backwards *by construction* — derivable from §3's own table

`w(tier_frac)` runs **0.45 → 0.60 → 0.80** as a player gets deeper. So a deep
tier-15 flier has **0.80** of his ceiling folded into his value and a fallen
tier-2 elite only **0.45**. The formula inflates fliers *relative to* fallen
elites — the precise opposite of the population P133-b predicts it would pick up.

Measured as mean `tier_frac` of the ten skill picks (0 = elite, 1 = deepest;
`tier_frac` and not raw tier, because WR runs to 38 tiers and QB to 9):

| arm | mean tier_frac |
|---|---|
| T0_prereg / T0_live | **0.337** |
| T1_gated | 0.356 |
| T1 | **0.425** |

**The ramp moves the roster deeper, not shallower.** Visible player-by-player at
the top: T1 takes Rome Odunze (WR, tier 8) over Davante Adams (tier 5), Chuba
Hubbard (RB, tier 8) over Rhamondre Stevenson (tier 6), and **Bryce Young (QB,
tier 5) over Matthew Stafford (tier 1)**.

This did not need a run. It is arithmetic on the prereg's own §3 table, and I
could have derived it the day I filed the document.

## 5. P133-a and P133-c

**P133-a (points/dollars) is NOT CLAIMED.** One seat in one draft cannot produce
it, and §1 says the instrument that could is blind to the mechanism. Filed as
not-measured rather than as a null — a null from an instrument that could not
have seen the effect is the shape this project has already been burned by.

**P133-c holds.** I predicted *no measurable interaction* with register 59's
roster-shape problem. T1 draws the same {WR 3, RB 5} skill shape as T0;
T1_gated draws {WR 4, RB 4}, a mild rebalance. Nothing here fixes or worsens the
pileup, which is what P133-c said and is why no shared credit is being claimed.

## 6. Verdict and consequence

**P133 grades FALSE.** Its own consequence route: *"FALSE → the tier-ramp line
RETIRES and the ceiling stays a per-player display field beside VONA, which is
where `ffanalytics` puts it."*

**Retired.** Three things now agree: the reference implementation emits `rank`,
`floor_rank` and `ceiling_rank` as three separate rankings and never folds
ceiling into value (register 99); Cory ruled `MEASURED_WEIGHTS.ceiling` to 0.0
on 08-20 (*"switch it off, its so arbitrary"*); and the one construction that
argued for folding it in on a tier axis pushes the roster the wrong way.

## 7. Limits, stated rather than buried

- **One seat, one draft, one room order.** Decisive for *"does the rule move
  anything, and which way"* — the arms are deterministic — and worth nothing for
  *how much it is worth*, which is why §5 claims no points figure.
- The room is drained in **strict ADP order**, which the real room was not. Same
  caveat `fieldability_probe.js` and `auto_adjuster_probe.js` carry.
- **Register 283 is live on this board**: replacement is understated at RB and WR
  (the probe's own `replacement_used` block records 147.8 / 142.9, against a
  correct 181.1 / 170.3). It is **common-mode across all four arms**, so the
  paired comparison stands, but the absolute rosters are the distorted board's.
- Position tier depth has drifted since the prereg was written (QB 11→9, WR
  28→38, TE 17→18, RB 19→19). §7 of the prereg anticipates exactly this and the
  proportional cutoffs are used as specified.
- **T0 as preregistered no longer ships.** Cory ruled `ceiling` 0.45 → 0.0 on
  08-20, so both baselines are run and reported. On this seat they are identical
  in all twelve picks bar the K/DEF ordering — which is worth a second look on
  its own, since a file every session reads claims switching that weight off
  *"moves 8 of his 12 picks."* Not chased here; noted where it was found.
- The probe is **report-only**: it ships no flag, writes no config, and deep-copies
  before ramping — `register 58`'s class is a probe that edits a committed
  artifact as a side effect, and this file will not be the fourth.

## 8. The control that caught me

C6 exists because my first version of it compared `ceiling: 0` against `ceiling:
0.45` **at pick 33** and got byte-identical scores at 0.0, 0.45 **and 5.0**. I
was one step from filing *"the ceiling weight is disconnected from the score"* —
a finding that would have said both of Cory's ceiling rulings were no-ops.

`CEILING_LATE_FROM = 0.6`. Pick 33 of 150 is 22%. **The engine was right and the
probe was wrong.** The control now runs on both sides of the gate — identical at
pick 33, different at pick 128 — plus a `need 0 vs 1` arm to prove `ctx.weights`
is read at all. Rule 3e, on the day it earned its keep.
