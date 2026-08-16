# Member-Site Design Pass — 2026-08-16

The third and final pass of Cory's ordered design sequence: war room
(2026-08-15) → in-season commissioner tools (2026-08-16) → **this**. Charter:
`docs/queued/member-site-design.md`. Cory's goal, verbatim: *"The site should
be fun, engaging, modern, and useful. The goal is to get people to use this
site instead of sleeper for everything but setting their lineup."* Success
test: a member opens THIS site on Sunday, not the Sleeper app.

The five ORDERED features (Cory: *"Tuesday matchup preview is cool, yes. Week
nav yes. Charts yes, records watch yes, the races yes"*) all shipped, plus the
charter's named features (Sleeper-fed odds line, the league-wide swing layer,
layout/nav modernization).

## The hard access rule — held, and fail-armed

Cory, verbatim: *"their odds of winning this week (**sleeper info only, not
our model for anyone but me**)."*

The member win-odds mean is **`proj_sleeper`** — Sleeper's own season
projection on the board artifact — and never `proj_mean` (which carries our
capped opportunity adjustment; `draft/projections.py blend()`) and never
`proj_ownmodel`. The probability core is the /watch panel's mechanism reused
verbatim (`LO.pWin` over Normal sums, position sigmas from realized league
history) — `src/routes/memberweek.js` documents the mechanics in place.

`member_access_rule.test.js` is the fail-arm (53 checks): a tripwire
`proj_ownmodel` value seeded on **every** board player appears on **no**
member page; the rendered odds line **does not move** when `proj_ownmodel`
moves NOR when `proj_mean` moves (proved by rendering twice); the four
commissioner tools still 403 a member; the commissioner report strings never
leak; every odds surface names Sleeper on its face.

## Evidence — before / after (committed, draft/audit/screens/, `ms-` prefix)

Captured by `draft/tests/shots-member.js`: the real app on a temp store,
seeded mid-season Sunday (week 8) **through the docs the app actually reads**
(sleeper-cache, players-cache, frozen weekpoints/pickem docs, the schedule
doc, a scratch `DRAFT_DATA_PATH` board) — logged in as a **non-commissioner**
(David), phone 390 FIRST (doctrine §7: members live on phones), desktop 1440
second. Zero horizontal overflow and zero console errors asserted on every
capture, both runs. Two worlds per run: live Sunday, and the same week
pre-kick (`*-prekick-*`) for the surfaces that only exist before kickoff.

| Page | Before | After |
|---|---|---|
| Home | `ms-before-home-{phone,desktop}` | `ms-after-home-*` |
| Matchup (live / pre-kick) | `ms-before-matchup-*`, `ms-before-matchup-prekick-*` | `ms-after-matchup-*`, `ms-after-matchup-prekick-*` |
| Matchup, past + future week | `ms-before-matchup-{past,future}-*` (before: the week param was ignored) | `ms-after-matchup-{past,future}-*` |
| Scoreboard (live / pre-kick / past) | `ms-before-scoreboard-*` | `ms-after-scoreboard-*` |
| Watch (rehearsal) | `ms-before-watch-*` | `ms-after-watch-*` |
| The Races | `ms-before-races-*` — **the 404 it was** | `ms-after-races-*` |
| Team | `ms-before-team-*` | `ms-after-team-*` |

## The eight deliverables

