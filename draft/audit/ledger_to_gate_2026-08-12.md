# Does a graded result have a mechanical path to a weight?

**Cory, 2026-08-12: BUILT, PARTIALLY BUILT WITH THE GAP NAMED, or NOT BUILT — and
if not, hours and what it re-opens.** Read from the code.

---

## THE HEADLINE, AND IT CORRECTS THE QUESTION

**THE GRADUATION GATE IS BUILT AND RUNNING.** `draft/backtest/graduation_gate.py`,
called by `.github/workflows/ci.yml:171`. It parses the weights the engine
ACTUALLY LOADS out of `engine.js` source, reads what the experiments measured,
reports every disagreement, and **fails CI on an undocumented one**. It proposes
and never flips — by your 2026-08-10 design. Live output today:

```
free      bye      loaded 0.0   no arm clears $50 with a CI excluding zero
UNSETTLED ceiling  loaded 0.0   ablation EARNS (+95) vs build-up decoration — UNSETTLED
??        keeper   loaded 1.0   no participation arm covers this term
ok        need     loaded 0.0   matches HURTS (-51, CI excludes 0)
ok        risk     loaded 0.0   matches HURTS (-224, CI excludes 0)
free      stack    loaded 0.5   no arm clears $50 with a CI excluding zero
ok        tier     loaded 0.0   matches HURTS (-421, CI excludes 0)
ok        value    loaded 1.0   matches EARNS (+267, CI excludes 0)
```

**ITS EVIDENCE SOURCE IS `exp_participation.json`** — the Lab's retrospective
money Monte Carlo. **Not the prediction ledger.**

### AND HERE IS THE CORRECTION: THE LEDGER COULD NOT REACH A WEIGHT EVEN IF IT WERE WIRED

I have been describing this as "the loop from graded live forecasts to a weight
proposal is not closed", which implies one missing wire. **That is wrong, and the
reason matters more than the status.**

**FORECASTS AND WEIGHTS ARE DIFFERENT OBJECTS.** The ledger's registered kinds are
`recommendation, pick, survival, override, lrm, run, doctrine, doctrine_decline,
lineup_call, waiver_claim, stream_call, trade_eval, weekly_brief,
inseason_override, forecast, forecast_resolution`. **Not one of them resolves to a
statement about `tier` or `risk` or `ceiling`.** A graded survival forecast says
the survival model was calibrated; it says nothing about what the tier weight
should be. Connecting the ledger to the gate would deliver a stream of verdicts
about the wrong nouns.

**WHAT CAN REACH A WEIGHT IS A COMPONENT GRADE**, because a component is the same
kind of object a weight prices. That rail was built today — `src/component_grade.js`
and `src/component_specs.js`, six components declared with materiality bars,
cluster units and behavioural implications, all stated before any data.

**AND IT HAS NO CALLER.** Nothing writes `draft/data/component_grades.json`. The
only code that names that file is the standing check, which *reads* it and
currently reports the row as empty. So the missing link is narrower and more
tractable than "connect the ledger": **it is component grades → a file the gate
reads.**

**VERDICT: PARTIALLY BUILT.** Gate: built. Evidence side: built for the Lab,
absent for the season. The connector between them does not exist and neither does
its input.

---

## COST — the ledger-to-gate path

**~6h, and the risky hour is not the wiring.**

| step | hours | notes |
|---|---|---|
| a writer that runs `gradeComponent` over the week's realized data and appends to `component_grades.json` | 2h | the shape is already fixed by `component_specs.js` and the standing check already expects the file |
| the gate reads it as a SECOND evidence source, same propose-never-flip discipline | 1h | mechanical; `measured_verdicts()` gains a sibling |
| **the component→weight map, declared** | **1h** | which component's verdict speaks to which weight. `opportunity_adj` → nothing in the weight vector. `projection` → nothing. **Only some components map at all**, and saying which is the actual work |
| **the units bridge** | **2h, and this is the dangerous one** | the gate's bar is `MATERIAL_DOLLARS = 50.0`. Component grades are in **points per player-week** and **Brier**. Nothing converts them, and inventing a conversion is exactly the class of defect that produced the bench branch this morning — a term measured in one unit entering a sum denominated in another |

