# Your equation got 5 of 6 cells on the FIRST try. Both of my "fixes" made it worse.

**A, 2026-08-19.** Cory: *"the correct equation will normally draft 3-4WR, 3-4RB,
1Qb, 1TE, 1 def, and 1 K normally!!! and extract the most value out of draft in
the process."*

**Three preregistered arms, all FALSE, and I am stopping there because the prereg
said I would.** But the pattern across the three is the finding, and it is not
the one I expected.

---

## THE THREE RUNS, ON YOUR REAL TWELVE PICKS

| arm | drafted | cells hit | value vs `draft_plan` |
|---|---|---|---|
| **P144 — `P(ever needed)` × margin** | **QB2 RB3 WR4 TE1 K1 DEF1** | **5 of 6** | **+4.0%** |
| P146 — `E[weeks started]` × margin | QB1 RB2 WR3 TE3 K2 DEF1 | 3 of 6 | −6.9% |
| P147 — + flex fix + UNPRICED floor | QB1 RB3 WR2 TE1 K2 DEF1 | 4 of 6 | −19.9% |

## ⭐ THE FIRST ONE IS THE ANSWER, AND IT IS YOURS

**One equation. No seats, no shortlist, no cap, no weights:**

```
value(p) = need(pos, how many I already hold) × ( proj_mean(p) − waiver_level(pos) )
```

**It drew 3–4 WR ✅ · 3–4 RB ✅ · exactly 1 TE ✅ · exactly 1 K ✅ · exactly 1 DEF
✅ — and it extracted 4% MORE projected value than the seat plan.** Five of your
six cells and the value clause, from one line, with nothing imposed.

**Your mechanism is the reason it works.** RB and WR are injured more *and* their
wire is barren (RB 112, WR 124), so need stays high and the margin stays large.
TE and K and DEF have deep wires and one slot each, so the second one prices near
zero and never gets taken. **That is your sentence, and the equation reproduces
it without being told.**

**The one miss is QB2** — it took Prescott and Purdy, because a QB's margin over
a 319-point wire is still 35 points.

## WHAT I GOT WRONG TWICE

**P146.** I said the fix was expected *weeks started* instead of probability —
a QB2 plays one week, an RB4 plays many. **The reasoning is sound and the result
was worse:** it fixed QB and broke TE (3), K (2) and RB (2), and cost 7% of the
value.

**P147.** I then fixed two genuine defects in my driver — a self-reinforcing flex
chase that promoted TE to a two-slot position, and a missing UNPRICED floor that
let a second kicker in at value 1.0. **Both fixes were correct and the result got
worse again: −19.9%, WR down to 2.**

**Three attempts, and the version I started with is the best one. I over-corrected
twice on a result that was already nearly right, which is its own lesson and the
reason the prereg capped me at three.**

## WHAT IS ACTUALLY OPEN

**Only the second quarterback.** Everything else in your specification fell out
of the equation on the first run. **The honest statement of the remaining problem
is narrow: a backup QB's margin over the waiver line is ~35 points, and nothing
in `need × margin` knows he will only ever play one week of it.** That is a real
gap, my expected-weeks fix was the right *idea*, and it needs to be applied to QB
without collapsing TE and K — which is a post-draft job, not a Friday one.

## ⚠️ AND THE HONEST LIMIT ON ALL THREE

**Every arm drains the room in strict ADP order.** The real draft will not.
**None of this is graded against outcomes** — it is shape and projected points on
one board. `no_fit_guard` holds: **nothing is selected from this, no cap was
added, and none of it ships before Saturday.**

## YOUR ROADMAP, WHICH I AGREE WITH AND WOULD ORDER THIS WAY

You said: *"once we fix this we need to work on getting more data for better mean
proj and ceilings. then we fine tune our drafting strategy by round."*

**That is the right order and this is a good stopping point on step one** — the
equation works, one cell is open, and it is post-draft.

⚠️ **One correction to step two before it starts costing money:** we measured
today that **more projection SOURCES is not the bottleneck** — your first nine
rounds are already priced by five, and 91% of your draft range already carries
FantasyPros. **The two things that would actually move `proj_mean` and `ceiling`
are a market/betting feed (we have zero of those) and expected fantasy points
built from the 98,263 play-by-play rows already on our disk.** Neither is a sixth
projector. `DUPLICATE-A-REAL-MODEL-2026-08-19.md` §§5–6, 10.

---

# ADDENDUM — P148 was a DUPLICATE of P146, and I preregistered it on a false premise

**Cory: *"then adjust the need down"*. I filed P148 as *"P144 with exactly one
substitution"* and claimed P146 had changed that substitution **"alongside a
buggy flex chase."**

**That was false. P146 used the SAME flex chase as P144** — the flex fix did not
arrive until P147. **So P146 already WAS the isolated single substitution, and
P148 re-ran it under a new name and produced byte-identical output:**
`QB1 RB2 WR3 TE3 K2 DEF1`, −6.9%, the same twelve players.

**Rule 3i again, on my own code this time: I asserted what a previous arm had
changed without reading it.** That is the sixth instance today and the first
against source rather than data.

## SO THE REAL RESULT, STATED HONESTLY

**The single substitution — weighting a backup by how much of the season he plays
instead of by whether he is ever needed — DOES fix the quarterback and DOES break
tight end and kicker.** That is now measured twice under two names.

**And the mechanism is identifiable: the flex chase.** Once `E[weeks]` decays the
RB and WR weights, the flex goes to TE, which raises TE's slot count from 1 to 2,
which makes a **second tight end a "starter" at weight 1.0.** P144 never triggers
it only because its higher `P(ever needed)` weights keep RB and WR holding the
flex.

**P147 fixed the flex correctly and then lost on a floor I set arbitrarily at
1.0** — a second kicker priced at 1.06 and slipped through by six hundredths.

## WHERE I AM STOPPING, AS THE PREREG SAID I WOULD

**Four arms. The prereg capped me at three and said the response to failure is a
stated limit, not more tuning. So:**

> **The one-equation form produces five of Cory's six cells and +4% value on its
> first and simplest version. The sixth cell — the second quarterback — is not
> fixed by any of the three changes I tried, and each attempt cost value.**

**The untried combination is `E[weeks]` + the roster-based flex + no arbitrary
floor.** I can see it, I have not run it, and **I am not running it tonight** —
because a fifth arm chosen after seeing four results is exactly the search that
`no_fit_guard` exists to stop, and because the honest thing to hand Cory is
"five of six, here is the open one" rather than a number I hunted for.

**It is the first thing to run post-draft, preregistered, on a fresh board.**
Register 111.

## WHAT THIS DOES NOT CHANGE

**Your equation is right and the evidence for that is P144, not my three
attempts to improve it.** One line, no cap, no seats, no weights — 3–4 WR, 3–4
RB, 1 TE, 1 K, 1 DEF, and more projected value than the seat plan. **The
mechanism you described is doing the work.**
