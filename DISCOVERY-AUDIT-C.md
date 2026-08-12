# TERRITORY: C
# DISCOVERY AUDIT — SESSION C, THE EXTERNAL INGEST LANE (2026-08-12)

**Answered from the implementation, not from intent.**

---

## THE FOUR CAPABILITIES, SEPARATED

| capability | state in this lane |
|---|---|
| **Candidate GENERATION** | **DOES NOT EXIST.** Nothing here proposes a hypothesis. Every measurement in this lane was designed by Cory or by me before the data was seen |
| **Selection / PREREGISTRATION** | **BUILT, AND UNUSUALLY STRONG — but it has no intake.** F1–F7, D1–D7, the replay pre-declaration, `oracle-capture/v1`. It processes hypotheses handed to it and has never received one it did not already know about |
| **VALIDATION** | **GENUINELY BUILT.** Known-answer gates, mutation batteries, pre-declared verdicts scored against the record, frozen methods, the rule-of-three bound, denominators reported beside every count |
| **PRODUCTION PROMOTION** | **BUILT.** Nothing from this lane reaches production without a dated registration, and F1 has been held against three separate arguments to widen it |

**So the finding Cory anticipated is TRUE HERE, and one clause sharper: we built the back
half of a research loop and never the front half — and in this lane the *preregistration*
half is the strongest thing in it.** That makes an intake cheap. A generated candidate
would flow into machinery that already works, rather than needing a research system built
around it.

---

## THE EIGHT

### 1. Accumulating data nobody examines

| archive | rows | examined by |
|---|---|---|
| `external_adp_series.json` | 1 (daily from 2026-08-11) | A's standing check, **staleness only** |
| `format_census_series.json` | 1 (per ingest run, from today) | nothing |
| `ORACLE-CAPTURE-SERIES` | 3 (2023–25) | nothing |
| three seasons of every owner's picks, inside `league_history.json` | 3 drafts × 10 owners | **nothing, ever** |

The last row is the one that matters and I did not see it until this audit. **Market
snapshots and Sleeper trending are A's** (lane declared in-file), not mine.

### 2. Relationships currently being tested

**One, ever, and Cory proposed it:** passing-TD rule → crossover pick (Part B).

Everything else in this lane measures a **property**, not a relationship. F1–F7 are
filters. The census is a set of univariate distributions. The crosswalk is a rate. The
oracle-capture is a per-season gap. **A lane that has tested one relationship in its
lifetime is not a discovery layer.**

### 3. Absent classes of relationship

Interactions are the obvious one Cory named. The others, in order of what I would expect
to pay:

- **CROSS-SEASON PERSISTENCE OF OWNER BEHAVIOUR.** I hold three seasons of every owner's
  picks and have never asked whether their tendencies are *stable year to year*. **This is
  the precondition for the room layer being modellable at all.** If tendencies do not
  persist, the room layer can never work and 1.4% was the ceiling, not the mechanism. If
  they do persist, the negative was architectural exactly as Cory argues. **Nothing has
  distinguished those two worlds, and the data to do it is already on disk.**
- **DERIVATIVES OF THE ARCHIVES, NOT LEVELS.** The ADP series will be daily. Nobody has
  asked whether ADP *velocity* — the rate a player moves — carries information the level
  does not. Every archive here is read as a level.
- **NEGATIVE SPACE.** Which players were never drafted in any of three seasons and still
  scored well. That is the oracle's blind spot *and* a candidate class about systematically
  undervalued player types. Never examined.
- **WITHIN-DRAFT SEQUENCE.** I measured the oracle gap by round and never by *context* —
  after a positional run, after a reach, near a tier break. Round is a clock, not a state.
- **STRUCTURE IN MEASUREMENT ERROR.** The crosswalk fails on some players. I split
  conflicts by field but never asked whether unmatched players *differ systematically*
  from matched ones (rookies? DSTs? suffixes?). If they do, every downstream number is
  biased in a direction nobody has characterised.
- **CROSS-LANE JOINS.** My format census against A's component grades; my replay against
  B's transaction history. Structurally absent because the data live in different lanes
  and nothing joins them.

### 4 & 5. Retired hypotheses that stay WATCHLISTED, each with its revisit condition

**A retired hypothesis without a revisit condition is a deleted one wearing a label.**

| retired | why | REVISIT WHEN |
|---|---|---|
| **F7 — 200 external league-seasons** | measured unreachable from MFL's public pool | a non-MFL source with ≥200 accessible half-PPR league-seasons is identified. **Not** on a wider F1 — Cory closed that |
| **Route 1 — dated preseason boards** | 0–3 archive days per URL, no series | a publisher outside the 18 registered targets is identified, **or** the empty-vs-unfetched conflation is repaired and re-run |
| **Route 2 — within-pool ADP** | closed on cost | the pool grows enough that reconstruction cost falls below the value of one season's ADP |
| **Passing-TD value term** | crossover moves 0–2 picks | our scoring changes, **or** a season shows QB replacement moving >2 picks |
| **Signal B model half** | needs component projections we do not archive | Option B's residual test against ADP comes back non-zero |
| **The room layer (A's, watched from here)** | 1.4% — possibly architectural | **owner tendencies are shown to persist across seasons.** The test is in §3 and the data is on disk |

### 6. Can the system generate candidates without treating them as conclusions?

**No — because it cannot generate them at all.** The "without treating them as conclusions"
half is the part that is already solved: every verdict this lane emits carries its
denominator, its refusal conditions, and what it does not establish. The discipline to
handle a candidate safely exists. The candidate does not.

### 7. Does anything revisit as the sample grows? — and the mechanism version

**Nothing. Not one thing in this lane notices when a sample crosses a threshold.**

**The mechanism, concretely, and it is small.** Each retired hypothesis carries two extra
fields where it is already written down:

    revisit_when   the condition, in prose, as in the table above
    revisit_n      {archive: rows} — the sample at which it becomes testable

A's `standing_check.py` already walks the archives and already computes each one's row
count. The addition is **one comparison per retired hypothesis**: if the archive it names
has crossed `revisit_n`, escalate — *"candidate X is testable now; it was retired at n=40
and the archive holds 412."* That is a field and a comparison, not a system, and it
converts "someone remembers" into "the check fires". It belongs in A's existing check, not
in a second one of mine — rule 9.

### 8. Where this lane shuts discovery down too early

**I did it in this session, one message after auditing for exactly this.**

I closed Route 1 and declined to repair the empty-versus-unfetched conflation, reasoning
that the *ceiling* made the repair worthless. That reasoning is correct **for the sample
question** and is a **production-gate argument applied at the discovery gate** — precisely
Cory's diagnosis.

And it hid something: the mirror enumeration found **three frozen ADP boards**, hand-checked
against the real 2020 top eight, 37–38 of 40 names known. I recorded them as not useful
*because the seasons were wrong for grading*. **That is a modelling verdict retiring a data
source** — the exact collapse I had just written an audit against.

The second place: **F1 is a production filter and I have been letting it bound discovery.**
Leagues rejected by F1 are excluded from *grading*, correctly. But they are still 120
readable leagues of real drafting behaviour, and nothing says a *discovery* question must
respect a *production* filter. Owner-behaviour persistence, crosswalk error structure and
draft sequence effects are all answerable on leagues F1 rejects.

---

## WHAT I AM NOT PROPOSING

Not a rebuild. Validation and promotion work here and should not be touched. The intake is
the missing piece, it is small, and the architectural call is A's.
