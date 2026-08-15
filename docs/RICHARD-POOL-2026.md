# The Richard pool, 2026 — pick analysis for Cory

*2026-08-15. Written by the relay session. Every number below is derived from
committed data by named code; nothing is a vibe. Where an input is a
prediction rather than a fact, the label says so — the same rule the site
itself follows.*

## The bet, and who picks first

Each of you holds your own team plus four drafted others, snake order, and
whoever ends up holding the league champion wins. **You pick first**: the rule
is that the better finisher last season leads, and 2025 ended with you 7th and
Richard 10th (regular season; the playoff-adjusted order changes neither of
you — you both missed the bracket). Snake `C R R C C R R C` over the eight
teams that aren't yours or his: **your picks are #1, #4, #5, #8**; Richard
gets #2, #3, #6, #7.

The site can run this bet for real: it is exactly the `pool` format in
`src/sidebets.js` (snake draft included, order set from prior-season finish),
and the commissioner pool advisor (`src/routes/pooladvisor.js`) now has the
measured championship-odds model it was waiting for
(`src/routes/champodds.js`, shipped today, forward-tested on 2023-25). One
honest limitation: the advisor shows odds only once real 2026 games exist —
preseason it stays PENDING by your own no-manufactured-odds rule. This memo is
the preseason analysis that rule requires a human to carry.

## What the record actually says (the part most leagues get wrong)

**Last season's results do not predict this season's.** Measured, not
asserted: owner weekly-scoring means, year over year across 2023-25, correlate
at **r = −0.14** (n=20 owner-transitions). Final-standings rank over the full
2019-25 record: **r = 0.06** (n=60). Playoff repeat rate 46% against a 40%
base rate. Picking teams because they were good last year is picking noise.

Two tails survive that null, weakly:

- **David has made the top-4 in 6 of the last 7 seasons** (~2% probability
  under pure luck for one named owner; ~17% that *somebody* in a 10-owner
  league runs that hot, so: suggestive, not proof).
- **Finals concentrate.** Marian played five finals 2019-24 and won
  2019-20-21-22(co); Michael has two titles in the last three years. Jeremy
  and Richard have each finished top-3 recently without that pattern.

## The one measured pre-draft edge: keepers

Rosters don't exist until the 22nd, so the only differentiator on file today
is the predicted keeper slate (`draft/data/predicted_keepers.json` —
**mock-grade by its own note**: predictions plus your intel, never applied to
the live board). Net keeper surplus (VORP above the round cost paid):

| Franchise | Keeper surplus | Slate |
|---|---|---|
| **Cory (you)** | **+169.6** | Chase, Henry, K. Walker (all high-conf) |
| Bates | +115.9 | Gibbs, Taylor, London |
| Richard | +69.4 | Bijan, Nico Collins, McBride (all *certain*) |
| Michael | +51.4 | CMC (low-conf), St. Brown, Allen |
| Marian | +34.8 | JSN, Bowers, Jefferson |
| Dylan | +29.8 | Nacua, Barkley |
| David / Justin / Jeremy / Sam | 0 | nothing predicted kept |

Feeding those surpluses (spread over the 15-week regular season, on the
measured league mean of 111.6 and measured weekly sd of 21.3) through the
validated bracket model:

| | Champ | Playoff | | Champ | Playoff |
|---|---|---|---|---|---|
| **Cory** | **28.8%** | 78% | Dylan | 7.0% | 34% |
| Bates | 18.0% | 63% | Sam | 4.8% | 26% |
| Richard | 11.2% | 48% | Justin | 4.5% | 25% |
| Michael | 9.1% | 41% | David | 4.5% | 25% |
| Marian | 7.7% | 36% | Jeremy | 4.5% | 25% |

Read the labels: this table is only as good as a mock-grade keeper file and a
surplus→weekly-points conversion. Its *ordering* is the defensible part; the
decimals are not. The flat-field alternative (trust the measured null, ignore
keepers) prices everyone at 10%.

### Late update, same day: real designations landed

The data audit surfaced live Sleeper designations (`draft/config/keepers.json`,
4 of 10 teams so far) that correct two rows above:

- **You and Bates designated exactly as predicted** — the top two rows stand
  on facts now, not predictions.
- **Marian kept JSN + Jefferson + De'Von Achane, not Bowers** — his surplus
  drops to roughly +15, and **Brock Bowers (VORP 81) is in the draft pool**.
- **Justin, predicted to keep nothing, kept Ashton Jeanty + Chase Brown**
  (~+15 at approximate round costs — his real cost rounds aren't on file yet).
- **Richard has NOT designated.** His "certain" slate is still a prediction.

Re-run with those corrections, the board barely moves (you 29.0%, Bates 17.9%,
greedy snake 62.8/37.2) and no recommendation changes: **Bates stays pick 1**,
the pick-4/5 pair is still two of {Michael, Marian, Dylan, David} with the
same David-consistency vs Dylan-keepers tilt, and the only real shift is that
**Justin is no longer indistinguishable from the floor** — if the board is
picked clean of the middle by your last turn, Justin (Jeanty + Chase Brown)
now edges Sam and Jeremy for pick 8.

## The picks

Ten teams split five and five — someone always holds the champion, so the
flat-field baseline is a coin flip, 50/50. Under the keeper table, greedy
drafting on both sides lands you **Bates, Dylan, Sam, Jeremy + your own team =
63%** to Richard's 37%. Your edge is structural and real either way: the
strongest keeper slate in the league is yours automatically, and you pick
first.

Recommended board, in your pick order:

1. **Pick 1: Bates.** The clear #1 among the eight under the only measured
   signal (Gibbs+Taylor+London), and 2025's runner-up. Robust: he's the top
   non-you team under every weighting of keepers vs history.
2. **Picks 4+5: two of {Michael, Marian, Dylan, David}.** Richard will
   likely take Michael and Marian at 2-3 (recency plus the real title
   concentration). Take whichever two remain, with this tilt: **David over
   Dylan** if you weight the 6-of-7 top-4 record; **Dylan over David** if you
   weight keepers (Nacua+Barkley vs nothing kept). Honest answer: near a
   coin flip; David's consistency is the slightly better bet for a
   *championship* pool because his floor gets him into the bracket, and the
   bracket is two coin-ish flips once you're in (the model's own dominant-team
   test shows even a +25 pts/wk team wins the title far less often than it
   makes the playoffs).
3. **Pick 8: whoever is left of {Jeremy, Sam, Justin}.** Indistinguishable on
   everything measured. If you want a tiebreak: Jeremy won 2024.

**If you can, hold the franchise draft until after the 22nd.** The moment
real rosters exist I re-run the same model on actual roster projections
(`champodds.preseasonFromMeans` — the caller states its means; the post-draft
board is a stateable source), and from week 1 the site's advisor prices every
pick live, including what Richard is likely to take before your next turn.

## Provenance

- Order/finishes: `src/seed-data.js` STANDINGS + payouts (2016-25).
- Persistence: computed from `draft/data/league_history.json` weekly scores
  (2023-25) and seed-data standings (2019-25); scripts inline in the session
  log, one-line reproducible.
- Odds machine: `src/routes/champodds.js` — bracket shape pinned to the raw
  2023-25 bracket records by its test; forward test gives the actual champion
  a mean 28.3% at checkpoints vs 10% uniform.
- Keepers: `draft/data/predicted_keepers.json` (mock-grade, labeled).
