# FLOOR/CEILING CALIBRATION — PREREGISTRATION

**Session D, 2026-08-21.** Answers the relay's 08-21 dispatch (*"the ceiling
program's missing grade: calibration"*). Committed **before** any coverage
number exists and before week-1 data exists. Report-only; nothing ships from
this before it grades.

The dispatch said: *"read the claimed quantiles out of the construction — do
not assume 5/95."* Doing that is what produced §1, and §1 changes the ask.

---

## 1 · THE ASK CANNOT BE EXECUTED AS WRITTEN, AND THE REASON IS A UNIT ERROR

The dispatch asks for **weekly** coverage: *"per position, per week, what
fraction of actual weekly scores land above `proj_ceiling` and below
`proj_floor`."*

**Every band on the shipped board is a SEASON-TOTAL band.** Measured, not
assumed:

* `draftsharks_projections_2026.json` — J. Gibbs `floor 261 / cons 307 /
  ds 322 / ceil 370`. Median `ds_proj` **148.5**, max **379.0**. Season totals.
* `attach_draftsharks.py` transfers those as a per-player ratio:
  `proj_floor = blend_proj x (DS_floor / DS_proj)`. A ratio of season figures
  is still a season figure once multiplied by a season mean.
* the older calibration path is season too — `projection_error.error_rows`
  is *"one row per player carrying BOTH a projection and a realized **total**"*,
  `ratio = act / mean`, so `p10_ratio`/`p90_ratio` are season-total ratios.

**A weekly score cannot exceed a season ceiling.** Run as specified, the grade
returns ~100% of weekly scores inside the band for every player in every week,
in every position — a clean, publishable, entirely meaningless number that
reads as *perfect calibration*. That is the exact shape Rule 3e exists for: a
probe that has never returned a positive has not been tested, only run.

**No weekly band exists anywhere in the repo. 83 stores mention a ceiling and
ZERO carry a per-week ceiling value.** The dispatch's premise that *"Draft
Sharks carries weekly bands"* is true of Draft Sharks' site and **not true of
anything we capture** — our store is their redraft season projection page.

**⚠️ That absence is Rule 3e's exact shape, so the detector carries controls,
and the FIRST VERSION OF IT FAILED THEM.** It required the `week` key and the
`ceil` key on the *same* dict, so a band nested one level under a week —
`{"week": 3, "bands": {"ceil": 9.9}}`, a perfectly ordinary layout — would have
read as absent. It would have returned **the same "zero" for the wrong
reason.** The shipped version matches a week whose *subtree* carries a ceiling,
and is exercised against two planted weekly layouts (both found) and two
non-weekly shapes: a season band, and a weekly points store with no band
(both correctly rejected).

## 2 · AND THERE IS NO SINGLE "CLAIMED QUANTILE" TO GRADE AGAINST

The dispatch assumes one nominal level. The live board carries **four
provenances**, read off `proj_ceiling_source` on all 700 rows:

| source tag | rows | nominal level it claims |
|---|---|---|
| `draftsharks_pct` | 247 | **NONE — Draft Sharks publishes no quantile.** Their store carries `floor_proj`/`cons_proj`/`ds_proj`/`ceil_proj` and states no definition; the index is proprietary. |
| `pre-DS band %, rescaled to the blended mean` | 362 | the old calibration's **p10/p90** — an 80% central interval, season-total |
| `position-median band %, ... ABSTENTION, not a measurement` | 8 | none, and it says so |
| `none — no band from Draft Sharks or the prior board` | 83 | zero-width: `floor == proj == ceiling` |

**A pooled coverage number would mix four different claims and be a statistic
about the mixture, not about any band.** Every reading below stratifies by this
field. Reporting one number for the board would be Rule 3i in a new place.

