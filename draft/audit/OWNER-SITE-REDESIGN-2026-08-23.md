# The Owner-Site Redesign — 2026-08-23
**Commissioned by Cory, verbatim:** *"Act as professional website designer… think of functionality
from one of the owners perspective, what things do you want to see easiest and first… should we have
a way to change a bet you've sent but hasn't been accepted yet… If you place a vote, you should be
able to rescind… don't have to show who voted for what on votes, can have a click in to see that."*

**Two facts that frame everything (measured on the build, not guessed):**
1. **The features Cory asked for mostly EXIST** — vote rescind is a live button on /votes,
   bet withdrawal exists server-side (member.js:2065). Owners can't find them. The failure is
   information architecture, not missing code.
2. **The clutter is real and countable** — the home page is 8 full sections; /matchup is 8;
   /votes shows every ballot's full tally table inline. Everything shouts, so nothing reads.

---
## The five rules (every page gets held to these)
1. **Answer first, detail behind a tap.** Every page opens with the ONE thing its visitor came
   for, as a number or a name. Tables, histories, and tallies are click-ins. (Cory's votes
   example is this rule: result chip on the card, "see the votes →" opens the tally.)
2. **One job per page.** A page that does two jobs becomes a page plus a click-in.
3. **State chips, everywhere, one vocabulary.** OFFERED / ACCEPTED / LIVE / WON / LOST / PUSH
   for bets; OPEN / VOTED / CLOSED for ballots; same colors site-wide. An owner learns the
   language once.
4. **Actions live ON the thing.** Withdraw sits on the unaccepted bet card. Rescind sits on
   your cast ballot. No hunting for the page where the button lives.
5. **A badge means "you must act."** Bets waiting on you, open ballots you haven't cast,
   money you owe. Nothing else earns a red dot — a badge that's always lit is furniture.

## Navigation (v2 map, pending Cory's ruling)
🏈 **My Team** · ⚔️ **This Week** (matchup + scores, one tab) · 💰 **The Book** (ALL gambling:
place, accept, track, settle) · 🏛 **League** (standings, history, votes, rules) · 💬 **Locker**.
The More panel dies for owners. Commissioner tools stay behind the ⭐ as today.

## Page by page (owner's eye)
### Home (League Office) — from 8 sections to a 4-card feed
1. **YOUR WEEK** — your score vs opponent, live chip, one tap to the matchup.
2. **NEEDS YOU** — the only aggregation on the site: bets waiting on your accept, ballots you
   haven't cast, money you owe. Empty state: "Nothing needs you. Go talk trash."
3. **THE RACE** — standings top-3 + your row + weekly-high leader. Full table one tap in.
4. **THE WIRE** — league news feed, 3 items, "more →".
Buy-in status, payout table, chat preview: gone from the fold — linked where they belong.

### The Book (bank + bets merged) — the sportsbook page
- **Bet cards**: who vs who · stake · the line in plain words · state chip · the ONE legal
  action as a button (Accept / Withdraw / —). Sent-but-unaccepted cards carry **Withdraw**
  and **Edit**.
