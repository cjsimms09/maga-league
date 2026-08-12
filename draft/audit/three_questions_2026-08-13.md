# The three things you asked back for

**Verification before design, as instructed. Two answers are measured, one is a
qualified yes with the qualification being the important half.**

---

## 1. DOES THE COMMIT-THEN-COMPARE PATH ALREADY EXIST?

**Partly — and the part that is missing is not the part you would guess.**

| the architecture you named | status |
|---|---|
| recommendation committed before the pick | ✅ **exists** — `PredLedger.recommendation`, keyed `(season, build_at, pick)` and deduped, top-10 with scores, survival, rails, contested, confidence |
| Sleeper reports the actual pick | ✅ **exists** — the 4-second poll, `applyRemote`, Sleeper authoritative |
| system automatically compares | ⚠️ **exists but compares against the WRONG OBJECT** |
| override recorded if they differ | ✅ **exists on the sync path** — `noteReconciledPick` → `promptOverrideReason`, and this is the path I fixed yesterday |

### THE DEFECT: THE COMPARISON DOES NOT READ THE COMMITTED RECORD

`noteReconciledPick` compares my actual pick against **`state.lastClock`** — an
in-memory object rewritten on **every render** by `renderRecommendations`. It is
the *floating* "if your turn came now" recommendation, not the committed one.

**Three consequences, in increasing severity:**

1. **It is the recommendation for whatever pick was current at the last render**,
   which between my turns is an opponent's pick number. `context()` passes
   `currentPick()`, `myPicksLeft` and `roundsLeft` — so a recommendation computed
   at pick 18 is a materially different calculation from one at pick 22.
2. **The ledger already holds the right object and nothing joins to it.** The
   committed record is keyed by pick. The comparison ignores it.
3. **It currently works by accident.** The sync handler removes my player from
   the board *before* calling `noteReconciledPick`, and `lastClock` is only
   refreshed on render — so the stale value happens to predate the batch. That is
   luck, not design, and one added render inside the poll loop silently inverts
   it.

**So: the manual take is NOT what writes the override record.** The sync path
writes it. Your instinct that the button can leave the primary UI is right.

### WHAT THE MANUAL TAKE IS ACTUALLY LOAD-BEARING FOR — three things, one real

- **`state.markedLocally`** — the flag separating "I tapped it" from "recovered by
  sync", which lands in the record as `reconciled_from_sync`. **Not load-bearing:
  if you never tap, every entry is honestly flagged as recovered, and that is
  true rather than degraded.**
- **Board depletion inside the ~4s poll gap.** **Not load-bearing** — cosmetic for
  a few seconds, and you are reading, not racing.
- **🔴 `capturePick(p, pathKey)` — THE PATH.** Taking a player *from a path card*
  records **which path the pick came from**. **A sync-recovered pick has no
  `pathKey` and that field is lost.** `noteReconciledPick` does not attempt to
  infer it.

**That is the one genuine loss, and it is small but real:** "took him off Path B"
is richer override evidence than "took him", and it is the only field the manual
tap uniquely produces.

### WHAT I WOULD DO, IN THIS ORDER

1. **Join the comparison to the committed ledger record instead of `lastClock`**
   (~1h). This is the fix that makes the architecture actually be the one you
   described, and it removes the accidental-correctness above.
2. **Infer the path on the sync path** from `state.lastPaths` by matching the
   player against each path's candidates — the same lookup the tap path already
   does — so the one uniquely-manual field survives (~30m).
3. **Only then** demote the manual take to a fallback and retire "on the clock".

**Do not reorder these.** Steps 1 and 2 are ledger correctness; step 3 is
surface. You said verify first, simplify second, and the verification found
something.

---

## 2. IS OPPONENT PREDICTION CHEAP ENOUGH? — MEASURED, AND THE ANSWER IS A CONDITIONAL YES

**Measured on this board (1700 players), not estimated:**

| | per prediction | 9 opponents × 1 round | 135 per draft |
|---|---|---|---|
| ADP baseline (best available by ADP) | **1.37 ms** | 12 ms | 185 ms |
| profile-informed (positional draw + best ADP at that position) | **0.17 ms** | 2 ms | 22 ms |
| **both arms together** | — | **13.8 ms** | ~207 ms |

