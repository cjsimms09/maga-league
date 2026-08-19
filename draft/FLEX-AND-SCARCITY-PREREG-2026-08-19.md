# PREREGISTRATION — Cory's flex claim, and whether RB is actually the scarce one

**A, 2026-08-19, committed BEFORE the run.**

Cory: *"this could be a scarcity issue, each team uses 1 RB on average but 2-3
WRs that get real points"* · *"why you normally dont have RB in flex. almost
always a WR"*

This lands on the run I just finished. The corrected wire produced **RB 3.94 /
WR 3.55** — the model prefers backs. Cory's claim is that receivers are the
scarcer resource. **Both cannot be right and the disagreement has a measurable
mechanism.**

---

## ⚠️ WHAT IS NOT A PREDICTION — declared before the numbers, because I have
## already seen them

**The flex share is already visible in a control I ran an hour ago.**
`measured_need_curve.py` C2 prints starters per team-week: QB 1.000, **RB 2.417,
WR 2.556**, TE 1.017, K 0.996, DEF 0.996. Against base slots of RB 2 / WR 2 /
TE 1, that is a flex share of **RB .417 · WR .556 · TE .017**.

**I am not dressing that up as a prediction. It is a read-off, and it says Cory
is directionally right — WR is the plurality flex — but "almost always" is 56%,
not 90%.** Recorded here so the grade cannot later claim credit for it.

## WHAT IS ACTUALLY BEING PREDICTED

**P167 — the pooled 56/42 hides a bimodal league.** If owners are each splitting
their own flex roughly 56/44, the per-team-season WR-flex share clusters near
0.56. If instead Cory is describing a real roster archetype, teams are mostly
one-or-the-other. Measured across 30 team-seasons (10 owners × 3 years):

**TRUE if the sd of the per-team-season WR-flex share is ≥ 0.20.**
**FALSE under 0.20** — in which case "almost always a WR" is a league-average
tendency, not a rule about a roster.

**P168 — the model's RB preference has a scarcity justification, or it does
not.** The model prices `P(start|available) × (C − R)`. It takes more backs
because the RB wire sits at 78.4 and the WR wire at 124.8 — a 46-point gap.
**That gap is only evidence of scarcity if it comes from a STEEPER RB curve,
not from receivers simply scoring more points in this scoring system.**

Measured as the drop from the position's starter-demand rank (10 teams × its
measured starters/week: RB 24, WR 26) to its wire rank (RB 48, WR 53):

**TRUE if RB's drop exceeds WR's drop.**
**FALSE if WR's drop is equal or larger** — in which case the 46-point wire gap
is a level offset the model is reading as scarcity, Cory is right, and register
60 has a second cause I have not filed.

**P169 — the level offset is real and large.** The median projection of the top
36 receivers exceeds the median of the top 36 backs by **at least 25 points.**
**FALSE under 25.** This is the term that must cancel for P168's comparison to
mean anything, and it should be stated as a number rather than assumed.

## CONTROLS

1. **KNOWN POSITIVE (rule 3e).** The probe must reproduce the published wire
   levels **exactly** at the published ranks — RB #48 → 78.4, WR #53 → 124.8,
   QB #17 → 322.9. If it cannot, it is not reading the pool the model prices and
   nothing else it prints counts.
2. **The three flex shares must sum to 1.00 ± 0.02.** There is exactly one flex
   slot; if RB+WR+TE flex share is not one, the lineup join is wrong. This is the
   control that would have caught a bad join silently printing a plausible split.
3. **30 team-seasons, not 29 and not 33.** Ten owners, three completed seasons.
4. Same `proj_mean` field, same eligibility filter, as `model_diagnostics.js`.

## GUARD

**REPORT ONLY.** No weight, curve or wire level is changed by this run.
`no_fit_guard` holds: whatever it says, **nothing is selected from it and
nothing ships before Saturday.** If P168 comes back FALSE the response is a
register row and a post-draft job, not a re-tuned wire three days out.
