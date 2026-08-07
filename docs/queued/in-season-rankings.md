# Post-Draft Build: In-Season Weekly + Rest-of-Season Rankings

**Do not start this before August 23.** This is the first post-draft, post-freeze item. Build window: Aug 23 – Sep 9, done before Week 1 kickoff.

## What it is

A daily-updating rankings artifact and page with two horizons per player:
- **This week:** projected points for the upcoming NFL week, matchup-adjusted, bye/injury-aware
- **Rest of season (RoS):** per-game projection × remaining games, updated as real usage accumulates

This is deliberately rankings-first: it's the substrate the waiver engine (Part 3 detection + stealth), the lineup optimizer (B2), and the trade valuations all sit on. Build the rankings cleanly and those become consumers, not siblings.

## Reuse — do not rebuild any of this

- Scoring engine (verified) — all projections in league points via the config table
- Opportunity metrics pipeline — same nflverse play-by-play pull, now weekly
- VORP/replacement machinery — RoS rankings ship with value-over-replacement, same baselines
- Artifact + provenance pattern — same loud-degradation rules; a rankings artifact that couldn't fetch this week's data says so in red, never silently reuses last week
- The crons: nightly `0 8 * * *`, Tuesday `0 11 * * 2`, Sunday `0 13 * * 0` already exist. Wire them; don't duplicate them.

## The three new pieces

### 1. In-season usage ingestion
Weekly: pull the current season's play-by-play/participation as it lands (same nflverse release-asset path already proven), compute the same opportunity metrics (target share, opportunity share, snap share, RZ/GL touches) on trailing windows: last 3 weeks and season-to-date, both kept.

### 2. The prior-to-observed blend — the one real design decision
Per-game projection = shrinkage blend of preseason prior and observed rate:

```
w_obs = games_played / (games_played + K)        # K default 4, config
proj_per_game = w_obs × observed_rate_projection + (1 − w_obs) × preseason_prior
```

- `observed_rate_projection`: current opportunity metrics pushed through the same opportunity→points mapping used at draft time, with the trailing-3-week window weighted 60/40 over season-to-date (role changes matter more than history)
- Week 1–2: mostly prior. Week 8+: mostly observed. Print `w_obs` in the artifact per player — no invisible blending.
- Role-change override: if snap/route share jumps >15pp over the 3-week baseline (the Part 3 detection threshold), floor `w_obs` at 0.5 for that player and flag it. A backup who just became the starter should not be priced on his August projection.

### 3. Weekly horizon
- **Matchup adjustment:** opponent points allowed per game to the position, computed from the same play-by-play, as a multiplicative factor clamped to ±20%. Opponent-adjusted EPA versions (Part 3 §9) are a later upgrade — ship the simple version, label it.
- **Bye/inactive zeroing:** bye weeks from the schedule; injury status from Sleeper's `/players/nfl` (`injury_status` field — OUT/IR/PUP → 0 for the week, Questionable → flag, don't discount silently). This is a new consumer of an endpoint already ingested.
- Weekly = per-game blend × matchup factor, or 0 with a stated reason.

## Output

- `rankings.json` artifact: per player — weekly points, RoS points, RoS VORP, `w_obs`, matchup factor, injury/bye state, trailing-usage deltas, provenance
- A rankings page: sortable by weekly or RoS, filterable by position, with **my roster / rostered elsewhere / free agent** status from Sleeper rosters (this split is what makes it waiver-useful on day one, before the full waiver engine exists)
- Freshness stamp per the standing rules; red banner if any source failed

## Explicitly out of scope (they come later, as consumers)
Stealth scoring vs trending-adds, FAAB bid modeling, lineup win-probability, Vegas totals, opponent-adjusted SOS. Do not let this build grow into them.

## Ship checks
- A player on bye shows weekly 0 with the reason, and full RoS
- A player who gained a starting job in week N shows `w_obs ≥ 0.5` and the role-change flag from week N+1
- Hand-verify one player's weekly number end to end: usage → per-game → matchup factor → points, arithmetic shown
- Tuesday's artifact differs from Monday's after a real week of games; the diff is explainable
- Provenance: unplug one source in a test build → red banner, not stale-data-as-fresh
