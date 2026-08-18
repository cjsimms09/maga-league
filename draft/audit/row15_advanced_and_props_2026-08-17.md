# ROW 15 — one store was decided, the other is paid-for and ungraded behind a stale refusal

_TERRITORY: D — data stewardship. Written 2026-08-17, session D's fourth item._

Row 15 files `advanced_stats_*` and `historical_props_*` together: *"studies ran,
wiring was never decided either way."* **They are not the same case, and neither
matches that description.**

- **`advanced_stats_*` WAS decided** — preregistered, graded, published as an
  honest null. It is missing only a re-test trigger.
- **`historical_props_*` holds three seasons of real, PAID data that has never
  been graded**, because the artifact that would grade it refuses on the claim
  that the data does not exist. **It does exist**, in the same directory, and it
  landed in the same commit as the refusal.

Nothing was fetched and nothing was re-run. Every figure is read off a committed
file; the one code path exercised was read-only and is named below.

---

## WHAT I EXPECTED BEFORE LOOKING

Rule 3d. **I expected two undecided stores** — studies that produced numbers
nobody turned into a yes or a no, which is what the row describes. I expected the
work to be writing two decisions and two triggers.

**One was already decided to a higher standard than row 18's Vegas null.** The
other turned out to be the most consequential thing I have found in this lane:
money was spent, the data arrived, and the grading never ran.

---

# PART A — `advanced_stats_*`: decided, and decided well

## A1. The study ran and was graded

`draft/backtest/advanced_efficiency_study.json` — `status: "graded"`,
`clears: false`. An EPA / air-yards / CPOE composite tilt on own_v5's
`comp_opinion`, against the unmodified `comp_opinion` as control, over three
leak-free folds (2023, 2024, 2025). Constants (`ADV_W` 0.2, `CLIP` 2.5,
`MIN_VOL`) and the clearing bar were preregistered in the module docstring,
committed before grading.

**Result: 4 of 12 (position, fold) cells beat control on both metrics; 8 did
not.** RB is the only position beating control in more than one fold. QB is the
clearest miss — worse than control on MAE in all three folds.

**The verdict is recorded**, in `draft/audit/advanced_metrics_study_2026-08-16.md`
§6: *"honest null, published, no ruling manufactured."* So the row's
*"wiring was never decided either way"* is **wrong for this store**. It was
decided, to the same standard pace and Vegas were closed to — a NO with a
measurement behind it.

## A2. Rule 3d on that null — it passes, and better than row 18's did

| | answer |
|---|---|
| **Q1 — did the input vary?** | **Yes, emphatically.** 5,935 player-weeks in 2024 alone: `cpoe` 651 distinct values (sd 15.79, range −86.4…69.8), `rec_epa` 4,136 distinct (sd 3.26), `wopr` 2,936 distinct, `ay_share` 2,510 distinct. Nothing resembling the ceiling defect. |
| **Q2 — did it arrive?** | **Yes — and the study answers this itself.** Each fold records `coverage: {comp_control: 481, comp_adv: 481, identical_population: true}`. **This is exactly the counter whose absence made row 18 unanswerable**, present here without being asked for. |
| **Q3 — could the test have fired?** | **Yes, demonstrably.** 4 of 12 cells *did* beat control, so the machinery produces positives. And the bar's shape (all positions, all folds — REC-3) has been cleared before, by own_v6. A strict bar, but a proven-clearable one. |

**Rule 3d is satisfied on all three. This null is sound** and I am not reopening
it. Worth saying plainly, because the previous three rows all inverted: **this
one holds up.**

## A3. What is actually missing

**The re-test trigger** (register row 17), and the lifecycle table calling it
`UNEXAMINED` when it is examined and closed. Both fixed in this commit.

The study's own honest read supplies the trigger's content: *"a genuine, if
unevenly-distributed, null for the ONE preregistered construction tested — not
evidence that no EPA/air-yards signal exists at any construction or weight."*

> **Trigger (method + season):** re-test when a **different construction** is
> preregistered — a per-position weight instead of a single `ADV_W`, or a volume
> floor above `MIN_VOL`, both named by the study as suspected causes of the QB
> miss — **or** when a fourth leak-free fold exists. RB cleared 2 of 3 folds and
> is the natural first re-test.

---

# PART B — `historical_props_*`: paid data, never graded

## B1. The data is real, and there is a lot of it

| store | scope | weeks | player-weeks | quotes |
|---|---|---|---|---|
| `historical_props_2023.json` | full_season | 18 | 3,795 | 8,291 |
| `historical_props_2024.json` | full_season | 18 | 3,224 | 7,254 |
| `historical_props_2025.json` | full_season | 18 | 3,257 | 7,344 |
| `historical_props_week1_2023/24/25.json` | sample_week1 | 1 each | 2,283 | 3,889 |
| | | | **12,559** | **26,778** |

Markets: `pass_td`, `pass_yd`, `rec`, `rec_yd`, `rush_yd` (plus `any_td` in the
week-1 samples). Rows are real players with plausible lines — Bijan Robinson 2024
wk1 at `rec 3.5 / rec_yd 27.5 / rush_yd 63.5`.

**Provenance: `api.the-odds-api.com /v4/historical (paid plan)`**, with a
`credit_estimate` of **16,320 odds credits per full season**. This was bought.

