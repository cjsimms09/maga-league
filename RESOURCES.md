# RESOURCES — external repos/articles Cory has flagged, filed in one place

Purpose: Cory keeps sending links mid-conversation for a quick check. Every one of them
was getting reviewed once, in whatever session was open, with the notes buried in a
dated `PARKED.md` entry — no single place to look before asking "have we checked this
already." This file is that place. One row per resource: what it is, what was actually
checked (README only vs. real source), what's worth remembering, where the full
write-up lives if there is one.

**Rule for adding to this file:** read the actual source before writing a verdict, not
just the README/marketing description — every entry below says explicitly which it got.
A README-only pass is flagged as such and is not a substitute for a real read later.

---

## Reviewed — real source read, not just README

### `FantasyFootballAnalytics/ffanalytics` (R)
https://github.com/FantasyFootballAnalytics/ffanalytics

Mature, years-old, widely-used multi-source projection aggregator (~9 sources:
CBS/ESPN/FantasyPros/FantasySharks/FFToday/NumberFire/FFN/NFL/RTSports/Walterfootball).
- `add_uncertainty()` — turns cross-source spread into a per-player uncertainty score.
  Worth comparing against `PROJ-SD-DECISION-ARM.md`'s approach with fewer sources.
- `add_ecr()` — keeps Expert Consensus Rank as a SEPARATE input from the points
  average rather than folding rank-consensus into one blended number. Our composite
  currently blends ADP sources into one value; this pattern (keep rank-signal and
  points-signal apart, combine downstream) is a real, uncommitted idea for the
  composite.
- `projections_table(avg_type = "average"|"robust"|"weighted")` — "robust" is
  presumably an outlier-resistant average; read the source, README didn't specify.
- **The one thing actually adopted-worthy, checked against our own bug:** its
  floor/ceiling computation (`R/calc_projections.R`) is raw-point quantiles, same
  scale problem we had — but it separately computes an `uncertainty` score that is a
  real, shipped, years-old precedent for the fix already named here as
  "position-normalised ceiling" (already shipped 2026-08-13,
  `computeCeilingScales` in `engine.js`). Corroborates the fix, doesn't add a new one.
- Full write-up: `PARKED.md`, "FOUR EXTERNAL REPOS" (2026-08-14) and the TE/onesie
  re-check (2026-08-15).

### `jjti/ff` (ffdraft.app, Go, 72 stars, real users)
https://github.com/jjti/ff

Textbook VOR/VBD: `VOR = player's projection − (n+1)th-ranked player at that position`
(n = league starters), all in raw points. K/DST hard-zeroed (`starters = 0`), not
modeled at all. Also surfaces ADP velocity, bye-week-conflict, and handcuff flags as
board tags.
- **Less sophisticated than what's already shipped here, not more.** No FLEX-vs-bench
  distinction, no cross-position spread comparison — it structurally can't reach the
  TE/onesie bug this project chased for a week, because it never compares across
  positions at all. Confirms `vona()` is already ahead of this reference on the value
  side.
- One live, cheap idea not yet taken: **ADP velocity** (how fast ADP is moving across
  recent drafts) as a board tag — we ingest ADP already, this might be near-free to
  add, could feed survival-% work.
- Full write-up: `PARKED.md`, "FOUR EXTERNAL REPOS" (2026-08-14).

### `gtonic/nfl_mcp` (Python, MCP server)
https://github.com/gtonic/nfl_mcp — docs: `AGENT.md`, `docs/TECHNICAL.md`

Data-access server (matchups, FAAB, playoff odds, trade grading) — mostly Session B's
lane, not draft valuation. No valuation logic of its own to compare against.
- Publishes one concrete fallback rule worth knowing about: snap-share estimate off
  depth chart when real snap data isn't in yet — starter ≈70%, #2 ≈45%, others ≈15%.
  Directly relevant to the depth-chart dampening work done today
  (`own_projections_2026.py`) — a real external number in the same neighborhood as
  the multipliers used there, worth a real comparison later.
- Its own stated methodology: *"new signals ship as standalone tools first and only
  enter the projection formula after they earn it on the backtest."* Same discipline
  as this project's own Lab-gate philosophy — external validation the approach is
  sound, not a new idea.
- Full write-up: `PARKED.md`, "FOUR EXTERNAL REPOS" (2026-08-14).

### `mattgilgo/fantasy_football`
https://github.com/mattgilgo/fantasy_football

