# Main is red on six CI steps, and no run has reached a verdict in over an hour

**E (red team), 2026-08-21. Draft is tomorrow. Keeper lock is 6PM CDT today.**
**Register 191 and 192. Reproduced locally on `93feda3d`, bisected to two commits.**

---

## 1. The invisibility, which is the part that matters

The last **30** CI runs on `main`: **24 cancelled, 4 failure, 2 pending. Zero
green.** The last run that reached a verdict was `32437730199` at **01:50Z on
`57a4a95e`**, and it failed **six** steps:

| # | step | conclusion |
|---|---|---|
| 8 | JS suites | **failure** |
| 9 | Robot mock draft — the safety net | **failure** |
| 10 | Python suites | **failure** |
| 12 | Baseline regression — live engine vs the FROZEN measured core | **failure** |
| 15 | Register rechecks | **failure** |
| 19 | Weight drift — prose that quotes a weight the engine does not carry | **failure** |

Every run after it was **cancelled by the next push**. Under a push train the
workflow's concurrency group produces *no verdicts at all*, and in the runs list
a cancellation reads as "not failed" rather than "not asked". So ~40 commits have
landed on `main` since the last observed verdict, on the night before the draft,
and nothing has reported on any of them.

That is register 126's shape (*"main HAS HAD ZERO SUCCESSFUL CI RUNS TONIGHT"*)
still live four days later, and it is the reason the two findings below went
unseen rather than the findings themselves being subtle.

## 2. My own control failed first — recorded per Rule 3f

My first local reproduction ran the JS sweep in a fresh `git worktree` and
returned **90+ failing suites**. That is not a finding, it is a missing
`node_modules` — worktrees do not inherit it. Symlinked, re-ran, got 14. **Every
count below is from a checkout with dependencies present.** The implausible
number is the only reason I looked.

## 3. Nineteen JS suites are red on `main` right now. Thirteen already were.

Sweep at the v31 freeze (`117232a3`, 2026-08-20 22:21) vs. current `main`:

- **already red at v31 (13)** — `archetype_rooms`, `ceiling_source_window`,
  `ceiling_tiebreak_needs_a_real_ceiling`, `doctrine_banner_is_degenerate`,
  `doctrine_lookahead`, `dollar_replacement_baseline`, `engine_ablation`,
  `expert_spread_display`, `injury_onesie_says_it_prices_a_starter`,
  `proj_sd_arm`, `shadows`, `weight_claim_sweep`, `withheld_slate_exposure`.
  This is the known field (*"eleven of the 150 draft-critical suites are red"*).
  **Not my finding — context, so the new six are not read as the whole 19.**
- **went red inside this window (6)** — below.
- `robot-mock`'s three R-doctrine failures are **pre-existing**: 154/157 at
  `117232a3`, `9bb2a23e`, `b17f3fc3` and HEAD alike. Also not new.

## 4. Cause A — `9bb2a23e`, the VONA truncation split (00:20Z). Two un-repinned references.

B's commit is a **legitimate and unusually well-documented engine fix**: one
constant (`SURVIVOR_CUTOFF: 0.005`) was serving as both a candidate filter and
the numerical truncation inside `expectedBestAvailable`, and the arithmetic half
was larger than the gaps it decided. Split into `EBA_TAIL_TOLERANCE` (1e-9).
Nothing here says that fix is wrong.

It moves every VONA and composite number, and **two pinned references were never
re-frozen**:

- `baseline_regression.test.js` — **129/136**, 7 FAILs, all of the form
  *"composite scores unchanged"* / *"top-10 ranking unchanged"*, in all four
  contexts. Every weight, policy and rule-7 assertion still **passes**, which is
  the signature of a scores-moved change rather than a weights-moved one. The
  test states its own remedy: `node draft/tools/freeze_baseline.js --freeze
  --version v32`, with a `_why`. Green at `117232a3`, red from `9bb2a23e`.
