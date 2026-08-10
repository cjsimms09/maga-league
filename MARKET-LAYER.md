# MARKET SIGNALS — read-only shadow layer

**Binding constraints (unchanged):** read-only — nothing here touches projection,
VORP, survival, tiers, scores or any live recommendation. **Visibility: completely
invisible during any live draft, waiver or lineup decision.** Visible after the
entire draft concludes, in mocks, and in post-season analysis. A signal revealed
after pick 34 is still on screen at pick 41; a delayed influence is an influence.

---

## SOURCE PROBE — findings, 2026-08-10

Exact hostnames recorded, because "The Odds API" is not a sufficient identifier:
there is a real naming collision and the products differ in NFL coverage.

### odds-api.io — ACCESS CONFIRMED, FEASIBILITY UNRESOLVED
`https://api.odds-api.io` · docs `https://odds-api.io/`

| question | answer |
|---|---|
| free tier usable without payment | **YES** — `/v3/sports` returns 200 with **no key** |
| NFL present | **YES** — 34 sports listed, American Football among them |
| bookmakers | **274** listed at `/v3/bookmakers` |
| rate / credit headers | **NONE RETURNED** |
| markets + fixtures endpoints | path shape still unknown (`/v3/markets`, `/v3/fixtures?sport=` both 404) |

**Season feasible: CANNOT STATE.** The two things that decide it — the credit UNIT
(per request vs per market per book) and the actual allowance — are not observable
from the unauthenticated endpoints, and no rate headers come back. The published
tier (100/hr, 500/day, 2 recreational books) is **unverified by observation**.

The 274-bookmaker list is the reason this matters rather than being a formality:
under per-market-per-book billing, 4 props x 274 books is 1,096 credits for ONE
snapshot. The published "2 recreational books" implies the free tier restricts
that, but implication is not measurement.

**The blocker is now an ACCOUNT, not a technical unknown.** Free, no card. One key
resolves it in a single probe run.

### the-odds-api.com — NOT MEASURED
`https://api.the-odds-api.com/v4` · docs `https://the-odds-api.com/`
No `ODDS_API_KEY` secret is configured, so the existing 500 monthly credits could
not be characterised. **A setup gap, explicitly not a dead end.**

### parlayapi — NOT REACHED
`https://api.parlayapi.com` · docs `https://parlayapi.com/`
`llms.txt` 404. Probed, not built against, per the brief. Not pursued further.

### Kalshi — HAS PLAYER-PRODUCTION MARKETS (corrected finding)
12,623 series; 426 football; **48 player-production**, including `KXNFLANYTD`
(anytime touchdown), `KXNFLMOSTRECYDS`, `KXNFLMOSTRSHYDS`, `KXNFLPASSATT/COMP/INT`.

An earlier run reported *0 NFL markets* — that was **wrong**. The open-markets
endpoint paginates through 12,000 movie markets and never reaches football, and a
naive `"nfl"` substring additionally matched i**NFL**ation (CPI, gas prices),
inflating the football count to 478 against a true 426. **Volume on the production
series is not yet measured** and decides whether they are usable at all.

`KXNFLANYTD` is the interesting one: a touchdown market is exactly the component
the four yardage/reception props cannot reach.

### Sleeper trending — USABLE NOW
Reachable, free, no token, `{count, player_id}` — **player-resolvable**, so it
crosswalks with existing machinery. Zero integration cost.

---

## STOPPING RULE APPLIED
No further providers will be hunted. Sleeper trending is kept as the free signal
that costs nothing. odds-api.io and the-odds-api.com both await an account/key;
neither is a technical dead end and neither should be recorded as one.

## WHAT IS BUILT
- **Signal B** (`market_environment.py`) — implied team totals from total+spread,
  environment gap = model − market. No props, no conversion, no coverage artifact.
- **The conversion** (`market_convert.py`) — props → points via the shared scoring
  engine, component-matched, with the coverage shortfall measured (WR 23.3%,
  RB 29.1%, QB 47.5% uncovered by the four props).
- Neither is wired to any surface.
