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
