# EXECUTION PLAN TO 08-22 — correct tool AND better model, both, in parallel

**Cory, 2026-08-17, overruling the relay:** *"I DISAGREE WITH YOU BETTER
TOOL/WORSE MODEL. I DEMAND BOTH. WE CANT AFFORD TO FREEZE RESEARCH AGENDA… WE
HAVE 6 SESSIONS WORKING, YOU NEED TO GET THIS DONE. MAKE WHATEVER CHANGES YOU
NEED TO COMPLETE BOTH TASKS AND STILL BE ACCURATE."*

**He is right and the freeze recommendation was wrong.** It reasoned as if we had
one lane. We have six, and the two tracks barely touch — **they only collide on
A.** So the fix is not less work; it is taking A off the tool track's critical
path so both tracks run at once.

**The accuracy constraint is not negotiable and is not what slows us down.**
Preregs, matched populations and known-positive controls stay exactly as they
are. What goes is **wait state** — items sitting on an owner who has not looked.

---

## THE TWO TRACKS, AND WHY THEY DO NOT COMPETE

| | TOOL TRACK — Cory drafts well on 08-22 | MODEL TRACK — the numbers get better |
|---|---|---|
| **owns it** | **B** (surface), **E** (red team) | **C** (fetch), **D** (stewardship), **relay** (verification) |
| **A's part** | **rulings and merges only** | **rulings and merges only** |
| deliverables | war room correct on DESKTOP · seat bug · board publishing · the four truth defects | blend answered · adjusters fitted · ceiling settled · routes/snaps graded |

**The only shared resource is A.** Everything below exists to keep A answering in
one word instead of typing code.

## CHANGE 1 — A DOES NOTHING BUT RULE AND MERGE. ENFORCED, NOT SUGGESTED.

Rule 3b already says this; today it was not true — A wrote a war-room order, a
board fix and a routing pass. **From now, anything reaching A that is not a
decision or a merge is bounced back to the relay as a routing bug.** A's inbox is
already triaged into `DECIDE NOW (9)`, `MERGE QUEUE (7)`, and everything else.

**A's whole job to 08-22 is those nine decisions and that merge queue.**

## CHANGE 2 — DEFAULTS FIRE IMMEDIATELY, NOT "BY EOD TOMORROW"

The single biggest source of lost time today was **wait state**: correct work
sitting beside the thing that unblocked it. `proj_mean_blend` refused for want of
Sleeper history on 08-16; the Sleeper probe proved that history exists **the same
day**; nobody connected them for a day.

**New default rule: a stated DEFAULT executes as soon as the sender is ready,
not at a deadline.** A can still `SEND BACK` and the work is redone — cheaper
than a day of nobody moving. `NO DEFAULT — BLOCKED` is reserved for things that
are genuinely unsafe to proceed on (pushing to `main`, changing a draft-day
number).

## CHANGE 3 — EVERY REFUSAL SHIPS ITS UNBLOCK CONDITION

`REFUSED — unblocked by <condition>, owner <lane>, recheck <date>`. A refusal
without all three is an open defect, not an answer. **This one rule would have
caught the blend/Sleeper disconnect a day early**, and it costs nothing.

## CHANGE 4 — THE OPEN-QUESTIONS BACKLOG, BECAUSE NO LANE OWNS "WHAT NEXT"

Every material finding this week came from Cory. That is an org-chart hole, not a
diligence failure: A rules, B builds, C fetches, D stewards, E red-teams
**outputs**, the relay chases. Nobody generates hypotheses.

**Fix: every lane adds one open question per session** — something we have not
tested, with a cost estimate. The relay keeps the list and A prioritises it. Cory
should not have to be the only source of new questions.

## CHANGE 5 — THE RELAY BUILDS, NOT JUST ROUTES

Today the relay shipped five rules, four documents and two test files, and **zero
measured model improvements.** That ratio is upside down. **The relay's default is
now: if a lane has not picked up a specified piece of work, build it and hand over
the branch.** Routing is not the deliverable.

---

## THE CRITICAL PATH — what has to happen, in order

### TOOL TRACK (B and E; A rules only)
1. **B: the seat bug** (register 4c). Every pick number, survival % and timing
   call is computed for the wrong seat. Fix it, or make the page refuse to
   compute rather than compute wrongly. **Nothing else on this track matters
   until this is true.**
2. **B: DESKTOP-first war room** (4d) against Cory's screenshots. A's phone-first
   order is superseded; every other element of that order stands.
3. **B: the three truth defects** (4e, 4f) — shortlist sorted by the number it
   displays; "left" meaning one thing per screen.
4. **B: surface which weight system is live** (25) — Auto vs Measured, on screen.
   Cory cannot currently see which one is choosing his players.
5. **E: findability drills** on the shipped desktop build, timed, on real draft
   moments. Truth defects at any time; layout is Cory's call alone.
6. **A: publish the board** (row 1) — frozen since 08-15. Confirm rows 2 and 3
   first; never regenerate a board assertion to green.

### MODEL TRACK (C, D, relay; A rules only)
1. **C: fetch per-player 2025 projections, both sources**, joined on `sleeper_id`,
   workflow dispatched **from `main`**. This is the only thing blocking Cory's
   most-repeated question. Relay builds it if C has not started.
2. **relay: run `SOURCE-BLEND-2025-PREREG.md`** the moment those rows land —
   five arms, one matched population, Spearman-within-position primary, NAIVE as
   the control that must lose.
3. **A: rule on register 25** — which weight system is authoritative. This
   outranks the ceiling-weight ruling, because it decides what the ceiling weight
   even means.
4. **relay: the real ceiling blast radius** through `recommend()`, with a
   known-positive control. Owed to Cory before he rules.
5. **D: snap_counts graded, routes prereg'd** — the jobs keep running either way.
6. **C: `nflverse_weekly_points_2022`** — n=1 season is the biggest weakness in
   every answer we are about to give.
7. **A: fit the adjusters against the ALL-SEATS replay** post-08-22 — ~30
   draft-seasons, not three. A fit, not a hotfix.

## WHAT WOULD MAKE THIS FAIL

- **A doing work instead of deciding.** The single realistic failure mode.
- **The relay writing another rule instead of building something.**
- **Relaxing a control to go faster.** Cory said "and still be accurate." The
  speed comes from parallelism and from killing wait state — never from a thinner
  gate.
