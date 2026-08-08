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
