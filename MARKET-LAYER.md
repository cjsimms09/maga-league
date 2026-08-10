# THE MARKET LAYER — definitive specification

_Supersedes all prior market-signal documents and briefs. Consolidated 2026-08-10._

---

## 1. WHAT THIS IS

Betting markets are priced by people who lose money when they are wrong — a better
incentive structure than a projection model or an expert ranking.

**This layer observes our model and measures where it disagrees with the market**,
so that after a season we can answer whether that disagreement carried information.

**It is not an input** to projection, VORP, survival, tiers, scores, or any live
recommendation. It observes; it never rewrites. Same structure as the shadow
strategy layer, so it fits the existing architecture rather than needing a new one.

---

## 2. THE SOURCE — odds-api.io

**Hostname validated: `https://api.odds-api.io` · docs `https://odds-api.io/`**

NOT `the-odds-api.com`, NOT `theoddsapi.com`. Three different providers with
confusingly similar names, one carrying an impersonator warning on its own site.
"The Odds API" is not an identifier. Cory's key is **odds-api.io**.

Published free tier: 100 req/hour, up to 500/day, two recreational bookmakers,
free forever, no card, NFL with full pre-match coverage. Live odds are paid-only
and irrelevant — pre-match is what weekly capture needs.

**Stopping rule.** If odds-api.io clears the probe, the source question is CLOSED.
No surveying alternatives, no optimising for an allowance we do not need. Only on
failure: SharpAPI, TheRundown, SportsGameOdds, in that order, their published
claims treated as marketing until probed. If all four fail, STOP — report the
negative, keep Sleeper trending, revisit only if something changes.

### PROBE STATUS — 2026-08-10

| endpoint | result |
|---|---|
| `/v3/sports` | **200, no key** — 34 sports, American Football present |
| `/v3/bookmakers` | **200, no key** — 274 bookmakers listed |
| `/v3/events`, `/v3/leagues`, `/v3/odds` | **401 — key required** |
| `/v3/markets`, `/v3/fixtures`, `/v3/matches` | 404 (not the path shape) |
| rate / credit headers | **NONE returned on any public endpoint** |

**Provider confirmed real, NFL-covering, and free to reach. Every endpoint carrying
actual odds requires the key.** So the two questions that decide feasibility —
slate-vs-per-game granularity, and the true allowance — **cannot be answered
without it**. Season-feasible: **UNRESOLVED, pending one secret.**

`/sports` was a guess that 404'd; `/v3/sports` was found by reading the docs and
trying a bounded candidate set. A 404 on an invented path is not evidence about a
provider.

**THE ONE ACTION: add `ODDS_API_KEY` as a repo secret.** The probe already reads
it and will answer granularity, allowance, reset schedule, preseason, and
retry-cost in a single run.

---

## 3. WHAT THE PROBE MUST STILL ESTABLISH (all gated on the key)

- **Does one request return the entire NFL slate, or one game per request?** One
  call a week versus sixteen. This is why "500/day is enormous" and "measure the
  real cost" only agree if a request is cheap.
- **Are two recreational bookmakers sufficient?** For implied team totals from
  spread and total, almost certainly — lines barely differ between major books on
  a game total. It matters more if props enter, where book disagreement is itself
  part of the signal. State it, do not assume it.
- What resets the allowance, and on what schedule (a rolling hour behaves
  differently from a clock hour when batching).
- Whether preseason games count against it.
- **Whether failed or retried requests consume budget** — least likely to be
  documented, most likely to bite: if retries burn budget, a flaky week costs double.
- Then: **season feasible, yes or no, with the arithmetic** and a 1.5x margin. An
  allowance that exactly covers a perfect season covers nothing when a week retries.

---

## 4. CAPTURE NOW — the layer is post-draft; the capture is not

Preseason spreads and totals exist today, are free, and **a snapshot not taken is
not recoverable**. Signal C needs two valid observations with stated capture times,
so the earliest capture is the baseline for everything after. Same argument and
cost profile as the preseason projection freeze: nearly nothing now, impossible later.

**Scope tightly** (rule 9): what the three signals need, plus whatever the same
request already returns at no extra cost. Not "everything cheap we might want."

**The capture reports its own health.** A weekly job that dies silently is the
failure this project keeps hitting — the grading cron that existed and never ran,
the Python suite green while collecting zero tests. Record the last successful
capture; alarm past a week. Same standard as the stale-Sleeper banner.

---

## 5. THE THREE SIGNALS

