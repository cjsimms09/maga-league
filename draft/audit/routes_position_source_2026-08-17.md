<!-- TERRITORY: A -->
# A GAP OF OURS, RECORDED AS A GAP OF THEIRS

**2026-08-17.** Cory: *"are we sure there aren't more gaps like this in our data?
… what other data are we missing?"*

---

## THE CLAIM THAT WAS WRONG

`fetch_routes.py` covered 2021-2024. Its header explained the missing season:

> 2025 raises `NotPublished` — nflverse serves no weekly data for it, which is
> the SAME 404 that leaves the season ungradeable in the backtest.

**The 2025 participation file is served.** HTTP 200, 49,094,943 bytes, checked
rather than assumed:

| season | `pbp_participation_{season}.csv` |
|---|---|
| 2023 | 200 · 49,967,956 bytes |
| 2024 | 200 · 49,688,308 bytes |
| **2025** | **200 · 49,094,943 bytes** |

What 404s is `import_weekly_data(2025)` — verified, it really does 404 — and this
file used that endpoint *only to look up positions*. So a season of routes was
absent because of **our** choice of position source, filed under **their**
publication schedule. Nobody re-tested it because the explanation was plausible
and already written down.

## AND THE POSITION SOURCE WAS THE WEAKER ONE EVERYWHERE

Checking the 2025 story turned up the larger finding.
`import_weekly_data` has a row only for players who **recorded a statistic**.
Measured against the 1,708 distinct players who actually appear on the field in
the 2024 participation file:

| | classified | unknown | route positions found |
|---|---|---|---|
| weekly stats (old) | 611 | **1,097** | 494 |
| seasonal rosters (new) | **1,708** | **0** | **550** |

**56 route-runners per season were being dropped — not mis-classified, dropped.**
Every one of them a skill player who was on the field for pass plays and never
recorded a counting stat: the blocking tight end, the decoy, the man who ran
twenty routes for zero targets. That is exactly the population a *routes* metric
exists to see, and it was the population the metric could not see.

The `on_field_without_a_position` counter had been sitting at ~400 per season in
every stored file, read as an inherent limit of the join. It was a property of
the source. **A number that looks like an inherent limit is worth measuring
against a second source before believing it.**

## WHAT THE REBUILD DID

All five seasons rebuilt from the roster source. `position_source` is now stamped
into every file so a consumer can tell which population a count was taken over
without dating the file.

| season | players | routes | unclassified on field |
|---|---|---|---|
| 2021 | 524 → **561** | 104,357 → 104,597 | 430 → **0** |
| 2022 | 504 → **539** | 101,347 → 101,697 | 407 → **0** |
| 2023 | 476 → **511** | 103,115 → 103,086 | 403 → **0** |
| 2024 | 491 → **527** | 99,495 → 99,768 | 427 → **0** |
| **2025** | **513 (new)** | **97,898 (new)** | **0** |

**Control held exactly.** Cooper Kupp 2021, the figure this fetcher was validated
on when it was written: **775 routes / 234 targets / TPRR 0.3019** — unchanged to
four decimals.

## WHAT IT COST, NAMED RATHER THAN NETTED

Four players are excluded by the roster source that the weekly source included.
All four are position-conversion or hybrid cases where the NFL roster designation
and the fantasy designation disagree:

| season | player | routes | targets | roster says | weekly says |
|---|---|---|---|---|---|
| 2023 | **Taysom Hill** | **239** | **40** | QB | TE |
| 2021 | Feleipe Franks | 5 | 0 | QB | TE |
| 2023 | Malik Cunningham | 6 | 0 | QB | WR |
| 2024 | Ben VanSumeren | 2 | 1 | LB | FB |

Three are noise. **Taysom Hill is a real loss** and is recorded as one: he runs
routes, he is a fantasy TE, and the metric no longer sees him in 2023. Net across
four seasons the store gained ~146 players and lost 252 routes out of 408,000.

**An `import_ids`-first precedence was tested and rejected.** It would have
recovered Hill, and it also promoted two long snappers to TE (00-0030615,
00-0035118) and a cornerback to WR. Trading a known small loss for an unknown
class of false inclusions is the worse deal, and special-casing Hill by name is
the hand-tuning this repo refuses. The loss stays, written down.

## WHAT IS STILL TRUE

Routes remain **a proxy and an upper bound** — every skill player on the field
for a pass play is counted, so a blocking tight end is included. nflverse
publishes no true routes feed. That limitation is unchanged and is not what this
note fixes.

`weekly-routes.yml` (Wed 11:30 UTC) now has a 2025 season to keep current
instead of skipping it.
