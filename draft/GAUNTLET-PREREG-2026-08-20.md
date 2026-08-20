# THE DRAFT GAUNTLET — seven named strategies, implemented correctly, graded before displayed
<!-- TERRITORY: relay (the grading); the war-room panel is A/B's gate. 2026-08-20.
     Source: Cory's upload "The Draft Gauntlet" (Stanford Stevens, 2024-06-05, 100
     sims/position, 12-team half-PPR) and his ask verbatim: "maybe we can add
     something to our war room that tracks every one of these strategies (CORRECTLY)
     and tells me what that model would recommend at that pick." CORRECTLY is the
     load-bearing word: every strategy runs through the 30 real seat-years FIRST, so
     the panel shows graded voices, not seven guesses wearing famous names. -->

## 0. The seven, as the article defines them — and what our record already says

1. **VONA** — value over next available: urgency = value(best now) − value(best
   at my next pick), per position; take the most urgent position's best man.
2. **Hybrid** — VONA for rounds 1-4, then best available value. *(The article's
   winner — and its "Hybrid beats strict VONA" is the SAME direction as our §8/
   P139 lookahead nulls, found independently on different data.)*
3. **Best Available Value (BAV)** — max value every pick.
4. **Best Available ADP** — follow consensus order. *(The article's LOSER —
   matching our every-grading result that value beats market-following.)*
5. **Zero RB** — no RB before round 5; otherwise value rules.
6. **Hero RB** — RB at the first pick, then no RB again until round 6.
7. **Late-Round QB** — no QB before round 6.

## 1. Implementation spec (declared before a line is written)

Same replay frame as every graded arm: 30 real seat-years, value = the
market's own order, opponents fixed, keepers as recorded. Round =
ceil(pick_no/10). All seven share the article's "basic positional need
logic", declared here as: K=1 and DEF=1 exactly · QB≤2 · TE≤2 · §14c
legality forcing (when remaining picks ≤ unfilled dedicated slots, restrict
to unfilled positions — the forcing OVERRIDES any strategy constraint, since
the article's own strategies never draft illegal rosters). VONA's "available
at my next pick" = recorded survivors past my next slot (the exact
construction P136/P139 used). Hero RB's "first round" = the seat's first
LIVE pick (keepers can occupy round 1). Hybrid switches after round 4.

## 2. Bars and blind predictions (P153-P155, filed with this commit)

Graded on skill (primary) and actual, frozen and waiver-aware, all reported.
No strategy is being promoted — the bar structure is ORDERING, because the
panel's honesty depends on us knowing which voices deserve weight:

* **P153:** Best-Available-ADP finishes LAST of the seven on skill — the
  article's finding, ours, and the whole program's, converging.
* **P154:** strict VONA ≤ BAV on skill — the FOURTH independent test of the
  lookahead question (§8, §10, P139 before it), this time in the article's
  own formulation.
* **P155:** none of Zero-RB / Hero-RB / Late-QB beats BAV on skill by more
  than +5 — the exact-DP theorem's corollary: constraint overlays on a
  near-ceiling greedy can only remove options. If ONE clears +5, that
  constraint carries information the value signal lacks and gets its own
  follow-up.

Controls: `--mlv` byte-guard (+45.84/+29.33) before and after the patch;
every strategy must produce 30/30 legal rosters (the forcing exists for
this); engagement — the seven must not be pairwise byte-identical (any two
identical = a dead constraint, reported as such).

## 3. The war-room panel (routed to A/B AFTER grading, Friday-freeze-aware)

One strip, seven rows: strategy name · its pick RIGHT NOW at Cory's seat ·
one-line why (VONA: the urgency gap; Zero-RB: "round <5, RB blocked") · its
graded skill delta from this prereg, printed beside the name so the voice
carries its track record. Live values = the board's own proj_mean (the live
analogue of the replay's market order); same caps and forcing. Report-only,
exactly like the Roster Builder panel — nothing feeds engine.js. Whether it
ships before Saturday is A's freeze call; the graded numbers ship in this
doc either way.

## 4. THE EIGHTH STRATEGY — Subvertadown's "Snake Value" (second upload, added same day)

Cory's second resource (Subvertadown, 2025-06-17) argues VBD alone lacks a
minimax guarantee in snake drafts and defines **Snake Value = value-over-
baseline + a VONA opportunity-cost term**, computed against the OPPONENTS'
expected takes one round ahead, with the remaining-points curve smoothed
(±2 picks early, growing to ±12 late). Distinct from strict VONA: the value
ordering is PRESERVED and urgency is additive — a bonus, not the ranking.

**Replay implementation, declared:** VOB baseline = the market value of the
last STARTER-rank player per position (QB10 · RB24 · WR26 · TE10 · K10 ·
DEF10 — the classic table, deliberately NOT the drafted-depth table, since
the article means standard VBD); opportunity cost = v(best now) − v(best
recorded survivor past my next slot), same-position, floored at 0; smoothing
implemented as the survivor mean over a ±w window with w = 2 + 10 ×
(pick_no/150), per the article's own ramp. Score = VOB + OppCost; caps and
forcing as §1.

**P156, blind:** Snake Value beats strict VONA on skill (the article's own
claim, aligned with our Hybrid finding) AND lands within ±10 of BAV — the
additive-urgency term is a LIGHT lookahead, and every lookahead we have
graded loses or ties. If it beats BAV by more than +10, the additive form
succeeded where the ranking form failed four times, and that is a genuine
discovery about WHERE timing information belongs.
