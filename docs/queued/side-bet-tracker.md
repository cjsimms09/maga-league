# SIDE-BET TRACKER — corrected scope + drill-down (SUPERSEDES the prior side-bet-career directive)

Filed 2026-08-08 (Cory). **This supersedes any earlier side-bet-career directive.** Lives entirely inside the side-bets section (Locker Room). Side bets are the data spine's ONE legitimate manual-entry surface (terms exist nowhere digital); everything below is DERIVED from those entries. **FIREWALL IS TOTAL:** nothing side-bet-related renders on the history page, franchise pages, Money Board, or the Annual's chapters — this chart IS the side-bet record, full stop.

## 1. One chart, one home
A standalone grid living ONLY in the side-bets section: **owner names down the left, years across the top**, each cell = that owner's **side-bet net for that year** (+/− dollars, green/red), a **career net column** on the right.

## 2. Fully derived, zero maintenance
Every cell computes from side-bet ledger entries (parties, stake, outcome). When a bet is entered and settled in the side-bet section, **both owners' cells for that year update automatically**; the year column for a new season appears on its own when that year's first bet lands. **No totals ever typed.**

## 3. Empty cells
Years with no recorded bets for an owner render as a **quiet dash**, not zero.

## 4. Venmo on unsettled bets
Keep the Venmo links on individual unsettled bets in the section; the chart itself is just the running score.

## 5. Drill-down layer — three clickable axes (all stay inside the side-bets section)
One ledger component, three filters (owner / owner+year / year) — same rendering everywhere (the spine's one-source-many-readers rule applied to VIEWS):
- **Click a NAME (left column)** → that owner's complete **career side-bet ledger**, newest first: date · opponent · stake · terms · outcome · running net, with their career total at top.
- **Click a CELL (a dollar amount)** → that owner's ledger **filtered to that year**, with the year's net at top.
- **Click a YEAR (column header)** → the **league-wide ledger for that year**: every bet by everyone, the year's biggest winner/loser called out at top, each row showing both parties.
- **Cross-navigation:** every row in any view shows **both parties as tappable names** that jump to THEIR career ledger.
- **Unsettled bets render at the TOP of any view**, badged **OPEN** with their Venmo link; settled bets below.
- **Back navigation returns to the grid.**

## 6. Invariants
- Each bet is zero-sum: the two parties' cells carry **opposite signs and sum to zero** per bet.
- **Firewall:** zero side-bet content renders anywhere outside the side-bets section.

## 7. Robot scenarios
- Enter a fixture bet → both parties' cells + career nets update, opposite signs, sum to zero per bet.
- Assert **zero side-bet content renders anywhere outside the side-bets section** (history/franchise/Money Board/Annual).
- Name-click renders the career view with the correct total; cell-click filters to exactly that owner-year's bets; year-click shows all parties' bets summing to zero; a party-name tap inside a ledger navigates to that owner's career view.