**Fourteen milliseconds per round for both arms. It is free.** For scale, marking
one opponent pick already costs ~1.9 s of main thread (PARKED #11) — the whole
prediction layer is **0.7% of one existing pick's cost**.

### 🔴 BUT THERE IS ONE IMPLEMENTATION THAT WOULD DESTROY DRAFT NIGHT

The obvious way to write "what will this owner take" is *"run the recommender
against their roster."* **Measured: `E.recommend` is 3,097 ms warm.**

> **Nine opponents × 3.1 s = 28 SECONDS PER ROUND.** Against 13.8 ms for the
> cheap form. **A factor of two thousand.**

**So the answer is a conditional yes, and the condition is hard: the prediction
layer must never call `recommend`.** It is a positional draw plus an ADP sort,
and it must stay that. I am stating it this loudly because the expensive version
is the one a reasonable person writes first, and it would produce exactly the
"slower board on the 22nd" you said costs more than the measurement is worth.

**Add a timing assertion to the module so this cannot regress quietly** — a
prediction pass that exceeds a declared budget refuses rather than slows.

---

## 3. ARE YOU WRONG THAT THIS MAKES THE ROOM LAYER MEASURABLE?

**No, you are right — and the framing is better than what it replaces. But two
qualifications, and the second bounds what one draft can conclude.**

### WHY IT IS RIGHT

**A description cannot be wrong.** The profiles are built from 468 real picks and
have never been scored against anything. Your reframing turns the room layer's
central unresolved question — *evidential null or architectural null* — into a
resolvable one, at ~135 graded observations per draft against the 12 my own picks
produce. **That is an order of magnitude more draft-side evidence per year, from
a sync that already exists.** The paired ADP baseline is the whole design: it
converts "the profile was right" into "the profile was right **where ADP was
wrong**", which is the only version that can distinguish the two worlds.

### QUALIFICATION ONE — ONE DRAFT IS ONE CLUSTER, AND THE UNIT IS THE DRAFT

The 135 predictions in one draft are **not 135 independent observations.** They
share a board, a keeper slate and a run structure — the same clustering argument
that put survival's independent unit at the DRAFT rather than the forecast, and
that measurement put the false-positive rate at **11.1%** when correlated
observations were treated as independent.

**So one draft supports a per-draft accuracy difference, not a confidence
interval on it.** A profile arm beating ADP by 8 points on the 22nd is a real
number and a single cluster. This is worth stating now, before a good-looking
first result gets over-read in September.

### QUALIFICATION TWO — AND THIS IS THE ONE THAT BOUNDS THE INFERENCE

**A profile arm that ties ADP does not distinguish your two worlds.** It is
consistent with *tendencies do not persist* (evidential) **and** with *tendencies
persist but our profiles do not capture them* (instrumental). Only a **win**
resolves cleanly.

**So declare the asymmetry before the first entry:** a win is evidence that
tendencies persist and the room layer is worth solving; **a tie is evidence about
our profiles, not about owners**, and must be reported that way rather than as
"tendencies do not persist". Writing this down now is the thing that stops a null
being read as the stronger claim in January.

### AND YOUR HARSH RESOLUTION RULE IS RIGHT, FOR A REASON WORTH KEEPING

Exact-player-or-nothing removes the tuning surface, and — more importantly — it
is the rule under which **the paired comparison is fair**. Any softened rule
(position-only, within-N-of-ADP) would have to be applied to both arms, and every
softening is a place where the profile arm could be advantaged by a choice made
after seeing the data. **Harsh and symmetric beats generous and arguable.**

---

## AND THE THING I WAS ALREADY RUNNING WHEN THIS ARRIVED

`roster_construction.js` re-validated **in the room whose QB/TE counts match the
three real drafts**, because the original clean bill was issued in a room that
over-drafts QB by 40% and TE by 33%.

| | ADP room (mis-calibrated) | profiled room (calibrated counts) |
|---|---|---|
| starting slots unfilled | **0 / 120** | **0 / 120** |
| distinct 12-pick shapes | **3** | **21** |
| modal shape | `QB2 RB1 WR5 TE2 K1 DEF1` — 95.8% | `QB2 RB3 WR3 TE2 K1 DEF1` — 15.8% |
| QB3 or more | **0%** | **~40%** |

**The cap does not break the lineup in either room — that holds.** But **the
ADP room made the cap look like a much tighter constraint than it is.** At
realistic QB scarcity the value exception fires often enough that QB3 appears in
roughly two drafts in five and QB4 in about one in eight.

**This is item 4b's premise, confirmed from the other direction.** The cap treats
a symptom; what the shape actually depends on is *when* the onesie should be
taken, and the ADP room could not have shown that because it cannot produce the
fall-through the exception exists for.

*(4b itself — the difference-of-differences timing arm — is next, not in this
document.)*
