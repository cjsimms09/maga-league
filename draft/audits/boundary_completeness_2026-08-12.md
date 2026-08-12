# BOUNDARY COMPLETENESS — does the lab supply what production leaves empty?

**2026-08-12. A, on B's finding and Cory's instruction: "Mechanical question, mechanical
answer. Do not reason about it — check."**

---

## 1. THE QUESTION

B found that `optimize()`'s second objective is inert in production: variance enters only
through `p.sd`, `member.js` reads `sd` off a `rosterView` row, and `rosterView` never builds
that field. Every player therefore gets the position-typical sigma, no same-position swap can
change variance, and the expected-dollars optimum collapses onto the expected-points optimum.

Cory's question, stated deliberately narrowly:

> **DOES THE BACKTEST HARNESS SUPPLY PER-PLAYER `sd` WHEN PRODUCTION DOES NOT?**
>
> If it does, then the eleven percent, the roughly nine dollars a season, and the calibration
> work built on them describe A CONFIGURATION THAT HAS NEVER SHIPPED.

And the framing that made it worth asking, which is the disciplined version rather than the
loose one Cory withdrew: proximity between two rates measured on different data is a clue,
not a finding — it makes configuration provenance a **necessary investigation**, nothing more.

## 2. THE ANSWER: YES, AND THE COLLAPSE IS TOTAL

`draft/backtest/lineup_deviation.js:83` builds each roster row as
`{ id, name, pos, proj: a.mean, sd: a.sd }` — a per-player SD computed from that player's own
weekly variance across the season. Production's row (`member.js:2648`) is
`{ id, name, pos, proj: guarded, sd: r.sd }`, and `r.sd` is `undefined` for every row.

Both arms below run **the same sweep, the same 450 real 2023–25 team-weeks, the same
`matchupValue` of $110**. The only difference is that arm B strips `sd` at the `optimize()`
boundary — which is exactly, and only, what production does.

| | intervention rate | $/season |
|---|---|---|
| **A — harness as it ships** (6,343/6,343 rows carry a non-null `sd`) | **10.9%** (49/450) | **$8.94** |
| **B — `sd` stripped (the production configuration)** | **0.0%** (0/450) | **$0.00** |

**The quoted 11% and ~$9/season describe a configuration that has never shipped.** Not
"describe it optimistically" — the mechanism does not fire at all without per-player variance.
Every one of the 49 deviations was caused by a field production does not supply.

This is independently consistent with B's live measurement (zero of sixty rosters produce a
call today; 24 of 150 with per-player sd supplied). Two instruments, opposite directions,
same conclusion.

**What this does NOT establish.** It does not say the dual objective is worthless — it says
the historical evidence for it was measured on an input production lacks. B is fixing the
production half with measured SD, structural provenance, and a missing-data regression test.
**When that lands, the 11% and the $9 must be re-measured, not inherited.** They are not
"confirmed pending wiring"; they are unmeasured for the system as it will actually run, and
the season-average-as-projection proxy the harness uses is a separate labelled limitation on
top of that.

**Reproduce:** `node draft/backtest/lineup_deviation.js` for arm A; arm B is the same sweep
with roster rows mapped to `{id, name, pos, proj}` before `optimize()`.

## 3. THE NARROWER FOLLOW-UP, ASKED ONCE

> Is there any other place where the lab or a backtest supplies a field that production
> leaves empty?

**Bounded honestly: I checked the two engine boundaries that have both a production caller
and a lab caller. This is not a repo-wide sweep and should not be read as one.**

### `optimize()` — the boundary the finding is on

Read-set compared against both callers. Beyond `sd`, the arguments diverge in **both**
directions:

* **Lab supplies, production does not:** `sd` (the finding), `matchupValue` (production takes
  the $110 default — same value, no divergence), `slots` (production takes the default).
* **Production supplies, the lab does not:** `oppSd` (production passes
  `typicalTeamScore().sd`; the harness takes the 24 default) and `current` (the lineup you
  actually have set).

`current` is worth naming even though it does not invalidate the table above. The harness
reads `res.calls`, which is optimum-vs-naive and computed identically either way — so the
measurement is sound. But it means **the set-comparison path (`lineup.js:576–585`) has never
been exercised by any historical sweep**, and that path is the one that answers "is my actual
lineup wrong", which is what the tool is for on a Sunday.

### The draft engine — checked because it runs in ten days

Read-set recorded at runtime with a `Proxy` over live board players (not grepped, so aliased
or computed reads still show), then diffed against the 44 fields `public/draft_data.json`
actually supplies across 1,759 players. **One field is read and never supplied:**

```
games_missed_3yr        engine.js:627  — risk -= 8, "N games missed in 3 seasons"
```

This is **not** a lab/production divergence. A repo-wide grep finds no writer anywhere —
not in production, not in any harness, not in any fixture. It is a **durability-risk clause
that has never fired for any player in any run**, and `player.games_missed_3yr >= 8` is
`undefined >= 8` → `false`, silently, forever.

Two things bound its severity, and both should be stated rather than assumed:

1. `MEASURED_WEIGHTS.risk = 0`, so the whole risk term is currently weighted out.
2. The rule-16 fix already gates `risk.reasons` behind `w.risk !== 0`, so the dead clause
   cannot be cited as a reason on the live surface.

So it is inert twice over today. **It is still a defect**, because the moment anyone gives
`risk` a non-zero weight — which is a one-line change and an obvious thing to try — three
clauses fire and the fourth silently does not, and nothing in the code or the tests says so.
Logged rather than fixed: supplying it means a new data source, which is not a ten-days-out
change.

## 4. WHY THIS KEEPS HAPPENING

Five instances in a week, and none of them a bug on the producing side:

| instance | degraded into |
|---|---|
| `optimize()`'s `sd` | expected-$ optimum collapses onto expected-points optimum |
| intervention-rate harness on `DEFAULT_WEIGHTS` | a rate measured for weights production does not run |
| baseline built on a context the app does not use | a comparison against a system that does not exist |
| dead weighted terms cited as reasons | a true sentence about an inoperative cause |
| six unregistered ledger kinds | decision-time records 400'd and lost |

**None of them crash. None look broken.** Each causes the system to answer a simpler or
different question than the one the design says it answers — which is more dangerous than a
visible failure, because a visible failure recruits attention and this recruits confidence.
**Every one was found by accident rather than by a guard.**

Now **rule 17** in SESSION-A.md, as the matched converse of rule 14:

> A COMPONENT PASSING ITS LOCAL TESTS DOES NOT ESTABLISH THAT THE PRODUCTION SYSTEM IS
> EXERCISING THAT COMPONENT'S INTENDED BEHAVIOUR. BOUNDARY COMPLETENESS MUST BE TESTED,
> NOT INFERRED.

Rule 14 asks whether anything reads what you produce. Rule 17 asks whether what you consume
is actually being supplied. A unit test discharges neither: it supplies its own inputs, so it
is the producer the live path lacks in precisely the way a producer's test is the consumer the
live path lacks. The failure class is named **SILENT SEMANTIC DEGRADATION**.

The discharge is one question at the moment of consuming a field: **"who writes this, and what
would I see if nobody did?"** If the answer to the second half is "a plausible number", the
boundary needs a test, not a comment.
