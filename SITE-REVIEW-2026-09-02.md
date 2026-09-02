# THE OWNER SITE, REVIEWED AS AN OWNER — 2026-09-02

**Cory, 09-02:** *"spend a decent amount of time on the owner facing site... design
improvements, functional improvements for other owners, efficiency improvements!
Look at all pages... Site should be informative, easy to use, clean and clear
info! But at its core it's a fantasy football site we should want to look at and
interact... Really think through every function, tool, and page... is the site cool!"*

**How this was done (not from memory):** the real app booted on a seeded
mid-season Sunday, logged in as **David — a non-commissioner** — and every
owner page rendered at phone width (390) and the main ones at desktop (1440),
zero console errors, zero horizontal overflow. 20 pages seen. Screens in
`draft/audit/screens/review*-*.png`; re-run with `SHOT_TAG=x node
draft/tests/shots-member.js` (+ the extended list in this review's commit).
Checked against the 08-23 redesign and its Little Things Catalog: **most of
that catalog shipped on 08-24** (edit/withdraw ballots, one-tap vote change,
nudge, run-it-back, counter-offers, Venmo prefill, injury chips, Open-in-
Sleeper, empty-slot alarm, human timestamps, NEEDS YOU badge). Your "remove
your vote" example is live (`↩ Withdraw my vote`). This review is of the site
as it renders TODAY.

---

## 0 · THE ONE DECISION ONLY CORY CAN MAKE — what the other nine owners get

**The two money tools — `/lineup` (the E[$] optimizer) and `/waivers` — are
commissioner-only.** Every other owner who taps them sees *"Restricted.
Commissioner access only. Nice try."* That is `ACCESS-RULE.md`, deliberate:
*tools are Cory's edge; history is league-visible.* It is the right rule for
E1 (beat the room). But "functional improvements for other owners" runs into
it head-on, so the choice is yours, stated as three options:

| option | owners get | your edge |
|---|---|---|
| **A · keep private** (today) | alerts only (empty slot / OUT starter already in NEEDS YOU for everyone) | intact |
| **B · open the CHECKS, not the CALLS** *(REC)* | a "lineup check" page: bye/OUT/empty-slot alarms, injury chips, kickoff times, projected total — no recommendation, no waiver targets | intact — the optimizer's *call* and the wire's *targets* stay yours; the site gets visibly useful to nine people |
| **C · open everything** | the optimizer and waiver targets | halved: the room converts better and the tool's +2-3 pts/wk becomes everyone's |

**RULED 2026-09-02 — Cory: "Keep everything private from other owners." Option A. The access rule stands; item 9 below is dropped.**

---

## 1 · PAGE BY PAGE (phone first), what an owner sees and what to fix

**League Office (home)** — good bones: NEEDS YOU strip, your game card, rivalry
of the week, THE DISPATCH (auto-written league lines — genuinely cool), live
standings with the playoff line, scoreboard, money, weekly high, locker.
*Fix:* it is 12 stacked sections on a phone (5,165px). Order by urgency —
NEEDS YOU → your game → live scores → standings — and make the one-time
prompts (contact info, "put this on your phone") first-visit-only, dismissed
for good with one tap. Desktop is a clean two-column and needs nothing.

**The Matchup** — the strongest page. Score, what-it's-worth (playoff odds
swing), head-to-head history, bet, trash talk, weekly-high bar, starters
side-by-side, bench points, season strip. Keep. *Small:* the "What this is
worth" card is the best sentence on the site; pull it into the home card.

