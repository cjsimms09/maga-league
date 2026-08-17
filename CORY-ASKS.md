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
| A1 | **War room redesign**, *"too busy and wordy… a professional draft buddy"* — **and it must be the DESKTOP screen**, which is where Cory drafts. | **B** | 🔴 DELEGATED — draft-critical, 08-22 | Desktop-first. Fix density by hierarchy, NOT by deleting data. **Four truth defects found in B's own screenshot are blocking regardless of the redesign** — register rows 4c–4f, of which 4c (every pick number computed for the wrong seat) invalidates the page. |
| A2 | **Decide the projection source: Sleeper, FantasyPros, or a mix.** | **A** | 🔴 DELEGATED — needs a ruling | A rules on source policy. The finding that forces it: `proj_mean` is Sleeper × adjuster, and FP never enters it (register row 21). |
| A3 | **Capture ALL the FantasyPros data** — projected points, ceilings, ranges, everything — not just one scalar. | **D** | DELEGATED | FP's per-player range fields walked through the eight questions. They are a real per-player upside signal, which this project has been missing entirely. Register row 22. |
| A4 | **Every session asks more questions and stops moving past things.** *"common logic shouldve told us that everyone having the same ceiling makes no sense."* | relay | **DELIVERED — verify at next surprising result** | Rule 3d shipped (`OPERATING-MODEL.md`), routed to all four lanes, and applied immediately: it reopened the Vegas null (row 18) and caught the FP-vs-FP comparison (row 19). VERIFIED only once a lane other than the relay applies it unprompted. |
| A5 | **Stop throwing data away.** *"we dont just throw out vegas odds or weekly routes because we havent seen a pattern yet."* | relay | **DELIVERED** | Rule 3c + `test_retention_rule.py`, which fails if any lane-facing doc issues a stop-the-job instruction. Known-positive control carries the exact bad text the relay shipped. |
| A6 | **Re-test EVERY adjuster now that ceiling and floor changed** — *"we cannot rely on old reasons as these 2 things may change outcome"* — **and tune the auto function to change DURING the draft** by round, by circumstance, by position. | **A** | 🔴 **DELEGATED — WAS LOST FOR A DAY** | Two parts. (1) Re-test: partially covered by register rows 8a/8b/8c, which are dollar-model and floor-consumer specific — **the full adjuster sweep is NOT covered.** (2) In-draft auto-tuning by round/position/circumstance: **no row, no owner, no prereg existed.** A scopes it or sends it back with a reason. |
| A7 | **A session that takes the macro view and red-teams the model's output** — *"our current big board has trey mcbride over justin jefferson. that makes no sense."* | relay | **DELIVERED — awaiting Cory's launch** | `SESSION-E.md`, `ROUTES.md → TO: E`, `OPERATING-MODEL.md` Rule 3e (E sits BESIDE the pipeline, gates nothing), and the lane-aware tests taught about E. Scoped as red-team-on-outputs, NOT a second PM: it raises questions with the player and number attached, and never overrides a measurement. |

## WAITING ON CORY — nobody else can move these

**Format per Cory's 08-17 instruction** (`OPERATING-MODEL.md` Rule 2b): what he
is deciding, what it means, how it affects the model, a recommendation, and what
happens if he says nothing.

---

### C1 — the `ceiling` weight: does the model get to care about upside at all?

**DECIDING:** leave the composite's `ceiling` weight at **0**, or set it to a
non-zero value (anywhere in **0.15–0.65**; the exact number matters far less than
zero-vs-non-zero).

**MEANS:** right now, when the tool compares two players, **it gives no credit
whatsoever for upside.** Two players projected for the same points rank
identically — even if one of them realistically could go for 250 and the other
tops out near his projection. The model is currently blind to the boom side.

**EFFECT — split honestly into measured and not:**
- ✅ **MEASURED:** three preregistered runs across **two independent seed sets**
  say a non-zero weight beats zero — **3 of 3 seeds, separably, at every value
  from 0.15 to 0.65.** The old zero came from a measurement that could not have
  come out any other way (every player's ceiling was `proj_mean × a constant`, so
  the term carried no player-specific information — there was nothing for a
  non-zero weight to *do*). That defect is fixed; the zero it produced is not.
- ✅ **MEASURED:** the composite's "roster blindness" is an artifact of this zero,
  not a design property.
- ❌ **NOT MEASURED — the blast radius on your actual pick order.** Nobody has
  counted how many players move how far. A quick proxy suggested 62–83 of the top
  120 move ≥5 spots, **but every large mover was a QB, which is the signature of
  a scale artifact rather than a real signal** — QBs score more, so their raw
  `ceiling − mean` is largest. **I do not trust that number and you should not
  either.** Owner: relay, before you rule.

**REC:** **ship it non-zero, at 0.45.** The evidence is as strong as this project
produces, and the framing that matters is that the model ignores upside entirely
— the exact value is a detail. The only thing that held it at zero was a
no-change-before-08-22 rule you have since overruled ("if it makes the model more
correct we are changing NOW"). **But rule after I hand you the real rank blast
radius, not before** — you should see who moves before it moves.

**IF SILENT:** it stays at 0 through the draft, and the model drafts blind to
upside. That is a real cost, not a neutral default.

---

### C2 — the ADP-sd ratchet: it fired, do we re-fit or leave it?

**DECIDING:** leave our ADP-dispersion constant where it is, or re-fit it to the
market's current, tighter numbers.

**MEANS:** we hold an assumption about how much the draft market disagrees with
itself on a player. A guard fired saying our assumption no longer matches
reality. **The important part: our number did not drift — the market genuinely
tightened.** So this is the guard doing its job, not a bug.

**EFFECT:** **blast radius is one player.** Our constant sits at **1.39×** FFC's
published dispersion in the 50–100 ADP band. Re-fitting now means fitting to a
single point in time, which is how a guard becomes a rubber stamp: fit it to
today, and it fires on ordinary variation next month and gets widened again.

**REC:** **leave it, revisit post-season.** One player of blast radius does not
justify re-fitting a guard five days before your draft, and re-fitting to current
data is exactly the failure mode that makes the guard meaningless later.

**IF SILENT:** it stays as-is, which is the recommendation — so silence is a fine
answer here.

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
