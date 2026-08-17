# DRAFT-WEEK BRIEF — read this first (written 2026-08-17, draft is 2026-08-22)

**Supersedes `MONDAY-BRIEF.md` as the entry point.** That file is still accurate
about 08-15/16 and is not deleted; this one covers 08-17, which changed the
model's foundations rather than its features.

**Who wrote this:** the research-relay session, branch
`claude/fantasy-football-research-926y6z`.

**Cory's order for the day, verbatim:** *"Above all!! Fix the data problem and
make sure we don't have other mistakes in our info!!"*

---

## 1. THE ONE THING TO UNDERSTAND

Every dispersion field on the board — `proj_ceiling`, `proj_floor`, `proj_sd`,
`weekly_sd` — was `proj_mean x (a per-band constant)`. Spearman **1.0000**
against the projection inside a cell: **exactly zero player-specific
information.**

That single fact caused three separate conclusions we had believed:

- the composite `ceiling` weight measured collinear with `value` and was zeroed
  — **the first of the three to be re-run, and it reversed: a non-zero ceiling
  weight beats the shipped zero in 3/3 seeds, separably. §7b.**
- the phase grid could only discover that double-counting the projection hurts —
  and that null was written up as *"upside late is REFUTED"*
- the variance modifiers came back unmeasurable

**One cause, three "findings".** Most of 08-17 was fixing that and re-running
what it invalidated.

## 2. WHAT IS FIXED

| | |
|---|---|
| **production ceiling/floor** | measured p90/p10 per (position, band), replacing a Gaussian over the mean |
| **the BACKTEST HARNESS** | `build_bundle.py` wrote `1.35 x mean` / `0.25 x mean` as GLOBAL constants — every weight experiment ever run on a bundle was collinear. Now measured, leave-one-season-out, absent off an unmeasured cell. VERIFIED END TO END in CI run 32002876691: ~706 of 841 players attached per season, 98-135 correctly refused |
| **the money proxy** | `cory_conditional` hardcoded keeper `weekly_sd = 8.0`; real values are 17.63 / 25.81 / 32.46. Understated team weekly sd by 11.1%, **biased toward the conclusion it was being used to draw** |
| **snap counts** | 35,869 skill player-weeks pulled, 2021-25, weekly job, registry-gated |
| **playoff-SOS artifact** | regenerated (my board rebuild had added 5 rows it predated) |

## 3. WHAT IS NEW AND MATTERS MOST

**`draft/backtest/weekly_volatility.py` — the per-player upside signal exists,
and the data was committed here the whole time.** `nflverse_variance.py` was
written to measure it and was never run and never consumed.

