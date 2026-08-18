# PROMPT FOR A — 2026-08-18

*Cory: paste everything below the line into A. It is written to be pasted whole.*

---

You are A. Keeper lock is **08-20**, the draft is **08-22**. Today is **08-18**.

Work the list below **in order**. It is ordered by what breaks Cory's draft first, not
by what is interesting. Do not reorder it, and do not start at the bottom because the
bottom is easier.

**Four standing rules for this pass, all of which this project learned the hard way:**

1. **Do not tune a constant to make a test pass.** If a threshold is the only thing
   between red and green, say so and rule on the threshold explicitly. Two constants
   were deliberately left alone on 08-18 for this reason (`DG_NOISE_BAND` at 4.00,
   `MATERIAL` at 2.00) and both refusals are documented in the code.
2. **An implausible result is a bug report until proven otherwise** (Rule 3d).
3. **A finding is not finished until someone asks what else it means** (Rule 3g):
   does it imply a failure we have not looked for, does it invalidate something we
   already trust, is it routed to the lane that can act.
4. **`SEND BACK: <reason>` is a complete answer.** Rejecting an item with a reason is
   finishing it. Silence is not.

---

## 1. MAIN'S JS GATE IS RED — 5 of 326 suites, and 4 are one cause

Reproduce first: `for f in draft/tests/*.test.js; do node "$f" >/dev/null || echo "$f"; done`

**Four of the five are the 03:49 board rebuild landing without its derived artifacts.**

| suite | symptom |
|---|---|
| `vona_wire_bench` | `draft/data/wire_level.json` does not match a fresh run of `wire_level.js` |
| `wire_one_source` | seat plan **WR 11.1 vs measured 10.85**, **n 113 vs 114** — stale by one player |
| `proj_sd_arm` | **164 of 535** banded rows disagree with the measured table; **Gibbs, Bijan, CMC declare `measured` while carrying a different sd** |
| `shadows` | 44/46 — both failures are the pick-33 **controls**, so the section is unanchored |

`wire_level.json` and the seat plan are pure recomputations from committed inputs —
regenerate them. **`proj_sd_arm` is different and more serious:** a row claiming a
provenance it does not carry is a false statement about three of the biggest names on
the board, four days out. Find out whether the board or the table is wrong before
regenerating either.

**Ask Rule 3g on this one:** if a rebuild can desync three artifacts silently, what
else derives from the board that has no parity test at all? TODO #46 says a central
freshness registry was supposed to make this class impossible.

## 2. `intervention-rate` — 8/9, and it needs a RULING from you, not a fix

The red is `no term is dead unexpectedly -> ["keeper"]`.

**Already diagnosed, do not re-diagnose it.** Cory's keepers cost rounds 1, 2 and 3,
so his first pick is 33. Keeper option value lives in the players taken in exactly
those rounds — 36.1 Gibbs, 33.3 Bijan, 26.5 Nacua, 21.8 Bowers. **At pick 33 the whole
remaining board tops out at 2.15, and at every later pick it is 0.00.** He is paying
for the keepers with the picks that could have bought new keeper value.

`intervention_rate.js` now reports reachability and splits it:
`deadUnreachable = tier, bye, need, risk, survival` (board max 0.00, could not have
fired under any recommendation) and `deadDefect = keeper` (board max **2.15**).

**`MATERIAL` is 2.00. The term is "reachable" by fifteen cents, on one of 120 picks,
by a player the engine correctly did not rank first.** Whether that counts as reachable
is a judgement about where the materiality bar sits and it is yours. It was left red
on purpose rather than tuned. Rule on it and the suite goes green either way.

## 3. MERGE OR SEND BACK — three branches carrying finished work

- **`claude/data-stewardship-setup-bo5h9j` (D) — 19 commits, pushed today, unmerged.**
  Three preregs committed *before* their arms existed; a public self-retraction
  (*"Amendment 2 kills the week-1 props result, and I withdraw what I reported"*);
  three graded nulls; six closed register rows including P0. **This is the loop Cory
  has been asking the whole project to close, and `main` cannot see any of it.**
- **`claude/fantasy-football-research-926y6z` (relay) — 3 items.** `robot-mock` back to
  green (**156/156**, was 146/148) by testing the design that shipped rather than the
  one it replaced; the reachability split above; and `lane_status.js`.
- **`claude/warroom-shell-rebuild-0817` (B) — 13 commits**, pushed today. Triage only —
  it is B's call whether it is ready.

## 4. WIRE THE THING THAT STOPS THIS RECURRING

`node draft/tools/lane_status.js` — add it to `ci.yml`. `ci.yml` is yours, which is why
this is an ask.

**Why it exists:** `ROUTES.md` carries 199 routed items — C 107, A 59, relay 23, B 9,
**and zero from D or E**. That is not a measure of their output. ROUTES is a mailbox; it
shows what a lane *wrote down*. **A branch with nineteen commits and no ROUTES entry is,
to every tool this project owns, indistinguishable from an idle lane.** The tool prints
one line per branch — commits `main` is missing, age, and a flag when both are large
enough to look stranded. Reports only: never merges, never deletes, never fails the
build. It separates old divergence from stranded work, so the five branches sitting
386-850 commits "ahead" with nothing newer than 08-10 do not bury the real row.

## 5. E'S QUEUE — six items unanswered since 08-17

**E's branch is fully merged; E is not the bottleneck.** The problem is inbound work
that never came back. Highest value first:

- **Q12 — six TEs ranked 65-126 spots above market, one-directionally** (Waller +126,
  Gesicki…). One-directional disagreement of that size is either the biggest edge on
  the board or the biggest defect on it, and nobody has ruled.
- The young-RB gap: Tuten −94, DJ Moore −86, Price −84, Tate −74, Sutton −53, all below
  market with **no stated model reason**. The prior is that we are wrong, not the market.
- Input policy / model ownership (`EDGE-DEFINITION.md` is E's scoreboard).

Either answer these or reassign them with a reason. Six items sitting nine days is a
routing failure, not an E failure.

## 6. THE TWO DECISIONS WAITING ON CORY — put them in front of him, do not decide them

- **The ADP-sd ratchet** (ledger P6, grade by 08-23).
- **The ceiling composite weight after 08-22** — three preregistered runs across two
  independent seed sets say a non-zero weight beats zero, held at zero through the
  draft deliberately because the no-change rule predates every result.

## 7. NEW, MEASURED TODAY — the opponent axis, and it is NOT for the board

`draft/backtest/opponent_strength.py`, five seasons, 25 tests. Opponent strength is the
only new axis the prior-art sweep did not find already inside the champion.

| | QB | RB | WR | TE |
|---|---|---|---|---|
| **draft-day** ρ, median of 4 year-over-year pairs | 0.063 | **0.329** | 0.095 | −0.006 |
| pairs positive | 3/4 | **4/4** | 3/4 | 2/4 |
| **in-season** ρ, median of 5 seasons (wk 1-9 → 10-17) | **0.320** | **0.276** | **0.174** | **0.258** |

Every ρ carries a 400-run label-shuffle null. **P57** — the weekly arm, all four
positions, built from weeks 1..W−1 of the *current* season — is the one to build; that
is the bar a weekly projection actually faces. **P58** (RB draft-day prior) is held
until after 08-22 and must not touch the board before then.

---

**When you finish an item, mark it in `ROUTES.md` with what changed.** A grade that
moved nothing is not a closed loop — `NOTHING — <reason>` is a legitimate outcome and
silence is not.
