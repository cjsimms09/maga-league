# TERRITORY: C
# SLEEPER'S PUBLIC POOL — PRE-DECLARATION, committed before the probe runs

**The external-sample question was answered entirely against MyFantasyLeague and
archive.org. Sleeper — the source we already use, and the one our own league is on — was
never probed. This settles it against a second source or closes it on two.**

## The four questions, in Cory's order

1. **Are public leagues discoverable at all?** Most likely to close everything.
2. **If so, what fraction match our format?** 10 teams, half-PPR, 6-point passing TD,
   keepers. Against MFL's measured **0 of 394**.
3. **Do completed drafts carry PER-PICK timestamps?** MFL's did; that is what made D7
   constructible.
4. **What is the per-league fetch cost?** 12.6s killed Route 2 at MFL.

## The discovery mechanism I will test, stated before running

**Sleeper has no "list public leagues" endpoint that I know of, and I am not assuming
that is the end of it.** The surface we already call is `/v1/league/<id>`,
`/v1/draft/<id>`, `/v1/players/nfl`, `/v1/state/nfl`. What that surface *does* permit is a
**referral crawl**:

    our league  ->  /v1/league/<id>/users        (the 10 managers)
                ->  /v1/user/<user_id>/leagues/nfl/<season>   (each manager's OTHER leagues)
                ->  repeat

**If a user's league list is public, the pool is enumerable as a connected component
reachable from our own league.** That is a real discovery mechanism and it is the thing to
test. If user league-lists are private or require auth, **Q1 closes and the route is dead**
— a clean answer.

**Seeds** (ours, all four seasons): `1374848328470102016`, `1248121522762027008`,
`1117672595379277824`, `990840142107619328`.

## Predictions, made blind

- **P1. There is NO public search/discovery endpoint.** Leagues are reachable by ID only.
- **P2. The referral crawl WORKS** — `/v1/user/<id>/leagues/nfl/<season>` returns without
  auth. This is the prediction I am least sure of and it decides the route.
- **P3. Sleeper's per-league fetch is under 1 second**, versus MFL's 12.6 — unauthenticated,
  CDN-fronted, and we already call it constantly without being rate-limited.
- **P4. Cory's expectation — a materially higher format match than MFL's zero — HOLDS on
  scoring and FAILS on the conjunction.** Sleeper funnels creation through presets so
  half-PPR should be common; but **10-team and keepers are both minority choices**, and
  F1 requires the conjunction. My guess: half-PPR alone well above 30%, the full
  conjunction in low single digits per cent. **A low single-digit rate against MFL's zero
  is still a different world** — 2% of a crawlable pool clears F7's 200 where 0% never can.
- **P5. Per-pick timestamps exist.** Sleeper's draft picks are event-sourced in its UI, so
  a timestamp is likely — but our own captured picks carry `round, pick_no, roster_id,
  player_id, is_keeper` and **no timestamp**, which is evidence against and is why this is
  a question rather than an assumption.

**What would close the route cleanly:** no referral crawl (P2 false), or a format match of
zero. Either is a plain answer and I will report it as one.

## Discipline

- **PROBE BEFORE DESIGNING.** MFL's `draftType` was `SFIRSTRANDOM`, not `"snake"`, and a
  guessed adapter would have rejected every league while reading as format rarity.
  **Assume Sleeper has its own version of that and read the real response.**
- **POSITIVE CONTROL**, using the scaffold built today: our own league is known to exist,
  known to be 10-team, known to be half-PPR with keepers. **If the probe cannot recognise
  OUR league as a match, its zero is about the probe.** Reported alongside every result.
- **No egress from this sandbox** — `api.sleeper.app` returns 000 here, the same proxy
  block as MFL. The probe is pure logic plus a CI workflow, as every probe in this lane is.
- **BOUNDED.** Four questions, then stop. Rule 9.

---

## CORRECTION TO P5's REASONING, made BEFORE the probe runs

**The prediction stands; the evidence I gave against it was wrong, and it was wrong in a
way that is itself a finding.**

I hedged P5 with: *"our own captured picks carry `round, pick_no, roster_id, player_id,
is_keeper` and no timestamp, which is evidence against."*

**That is a fact about OUR EXPORTER, not about Sleeper.** `draft/history_export.py:194`:

```python
"picks": [{
    "round": p.get("round"), "pick_no": p.get("pick_no"),
    "roster_id": p.get("roster_id"), "player_id": p.get("player_id"),
    "is_keeper": p.get("is_keeper"),
} for p in picks],
```

**Five fields, hand-listed.** Whatever else `/v1/draft/<id>/picks` returns — a pick time,
`metadata`, `draft_slot` — is discarded at export. `sleeper_import.py:242` stores the raw
list; `history_export.py` is where the narrowing happens.

**So P5 has no evidence against it after all, and the probe reads the LIVE response rather
than our archive** — which it already does, and which is the only reason this correction
does not change the probe.

### And it is a capture finding in its own right

**We fetch full pick objects on every import and keep five fields.** Under the standing
capture principle — free, already accessible, unrecoverable later — a per-pick timestamp
is *exactly* what D7's construction needs, and past drafts cannot be re-exported with it
if Sleeper ever stops serving them.

**Not proposing a change to A's exporter ten days out.** Recording it so the question
"does Sleeper give us per-pick times" is answered from Sleeper rather than from a file
that was never going to contain them.

**This is the ninth instance this week of a consumer's shape being mistaken for a
producer's**, and the first where I caught myself doing it inside a pre-declaration.

---

# F7 AT SCALE — PRE-DECLARATION, before dispatch

## THE QUESTION CORY ASKED ME TO ANSWER BEFORE CELEBRATING A NUMBER

> *"If F7 clears, the ADP problem is still unsolved. Say plainly whether a cleared F7
> gives us a pool we cannot price."*

**Partly true, and the split is the whole answer.**

**BACKWARD — yes, unpriceable, and permanently.** A 2023/24/25 Sleeper league-season needs
ADP dated before *that* draft. Sleeper publishes none. D7 is dead here (Q3: no per-pick
timestamps). Route 1 is capped at tens. **Those seasons are a pool we cannot price and
never will be able to.**

**FORWARD — NO, and this is the part that changes the conclusion.** We began capturing
dated ADP on **2026-08-11**, and the archives hold it:

```
D3 external ADP      2026-08-11, 2026-08-12   (daily, 11:20 UTC)
FantasyPros ADP      2026-08-09 .. 2026-08-11 (daily)
```

**F5 requires ADP observed strictly before the draft. It does not require league-specific
ADP** — that was never the registered clause, and a dated public board is exactly what
Route 1 spent a week trying to find in an archive. **We now produce one ourselves, daily.**

**Most 2026 drafts have not happened yet.** Ours is 2026-08-22. Any Sleeper league drafting
after 2026-08-11 is servable by a snapshot that already exists, and the coverage widens by
one day every day — the same "TOO_YOUNG heals at one snapshot a day" the 2026 ingest run
reported.

**So the honest statement, and it is Cory's own framing:** the constraint moves from *"the
leagues do not exist"* to *"the leagues exist, we cannot price the past, and we can price
everything from 2026-08-11 forward."* **That is a different problem and a smaller one** —
one artifact rather than a population, and the artifact is already being captured.

**What it does NOT give us:** a graded observation this season. F2 needs a completed draft;
the outcome half needs January. **A cleared F7 in August 2026 is a pool that becomes
gradeable in 2027, not evidence available for the 22nd.**

## PREDICTIONS

**Cory's, recorded as his:** the match rate holds near 2%, F7's 200 is reachable, **and the
surviving 2% may be systematically unusual leagues rather than representative ten-team
ones** — a twelve-team room's dynamics are not ours, and whatever selects for ten-team may
select for other things too.

**Mine:**

- **P6. The rate holds between 1.5% and 2.5%** at 10,000+ screens. The first 400 were the
  leagues nearest ours in the referral graph, so if anything I expect the rate to **fall**
  as the crawl reaches strangers — our neighbours are more like us.
- **P7. F7's 200 clears.** At ≥1.5% and 12,000 screens that is ≥180; at 2.0% it is 240.
- **P8. Cory's selection worry is REAL and I expect to see it** — matched leagues skewing
  toward older `league_id`s (Sleeper ids are time-ordered), because ten-team is the legacy
  default and twelve-team the modern one. **This is checkable from the ids alone and I will
  report it whether or not it appears.**
- **P9. F2 rejects a large minority.** Many discovered leagues will be `pre_draft` for 2026,
  since most drafts have not happened.

## WHAT WOULD MAKE THE RUN NOT DECISIVE

- **The crawl staying inside our own neighbourhood.** If 12,000 screens come from a
  referral graph only two or three hops from our league, the rate is a fact about our
  social circle rather than about Sleeper. **Mitigation: report the discovered-pool size
  against the screened count**, and treat a rate measured on a pool barely larger than the
  screen as uninformative.
- **A rate that swings with depth.** If the first 2,000 and the last 2,000 screens differ
  materially, the pool is not homogeneous and no single rate describes it.
- **Sleeper rate-limiting mid-run**, which would truncate the crawl in a way that
  correlates with depth. **Fetch failures are counted and reported, never silently skipped.**
- **And the positive control failing** — our own league must fetch and screen as a match, or
  the whole run is void rather than caveated.

**A short run reports the number and changes nothing.** F7's rule is unchanged.

---

## DISPATCHED — the parameters, and the season choice, recorded BEFORE the result

    workflow   sleeper-pool-probe.yml   ref main
    season     2025
    pool_target 20000      max_leagues 12000      budget_s 3300

**Season 2025, and the reason is comparability rather than usefulness.** The pilot ran
`SEASON: 2025` — 8 of 400 matched (2.00%), 11,988 discovered, 0.084s mean over 5,897
requests. **P6's band (1.5–2.5%) and P7's arithmetic are calibrated on that run.** Crawling
2026 instead would confound the headline rate with a change of season, and the headline rate
is the only thing F7 turns on.

**The cost of that choice, stated plainly: P9 IS NOT SCORED BY THIS RUN.** P9 predicted F2
would reject a large minority because most 2026 drafts have not happened — that prediction
was written for a 2026 crawl and a 2025 crawl cannot test it. **It is unscored, not passed.**

**And the budget arithmetic, from the pilot's measured 0.084s/request:** phase 1 gets 45% of
3,300s = 1,485s ≈ 17,700 requests, against ~14.7 requests per expanded league — enough to
reach 20,000 discovered. Phase 2 screens at one request each: 12,000 × 0.084s ≈ 1,008s.
**Total ≈ 2,000s of a 3,300s budget.** If either phase runs long the run reports what it
reached, and a short run reports the number and changes nothing.

### WHAT THE PILOT ALREADY TELLS US, AND IT SHARPENS CORY'S POINT

**Team size is the binding constraint, overwhelmingly.** Of 400 screened, the rejections:

    teams:12   304        teams:8     9        teams:32    3
    rec:1.0     22        teams:18    7        superflex   3
    teams:14    20        teams:4     4        teams:6     2
    teams:16    16        ok          8        teams:20    1

**366 of 400 — 91.5% — were rejected on team count alone, and 304 of those were
twelve-team.** Cory's *"half-PPR is common, ten-team rooms are the scarce thing"* is exactly
what the pilot measured. **Scoring is nearly free (only 22 rejections on receptions); the
room size is the whole filter.**

**This is also why P8 matters more than it looked.** If ten-team is a legacy default, the
8 matches are not a random 2% of Sleeper — they are disproportionately *old* leagues, and
old leagues differ in ways nobody has enumerated. **The artifact carries `rows` with
`league_id` and `match`, so the id skew and the depth-homogeneity check are both computable
from the run's own output** — no additional fetching, and I will report both whether or not
they show anything.

---

## RESULT — run 31569112689, 2026-08-12. **F7 IS NOT MET.**

    controls 2/2 PASS  (our league fetchable; our league screens as a match)
    PHASE 1  expanded 976 leagues -> discovered 20,419 in 900s
    Q2       191 matched of 12,000 screened  = 1.59%
    Q3       no per-pick timestamps (3 more drafts checked)
    Q4       mean 0.071s over 25,252 requests
    BOUNDS   12,000 screened of 20,419 discovered; 1,814s of 3,300s used
    F2       4 of 12,000 drafts not complete

**The positive control passed, so the run is not void.** 191 < 200. **F7 remains unmet.**

### The predictions, scored

| | prediction | outcome |
|---|---|---|
| **P6** | rate holds 1.5–2.5%, and **falls** as the crawl reaches strangers | **HOLDS.** 1.59%, and it fell from the pilot's 2.00% — the direction was right |
| **P7** | **"F7's 200 clears."** ≥180 at 1.5%, 240 at 2.0% | **FAILS. 191.** The arithmetic bracket held; the claim did not |
| **P8** | matched leagues skew toward older ids | **NOT MEASURED** — see below |
| **P9** | F2 rejects a large minority | **UNSCORED** — declared before dispatch; written for a 2026 crawl |
| Cory's | rate near 2%; 200 reachable; matched may be unusual | 1.59% (below); reachable; **unmeasured** |

**P7 is a failed prediction and is recorded as one.** *"At this rate 12,565 screens would
reach 200"* is a projection, not a result, and the run did not clear the bar it was
dispatched to clear.

### P8 could not be answered, and the reason is worth more than the answer

**The ids live in the uploaded artifact, and the artifact host is egress-blocked by
policy** (`productionresultssa7.blob.core.windows.net` → gateway 403 on CONNECT). I had
pre-declared I would report the skew *whether or not it appeared*, and I could not compute
it at all.

**That is a check whose answer required a download nobody in this sandbox can perform —
rule 13f, in a new dress.** The fix is landed rather than noted: the probe now computes
**P8 and the depth-homogeneity split in the run itself** and prints them with everything
else. Next run answers both without an artifact.

### What would make this run not decisive — measured against my own list

- **The pool is 20,419 against 12,000 screened — 1.7×.** I declared that a rate measured
  on a pool *"barely larger than the screen"* is uninformative. **1.7× is not comfortable**,
  and it is the live caveat on the 1.59%.
- **Rate swinging with depth: not measured this run.** Same artifact block; fixed above.
- **Rate-limiting: clean.** 0 unreadable, no fetch failures, 25,252 requests at 0.071s.
  **Sleeper did not throttle at 25k requests** — a capture fact worth keeping.
- **Positive control: 2/2.** Not void.

### And what it changes before 2026-08-22: NOTHING, exactly as pre-declared

**F7 being reachable is not F7 being met, and neither is evidence for the 22nd.** A cleared
F7 in August 2026 is a pool that becomes gradeable in **2027**. **I am not dispatching
another crawl to reach 200** — it would change no decision before the draft, and chasing a
threshold because it is nearly in reach is how a number stops meaning what it was
registered to mean.

**Team size remains the whole filter**, and at scale it is starker than the pilot: **6,097
of 12,000 rejected as twelve-team**, against 2,615 on receptions.