## B2. The artifact that should grade it says it does not exist

`draft/backtest/props_season_projection_2025.json`:

```json
"status": "pending_real_data",
"why": "historical_props_2025.json does not exist — no real historical props
        have been fetched yet…",
"pending_real_data": ["draft/backtest/historical_props_2023.json",
                      "draft/backtest/historical_props_2024.json",
                      "draft/backtest/historical_props_2025.json"]
```

**All three exist** — 277,653 / 239,823 / 242,555 bytes, in the directory the
artifact names.

## B3. The CODE is correct. The ARTIFACT is stale.

This distinction decides whether the fix is a bug hunt or one command, so it was
checked rather than assumed — **read-only, producing nothing**:

```
GRADED_SEASON = 2025
FHP.store_path(2025) -> draft/backtest/historical_props_2025.json
                        exists = True   (242,555 bytes)
```

`props_season_projection.py:383-384` reads
`store_path = FHP.store_path(GRADED_SEASON); if not store_path.exists():`.
**That branch is not taken today.** The committed artifact is a stale snapshot of
a refusal that is no longer true. Re-running the module is the entire fix.

**And the unit test covering the refusal is correct** —
`test_run_refuses_when_no_real_store_exists` monkeypatches `store_path` to a
genuinely missing file. It is testing the refusal path, not pinning the stale
artifact. Nothing needs changing there.

## B4. Why nothing caught it — and it is not carelessness

Two facts, both verifiable, and together they close the loop:

**1. The store and the refusal landed in the SAME COMMIT** (`b879113`,
2026-08-17 07:21:42Z; `git log --diff-filter=A` on both paths). So no date
comparison, changelog, or review of "what changed since" could have separated
them. The artifact was written when the claim was true and was carried in
alongside the thing that falsified it.

**2. The freshness registry deliberately does not watch it.**
`draft/data/artifact_registry.json` has 13 entries, one of them
`props_season_projection_v6_reproduction`. Its `artifact_path` is
**`draft/backtest/model_accuracy_v6.json`, not the props artifact** — and its own
description says why:

> *"checked against own_model_v6's OWN committed artifact rather than
> props_season_projection's own (**which is still pending real historical-props
> data**)."*

**That exclusion was correct on 08-16 and became wrong the moment the data
landed.** The registry entry encodes, as a permanent design decision, a condition
that has since changed — and there is no mechanism by which the condition
changing updates the decision. **A freshness system that is opted out of on a
temporary premise inherits that premise forever.**

This is register row 11's shape (*"artifacts not in the freshness registry"*)
reaching a different artifact, and it is worth naming as its own class: **not an
unregistered artifact, but a deliberately-excluded one whose exclusion expired.**

## B5. What this costs, stated plainly

**A dataset someone paid ~16,320 credits per season for has never been graded**,
and the 08-16 write-up's *"NO REAL VERDICT EXISTS YET"* now reads as a finding
when it is an un-run command. That sentence is currently the project's answer to
Cory's props question.

This is the exact failure Cory named: *"they need to verify if things are being
predicted and graded and if not they need to fix it."*

**What I did NOT do:** re-run it. `props_season_projection.py` is `TERRITORY: A`,
its output is a graded number A rules on, and running it produces the verdict —
which is a decision about what a number means, explicitly not D's. Parked to A in
`ROUTES.md` with the one command.

---

## WHAT THIS DOES NOT COVER

- **No claim about what the props verdict will be.** The grading has not run; it
  may well clear nothing. The defect is that it never ran, not its outcome.
- **The name-crosswalk step is untested against real data.** The stores key on
  the odds API's `description` name, *not* a sleeper id, and their `_note` says
  so. `match_player_name` is fixture-tested only. Expect real join loss on the
  first real run — **and that join rate is the number to publish with the
  verdict**, per row 18's lesson.
- **`advanced_stats_*` reaches only studies**, confirmed: `empirical_draft_value.py:122`
  reads it, and nothing in `build.py`/`own_model_v6.py`/the board does. Step 4 stands.

## WHAT I CHANGED

- `DATA-LIFECYCLE.md` — both rows corrected with their real stop and triggers.
- `DEFECT-REGISTER.md` row 15 split into the two genuinely different cases; row
  17 gains the advanced-stats trigger.
- `draft/tests/test_refusal_artifacts_are_not_stale.py` — **new, general**: no
  committed artifact may declare a file missing that is present (§next).

## THE TEST, AND WHY IT CAN FAIL

The defect class is *"a refusal artifact outlives the condition it refused on."*
That is checkable in general, not just here, so the test sweeps every committed
artifact rather than pinning this one:

- **`test_no_committed_artifact_claims_a_present_file_is_missing`** — scans
  committed JSON for refusal markers (`pending_real_data`, `status: pending_*`)
  and asserts every path named as missing is genuinely absent. **This fails today
  on the props artifact**, which is the point: it is the finding, mechanised.
- **Known-positive control** — a synthetic refusal naming a file that exists must
  be detected by the same scanner, so a pass can never mean "the scanner found
  nothing to look at".
- **Coverage control** — the scanner must find the real refusal artifact at all;
  if the marker vocabulary drifts and it scans zero documents, that is a failure,
  not a pass.
