# The analyzer, end to end — and the first cross-tool coherence measurement

**Two questions. The first has three answers and none of them is yes. The second
produced a number, and the two surfaces disagree.**

---

## PART ONE — DOES THE ANALYZER EMIT GRADEABLE PREDICTIONS?

### 1. IT EMITS NOTHING AT ALL

`routes/standings.js` computes a playoff probability, an expected win total and a
seed distribution for every team, on every render. **It `require`s exactly two
modules — `lineup` and `playoffs`.** No `predledger`, no forecast, no ledger
call, anywhere in 298 lines.

> **The analyzer's probabilities exist for the duration of one HTTP response and
> are then gone.** Nothing it says about the season in front of us can ever be
> graded, because nothing records it.

Its only grading is `validateStandings()`, which is **retrospective** — it
re-derives 2023–25 predictions *today* and scores them. That is a useful
backtest and it is not a forward record. **This is the same shape as the
weekly-claims gap — a real, enforced rail with nothing on it — one tool over.**

### 2. TWO OF THE THREE THINGS YOU ASKED ABOUT DO NOT EXIST

| asked | status |
|---|---|
| playoff odds | ✅ computed (not emitted — see above) |
| championship probability | 🔴 **not computed.** The simulation stops at the SEED: it counts who finishes top-`spots` and **never plays the bracket.** |
| expected dollars | 🔴 **not computed — and the file says it is.** |

**The docstring claimed the simulator builds "each team's win distribution,
playoff odds, seed distribution and expected payoff."** Grep the file: `payoff`
occurred **once**, in that sentence. Nothing computed it.

**Rule 11e, in the most direct form it has taken yet** — a source scan cannot
distinguish an implementation from a comment describing one, and this comment has
been read as a feature. Corrected in place, with the reason, rather than deleted.

### 3. THE ANALYZER DOES NOT BEAT ITS OWN DECLARED BASELINE

The file states its own bar, unprompted: *"Naive baseline: predict the playoff
teams as whoever leads in wins RIGHT NOW… **If the simulator can't beat this, it
isn't earning its complexity.**"*

```
TOP-4 ACCURACY: 28/36 = 78%   (naive current-standings baseline: 27/36 = 75%)
```

**One pick in thirty-six.** Paired per checkpoint — the honest unit, since both
arms see the same nine season-checkpoints:

```
per-checkpoint difference:  0, 0, +1, −1, 0, +1, 0, 0, 0
mean +0.111 picks    95% CI ±0.393    n = 9
```

> **The interval spans zero comfortably.** On its own declared standard, the
> simulator is **not shown to be earning its complexity** — and the number that
> would have said so has been printed at the bottom of a validation run for
> weeks with nobody computing the interval.

**This is not a claim that the simulator is worthless.** n = 9 checkpoints is
thin, the two arms agree on most picks by construction (both are largely reading
current standings), and top-4 hit-count is a coarse metric that throws away the
probabilities. **It is a claim that the evidence offered does not support the
conclusion drawn**, and the fix is to grade the probabilities — which is exactly
what the emission above now makes possible.

### 4. THE CALIBRATION IS COMPUTED, PRINTED, AND NEVER JUDGED

```
    0-10%    predicted~5%   actual   0%  (n=34)
   30-40%    predicted~35%  actual 100%  (n=3)
   40-50%    predicted~45%  actual  29%  (n=7)
   70-80%    predicted~75%  actual  44%  (n=9)   ← the worst, and not a small bucket
   90-100%   predicted~95%  actual 100%  (n=10)
```

**Bucket-weighted squared calibration error: 0.0339 over n = 90.** For
comparison, every probability component in `component_specs.js` declares a
materiality bar of **0.02**.

The 70–80% bucket resolving at **44%** is a real overconfidence signal at a real
sample size. **No verdict is attached to any of this** — the table prints and the
run exits 0. There is no bar, no baseline, and no statement of what would count
as badly calibrated.

### WHAT I BUILT FOR PART ONE

**`src/analyzer_claims.js`** — the emission, on the same discipline as
`weekly_claims.js`:

- **playoff probability** per team per checkpoint (`probability`, Brier + bin),
- **expected wins** per team per checkpoint (`point`, signed + absolute error) —
  emitted *beside* the probability deliberately, because it is the quantity the
  coherence check compares, so grading it says **which** surface was wrong when
  they disagree rather than only that they did.

**The cut is frozen into the resolution rule.** "Makes the playoffs" would
silently mean something different the year the league changes `playoff_teams`,
and this season's claim would be graded against next season's cut.

**And it refuses what does not exist.** `NOT_EMITTED` records championship
probability and expected dollars as data — the reason, what each would need, and
for the bracket, an explicit *do not derive it from `seed_dist` inside a claims
file*. Emitting placeholders would fill the ledger with entries January cannot
settle, which is the failure `weekly_claims.js` was written to avoid.

23 tests, including a rule-10d guard that asserts the emission's expected shape
against the **real** `projectStandings` rather than against my fixture of it.

---

## PART TWO — THE COHERENCE CHECK, BUILT AND RUN

### THE SPEC'S LITERAL FORM WOULD HAVE FAILED ON A HEALTHY PAIR

The check was specified as *"the product of the lineup tool's weekly matchup
probabilities should roughly agree with the analyzer's playoff odds."*

**Taken literally that product is P(win EVERY remaining game).** A 60%-a-week
team over seven weeks products to **2.8%** while expecting **4.2 wins**.
Implementing it as written would report a screaming divergence on two surfaces
that agreed perfectly. Pinned in the test file so it cannot be reintroduced
during a later "simplification".

So the per-matchup probabilities are carried the way they actually compose:
**simulate each remaining game, one winner per game**, accumulate win totals,
apply the same seeding rule. The coupling matters — two teams cannot both win the
same game — and a per-team independent binomial would break exactly that.

