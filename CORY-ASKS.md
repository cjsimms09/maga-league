# CORY ASKS — every request Cory made, who owns it, and whether he got it

**Cory, 2026-08-17:** *"when I type things to you Im not necessarily expecting
you to do it but youre the project manager so you need to deligate effectively
but also make sure i get what I want."*

That is two jobs, and this file is the second one. `ROUTES.md` tracks what was
**assigned**. `DEFECT-REGISTER.md` tracks what is **broken**. Neither tracks
**what Cory asked for and whether it arrived** — so on 2026-08-17 an ask went a
full day with no owner, no row and no route (row A6 below), and nothing in the
repo would ever have noticed.

**The rule: an ask is not done when someone starts it. It is done when Cory has
the thing.** `DELEGATED` is a status, not a finish line.

**Status words:** `ASKED` = captured, not yet routed · `DELEGATED` = has an owner
and a deadline · `DELIVERED` = the work exists · `VERIFIED` = the relay confirmed
it does what Cory asked · `CORY` = waiting on Cory, nobody else can move it.

`draft/tests/test_cory_asks.py` fails on any row without an owner and a status.

---

## OPEN — Cory has not got this yet

| # | what Cory asked for | owner | status | what "done" looks like |
|---|---|---|---|---|
| A1 | **War room redesign.** *"too busy and wordy… needs to look like a professional draft buddy."* Does not match reference screenshots Cory was sent. | **B** | 🔴 DELEGATED — draft-critical, 08-22 | B gets the screenshots FROM CORY first, then a clean, dense, low-word war room. Fix by hierarchy, NOT by deleting data. Register row 4b. |
| A2 | **Decide the projection source: Sleeper, FantasyPros, or a mix.** | **A** | 🔴 DELEGATED — needs a ruling | A rules on source policy. The finding that forces it: `proj_mean` is Sleeper × adjuster, and FP never enters it (register row 21). |
| A3 | **Capture ALL the FantasyPros data** — projected points, ceilings, ranges, everything — not just one scalar. | **D** | DELEGATED | FP's per-player range fields walked through the eight questions. They are a real per-player upside signal, which this project has been missing entirely. Register row 22. |
| A4 | **Every session asks more questions and stops moving past things.** *"common logic shouldve told us that everyone having the same ceiling makes no sense."* | relay | **DELIVERED — verify at next surprising result** | Rule 3d shipped (`OPERATING-MODEL.md`), routed to all four lanes, and applied immediately: it reopened the Vegas null (row 18) and caught the FP-vs-FP comparison (row 19). VERIFIED only once a lane other than the relay applies it unprompted. |
| A5 | **Stop throwing data away.** *"we dont just throw out vegas odds or weekly routes because we havent seen a pattern yet."* | relay | **DELIVERED** | Rule 3c + `test_retention_rule.py`, which fails if any lane-facing doc issues a stop-the-job instruction. Known-positive control carries the exact bad text the relay shipped. |
| A6 | **Re-test EVERY adjuster now that ceiling and floor changed** — *"we cannot rely on old reasons as these 2 things may change outcome"* — **and tune the auto function to change DURING the draft** by round, by circumstance, by position. | **A** | 🔴 **DELEGATED — WAS LOST FOR A DAY** | Two parts. (1) Re-test: partially covered by register rows 8a/8b/8c, which are dollar-model and floor-consumer specific — **the full adjuster sweep is NOT covered.** (2) In-draft auto-tuning by round/position/circumstance: **no row, no owner, no prereg existed.** A scopes it or sends it back with a reason. |
| A7 | **A session that takes the macro view and red-teams the model's output** — *"our current big board has trey mcbride over justin jefferson. that makes no sense."* | relay | **DELIVERED — awaiting Cory's launch** | `SESSION-E.md`, `ROUTES.md → TO: E`, `OPERATING-MODEL.md` Rule 3e (E sits BESIDE the pipeline, gates nothing), and the lane-aware tests taught about E. Scoped as red-team-on-outputs, NOT a second PM: it raises questions with the player and number attached, and never overrides a measurement. |

## WAITING ON CORY — nobody else can move these

| # | what | why it is Cory's |
|---|---|---|
| C1 | **`MEASURED_WEIGHTS.ceiling` — ship non-zero or hold?** | Three preregistered runs, two independent seed sets, every value 0.15–0.65 beats the shipped zero. Register row 5. |
| C2 | **ADP-sd ratchet fired** — leave it or re-fit? | Our constant did not drift; the market tightened. Blast radius 1 player. Register row 6. |

## DELIVERED AND VERIFIED

| # | what Cory asked for | how it was verified |
|---|---|---|
| V1 | **A data-stewardship session** (D) | `SESSION-D.md`, inbox, `OPERATING-MODEL.md` row, and `test_lane_coherence.py` — which failed the moment D's inbox appeared without a role file, then passed. |
| V2 | **Nothing gets left behind** | `DEFECT-REGISTER.md` + `test_defect_register.py`, which fails on any row with no owner. It caught lane D's own rows on the first run after the re-route. |
| V3 | **The eight-question data chain** | `DATA-LIFECYCLE.md`, all ten stores measured rather than recalled: two complete the chain, four stop with no recorded reason. |
| V4 | **Everyone in their own lane, A decides and merges** | `OPERATING-MODEL.md` — one screen, Rules 1–5, ASK/EVIDENCE/REC/DEFAULT so silence is consent and nobody idles. |

---

**Rule for adding a row:** if Cory said it and it would change something, it goes
here the same turn — even when the answer is "already covered by X." Especially
then, because "already covered" is what A6 looked like right up until someone
checked, and nothing was covering it.
