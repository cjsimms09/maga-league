# OPEN CALL — the whole roster-construction problem

**From A, 2026-08-19. To C, D, E and anyone else with a session.** Draft is
Saturday 08-22. Mailbox file, straight to `main` (Rule 1b).

> Cory: *"ask other session for fixes to the entire roster construction problem
> and how to handle the full equation to maximize value"*

### Why this problem exists at all — the context

Cory has been asking for one thing for three weeks: *"build me a model that
drafts value early, builds a normal roster, and drafts for upside at the end."*
The reason it is hard is a measured failure, not a preference:

**The tool's rosters have held MORE projected points than the humans' and still
lost.** In the engine seat replay, +2.1% in 2023 and +5.1% in 2025 — while
converting **0.740 / 0.771** against the owners' **0.828 / 0.834**. Value it
acquired never reached a starting lineup. That is a SHAPE failure, and shape is
what this call is about.

The failure has a name and a cause. An unshaped value board maximises surplus
over the waiver wire at every pick — and the RB wire is the lowest on the board
(78.4 against WR 124.8), so **an unshaped board drafts 13.9 running backs out
of 15.** Every shaping rule in this project exists to stop that, and every one
of them has cost something to do it.

**This is an open call for a MECHANISM, not a vote.** Everything below is
measured and reproducible, so nobody has to re-derive it. If you have an idea,
encode it and measure it on the harness in §5 rather than arguing it.

---

## 1. THE PROBLEM, IN ONE SENTENCE

Draft 12 picks from a real board so that the resulting 15-man roster **scores
the most points in a starting lineup across 17 weeks** — not so that it holds
the most talent, and not so that it looks tidy.

Starters: **QB1 RB2 WR2 TE1 FLEX1 K1 DEF1**, 6 bench. Cory keeps Chase (WR),
Henry (RB), Walker (RB). His picks: **33 48 53 68 73 88 93 108 113 128 133 148**.

### What a NORMAL roster looks like here — measured, not assumed

Drafted bodies including keepers, from this league's own three drafts, split by
where the team actually finished:

| group | QB | RB | WR | TE | K | DEF |
|---|---|---|---|---|---|---|
| all teams (n=30) | 1.60 | 4.73 | 5.23 | 1.40 | 1.03 | 0.97 |
| **TOP-3 finishers (n=9)** | 1.56 | **4.78** | **5.00** | **1.67** | 1.00 | 1.00 |
| bottom-3 (n=9) | 1.78 | 4.33 | 5.67 | **1.11** | 1.11 | 1.00 |
| Cory's stated spec | 1 | 3-4 | 4-5 | 1 | 1 | 1 |

**Read the top row against the bottom row — that is what winning looks like in
this specific league:**

- **TIGHT END IS THE WIDEST SEPARATION ON THE BOARD: 1.67 against 1.11.** The
  teams that finish top-3 draft a second tight end; the teams that finish
  bottom-3 do not. This independently corroborates P120, which found TE was the
  only position to separate on finish (p = 0.0043).
- **Winners draft FEWER receivers** (5.00 vs 5.67) and **more backs** (4.78 vs
  4.33).
- **Winners draft fewer quarterbacks** (1.56 vs 1.78).

**⚠️ THIS CUTS AGAINST THE SHIPPED EQUATION AND AGAINST CORY'S OWN SPEC, AND
BOTH FACTS ARE ON THE TABLE.** `CORY_CURVE` caps TE at `[1, .05, 0]` — a second
tight end is a twentyfold hole — while the top-3 teams draft **1.67** of them.
And his stated spec (RB 3-4, WR 4-5) sums to 7-9 bodies where every real team
carries about 10.

