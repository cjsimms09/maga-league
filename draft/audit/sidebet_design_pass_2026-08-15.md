# Side-Bet + Member-Site Design Pass — 2026-08-15

Cory's directive, verbatim: *"really want to think through the side bet
functions. These side bets will keep the other owners engaged and is a big part
of the site. It should allow us to place a variety of bets, bet cards should be
easy to understand and function like a real betting site. Trick is to allow
multiple kinds of bets but present in easy to understand way (currently
confusing and not clear) bets that can, should be adjudicated automatically and
we should have an easy but secure way to mark a bet as paid. … But also helped
me with other bets or pick em screen. … overall review of site for other
members [not high on priority list]."*

This is the in-season sibling of the war-room pass
(`warroom_design_pass_2026-08-15.md`) and inherits its system wholesale: the
`--wr-*` token layer (extended, not forked), gold = money only, the fidelity
method (drive the real renderer, assert the displayed value equals the stored
fact), and the screenshot acceptance bar (phone 390 full page, zero console
errors, zero horizontal scroll).

---

## Evidence — before / after (committed, draft/audit/screens/)

| Page | Before | After |
|---|---|---|
| Side-bet book, phone 390 | `sb-before-sidebets-phone.png` | `sb-after-sidebets-phone.png` |
| Side-bet book, desktop 1440 | `sb-before-sidebets-desktop.png` | `sb-after-sidebets-desktop.png` |
| Pick'em, phone / desktop | `sb-before-pickem-*.png` | `sb-after-pickem-*.png` |
| Matchup, phone | `sb-before-matchup-phone.png` | `sb-after-matchup-phone.png` |

Harness: `draft/tests/shots-sidebets.js` — boots the real app on a temp store
seeded with **one bet of every kind in every load-bearing state** (all through
the docs the app actually reads: `sleeper-cache`, `weekpoints:*`, `pickem-*`),
plus a graded pick'em history and a locked live week. All AFTER captures: zero
console errors, zero horizontal overflow at 390px (asserted by the harness).

## 1. ONE CARD GRAMMAR — bets read like a betting site

The before state was Cory's complaint made visible: every kind rendered through
one dense card with the mechanics exposed, sections ordered by the internal
status enum, the tracker grid *above* your own live bets, and an
awaiting-confirm bet rendered **twice** — once in "Waiting on You" with accept
controls that could not act on it, once in "On the Books" with the right ones.

Every bet now flows through one renderer (`betCard` in
`views/partials/_side_bets.ejs`), read in the order a bettor asks:

1. **WHAT'S THE BET** — the plain-English line first, with the engine's
   sentence (`BL.betText`) as the italic second line only when it adds anything.
2. **THE NUMBER** — the stake, the card's one dominant figure, gold because
   gold is money and nothing else on the card is gold.
3. **WHO'S ON WHICH SIDE** — the sides list (or the pool's draft room, which IS
   its sides).
