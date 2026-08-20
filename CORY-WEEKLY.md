# WHAT HAPPENS EVERY WEEK, AND THE THREE THINGS THAT ARE STILL YOURS
<!-- TERRITORY: relay. 2026-08-20. Cory: "So I won't have to do anything? It will
     happen each week" — the honest answer, in three tiers, verified against the
     22 scheduled workflows actually on main (not against hope). -->

## TIER 1 — FULLY AUTOMATIC. Nobody touches anything.

GitHub runs these on timers (all times ET, verified against the cron table):

| when | what |
|---|---|
| Sun ~9am | pre-slate projection snapshot (Sleeper + FP, frozen before kickoff) |
| Sun ~11:45am | **your Sunday alert** — last-call lineup flags before the 1pm slate |
| Tue ~2am + ~9:30am | **the week grades itself** — own model vs Sleeper vs FP, after MNF |
| Tue ~9:30am | weekly recap |
| Wed ~7am | snap counts + routes captured (the usage signals) |
| Thu 7-11am | props fetch → odds → own weekly projections → **the pre-kickoff archive** |
| daily | ADP capture, board rebuild rehearsals, inbox health, ffanalytics probe |

Captures, projections, and GRADES genuinely happen with zero humans. The
board staleness tripwires and capture controls fail CI loudly if any of it
silently breaks.

## TIER 2 — NEEDS A SESSION AWAKE. Your exact weekly playbook (ruled MANUAL, 08-20).

Claude lanes do not wake on their own, and Cory ruled against API automation
— so the weekly heartbeat is his, and it is deliberately tiny:

1. **Tuesday, any time after mid-morning** (the auto-grades land overnight
   after MNF): open the RELAY session, type **"go"**. The relay reads the
   graded week, applies the bench/promote policy, sweeps every mailbox, and
   replies with (a) the week's verdict, (b) the waiver recommendation before
   Wednesday's run, and (c) **which lanes actually need opening this week —
   often none.** Open only the lanes that reply names, one "go" each.
2. **That's the whole week**, unless a reply asks for a ruling — those
   arrive as one question with a recommendation and a default.

A missed Tuesday degrades gracefully (every dispatch carries a default and
the crons keep capturing and grading), but two missed Tuesdays means the
adaptation policy's bench/promote verdicts sit unapplied — the loop keeps
SCORING, it stops LEARNING.

## TIER 3 — ONLY YOU. The tools recommend; you decide.

1. **Click your actual lineup and claims in Sleeper.** The Sunday alert and
   Tuesday waiver card tell you what and why; no tool touches your team.
2. **Rulings when a ship-gate names you** — e.g., a promoted arm wants onto
   a surface, or the audit gate returns something material. These arrive as
   single questions with a recommendation and a default, never homework.
3. **The OpenAI paste path, if A has no integration** — paste a brief,
   paste the reply back. Minutes, and only when a program confirms.

## THE ONE-LINE SUMMARY

Data and grades: automatic. Improvement: one "go" a week from you.
Decisions: always yours, delivered pre-chewed.
