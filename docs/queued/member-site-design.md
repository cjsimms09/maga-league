# MEMBER-SITE DESIGN CHARTER — the pass after the in-season tools pass

Filed 2026-08-16 from Cory's directive, verbatim where it matters. Sequenced
THIRD: war room (done, 2026-08-15) → in-season commissioner tools (launched
2026-08-16) → **this**. The pass that executes this charter inherits the
war-room token layer, the explainer contract, and the extract-the-renderer
fidelity method.

## The goal, in Cory's words

> "The site should be fun, engaging, modern, and useful. The goal is to get
> people to use this site instead of sleeper for everything but setting their
> lineup. Trying to make a better way to track matchups, make side bets,
> engage. Open to ideas that will help this that aren't corny.. the site
> should be useful and give people access to whatever they want about the
> league."

Success test: a member opens THIS site on Sunday, not the Sleeper app.

## Hard access rule (Cory, verbatim)

> "their odds of winning this week (**sleeper info only, not our model for
> anyone but me**)"

Member-facing win odds derive from SLEEPER's projections only. Our own model
(proj_ownmodel/own_v4, the analyzer, champodds, the edge advisor, the pool
advisor) stays commissioner-gated — ACCESS-RULE.md already draws this line;
this pass must not blur it. The existing `/watch` sweat meter already runs on
the Sleeper-fed projection surface, which is why it is league-visible.

## Named features (Cory's list, mapped to what exists)

1. **Matchup tracking, this week and other weeks.** `/matchup` exists (h2h
   history, one-tap bet); needs week navigation (past + upcoming schedule
   view), and the scoreboard already carries locked-bet chips. Make the
   matchup THE landing experience.
2. **Member win odds, Sleeper-fed.** whatwatch's probability core
   (LO.pWin over Normal(proj, sigma)) is the mechanism; surface a win-prob
   line on /matchup and the scoreboard, labeled as Sleeper-derived.
3. **Sunday/Monday night swing tracker.** `/watch` (whatwatch.js) already
   does the live sweat meter + "what you need" per matchup, dormant
   off-hours. Cory's extension: **league-wide swing framing** — "what to
   watch that could swing a matchup" across ALL games, so everyone tracks
   everyone's matchups. Concretely: per remaining NFL game, which league
   matchups it can still flip, whose players are left, and the one-line
   stake ("if the MNF total runs hot, Dylan passes Sam"). This is the
   feature most likely to beat the Sleeper app on a Sunday night.
4. **Side bets + pick'em** — card grammar shipped 2026-08-16; this pass
   polishes flow, not mechanics.
5. **More charts/visuals of data** — additive, never replacing the data
   they draw ("not to replace" — visuals accompany). The war-room chart kit
   + validated palette is the tool.
6. **Layout/organization.** "Could be a little more intuitive... better
   presented or organized, it's not terrible but think it could be better..
   a little more modern look but keep the hardcore American theme."
   Modernize inside the identity — navy/gold/eagle stays; generic-SaaS
   look is a failure.

## ORDERED FEATURES (Cory, 2026-08-16: "Tuesday matchup preview is cool,
yes. Week nav yes. Charts yes, records watch yes, the races yes")

The five below moved from ideas to ordered scope — the member pass builds
them, not just considers them:

1. **Tuesday matchup previews** — auto-generated per game: all-time h2h,
   streaks, last meeting, rivalry label (h2h.js + rivalries.js).
2. **Week navigation on matchups** — this week, any past week, upcoming
   schedule ("when do I play Michael again" lives here, not Sleeper).
3. **Charts, additively** — war-room chart kit + palette beside the data,
   never replacing it.
4. **Records watch** — live chips when someone approaches a franchise
   record (weekly high, bad-beat, blowout — history-data carries them).
5. **The races** — playoff race / points crown / toilet race, one page,
   week-over-week movement (standings-movement.js).

## Engagement ideas on file (grounded, not corny — each builds on real data)

- **The races, as races**: playoff race / points crown / toilet race with
  week-over-week movement (standings-movement.js exists) — one page where
  every member finds a race they're still in.
- **Records watch**: live chips when someone approaches a franchise record
  (weekly high, worst blowout, bad-beat — history-data has the records).
- **Matchup preview cards**: Tuesday-morning auto-preview per matchup —
  h2h all-time, streaks, last meeting, the rivalry label where one exists
  (h2h.js + rivalries.js carry all of it).
- **Sweat-sharing**: the watch panel's per-matchup sweat lines double as
  the league-wide Sunday screen; a member's own game pins on top (already
  the panel's rule).
- **Phone-first** for everything member-facing (doctrine §7: desktop is
  Cory's surface for commissioner tools; members live on phones).

## Non-goals

- Lineup setting stays on Sleeper (Cory's explicit carve-out).
- No fabricated numbers anywhere member-facing; the no-manufactured-odds
  rule applies to every surface this pass touches.
- Do not expose commissioner tools or our-model numbers to members.
