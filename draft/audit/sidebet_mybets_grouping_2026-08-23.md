# Side Bets: "My Bets" Grouping — 2026-08-23

Cory's order, verbatim (relay dispatch, `ROUTES.md`, 2026-08-23): *"We also need
to make side bets better. To confusing, needs to be easy to use and place
bets.. easy to track and see bets placed.. make side betting cards and say you
send and accept and track look more like professional betting site.. should
be able to easily track your own bets.. while site just needs to be a little
easier to get around. No one knows where to go for anything! It's just a
little too busy!!"*

Sliced by the relay into ① bet cards, ② a "MY BETS" screen, ③ a navigation
diet. Ground rule: ship ① before ② before ③, presentation over logic. Slice ③
is explicitly on hold — Cory, asked whether to build the proposed tab map:
*"Relay is sending more design advice. Wait for that to do anything."* This
pass is slice ② only, and does not touch primary navigation.

## The premise, checked before building anything (Rule 3f/3i)

The relay's dispatch read as if slice ① (sportsbook-style bet cards) and
slice ② ("MY BETS... does not exist as a view today") were both still open.
Live code says otherwise for large parts of both:

- **Slice ① is already shipped.** The 2026-08-15 design pass
  (`sidebet_design_pass_2026-08-15.md`) built exactly the card grammar the
  08-23 dispatch describes — one card per bet (`betCard` in
  `_side_bets.ejs`), a state chip, a kind chip, one button per legal action —
  confirmed live on `main` by grep before writing a line of this pass.
- **Most of slice ②'s raw material already existed too.** A P&L hero (net,
  wins–losses, at-stake, still-unpaid) already sat at the top of the page.
  "Needs You", "On the Books" (live), "Bets You've Sent", and "Your Side-Bet
  Ledger" (a running total, literally "every bet you're in, with a running
  total") were all already built and already rendered ahead of the market —
  just **interleaved** with On the Board / the builder / the tracker grid /
  the league-wide standings, so nothing read as "my bets, one screen."

So the real gap was never missing functionality — it was that "mine" and
"everyone's/the market's" were never visually separated, on a page long
enough (7,877px at phone width, captured before this pass) that "too busy"
is an accurate description regardless.

One genuine gap did exist: **your own settled bets had no home inside "my
stuff."** They only appeared inside a page-bottom, all-owners "Settled &
declined" disclosure, indistinguishable from everyone else's settled book.

## What changed

`views/partials/_side_bets.ejs` — presentation and reordering only, zero new
bet logic, zero new routes:

1. **`🎲 My Bets` heading**, first thing on the tab. Everything under it — the
   hero, Needs You, Who Owes Who, On the Books, Bets You've Sent, a new
   **Settled, Yours** section, and Your Side-Bet Ledger — is about you and
   only you.
2. **On the Books and Bets You've Sent moved up**, from after the market/
   builder to inside the My Bets group. They used to sit with someone else's
   open offers between you and your own live money.
3. **New: Settled, Yours** — `done.filter(inIt)` / `dead.filter(inIt)`,
   rendered through the same `betCard()`. This is the missing piece: "settled"
   from Cory's five-item list ("bets I sent, bets waiting on me, live bets,
   settled, running P&L") now has an actual home scoped to you.
4. **Your Side-Bet Ledger moved up**, next to the rest of My Bets instead of
   sitting past the market and the builder.
5. **`🌐 The Rest of the Book` heading**, marking where "yours" ends and the
   open market / bet builder / other people's proposals / the rules
   disclosure / the year-by-year tracker / league-wide standings begin.
6. **The league-wide "Settled & declined" section is now `doneOthers`/
   `deadOthers`** (`!inIt(b)`), so a settled bet you're a party to renders in
   exactly one section (the design pass's own invariant) — in My Bets, not
   duplicated into the league-wide record.

Nothing was hidden behind a click. On the Board (the market you can act on
right now) and the bet builder stay fully visible, just after the "My Bets"
boundary — collapsing the whole rest of the page behind a disclosure is
navigation/density work (slice ③), which is on hold pending the relay's
fuller design.

`public/css/style.css` — one new rule block, `.sb-section-title` /
`.sb-section-title-alt`, the two umbrella headings. No existing selector
touched.

## Evidence

| | Before | After |
|---|---|---|
| Side-bet tab, phone 390 | `sb-check-0823-sidebets-phone.png` | `sb-after-mybets-0823-sidebets-phone.png` |
| Side-bet tab, desktop 1440 | `sb-check-0823-sidebets-desktop.png` | `sb-after-mybets-0823-sidebets-desktop.png` |

Captured with the existing harness, `draft/tests/shots-sidebets.js` — the same
one the 08-15 pass used, unmodified. Zero console errors both times.

## Tests

- `sidebet_card_grammar.test.js` extended, not replaced: 8 new checks pin the
  "My Bets" heading precedes Needs You; On the Books and Bets You've Sent
  (a real fixture, not a vacuous guard — see the file's `hBet`) both precede
  On the Board; Your Side-Bet Ledger precedes the Rest of the Book divider,
  which itself precedes On the Board; and the settled-bet fixture (`gBet`,
  Cory is a party) renders exactly once, inside Settled Yours, not the
  league-wide section. **49/49 passing** (was 41/41).
- Full side-bet/pickem/matchup regression family re-run clean: `sidebet_paid_
  flow` 13/13, `sidebet_unpaid` 10/10, `sidebets` 27/27, `sidebets_lifecycle`
  16/16, `sidebets_lifecycle_ui` 12/12, `pool_draft_ui` 9/9, `bet_edge_
  surface` 7/7, `sidebet_refusal` 18/18, `member_review_fixes` 9/9, `pickem`
  39/39, `pickem_copy` 10/10, `matchup_placed_bet` 6/6, `money_sign` 9/9.
- **`pickem_surface.test.js` has 4 pre-existing reds** (LOCKED-state chip/
  radios/save-button/split), confirmed unrelated by re-running against a
  clean stash of this branch — identical 11 passed / 4 failed with or without
  this change. Not touched by this pass; flagging, not fixing, since it's
  outside slice ②'s scope.
- `draft_critical.js --run`: 131 green / 31 red, the same post-lock-board
  artifact set already tracked in `ROUTES.md` (register 253 family) — none in
  side-bets, votes, or history code.

## What this is not

Not slice ①(already shipped, verified, untouched) or slice ③ (nav — on hold
per Cory's explicit "wait for that"). Not a reduction in page length — nothing
was removed or collapsed, only regrouped and labeled, because hiding On the
Board or the builder behind a tap would trade "too busy" for "can't find the
market," which is the same complaint from a different angle. A shorter
default view (collapse Rest of the Book, `initDisclosures()`-style) is a
natural slice-③ candidate once the fuller nav design lands.
