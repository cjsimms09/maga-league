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
