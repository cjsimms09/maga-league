# PARKED — the lane belongs to the mock blockers

**Standing rule (Cory, 2026-08-08):** *from now until mock #2 runs clean, the
blockers own the lane exclusively. Legality strip, need bug, path labels,
nothing else. Park every incoming spec, registration, and doctrine question —
**including anything I send** — and say it is parked. If I ask for science
before mock #2 is green, remind me of this instruction.*

**THE LANE:** ① legality/roster strip → ② need bug → ③ path labels → **mock #2
green** → this queue reopens, top-down.

---

## Parked queue (FIFO unless Cory reorders)

| # | item | why it waits |
|---|---|---|
| 1 | **D11 diagnostic batch** — decompose the swing · verify the 12/12 bracket reproduction wasn't fitting · null baseline on the new grader · heterogeneous-room confirmation | science; D11 is HELD meanwhile, nothing installed. *Partial answer to check 3 already recorded in `DECISIONS-NEEDED.md` from data in hand — no compute was needed.* |
| 2 | **In-season instrumentation** (PredLedger in-season kinds + roster-move journal) | hard date 2026-09-01; ledger-kinds slice ships before the final mock |
| 3 | **Deviation budget display** (= mock-#1 fix #3, ADP-deviation explainer; = Anchor Doctrine §2) | buildable now, but it is a 4th item and the lane holds 3 |
| 4 | **Anchor Doctrine §4** default-to-market fallback | needs no reliability weights; still not a blocker |
| 5 | **Consensus §2** dispersion badge (real-ADP pool only) + **§3** format-match check | ditto |
| 6 | **Experiments 33 · 34 · 35 · 36 · 37 · 38** | all registered, all gated, none running |
| 7 | **Exp 31** 2026 delta board render | waits on `sleeper_rank` populating in a CI rebuild |
| 8 | **Rehearsal keeper mode** · **mock platform-board sampling** · **sync diagnosis** · **session plumbing / hard reset** | from the mock-#1 batch; below the three blockers by Cory's own ordering |
| 9 | **Site optimization Phase 2** | post-draft by its own spec |
| 10 | **THE LEARNING ENGINE** (received 2026-08-08, verbatim below) — ① continuous weekly re-grading that moves displayed confidence tiers on its own · ② hypothesis generation from residuals, auto-proposing registry entries as pre-registered experiments · ③ the Annual as the sole install gate for Tier-2, Tier-1 auto-installing through the gates, Tier-0 free | post-draft; ① and ② both need a live season's weekly outcomes. **⚠️ FLAG: the "Learning Constitution" and its Tier-0/1/2 taxonomy are referenced as existing but are NOT in the repo** — no file mentions them. Either it was never filed or it is in a message that did not arrive. That taxonomy is load-bearing for ③, so it must land before this is buildable. |

### Item 10 verbatim (so the spec is not paraphrased when it is finally built)

**(1) CONTINUOUS RE-GRADING** — every week, automatically re-run the calibration
passes against the new week's outcomes: survival accuracy, projection error by
position, lineup-policy capture, doctrine performance vs Balanced. Update the
confidence tiers on every surface accordingly. *"The tool's displayed certainty
should move on its own as evidence accumulates: a term that keeps being right
gets louder, a term that keeps missing gets quieter, automatically, within
Tier-1 bounds."*

**(2) HYPOTHESIS GENERATION FROM RESIDUALS** — weekly, scan where the model was
most wrong (biggest projection misses, blown survival calls, **overrides where
Cory beat the recommendation**) and auto-propose registry entries for the
patterns — *"model underprices rookie WRs after week 6"* — each entering as a
**pre-registered experiment with criteria, not as an installed change**. *"The
system should notice its own failures and turn them into questions without being
asked."*

**(2b) HYPOTHESIS PROVENANCE + SEPARATE HIT RATES** (added 2026-08-08) —
residual-generated hypotheses are **tagged as such**, and the Annual reports the
**hit rate of machine-generated vs human-generated hypotheses separately**.
*"If the scanner's proposals never clear the gates while human ones do, that's
worth knowing rather than assuming."*

*(Method note for the build: the two streams must face the IDENTICAL gates, or
the comparison measures gate leniency rather than hypothesis quality. And the
volumes will diverge hard — a scanner can propose dozens a week where Cory
proposes a few a season — so report **rate with n**, never rate alone. A
scanner at 2/60 and a human at 2/3 have the same numerator and opposite
meanings.)*

**(3) THE ANNUAL AS THE INSTALL GATE** (already specced) stays the **only** path
from proposal to installed change for Tier-2 items; Tier-1 auto-installs through
the gates; Tier-0 flows freely. **January deliverable: what it learned, what it
proposes, what it retired — and the honest count of hypotheses that DIED,
because a learning system that only ever adds is memorizing, not learning.**

*(Notes for the build, not changes to the spec: ② has an existing feeder — the
ledger already captures `override` with its one-tap reason and `recommendation`
at decision time, so "overrides where I beat the recommendation" is a join over
data we will already have, not new instrumentation. ①'s survival-accuracy pass
also exists as `replay.js calibration()`. The genuinely new pieces are the
weekly scheduler, the residual scan, and the tier-update write path.)*

## Tails received 2026-08-08 — filed with their items, NOT acted on

**① SYNC** (item 8) — *"…auto-fall-back to manual mode with a clear banner after
a short timeout; **a spinner that hangs is the worst possible draft-night
behavior**."* Plus: **instrument the sync path to log its own timings**, so the
next mock reports the hang duration rather than relying on memory. *(This also
answers the question I could not: the hang duration is unknown, and the
instrumentation is what makes it knowable next time.)*

**② REHEARSAL KEEPER MODE** (item 8) — *"…use the predicted slate to pre-remove
predicted opponent keepers from the rehearsal board, so **the value landscape at
my picks resembles draft night instead of a full pool**. Label it: `rehearsal
board — predicted keepers removed`."* Note when built: `predicted_keepers.json`
already exists and `cory_conditional.py` already resolves opponent keepers onto
the pool, so the data path is proven — this is a client-side board filter plus a
label, not new ingestion.

**③ PLUMBING** (item 8) — *"…verify that guard isn't what's swallowing the
action"* — **the END DRAFT confirmation guard from the §D safety pass may be
intercepting the press and never completing; check that path specifically.**
Named suspect, first thing to test.

## Already landed, not parked
- **Claim-integrity doctrine** (`CLAIM-INTEGRITY.md`) + the three guards —
  shipped before this rule took effect; re-sent instruction needed no new work.

## Found by the mock-#3 dress rehearsal 2026-08-08 — measured, NOT fixed

**⑪ THE REMAINING 1.9s PER OPPONENT PICK.** The survival memoisation took a
marked opponent pick from **6.0s to 1.9s of synchronous main-thread block**
(3.2x, bit-identical numbers — see `survival-memo.test.js`). What is left is the
model's inherent cost: ~1700 board players x ~24 intervening picks, now flat
across the profile with no single hotspot above ~430ms. Two ways further, both
of which change behaviour and so are NOT being done unattended:
  - score survival only for the players actually displayed, rather than the
    whole board (VONA reads it broadly — needs a call-graph audit first);
  - move the recompute off the click path entirely and render a visible
    `recomputing…` state, never a silently stale number.
At 1.9s x ~135 opponent picks this is still ~4 minutes of frozen UI across a
draft. Worth doing; not worth guessing at.

**⑫ TAP TARGETS UNDER A FIXED OVERLAY.** `#arm-alerts` is `position:fixed`,
`z-index:150`, occupying x=1266-1426 at the bottom of a 1440px viewport. The
board's "✕ / ➕ Me" buttons centre at x≈1260 — **six pixels of clearance**. At
other viewport widths, or with a scrollbar, that overlay will sit on top of the
row-level draft actions and eat the tap. Dropped taps on those two buttons are
precisely how mock #2 ended with a drifted roster, so this is the same class of
defect as the 6-second freeze, not a cosmetic one. Fix is cheap (move it, or
make the board's action column un-overlappable); it needs a width sweep to
verify rather than a single-viewport spot check.

**⑬ THE WAR ROOM FETCHES FONTS FROM GOOGLE.** The only failing request in the
whole rehearsal was
`fonts.googleapis.com/css2?family=Archivo…&family=Inter…` (ERR_CONNECTION_RESET
under the sandbox's egress block). It degrades to system fonts rather than
breaking, so this is not urgent — but it is a render-blocking external
dependency on draft night, on whatever wifi the room has. Self-host the two
faces and the dependency disappears.

## ⑭ THE COMMAND CENTER — filed 2026-08-08, build AFTER the draft-critical sequence

Cory's private in-season page, same access gating as the war room. **The
in-season tools deserve the same rigor as the draft tool, and the evidence says
they are worth more** — L0 measured $445–595/team/season left on the table by
lineup decisions alone, against a draft edge that is currently unmeasured
(exp 34) and deviating on 100%-LEAN evidence.

1. **ONE PAGE, MY EYES ONLY** — the season's war room, same composition
   discipline: what to do now, why, what's close, who disagrees, everything else
   one tap down.
2. **THE ALWAYS-VISIBLE LINE-UP** — Sunday's start/sit calls with dollar framing
   (ΔP(win) and ΔP(weekly high)·100 dollars) · this week's waiver/FA targets
   ranked with claim-order strategy and the clear-time alert · money position
   (banked, projected, rank) · the week's high-point threshold vs my projection ·
   alerts (injury, role change, an uncovered starter on bye).
3. **SAME EPISTEMICS AS THE DRAFT TOOL, non-negotiable** — every recommendation
   carries its confidence sentence, evidence class, market/consensus comparison
   and near-misses; every piece of advice writes to the ledger at decision time
   with its counterfactual; **nothing renders in a voice its evidence doesn't
   support.** (The `EVIDENCE_STATE`-derived sentence already generalises here.)
4. **SELF-TESTING AND SELF-UPDATING** — the sanity-sweep harness applied to
   in-season advice: never recommend an illegal lineup, never claim a player I
   cannot roster, never stream against a bye. Plus weekly re-grading that updates
   the confidence sentences automatically as the season produces evidence.
5. **THE LEARNING LOOP LIVE** — weekly residual scanning (where were we most
   wrong), auto-proposed registry entries, and the attribution table filling in
   with real dollars per component.
6. **BUILT AND REHEARSED BEFORE WEEK 1** — dry-run against 2023–25 replayed
   weeks, and rehearse a full simulated game week. **The first live Sunday must
   not be the first Sunday the tool has ever run.**

*Dependencies worth noting now: (3) inherits the tier-sentence SSOT and the
ledger's decision-time rail, both of which exist. (4) is the sanity sweep
retargeted — the harness pattern is proven. (6) collides with the 2026-09-01
in-season instrumentation hard date; sequence them together.*

## ⑮ THE ORGANISM TEST — filed 2026-08-08, build WITH the in-season tools

An end-to-end assertion that **a decision made in one half is visible and
gradeable in the other.** Not a diagram, not a claim in a README — a test. **If
any link is broken, the build fails.** Same standard as the doctrine wiring:
one organism has to be *provable*, not assumed.

### The three links

| # | link | direction | status |
|---|---|---|---|
| **A** | a draft pick's **shadow roster** scored by **in-season results** | draft → season | ⛔ needs the season / in-season grading |
| **B** | an **in-season efficiency measurement** changing a **draft-side opponent projection** | season → draft | ⛔ needs in-season measurement |
| **C** | a **January verdict** updating `EVIDENCE_STATE`, which changes a **draft surface's confidence sentence** | season → draft | ✅ **PROVABLE TODAY — seeded now** |

### Why C is already real

`EVIDENCE_STATE` → `tierVoice()` → `tierLine()` → the rendered badge was built
2026-08-08 with exactly this property: `recordEvidence(34, ...)` rewrites every
surface showing a tier, and the badge reads it **live** rather than snapshotting
the wording. That is precisely link C's mechanism — a verdict from the season
half changing what the draft half says about itself.

So C is asserted now, in `draft/tests/organism.test.js`, as the **seed and the
pattern**: the organism test is not a future aspiration with three empty rows,
it is one proven link with two pending. A and B join it as their halves land.

### The standard each link must meet

Not "the data flows" — **the OUTPUT CHANGES.** A link that passes data which
nothing consumes is the doctrine bug again: a truthful-looking wire attached to
a computation it does not touch. Every link asserts a *visible behavioural
difference*, the same way the doctrine guard scores the same board twice and
compares rankings rather than grepping for a word.