### Signal B — ENVIRONMENT GAP. First, and alone if necessary. **BUILT.**
Not the cheap fallback — the cleanest experiment in the layer, because it needs no
props and therefore has no coverage problem, no conversion problem, no artifact.

`ENVIRONMENT GAP = MODEL TEAM POINTS − MARKET IMPLIED TEAM POINTS`

48.5 total, favourite by 4.5 → 24.25 ± 2.25 → **26.5 and 22.0**.
Implemented in `draft/backtest/market_environment.py`. Negative spreads refused
rather than flipped; direction fixed in one place; `captured_at` required.

### Signal A — MARKET PROJECTION GAP. Only where the market covers the component.
The available props price yardage and receptions, **not touchdowns**. Against
representative season lines under our scoring:

| | total | from props | uncovered |
|---|---|---|---|
| WR1 | 231.5 | 177.5 | **23.3%** |
| RB1 | 247.0 | 175.0 | **29.1%** |
| QB1 | 387.0 | 203.0 | **47.5%** |

A props-derived projection is not low, it is **incomplete by a different amount at
every position**. Against our full projection it would show a large negative gap on
every player, worst at QB — pure coverage artifact, looking exactly like a finding.

**Every gap is COMPONENT-MATCHED**: 203 against 203, never 203 against 387. Where
nothing is comparable, the function refuses rather than returning a confident zero.

**Naming rule:** never produce "market-implied fantasy points" unless every
component is priced. Where coverage is partial the term is **market-implied
component expectation**. Enforced by a source guard, not convention.

### Signal C — MARKET MOVEMENT. Only after two valid observations exist.
The diagnostic one: a receiving prop moving 61.5 → 68.5 means the market learned
something our projection predates. Same insight as ADP movement — the **level** may
already be priced into our projections; the **movement** by construction cannot be.

**Hard rule:** never manufacture an opening line from whatever happened to be
available at first query. A movement measured against our own first poll is an
artifact of our schedule.

---

## 6. THE CONVERSION IS A RULE 11 TRANSFORMATION — **BUILT**

A receiving-yards prop is a raw stat line, not a projection. Without conversion
under our exact scoring every gap is a units mismatch wearing the costume of a
disagreement.

Known-correct case, hand arithmetic in the test, not copied from code:
`4200×0.04 + 30×6 + 10×−2 + 350×0.1 + 4×6 = 387.0` full, **203.0** prop-covered.
Scoring constants asserted, so a config change fails the test rather than staling it.

**Same scoring function as the rest of the system** (`draft/scoring.py`). A second
implementation would be the twelfth instance of the dual-maintenance disease.

---

## 7. VISIBILITY — the strictest rule here

**Completely invisible during any live draft, waiver or lineup decision.** No badge,
no panel, no indicator, no delayed reveal. Visible after the **entire** draft
concludes, in mocks, and in post-season analysis.

"Visible after each pick locks" was written in an earlier version and is **wrong and
superseded**: in a snake draft the next turn is often ten-plus picks away, so a
signal revealed after pick 34 is still on screen at pick 41. That is a delay, and a
**delayed influence is still an influence**.

**The reasoning, recorded because a future session reading a bare prohibition will
eventually find a reasonable-sounding exception:** the protection is about Cory, not
the tool. A flag cannot be unseen. Eleven glances in, the flagged player looks
interesting and gets taken — and that override enters the log as *his judgement*,
with nothing recording that a market signal suggested it. Across a draft that
becomes "I followed the core except when a signal looked interesting," which is how
discipline erodes with nobody noticing a policy change. The cost is occasionally
missing a helpful signal; the benefit is that the measured core cannot be partially
overridden under time pressure. Settled the same way for shadow strategies.

---

## 8. THE DATASET

Recorded at decision time, graded afterward: our projection, VORP, ADP, survival
estimate *(draft-time only — see contradiction C4)*, team total, game total, spread,
relevant props **converted to our scoring**, and the market-vs-model gap.
**Every captured value carries an explicit timestamp.**

After a season, four questions:
1. When our model was materially above the market on a component, did those players
   outperform the market?
2. When the market implied a high team total, did our projections underweight that
   offense?
3. Did market disagreement identify players whose ADP subsequently moved?
4. **Did market signals improve draft and lineup DECISIONS, not merely projection
   accuracy?** A signal that makes the numbers better and the picks no better is
   decoration and gets dropped without sentiment.

---

## 9. HOW IT COULD BECOME LIVE