**WHAT IT RE-OPENS:**

- **`MATERIAL_DOLLARS`**, the gate's only threshold. A second evidence source in
  different units either needs its own bar or a conversion, and both are
  decisions rather than code.
- **Nothing else.** The gate proposes; it does not flip. So a wrong component
  verdict produces a wrong PROPOSAL that a human declines — which is the whole
  reason the review step exists and why this is a cheaper change than it sounds.

**AND IT CANNOT BE EXERCISED UNTIL THE SEASON.** Component grading needs weekly
realized data. Building the connector in September and discovering in January
that it was mis-wired is the failure this project keeps finding, so the writer
should ship with a **known-answer test** — synthetic pairs with a planted effect,
asserting the gate proposes the expected direction.

---

## AND THE ANNUAL'S JANUARY RECONSTRUCTION — NOT BUILT

`.github/workflows/annual.yml` is `workflow_dispatch` only, which is correct and
your design: one tap, your approval the only human step, `dry_run` defaulting
true, every change a PR.

**But the mandate text does not contain the reconstruction.** It covers grading
and corrections, then B's content generators, in a binding order. Candidate field
assembled from the season's residuals, replayed against the archived projections
and rosters, graded against the frozen baseline, **power reported alongside the
result** — none of it is in the prompt. It was specified and never wired.

**This is the fourth instance of the shape**, after the grading cron that existed
and never ran, the enforcement table's empty cells, and the projection archive
nobody had scheduled.

**COST: ~2h, and it re-opens nothing.**

| step | hours |
|---|---|
| write the reconstruction into the mandate — candidate field from residuals, replay, grade against the frozen baseline, report the detectable-effect floor beside every row | 1h |
| a `--reconstruct` entry point the mandate can call, so the prompt names a script rather than describing a procedure | 1h |

**Additive text plus one script. No existing behaviour changes.**

**THE DEPENDENCY THAT DECIDES WHEN, not whether:** the replay needs the weekly
projection archive to have in-season weeks, and it has none until the season runs.
The snapshot cron ships and skips cleanly through preseason, so the input arrives
on its own — but **wiring the mandate in September and first running it in January
means the first exercise is the real one**, which is precisely the pattern that
produced the four instances above. It should ship with a dry-run against 2025 as
its known-answer case, even knowing 2025's projections were never archived and the
run will therefore report "no input" — because **a mandate step that reports "no
input" is observably wired, and one that is never invoked is indistinguishable
from one that does not exist.**

---

## THE FRAMING, CONFIRMED AND CORRECTED

> *"Until the gate and the closed forward loop exist, the model can measure and
> record but it cannot update its own policy."*

**The forward loop closed — the resolver exists and grades. You are right that
half is now false.**

**The other half is TRUE, and more precisely than I said it.** It is not that the
gate is missing — the gate is built, runs in CI, and refuses to let a loaded
weight silently disagree with a measured one. It is that **the gate's only
evidence source is retrospective**, so a season of live measurement has nowhere to
arrive.

**SO: A REVIEW STEP IN A WORKING LOOP, OR NO LOOP AT ALL?**

**One working loop and one absent one, and they are different loops.**

- **Lab experiment → weight proposal → your review → weight.** Complete, running,
  and it has fired: the ceiling row currently reads UNSETTLED and CI fails if
  nobody documents it. **That is a review step in a working loop.**
- **Season of live evidence → weight proposal.** **No loop at all.** Not a
  missing wire — a missing input (component grades), a missing connector, and a
  units question underneath both.

**"Does this model get better every year" therefore has two answers today.** From
the Lab, yes, mechanically, with you in the loop. From the season, **only if you
read the report** — which is the state you described, and it is accurate for
exactly one half of the system.

**The ~6h above is what converts the second half from "Cory reads it" to "the gate
proposes it and Cory declines or accepts".** That is a smaller change than
"build a learning loop", and it is smaller precisely because the strict end —
the gate, the pre-registration discipline, the multiplicity guards, the frozen
baseline — was built first and works.
