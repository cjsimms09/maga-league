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
  and **Edit** (edit = withdraw + re-open the send form prefilled — honest, zero new bet logic).
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