4. **STATE** — a chip, never a status word buried in a meta line: `YOUR ANSWER
   / CONFIRM NEEDED / READY TO SETTLE / YOUR PICK / LIVE / DRAFTING / OPEN —
   TAKE IT / ON THE BOARD / WAITING / DISPUTED / SETTLED / PUSH / EXPIRED /
   DECLINED`. Chip ink doctrine: navy = waiting on YOU (action wears navy, as
   the war room's take button), green = live money, amber = waiting on someone
   else, red = disputed only, muted = over.
5. **THE CLOCK** — `betlogic.acceptDeadline`'s answer on the card ("⏱ accept
   before Thu Nov 5, 8:15 PM ET — week 9 kicks off"), not discovered on failure.

The **KIND is a labeled chip** — `⚔️ MATCHUP / 📐 PROPOSITION / 🏆 POOL / 🤝
HANDSHAKE` — so variety reads as variety, not noise. CSS: the `.bcard`/`.bc-*`
section added to `public/css/warroom.css` (the war-room file, extended per its
own handoff note), which is now linked on `/bank`, `/pickem` and `/matchup`.

## 2. THE SPLIT — "what needs me?" then "what's out there?"

The page is grouped by the bettor's two questions, not by status enum, and
**every bet renders in exactly one section** (pinned):

1. **🎯 Needs You** — the top block, with a count: results to confirm, results
   the engine has ready, offers to answer, your pool-draft pick — in that
   order (how close the money is to moving).
2. **💸 Who Owes Who** — settled money that hasn't moved, directly under it.
3. **📢 On the Board** — open bets you can take.
4. ➕ the builder, **🔥 On the Books** (live), **📤 Bets You've Sent**,
   **⏳ Proposed** (other people's negotiations).
5. The records: your ledger, **the tracker grid** (moved down — it is a record,
   not an action; drill-downs still land at the top since you tapped to get
   there), Who's Up, settled & declined.

The nav badge (`SB.awaiting`) now also counts a pool draft blocked on your
pick, and the site-wide banner copy names the set honestly ("answer, confirm,
or make your pick").

## 3. AUTO-ADJUDICATION — one tap, iron rule intact

`betlogic`'s rule stands: **THE ENGINE NEVER SETTLES A BET.** Before, a decided
verdict sat inside a collapsed `<details>` on the live card. Now the engine's
read is a **score bug** on the card — `⏳ ENGINE Not settled — week 10 isn't
final yet` / `⚖️ ENGINE Cory wins — the whole bet came in` — headline always
visible, the working ("every number it used") one tap deeper. A decided bet
jumps to **Needs You** as `READY TO SETTLE` with the one-tap
**"⚖️ Offer this result — Cory wins"**, which posts the existing
`/settle-auto` route: it **DECLARES** the Sleeper verdict (source-tagged), the
other side sees the auto-detected confirm card, and the **human confirm** is
what settles. Pinned end-to-end: one tap → `awaiting_confirm`, never
`settled`; `declared.source === 'sleeper'`; confirm settles.

Tightened while there: the direct `/sidebets/:id/settle` route was reachable by
any party — a one-tap straight to SETTLED that skipped the other side entirely,
contradicting the two-man rule the rest of the page enforces. It is now
**commissioner-only at the route** (an adjudicator is what the commissioner
is); parties settle by declaring. Both arms tested.

## 4. MARK-AS-PAID — the receiver's mark is the fact

`SB.markLeg` previously let **either** side of a payment leg set `paid` — the
person who owes the money could write "paid" into the record every owes-list
trusts. The honest model, implemented and documented in `src/sidebets.js`:

- the **RECEIVER** (leg.to) marking paid is THE FACT — sets `paid`, clears the
  leg from every list; only the receiver can un-mark ("it never arrived" also
  clears any stale claim);
- the **PAYER** (leg.from) marking paid is A CLAIM — `leg.claimed {by, at}`,
  the amber "sent — waiting on X to confirm" chip, leg stays on the books;
- a stranger to the leg is refused.

Two-step over receiver-only because the Venmo tap and the confirm are hours
apart in practice — the interim is real and the card shows it. The Venmo deep
link (amount pre-filled) and the confirm live on the same Who-Owes-Who card,
and the card says the rule in plain words. Old legs normalize `claimed: null`
at read time; no migration. Both arms — allowed and refused — tested at the
module and again over real HTTP (`sidebet_paid_flow.test.js`, 13 checks).

## 5. PICK'EM — the slate's state is a chip, a tap answers back

- The slate wears its state the way a bet card does (`.bc-state`): **YOUR
  PICKS** with a live count and the lock clock / **✓ ALL PICKED** / **🔒
  LOCKED** — not a whisper in the `.sub`.
- Tapping a side responds immediately (`:has(:checked)` + a tiny progressive
  script); the save button counts ("Save my picks (2 of 5)"); a saved pick is
  tagged `✓ saved`, and a tag on a side you tapped away from removes itself
  rather than lie.
- Post-lock: split bars, live results, your-pick grading — kept; the locked
  chip and disabled radios pinned.
- Leaderboard + Hall of Shame kept; the shamed person's name was **invisible**
  (dark-era `#ffd7db` ink on pink) and now prints in real ink.

## 6. MEMBER-SITE REVIEW — findings doc + top 3 implemented

`draft/audit/member_site_review_2026-08-15.md`. Implemented: the Matchup joins
the phone tab bar; pick'em joins the dashboard needs-you strip with a live
count; locked side-bet money chips its scoreboard game card (💰, gold, bold
only when yours). Ranked and deliberately not done: live refresh during game
windows (cache-TTL/rate-limit decision belongs to A's sleeper.js), per-player
"yet to play" (needs a game-state source), backlog notes.

## Fidelity bugs found by looking — the invisible-ink audit

Five dark-era leftovers rendered pale/white ink on the light theme, all caught
in this pass's own phone captures, all member-facing: your own bet's terms
(white on white — the card's first line, gone), the engine's bet sentence, the
ready-verdict summary (twice), the picked pick'em name (white on gold — the one
name you chose), and the Hall of Shame's named person. All fixed in
`style.css` with the reason at the site of each fix; the pick'em pair pinned by
test. This is the same class of defect the war-room pass found in the board
header — the light-theme conversion is still shedding these, and every new
surface capture should look for them.

## THE FIDELITY SUITE — what the certainty rests on

**78 new checks, all green**, four suites (all `// TERRITORY: A`, all driving
the real app over HTTP with a seeded store — the `bet_edge_surface` pattern):

| Suite | Checks | Pins |
|---|---|---|
| `sidebet_card_grammar.test.js` | 41 | one-section-per-bet; needs-you first + its four shapes; every state & kind chip; the clock; the score bug; one-tap = DECLARE (never settle, source=sleeper, human confirm settles); `/settle` party-refused / commissioner-allowed; paid-flow page states; awaiting() counts draft turns |
| `sidebet_paid_flow.test.js` | 13 | receiver-confirms model, allowed and refused arms, module + route; legacy-leg normalization |
| `pickem_surface.test.js` | 15 | OPEN vs LOCKED page states (chip, count, clock, saved marks, split hidden pre-lock / public post-lock, radios, save button); ink pins |
| `member_review_fixes.test.js` | 9 | tab bar; needs-you nudge present/absent with count; 💰 chip locked-only + .mine face rule |

Existing pins kept green throughout: `sidebets` (27), `sidebet_unpaid` (10),
`sidebets_lifecycle` (16), `sidebets_lifecycle_ui` (12), `pool_draft_ui` (9),
`bet_edge_surface` (7), `sidebet_refusal` (18), `pickem` (38), `pickem_copy`
(10), `matchup_placed_bet` (6), `every_route_renders` (64 routes), `money_sign`.

## Suite results (final)

- `python3 -m pytest draft/tests -q` → **2293 passed, 5 skipped**
- `bash scripts/js-sweep.sh` → **279 JS entry points, all green**
- Screenshot harness: zero console errors, zero horizontal overflow at 390px.

## Override #5 — every touched file (bookkeeping; TERRITORY.md not edited)

Lane-crossings (`views/**`, `src/sidebets.js`, `src/routes/member.js`,
`server-app.js`, `public/css/style.css`):
- `views/partials/_side_bets.ejs` — the rewrite (card grammar + section split)
- `views/partials/header.ejs` — warroom.css link widened; Matchup primary
- `views/pickem.ejs` — state chip row, saved marks, live count script
- `views/dashboard.ejs` — pick'em on the needs-you strip
- `views/scoreboard.ejs` — the 💰 wager chip
- `src/sidebets.js` — markLeg receiver-confirms model; leg `claimed`
  normalization; awaiting() counts draft turns
- `src/routes/member.js` — `/sidebets/:id/settle` commissioner-only;
  dashboard pickemNudge; scoreboard betsByGame
- `server-app.js` — the waiting-bets banner copy
- `public/css/style.css` — invisible-ink fixes; pick'em tap/lock CSS; sb-chip.money

Own-lane:
- `public/css/warroom.css` — the `.bcard`/`.bc-*` side-bet card grammar section
- `draft/tests/sidebet_card_grammar.test.js`, `sidebet_paid_flow.test.js`,
  `pickem_surface.test.js`, `member_review_fixes.test.js` — **new**
- `draft/tests/shots-sidebets.js` — **new** (capture harness + overflow gate)
- `draft/audit/member_site_review_2026-08-15.md`, this doc,
  `draft/audit/screens/sb-{before,after}-*` — evidence

## Known gaps / notes for the next pass

- **The bet builder** (`_bet_builder.ejs`) kept its ticket design — it was
  already slip-shaped and its four tickets already read well; it has not
  adopted the `.bc-*` tokens. Candidate for a later polish, not a defect.
- **The edge report** on /bank kept its existing markup (its strings are
  pinned by `bet_edge_surface`); it sits above the new section order and reads
  fine, but could adopt the card grammar for its rows.
- **Live refresh** is the top remaining member-facing gap (review doc §4).
- The commissioner's "Adjudicate: settle by hand" dropdown renders on every
  locked card for him; if his book gets long, collapse it behind a disclosure.
- `SIDE-BET-TESTING.md` §4 still describes the old "settle by hand" as a
  party control; the doc predates the two-man tightening and should be
  refreshed the next time the manual test script runs.
