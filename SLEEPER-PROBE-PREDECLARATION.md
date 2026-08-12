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
