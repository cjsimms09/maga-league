# THE DATA SPINE — Everything Linked, Nothing Typed Twice

The rule, stated once: EVERY fact on the site renders from one canonical data layer. No page holds its own copy of a fact. Cory manually enters ONLY facts that exist nowhere else in the world — everything Sleeper knows, the harvest computed, or the payouts config defines flows automatically to every surface that mentions it. If Cory ever has to re-type a number the site already possesses, that's a bug with the same severity as a wrong number.

## 1. The canonical layer (sources of truth, each fact exactly one home)
- **Sleeper-derived facts** (via the sync/harvest pipeline): rosters, players, matchup results, weekly scores, standings, brackets, drafts, keepers, transactions — refreshed by the existing crons, archived to L2
- **payouts.json**: the money rules (checksum-guarded, already ground truth)
- **Derived money facts** (computed, never hand-entered): weekly-high winners + amounts, standings/playoff money, per-season and career earnings, the settlement (who's owed / who owes) — all recomputed from Sleeper facts × payouts rules on every data refresh
- **SIDE-BET LEDGER — its own book, firewalled**: side bets are the ONE legitimately manual entry surface (their terms exist nowhere digital). Entered once in the Locker Room side-bet section: parties, stake, terms, deadline, outcome, settled-or-not. From that single entry: a separate side-bet ledger page, per-owner side-bet net, and side-bet lines on the settlement page — ALWAYS rendered distinctly (own section, own totals) and NEVER mixed into league-pot money: career earnings, the Money Board, history chapters, and the official settlement's league section exclude side bets entirely; a side-bet subtotal may appear alongside, clearly labeled. Two books, one page, zero blending.

## 2. Propagation (the "constantly updating" requirement)
- The existing weekly crons already refresh Sleeper facts → extend the refresh to trigger DERIVED recomputation site-wide: a Tuesday score correction updates that week's result, the weekly-high ledger, both money ledgers if affected, career earnings, the records book, the live history chapter, and the settlement — one refresh, every surface, no page ever staler than its source
- Build-time rendering stays (static pages regenerate on data change); no page computes its own version of a derived fact at request time

## 3. The consistency proof (how we KNOW it's tied together)
- **Cross-surface reconciliation test in CI**: one automated pass asserting the same fact is identical everywhere it renders — Cory's career earnings on the Money Board == his franchise page == the sum of his season chapters == the settlement history; week-5 high winner on the history page == the ledger == the season chapter; roster counts, standings, bracket results likewise. Any mismatch = red build. This test IS the integration guarantee — not intentions, an assertion.
- **The no-retype audit**: inventory every input field on the site; for each, verdict — legitimately-manual (side-bet terms, league announcements, votes) or REDUNDANT (the site already knows it → replace the field with derived rendering). Ship the audit table; kill every redundant field.

## 4. Manual-entry surfaces that remain (the complete list — anything else is a bug)
Side-bet entry · league announcements/posts · voting booth votes · commissioner actions that create NEW facts (dues-paid toggle, rule proposals) · Claude-side content approvals (history chapters via the Annual). That's it. Payout amounts, winners, records, earnings, standings, rosters: never typed, always derived.
