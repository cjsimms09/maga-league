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
