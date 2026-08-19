# PREREGISTRATION — a bench body starts in his BEST weeks, so pricing him at his mean is wrong

**A, 2026-08-19, committed BEFORE the run.**

Cory: *"Keep working on equation!! Make it work"* — and, earlier,
*"the 0.45 ceiling seems dumb… I am wanting ceiling later in draft, wnat it to
ramp up. no reason to take ceiling by a random value?"*

**This is that ramp, derived instead of chosen. And working it out says his two
messages today are one request.**

---

## 1. WHY QB2 KEEPS SURVIVING — eleven arms, and I think the diagnosis was wrong

Every arm attacked the second quarterback by making him cheaper. **He is not
obviously overpriced.** At pick 128 the model takes him because **everything
else left prices near zero** — P149 measured the last two picks of a
twelve-pick draft at **0.6 and 0.0**, where `draft_plan.js` refuses outright and
prints UNPRICED.

**So the leak is not that QB2 is too dear. It is that late picks in general are
priced at nothing, because the equation prices only EXPECTED points.** Cory said
the same thing in his own words weeks ago and I built a positional argument
instead.

## 2. THE DERIVATION — the quantile is the start rate

A body who starts **17%** of weeks does not start in seventeen average weeks. **He
starts in his best 17% of weeks** — that is what a lineup decision IS. So the
statistic that belongs in his valuation is not his season mean; it is roughly
**the upper quantile of his own week-to-week distribution at his own start
rate.**

```
C(p, n) = quantile of p's outcome distribution at  1 − P(start | available, n)
```

**A starter you play every week is priced at his mean (quantile ≈ 0.5). A body
who starts a sixth of the time is priced near his 83rd percentile.** The ramp
Cory asked for falls straight out, **and its size is the start rate — not 0.45,
not anything I picked.**

⭐ **AND THE MECHANISM THAT SHOULD FIX QB/TE RATHER THAN JUST INFLATING
EVERYTHING:** the lift a body gets is proportional to **his own dispersion.** A
veteran backup quarterback behind a deep wire is a *low*-dispersion body — he
gains almost nothing. A young receiver with a wide range gains a lot. **The ramp
should therefore move picks AWAY from QB2/TE2 and toward exactly the late upside
Cory has been asking for, without any positional rule.**

## 3. ⚠️ AND THE HONEST DEPENDENCY — THIS IS WHY DRAFT SHARKS MATTERS

**This equation is only as good as the per-player dispersion feeding it, and
ours is weak by our own register.** Register 103: `proj_ceiling_source` says
`cross-source-p90` but the computation is **`mean + 1.28 × sd` over three
sources** — a normal approximation to *cross-source disagreement*, which is not
the same quantity as a player's week-to-week range. Register 112: the board
carries **exactly one `games_expected` per position**, so availability carries
no player-specific information at all.

**Cory's "I would like to use their projections, they include ceiling and floor"
is not a separate request. It is the input this equation needs.** Reported
either way, and the same arm re-runs the day C's data lands.

## PREDICTIONS

**P179 — the derived quantile ramp removes the QB/TE leak with no positional
rule.** Same 300 rooms, same picks and keepers, on the **ROSTER**:

- **(a)** QB ≤ **1.15** and TE ≤ **1.20**
- **(b)** RB stays in **4–5** and WR returns to **4–5**
- **(c)** K and DEF stay at **1.00**

**FALSE if any misses.**

**P180 — and it works by DISPERSION, not by a general lift.** Among the players
the ramp promotes into the roster, **median residual upside is at least 1.5×
that of the players it displaces.** **FALSE under 1.5×** — in which case the
ramp is just adding a constant to everybody late and the mechanism is not what
§2 claims, whatever the roster looks like.

⭐ **P180 is the one that matters. P179 can pass for the wrong reason; P180 is
how I find out.**

## CONTROLS

1. **KNOWN POSITIVE (rule 3e).** With the ramp disabled the run must reproduce
   the committed P177 artifact **exactly**. If the no-op arm moves, the change
   does more than it claims.
2. **THE DISPERSION INPUT MUST BE MEASURED BEFORE IT IS USED, not assumed.**
   Report the coefficient of variation of residual upside among players at ADP
   100–200 — the range where the leak happens. **If it is near zero the band is
   a positional constant and P179's result is uninterpretable**, which is a
   finding about our data rather than about the equation.
3. Roster counts include keepers (register 116). Both columns printed.
4. Sources must have passed their own controls.

## GUARD

**REPORT ONLY.** `draft_plan.js`, `engine.js` and the war room are untouched.
**Cory has told me to keep working on the equation, and that is not a licence to
select an arm from a sweep:** this is one preregistered arm with bars written
before it runs, including P180 which is designed to fail if P179 passes for the
wrong reason. **Nothing ships before Saturday.**
