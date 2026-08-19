# Saturday: you have three plans, and they agree on THREE PICKS OUT OF TWELVE

**A, 2026-08-19.** All three computed on the same board (`built_at 08:58`), your
real twelve picks, your real three keepers. **REPORT ONLY — none of this is
wired into the war room.**

---

## ⚠️ FIRST, THE THING THAT MATTERS MOST: THEY ARE NOT THREE INDEPENDENT OPINIONS

`vona_upside_plan.js` **imports `draft_plan.js` and uses its seat assignment
verbatim.** So "the plan" and "the upside plan" share their entire skeleton and
differ only in how bench seats are filled. **There are TWO independent
constructions here, not three**, and any agreement between those two is close to
tautological.

The real comparison is **the shipped engine (what the war room shows you) against
the plan family**:

| | |
|---|---|
| **players BOTH want** | **3** |
| engine only | 9 |
| plan family only | 15 |
| within the plan family (not independent) | 6 of 12 |

**Three of twelve. The tool does not speak with one voice, and I am not going to
dress that up.**

## ⭐ THE THREE BOTH CONSTRUCTIONS WANT

| ADP | | player |
|---|---|---|
| 60 | WR | **Jameson Williams** — plan + upside + engine |
| 81 | RB | **Tony Pollard** — plan + engine |
| 93 | WR | **Alec Pierce** — plan + upside + engine |

**These are the only three names on your board that two structurally different
models both reach for. If you take nothing else from this sheet, take those.**

## WHAT THE ENGINE WANTS AND THE PLANS DO NOT

| ADP | | |
|---|---|---|
| 43 | TE | Colston Loveland |
| 56 | RB | Bhayshul Tuten |
| 76 | RB | Rhamondre Stevenson |
| 107 | QB | Brock Purdy |
| 113 | RB | Rachaad White |
| 118 | RB | Aaron Jones |
| 139 | WR | Xavier Worthy |
| 155 · 192 | K · DEF | Jason Myers · Jacksonville |

## WHAT THE PLANS WANT AND THE ENGINE DOES NOT

| ADP | | | who |
|---|---|---|---|
| 41 | RB | Travis Etienne | plan + upside |
| 51 · 52 | QB | Drake Maye · Joe Burrow | plan / upside |
| 75 | TE | **Kyle Pitts** | plan + upside |
| 93 | RB | Jonathon Brooks | upside |
| 120 · 128 | K · DEF | Brandon Aubrey · LA Rams | plan + upside |
| 138 · 143 | RB · WR | Zach Charbonnet · Matthew Golden | upside |
| 156 · 164 | RB · WR | Chris Rodriguez · Jalen Coker | upside |
| 109 · 156 · 160 · 179 | | Gainwell · Shakir · Strange · D.Jones | plan |

## WHY THEY DISAGREE — one reason, and it is the whole of this week

**The engine has no seat structure.** It scores every player with one number and
takes the best, so it draws **RB7 / TE1 / QB1** and fills the middle rounds with
backs. **The plan family assigns your twelve picks to your six open starting
slots first**, so it takes a quarterback and a tight end in the middle rounds
where the engine takes a fourth and fifth running back.

**That is not a tuning difference. It is a different question being answered** —
"who is worth most" against "which seat do I still need". Neither has been graded
head to head on outcomes.

**What IS measured:** `draft_plan.js` scores **1957.55** against the engine's
greedy line at **1917.58** on this exact board and schedule, and **+21.0 of that
40 comes back just by making the engine fill the plan's seat** rather than take
its own #1 (`public/seat_plan.json`). That is one board, not a grade.

## HOW I WOULD USE THIS AT THE TABLE

1. **The three consensus names are your highest-confidence targets.**
2. **Where they disagree, the disagreement is structural, so ask yourself the
   structural question:** do I still need this seat? That is the question the
   engine cannot ask and it is the one that has been wrong all season in the
   replay (conversion 0.74/0.77 against owners' 0.83).
3. **The upside picks are late-round swings and they are unproven twice over** —
   the upside term has never been graded, and `own_v6` puts four of the five in
   the bottom quartile of its own position. **Do not spend a middle-round pick on
   one.**

## THE STANDING LIMITS, RESTATED

- **All three assume the room drafts near ADP.** It will not. Every plan is a
  starting point to re-solve from, not a script.
- **The board rebuilds at 03:00 draft morning.** These are computed on the 08:58
  board; re-run all three after the rebuild.
- **Nothing here is graded against outcomes.** The engine has a seat replay that
  says it finishes 8th of 10; the plan family has +40 on one board; the upside
  term has nothing until January.

Run them yourself:
`node draft/tools/draft_plan.js` ·
`ARM=capped node draft/tools/vona_upside_plan.js` ·
`node draft/tools/fieldability_probe.js`

---

# ADDENDUM — I ran rule 3i on my own headline, and it changed the story

**"They agree on 3 of 12" sounded alarming. Before leaving it as a finding I
looked at the distribution it came from** — every pairwise overlap among all six
arms on this board, 15 pairs.

| comparison | overlap of 12 picks |
|---|---|
| **within the ENGINE family** (shipped · slot_aware · need1 · auto — **same skeleton, only WEIGHTS differ**) | **median 7**, range 5–8 |
| `plan` vs `upside` (**same skeleton**, different bench rule) | **6** |
| **ENGINE vs PLAN family** (**different skeletons**) | **median 2**, range 2–4 |

**So 3 of 12 is not anomalous. It is exactly what a cross-skeleton comparison
costs, every time — the eight such pairs run 2 to 4.** My headline was accurate
and its implied alarm was not. Corrected here rather than left to stand.

## ⭐ AND THE NUMBER UNDERNEATH IT IS THE BIGGEST RESULT OF THE WEEK

> **Changing the WEIGHTS moves about 5 of your 12 picks.
> Changing the SKELETON moves about 10.**

Every argument this project has had — the `ceiling` weight at 0.45, `need` at 0
against 1.0, slot-aware on or off, the ADP-sd ratchet — **is a move inside the
engine family, and the engine family agrees with itself 7 times in 12.** The one
structural choice nobody has ever ruled on — *fill the best seat* against *take
the best player* — **moves twice as many picks as all of those weights put
together.**

**That is measured on 15 pairs on one board, and it is the cleanest statement of
where this model's decisions actually live.**

⚠️ **WHAT IT DOES NOT SAY.** Overlap is not quality. **Two arms agreeing tells
you nothing about which is right**, and the skeleton question has still never
been graded head to head on outcomes — `draft_plan.js`'s +40 is one board, and
the engine's 8th-of-10 is a different harness. **This says where the leverage is,
not which way to pull it.**

**And it is one board.** The 03:00 rebuild could move these overlaps; the ranking
of within-skeleton against cross-skeleton is what I would expect to hold, not the
exact counts.