**This Week (scoreboard)** — *Fix:* THE MONEY block (the ten-name "nothing
banked yet" table) sits ABOVE the five live games and pushes them below the
fold on a phone. Games first, your game pinned to the top, money below. The
pick'em split chips ("5 of 10 took Cory") and "worth 9% to Bates's playoff
odds" lines are excellent — keep.

**What to Watch** — excellent: COOKED / COIN FLIP / SWEATING / IN CONTROL
with the projected-remaining bar per game. Owners will love this on Sunday
night. *Fix:* it is not in the nav; link it from the scoreboard header, not
only from the matchup card.

**The Races** — clean, complete (playoff race, points crown, toilet race).
Keep.

**My Team** — Roster tab shows starters/bench with points; *Fix:* the roster
rows carry no THIS-WEEK context (opponent, kickoff day, projection, status) —
that lives on the other tab. One row per player with both is the phone
answer. The "This Week" tab param is a link, not a query — fine.

**League Finances** — complete and honest (ledger, career money, where
everyone stands, square up, carried over, how to pay). *Fix:* "Square Up"
lists all nine other owners' lines with "no Venmo on file for Cory" repeated
eight times; show MY lines first ("you owe / you are owed") and collapse the
rest into one line. *Missing function (catalog 7):* **mark as paid** —
debtor taps "I paid", creditor confirms, the line clears with a date; today a
debt can never be resolved on the site. *Missing (catalog 2):* offer expiry
chip on bet cards.

**The Voting Booth** — propose, vote, see the votes, comments, withdraw,
punishment wall: all there. *Missing (catalog 11, half):* the ballot's
closing deadline ("closes Sun 6pm") beside the quorum line.

**Pick'em** — works: hidden picks until kickoff, lock time, accuracy board.
*Cool add:* show THE MODEL's picks after lock and grade it on the same board
— owners vs the machine is an engagement hook we already have the data for.

**Locker Room** — edit/delete window and reply-to shipped. *Missing (catalog
13, half):* reactions (🔥 💀 🤡). Cheap, and the thing that makes a chat feel
alive.

**League History (index)** — *Fix, the biggest single design problem found:*
the index renders the ENTIRE chronicle on one page — 11,589px tall on a phone,
every season, every owner, every record. The sub-pages exist (`/history/
records`, `/money`, `/franchise/:name`, `/season/:year`); the index should be
a menu of them plus this week's "on this day" line, not the whole book.

**Rules** — now fully derived from the imported config (scoring table,
roster, payouts). Complete; keep.

**Draft Spot** — an offseason page ("selection is currently closed") still in
the More menu in-season. Park it until the offseason; it confuses a new owner
in October.

**Model Accuracy, Analyzer, War Room, Recap** — commissioner-only; not
owner-facing. Fine under the access rule.

---

## 2 · THE RANKED BUILD LIST (each slice shippable alone; B builds, relay by default)

1. **Scoreboard: games first, your game pinned, money below** — one template
   reorder, the most-visited Sunday page. *[small]*
2. **History index → menu + highlights** (kill the 11,589px page). *[small]*
3. **Mark as paid** (catalog 7) — the only money loop on the site that cannot
   close. *[med]*
4. **Home phone order + first-visit-only prompts.** *[small]*
5. **My Team: this-week context on the roster row** (opp · day · proj · status). *[small]*
6. **Vote deadline chip · bet expiry chip · chat reactions** (catalog 11/2/13
   remainders). *[small ×3]*
7. **Pick'em vs the model** (model picks revealed and graded after lock). *[small]*
8. **What to Watch linked from the scoreboard; Draft Spot parked in-season.** *[tiny]*
9. ~~The lineup CHECK page for owners~~ — **dropped: Cory ruled everything stays private (09-02).**

**Not in scope, said plainly:** anything that changes bet/vote/money math;
trades UI (Sleeper's job); push notifications (a later program).

---

## 3 · WHO IS BUILDING THIS — the honest state of lane B

B's routed queue holds **12 open findings from 08-21/27** (E's: the waiver page
listing eight kickers, the lineup win-probability swinging 37→99→35% on an
unchanged roster, register 324's fix) and **no B commit since 08-27**; every
site change since has been another lane fixing things ad hoc. Those E findings
are on COMMISSIONER-ONLY tools, so the owners never saw them — but Cory does,
every Sunday. **Ask to A/Cory:** either B is re-launched with this list and
its queue, or the relay works items 1-8 above in order (small, presentation-
only, each behind `every_route_renders` + the screenshot harness). Default:
relay starts on 1 and 2 on 09-03 if silent.