**It is 2023-25 because 2021, 2022 were REFUSED, not because that is all we
have.** Those two seasons carry a different `scoring_fingerprint` — they were
scored under a different table — and pooling them would produce per-player
totals that never existed under either table, with (in the store's own words)
"nothing in the arithmetic to complain". That refusal costs two seasons and
leaves only two transitions, which is why the coefficient below is directional
rather than precise.

Realized weekly volatility (`cv = sd/mean`, our scoring), 2023-25:

- within a fixed mean band, cv spreads **1.57x-1.88x** (a `mean x constant`
  field has none)
- year-over-year persistence **rho +0.482 and +0.605**, both clearing a 400-draw
  permutation null; control (mean carryover) +0.740 / +0.781

**Volatility persists at ~two thirds the strength of scoring LEVEL.** Compare
snap-share volatility at +0.19, pulled the same day.

**Its boundary is sharp and non-random.** 131 of 157 draftable players have it.
Of the 26 without, only 8 are rookies — **the rest are veterans who missed 2025**
(Nabers ADP 32, Garrett Wilson 45, Daniels 59, Evans 62). Any wiring that fills
a gap with a positional mean hands the steadiest reading to the injury-return
group. **Absent must stay absent.**

## 3b. ROUTES RUN — the second per-player feed, and what it is NOT

`draft/backtest/fetch_routes.py`, `routes_2021..2024.json`, weekly, gated.

**There is NO routes feed in nflverse.** `routes/routes_YYYY.csv` 404s and
`ftn_charting` is play-level with no player ids. True routes run is a PFF /
Fantasy Points Data product we do not have. So this is a PROXY from
`pbp_participation` — every skill player on the field for a pass play — and an
**UPPER BOUND**, because a tight end who stayed in to block is counted. A test
pins that caveat so nothing downstream drifts into treating it as a measurement.

**Validated against known reality, not just shape:** Cooper Kupp 2021 reproduces
at 775 routes / 234 targets / **TPRR 0.302** — his triple-crown season and the
figure reported for it. Kelce 0.23, Hill 0.282, Diggs 0.266; median TPRR
**0.188** in both 2021 and 2024.

**Two things the build forced, both measured rather than assumed:** the
play-by-play join is REQUIRED (participation has no play type, and the best
participation-only proxy inflates the route DENOMINATOR by 12%), and position
must come from the roster because the participation schema gained position
columns only in 2023 — branching on that would have run two code paths over two
populations and called the result one dataset.

**2025 is refused**: no weekly data, so no position map — the same 404 that
leaves 2025 ungradeable. One gap, two consequences.

Routes run matters because it is the DENOMINATOR for target-per-route-run: 60
targets on 300 routes is a different player from 60 on 600, and target share
alone cannot separate them. Nothing consumes it yet.

## 4. FOR CORY, BEFORE AND ON DRAFT DAY

**One decision is waiting on him** — `draft/audit/adp_sd_ratchet_fired_2026-08-17.md`.
The shipped ADP-sd rule is 1.39x FFC's published dispersion in the 50-100 band.
**Our constant did not drift** (reproduces to 0.1%); the market tightened. Blast
radius inside his 160 picks is **one player**. Both easy fixes were refused on
the file's own doctrine. **Recommendation: leave it, revisit post-season.**

**One action on draft day** — re-take the pre-draft freeze AFTER the final board
build. `draft/data/pre_draft_freeze_2026.json` is from 08-14 and is missing
**fourteen** declared fields. It is NOT the draft board (the war room boots from
live `draft_data.json`), it is the record 2027 grades against.
```
rm draft/data/pre_draft_freeze_2026.json    # by hand; the module refuses to overwrite
python3 draft/freeze_pre_draft.py
git commit                                   # say why
```

**THE WAR ROOM IS REHEARSED AND PASSES — 19/19 against today's board.**
`rehearsal-mock3.js` drives the real screen in a real browser and is the closest
thing to a draft-night dress rehearsal: the clock advancing in manual mode,
"➕ Me" from the board landing on the roster, the legality strip being present
rather than present-but-invisible, the exit warning with no DEF and no K, the
deviation badge staying silent inside the noise band and speaking outside it, no
page errors, and the only blocked host being the fonts CDN.

**It was recorded here as "only Cory can run this" for about an hour, and that
was wrong.** The war room sits behind auth (`/admin/warroom` returns 302
unauthenticated) and this sandbox holds no credentials — but the rehearsal never
needed real ones. `rehearsal-keepers.js` had the pattern all along: temp
`DATA_DIR`, seed the store, set a known password, serve in-process. That is now
`draft/tests/rehearsal-serve.js`, so the check runs anywhere Chromium does — a
claim that was **not actually true when it was first written here** and is now:
see the CI note below.

```
node draft/tests/rehearsal-serve.js &
WR_USER=cory WR_PASS=pw node draft/tests/rehearsal-mock3.js
```

Nothing real is touched — `DATA_DIR` is a fresh mkdtemp, so the seeded owner
lives in a throwaway directory and the live store is never opened. The BOARD is
the real `public/draft_data.json`, which is the point.

The other two rehearsals also pass after all of 08-17's changes:
`rehearsal-keepers.js` 6/6 (a fixture board is refused rather than silently
rendered) and `rehearsal-config-screen.js` 13/13 (the CRITICAL scoring highlight
discriminates rather than starring everything). **All three screens are now
verified against today's board.**

**They also now run unattended — `.github/workflows/rehearsals.yml`, daily at
12:30 UTC, after the nightly board rebuild.** Deliberately NOT a publish gate:
`draft-data.yml` decides whether a board is fit to publish, this asks the
different question of whether the screens still work against it, and putting a
browser job between Cory and his board days before a draft is the worse trade.

**Putting them in CI immediately found a defect that had been invisible for
months.** All eight browser scripts launched with a hardcoded
`executablePath: '/opt/pw-browsers/chromium'` — a symlink the research sandbox
ships and nothing else has. `npx playwright install` puts the browser in
`~/.cache/ms-playwright`, so on a runner every rehearsal would have thrown on
`launch()` right after a green install step. That is the same shape as the
08-17 dispersion defect: a check that could not fail, because it was only ever
asked the question it already knew the answer to. Fixed by
`draft/tests/rehearsal-browser.js` (use the sandbox symlink when it is really
there, otherwise let Playwright resolve what it installed) and pinned by
`rehearsal_browser_portability.test.js`, 10/10, which exercises BOTH branches on
one machine via an injected existence check and sweeps the directory for the
hardcoded path behind a known-positive control.

**HONEST LIMIT: the CI half of that fix is reasoned and tested, not yet
observed.** Two things block observing it from here, and neither is worth
routing around. `npx playwright install` cannot run in this sandbox —
`cdn.playwright.dev` is refused by the egress proxy (403, not on the
allowlist), and a policy denial is to be reported rather than worked around.
And `rehearsals.yml` cannot be `workflow_dispatch`ed from a feature branch:
GitHub only registers dispatchable workflows that exist on the default branch,
confirmed by the workflow list returning 52 entries, all resolving to
`/blob/main/`, with `rehearsals.yml` absent. So the sandbox branch is proven end
to end (19/19, 13/13, 6/6 after the refactor) and the runner branch is proven
only by construction until the first scheduled run after merge. If it is wrong,
it fails loudly — Playwright refuses with "Executable doesn't exist" rather than
skipping — so the failure mode is a red run, never a silent green.

**His rookie-WR question is answered** —
`draft/audit/rookie_wr_upside_for_draft_day_2026-08-17.md`. Concepcion (NFL rd1
pk24) and Allen (NFL rd5 pk176) are 152 draft picks apart. Tail rate (150+ pt
season) by capital: rd1 **53.3%**, rd2 25.0%, rd3 0.0%, rd4-7 **1.8%**.
**Caveat that must travel with that 53.3%:** n=15 for rd1 and its MEAN interval
SPANS ZERO, so the honest claim is *"not measurably worse than the wire"*, NOT
*"beats it"* — the tail RATE is the interesting number, and it rests on 15
players in an artifact marked EXPLORATORY. His
instinct on Concepcion is supported; Allen is a different bet entirely.

**"Upside late" lost a FIFTH time, and the fifth is on a FIXED board** —
the CI run that verified the harness graded every weight profile and Upside-Late
lost BOTH seasons (pooled -79.21, CI [-137.9, -20.5]; -79.58 and -78.84, not one
bad draft). Every earlier refutation ran against `proj_ceiling = 1.35 x mean`,
where the arm could not express anything but "double-count the projection".
N=2 graded seasons, so it is another consistent line, not a precise coefficient.
(`draft/audit/harness_fix_verified_in_ci_2026-08-17.md`)

**The fourth** — and this run corrected a bias that ran in
its favour first (endgame ceiling 0.0 best, **+64.33** CI [+35.67, +94.17]; the
keeper-variance fix moved the headline $1.17). That refutes a BLANKET tilt, not
a targeted swing on an identified player — do not let the two be conflated.

## 4b. THE GRADING PATH — one fix, one revert, and the lesson is the revert

`draft/audit/pbp_rebuild_2pt_gap_2026-08-17.md`.

**Why anyone cares:** every strategy finding rests on **N=2 graded seasons**,
because 2025 cannot be graded — the play-by-play recovery path is REFUSED for
failing its own cross-validation against 2024. Unlocking it would take N=2 to
N=3, the threshold the report's own selection rule is written against.

**FIXED:** `weekly_from_pbp` emitted no two-point-conversion field while our
scoring prices `pass_2pt`/`rec_2pt`/`rush_2pt` at 2.0 each — seven of the eight
worst 2024 disagreements were exactly `2 x (that player's 2pt count)`. Fixing it
cut `mean_abs_diff` 0.489 → 0.149.

**REVERTED, AND THIS IS THE PART TO REMEMBER:** the blocker is Jameson Williams,
off by exactly 11.0, whose two lateral receptions total exactly the 50 missing
yards and one missing TD. Crediting the lateral receiver fixed him **to the
point** — and broke Jahmyr Gibbs (+8.0) and Josh Allen (+6.7) the other way.
Gibbs' structurally identical lateral touchdown shows `receptions=0,
receiving_yards=0.0, targets=0` in the official feed: the library credits the
lateral player **nothing**. **Williams' exact arithmetic match was a coincidence
over-read as a rule.** A hypothesis that fits one case perfectly and is refuted
by the second is the shape of most of what went wrong this week.

**And the gate caught a self-inflicted break during the revert** (the edit
deleted the passing block; `cross_validate` reported `worst_diff` 444.04
immediately). The strictness that refuses 2025 is the same strictness that made
a bad edit impossible to miss — which is why **the 0.5 tolerance must not be
loosened.**

**Still open:** the gate still refuses 2024 at 11.0. Laterals need the library's
real aggregation semantics, not another guess.

## 5. THE GATES THAT NOW EXIST (and what they do NOT cover)

- `constant_multiple_sweep.py` — finds fields that are a rescaled copy of
  another, WITHIN (position, band) cells. Carries a known-positive control and
  **refuses to print a report if the control does not fire**.
- `test_freeze_not_stale.py` — every field the freeze DECLARES must appear in
  the artifact. Self-maintaining: reads `PLAYER_FIELDS`, not a copy.
- `weight_provenance.test.js` — re-aimed; now fails if a synthetic dispersion
  constant is REINTRODUCED to `build_bundle.py`.
- `harness_divergence.py` — the AST check that reads build_bundle's real field
  list rather than a mirrored copy. **It was itself wrong for a few hours**: the
  dispersion fields moved into a second pass, invisible to its parse, so it
  reported `proj_ceiling` as corrupting a backtest number the morning that
  stopped being true. Fixed by declaring `DISPERSION_FIELDS` ONCE in
  build_bundle and having the tool read it — one declaration, two readers, and a
  refusal if it disappears.

**Honest limit:** of the real defects found on 08-17, only some were caught by
machinery, and one of those was machinery written the same day. The gates cover
the shapes we know about. The rest are still found by reading.

**AND ONE CLASS RESISTED GATING — recorded because the next person will try.**
Six of the day's findings were stale CITATIONS: a comment asserting another
module's constant (`build_bundle.py writes 1.35 x proj_mean`,
`HARNESS_CEILING_RATIO = 1.35; // build_bundle.py:132, verbatim`). I built a
sweep for it and **deleted it**, because it failed its own known-positive
control and the reason is structural, not tuning:

- the constant usually lives in CODE and the citation in the trailing COMMENT,
  so a comment-body reader cannot see the number at all; and
- fixing that still fails, because the test "is the cited number still present
  in the cited file?" is defeated by **this repo's own good habit** — we keep
  the history, so `build_bundle.py` still contains the string `1.35` in the
  comments explaining what it used to do.

Textual presence cannot distinguish "the constant is still there" from "the
constant's obituary is still there". A real check would have to parse the cited
file and compare live VALUES, which is `harness_divergence.py`'s AST approach —
that is the direction, if someone wants it. Until then this class is caught by
reading, and that is stated rather than papered over with a tool that reports
zero and proves nothing.

## 6. THE SWEEP IS CLOSED

*"What else is calculated off a constant when it shouldn't be"* — answered on all
four surfaces: production board (dispersion family only, gated), harness
(fixed), study code (one real bug), **live draft JS + `src/`: clean** (every hit
is `|| 0` or a sort comparator; the one non-zero constant, `games_expected || 15`,
never fires — the field is on all 682 rows).

Four things checked and CLEARED are recorded in `TODO.md` so nobody
re-investigates them: the `CFG.WEEKLY_SD` metadata fields, the `weekly_sd or 6.0`
pool fallbacks, `source_weight_prior`'s sign flip, and Pearsall's zero projection
(he is on IR).

## 7. WHAT IS STILL OPEN, IN ORDER

1. **Wire realized weekly volatility** — top post-draft item, above snap share
   (a weaker proxy for the same thing). **PREREGISTERED:
   `VOLATILITY-WIRING-PREREG.md`.** Three decisions are fixed there so they
   cannot be chosen after seeing results: `f` must preserve the cell mean (or
   the change is a level shift in disguise); a player with NO volatility keeps
   his CELL constant — never the positional mean, which would hand the steadiest
   reading to the injury-return group; and it needs its own
   `proj_ceiling_source` value, because one field name holding two
   constructions is the error the `_source` stamps exist to prevent.
2. ~~**Re-derive the composite `ceiling` weight**~~ — **DONE 2026-08-17, and it
   came back against us.** See §7b below; what remains is bracketing and
   replication, not the derivation.
3. **The `need` study** — preregistered (`NEED-WEIGHT-PREREG.md`). Cheaper than
   it looks: `live_context.js:126` already accepts a weights override, so it is a
   `--need-weight` axis on `archetype_rooms.js`, not new machinery.
4. **Routes-run** — the next per-player opportunity feed after snap share.
5. Studies resting on the `risk` term (PARTIAL on backtest boards).

**Nothing in 1-5 ships before 08-22.** A weight measured once, late, is a worse
instrument than a known one.

---

## 7b. THE CEILING WEIGHT IS SET WRONG, AND IT STAYS WRONG THROUGH THE DRAFT

Prereg `CEILING-REDERIVATION-PREREG.md`, result
`draft/backtest/EXP-CEILING-REDERIVATION.md`.

**The tool ships `ceiling = 0`. That zero came from a −4.8 [−26, +17]
measurement taken on a board where `proj_ceiling` was `proj_mean × a constant`,
which made the ceiling term rank-identical to the value term (Spearman
1.0000).** Raising the ceiling slider was arithmetically the same as raising the
value slider. **It was never a measured setting.**

Re-run on the first real-ceiling board (505 distinct ceiling/mean ratios where
there was 1), 400 paired rooms × 3 fixed seeds, against a `core` arm that IS the
shipped configuration:

| | w=0.65 | w=1.0 | w=1.5 |
|---|---|---|---|
| pre-fix (degenerate) | +0.1 · 0/3 separable | +10.3 · 0/3 | +28.9 · 1/3 |
| **post-fix (real ceilings)** | **+35.5 · 3/3 separable** | +21.1 · 1/3 | +19.9 · 1/3 |

**w=0.65 clears the preregistered bar at 3/3 and 3/3.** And the shape inverted:
on the broken board the effect ROSE with the weight, on the real one it FALLS —
which is what a second copy of the value term should look like, and is the
clearest single demonstration that the old grid was measuring the defect.

**A second preregistered run bracketed it** (`CEILING-BRACKET-PREREG.md` →
`EXP-CEILING-BRACKET-RESULT.md`), over w ∈ {0.15, 0.30, 0.45, 0.65}, with w=0.65
carried across as a control that had to reproduce its earlier edges exactly or
kill the run. **It reproduced, and all twelve seed × weight cells came back
positive with a CI excluding zero.** 0.30/0.45/0.65 are indistinguishable (means
within **$0.6**); 0.15 is lower (+$24.0) but still separable in 3/3. So the
answer is **zero versus non-zero** — it does not depend on picking a value, and
naming "the optimum" off a $0.6 gap is forbidden by that prereg.

**A third run replicated it on independent seeds** (`CEILING-FRESH-SEED-PREREG.md`
→ `EXP-CEILING-FRESHSEED-RESULT.md`). The first two shared a seed set, making
them one experiment measured twice; this one uses the next rungs of the same
prime-offset ladder, declared before the run, with the script refusing outright
on any overlap. At **w=0.45** — the positional middle of the plateau, chosen over
the higher-scoring 0.30 precisely so it could not be score-shopping — it returned
**+29.06 / +32.69 / +46.06, all separable. Mean +$35.9. The promotion bar is
cleared.**

Three runs · two independent seed sets · four weights · **one direction**, with
means of +$35.5 / +$35.7 / +$35.9.

**It still does not ship before 08-22, deliberately.** A cleared bar makes the
change *available* to Cory after the draft; it does not make it. That date was
fixed in all four preregs before any of them produced a number, and a result
landing the way we hoped is the worst possible reason to relax it. What
this changes today is the *account*, not the number: three places told Cory the
term was unmeasured, and all three now say it is measured, contradicted, and
held. **The Live-policy panel says so in his words on the screen.**

Order after the draft: ~~bracket~~ **done** → ~~replicate on fresh seeds~~
**done, cleared** → **Cory's shipping call** — the only step left, and it is his.
Frame it as *"the model is ignoring upside entirely; three preregistered runs
across two independent seed sets say it should not, and say the exact amount
hardly matters anywhere between 0.30 and 0.65"*, never as *"set it to 0.30"* →
then the per-player question, which none of this touches and which is the one he
has actually been asking: `weekly_volatility.py`.

---

## 8. KEEPING THIS FILE HONEST — a process note, not a gate

`draft/tests/test_draft_week_brief_numbers.py` pins the NUMBERS in this file
against the artifacts they came from, so a figure here cannot silently drift.
**Coverage is not gated, and it decayed within hours of being written**: routes
run — a whole per-player feed, built, validated, weekly and registry-gated —
appeared ZERO times here until it was added late on 08-17. The numbers were
guarded and stayed true; what was missing was an entire subject.

**A keyword gate was tried and NOT shipped.** Matching registry keys against
this prose flags 7 of 8 captures as absent when only one truly was — `snap
counts` is covered here in plain English, not as `fetch_snap_counts`. A check
needing an ignore-list for seven of eight entries is theatre, and a noisy gate
manufactures confidence, which is worse than the gap.

**So the check is manual and takes a minute:** before trusting this file, run
`python3 -c "import sys; sys.path.insert(0,'draft'); import capture_registry as
CR; print(list(CR.CAPTURES))"` and confirm every capture added or fixed since
this was written has a home above. `CAPTURES` is the maintained list; this file
is the thing that falls behind it.

---

**Suites at hand-off:** Python publication gate (what CI runs) **3,283 passed,
10 deselected**; JS **309/309**. The deselected `repo_parity` set includes two
deliberate red flags — the ADP-sd ratchet and the stale freeze — which are
evidence awaiting a human, not broken builds.
