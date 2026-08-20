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

## TIER 2 — NEEDS A SESSION AWAKE. One line from you, or it waits.

Claude lanes do not wake on their own. The THINKING half of the loop —
acting on Tuesday's grades (bench/promote verdicts), building new arms,
fixing what the drills and tripwires flag, chasing dispatches — runs when a
lane runs. **Your cost: one line, once or twice a week — "go" to the relay
is enough; I chase A/C/D/E through ROUTES from there.** Every dispatch
already carries a default that fires on silence, so a missed week degrades
gracefully instead of silently — but "adapt quickly" needs the lanes awake
weekly. Best cadence: a "go" on Tuesday (after the auto-grades land) and
optionally Thursday (before the archive freezes the week).

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