### THE THREE CHECKS

1. **A HARD IDENTITY, exact, no tolerance.** Across a week, the win
   probabilities must sum to the number of games, because every game has exactly
   one winner. This catches the bug `claims-cron` warns about in a comment and
   nothing verified: `playoffs.winProb` returns a probability against the
   **field**, not head-to-head, so a raw pair does **not** sum to 1. The cron
   normalises; nothing checked that it kept doing so.
2. **EXPECTED WINS** — the analyzer's `exp_wins` against the sum of the lineup
   side's per-week probabilities. Two independent routes to one number, needing
   no seeding and no bracket.
3. **PLAYOFF ODDS** — the analyzer's against the game-by-game simulation above.

**Independent, not circular.** The probabilities come from the lineup side; only
`seedOrder` and `playoffCut` are shared — deliberately, because a second seeding
rule would make a disagreement about **tiebreaks** look like one about
**probability**. Nothing consumes the analyzer's strength model, RNG or win
counts.

**Fails closed throughout.** A team that could not be compared is `UNRESOLVABLE`
and **blocks**, exactly as a divergence does — "we could not compare these" and
"these agree" must never render the same.

### THE RESULT — AND THEY DISAGREE

Tolerances declared before the run: **±0.15 playoff probability, ±1.0 expected
wins**.

| | | | |
|---|---|---|---|
| 2023 @wk4 | DIVERGES | 10pp / 1.41 wins | 4/10 teams |
| 2023 @wk7 | DIVERGES | 17pp / 1.24 | 2/10 |
| 2023 @wk10 | DIVERGES | 22pp / 0.79 | 1/10 |
| 2024 @wk4 | DIVERGES | 19pp / 1.82 | 5/10 |
| 2024 @wk7 | DIVERGES | 7pp / 1.00 | 1/10 |
| **2024 @wk10** | **COHERENT** | 9pp / 0.48 | 0/10 |
| 2025 @wk4 | DIVERGES | 19pp / 1.48 | 6/10 |
| 2025 @wk7 | DIVERGES | 13pp / 1.10 | 2/10 |
| 2025 @wk10 | DIVERGES | 22pp / 0.67 | 2/10 |

> **Eight of nine checkpoints exceed the tolerance. Worst: 22 percentage points
> of playoff probability and 1.82 expected wins.**
>
> **The identity holds exactly everywhere** — 74 week-checks, no drift. So this
> is not an arithmetic bug in either surface. **It is two different beliefs.**

### AND MY PREREGISTERED PREDICTION WAS WRONG

I wrote into the tool's docstring, before running it:

> *"`winProb` is a tanh capped at MIN_P/MAX_P and cannot express a 95%-favourite,
> so the claims side is structurally compressed toward 0.5 — the analyzer should
> be MORE extreme at both tails."*

**The opposite happened.** 2025 @wk7:

```
rid   analyzer   implied    Δodds     an.wins  im.wins    Δwins
  4       94%       98%      −4pp      10.45    11.30     −0.86
  5       82%       94%     −12pp       9.39    10.43     −1.04   DIVERGES
  3        5%        0%      +5pp       6.22     5.23     +0.99
  1        3%        0%      +3pp       5.59     4.84     +0.76
```

**The lineup-implied side is MORE confident at both ends, not less.** The
mechanism is the opposite of the one I named: the claims side treats team
strength as a **known constant** — season points-for, frozen — so a stronger team
wins with the same probability every week for the rest of the year and the
outcome compounds toward certainty. The analyzer draws each week's score from
`Normal(mean, sd)`, which injects week-to-week noise and keeps the season open.

**That is the disagreement in one sentence: one surface believes team strength is
known and weeks are the only uncertainty; the other believes the same about
scores but carries the score variance explicitly. Neither is obviously right, and
the product has been shipping both.**

---

## WHAT I WOULD DO WITH THIS

1. **Do not "fix" the divergence by making one side copy the other.** The
   coherence check's value is that it now *reports* the disagreement every run.
   Which surface is right is an empirical question, and as of today **both sides
   emit gradeable forecasts of the same quantity** — so one season of Brier
   settles it with evidence instead of argument.
2. **Grade the analyzer's probabilities, not its top-4 hit count.** The hit count
   is the metric that produced the unsupported "beats naive" reading; the
   probabilities are what the calibration table already shows are miscalibrated
   at 70–80%.
3. **Wire `analyzerClaims` into a weekly caller before Sep 1.** The payloads and
   resolutions exist and are tested; the caller is one call per claim, exactly as
   `claims-cron` is for the weekly side. **This is the piece with a real
   deadline** — a checkpoint not recorded in week 4 cannot be recorded later.
4. **Championship probability and expected dollars stay refused** until the
   bracket is simulated. The playoff pot is 53% of the money, so expected dollars
   cannot be priced from a seed.

## LIMITS, STATED BEFORE THEY ARE ASKED FOR

- **The implied side freezes points-for** for the seeding tiebreak, because the
  matchup probabilities carry a win chance and no score distribution. It biases
  toward whoever leads on PF at the checkpoint and only bites on exact win ties.
  A divergence concentrated in tied teams should be read as this.
- **Nine checkpoints over three seasons.** The divergence is consistent in sign
  and large relative to the tolerance, but the *rate* (8/9) is not a
  well-powered estimate of anything.
- **The tolerances are judgement calls, declared in advance** — one game, and
  fifteen points of probability (roughly the resolution of the only calibration
  evidence we have). A different reasonable pair would move which checkpoints
  are flagged, though not the worst-case magnitudes.
- **Silence rule (15) holds.** This is measurement and emission. Nothing here
  renders a new signal into a live decision surface.