- `intervention-rate.test.js` — the pinned rate now reads **74.2%**. The test's
  own words: *"this now measures the ENGINE on a FIXED board, so a move here is
  a real composite change. If intended, freeze a NEW pool version and re-pin; do
  not widen the band."*

B's commit message says *"The full 150-suite draft-critical run is still in
flight and will be reported."* It was not reported, because every run since was
cancelled.

**This is NOT register 5g, and that was my first hypothesis.** Checked before
writing it down: `app.js:880` pins `BASELINE_VERSION = 'v31'`, and
`renderBaselineControl`'s click handler applies **only**
`engine_policy.MEASURED_WEIGHTS` — which the VONA fix did not touch.
`v31.json`'s `engine_policy` carries `MEASURED_WEIGHTS | CFG | SURVIVAL_CFG |
preset_keys`, but the restore path reads one of them. **The war-room restore
button is safe.** A stale pin here costs a red test, not a reverted ruling.

## 5. Cause B — `b17f3fc3` "Draft board: rebuild 2026-08-21". Four suites, one commit.

All four **green at its parent `c9c06fa2`**, all four **red at `b17f3fc3`**:

| suite | what it now says |
|---|---|
| `slate_exposure_commitment` | *"the board is standing on a **partial** slate — **6/10 team(s) designated, 13 keeper(s) across 5 team(s) deliberately withheld**. Until this confirms, the exposure number is a prediction and the board carries players other teams may keep."* |
| `ruled_target_is_one_definition` | the ruled roster-shape target reads `{DEF 1, K 1, QB 1.56, RB 4.78, TE 1.67, WR 5}` against *"the measured n=9 target, exactly"* |
| `keeper_seeded_with_a_value` | **`TypeError: Cannot read properties of undefined (reading 'position')`** — a crash, not an assertion |
| `cohort_ceiling_is_marked` | the marked-player list is now `[]` |

Read in football terms, which is my lane:

- **The slate one is the guard working, not breaking.** Keeper lock is 6PM CDT
  today; 4 of 10 teams have not designated and 13 keepers are withheld. It is
  *correct* for this to be red right now, and it should clear on its own after
  the lock. **But that means every exposure number the board shows Cory before
  6PM is a prediction, and the board currently holds players other teams may
  keep.** Worth him knowing at the keeper deadline, not after it.
- **`ruled_target_is_one_definition` is the one I would look at first.** It
  guards *Cory's* ruling (`ROSTER-CONSTRUCTION-CALL.md`, *"We should be trying
  to match the top 3 finishers row"*) against exactly one definition, and a
  board rebuild moved it. That is the register 5h family with a ruling on the
  other end of it.
- **`keeper_seeded_with_a_value` is a genuine crash in the keeper path on the
  day of the keeper lock.** It is a test harness rather than the war room, and
  `draft_ready.test.js` is 18/18 — but a `TypeError` is not assertion drift and
  I am not willing to call it cosmetic without someone reading it.
- `cohort_ceiling_is_marked` is **probably benign**: Draft Sharks became the
  ceiling source on 08-19 (189 of the draftable top 200), so the cohort fallback
  plausibly stopped firing and there is nothing left to mark. Its load-bearing
  second assertion — *"no real skill player is showing an unmarked cohort
  ceiling"* — still **passes**. I am flagging it as the weakest of the four.

## 6. Cause C, independent — the register-5h detector is blind

`node draft/tools/weight_claim_sweep.js --control` **fails its own known
positive**:

```
KNOWN-POSITIVE CONTROL (register 5h, instances 7-8)
  5056efbc:DRAFT-WEEK-BRIEF.md: 0 stale claim(s) -> MISSED
  working tree                 : 1 flagged
  FAIL — a sweep that cannot find the instance it was built for says
         nothing by finding nothing else.
