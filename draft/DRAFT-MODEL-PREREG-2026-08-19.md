# PREREGISTRATION — the model Cory has asked for three weeks running

**A, 2026-08-19, committed BEFORE the run.** Draft is Saturday. This is the
build, not another experiment.

> *"Ive been saying for 3 weeks.. build me a model that drafts value early,
> builds a normal roster, and drafts for upside at the end!! we need to do this
> in the next 2 days"*

> *"you need to stop grouping players ceilings together by age or position..
> Each player has their own projected ceiling and it could be irrelevant to
> another player at same age and position. ie. one rookie RB is 2nd round pick
> and other is a non drafted player whos 4th on his teams depth chart"*

---

## THE RULE THAT DELETES THE THREE PHASES

I have twice tried to build "value early / upside late" as a **ramp on round
number**, and a ramp on round number is a knob I chose. There is a reason
underneath it that makes the knob unnecessary:

**A starter's floor can lose you a week. A bench body's floor costs you
nothing, because you drop him.**

That is the whole of it. If a body is going to start, his bad outcome is
*yours to eat* — you must field him. If he is the twelfth man on a fifteen-man
roster, his bad outcome ends with a waiver claim in week 3, and the *only*
reason to have used a pick on him is the outcome where he hits.

So **which end of his band we read is decided by whether he starts**, not by
what round it is:

```
w        = P(this body starts)          -- Cory's own curve, indexed by bodies held
safe     = proj − LEAN × (proj − floor)     ← a starter is priced at his bad weeks
bold     = proj + LEAN × (ceiling − proj)   ← a bench body is priced at his good ones
band     = w × safe + (1 − w) × bold
value    = max(0, band − wire(pos)) × w
```

Early picks fill starting slots, so `w ≈ 1` and they are valued conservatively.
Late picks land on positions already full, so `w ≈ 0` and they are valued at
their ceiling. **"Value early, upside late" is an OUTPUT of this rule, not a
setting inside it** — and it produces the normal roster in the same line,
because a full position has both a crushed multiplier and no claim on safety.

`LEAN` is Cory's ceiling adjuster, the one knob, ∈ [0,1]. **It is not fitted.**
The board prints at 0.0 / 0.5 / 1.0 and he picks — `no_fit_guard` forbids me
selecting it from a sweep.

## EACH PLAYER'S BAND IS HIS OWN — the correction that comes first

`lineup_sim.js` divided every player's band width by `VET_WIDTH[position]`, the
median width among 3+-year players at his position, and scaled his injury risk
by `RISK_MED[position]`. **Both are the grouping Cory just forbade.** Under
them, a rookie back taken in the 2nd and an undrafted back 4th on the depth
chart are read against the same veteran denominator, so a wide band gets
reported as "wide *for a running back*" instead of as what Draft Sharks said
about *him*.

