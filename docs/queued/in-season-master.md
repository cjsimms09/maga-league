# IN-SEASON MASTER — The Complete Season Arsenal

This consolidates every in-season capability into one build order, gated to the NFL calendar. Where a committed spec already exists (in-season rankings, Part 11 learning loop, Part 12 watchdog, season-readiness kit), this document sequences it — re-read the committed spec before building; do not re-derive. Where no spec exists, this document is the spec.

Design principles for everything below, non-negotiable:
- **Adaptable:** every threshold in config; every model re-fits or re-blends weekly as real data accumulates; ruleset-hash awareness so a mid-season rule change trips the watchdog, never silently corrupts
- **Intuitive:** every output leads with a plain-language sentence and a recommended action; numbers support, never lead. The Weekly Brief is the front door — if a tool's output doesn't surface there, it doesn't exist to me.
- **Graded:** every recommendation writes to the prediction ledger at decision time and gets graded on its schedule. A tool that can't tell me whether it's working doesn't ship.
- **Robot-tested:** each tool gets a simulated-season scenario (fixture weeks flowing through the real code path) before its calendar gate.

---

## PHASE 1 — Foundation (build immediately post-draft, live by Sep 8)

### 1.1 In-season rankings substrate
The committed spec (weekly + RoS dual horizon, prior-to-observed shrinkage blend with the role-change override, matchup factor, bye/injury zeroing, my-roster/rostered/FA split). Everything below reads from this. Build first, exactly as committed.

### 1.2 Waiver Engine — Lite now, Full by week 3
Lite per the season-readiness spec (Tuesday detection, stealth score, RoS-over-worst-starter value, bid bands, ledger-logged). Then upgrade to Full by week 3 waivers:
- Empirical competing-bid model from league transaction history + live budgets (who bids, how aggressively, on which positions)
- Bid recommendation as a curve ("18% → 71% win, 24% → 88%") naming the realistic competition from dossiers
- Vacated-opportunity attribution down real depth charts on injury news
- Keeper-forward flag adapted to OUR flat-cost rules: a waiver add's value is this-season-only (next year he'd cost a round 1-3 pick like anyone), EXCEPT when he's plausibly a top-30 player next year — flag only those as keeper-relevant. No phantom late-round keeper value.

### 1.3 The Weekly Brief — the front door
Per the season-readiness spec: Tuesday-generated, 3-minute phone read, containing the waiver card, matchup outlook, lineup flags, shadow standings, one intel note, system health. Add: a Thursday micro-brief (injury-report deltas affecting my lineup, close calls restated with updated data) and a Sunday-morning inactives sweep alert (any starter OUT/doubtful → push notification with the recommended pivot).

### 1.4 Opponent capture from snap one
Season-readiness item 4 / Part 11 L4 capture core: weekly lineup efficiency, zombie starts, bench points, transaction cadence, FAAB burn — auto-appended to all nine dossiers, era-tagged. Capture-only now; analysis surfaces land in Phase 3.

## PHASE 2 — The Weekly Decision Stack (live by week 2)

### 2.1 Lineup Optimizer v1 (pre-quantile, honest about it)
Win-probability-first even before the quantile model: my players' weekly distributions from projection + historical positional variance, opponent's projected lineup and distribution, P(win) estimate, and start/sit calls framed as win-probability deltas, not point deltas ("Start X over Y: −1.1 projected, +2.8% win — you're a 31% underdog, take the ceiling"). Flag every call within ~1% as a coin flip — say "doesn't matter" when it doesn't. v2 (full quantile distributions + correlation copula + favorite/underdog asymmetry per the original B2 spec, with the underdog acceptance test) ships when the quantile model lands — target week 4-6. Every start/sit logged and graded weekly.

### 2.2 Streaming engine (elevated priority — the 10-team format correction says streaming is worth MORE here)
QB/TE/K/DST weekly streaming from matchup data: opponent points-allowed-by-position (opponent-adjusted as data accumulates), Vegas-implied totals once wired (Phase 3.2), home/road, pace. Output: this week's best streams at each onesie position vs my current option, with next-week lookahead ("stream X this week, Y is the week-9 hold"). In this league the wire always has a startable onesie — the tool's job is making the swap decision take ten seconds.

