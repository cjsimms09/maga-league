# OPEN QUESTIONS — things we have not tested, with owners

**Cory, 2026-08-17:** *"WE NEED BE ASKING WHAT SHOULD WE STUDY NEXT, WE ALSO NEED
TO STOP TREATING REFUSAL AS ENDING. FIX BOTH THESE PROBLEMS FOR GOOD!"*

This file is the first half. `DEFECT-REGISTER.md` tracks what is **broken**.
`CORY-ASKS.md` tracks what **Cory asked for**. **Neither tracks what nobody has
thought to look at yet** — and that hole is why every material finding this week
came from Cory rather than from us. A rules, B builds, C fetches, D stewards, E
red-teams outputs, the relay chases. **No lane's job was generating hypotheses.**
Now it is every lane's job.

## THE RULE

**Every lane adds at least one open question per session.** Not a defect, not an
assignment — a thing we do not know and have not tested, with a guess at what it
would cost to find out. `draft/tests/test_open_questions.py` fails if any lane
has none.

**A question leaves this file three ways:** it gets tested (record the verdict and
where), it gets ruled not worth testing (record why, with a number if one exists),
or it becomes a defect (move it to the register). **It never just disappears.**

**Cost is a rough band, stated before anyone commits:** `S` = under an hour ·
`M` = a session · `L` = multi-session or needs new data.

---

## OPEN — nobody has tested these

| # | question | why it might matter | cost | owner |
|---|---|---|---|---|
| Q1 | **Does the opportunity adjuster help at all?** It multiplies every projection by `1 + adj`, does nothing for 229 of 603 players, and has never been graded. | It is the ONLY thing separating `proj_mean` from raw Sleeper. If it is null, the board is unadjusted Sleeper and we should know that. | M | **D** |
| Q2 | **Does FantasyPros' bias correction beat FantasyPros?** FP bias transfers out-of-fold (QB +14 to +27, TE −9 to −12, 3 seasons). A de-biased FP is a free third source. | `source_weight_prior` failed G3 on one cell of twelve; the bias signal itself passed G1 and G2. | M | **A** |
| Q3 | **Is `CEILING_LATE_FROM = 0.6` the right gate?** The code calls it a proxy for "the throwaway rounds" and notes the real condition arrives near pick 70, not 90. | The ceiling term is zero for the first 60% of every draft on an unmeasured constant. | S | **A** |
| Q4 | **Do the `autoWeights` phase boundaries (2/6/10) match where the draft actually changes?** They are round numbers chosen by reasoning. | If the real regime shift is at 3/7/11, every phase weight is applied one round early. | M | **A** |
| Q9 | **How long does Cory actually have per pick, and what can he read in it?** We design the war room around "8 seconds" with no measurement of either the clock or his read speed. | Every density and hierarchy argument rests on a number nobody has. A stopwatch on last year's draft log settles it. | S | **B** |
| Q10 | **Does the ceiling tilt's +$56/season survive on HELD-OUT REAL SEASONS?** Both experiments that priced it ran in the simulated-room proxy on the v1 money model — the engine's own comment says so. | It is the ONLY edge number this project holds, denominated in Cory's own currency (E2). If it does not survive, we have zero measured edge. | M | **E** |
| Q11 | ~~What are Cory's actual E3/E4 rates today?~~ **ANSWERED 08-17: 23–22 (.511), 5th–6th of 10, top-4 in 1–2 of 3 seasons.** Remaining piece: the roster→user map, which turns the 33–67% range into a number. | The baseline every edge claim is measured against. | S | **E** |
| Q5 | **Does anyone in this league behave predictably enough to exploit?** The opponent model exists; nobody has asked which seat is most predictable. | Cory drafts against nine specific people, not a generic room. | M | **E** |
| Q6 | **Do our projections degrade over the season, and how fast?** We grade preseason vs final. We have never measured whether week-8 projections beat preseason ones. | Decides whether in-season tools should re-project or trust the preseason board. | M | **D** |
| Q7 | **Is the 73-player `gaussian_z` ceiling population systematically different?** They are the players with no measured history. | If they are all rookies, the board's upside signal is absent exactly where upside matters most. | S | **D** |
| Q8 | **Would the tool have beaten Cory in seats other than his own?** The replay runs one seat; the harness supports ten. | Same evidence that would let us fit the adjusters. | L | **C** |

## RESOLVED — kept so nobody re-asks

| question | verdict | where |
|---|---|---|
| Does Sleeper serve historical preseason projections? | **YES** — 2025 clean, 2023/24 leaked. Three files had said "permanently unmeasurable" and none had asked. | `sleeper_hist_proj.json` |
| Are `spread_line`/`total_line` obtainable? | **Already held** — 6 seasons, 1,426 games, since 08-16. | `vegas_lines_2021_2026.json` |