**In this model no cohort statistic touches a band.** `floor`, `proj` and
`ceiling` enter per player and nothing is normalised by position, age or
experience. The only per-position numbers in the file are the **waiver level**
(a property of the league's leftovers, not of any player) and the **need
curve** (a property of the roster, not of any player). C1 enforces this by
construction and names every cohort table that was deleted.

## AMENDMENT, BEFORE ANY RUN — INJURY RISK

> Cory, mid-build: *"does your approach that you conceptulized take into account
> injury risk"*

**It did not.** The first draft of this file carried `injury_risk_pct` on every
player and never used it. Two things I checked before deciding how it enters:

**1. It is not already inside the band.** `r(band width, injury risk) = −0.069`
across all 247 players carrying both. Draft Sharks' floor is *not* quietly
pricing durability, so using both is not double-counting — it is using
information the model was throwing away.

**2. The tax is measurable here, and I measured it rather than declaring it.**
Across 429 player-seasons in this league's own history, a rostered player posts
**exactly zero in 16.9% of his rostered weeks**. One bye is 5.9% of a 17-week
season, leaving **11.0% of weeks lost beyond the bye**.

⚠️ **That 11.0% is an UPPER BOUND on missed games**, because "exactly zero"
also catches a healthy scratch and a genuinely pointless afternoon. It is
stated as a bound, not as an injury rate.

**How it enters — the same lever, for the same reason.** Injury hurts
asymmetrically by roster slot in exactly the way the band does: a starter who
misses time costs you real weeks, because you must field someone worse. A bench
body who misses time costs you almost nothing — he was benched anyway, and you
drop him. So durability discounts value **in proportion to `w`**, adding no new
mechanism:

```
avail  = 1 − MISS_MAX × (risk / 100)          his own DS number, ungrouped
value  = max(0, band − wire) × w × (w × avail + (1 − w))
```

`MISS_MAX = 0.110 / 0.316 = 0.348` — the one global scalar that makes the
model's mean availability loss equal the **measured** 11.0%, given the pool's
mean risk of 31.6. **It is an anchor, not a fit:** it is calibrated to one
league-wide aggregate and every player keeps his own DS number and his own
position in the ordering. This is the same class of object as the waiver level.
It is emphatically **not** `RISK_MED[position]`, the cohort scaler Cory just
forbade, which is deleted.

**P212 — durability moves picks, and it moves the RIGHT ones.** With the term
on, the **mean injury risk of the drafted starting core falls by at least 3
points**, while the **mean risk of the bench bodies does not fall** — that is
the asymmetry showing up as behaviour rather than as an equation.

**FALSE if the starting core does not drop 3 points, and FALSE if the bench
drops as much as the starters** — a uniform discount would mean the `w`
weighting is doing nothing and I have added a knob for no reason.

⚠️ **Its own known-positive (rule 3e):** a planted twin at maximum risk must
lose value in a starting slot and must lose materially less in a bench slot. If
the term cannot move a pick when the risk difference is maximal, P212 failing
tells us nothing.

---

## AMENDMENT 2, AFTER RUN 1 — THE BASELINE IS THE MAN HE DISPLACES

**Run 1 came back `QB 1.69`, `TE 0.15`.** Cory's curve puts a 2nd QB at
`w = 0.05` — a twentyfold hole — and it took one anyway, in most rooms. That is
the same failure that has survived a dozen arms, and run 1 shows the mechanism
in one line:

```
133  Sam Darnold  QB  w 0.05  floor 305.4  proj 308.9  ceiling 462.8  used 381.9
```

At the end of a draft **every** position sits near `w = 0.05`, so `w` stops
discriminating and raw surplus decides. A backup QB's ceiling clears the QB wire
by **63 points**; a 6th receiver's clears the WR wire by **39**. The
quarterback wins on scale, exactly as in P196.

**The defect is the baseline, and it is a football error, not an arithmetic
one.** `max(0, band − wire)` asks *"how much better is he than a freely
available quarterback?"* But **I already hold a quarterback projecting 348.8**.
A second one cannot earn a single point unless he beats **my starter** — I can
only field one. The wire is the right baseline for a body that will **fill an
empty slot**; it is the wrong baseline for a body that must **displace someone I
already own**.

This is Cory's own instinct — *"Value is wrong?? Shouldn't it only compare to
waiver when drafting bench?"* — turned the correct way round:

```
baseline(pos) = wire(pos)                      if I still have an empty slot there
              = max(wire, worst body I hold)   if the position is already manned
```

**It needs no new parameter and no new curve.** It also fixes `TE 0.15` from the
other side: with the tight end slot genuinely empty, his baseline stays the wire
and he keeps his full claim.

**P213 — the right baseline kills the second quarterback without being told
to.** With it, **mean QB ≤ 1.1 and mean TE ≥ 0.9** over 300 rooms, at the same
`LEAN` and with `W` untouched.

**FALSE if either misses.** ⚠️ **`W` is Cory's transcription and does not move.**
If P213 fails, the next step is another defect, **not** a smaller number in the
QB row.

### ⛔ AMENDMENT 2 IS WITHDRAWN — run 3 killed it

| run | baseline | QB | TE |
|---|---|---|---|
| 2 | worst held man's **projection** | 1.22 | 1.00 |
| 3 | worst held man's **band** | **3.10** | **5.78** |

Run 3 drafted **five tight ends** and took men at `w = 0.00`, which is only
possible when every candidate scores exactly zero and the tie falls to pool
order. Henry and Walker fill both RB slots, so every drafted back had to beat
Walker's own band at 218.4, none could, and RB surplus went to zero board-wide.

**The collapse is a symptom; the rule was the error.** A third running back does
not displace Derrick Henry — he starts the week Henry is hurt or on bye, and in
*that* week the man he replaces is whoever I could have streamed. **His
alternative is the wire.** Measured starters-per-week says it out loud: RB
2.417, WR 2.556.

And it is true at quarterback, which is the part I had backwards. If Stafford
goes down I do not start Darnold *because he beat Stafford* — I start someone
*because Stafford is out*, and the alternative is again the wire. **`w` carries
how OFTEN that happens; the baseline carries what it is worth WHEN it happens.**

**P196 stands. The baseline is the wire at every position.** P213 is withdrawn
with it — it tested a fix that turned out to be wrong, so its bar was never
meaningful.

**Run 4, wire baseline + the forcing fix and nothing else: QB 1.82, RB 5.00,
WR 5.17, TE 1.00, K 1.00, DEF 1.00.**

### A defect the crash caught that nothing else had

`PLAN.keep` joins to the board by name, and **Chase, Henry and Walker are not
among the board's 700 players** — the board holds *draftable* men. So the
snapshot never saw them, the blend never saw them, and the line I replaced was
`pool.find(...) || { proj: k.proj || 0 }`, which would have made **Ja'Marr Chase
a zero-point incumbent at receiver**, silently, in every room. Their bands now
come from Draft Sharks by `sleeper_id`, on the blend's scale via the blend's own
per-position offsets. Cross-check: 266.1 / 246.3 / 237.3 against the board's
independent 271.8 / 259.2 / 233.8.

### Two failures from run 1 that were the CHECKS, not the model

- **C1 fired on its own documentation.** It scanned the raw file, so it matched
  `VET_WIDTH` and `RISK_MED` in the header comment saying those tables are
  *deleted*, and in its own banned list. A control that fires on prose about a
  defect instead of on the defect is measuring the wrong thing. **The check is
  fixed — comments and the checker's own body are stripped — and the bar is
  untouched.**
- **C4 fired on the model, and was right.** 295 of 300 rooms ended with an
  **empty starting slot**. The gate excluded *bad* positions but never *required*
  one that fills an empty slot, so a 6th receiver at `w = 0.05` was legal on the
  last pick while the tight end slot sat vacant. Forcing now means what the word
  means.

**P210 came back 1.37× against a preregistered bar of 1.40×, which is FALSE.**
The bar does not move. It is re-graded once on a run without the C4 defect,
**and both numbers are reported.**

---

## PREDICTIONS

**P209 — the roster comes out normal, unprompted.** Over 300 differing rooms at
`LEAN = 0.5`, the mean drafted roster is **exactly 1 QB, 1 TE, 1 K, 1 DEF**,
and **RB + WR fill the remaining 8 picks with more WR than RB in ≥ 80% of
rooms**.

**FALSE if any onesie misses 1.0 by more than 0.1, or if WR > RB in under 80%.**

**P210 — it drafts value early and upside late without being told to.** In the
same rooms, the **last four picks carry a wider mean band** — `(ceiling −
floor) / proj` — **than the first four, by at least 40% relative.**

**FALSE if the gap is under 40%, and FALSE IN THE OTHER DIRECTION TOO** — if
early picks are the wild ones, the rule is backwards and I want to know Thursday
and not Saturday.

**P211 — the knob does what Cory said it does.** At `LEAN = 0`, every player is
valued at his blended projection exactly (identity check). At `LEAN = 1`, a body
at a position with `w = 0` is ranked on **pure ceiling**, and one with `w = 1` on
**pure floor**.

**FALSE if either identity fails by more than 1e-9.**

## CONTROLS

1. **C1 — no cohort statistic touches a band.** Asserted in the file: the only
   position-indexed tables permitted are `WAIVER` and the need curve, and the
   test fails if a band term is divided by any per-position aggregate.
2. **C2 — a KNOWN-POSITIVE, because rule 3e forbids a null probe without one.**
   Feed the model a pool where one bench-slot player has an enormous ceiling and
   an identical projection to his neighbours; he must be taken. If the ceiling
   arm cannot move a pick when the ceiling difference is made huge, a null
   result later means nothing.
3. **C3 — players without a Draft Sharks band are NAMED, never back-filled.**
   453 of 700 have no band. They enter at `floor = proj = ceiling`, so `LEAN`
   cannot move them, and the count is printed. An invented band is the exact
   thing Cory has been correcting for two days.
4. **C4 — the comparator is not a straw man.** The "no rule" arm keeps the
   hard K/DEF fill so it cannot draft twelve quarterbacks and hand me a fake
   improvement. This has happened twice (`simple_model` `off` arm, `lineup_drafter`
   mean arm) and both times the number was garbage.

## GUARD

**REPORT ONLY.** Writes `draft/data/draft_model.json`. Ships nothing, touches no
war-room feed, and `no_fit_guard` stands: **if the roster misses, the response is
to find the defect, not to move `LEAN` until it passes.**

---

## AMENDMENT 4, AFTER RUN 4 — A BACKUP COMPETES WITH STREAMING

> Cory, on run 4: *"pretty clode but QB still too high!!"* — `QB 1.82`.

**The mechanism, isolated.** Late in a draft every position sits near
`w = 0.05`, so `w` stops discriminating and raw surplus decides. Darnold's
ceiling-leaning band clears the QB wire by **59**; the 6th receiver's clears the
WR wire by **39**. The quarterback wins on scale.

**What the surplus was missing is what the wire actually IS.** `WAIVER.QB =
322.9` is the best quarterback left after the draft — but quarterbacks can be
**streamed**, a different one each week, chosen on matchup. The real alternative
to a rostered QB2 is not one fixed man at 322.9, it is a fresh pick every Sunday.
A backup receiver has no such competition: measured streamability is **QB 0.590
vs WR 0.252**.

⚠️ **It applies to BENCH BODIES ONLY, and that restriction is the point.** My
starting quarterback is not competing with streaming — I field him every week by
choice. Only the body whose entire job is to fill in is substitutable by the
wire, so only he pays the tax.

**Not a new knob.** `streamability.json` is measured and passed its own controls,
and this is the same `(1 − streamability)` factor the derived need curve already
used to collapse QB2 from .427 to .084. Cory's transcription of `W` has no
streaming term in it; this is where it belongs. **`W` itself is untouched.**

### RESULT — one change, same rooms

| | QB | RB | WR | TE | K | DEF | WR>RB |
|---|---|---|---|---|---|---|---|
| tax **off** | 1.82 | 5.00 | 5.17 | 1.00 | 1.00 | 1.00 | 17% |
| tax **on** | **1.06** | **5.00** | **5.94** | **1.00** | **1.00** | **1.00** | **94%** |

**P209 TRUE.** Drafted counts are `1 QB, 3 RB, 4.94 WR, 1 TE, 1 K, 1 DEF` — the
roster Cory specified on 08-19, reached without a roster rule telling it to.

### STILL FALSE, AND THE BARS HAVE NOT MOVED

- **P210 — 1.37× against a bar of 1.40×.** Close, and *still false*. The
  mechanism is visible: the forcing fix now puts a K, DEF or TE starter in the
  last four picks, and those bands are narrow by nature (K 0.19, DEF 0.22). The
  bar stays where it was written.
- **P212 — starters' injury risk drops 0.8 against a bar of 3.0.** The direction
  is right (bench drops less) but the size is not there. Early value gaps are
  large relative to a durability discount, so it rarely flips a pick.
- **P214 — gap −5.2, still the wrong sign.** With the tax on, only 17 of 300
  rooms hedge at QB, and QB1 is *marginally better* in those, not worse. So the
  model does not yet reproduce Cory's stated reason for a QB2; it has simply
  stopped taking one. **Those are different things and the register says so.**