```

This is Rule 3e stated by the tool itself. Register 5h has now hit **five**
times in this repo and **three times on 08-21 alone** (the ceiling weight in
`CLAUDE.md`, the restore pin, the keeper-ramp header). The instrument built to
catch it cannot find the instance it was built for, and has been in that state
across this entire window — while still flagging one thing in the working tree,
which is what makes it dangerous rather than merely useless: it produces output.

## 7. Also red: nine register rows overdue since 08-20

`register_recheck_check.js` exits 1 on rows **130, 126, 141, 20, 128, 129, 131,
133, 134** — all due **2026-08-20**, including two 🔴🔴 (130 `CFG.ROSTER_SHAPE`,
126 the zero-green-runs row). Owners A and C. Not mine to move; naming them
because this step is one of the six holding `main` red and it clears with a date
change and a reason, which is cheap.

## 8. Rule 3g — what else does this mean

**Does it imply another failure we have not looked for?** Yes, and it is the
concurrency setting rather than any test. A repo whose CI is cancelled by its own
push rate has no verdict *by construction* on its busiest night. The 4 observed
failures out of 30 runs is not a failure rate — it is a sampling rate. Whatever
else landed in those ~40 commits is equally unobserved.

**Does it invalidate something we already trust?** It invalidates "green tests"
as evidence for anything merged after 01:50Z, including two of tonight's merges
that reported suite counts in their own commit messages. It does **not**
invalidate the VONA fix, which I read and believe is correct.

**Is it routed to the lane that can act?** A — who owns *"`main` is correct and
green"* — for the re-pins, the recheck dates and the concurrency question; B for
`keeper_seeded_with_a_value` and the two board-rebuild guards, since both are
B's territory and the VONA fix is B's commit. Filed as register 191 (the red
field and its two causes) and 192 (the blind 5h detector).

## 9. What I did NOT do

I did not freeze `v32`, re-pin `intervention-rate`, move anyone's recheck dates,
or touch the board. Every one of those is a measurement or a ruling owned by
another lane, and the charter is raise, never override — the night before the
draft is the worst possible time for the red team to start editing the engine's
reference points.

---

## 10. CORRECTION, before this was pushed — two of the four were already fixed

I merged `origin/main` one more time before pushing, and re-ran everything. **Three
of the suites named above had been fixed in the interval, by the lanes that owned
them:**

| commit | suite | their diagnosis |
|---|---|---|
| `42c8b376` | `keeper_seeded_with_a_value` | *"a named player moved one position across the availability boundary and broke the suite two ways at once"* |
| `e5301d67` | `cohort_ceiling_is_marked` | *"went red on a population of ONE: 'they share ratios' needs two players to be a possible outcome"* |
| `583962f1` | `doctrine_banner_is_degenerate` | *"pinned the count instead of the cause, so a board that moved read as a defect that changed"* |

All three verified green on the merged tree. **My "crash, not assertion drift"
read on the keeper one was right and someone got there first; my "probably
benign" on the cohort one was worse than their answer** — a population of one
cannot satisfy an assertion about *sharing*, which is a cleaner statement than
mine and closer to Rule 3i.

**Current, re-measured on the merged tree: 16 JS suites red of 397. Twelve
pre-existing. FOUR new in this window:**

- `baseline_regression` — VONA re-pin, needs `v32`. **Still open.**
- `intervention-rate` — VONA re-pin, 74.2%. **Still open.**
- `ruled_target_is_one_definition` — board rebuild moved a **ruled** target. **Still open, and it is the one I would look at first.**
- `slate_exposure_commitment` — partial slate, clears at 6PM. **Working as designed; P313 grades that claim rather than assuming it.**

`robot-mock` remains 154/157 (pre-existing). `register_recheck_check` remains 9
rows overdue. `weight_claim_sweep --control` remains blind.

**The near-miss is the point, and it is why this section exists instead of a
silent edit.** I was one `git push` from dispatching two lanes onto work they had
already finished — the exact failure `CLAUDE.md` opens with (*five of six
premises handed to session D were wrong*). The only thing that caught it was
merging before pushing and re-running instead of trusting a measurement taken
forty minutes earlier. **On a night at this push rate, a finding has a shelf
life, and it is shorter than the time it takes to write the finding up.**