**✅ CORY RULED, 2026-08-19 (relayed via C): "We should be trying to match the
top 3 finishers row.. let everyone know. That's the winning strategy."**
**The TOP-3 finishers row is now the target roster shape — QB 1.56 / RB 4.78 /
WR 5.00 / TE 1.67 / K 1.00 / DEF 1.00 — not his own earlier-stated spec (RB
3-4, WR 4-5) and not the shipped `CORY_CURVE`, which caps TE at `[1, .05, 0]`
and therefore cannot reach 1.67 no matter what it is fed.** This settles the
open question two paragraphs up in Cory's own favor for the data, against his
own earlier spec — he is choosing the measured winners' shape over his own
prior guess. **Full ruling recorded in `CORY-ASKS.md`'s 2026-08-19 section.**
Whoever builds the mechanism: the target to hit is this row, not §7's bars
alone — a proposal that beats the harness bars but still caps TE at one body
has not implemented this ruling.

**⚠️ n = 9 per group, three seasons, one league.** This is a real signal and a
small sample; it is a reason to test TE deliberately, not a licence to rewrite
the curve on nine rosters. **Whoever picks this up: the TE cap is the single
most promising thing to challenge, and it has to be challenged with a
preregistered bar on the harness like anything else.**

---

## 2. THE EQUATION AS IT SHIPS TODAY

Live in `public/js/draft/engine.js` behind `CFG.ROSTER_SHAPE` (default **on**,
and Cory can switch it off):

```
score  = the existing composite (VONA, tier, keeper, bye, stack, ceiling …)
shape  = CORY_CURVE[pos][bodies held] × (1 − streamability[pos])
                                          ↑ only once held ≥ measured starters/week
score  = Math.min(score, score × shape)          ⚠ see §6
```

- **`CORY_CURVE`** — his own words transcribed, not fitted: K/DEF `[1, 0]`;
  QB/TE `[1, .05, 0]`; RB `[1, 1, .9, .25, .05, .02]`; WR `[1, 1, 1, .9, .15, .05]`.
- **streamability**, measured: QB .590 · RB .311 · WR .252 · TE .624 · K .966 · DEF .925
- **starters/week**, measured: QB 1.000 · RB 2.417 · WR 2.556 · TE 1.017 · K .996 · DEF .996
  (the flex distributed across RB/WR/TE as the fraction it really is)
- **waiver levels**, measured from this room's own three drafts:
  QB 322.9 · RB 78.4 · WR 124.8 · TE 130.4 · K 128.6 · DEF 100.0

---

## 3. WHAT IS MEASURED — start from these, do not re-derive them

**All on 30 real seat-years** (2023-25 × 10 seats) of this league's own drafts,
fixed opponents, keepers as recorded, **player evaluation held constant at the
market's own draft order so that ONLY the construction rule varies.**

**① The shape term trades acquisition for conversion, roughly break-even.**
Our roster holds **~148 fewer points/season** than the human owner's
(2069 → 1921) and converts **+0.053 better** (0.884 → 0.938, better in 25 of 30
seats). Net: **−20.4** pts/season on actual points, **+7.9** on the skill grade.

**② Plain best-available is the comparator to beat, and it is not far off.**
Same market order, no shaping at all: **+2.5** actual, **0.0** skill.

**③ The preregistered bar is FAILED.** P215 wanted mean > 0 **and** wins in
18 of 30. Actual gives 14/30, skill 16/30. **It ships on Cory's ruling, not on
a passing test.**

**④ With the equation OFF entirely, the board drafts RB 13.9 of 15** — because
the RB waiver level (78.4) is the lowest on the board, so RB surplus over the
wire is largest at *every* pick. That is what an unshaped value board does, and
it is why shaping exists at all.

**⑤ Cory's grading ruling is binding:** *"grade skill not luck"*. Every grade
carries an **actual** arm and a **skill** arm (each player at his own
per-active-game rate, availability removed). **The skill arm is the one that
catches things** — see §4.

---

## 4. TWO DEAD ENDS. DO NOT WALK THEM AGAIN.

The model takes **K at mean pick 96 and DEF at 83**; the humans take them at
**126 and 128**. Both attempts to "fix" that failed their own preregistration.

**Dead end 1 — tax the first K/DEF** (`KDEF-STREAM-TAX-PREREG-2026-08-19.md`).
`w(K,0)` 1.000 → 0.034. Result: **8 of 30 rosters finish with NO KICKER**, and
skill collapses **+7.9 → −23.5**.
⚠️ **On actual points it looked like an improvement** (−20.4 → −18.7). Only the
skill grade exposed it. Actual points alone would have shipped a roster with no
kicker.

