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

## CORY RULED 2026-08-17 — executing

| # | ruling | status |
|---|---|---|
| ① | **Projection source — "RUN IT"** | ✅ **DONE.** `sleeper-hist-proj.yml` dispatched **from `main`** so the verdict commits this time (the 08-16 runs were dispatched off a worktree branch and the guard discarded the answer). Next: the three-way prereg, then Sleeper vs FP vs blend on 2025, matched population. |
| ② | **Ceiling weight — "lets see the blast radius"** | 🔄 **IN HAND, and the structure already changes the question — see below.** |
| ③ | **ADP-sd ratchet — "leave it"** | ✅ **CLOSED.** No change; revisit post-season. |
| ④ | **Session E — "already started"** | ✅ **LAUNCHED.** Lane, inbox, charter and Rule 3e all live. |
| ⑤ | **Model assignments — "do it"** | ✅ **RECORDED** in `OPERATING-MODEL.md` Rule 5b. A/D/E Opus; B/C Sonnet. |
| ⑥ | **War-room screenshots — "sent B already"** | ✅ B is unblocked. Register row 4b's blocker is cleared; 4c–4f (the truth defects) still stand. |

### ② THE CEILING BLAST RADIUS — what the code already settles

**The term is POSITION-NORMALISED.** `engine.js:1217-1220` divides each player's
`proj_ceiling − proj_mean` spread by the typical spread **at that player's own
position**, then rescales to the board. So "QBs all move" — the result my first
proxy produced — is exactly the artifact the engine was built to prevent, and my
proxy was wrong for the reason I flagged rather than by luck. The code's own note
records that dividing by median spread would have handed QBs a 2.35× boost.

**And the term is LATE-ONLY.** `CEILING_LATE_FROM: 0.6` (`engine.js:346`): the
ceiling contributes **zero until 60% of the draft**, then ramps, with a bench
gate that fires when every starting slot is full (measured near pick 70).

**So shipping a non-zero ceiling weight cannot re-rank Cory's early picks at
all.** It moves the late/throwaway rounds — the lottery-ticket picks — which is
far lower risk than "it changes every number." My earlier framing overstated it.

**STILL OWED:** the count of who moves and how far, through `recommend()`. A
direct call to `upsideBonus` returned zero for every player at every pick number,
but `_ceilingScales` is initialised inside `recommend()`, so that path proves
nothing — **no known-positive control, therefore not a finding.** Owner: relay.

## OPEN — Cory has not got this yet

| # | what Cory asked for | owner | status | what "done" looks like |
|---|---|---|---|---|
| A1 | **War room redesign**, *"too busy and wordy… a professional draft buddy"* — **and it must be the DESKTOP screen**, which is where Cory drafts. | **B** | 🔴 DELEGATED — draft-critical, 08-22 | Desktop-first. Fix density by hierarchy, NOT by deleting data. **Four truth defects found in B's own screenshot are blocking regardless of the redesign** — register rows 4c–4f, of which 4c (every pick number computed for the wrong seat) invalidates the page. |
| A2 | **Decide the projection source: Sleeper, FantasyPros, or a mix.** | **A** | 🔴 DELEGATED — needs a ruling | A rules on source policy. The finding that forces it: `proj_mean` is Sleeper × adjuster, and FP never enters it (register row 21). |
| A3 | **Capture ALL the FantasyPros data** — projected points, ceilings, ranges, everything — not just one scalar. | **D** | DELEGATED | FP's per-player range fields walked through the eight questions. They are a real per-player upside signal, which this project has been missing entirely. Register row 22. |
| A4 | **Every session asks more questions and stops moving past things.** *"common logic shouldve told us that everyone having the same ceiling makes no sense."* | relay | **DELIVERED — verify at next surprising result** | Rule 3d shipped (`OPERATING-MODEL.md`), routed to all four lanes, and applied immediately: it reopened the Vegas null (row 18) and caught the FP-vs-FP comparison (row 19). VERIFIED only once a lane other than the relay applies it unprompted. |
| A5 | **Stop throwing data away.** *"we dont just throw out vegas odds or weekly routes because we havent seen a pattern yet."* | relay | **DELIVERED** | Rule 3c + `test_retention_rule.py`, which fails if any lane-facing doc issues a stop-the-job instruction. Known-positive control carries the exact bad text the relay shipped. |
| A8 | **Site has too many top tabs — consolidate into existing pages without losing anything.** What to Watch → matchup; Pick'em → an existing page; The Races → not its own tab; My Team + Matchup possibly merged. *"I STILL WANT ALL THOSE."* | **B** | DELEGATED — after the war room | A tab map proposed to Cory BEFORE any rebuild, then hierarchy-and-grouping (never deletion). In-season-facing, so ~week 1 rather than 08-22. |
| A6 | **Re-test EVERY adjuster now that ceiling and floor changed, and tune the auto function to change DURING the draft** by round, circumstance, position. | **A** | 🔴 DELEGATED — answered in part; the auto function EXISTS and is UNMEASURED | **The round-aware adjuster is already built**: `autoWeights()` runs Anchor/Build/Fill/Endgame phases plus four situational responses. **But its own docstring says it is NOT backtested** — every phase constant is a reasoned judgement, never measured (register 26). **And it disagrees with the composite about upside**: auto ships ceiling 0.45–0.8 while `MEASURED_WEIGHTS` ships 0, with a browser toggle deciding which Cory drafts under (register 25). Tuning needs the all-seats replay, not three drafts — post-08-22. |
| A7 | **A session that takes the macro view and red-teams the model's output** — *"our current big board has trey mcbride over justin jefferson. that makes no sense."* | relay | **DELIVERED — awaiting Cory's launch** | `SESSION-E.md`, `ROUTES.md → TO: E`, `OPERATING-MODEL.md` Rule 3e (E sits BESIDE the pipeline, gates nothing), and the lane-aware tests taught about E. Scoped as red-team-on-outputs, NOT a second PM: it raises questions with the player and number attached, and never overrides a measurement. |

## WAITING ON CORY — nobody else can move these

| # | what | why it is Cory's |
|---|---|---|
| — | **Nothing.** All five open decisions were ruled on 2026-08-17 (see above). | Kept as a live section: when it is empty, no lane is idling on Cory. |

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