- **Edit is a TRUE edit, in place** (Cory's correction, 08-23: *"I didn't say bet withdrawal
  I said edit"*): tap Edit on your unaccepted bet, change stake or terms, save — same card,
  same thread, no withdrawn-and-resent noise. Two integrity rules make it safe, and they are
  the only new server logic this spec allows: ① every edit bumps a terms-version and the card
  shows an **"edited"** chip with the old terms one tap away; ② an Accept submits the version
  it was looking at, and the server refuses a stale accept — nobody can ever accept terms they
  did not see. Once accepted, Edit disappears; that is what accepted means.
- **MY BETS** tabs: *Open on me* · *I sent* · *Live* · *Settled (P&L running total)*. This is
  "easily track your own bets" — it becomes the tab's landing view.
- **The ledger**: one net line per pair ("Rich owes you $25"), square-up math behind a tap,
  payment handles behind a tap. Career money moves to My Team.

### Votes — Cory's example, implemented
- Ballot card: the question, deadline chip, YOUR status (VOTED ✓ / not yet), Cast/Rescind on
  the card. **Tallies and who-voted collapse behind "see the votes →"** — while OPEN, showing
  the split also pressures votes, so hiding it is more honest AND cleaner.
- Past measures: one line each (PASSED/FAILED chip + date), click-in for the story.
- Punishment Wall: its own card, same grammar.

### This Week — every game as a score strip (live chip, your game pinned first), weekly-high
race as a progress bar. That's the whole page.

### My Team — starters with projections + injury chips FIRST (the "can I win this week" view),
bench collapsed, season sparkline, career money down here. "Waiting on you" leaves this page —
it lives in Home's NEEDS YOU.

### Matchup — the game on top (score, projected winner, starters side-by-side compact);
Bet-this-matchup and trash talk as two buttons, not two sections; head-to-head history click-in.

## Visual system (the "professional" part)
- **One card component** everywhere: title row (icon + name + state chip), one fact line,
  one action. If a card needs three facts, it's two cards.
- **Type discipline**: page = one h1 with a one-line purpose under it; sections = small-caps
  labels, not emoji-headline shouting. Emoji live in chips and tabs, not headings.
- **Density rule**: max three numbers visible per card face. Everything else is a tap away.
- **Empty states written like a human**: "No open bets. Start one from any matchup."

## Build order for B (each slice shippable alone)
1. Nav v2 (one file, biggest confusion-killer)  2. The Book (cards + MY BETS + withdraw/edit)
3. Home feed (NEEDS YOU is the star)  4. Votes cleanup (the click-in pattern proves itself)
5. This Week / My Team / Matchup re-cuts  6. Visual-system sweep (chips + headings)
Ground rule: presentation over logic — betlogic.js and vote logic untouched; withdraw/rescind
already exist server-side and get surfaced, not rewritten.

---
# THE LITTLE THINGS CATALOG — 2026-08-23 addendum
**Cory:** *"look for more little things like that!! I was telling you to really look at whole site."*
Every owner flow walked against the BUILD (each item verified missing or unsurfaced, not guessed).
Tags: **[surface]** = exists server-side, needs a button · **[small]** = new, hours ·
**[med]** = new, a day+. B implements top-down within each flow; Cory vetoes by number.

## Bets (The Book)
1. **Decline an offer** [surface] — DECLINED exists in the lifecycle; there is no button. An
   ignored offer and a declined one look identical to the sender. Decline button + optional
   one-line reason that posts to the bet thread ("$50? on THAT line?").
2. **Visible expiry** [small] — acceptDeadline computes exactly when every offer dies; show it
   as a countdown chip on the card ("expires Thu 8:15pm"). The server already knows; the owner
   should not find out by being refused.
3. **Counter-offer** [med] — instead of decline-then-retype: tap Counter, edit the terms, it
   becomes YOUR offer back on the same thread. The natural end of the edit machinery.
4. **Run it back** [small] — on any settled bet: one tap re-offers the same bet for the
   current week. Rivalries are the product; this is the rivalry button.
5. **Nudge** [small] — one reminder tap on a pending offer, rate-limited to once/day: "Cory
   is waiting on your answer." Goes to the NEEDS YOU card, not a text wall.
6. **Head-to-head bet record** [small] — on any opponent: lifetime W-L and net $ against them,
   one tap from every bet card. The trash-talk stat.

## Money
7. **Mark as paid** [med] — the ledger computes who owes who and then nothing can ever be
   resolved. Debtor taps "I paid" → creditor confirms → line clears with a date. Two taps,
   two parties, no commissioner in the loop.
8. **Prefilled payment links** [small] — the bank page lists payment handles as TEXT. A "Pay
   $25 →" Venmo/CashApp deep link with amount and note prefilled removes the last excuse.

## Votes
9. **Change vote = one tap** [surface] — changing is rescind-then-recast today. Show your
   current choice with the other options tappable; a tap IS the recast. Same server calls.
10. **Proposer can edit/withdraw an unvoted proposal** [small] — same rule as bets: until
    anyone has acted on it, the author owns it. Typo'd ballots currently live forever.
11. **Deadline chip + quorum bar** [small] — "closes Sun · 6 of 10 voted." An open ballot
    should advertise its own urgency.

## Locker Room
12. **Delete/edit your own message, 5-minute window** [small] — typos are forever right now.
    Show "edited"; after 5 minutes it is the record, same as the mailbox rule.
13. **Reply-to** [med] — quote a message; without it every hot thread is two conversations
    braided. (Reactions ride along if cheap: 🔥 💀 🤡 and done.)

## My Team / This Week
14. **"Open in Sleeper" everywhere an action lives there** [small] — ZERO deep links exist
    today. Lineup warnings, waiver ideas, IR moves: every one ends at the transaction, which
    happens in Sleeper. One button per surface: our site is the brain, Sleeper is the hands.
15. **Empty-slot alarm** [small] — the site knows your lineup has a hole or a BYE/OUT starter
    before Sunday; it should be the top line of NEEDS YOU, not a Monday discovery.
16. **Injury chips on every player name, site-wide** [small] — the board carries the status;
    show Q/OUT/IR beside every rendered name, one component.

## Everywhere
17. **Confirmation toasts that say the thing** [small] — "Bet sent to Rich · $25" not
    "Saved." Every POST already knows what it did.
18. **Human timestamps** [small] — "2h ago" with the real date on hover/tap.
19. **NEEDS YOU badge = the truth** [small] — the More button badge count equals exactly:
    bets waiting + ballots uncast + debts unconfirmed + lineup holes. Nothing else, ever.

**Explicitly NOT in scope, stated so nobody assumes:** trades UI (Sleeper's job), push
notifications (a later program), anything that changes bet/vote/money MATH.