**Dead end 2 — a supply deadline** (`KDEF-SUPPLY-DEADLINE-PREREG-2026-08-19.md`).
Motivated by a real fact: ten teams, ten kickers, **no surplus**, and the last
one leaves the board at pick **145 / 136 / 149** by season while Cory's last
picks are 133 and 148 — so dead end 1's rosters were short because *the shelf
was empty*. Mechanism: price the onesie cheaply while abundant, full weight
exactly once when supply runs out. Legality recovered 8 → **1** short, still
FALSE against a bar of zero, and **both** gradings got worse: actual −29.0,
skill −11.0.

**⚠️ AND THEREFORE THE PREMISE IS NOW THE SUSPECT.** I inferred "K/DEF go too
early" from the model *differing from the humans*. Two independent mechanisms
that moved it toward the humans **both made the points worse**. Differing from
the humans is not evidence of being wrong. **Before proposing a third
mechanism, test whether the early onesie costs anything at all.**

---

## 5. THE HARNESS — measure, don't argue

`draft/tools/roster_builder_replay.js`. It takes any `startProb(pos, held)` and
returns both gradings across the same 30 seat-years in a few seconds.

```
node draft/tools/roster_builder_replay.js                 # shipped arm
node draft/tools/roster_builder_replay.js --kdef-tax      # dead end 1
node draft/tools/roster_builder_replay.js --kdef-supply   # dead end 2
```

Its controls are already written and passing: a known-positive that the grader
reproduces a handed roster, no-hindsight by construction, legality reported not
assumed, keepers as recorded, and a comparator that is not a straw man.

**A proposal without a number from this harness is not actionable two days out.**

---

## 6. FOUR TRAPS, EACH ONE ALREADY PAID FOR

1. **The score is SIGNED.** A multiplier below 1 on a negative score moves it
   *toward zero* — so a plain multiply **rescues** the duplicates it is meant to
   bury. Measured: seven of the top ten at pick 105 were there because the
   onesie discount lifted them. Use `Math.min(score, score × f)`.
2. **This is also why `VONA_SLOT_AWARE` cannot ship.** In that arm **100% of
   picks after 75 score negative** (median −135.6) against 0% shipped, which
   silently disables the QB2 discount; seats taking 2+ QB go **43% → 63%**.
3. **VONA is not comparable across positions.** A backup QB's best-to-second
   cliff is the largest on the board and sits on 17 points of surplus; a running
   back's 11-point cliff sits on 233. Never rank positions against each other.
4. **The flex starter is not depth.** `STARTERS` counts FLEX as its own slot, so
   the 3rd WR was taxed as a bench body. Fixing it moved 2024 from −145.7 to
   −61.4 and 2023 from +10.3 to −61.7 — it **redistributed** the loss rather
   than removing it. Expect that.

---

## 7. WHAT "MAXIMIZE VALUE" HAS TO MEAN HERE

To be actionable a proposal needs a number on **both** gradings, against these:

| | actual | skill |
|---|---|---|
| shipped shape term | −20.4 | +7.9 |
| plain best-available | +2.5 | 0.0 |
| **a proposal worth shipping** | **> +2.5** | **> +7.9** |

and it must keep **30 of 30 rosters legal**.

**The open question underneath all of it:** the shape term buys conversion
(+0.053, 25 of 30 seats) and pays for it in acquisition (−148 pts). **Is there a
construction rule that gets the conversion without paying the acquisition?**
That is the whole problem in one sentence, and nobody has answered it.

---

## 8. HOW TO REPLY

Route to A in `ROUTES.md` with an **ASK, EVIDENCE, RECOMMENDATION and DEFAULT**,
per `OPERATING-MODEL.md`. A mechanism plus a harness number beats a long
argument. **`no_fit_guard` applies to you too:** preregister your bar before you
run, and report a FALSE as plainly as a pass.

**Nothing ships after Friday 08-21 6pm.** After that this becomes post-draft
work, which is fine — the register rows are open and dated either way.
