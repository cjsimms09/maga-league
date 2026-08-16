# The conditional-value program — stacks + handcuffs (Cory, 2026-08-16)

**The mandate, verbatim:** "Do we need to continue studying stacks? Seems like
it's more valuable in league with weekly payout like ours. Joe burrow probably
worth more to me than other since I have chase but how much more. Also we
haven't studied handcuffs at all.. ie tee higgens probably not worth it for me
to draft because his ADP is so high but is Derrick Henry's backup worth more to
me than someone else? How much more? Our model needs to take all these things
into account when deciding value. Because the question is value to me, in this
league, under these circumstances."

## What this is

The board's value column answers "what is this player worth in a vacuum."
Cory's question is CONDITIONAL value: worth *given my roster, my league's
weekly-high payouts, my opponents*. Two named effects, both quantifiable from
data we already hold:

1. **Stacks (correlation premium).** QB+pass-catcher from one team have
   positively correlated weekly scores. In a league that pays the WEEKLY HIGH,
   variance is an asset — a stacked lineup buys more P(weekly high) per point
   of mean than an unstacked one. The measurement: same-team QB-WR/TE weekly
   score correlation from the component stores (2021-25, already committed);
   push the correlated pair through the champodds weekly-sim machinery
   (WEEKLY_SD, seeded Monte Carlo — already built) with the covariance term ON
   vs OFF; the delta in P(weekly high) × the pot = the premium in dollars, and
   its composite-point equivalent = "how much more is Burrow worth to Chase's
   owner." Honest arm: the same correlation slightly raises bust weeks too —
   price both tails, not just the good one.
2. **Handcuffs (conditional-production insurance).** A starter's backup is
   worth more to the STARTER'S OWNER than to the field: P(starter misses
   games) × backup's conditional points-when-elevated − replacement level.
   The availability model (qb_active_games / expected_games, already graded)
   supplies the miss-probability shape; depth-chart data is on the board;
   conditional production when elevated is measurable from the component
   stores (backup weeks where the starter was inactive). Output: a
   handcuff-premium column FOR CORY'S ROSTER — "Henry's backup: +X pts of
   conditional value to you, +0 to the room."

## Where it lands

Both effects become a CONDITIONAL VALUE layer on the war room: seat-plan and
verdict read "value to Cory" = board value + stack premium + handcuff premium,
each printed separately so the adjustment is inspectable, never silently
blended. Gated: the layer ships OFF, with the evidence doc, for Cory's ruling
— same protocol as every scoring-adjacent change.

## Sequencing

Runs AFTER the roster-construction program merges (same machinery, same
files — two agents in that code at once would collide). Draft is 2026-08-22:
the stack/handcuff numbers for Cory's actual keeper roster are the deliverable
that must arrive before draft night; the general layer can follow.