Through the **graduation gate**, with evidence and Cory's review, exactly like a
shadow strategy. Never by accumulating a good-looking record and someone deciding it
seems ready.

---

## 10. PROCESS NOTES — transferable

**The Kalshi negative was pagination, not absence.** An early run reported *0 NFL
markets*; the open-markets endpoint paginates through 12,000 movie markets and never
reaches football. Caught only because the scan was made to report its own
composition rather than just its verdict — a bare "0 found" reads identically
whether there are none or you asked wrong.

**A naive `"nfl"` substring matched i*NFL*ation**, so the football count read 478 and
was full of CPI and gas-price markets. True count 426. Same class as a crosswalk
matching the wrong player: nothing would ever have errored.

**And my own version of the same lesson:** four of six probe iterations were spent
correcting my own guesses — an invented `/sports` path, an unexamined pagination
assumption, the inflation filter, and a naming guard that tripped on its own
docstring. I applied probe-before-designing to the *provider* and not to my own
queries. **A query that returns a plausible number is not the same as one that
returns the right one.**

---

## 11. CARRIED FORWARD FROM SUPERSEDED DOCUMENTS

Two things the definitive spec dropped that should survive:

**Sleeper trending is a first-class source, not just a fallback.** It is the only
thing usable *today*: free, wired, no token, `{count, player_id}` and
player-resolvable. It also carries a signal none of A/B/C covers — **ADP is what
people PAID; trending is what they are SUDDENLY REACTING TO.** The consolidated spec
mentions it only inside the stopping rule, which understates it.

**Kalshi carries the touchdown market that Signal A is missing.** 12,623 series, 426
football, **48 player-production** including `KXNFLANYTD` (anytime TD),
`KXNFLMOSTRECYDS`, `KXNFLMOSTRSHYDS`, `KXNFLPASSATT/COMP/INT`. Part 5 says *"if
touchdown markets turn out to be available, that changes the calculus and should be
reported as a finding."* **They are, and this is that report.** Closing the source
question on odds-api.io drops the only identified source for the 23–47% of scoring
the yardage props cannot reach. **Volume on those series is unmeasured** and decides
whether they are usable at all — that measurement is cheap and not yet done.

---

## 12. CONTRADICTIONS IN THE SPEC — NAMED, NOT RESOLVED

Per instruction: surfaced rather than quietly reconciled.

**C1 — the skepticism is applied asymmetrically.** Part 2 states odds-api.io's
free tier as fact ("100/hour, up to 500/day") while Part 3 says *build nothing until
this returns real numbers*, and Part 2 explicitly says to treat SharpAPI,
TheRundown and SportsGameOdds claims as *marketing until probed*. The same standard
is not applied to odds-api.io. **Measured: no rate, quota or credit headers are
returned on any public endpoint.** The published tier is currently unverified by
observation, and "it wins on the numbers" rests on those unverified numbers.

**C2 — "build nothing until probed" versus "capture now".** Part 3 gates all work
on the probe; Part 4 says the preseason window is unrecoverable and the capture
should start. Capture *is* building. The probe is presently blocked on the key, so
these two instructions currently point opposite ways and the preseason window is
shrinking while they do. **Needs a call:** either the key lands and both are
satisfied, or capture starts against the unauthenticated surface (which carries no
odds), or the window is knowingly conceded.

**C3 — Signal C's "consensus" cannot exist on this source.** Part 5 prefers a
probability framing — *"our model gives a player 21% at RB1, consensus says 14.5"* —
but Part 2's free tier is **two recreational bookmakers**, and Part 3 itself notes
book disagreement matters "if props ever enter". Two books is not a consensus.
Worse, "21% at RB1" is a **season-award market**, not a pre-match game line;
odds-api.io pre-match will not carry it. That example needs Kalshi (`KXLEADERNFL*`)
or a paid tier — it is not reachable from the closed source.

**C4 — the dataset lists a draft-time quantity as weekly.** Part 8 records
"survival estimate" per player per week. Survival is *probability a player lasts to
my next pick* — it exists at draft time and has no in-season weekly analogue. Either
it means something different in-season and needs defining, or it belongs only to the
draft-time slice of the dataset.

**C5 — Signal A may be uncapturable on the closed source.** Part 4 says capture what
the three signals need. Signal A needs props; whether props are on odds-api.io's
free tier is **unestablished** (the odds endpoints are 401). If props are paid, the
capture scope is Signal B only, and Signal A waits on a source the stopping rule has
closed.
