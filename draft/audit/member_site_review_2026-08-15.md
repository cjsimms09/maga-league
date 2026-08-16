# Member-Site Review — 2026-08-15

Cory's directive, verbatim: *"overall review of site for other members. Should
be easy and fun to navigate. Goal is that we use this site instead of sleeper
app to actually track our matchups because it's better product."* Explicitly
"not high on priority list" — so this is a findings doc with the **top 3 fixes
implemented** (per the pass's work order), not a redesign.

Method: walked the site as a **non-commissioner member** on a seeded in-season
store (week 8 live, graded history, live side bets) at 390px —
dashboard → matchup → scoreboard → watch → bank → pickem — with the question
"what would make me open Sleeper instead?" Screenshots in
`draft/audit/screens/sb-before-*.png` / `sb-after-*.png`.

## What already beats Sleeper (don't touch)

- **The dashboard week-hero** — your game, score, who leads, lineup-problem
  flag, one tap to the full matchup. Sleeper has nothing above the fold this
  good.
- **The matchup page** is the killer surface: live tile, playoff-stakes line,
  all-time head-to-head with streaks, one-tap bet against your opponent,
  permanent trash talk, the $100 race, starters slot-by-slot with projections
  and bench points. Sleeper shows a score; this shows why it matters.
- **The scoreboard** ("This Week") — every game with the pick'em split, playoff
  leverage, clinch/elim chips, and the sweat line. Spectator deep-links per game.
- The money pages, history, chronicle — no Sleeper equivalent at all.

## Ranked findings — what stops it beating Sleeper

### 1. The matchup was TWO taps away on a phone (FIXED)
The phone tab bar was preseason-shaped: Office / Team / Finances / Locker +
More. Every live surface — Matchup, Scores, Pick'em, Watch — was buried behind
**More**. Sleeper's entire pitch is the matchup one tap from anywhere; ours was
hidden. **Fix:** The Matchup joins the tab bar as a primary item
(`views/partials/header.ejs`). Scores stays behind More (the week-hero and the
weekhub CTA already cover the landing path to it).

### 2. The needs-you strip missed the only hard weekly deadline (FIXED)
The dashboard's "Needs you" strip nagged for draft spot, votes and money — but
not pick'em, the one item that **vanishes at kickoff**. A member who lands on
the home page Thursday afternoon with three games unpicked got no signal.
**Fix:** the strip now carries "🗳️ Pick this week's games (2 of 5 in)" with the
live count, pre-lock only, silent once all picks are in (`member.js` dashboard
route + `dashboard.ejs`). The engagement loop Cory wants runs through exactly
this strip.

### 3. The Sunday screen was blind to the side-bet money (FIXED)
Half the point of a matchup side bet is watching the game with it in mind — the
standings already mark bet money (💰 on the table), but the **scoreboard**,
the screen actually open on Sunday, said nothing. **Fix:** a locked side bet on
one of this week's games now chips its game card — "💰 $20 riding — you're in
it" (gold = money; the bold face only when it's yours; locked bets only — a
proposal is not money; same visibility rule as `SB.betsAbout`).

### 4. No live refresh (NOT DONE — the real remaining gap)
Every page is a server render; Sleeper's app streams score updates. During a
game window our member refreshes by hand (and the Sleeper cache TTL means even
a refresh can serve the cached bundle). A light poll on /matchup and
/scoreboard during Sun/Mon windows — re-fetching the live tile only — is the
single highest-leverage *remaining* item. Not done here: it needs a deliberate
decision about cache TTL vs. Sleeper rate limits (A's `sleeper.js` owns that
contract), and a design pass of its own so motion stays state-change-only.

### 5. "Yet to play" is unknowable mid-game (NOT DONE, known)
The sweat meter and scoreboard chips run with `remainKnown: false` — without a
per-player game-state feed we can't say "3 players left vs 1". Already flagged
in `src/routes/member.js` and `watch.ejs`; needs a schedule/game-state source
decision, not a view fix.

### 6. Smaller notes (not done, listed for the backlog)
- **Bank page section memory**: /bank always opens on League Money; a member
  who lives on the side-bet tab re-taps every visit. (The nav badge deep-link
  already goes to `?section=sidebets`, which covers the badge path.)
- **Watch page** is Sun/Mon-gated with a preview link — good honesty, slightly
  buried; the scoreboard could cross-link it during windows.
- **Team page** (`/team`) duplicates some matchup content; harmless, but the
  matchup page is the one being polished — keep it the canonical live surface.

## The invisible-ink audit (fixed in this pass, filed here for the record)

Four dark-era leftovers rendered **white/pale ink on the light theme** — all
found by actually looking at the phone captures, all in member-facing surfaces:
your own bet's terms (`.sb-row.mine .sb-terms`, white on white), the engine's
bet sentence (`.sb-rule`, pale blue), the ready-verdict summary (`#86efac`
twice), the pick'em picked-side name (white on gold tint), and the Hall of
Shame's named person (`#ffd7db` on pink — the one name that page exists to
print). Pinned by `pickem_surface.test.js` ink checks.

## Fidelity

The three fixes are pinned by `draft/tests/member_review_fixes.test.js`
(9 checks over the real app: tab bar, nudge present/absent with live count,
💰 chip for locked-only with the .mine face rule).
