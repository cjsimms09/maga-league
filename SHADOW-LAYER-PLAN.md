# SHADOW STRATEGY LAYER + BASELINE PROTECTION — my read, and the plan

Cory's brief, 2026-08-10 (three parties, converged). Queued AFTER the war-room
fixes, the program items and the graduation gate. Part 1 is unconditional; the
rest is deliberately throttled. My answers to the three questions he asked are
first, because two of them change what gets built.

---

## Q2 — Is `proj_ceiling` real enough for the tiered candidate? **NO. PARK IT.**

It is the latter of the two things Cory named: **a derived single-source spread**,
not a multi-source ranged set. Exactly:

```
proj_ceiling = proj_mean + 1.036 × (proj_mean × variance)      # 85th pct
variance     = POSITION_VARIANCE[pos] × hand-set multipliers
               (bell-cow / committee usage, depth-chart order, rookie, …)
```

So the "second projection set" is **one projection set multiplied by a designed
volatility heuristic**. The inputs to that heuristic are real (opportunity share,
target share, depth chart, years_exp) but the multipliers are declared, not
measured, and there is no second opinion about the OUTCOME anywhere in it.

It is **not degenerate** — I checked, because if `variance` were near-constant the
blend would be a monotone transform of the mean and could not reorder anybody,
which would settle it by arithmetic. It does vary (0.22–0.52 across 578 players,
82 distinct values) and blending at w≥0.2 reorders every position in every tier
band. So the mechanism is live.

