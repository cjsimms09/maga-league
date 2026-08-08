# LAB RUN-STATE — audited 2026-08-08

_HEAD at audit: `41ca3d7`. Regenerate by re-running the checks in this file._

## THE HEADLINE, and it is not what the question assumed

**The Lab is running. It has exactly ONE implemented experiment.**

`draft/backtest/lab.py` → `EXPERIMENTS = [{"id": "L0-lineup-ceiling-money",
"runnable": True, ...}]`. That is the entire list. `lab-results.json` contains
one result. Everything else in `LAB-REGISTRY.md` — 1–31, and 33/34/35/36/38/39 —
is a **specification in a markdown table with no code behind it**, marked
`spec · no wf` in the registry's own status column.

So "fire everything with satisfied dependencies" has nothing to fire, and "the
Lab should be saturated" cannot happen: there is no queue of built-but-unrun
experiments. **The blocker is BUILD, not TRIGGER.** Saying otherwise would
describe a Lab that does not exist.

## Is it firing?

| question | answer |
|---|---|
| did the Lab run today? | **yes** — `f48f321`, report stamped `2026-08-08T18:34Z` |
| did the Netlify deploy gate stop it? | **no.** `netlify-ignore.sh` governs Netlify builds only; GitHub Actions never consults it |
| does it run on every push? | **no, by design** — `lab.yml` is path-filtered to the backtest sources it grades. Correct while one experiment exists; revisit when there are many |
| schedule | `30 3 * * 1` (Mon 03:30 UTC), ahead of the 04:00 self-audit |

## ⚠️ BUT SOMETHING DID SILENTLY STOP CI, AND IT WAS SELF-INFLICTED

Two commits today carry **`[skip ci]`** in the message:

- `7858343` — Netlify policy + board version counter + post-draft audit
- `41ca3d7` — the intervention-rate measurement

`[skip ci]` is a **GitHub Actions** convention, not a Netlify one. GitHub honours
it on the head commit by skipping **every workflow for that push** — CI, the test
suites, and any Lab run those pushes would have triggered. I wrote it while
building the Netlify deploy gate, conflating two unrelated budgets: Netlify build
minutes are scarce; **GitHub Actions is free and does not compete with them.**

The commit messages for both claimed suites were green — true locally, and they
were never re-verified in CI.

**Fixed:** `[skip ci]` removed from `netlify-ignore.sh`'s vocabulary; only
`[skip netlify]` / `[netlify skip]` gate deploys. `netlify-ignore.test.sh` now
asserts that `[skip ci]` is *not* a Netlify marker, so the conflation cannot
return. Nothing in this repo should emit `[skip ci]` again.

## THE RUN TABLE

| exp | what it is | last fired | state | real blocker |
|---|---|---|---|---|
| **L0** | lineup-ceiling money ($445–595/team/season) | **2026-08-08 18:34Z** | ✅ **RUNNING** | none |
| **33** | projection source bake-off | **never** | ❌ **NOT IMPLEMENTED** | needs building + CI egress (nflverse/FFC). Sleeper's historical projections may be unretrievable — spec says run the other three arms and say so |
| **34** | recommendation-vs-market scoreboard | **never** | ❌ **NOT IMPLEMENTED** | needs building; bridge gate is green, so no data blocker. ~36 decisions — underpowered by construction |
| **35** | lineup-policy capture rate | **never** | ❌ **NOT IMPLEMENTED** | needs building. **Data verified present** — `players_points` for every rostered player, every week, 2023–25. Requires the `AsOfDataStore` path so a future read raises `TimeTravelError` |
| **36** | ADP-efficiency audit + tier calibration | **never** | ❌ **NOT IMPLEMENTED** | needs building + egress. Pooling rules must be declared **before** seeing numbers |
| **38** | decision-density value | **never** | ❌ **NOT IMPLEMENTED** | needs building. Historical arm ≈6 observations, near-powerless; Monte Carlo arm carries it |
| **39** | paid-source value test | **never** | ⛔ **GATED on 33** | correctly gated; also a likely archive blocker |
| 1–31 | the earlier registry | mixed | mostly `spec · no wf` | each needs building |

## What this means for 33 and 35

They are the two results named as most wanted, and neither has any code. They are
**not blocked by data** — 35's inputs were verified present on 2026-08-08, and
33's are reachable from CI. They are blocked by **not having been built.**

That is a better position than a data gap, because it is fixable by work rather
than by waiting. But it means neither can report tonight, and no amount of
triggering will produce them.
