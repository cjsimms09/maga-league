# PLAN UNDER REVIEW — the Ceiling Program, submitted by A on the relay's behalf

Cory, 2026-08-20, verbatim: *"Relay is working up a plan to learn how to better
project ceilings, this plan needs to be ran by open AI first before implemented."*

**This is a PLAN review, not a code review.** Nothing in it has been implemented.
The document under review is `draft/CEILING-PROGRAM-PREREG-2026-08-20.md`. The
program's own §0 already binds it: nothing is confirmed, shipped to a surface,
wired into a weight, or declared the house method until this audit round-trips.
**A verdict of "approve" here is not a licence to ship — each adopted suggestion
gets its own preregistration.**

I am submitting it, and I did not write it. Where I think it is weak I say so
below rather than presenting it as mine to defend.

---

## WHAT THE PLAN PROPOSES

**Two gradeable targets**, replacing vague upside talk:
- **Season BOOM**: realized season points in the top decile of
  `(realized − LOO pick-curve expectation)` within position. Base rate 10% by
  construction; every feature graded as *lift over 10%*, leave-one-season-out
  across 2021–25.
- **Weekly BOOM**: P(top-12 positional week), graded weekly in-season.

**Ten candidate features**, five named by Cory (late-season target-share trend,
vacated opportunity, age, rookie/draft capital, QB-context change) plus market-
implied ceiling from a Kalshi ladder, the incumbent Draft Sharks band width, and
an efficiency-vs-volume gap. Each row states whether its data is on disk today.

**Gates committed in advance**: a blind prediction row before any lift is
measured; LOSO never in-sample; lift against both the 10% base rate and a
shuffled-label null; **a correlation gate** — any "new" ceiling signal that
rank-correlates > 0.9 with the incumbent band or with `proj_mean` is declared a
costume; and a rule-3e known-positive per instrument.

**First blind prediction P151** (grade by 08-28): among WR/TE with ≥30 targets,
the top quintile of late-season target-share trend booms next season at ≥1.5×
the 10% base rate, LOSO over four year-pairs.

---

## THE LIVE TENSION THE REVIEWER SHOULD RULE ON FIRST

The published reference model we are duplicating (`ffanalytics`) emits ceiling as
a **separate ranking** — a weighted 95th-percentile Harrell–Davis estimate — and
**never adds it into value**. Upside there is a bench and underdog instrument.

**Our shipped engine adds `ceiling × 0.45` into every player's score at every
pick.** That is Cory's own ruling (commit `09f94f99`), made after three
preregistered runs across two independent seed sets said a non-zero ceiling
weight beats zero.

The plan's position is: measure, and the ruling stands unless a graded result
plus Cory move it. **I want the reviewer to attack that specifically.** Either
the reference implementation is right and we are double-counting upside into
starters, or our replay evidence is right and the textbook is conservative. The
plan defers the question; I am not sure deferring is correct when the disputed
term is live in the engine Cory drafts with in two days.

---

## WHERE I THINK THE PLAN IS WEAK — attack these, not just the strengths

1. **The 0.9 correlation gate is asserted, not derived.** Why 0.9? A signal
   correlating 0.85 with the incumbent band would pass and could still be a
   costume. The threshold has no stated basis and no sensitivity analysis.

2. **Season BOOM is defined as a top-decile residual, so n is small.** Ten
   percent of a position across five seasons is a few dozen positives per
   position. A 1.5× lift on that base may not be separable from noise, and the
   plan does not state the power it expects or the confidence interval it will
   report. **P151 could come back "true" on a sample that cannot support it.**

3. **Three of the ten features are not on disk** (age, rookie flag, draft
   capital) and depend on a C fetch. The plan does not say what happens to the
   composite if that fetch fails or lands late — whether the composite ships
   without them or waits.

4. **Leakage risk in "vacated opportunity."** Knowing a player in front left is
   only leak-safe if the departure is stamped as-of a date before the season
   being predicted. The plan says the store is "already dispatched" and this
   program "joins it, never duplicates" — but does not itself state the as-of
   discipline it inherits.

5. **The Kalshi market-implied feature has no historical grade** (2026 only,
   week-forward). It therefore cannot be LOSO-graded like the others, so it
   enters the composite on a different evidentiary standard than everything
   beside it, and the plan does not say how that is reconciled.

6. **A process concern.** This project's recent history is that the dispersion
   fields were `proj_mean × a per-band constant` — zero player-specific
   information — for long enough to invalidate three conclusions. The correlation
   gate is aimed at exactly that. **I want the reviewer to say whether the gate
   as written would actually have caught the constant-multiple defect**, or
   whether it would have passed it.

---

## WHAT I AM NOT ASKING

I am not asking whether ceiling projection is worth doing — Cory has ruled that
it is. I am asking whether **this design can produce a result we are entitled to
believe**, and what it would take to make a failure of these features visible
rather than absorbed.

## NEXT STEP

The response comes back as an inbox item and is triaged like any other finding:
each adopted suggestion gets its own prereg, nothing is adopted on authority, and
P151 is not run until this round-trips.