Per-position sklearn/XGBoost regression (QB/RB/WR/TE separately), benchmarked by MAE
against ESPN/NFL.com expert projections. Reported 2022 result: beat expert MAE on
QB/WR/TE, did not clearly beat on RB.
- Weakest fit of the four — never ranks across positions, so it can't hit the
  onesie/TE bug either (no cross-position comparison exists to get wrong).
- Loosely corroborates (does not prove) this project's own finding that RB is the
  hardest position to project. One more independent data point in the same
  direction, not a new method.
- Full write-up: `PARKED.md`, "FOUR EXTERNAL REPOS" (2026-08-14).

### `derekrbreese/fantasy-football-mcp-public`
https://github.com/derekrbreese/fantasy-football-mcp-public

MCP server for Yahoo Fantasy Football — lineup optimization, draft assistance, league
management.
- Position-normalization (`position_normalizer.py`): plain z-score
  (`(projection - mean) / std`), static formula `FLEX value = (vor * scarcity * 0.3)
  + (projection * 0.7)`, hand-picked scarcity constants (RB 1.0, WR 0.95, TE 1.05),
  no citation or backtest behind the numbers. **Less sophisticated than what's
  already shipped** — `computeCeilingScales` explicitly tested and rejected this
  exact class of naive z-score normalizer (it would have handed QBs a 2.35x boost,
  the defect it amplified) before landing on replacement-level ratio instead. Nothing
  to adopt.
- **One real, uncommitted idea, explicitly future work:** the "Player Enhancement
  Layer" — blends a stale preseason projection with actual recent performance (last
  1-3 weeks, 60/40 or 70/30 weighted), simple trend flags (BREAKOUT_CANDIDATE,
  TRENDING_UP, DECLINING_ROLE), zeroes projections on a detected bye week (same guard
  `isInactive`/`activeProjection` already does independently). Relevant to the
  in-season "learning engine" on the roadmap (`TODO.md`, "GENUINELY AFTER THE
  DRAFT") — no live season data exists yet to blend, so nothing to build now, but a
  real, citable technique for when there is.
- Full write-up: `PARKED.md`, 2026-08-15.

### `adamrubinsky/FantasyAgent`
https://github.com/adamrubinsky/FantasyAgent

CrewAI-based multi-agent draft assistant (Sleeper platform), README claims "VBD-based
auction values" — checked the actual auction-pricing source
(`platforms/sleeper/agents/sleeper_auction_crew_fast.py`), not just the README claim.
- **There is no VBD/replacement-level math in the code that runs.** `base_value`
  comes straight from FantasyPros rankings data (external, not computed). What
  actually adjusts price is a chain of hand-tuned multiplicative heuristics:
  ```python
  if stars_acquired < 3 and player.rank <= 10: adjusted *= 1.2   # pay up for stars
  elif stars_acquired >= 3: adjusted *= 0.85                      # conservative after
  if position in ("RB","WR") and pos_count == 0: adjusted *= 1.15 # need a starter
  elif position == "QB" and pos_count > 0: adjusted *= 0.5        # don't need backup QB
  elif position == "DEF": adjusted = min(adjusted, 2)             # never pay for D
  ```
- **One small, real corroboration:** `QB backup *= 0.5` is the same design instinct
  as this project's onesie discount and the wire-comparison bench-branch prototype
  (2026-08-15) — a third, independent source landing on "discount a backup QB hard."
  But it's a flat unmeasured constant with no wire/VORP backing it — weaker than
  what's already built here, not something to adopt. Confirms the direction, not the
  method.
- Nothing else in this repo (scarcity index, bench valuation, streaming logic,
  uncertainty modeling) beyond what's described above — checked, not assumed absent.

---

## Flagged by Cory, not yet reviewed (network-blocked from this sandbox)

Both hit `EGRESS_BLOCKED` from this environment — only GitHub-hosted domains and PyPI
are reachable here. Not reviewed; not summarized from guesswork either. If Cory wants
these read, paste the text/a screenshot, or have a session with open egress fetch them.

- https://bleacherreport.com/articles/1281999-explaining-the-value-of-mathematics-in-fantasy-football-draft-strategy
- https://www.sas.upenn.edu/~baron/journal/22/220318/jdm220318.html (Journal of
  Decision Making, hosted at UPenn — the Google AI Overview screenshot Cory sent
  2026-08-15 cited a source claiming to be from this journal; that specific claim was
  never independently verified, see `PARKED.md` 2026-08-15 for the full honest
  account of that mix-up)

---

## What this file is NOT

Not a substitute for the full `PARKED.md` write-up on each — those have the complete
reasoning, the code snippets, and the "what this is NOT" caveats. This file exists so
"have we looked at X" has a five-second answer; the real detail is one grep away.