**The 83 zero-width rows are NOT a contaminant, checked rather than feared:**
their ADP runs **min 282, median 923, and zero of them are inside the
draftable top 200**. The abstention is confined to undrafted deep bench, which
is the correct behaviour (`attach_draftsharks.py`: *"the ceiling adjuster must
be UNABLE to move a man we have no band for"*). They are excluded by ADP, with
the count reported, not by being quietly dropped.

## 3 · WHAT IS PREREGISTERED INSTEAD — three parts, each executable

### PART 1 — THE DECISION GRADE. Weekly, gradeable now, needs no nominal.

This keeps the dispatch's requirement 4 **exactly as written** and drops the
requirements that depend on a nominal we do not have.

* **DECISION:** at lineup lock, given the roster held that week — *start the
  nine chosen on the mean, or the nine chosen on the tail?*
* **WHY IT IS EXECUTABLE while §1 is not:** the band travels as a **per-player
  RATIO** (`ceiling/mean`, `floor/mean`), which is scale-free. Applied to a
  weekly mean it yields a weekly *ordering* even though its *level* is
  unknown — and a start/sit choice consumes the ordering, never the level.
  **The level is exactly what §1 says we cannot grade and exactly what this
  decision does not need.**
* **NULL:** two, both already built. (a) a random legal lineup from the roster
  held that week — `draft/tools/lineup_vs_random.js`, the arm-scoring null;
  (b) the dispatch's own trivial null, a **position-constant** band, which
  removes all player-specific tail information while keeping the tail's scale.
  (b) is the one that matters: it asks whether the *player-specific* band earns
  its place, which is the same question the 08-17 dispersion defect was about.
* **CONTROLS, both gating the exit code:** known-negative — an independently
  drawn random agent lands at the null's centre; known-positive — perfect
  hindsight lands at the extreme. Reused from `lineup_vs_random.js`, where
  both are already exercised red.
* **MARGIN:** weekly start/sit decisions whose verdict FLIPS between mean-only
  and tail, **and the points that flipping is worth** — arm-vs-hindsight
  points left, then the percentile. Reported in that order.
* **PREREGISTERED BAR:** the tail arm must leave **≥ 0.50 fewer points per
  week** against hindsight than the mean-only arm, on ≥ 2 of the 3 seasons
  2023-25. Chosen against the measured scale: the arm currently leaves
  **29.87 pts/wk** and the owners **15.33**, so 0.50 is ~3.4% of the arm's own
  gap — small enough to be reachable, large enough not to be noise. **If the
  flip count is < 30 owner-weeks the result is reported as UNDERPOWERED and
  not as a verdict**, whichever way it points.

### PART 2 — THE COVERAGE GRADE, at the unit the bands are actually in.

* **WHAT:** fraction of realized **season** totals above `proj_ceiling` and
  below `proj_floor`, **stratified by the four `proj_ceiling_source` values**,
  per position.
* **WHEN:** **one read, 2027-01**, after the season ends. Not fortnightly.
  n = 250 players carrying a DS band, one observation each. **Saying so now
  rather than discovering it in September.**
* **NULL:** (a) the same players' bands from the published source we mirror —
  Draft Sharks' own `floor_proj`/`ceil_proj`, ungraded by us until now; (b) a
  position-constant band of the same median width.
* **CONTROLS, gating:** known-positive — a deliberately **halved** band must
  FAIL coverage; known-negative — synthetic season totals drawn from the
  claimed distribution must PASS, **drawn independently and not resampled from
  the band being tested** (the vacuous-control trap `GRADING-POLICY.md` names).
* **⚠️ WHAT PART 2 CANNOT DO, declared in advance:** for the **247
  `draftsharks_pct` rows there is no nominal level**, so their coverage is
  **descriptive** — it tells us what DS's bands actually cover, which is worth
  knowing and is *not* a pass/fail against a claim. Only the **362 pre-DS rows
  carry a gradeable claim (p10/p90)**, and those are the only rows Part 2
  returns a VERDICT on. **A verdict on the DS rows would be inventing the
  standard and then meeting it.**

### PART 3 — THE MISSING NOMINAL IS ITSELF THE DELIVERABLE.

File the fact that the board's largest band source publishes no quantile, and
route it to C as a capture question: **does Draft Sharks state a definition
anywhere we can capture?** If yes, Part 2's DS rows become gradeable. If no,
they stay descriptive forever and the war-room band tooltip should say what the
band is *not* — not a stated interval.

## 4 · CONSEQUENCE ROUTE

* **Part 1 clears the bar →** P286's win-probability MC may consume the tails
  for start/sit ordering, which is what it actually uses.
* **Part 1 fails →** the tail does not earn its place in the decision, and
  P286 must be re-specified off the mean before it is built — *"rock or sand"*
  answered at the point that matters, and answered in September rather than
  January.
* **Part 2 (362 rows) miscalibrated →** an affine recalibration layer before
  any consumer, and the war-room bands carry a caveat until it ships.
* **Either way:** the DS rows' missing nominal is a standing caveat on the
  board, not a thing to be quietly assumed away.

## 5 · THREE-PART FILING

* **LEARNING TARGET:** whether the published tails carry decision-grade
  information, and separately whether the one band family that makes a
  quantitative claim keeps it.
* **SKILL DESIGN:** decision-against-a-constructed-null for Part 1 (Getty et
  al. Test 3), two nulls of which one is deliberately the *cheap* alternative,
  controls reused from an instrument where they are already exercised red, and
  a bar set against a measured scale rather than a round number.
* **CONSEQUENCE ROUTE:** as §4. Report-only until it grades; first read
  **2026-09-22**, real power ~week 6, **and the September read will say
  UNDERPOWERED if it is** rather than being quoted early.
