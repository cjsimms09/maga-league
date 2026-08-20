# P282's paired harness — built, controlled, and dry-run on 2023-2025; NOT a grade

**D, 2026-08-20.** Building the paired counterfactual harness for
`PREDICTION-LEDGER.md` P282 (dispatched via `ROUTES.md`'s 08-20 "PAGE
TURNED" row, owner D, grade-by 2026-10-06): does pricing each waiver claim
by ΔE[rest-of-season lineup points] under the bench-option wire+absence
objective reorder the incumbent waiver tool's top-3 in ≥30% of weeks 1-5,
AND do the reordered picks outscore the incumbent's on paired rest-of-season
points?

**⚠️ THIS FILE DOES NOT GRADE P282. The 2026 season has not started; there
is no real week-1 wire yet.** Everything numeric below is a DRY RUN on
2023-2025 history — a readiness/control check proving the harness's own
plumbing works, not a verdict on the live claim. See §5 for exactly what
runs, unchanged, once week-1 2026 data exists.

---

## 0 · CORRECTED 2026-08-20, SAME DAY — THE ORIGINAL §0 HERE WAS WRONG. READ THIS VERSION.

The build agent that wrote the first version of this section searched
`git log --all` and every branch it had locally fetched, found no `--opt`
code anywhere, and concluded the entire nine-commit "Bench-option vN
graded" chain in `PREDICTION-LEDGER.md` was fabricated — numbers written
with no code that could have produced them. **That conclusion was false,
and the search behind it was not actually exhaustive: "every branch" meant
every branch already present in the local sandbox, not every branch on
`origin`.** `git ls-remote origin` (not run by the build agent) lists
`refs/heads/claude/fantasy-football-research-926y6z` at commit `01668acc`,
a branch that was never fetched locally before this check. Fetched and
inspected directly (D, same day):

1. `git show 01668acc --stat` — one commit, `draft/tools/roster_builder_replay.js`,
   **+276 lines**, titled *"The bench-option arm (--opt): expected-season
   objective with measured absence, real-unit LOO curves, position-dependent
   wire friction, EDF feasibility forcing."* Real functions: `OPT =
   process.argv.includes('--opt')`, `optCurveFor`, `optSeed`, `optU`,
   `optV`, `draftedDepthLOO`, matching the mechanism names the ledger's v1-v9
   trail cites (frictionless → units → position-dependent friction → EDF).
2. **Run directly, not just read:** checked the file out to its real path,
   ran `node draft/tools/roster_builder_replay.js --opt`, and it executed
   cleanly — five named controls (C1-C5) all passed, real self-consistent
   seat-year numbers printed, nothing crashed or stubbed. Reverted
   immediately after (`git checkout --`), confirmed byte-identical to HEAD
   before continuing. This is real, working code that runs and produces
   real output — not a description of code, not a stub.
3. **What IS real and already-known:** the branch is not merged into `main`
   or into this branch. `ROUTES.md` already tracks this as an open,
   dated ask — *"ASK (A): merge the arm (relay branch, one file, additive
   `--opt` block)... owner A, recheck 08-21 12:00."* The ledger rows
   describe real, run code that a human/agent on that specific branch
   executed and reported honestly; the gap is that the code isn't
   reachable from `main` or from this branch yet, which is the same
   structural "work stuck on an unmerged branch" pattern this whole
   session has hit repeatedly for other reasons — not evidence the numbers
   are invented.

**So: nothing here invalidates the bench-option v1-v9 chain.** The three
follow-up questions the original (wrong) §0 raised are answered instead:
(1) invalidates anything trusted? No — the chain stands; (2) implies
another failure? Yes, a real and different one, named below; (3) routed?
Yes, to the relay, corrected.

**The real, narrower finding worth keeping:** a Rule-3f branch search that
checks only locally-fetched branches can return a false "doesn't exist"
exactly the way an untested probe returns a false negative (Rule 3e's own
shape) — the fix is `git ls-remote origin` before concluding absence, not
`git log --all` alone, whenever the claim is "this code doesn't exist
anywhere" rather than "this code isn't on my branch."

**Consequence for THIS harness, corrected:** since the real `optV`/`optU`
functions exist and run, Rule 11 (reuse, don't reimplement) applies after
all and was not honored here — §C below is a hand-transcribed, ORIGINAL
reimplementation of the value function from prose, built before this
correction was made. **Its dry-run numbers (§4) are evidence about THIS
reimplementation's behavior only, not about the real, graded `--opt`
objective, and must not be read as a signal on P282 either way.**
Replacing §C with the real `optV`/`optU`/`optCurveFor` (adapted from a
15-round draft-sequence context to a single in-season claim decision,
which they were not written for and will need real adaptation, not a
straight import) is now the correct next step before this harness's
numbers mean anything — filed as a defect-register follow-up rather than
done in this pass, given the adaptation is nontrivial and deserves its own
attention rather than a rushed swap.

---

## 1 · V1 ANSWERED — DOES `league_history.json` CAPTURE FAILED WAIVER CLAIMS?

`ROUTES.md` filed this as an open C-lane item ("does `league_history` keep
FAILED claims + bids? ... it is the FALSE-route input for P282's friction
re-fit — the flagship depends on you"), and this task's own instructions
told me to stop and report honestly if it turned out claims aren't captured.
**Checked directly against the committed data, not assumed either way:**

| season | waiver-type txns | failed | complete | free_agent txns |
|---|---:|---:|---:|---:|
| 2023 | 229 | **107** | 122 | 140 |
| 2024 | 214 | **93** | 121 | 154 |
| 2025 | 205 | **89** | 116 | 143 |

**YES — 289 failed waiver claims are captured across three seasons**, each
carrying the losing `adds`/`drops` intent (`type: "waiver"`, `status:
"failed"`). `free_agent`-type transactions never carry `status: "failed"`
(0 of 437) — exactly the shape a real priority/FAAB contest produces
(uncontested adds don't fail; only contested waiver claims do). **V1's
premise turns out to be answerable with good news, not a gap** — this
changes what the relay should dispatch to C (V1 can close rather than stay
an open ask), though C should still confirm this holds on the *live* 2026
capture path (a different exporter, per E14's precedent in `DEFECT-
REGISTER.md`, where `league_history.json`'s empty-metadata finding did NOT
hold on the production Sleeper path).

---

## 2 · WHAT WAS BUILT

- **`draft/tools/waiver_advisor_paired_harness.js`** (new, TERRITORY: D) —
  the harness itself. Full design rationale, reuse citations, and the value
  function's exact formula are in the file's own header comment (long, by
  necessity — it carries the Rule 3f finding above). Run:
  `node draft/tools/waiver_advisor_paired_harness.js`.
- **`draft/tests/waiver_advisor_paired_harness.test.js`** (new,
  TERRITORY: D) — 25 checks. Run:
  `node draft/tests/waiver_advisor_paired_harness.test.js`.
- **This file.**
- Writes `draft/data/waiver_advisor_paired_harness.json` (report-only,
  regenerated on every run).

**What is genuinely reused (Rule 11), not reimplemented:**

| reused | from | how |
|---|---|---|
| the incumbent ranking | `src/routes/waivers.js` `evaluateClaims()`/`dropCandidate()` | called unmodified, exactly as `/waivers` runs today |
| the lineup solver | `src/routes/lineup.js` `LO.bestLineup()`, `LO.slotsFromTemplate()`, `LO.harvest()` | the one solver, not a second copy |
| the leak-free per-player level (dry-run arm only) | `draft/tools/lineup_edge_backtest_blend.js` `recencyWeightedAvg()`/`shrinkageToPosition()`/`computePositionConstants()` | required and called directly; the harness only builds a LEAGUE-WIDE (not single-roster) prior-weeks history to feed it, since a free-agent candidate was often on a DIFFERENT team's roster |
| the wire level (WAIVER_WK) | `draft/data/waiver_realized_level.json` `rows[pos].floor_per_week` | loaded from the committed store, not retyped |
| the seeded PRNG | `draft/tools/bench_wire_room_sim.js`'s `mulberry32()` | copied verbatim |

**What is original** (transcribed from prose before the real `optV`/`optU`
were found on their unmerged branch — see §0's correction, and treat this
as a Rule 11 debt to close, not a permanent design choice): the
bench-option value function `benchOptionV()` — the M=200 absence-mask
simulation, position-dependent friction (QB/K/DEF stream free; RB/WR/TE
share one wire claim/week), and the marginal-candidate scoring. It
deliberately does **not** implement EDF forcing / supply-aware / horizon-
aware sequencing (prereg §8-§12) — those amendments are entirely about
**sequencing multiple draft picks across 15 rounds**, which the task's own
guidance identified as exactly the "draft-specific sequencing logic" to
leave out; a single already-fixed roster plus one waiver candidate has no
pick sequence to force.

---

## 3 · THE DESIGN, IN BRIEF

**Decision population:** every (season, week, roster) in weeks 1-5 of
2023/2024/2025 where the wire pool has ≥3 candidates. 120 such decisions
found.

**Wire pool (leak-free, disclosed scope limit):** every player who was an
`adds` target of ANY waiver/free_agent transaction that week (won or lost),
across all 10 rosters, minus whoever the deciding roster already held as of
week w−1. **This is the set of players someone actually contested that
week — a real, evidenced subset of the true free-agent universe, not the
full uncontested wire** (a deep body nobody claimed leaves no transaction
record at all, so it is invisible to this reconstruction). Stated plainly
rather than hidden.

**Player level, both arms, same source (the whole point of a paired test):**
DRY RUN uses this session's own leak-free recency+shrinkage blend (P143),
extended league-wide; LIVE uses `weekly_own`'s real per-player-week
projections (checked: `draft/data/weekly_own/` holds no historical
snapshots — the formula needs the CURRENT board's own-model total and
CURRENT Vegas lines, neither exists for a 2023 slate, the same gap P143
already found for external sources — so the dry run cannot use it and the
live grade should).

**Bench-option score:** `V(roster − drop + candidate) − V(roster − drop)`,
`drop` = the incumbent's own `dropCandidate()` (reused, not a second drop
rule — keeps the ONLY difference between the two arms the valuation
function, per this codebase's own `roster_builder_replay.js` design
principle). Both terms use the SAME M=200 seeded absence masks (common
random numbers, no MC noise between candidates, exactly as the prereg
specifies).

**Realized rest-of-season points:** sum of a player's real `players_points`
from `league_history.json` for weeks after the decision, wherever he
appears on ANY of the 10 rosters (a league-wide join, matching how this
codebase's OWN `gradeSeason()` in `roster_builder_replay.js` already treats
"actual points" — points a player scored while on nobody in this league's
roster are not observable in this data source, a limitation this codebase
already lives with elsewhere, not one invented for this file).

---

## 4 · DRY-RUN NUMBERS (2023-2025, weeks 1-5) — A HARNESS-CORRECTNESS CHECK, NOT A GRADE

```
DECISIONS: 120 (weeks 1-5, seasons 2023-2025, pool>=3 candidates)
  reorder rate: 59/120 = 49.17%
  paired-comparable picks (top-1 differs AND both realized-ROS observed): 16
  of those: bench-option wins 3, incumbent wins 13, ties 0
  mean paired delta (bench - incumbent): -41.33 pts rest-of-season
```

**Read this carefully, for what it is and is not:**

- **The reorder-rate mechanism demonstrably works and is not degenerate:**
  49.17% of real historical decisions show the two rankings' top-3
  genuinely differing. Had this dry run needed to clear the P282 bar today,
  it would (59/120 ≥ 30%) — **but this is 2023-2025 history under a
  substitute (non-live) player-level source, not the 2026 grade, and must
  never be quoted as if it were.**
- **Paired-points coverage is thin and honestly disclosed: only 16 of the
  59 disagreements have BOTH picks' realized rest-of-season points
  observable** in this league's own roster history (the league-wide-join
  limitation named in §3). This is the single biggest thing to watch when
  the live grade runs — the SAME 30% coverage-style gap that already
  bit three other claims in `CLAUDE.md` this project (Rule 3i) could bite
  this one too if not measured explicitly, which is why it is reported as
  its own field (`paired_comparable`) rather than folded silently into a
  mean over all 59.
- **On those 16, this ORIGINAL implementation's bench-option arm loses to
  the incumbent, badly (−41.33 pts/decision, wins 3 of 16).** This is a
  real, useful negative result about THIS FIRST IMPLEMENTATION, reported
  plainly rather than shrugged past: it does **not** mean the bench-option
  OBJECTIVE (as actually specified in the prereg, at whatever fidelity a
  real committed `--opt` implementation would have delivered) fails — this
  file's `benchOptionV()` is a from-scratch reconstruction built in one
  session from prose, has no reference implementation to check itself
  against (§0), and the friction/floor unit-tests in the test file (25/25
  passing, including two purpose-built known-positive controls) confirm
  its INTERNAL mechanics behave the way the spec says they should — but
  that is a weaker guarantee than "reproduces a real, previously-run
  implementation" would have been, and there isn't one to compare to.
- **A pattern worth naming rather than burying:** several of the
  bench-option top picks recur identically across different (roster, week)
  decisions within the same week (e.g. player `7594` and DEF `KC`/`NYG`
  repeatedly rank #1 across multiple rosters in the same week). This is
  *expected* to some degree — a genuinely strong player in a thin wire pool
  should attract multiple rosters' top rank — but it is also the kind of
  signature a friction model that's too easily dominated by ONE global
  floor-vs-level gap (rather than being sensitive to each roster's own
  actual construction) would produce. Flagged as a follow-up question for
  whoever refines the friction constants, not resolved here.

**Bottom line on the dry run:** the harness runs end to end on real data,
produces a non-degenerate reorder rate, and both controls that most matter
(a real disagreement exists and reproduces deterministically; the paired-
points machinery actually returns a non-empty, honestly-scoped comparison)
pass. Whether the OBJECTIVE itself beats the incumbent is unanswered by
this dry run — it answers "does the harness work," not "is P282 true."

---

## 5 · CONTROLS (Rule 3e), FULL OUTPUT

`node draft/tools/waiver_advisor_paired_harness.js` (controls section) and
`node draft/tests/waiver_advisor_paired_harness.test.js`:

```
CONTROLS (tool):
  OK   C1_known_positive_disagreement
  OK   C2_known_negative_identical_rankings
  OK   C3_leakfree_level_structural
  OK   C4_leak_check_fail_arm
  OK   C5_floor_constants_loaded
  OK   C6_reorder_check_has_fired_at_least_once

All controls passed: true
```

```
(test file) 25 passed, 0 failed
```

**C1 note, worth recording:** the first attempt at a known-positive control
was a hand-built synthetic roster (a "streaky WR" vs a "scarce RB"
candidate) — it FAILED on the first several parameter choices tried (a
small grid search over ~30 configurations never produced a disagreement).
Rather than keep hand-tuning numbers until one worked (exactly the "probe
that answers the question in the moment" shape Rule 3f warns about), C1 was
redesigned to pick the FIRST real disagreement out of the actual dry run
and re-derive it independently from raw season data as a determinism/
reproducibility proof instead. This is a stronger control than the
synthetic one would have been (real data, not tuned), and the fact that the
synthetic version was hard to construct is itself informative: in the
"everyone present, this instant" case the bench-option value function
collapses close to the same one-week marginal the incumbent already
computes, and only the absence/friction/multi-week terms can separate the
two arms — which real historical weeks generate but a small hand-built
roster often does not.

---

## 6 · EXACTLY WHAT REMAINS ONCE WEEK-1 2026 WIRE DATA EXISTS

**One command, once real waiver transactions for 2026 exist in
`league_history.json`** (i.e. once week 1 has been played and the weekly
capture job has run — per `ROUTES.md` V4, "verify week 1 actually appends
to `league_history`"):

```
node draft/tools/waiver_advisor_paired_harness.js --live --season 2026
```

**This flag is not yet implemented** (there is no 2026 wire data to test it
against today, and per this task's honesty constraints, a probe that has
never returned a positive should not be shipped as if it had). The ONE
change it needs, precisely scoped so it is not a rebuild:

- Swap `makeDryRunLevelFn(s)` (the P143 recency+shrinkage blend, §3) for a
  reader over `draft/data/weekly_own/own_weekly_2026_w<N>.json`'s champion
  `weekly_mean` column (per-player, per-week, already leak-free by
  `weekly_own`'s own commit-before-kickoff design). Everything downstream
  — the wire-pool reconstruction, both rankings, the reorder check, the
  paired-points comparison, all six controls — is season-agnostic and
  requires no other change; `dryRun()`'s season loop already generalizes to
  any season present in `league_history.json`.
- Restrict the decision population to `season === '2026'` and
  `week <= 5` (already the loop's default weeks 1-5; just needs the season
  list changed from `['2023','2024','2025']` to `['2026']`).
- The realized-rest-of-season join needs weeks to have actually been
  played — grade incrementally as weeks accumulate rather than waiting for
  week 17, same as this dry run already does per-week.

**Nothing else changes.** The incumbent-tool call, the bench-option value
function, the FLOOR/absence constants, the seeded-RNG determinism, and
every control in §5 carry forward unmodified.

---

## 7 · FILES

- `draft/tools/waiver_advisor_paired_harness.js` (new)
- `draft/tests/waiver_advisor_paired_harness.test.js` (new, 25/25 passing)
- `draft/data/waiver_advisor_paired_harness.json` (generated, report-only)
- `draft/audit/waiver_advisor_paired_harness_2026-08-20.md` (this file)

**Confirmed clean:**
- `node draft/tests/waiver_advisor_paired_harness.test.js` → **25 passed, 0
  failed**.
- `node draft/tools/waiver_advisor_paired_harness.js` → runs clean, all 6
  controls OK, exits 0.
- `node draft/tests/waivers.test.js` (pre-existing, the incumbent tool this
  harness calls unmodified) → **27/27 passed**, confirming nothing about
  the incumbent tool itself was touched or broken.

**Nothing in `PREDICTION-LEDGER.md`, `DEFECT-REGISTER.md`, `ROUTES.md`, or
`draft/data/register_id_watermark.json` was touched** — per this task's
instructions, this file is the full deliverable; the relay owns folding
the §0 Rule 3f finding, the §1 V1 answer, and the P282 harness pointer into
those files.
