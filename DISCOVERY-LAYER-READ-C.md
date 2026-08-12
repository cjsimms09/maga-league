# TERRITORY: C
# SHOULD THE DISCOVERY LAYER BE BUILT, AND SHOULD C OWN IT — my read

**Two questions, and my answer to the first is no, not yet — for a reason that only
became visible by running the persistence test.**

---

## 1. NOT YET, AND THE BOTTLENECK IS NOT WHERE IT LOOKS

**The constraint is validation capacity, not candidate generation.**

I produced **three** candidates this week — C-001 (persistence), C-002 (QB hindsight
concentration), and the passing-TD prevalence question. Their revisit triggers:

    C-001  RESOLVED by running it   (owner_seasons 30, but the pooled test had power)
    C-002  oracle_capture_qb_slots   5 / 15    -> ~3 more drafts, earliest 2028
    R-F7   no counter can ever fire it
    R-ROUTE1 no counter can ever fire it

**Generation throughput today: three candidates in a week of directed work. Validation
throughput: approximately zero per year**, because almost nothing can be validated until
samples grow by multiples, and our samples grow one season at a time.

**A mechanism that generates faster than validation absorbs produces a backlog of
unvalidated candidates. That is a finding factory with extra steps** — the exact thing the
safeguards exist to prevent, arriving through the queue rather than through the p-values.
Rule 9 says the mechanism's cost must be small; here the mechanism's *output* is the cost.

**Build it when validation capacity exists**, which is when component grading runs at
n≈1,260 a season and can absorb a preregistered test per cycle. That is A's September
deadline, not now.

## 2. BUT I WAS WRONG ABOUT WHY, AND THE CORRECTION MATTERS

**I previously said my archives were too thin to scan and that a scan would examine zero
relationships. That was right about the ACCUMULATING series and wrong as a general
claim.**

The persistence answer — the highest-value thing found this week — came from
`league_history.json`: **three seasons of every owner's picks, on disk the whole time,
never asked a question.** That is not a thin archive. It is a **rich archive nobody
queried**.

**Those are different problems with different remedies:**

| | remedy |
|---|---|
| **thin accumulating series** (ADP 1 row, census 1 row, trending 0) | wait. A scan says nothing for a year |
| **rich unqueried history** (3 seasons of picks, transactions, standings, money) | **ask it something. No mechanism required** |

**The second needs no discovery layer at all — it needs a question and an afternoon.** B
holds three seasons of rendered league behaviour that nothing has examined; A holds the
Lab registry of everything tested and retired. Neither is thin.

## 3. WHETHER C SHOULD OWN IT — the separation matters more than the location

**The property that matters is that whoever scans an archive did not produce it.**

I produced the ADP archive, the format census, the oracle-capture series and the board
pins. **A scanner living in the lane that produced the archives is the self-referential
defect at system scale**, and I hit that defect twice today at small scale: my mutation
battery reported three false kills against a test file that did not exist, and my own
revisit-trigger proposal was unreadable by the mechanism I had just proposed.

**So: not ownership — rotation.** I should scan A's and B's archives, because I do not
produce them and have no stake in what they show. Someone who does not produce mine should
scan mine. That is a property of the assignment, not of the person, and it survives any of
us being replaced.

**What I would keep from the case for C** is not diligence but one specific habit:
**checking the instrument before believing the negative.** The first cut of the
persistence test found nothing — 18 correlations, zero crossings — and that was the
instrument, not the world. It had power only for |ρ| ≥ 0.648, which is to say it could
detect persistence only if persistence were strong enough not to need measuring. **A
scanner without that habit reports "we looked and found nothing" as a finding, forever.**

## 4. WHAT I WOULD DO INSTEAD, NOW

**Nothing that needs building.** Three directed passes over rich unqueried history, one
per lane, each a question rather than a system:

1. **B's transaction and money history** — three seasons, never examined for structure.
2. **A's Lab registry** — everything tested and retired, which is a record of what *kind*
   of hypothesis fails here and has never been read as one.
3. **The 120 F1-rejected leagues** — real drafting behaviour, excluded from grading by a
   production filter that should not bound a discovery question.

Each is an afternoon. None needs a mechanism. **If three directed passes produce nothing,
that is the evidence that a mechanism would not have either.**