### 1. Tuesday matchup previews (ordered)
`MW.previewFor(aName, bName)` reads the same box-score archive `/rivalry`
reads (h2h.js, by name — works offline and pre-season): the all-time lead
line, the current streak, the last meeting with its score, playoff meetings.
Rendered by one partial (`views/partials/_preview_line.ejs`, neutral voice) on:
every **pre-kick scoreboard card** (pre-kick, this page IS the Tuesday
preview; the strips stand down when real points land and the live chips take
over), the **spectator matchup**, both **week views** (every card on a past or
future slate), and the **home hero** (the record you're playing for, on the
landing page). The rivalry label was already billed on cards (`RIVN.rivalryFor`)
— previews add the record beneath it, not a second billing. A name the
archive can't place **refuses** (`null`) — a lookup failure is never rendered
as "first meeting" (h2h.js's own rule, kept).

### 2. Week navigation (ordered)
`/matchup?week=N` and `/scoreboard?week=N`, plus the week strip
(`_week_strip.ejs`) on both pages and the **Your Season** card
(`_season_sched.ejs`) on every matchup view — *"when do I play Michael
again"* is a row in that card, answered by name.
- **Past weeks** read the docs the app already freezes (`pickem-slate:` +
  `pickem-points:`/`weekpoints:`) — results, full slate, the trash thread as
  it stood (read-only), previews on every card. A week that was never frozen
  says so.
- **Upcoming weeks** read a cached schedule doc (`schedule:<league>:<season>`)
  refreshed best-effort off Sleeper's posted future-week matchups
  (`MW.futureSchedule`): 7-day TTL, and an outage costs **one** fetch timeout
  per six hours (first dead week aborts the sweep; the failure is remembered)
  — the sleeper.bundle negative-cache lesson applied. No doc → *"schedule
  isn't posted yet"* — **never a guessed pairing**.
- Sleeper's API is unreachable from this sandbox; everything above is
  store-doc-driven and tested through the stubbed-bundle pattern.

### 3. Charts, additively (ordered)
- **Season Trend** on /team: the viewer's weekly scores from the frozen week
  docs as an SVG bar chart in the war-room chart ink (navy magnitude, the
  league-median tick per week, hairline grid, direct labels) — **and the same
  numbers stay on the page as its table** (score / median / week's best),
  per the charter's "additive, never replacing".
- **The races** draw odds meters and points-share bars beside the records
  they summarize; the standings numbers stay printed on every row.
- No new series color anywhere — the validated `--wr-chart-*` ink only, so no
  new palette validation was required (the dataviz method's checks were run
  by the war-room pass that established this ink).

### 4. Records watch (ordered)
`src/routes/recordswatch.js`, read against the same records book the History
page renders (`HIST.build().records` — never re-derived). **Dormant by
construction** — a normal week renders nothing (pinned). The honesty rules are
the module's spine:
- a live **score** past the book's No. 5 is a fact-in-progress (scores only
  rise) and may be stated plainly; near-misses print both numbers so the
  reader can subtract;
- a live **margin** always says **IF IT HOLDS** (margins shrink);
- **bad beat** and the **stinker** only exist at final — they render as
  completed-week banners on the home page (frozen-doc-driven, works offline),
  never live.
Surfaces: chips atop /scoreboard while games run; "Into the book" banners on
home after a week finals, linking the record book.

### 5. The races (ordered)
`/races` — league-visible, in the nav, one page, three races so **every
member finds one they're in**, with the viewer's own line on top ("You sit
4th · inside the playoff line · 2nd in points…"):
- **Playoff race**: ranked rows with the cut line drawn, odds meters (the
  same seeded Monte-Carlo estimate the standings column carries, labelled
  *"running estimate off record + points"*), week-over-week odds arrows off
  the `playoff-odds:` snapshots, rank-movement arrows off the frozen last
  week (`MOVE.rankMovement` — offline-capable), and 🔒/❌ labelled as
  *"proved from the arithmetic, not sampled"*.
- **Points crown**: PF race, share-of-leader bars, gap to the crown.
- **Toilet race**: bottom four, worst first, "N wins clear" / "holding the
  toilet", movement arrows.

### 6. Sleeper-fed win odds (charter feature 2)
`MW.matchupOdds`: per-starter Sleeper weekly numbers (proj_sleeper/17 through
proj_feed's own zeroing ladder — bye/OUT → 0, absent → **refusal**), position
sigmas from realized history, `LO.pWin`. On /matchup (meter + projected
totals) and every pre-kick scoreboard card. Labelled on its face: *"from
Sleeper's projections … (season rate), pre-kick"*, and the symmetric K/DEF
exclusion is narrated (*"K/DEF not projected by Sleeper — left out of both
sides"* — data-derived, so a future board that projects them stops excluding
by itself). **Pre-kick only**: once a point is on the board we cannot see who
has played (the per-player live feed is A's parked work), so the line stands
down rather than sit stale beside a live score — pinned both ways. A refusal
renders nothing: no manufactured odds.

### 7. The league-wide swing layer on /watch (charter feature 3)
`WW.gameStake(aId, bId, ctx)` extends whatwatch.js: re-rank the real table
under each result of THIS game, holding everything else fixed — never vibes.
The one-line stake per game: *"playoff-line game — the winner sits 4th,
inside the top 4; the loser falls out"*, *"the loser holds last place — the
toilet is on the line"*, *"the $100 lead (Michael) is riding in this one"*.
The swing-board header counts **games** (not per-owner rows — the panel
arrives doubled). Per-NFL-slate grouping ("which league matchups can the MNF
slate still flip") needs the per-player feed the panel already declares
missing (`remainKnown`); `gameStake` takes the game as a pair so that
grouping layer calls it unchanged the week A's feed lands.

### 8. Layout / navigation modernization (charter feature 6)
- **The phone tab bar takes its season shape**: Office · **Matchup** ·
  **Scores** · Finances · Locker. Scores (the whole slate — the Sunday
  screen) replaces My Team in the five; Team stays one tap away (matchup
  footer + More). The Races joins the nav; the desktop bar carries it too.
- **Dead ends fixed**: the matchup page now exits to the scoreboard as well
  as the team page; week views cross-link matchup ↔ scoreboard at the same
  week; the races link from home.
- **`.btn.gold` stops rendering crimson** (the in-season pass's flagged
  handoff, this pass's decision): the light theme painted `.btn.gold`
  `var(--red)` — every save/send/post wore the alarm color. The token
  doctrine (red = alarm only, gold = money only) now runs the whole button
  language: primary (`.btn`, `.btn.gold`) = **solid navy authority** (the war
  room's own `wrv-take` ruling applied site-wide), secondary (`.btn.navy`) =
  hairline navy, destructive (`.btn.ghost`) = the only red button.
- Identity kept: navy/gold/eagle everywhere, gold spent on money only
  (the $100 race bar, the money chips), red spent on alarm only (the playoff
  cut line, records never wear it). No generic-SaaS drift: the new component
  grammar extends `warroom.css` ("extend, don't fork"), loaded page-scoped on
  the member surfaces via the header's existing pattern.

## The fidelity suites — what the certainty rests on

**130 new checks, all green**, three suites (all `// TERRITORY: A`), plus the
capture harness:

| Suite | Checks | Pins |
|---|---|---|
| `member_week_engine.test.js` | 36 | previews over a fixture harvest (record/streak/last-meeting text; unplaceable name refuses); odds mean = proj_sleeper/17 — never proj_mean (999 planted) or proj_ownmodel (888 planted); pWin **equals** LO.pWin on the same inputs (the /watch core, to 1e-9); K/DEF excluded and named; refusal on no-Sleeper-number / off-board / no-board; bye zeroes through the feed ladder; pastWeek winners off frozen points; unfrozen weeks are honest gaps; ownerSeason past/current/future incl. "when do I play X again"; futureSchedule pays ONE timeout and remembers the failure; records-watch honesty (dormant · fact-in-progress · IF IT HOLDS · no live bad-beat · final bad-beat · thin book silent); gameStake cut/toilet/$100 lines; rankOwners = the standings order |
| `member_site_surface.test.js` | 41 | real app over HTTP as a NON-commissioner: week strip; odds line renders pre-kick, names Sleeper, narrates the K/DEF exclusion, prints pctText grammar, **stands down live**; previews on all five pre-kick cards, standing down live; past/future week views render slates + previews, no bet form off the live week; honest degradation with no schedule doc (both surfaces); records chip fires on the seeded 171.9; /races (three races, viewer's line, cut line, one row per team, movement arrows, estimate/proved labels); swing board counts 5 games not 10 rows, stake grammar + $100 line; trend chart AND its table; the new nav + tab bar |
| `member_access_rule.test.js` | 53 | **the fail-arm** — see above |

Existing pins re-run green throughout: `access_guard`, `dashboard`,
`every_route_renders` (now 65 routes with /races), `matchup_arithmetic`,
`matchup_placed_bet`, `matchup_spectator`, `matchup_starters`,
`matchup_weekly_high`, `route_smoke`, `routes_integrity`, `watch_clickable`,
`whatwatch`, `sidebet_card_grammar`, `bet_edge_surface`.

## Suite results (final)

- `python3 -m pytest draft/tests -q` → **2340 passed, 5 skipped** (identical
  to baseline — no Python surface touched)
- `bash scripts/js-sweep.sh` → **287 JS entry points, all green** (284 at
  baseline + the three new fidelity suites)
- Screenshot harness: zero console errors, zero horizontal overflow at 390px,
  before and after runs.

## Override #5 — every touched file (bookkeeping; TERRITORY.md not edited)

B-lane crossings (`views/**`, `src/routes/**`, `public/css/**`):
- `src/routes/memberweek.js` — **new**: previews, week nav (pastWeek /
  futureSchedule / ownerSeason), the Sleeper-fed odds engine
- `src/routes/recordswatch.js` — **new**: the records-watch chips/banners
- `src/routes/whatwatch.js` — the swing layer added (`rankOwners`,
  `gameStake`, `ord`); the existing panel engine untouched
- `src/routes/member.js` — /matchup week nav + odds + season card + spectator
  preview; /scoreboard week nav + previews + odds + records chips;
  /watch swing ctx; **/races** (new route); /team trend rows; dashboard
  records banners + hero preview; `weekNavContext` / `renderMatchupWeek`
  helpers; requires
- `views/matchup.ejs` — week strip, odds line, season card, exit links
- `views/matchup-week.ejs` — **new** (past/future week view)
- `views/scoreboard.ejs` — week strip, records chips, preview + odds per card
- `views/scoreboard-week.ejs` — **new** (past/future slate view)
- `views/matchup-spectator.ejs` — preview line
- `views/watch.ejs` — swing-board header + per-row stake lines
- `views/races.ejs` — **new**
- `views/team.ejs` — season-trend chart + its table
- `views/dashboard.ejs` — hero preview line, records banners, races CTA
- `views/partials/header.ejs` — nav list (Races; tab-bar season shape),
  warroom.css scope widened to /scoreboard /watch /races /team
- `views/partials/_week_strip.ejs` — **new**
- `views/partials/_preview_line.ejs` — **new**
- `views/partials/_season_sched.ejs` — **new**
- `public/css/style.css` — the button-doctrine fix; dashboard-side member
  pieces (rec-watch, week-hero-prev, races CTA variant)
- `public/css/warroom.css` — the MEMBER SITE section (wk-strip, mu-prev,
  mu-odds/sb-odds, sched-list, wkslate, race-*, wtw-stake/swing-head,
  trend-chart median tick)

Own-lane / A-lane test surface:
- `draft/tests/member_week_engine.test.js` — **new** (36)
- `draft/tests/member_site_surface.test.js` — **new** (41)
- `draft/tests/member_access_rule.test.js` — **new** (53, the fail-arm)
- `draft/tests/shots-member.js` — **new** (capture harness + overflow gate)
- `draft/audit/screens/ms-{before,after}-*.png` — evidence (44 captures)
- this document

NOT touched: `src/sleeper.js` (A's lane — the schedule fetch reuses its
exported `matchupsForWeek`), every capture route's payload, all commissioner
gating (`requireCommissioner` untouched; the fail-arm proves the 403s), the
scoring/engine CFG, lineup-editing (none built — Cory's carve-out).

## Found but deliberately not done — and why

- **The h2h archive ends at 2025**, so mid-2026 previews say "last meeting
  2025 wk14" even after the pair met in the current season. Not silently
  wrong — every last-meeting line prints its season+week — and the fix is
  A's harvest refresh, not a display hack that would fork the archive read.
- **Per-NFL-game swing grouping** ("if the MNF total runs hot…") needs the
  per-player remaining feed the /watch panel already declares missing
  (`remainKnown: false`, PARKED for A). The stake layer is built pair-shaped
  so the grouping calls it unchanged when that lands; shipping a fake
  grouping off data we cannot see would violate the panel's own honesty rule.
- **Live in-game odds updating** — same dependency, same reason: the odds
  line stands down at kickoff rather than sit stale; it upgrades to the sweat
  meter's live probability the week the feed exists.
- **Past-week spectator pages for other pairs** (`/matchup?a=&b=&week=`) —
  the past-week slate shows every game's score + preview inline; a per-pair
  archive page would duplicate `/rivalry`, which already lists every meeting.
- **Betting on future weeks** — deliberately deferred to the live week (the
  bet window/locking machinery is week-scoped and correct; the future-week
  view says so explicitly rather than half-opening a door).
- **The scoreboard's pre-kick odds under `anyScore`** are all-or-nothing for
  the slate: one Thursday-night point retires the whole page's pre-kick
  layer. Per-game kickoff awareness needs the NFL schedule per player —
  the same parked feed. The matchup page behaves identically; both say
  "pre-kick" on the label.

## What the sequence leaves behind

All three passes of Cory's design order are now closed: the war room, the
in-season tools, the member site. The standing patterns — the `--wr-*` token
layer, gold-is-money/red-is-alarm, extract-the-shipped-renderer fidelity
suites, the store-doc screenshot harnesses, honest dormancy — are in place on
every surface the league sees.