### 2.3 Playoff odds + leverage
Original B3 spec: Monte Carlo the remaining schedule from every team's distributions → playoff probability, seed distribution, and LEVERAGE = ∂(odds)/∂(win this week), displayed every week. Leverage is the multiplier on everything: FAAB aggression, lineup variance posture, trade urgency. Weeks where a loss barely matters and weeks that decide the season get named as such in the brief.

## PHASE 3 — The Exploitation Layer (live by week 4)

### 3.1 Trade Engine (radar → full)
Season-readiness radar first (buy-low/sell-high from opportunity-vs-production gaps, desperation index, dossier notes attached). Then full B5 by week 4: two-sided valuation adjusted for each team's specific holes, mutual-benefit trade finder (only proposals improving BOTH teams' playoff odds get surfaced — those get accepted), auto-drafted pitch framed around what THEY gain, keeper-window awareness under flat-cost rules (contenders vs eliminated teams value next-year top-30 players differently at the deadline). Every proposed trade logged; accepted/declined/outcome graded.

### 3.2 Vegas layer
Part 3 §2 as committed: implied team totals into weekly projections (share × pie), game-environment flex on correlations, line-move alerts (>3 points = news the projection hasn't absorbed). Wednesday pull for waivers, Sunday-morning pull for lineups, both cached and stamped.

### 3.3 Fragility map + handcuff board
Part 3 §5: who inherits volume if each startable player goes down, precomputed league-wide; my Sunday-morning claim list pre-written before news breaks; opponent fragility ranking (whose season dies with one injury) feeding the trade radar's desperation index.

### 3.4 Dossier surfaces go live
The capture from 1.4 starts rendering: efficiency league table, checked-out detector (transaction cadence + eliminated-team lineup behavior), the "who accepts lazy trades" flag. By the deadline this is data, not vibes.

## PHASE 4 — The Compounding Layer (September–January, per committed specs)

- **Quantile value function** → upgrades 2.1 to v2, re-grades the backtest, re-runs the strategy certification and Section A fits on real projections, re-evaluates MCTS on the real board (V-primary, the 100/100 check) — the September centerpiece, already specced
- **Shadow rosters** score all season (already gated pre-draft); shadow WAIVER policies v2 decision at week 6 — if added, each shadow strategy also makes weekly waiver claims under its policy, deepening next year's certification
- **Learning loop completion** (Part 11 full): grading passes on schedule, the hypothesis ledger active, gated-change machinery tested with a planted noise proposal, **The Annual on a January cron** producing the season review + 2027 proposals with evidence
- **Rule-change watchdog** (Part 12): settings hash checked every pipeline run and session start — a commissioner mid-season scoring tweak trips a red banner, never a silent corruption. Keeper cost model included in the hash.
- **Playoff-weeks mode** (weeks 15–17): the brief shifts posture automatically — leverage is absolute, streaming looks two weeks ahead, opponent-specific game-planning against my actual playoff opponent's roster and their dossier tendencies

## CALENDAR GATES (hard, tracked in STATUS.md's Season Readiness section)
- **Sep 8:** 1.1–1.4 live and robot-tested (week 1 waivers)
- **Sep 15:** 2.1 v1 + 2.2 live (week 2 lineups)
- **Sep 22:** 2.3 + 3.1 radar live (week 3 — the panic window opens)
- **Oct 6:** 3.1 full + 3.2 + 3.3 live (week 5)
- **Quantile/Phase 4:** as committed, no calendar pressure except the Annual's January cron
- Anything at risk of missing its gate: ship the honest lite version at the gate, upgrade behind it. A crude tool on Tuesday beats a perfect tool on Thursday — waivers don't wait.

## THE TEST OF THE WHOLE THING
By week 6 my in-season routine should be: read the Tuesday brief (3 min), act on the waiver card, glance at Thursday's micro-brief, confirm Sunday's alert. Four touches, ~10 minutes weekly, every decision logged and graded. If any tool requires more of me than that to deliver its value, it's built wrong — fix the surface, not my routine.
