# Draft Optimization Engine

Two tiers, no server:

- **Offline pipeline (Python, this folder)** — pulls Sleeper + nflfastR, blends
  projections, applies keeper adjustment, computes VORP and tiers, and emits
  `../public/draft_data.json`. Runs nightly in GitHub Actions.
- **Client engine (`../public/js/draft/`)** — loads that artifact, polls the
  Sleeper draft API live, and runs survival/VONA/composite scoring in-browser.
  The only latency-sensitive math is client-side, so a live draft never waits
  on a network round trip or a service being up.

## First run

```bash
cd league/draft
pip install -r requirements.txt

# Module 0 — import the league (writes config/league_config.json)
python sleeper_import.py 1374848328470102016

# Review config/league_config.json, then enter keepers in config/keepers.json
# Build the board
python build.py --league-id 1374848328470102016 --slot 4

# Or build from cached/fixture data with no network
python build.py --offline
```

## Keeper input (`config/keepers.json`)

Sleeper does not expose house keeper rules, so this file is maintained by hand:

```json
{ "teams": [
  { "draft_slot": 1, "keepers": [
    { "player_id": "4034", "name": "Christian McCaffrey", "position": "RB",
      "original_round": 2, "years_kept": 1 }
  ]}
]}
```

`original_round` is auto-recovered from the prior Sleeper draft when available
(see `original_rounds` in the config); set it explicitly to override.

## Tests

```bash
python -m pytest tests -q          # scoring, config, keepers, VORP, tiers
node tests/engine.test.js          # survival, VONA, composite scoring
```

The scoring tests check ten hand-computed half-PPR stat lines. The keeper tests
verify that a full keeper slate removes the right picks and shifts my pick
numbers correctly, and that a zero-keeper league reproduces raw ADP.

## Module status

| Module | Status |
|---|---|
| 0 League auto-import | ✅ |
| 1 Config schema + scoring | ✅ |
| 2 Projection blend + opportunity | ✅ (opportunity degrades gracefully) |
| 3 Keeper adjustment + true pick order | ✅ |
| 3b Keeper optimizer | ✅ engine built, UI panel pending |
| 4 VORP + iterative FLEX | ✅ |
| 5 Survival + live Bayesian update | ✅ |
| 6 VONA | ✅ |
| 7 Composite + live weights | ✅ |
| 8 Monte Carlo | ⬜ not built (A4 depends on it) |
| 9 Live sync | ✅ |

## Update build (Part A)

| Item | Status |
|---|---|
| Auto-import + league history chain | ✅ |
| Editable confirmation screen | ✅ Commish → War Room → League Setup |
| A1 manager behavioural models | ✅ `managers.py`, `config/manager_profiles.json` (hand-editable, `locked` respected) |
| A2 three-layer survival | ✅ `public/js/draft/survival.js` |
| A3 composite: KOV / bye / correlation | ✅ `public/js/draft/composite.js` |
| A4 Monte Carlo w/ profiles | ⬜ next (needs Module 8 built first) |
| A5 pick-pair optimisation | ⬜ |
| A6 regret view | ⬜ |
| A7 post-draft audit | ⬜ |
| Part B (in-season) | ⬜ |

### On ADP honesty in A1

Sleeper publishes no historical ADP and no free source does either. Two of the
six metrics (`reach_delta`, `bpa_vs_need`) need a value ordering, so they use
the player's *current* consensus rank as a proxy — which is biased, because a
player who busted ranks low today and makes whoever drafted him look like a
reacher. Both are flagged `proxy: true`, shrunk twice as hard as the others,
and the four ADP-free metrics carry the profile when the sample is thin.

### On survival composition (A2)

Layer 1 is unconditional; Layer 2 only models the picks from now to the target.
Blending those directly mixes two different quantities and miscalibrates every
number the tool produces. Layer 1 is therefore conditioned on current
availability, and beyond the window Layer 2 modelled, the two are **composed**
(a product of survivals) rather than blended — which is both correct and
monotone in pick number by construction.

Everything is config-driven; every magic number sits in `CFG` at the top of
`engine.js` or in `league_config.json`, with a comment explaining it.