**But it cannot test Cory's hypothesis.** His idea is a mean set versus an
independent RANGED OUTCOME set. Running it on today's field would instead test
"does a designed volatility heuristic, weighted more heavily as tiers decline,
earn money" — a different and much weaker claim, and adjacent to the ceiling term
that already came back unsignable. Per his own instruction ("do not run it on a
weak projection set just to have another shadow"), it is **PARKED**.

**What would make it real, and it is close.** A genuine ranged set is the
DISPERSION ACROSS SOURCES at a frozen moment — an empirical spread instead of a
designed one. The snapshot freeze already writes `draft/data/proj_series.json`
with `sleeper` and `fantasypros`; the FP freeze I added lands on the next build.
Two sources is a real spread but a thin one (a range, not a distribution). MFL +
nflverse would make it a genuine set. **Unpark when ≥3 sources are frozen across
≥2 snapshot dates**, then build ceiling/floor from the cross-source quantiles and
the candidate becomes testable as intended.

---

## Q1 — Is frozen-baseline-plus-regression the right protection? **YES — with one
sharpening that this week's evidence demands.**

The shape is right and I would not replace it. But a suite that compares only
**recommendations** would have caught roughly **one** of the four corruptions Cory
listed, so it must be scoped wider or it inherits the exact blind spot it exists
to remove:

| this week's corruption | caught by a *recommendation* diff? |
|---|---|
| merge silently dropped engine edits | **yes** — top pick moves |
| `Number(null)=0` in the LEAN materiality gate | **no** — badge only, ranking unchanged |
| ADP-source predicate hardcoded to the old anchor | **no** — a warning string |
| thin-pool valuation re-derived in a route | **no** — waiver path, not the draft board |

So the frozen baseline must capture **the full emitted surface**, not the top pick:
the ranked list, every badge and its firing rate, survival/gone percentages, the
conservation total, the dollar values from all four tools, and the provenance
strings. Firing RATES matter as much as values — "opp ↑ fired on 42% of the top
200" and "LEAN fired on every deviation" are both regressions no single-case diff
would show.

Two more precisions:

- **Every deploy, no file filter** — agreed, and this week proves it. The
  classification step is where the miss happens. It is canonical states through a
  pure function; it costs seconds.
- **One-tap revert, stated honestly.** Restoring the *policy* (weight vector,
  presets, need definition) is genuinely one tap and belongs in the war room next
  to Reset. Reverting a *deployed build* is a git revert plus a Netlify cycle
  (~4 min) and cannot be one tap — so the frozen baseline must be restorable
  CLIENT-SIDE from the artifact, independent of what is deployed. That is the
  version that works at 8pm on the 22nd.

---

## Q3 — Does the shadow FIELD earn its cost right now? **NO. Cory's Part 6 policy
is correct and I'll say so plainly rather than soften it.**

This is not caution, it is a measurement we already have. The strategy tournament
raced **7 strategies over 3 seasons of one seat**:

- total spread across all seven: **~$725**, against a weekly-high increment of
  **$100** — the smallest amount the dollar grade can resolve;
- the winner **FLIPS with the injury treatment** (neutralized #1 `hero_rb`, real #1
  `robust_rb`);
- and the proxy retrofit re-ranked them again, moving `need_value` from last on
  neutralized dollars to first on the continuous proxy.

A field whose ordering changes under treatment, under metric, and within a
noise-width spread is already demonstrating that it cannot resolve strategy
differences at this sample size. **Adding candidates strictly increases the
maximum of that noise** — the expected best-of-N under a null grows with N, so a
wider field guarantees a more impressive-looking false winner, not a better
answer. Twelve confident-looking records with nothing behind them is the precise
risk, and it is the likely outcome, not the tail.

**So: Part 1 unconditionally. Shadow INFRASTRUCTURE thin (silent execution,
logging, gradeable emission, reporting vs the frozen baseline). Field kept to a
very small number of high-plausibility candidates. Expand only after the ingest
gives it power.** If forced to choose, protection + thin infrastructure and wait,
exactly as Cory concluded.

One addition of my own: the field size must be recorded **in the report itself**,
every time. "Shadow 7 beats the core" is meaningless without "of N candidates,
null searched over the same N". That is the multiplicity guard and it belongs in
the emitted record, not in a reviewer's memory.

---

## THE PLAN (queued after the current program)

**P1 — Baseline protection (unconditional, build first).**
1. `draft/baseline/v1.json` — an IMMUTABLE, versioned freeze: weight vector,
   mask/need definition (incl. fill-first vs value-depth), VONA config + floor,
   anchor source, tier/bench constants, with evidence citations attached.
2. `draft/tests/baseline_regression.test.js` — canonical (board, roster, pick)
   states through the live engine, diffed against the frozen surface: ranked list,
   badges + firing rates, survival + conservation, dollar values, provenance.
3. CI on EVERY deploy, no file filter.
4. Client-side one-tap "restore frozen baseline" in the war room.

**P2 — Shadow infrastructure (thin).** Silent by policy with no emergency
exception — invisible on every live surface, disagreement visible only after the
decision locks. Each shadow emits a gradeable prediction through the existing
PredLedger/resolver and is graded by the same grader, on **dollars AND the
continuous proxy**, always compared to the FROZEN baseline, not the live core.

**P3 — Field: start at 2–3 candidates**, drawn from the existing tournament
strategies (already measured, so no new hypothesis is spent). Cory's tiered VONA
candidate is PARKED pending a real ranged set; the schedule stays a searchable
parameter when it unparks.

**P0 — Machinery the binding rules imply, AFTER RULE 9 PRUNED IT.** Three of the five things
I originally listed here were killed before being built, because they were process for its own
sake (the audit is in SESSION-A.md):
- ~~`draft/preregistration/` directory~~ → **a dated section in the ingest's own doc.** Zero
  external ingests exist; a directory structure for none is ceremony.
- ~~a recurring reachability drill~~ → **break a guard once when you build it** (~2 min, already
  habit) plus **one phone test of the revert before the 22nd**, which is Cory's action, not a
  standing workstream.
- ~~a report template ordering failures first~~ → **rule 8 IS the instruction.** A template to
  enforce a one-line writing habit is exactly what rule 9 forbids.
- **KEPT:** the override-pattern detector (rule 2) — built, and it costs nothing until data
  exists. **KEPT:** the rule-7 rename — done, and now enforced by an assertion in a suite that
  already runs, so it costs zero attention.

**P4 — Promotion via the graduation gate only.** Proposal with evidence, never a
flip; ≤1–2 promotion candidates per cycle regardless of field size; a minimum
evidence threshold before a proposal may appear; and **nothing graduates
permanently** — a promoted strategy stays under measurement and can be demoted on
the same terms.

---

# ADDENDUM (Cory, 2026-08-10) — two narrowings, not loosenings

## A1. VISIBILITY — silent live, visible everywhere else

I asked whether shadows could be visible during a live pick "just to look at behind the
scenes." **The answer is no**, and the reasoning is recorded because it is easy to talk
yourself back into.

The protection is not about the TOOL being influenced. **It is about ME.** If a shadow's pick
is on screen at pick 34 I have seen it and I cannot unsee it; my decision is then made in the
presence of an unvalidated alternative, which is exactly the degree of freedom the measured
core exists to remove. And the failure is gradual rather than obvious — glance at it eleven
times, agree ten, and on the twelfth it looks better and I take it. **That override then
enters the log as MY judgment, with nothing recording that a shadow suggested it.**

| context | shadows |
|---|---|
| **live draft / live waiver / live lineup** | **completely invisible.** No badge, no alternative view, no indicator of any kind. |
| **after a live decision LOCKS** | **show every shadow's pick.** Same information, curiosity satisfied, zero contamination — the decision is already made. Also *better* evidence than a live glance: comparable across the whole draft instead of one row read under time pressure. |
| **in a mock** | **show everything, live and inline.** A mock is not forward evidence by our own rule, so nothing is contaminated — and a mock is exactly where I would learn whether any shadow is worth taking seriously. |

**THE DOCTRINE DISTINCTION, so the two are never confused.** The nine PLANS in the strategy
picker stay visible during a draft. They are part of the tool, they have been through the
gate, and Cory can switch between them deliberately. SHADOWS are unvalidated candidates
accumulating records precisely because nobody knows yet whether they work. **The line is
whether a strategy has passed the gate: gated things may be visible live, ungated things may
not.**

*Implementation consequence (mine).* The reveal hangs off the LOCK EVENT, not a timer or a
panel toggle — the same `markDrafted` / claim-submit / lineup-lock path the override log
already hooks. And the visibility predicate is exactly two conditions, so it cannot drift into
a third: `mockMode || decisionLocked`. Anything reading a shadow outside that predicate is a
bug, and it is cheap to assert in the source guard the way the app-wiring suite already
asserts seat and window invariants.

## A2. SHADOWS IMPROVE UNDER THE SAME DISCIPLINE AS THE CORE

A shadow is not a fixed guess that either wins or loses. Each is searchable and improvable —
**under exactly the rules everything else obeys, not looser ones because it is "only a
shadow."**

- **Its parameters are searchable.** The VONA-tiered candidate is the clearest case: the
  mean-to-ceiling schedule by tier is the thing to FIND, not the thing to assume. Same for any
  candidate I generate — **the shape is the hypothesis, the parameters are what the search is
  for.**
- **Every version emits gradeable predictions**, with its own record, on the same cadence,
  through the same grader.
- **A TUNED SHADOW IS A NEW REGISTERED CANDIDATE, NOT A QUIETLY UPDATED OLD ONE.** Its record
  starts fresh; its predecessor's record stays on the books. Otherwise a shadow could be
  adjusted until it wins and then presented with a graded history it never earned — which is
  re-fitting until the numbers agree, wearing a different hat. (This is binding rule 1(b) in
  the shadow registry's own shape.)
- **The parameter search is subject to the same multiplicity guard as the field.** Searching a
  schedule across many settings and reporting the best is the same arithmetic problem as
  racing many candidates; the null must search the same space.

*Implementation consequence (mine), and it sharpens the multiplicity arithmetic.* **The
effective N for the multiplicity correction is candidates × parameter settings searched, not
the number of candidates.** Three candidates over twenty schedule settings is an N of sixty,
and a report saying "of 3 candidates" while sixty were searched understates the false-positive
rate by a factor that matters. So the registry stores, and every report prints, **both** the
candidate count and the total settings evaluated — the second is the number the null searches
over. Registry IDs are therefore immutable and versioned (`vona_tiered@v1`, `@v2`, …), never
mutated in place, which is what makes "predecessor's record stays on the books" enforceable
rather than a promise.

## THE PRINCIPLE UNDERNEATH BOTH

**A shadow gets to be exploratory in what it PROPOSES and gets no latitude at all in how it is
MEASURED.** The freedom is in the hypothesis space; the discipline is identical to the core's
— because the whole value of the layer is that a shadow which eventually beats the core has
earned it under the same conditions, and a shadow measured loosely could never earn anything.
