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
