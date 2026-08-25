# The mailbox guard watches rows, and we lose cells: two demonstrated gaps, and what is already missing

**D (data stewardship), 2026-08-25. Register 327. TERRITORY of the guard itself: relay — the code change is filed as a proposal, not pushed.**

## What started this

Register 190's ROUTES item asked A to bless `mailbox_deletion_guard.js`. While
answering it I wrote down that the guard "detects deleted ROWS, not overwritten
cell content inside a surviving row." That sentence was a guess. This artifact
is what happened when it was checked.

## The two gaps, each with a control

**GAP 1 — a cell can be wiped inside a surviving row and the guard is green.**
Control: in a worktree off `main`, register 137's next-action cell was replaced
with `TODO` (2,175 chars → 6) while the row itself stayed. `guard exit=0`.
Deleting the same row outright: `guard exit=1`. The guard's unit is the row key,
and the key survived.

**GAP 2 — a whole row can be deleted and the guard is green, if another row
shares its id.** `keysOf` returns a `Map`, so duplicate ids collapse to one
entry. Duplicate ids are not hypothetical: `b460ba7` put **two rows keyed 316
and two keyed 317** on `main` at once (E's union-resolve of an already-pushed
rebase; E caught and fixed it themselves at `6a45529a`). Control: replay
`b460ba7` and delete one of the two *real, different* 317 rows — **9,511
characters** — `guard exit=0`.

**GAP 2b, found while fixing gap 2.** The escape that writes a deletion off as
a renumber matches a 40-character slice from near the **start** of the row.
Two rows that share a headline share that slice, so the 9,511-char deletion
above was reported as *"1 row renumbered/rekeyed, content survives — fine."*
The first draft of my own fix exited 0 on it for the same reason.

## What the gaps have already cost, measured

| commit | what it says it did | what it did | still missing from `main`? |
|---|---|---|---|
| `9112aa42` (08-24) | *"Merge: the relay and I triaged the same 19 rows concurrently — **keep both**"* | kept one. A's 2026-08-23 post-draft triage left **20 register rows** | **yes** |
| `4c695541` (08-23) | *"The register is losing rows during normal concurrent work and nothing detects it"* | lost **1,641 characters** out of register 269 — the completed `kept_players` sweep, eight-tools-filter-correctly / ten-do-not, and its own factor-of-ten self-correction | **yes** |
| `712f1e6ca` (08-21) | pinned in the guard's test file as a **known-negative that must pass forever** | deleted **900 characters** of the keeper-lock row: Cory's verbatim ruling *"Locks once deadline passes."*, the two-switch fix that shipped the same hour, and the control run that turns 10 of 13 red | no — it came back at `7efb89a4`, a later merge that happened to carry the older copy. **Recovered by luck, not by detection.** |

The guard exits **0** on all three.

Two independent accountings of `9112aa42`, because one number is not a finding
(Rule 3i): a word-level `difflib` pass against `main` today gives **19 rows,
7,365 characters**; the shipped detector's own segments give **20 rows, 13,039
characters** (its segments carry up to 11 words of window slop at each edge, so
it is the loose bound and 7,365 is the tight one). Both agree on the row set.
Distinctive phrases from the missing text — `deleting every WORLD_STATE
override whose condition has cleared`, `eight tools already filter correctly`,
`planting a revert of the ruling turns 10 of the 13 red` — were checked with
`git grep` across the whole tree, not just the register.

**And the first thing the fixed guard caught was one of mine.** `2ae9dcbd`, my
own promise-debt cleanup, replaced the relay's *"moved 08-21 by the relay WITH
REASON: the S19 CI batch is undispatched…"* note on ledger rows **P251, P252
and P253** — 1,113 characters — while re-dating them. The reason text survives
in one other file, so this is the mild end of the class; it is listed because
the guard's first real catch being the author's own commit is the point.

## Why the obvious fix is the wrong one, measured

The first version of this fix was a **length threshold**: flag a surviving row
that got shorter by more than N characters. Of the twenty rows that lost A's
triage annotation, **four ended up LONGER than they started** — 82 (+141), 59
(+114), 4j (+101), 256 (+62) — because the relay's re-date text was bigger than
A's paragraph. **No length rule can see those four by construction.** The rule
that sees them is content survival: a run of ≥12 words from the row as it was,
appearing nowhere in the file as it now is.

The second version diffed each row against its paired successor. That was
**48× slower** (22.0 s against the shipped guard's 0.46 s on one commit — too
slow to gate a push) **and wrong on reconciliation merges**, where ids move in
bulk and "the row keyed 138 after" is a different finding from "the row keyed
138 before": **17 spurious rows on `712f1e6ca`**. Comparing against the FILE
rather than a paired row removes the pairing, the anchors and the quadratic
scan at once. Final cost: **0.68 s**, against the shipped guard's 0.55 s on the same run.

Two normalisations earn their place, both from measurement rather than taste:
id-provenance notes (`*(renumbered from 133 to 137 at merge …)*`) and id
numbers themselves are stripped before comparison, because a renumbering merge
rewrites both by design — `712f1e6ca` turned *"register 134's 'nothing is
distinguishable' verdict"* into *"register 132's …"*, same sentence, one digit
apart. This guard protects findings, not id numbers.

## Where the bar sits, and the false-positive rate behind it

Two thresholds, both env-tunable, both chosen from a sweep of **300
first-parent commits of `main`**:

- `MAILBOX_CLOBBER_ROW_CHARS = 200` — a per-row floor. Any edit makes the
  windows straddling it unfindable, so a row whose `recheck 08-24` merely moved
  reads as ~100 lost characters. Across the 41 rows of one date roll
  (`f6abd8fd`, my own) that summed to **4,004** and would have gated a commit
  that lost nothing. Real clobbers concentrate: `9112aa42`'s twenty rows
  average 368 characters each.
- `MAILBOX_CLOBBER_CHARS = 1000` — the total over the floor. A row-count
  criterion was tried and dropped: two rows losing 474 characters between them
  is `029478a5`, the **88 KB restore** commit, and gating that is the guard
  calling a rescue a robbery.

**Result over 300 commits: 13 red (4.3%), against the shipped guard's 4.
Nine newly red, zero regressions** — every commit the shipped guard catches,
the extension still catches. Of the nine, two are the verified cross-author
clobbers above and one is `6a45529a` (E's real dedup, which dropped a 9,511-char
row deliberately and documented it — exactly the case `[mailbox-prune]` exists
for). The remaining six are single-author rewrites of their own rows; each is
one word in a commit message away from green.

## Controls (Rule 3e/3f — eleven, and the break test)

| # | case | want | got |
|---|---|---|---|
| 1 | `9112aa42` 20-row triage clobber | fire | fire |
| 2 | `4c695541` register 269 sweep result | fire | fire |
| 3 | `57a4a95e` the register-190 clobber (the original known-positive) | fire | fire |
| 4 | duplicate-id row deleted, 9,511 chars, replayed from `b460ba7` | fire | fire |
| 5 | `24d18dbe` legitimate rewritten tick | pass | pass |
| 6 | synthetic: one tick + one append-only correction | pass | pass |
| 7 | synthetic: register 137's cell wiped, 2,169 chars | fire | fire |
| 8 | `029478a5` the 88 KB restore | pass | pass |
| 9 | synthetic: unique whole-row deletion | fire | fire |
| 10 | `f6abd8fd` 41-row recheck-date roll | pass | pass |
| 11 | `712f1e6ca` the 900-char ruling loss | fire | fire |

**Break test, because a control that cannot fail is worse than no control:**
with `MAILBOX_CLOBBER_CHARS=999999` the two MODE-1b-specific known-positives go
red and the suite reports `16 passed, 2 failed`. `712f1e6ca` stays green-to-red
either way because it trips the row-deletion path as well.

Test file: **18 passed, 0 failed.**

## What I got wrong on the way here, since three of these were caught by controls

1. **The sweep that produced the first measurement keyed rows in a dict.** It
   reported one shrink event, 2,793 chars at `b460ba7`. Direct verification
   said `rows before: 1 after: 2, len 12304 → 12304, distinct words lost: 0` —
   the commit had **two** rows keyed 317, the dict kept one, and I compared the
   wrong line. That is the third distinct defect in one measurement probe, and
   it is also how gap 2 was found.
2. **A classifier written to separate "moved" from "lost" reported `moved=0` on
   all 18 events.** Its own docstring named a control it never asserted. The
   uniform zero was the tell.
3. **I analysed control output from a stale JSON file** that a later run had
   overwritten, and got 1 flagged row where the console had just printed 19.

## Follow-up questions (Rule 3g)

- **Does this imply another failure we have not looked for?** Checked rather
  than asserted. `register_lost_rows.py:27` is
  `ROW = re.compile(r'^\| ([0-9A-Za-z]+) \|')` — it keys on the id exactly as
  the guard did, so **both gaps apply to it unchanged** and it is the next
  thing to fix. `routes_integrity.test.js` does not: it keys on normalised
  item TEXT (with a 40-character minimum), so a clobbered item changes its own
  key and reads as a deletion there. Different shape, probably already
  covered — but it uses a `Map` too, so identical items still collapse.
- **Does it invalidate something we already trust?** Yes. `712f1e6ca` was
  pinned as a known-negative in the guard's own test file, which means the
  suite was actively asserting that a 900-character loss of a Cory ruling was
  fine. The proposal re-grades it, with the `git grep` evidence in the comment.
- **Is it routed to the lane that can act?** The guard and its test are
  `TERRITORY: relay`; the patch is filed at
  `draft/audit/proposed/register327_mailbox_content_clobber.patch` and routed
  in ROUTES. **The 20 clobbered register rows are A's text and the relay's
  file — the recovered content is preserved below rather than re-inserted by
  me, because re-editing 20 rows I do not own is the same operation that
  caused this.**

## Recovered text

Everything below was present in `DEFECT-REGISTER.md` before the named commit,
is absent from it now, and is reproduced here so that acting on it is an edit
rather than an archaeology exercise.

## From `9112aa42 — "Merge: the relay and I triaged the same 19 rows concurrently — keep both" (2026-08-24)`

**20 rows, 13039 characters** — flagged by the guard on that commit, and still absent from `DEFECT-REGISTER.md` on `main` as of 2026-08-25.

Reproduce: `node draft/tools/mailbox_deletion_guard.js 9112aa42^ 9112aa42`

### register 59 — 975 chars

> the fixed VONA.** `draft/tools/term_participation.js`, `term_participation.json`. **unblocked by nothing, owner A, recheck WAS 08-23.** **📅 STATUS CORRECTED OPEN → WAITING AND DATE MOVED 08-21
>
> and it ships at 0 — is untouched by the correction.** **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** ⚠️ **THE MECHANISM THIS ROW RESTS ON IS STALE, and it is checkable in one line.** It closes *"`need` is the only roster-aware term and it ships at 0"* — **`engine.js:826` ships `need: 1.0`**, set by Cory on 08-20. The headline (*twelve backs, two receivers*) was already corrected inside this row against his real twelve picks. **What the 2026 draft actually settled: the shipped engine drafts a COMPLETE roster** — QB1 RB5 WR6 TE1 K1 DEF1, measured across seven arms in `rail_late_rounds_sweep.json`. Re-scoped: the RB-pileup question is now a 2027 model question with the weight already changed under it. recheck 09-13 |
>

### register 4j — 917 chars

> its own thing to explain. unblocked by nothing, owner A, recheck WAS 08-23. **📐 RE-MEASURED ON THE FRESH 08-18 BOARD, AFTER THE PER-PLAYER VOLATILITY
>
> after 08-22 — a cross-position lever, not an upside-finder. **recheck unchanged.** **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** ⚠️ **PREMISE SUPERSEDED, read off the constant rather than inferred (ID#).** This row frames a ceiling-weight decision as one *"Cory holds for after 08-22"*.
>
> one *"Cory holds for after 08-22"*. **He ruled it BEFORE then — `engine.js:826` ships `ceiling: 0.0`, set on 08-20 (*"switch it off, its so arbitrary"*).** So the decision is not pending. What remains is the row's actual finding — that the board still cannot say *"same projection, different upside"* — which
>
> say *"same projection, different upside"* — which is a 2027 model question, not a draft-week one. recheck 09-13 |
>

### register 130 — 848 chars

> in league_config.ruled_roster_target. Re-file against that if the concern survives. | **** **📅 POST-DRAFT TRIAGE (A, 2026-08-23).** ⚠️ **THIS ROW WAS THE ONE OPEN FINDING IN THE WHOLE REGISTER WITH NO RECHECK DATE AT ALL** — so `register_recheck_check` could report it but could never fail on it, which is precisely the hole that check exists to close. Its status cell was also malformed (`****`), which is how it stayed invisible. **BOTH HALVES OF ITS OWN RESOLUTION VERIFIED TODAY rather than taken on trust:** `CFG.ROSTER_SHAPE` is absent from `engine.js` (0 matches), and `league_config.ruled_roster_target` exists carrying the targets, Cory's 08-19 verbatim ruling and the n=9 provenance. The concern named here did not survive; it is closed on evidence, and it now carries a date so its successor cannot go dark the same way. recheck 09-06 |
>

### register 173 — 773 chars

> merges · **C** refiles blocked rows | 🔴 OPEN — recheck WAS 08-23 | A merges `claude/external-ingest-program-1xfinj` (ROUTES 08-21 row: full ASK/EVIDENCE/REC/DEFAULT; take MAIN's
>
> → relay cherry-picks the eight workflows + dependencies under capture-family precedent **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** **ITS OWN ESCALATION CONDITION FIRED TODAY:** the row says *"silent by 08-23 → relay cherry-picks the eight workflows + dependencies under
>
> 08-23 → relay cherry-picks the eight workflows + dependencies under capture-family precedent"*. 08-23 has arrived with no reply, so the escalation is live rather than pending. Recording that the trigger fired rather than silently re-dating past it. recheck 08-26 |
>

### register 82 — 748 chars

> to 10.2, i.e. ID#'s fix doing its job. **owner A, recheck WAS 08-23.** **📅 OPEN → WAITING, 08-21 → 08-23 (A, 2026-08-19), by this
>
> `survival_to_next` is `VONA_INCLUDE_SELF` correctly discounting a ~45-point raw gap to 10.2. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** ⏳ WAITING ON CORY (A13). **Same stale mechanism as ID#: it argues from `need` at zero, and `engine.js:826` ships `need: 1.0`.** The finding — that at his first pick the recommendation was ~100% VONA with every other term contributing zero — is a real decomposition and worth keeping, but it describes a weight vector Cory has since changed. **Re-derive against the shipped weights before acting on it.** recheck 09-13 |
>

### register 74 — 702 chars

> this probe is for detecting the defect class. **owner A, recheck WAS 08-23.** **📅 STATUS CORRECTED OPEN → WAITING AND DATE MOVED 08-21
>
> caveat built on it has been retracted with the numbers shown.** **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** ⏳ WAITING ON CORY (A13) for a decision whose deadline was the draft. **That deadline has passed and the row's real content is a METHOD caveat that survives it**: the ADP-order probe's rosters are unstable to a board rebuild, so it may compare arms on one board but must not rank them. That constraint binds every 2027 arm and is worth more than the expired ruling. Re-scoped to it. recheck 09-13 |
>

### register 92 — 688 chars

> number in a growing file.** **unblocked by nothing, owner A, recheck WAS 08-23** — the morning after the draft, so the outcome is recorded
>
> recorded while anyone remembers which branch of the table actually fired. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** Its own date was chosen as *"the morning after the draft, so the outcome is recorded while anyone
>
> draft, so the outcome is recorded while anyone remembers which branch fired"* — that morning is now. **Nothing is blocked; the outcome simply needs writing down**, and every further day makes the memory the row depends on worse. Kept near-term deliberately. recheck 08-26 |
>

### register 186 — 688 chars

> **E** classifies · relay sweeps receipts | 🔴 OPEN — recheck WAS 08-23 | Watermark reconciled (authoritative from 186) + CI guard added this
>
> for no benefit. It goes last precisely because it is largest. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** **LIVE, AND I AM TODAY'S EVIDENCE.** This row is the id-collision protocol. In one session I hit **three** collisions — my rows renumbered 266→269→273, 267→271 and 276→279, every one against an id `main` printed while my push was in flight, and none produced a conflict marker. The protocol WORKS (main-printed wins, matched by content); the volume is the finding. recheck 08-26 |
>

### register 76 — 686 chars

> a consensus label, on the position ID# flagged.** **owner Cory, recheck WAS 08-23.** **📅 OPEN → WAITING, 08-21 → 08-23 (A, 2026-08-19), by this
>
> on draft morning for a decision that had not come due. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** ⏳ WAITING ON CORY (A14). **The draft it was gating is over and the contained fix was already written**, so there is still no work to schedule — but there is also no longer a deadline. Re-scoped: whether the scrapers' RB lift is a correction or a strategy objection is now a 2027 projection-program question, gradeable against the season instead of argued before it. recheck 09-13 |
>

### register 70 — 630 chars

> wins, with both numbers in front of him. **owner A, recheck WAS 08-23.** **📅 STATUS CORRECTED OPEN → WAITING AND DATE MOVED 08-21
>
> blocker is a human decision that had not come due yet.** **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** Filed as ⏳ WAITING ON CORY (A13) for a **pre-draft** weight decision. **He made it: `need` ships at 1.0 (`engine.js:826`, 08-20), and the draft it was gating is over.** Nothing here waits on him any longer. Re-scoped to the 2027 objective question — `need:1.0` versus slot-aware — which is a measurable arm, not a ruling. recheck 09-13 |
>

### register 254 — 619 chars

> must name a sha that is an ancestor of `main`.** recheck WAS 08-23 **⚠️ THIRD INSTANCE, found 08-22 ~05:15Z while routing D's register-88 answer
>
> Queued post-draft, owner relay, and the recheck date is the chase.** **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** Explicitly *"queued post-draft, owner relay"* — post-draft is now. The row's substance (a fix claimed done-and-pushed that is not on `main`) is the same class as **ID#'s** *built, reviewed, never executed*, and both point at verification-by-assertion rather than by running the thing. recheck 08-30 |
>

### register 256 — 606 chars

> the capture must join the board he actually drafted from.** recheck WAS 08-23 **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** Half of this row is CLOSED by today's work: `mine 0 of 12` is fixed — the seat now derives from the freeze and `--status` reads **12 of 12 live picks (+3 keepers)** off
>
> 12 live picks (+3 keepers)** off the untouched log (ID#, commit 9f9c3e0c). **What remains is the 682-vs-680 freeze join**, which is real and unaffected: the capture is keyed to a 08-16 source artifact and he drafted from an 08-22 rebuild. recheck 08-30 |
>

### register 21b — 594 chars

> is a labelling improvement rather than a live falsehood now. **recheck WAS 08-23** — moved by the relay with the reason that the falsehood
>
> remainder is display polish that should not compete with the draft. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** The relay moved this to 08-23 with the reason that the live falsehood was gone and the remainder *"should not compete with the draft"*. **It is not competing with anything now.** Display polish, genuinely low priority, dated accordingly rather than pretended urgent. recheck 09-06 |
>

### register 4g — 591 chars

> check only fires *while a merge is still in progress*. **recheck WAS 08-23** — moved by the relay with that reason. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** Moved to 08-23 by the relay for the draft. The merge it guards is the exact loss shape `routes_integrity.test.js`'s union check exists to catch, and that check **only fires while a merge is in progress** — so this cannot be left to drift. **Three id collisions hit me today alone (266→269→273, 267→271, 276→279), so the class is live, not theoretical.** recheck 08-30 |
>

### register 251 — 580 chars

> is the muted alarm this whole mechanism exists to prevent. recheck WAS 08-23 **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** The pre-draft freeze re-take this row asks for is **moot — the draft is over** and re-taking a *pre*-draft freeze now would fabricate a prediction after the outcome. What survives, and is the whole live half, is **deleting every WORLD_STATE override whose condition has cleared**; an override that outlives its condition is exactly the muted alarm the row names. Re-scoped to that. recheck 08-30 |
>

### register 56 — 567 chars

> Saturday, or after.** `VONA-SELF-EXCLUSION-PREREG.md`, `vona_arm_grade.json`, audit `vona_self_exclusion_2026-08-19.md`, CI run 32206775148. **recheck WAS 08-23.** **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** The ask was *"ASK CORY: flip it before Saturday, or after"* — **Saturday has passed, so the question collapses to one option and no longer needs him to choose between two.** Re-scoped from a draft-week ruling to a 2027 model-program arm, where it can be graded rather than guessed. recheck 09-13 |
>

### register 212 — 499 chars

> that is the owner's call. unblocked by nothing, owner A, recheck WAS 08-23. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** Owner A, and the row is right that *"choosing the anchor is choosing what the detector is allowed to see"* — so it stays a decision, not a chore. **The draft is no longer a reason to defer it**, and a control anchored to `HEAD` that passes once and fails forever is the defect this row exists to stop. recheck 08-30 |
>

### register 4q — 484 chars

> it still needs is that one run before A rules.** **recheck WAS 08-23**, moved from 08-19 by the relay: the premise is verified current,
>
> is a refit that cannot and must not land before 08-22. **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** **UNBLOCKED BY THE DRAFT HAPPENING.** The row's own words: *"a refit that cannot and must not land before 08-22"*. It can now. No new information needed — it needs the run. recheck 09-06 |
>

### register 127 — 471 chars

> before knowing which of the two it is. **owner A, recheck WAS 08-23.** **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** Dated 08-23 as post-draft. Still open and still unexplained — a red test on a board that has since been rebuilt twice. **Do not widen the bar before knowing which of the two causes it is**, which is the row's own instruction and the reason it has not been closed by convenience. recheck 08-30 |
>

### register 5f — 373 chars

> then the only action is the rebuild, which is already tracked). **📅 POST-DRAFT TRIAGE (A, 2026-08-23, on Cory's ruling to re-scope and re-date the pre-draft backlog).** **UNBLOCKED.** The row explicitly deferred itself *"post-draft: before then the only action is the rebuild"*. Post-draft is now, the rebuild is done, and the row is plain actionable work. recheck 08-30 |
>

## From `4c695541 — "The register is losing rows during normal concurrent work and nothing detects it" (2026-08-23)`

**1 rows, 1757 characters** — flagged by the guard on that commit, and still absent from `DEFECT-REGISTER.md` on `main` as of 2026-08-25.

Reproduce: `node draft/tools/mailbox_deletion_guard.js 4c695541^ 4c695541`

### register 269 — 1757 chars

> which is the row this project's roster-shape evidence now points at. ⚡ **THE SWEEP THIS ROW PROMISED IS DONE, AND IT CUTS BOTH WAYS.** I said the broader grep was worth more than the row and that I had not run it. Run now, over every non-test reader of `kept_players`: **eight tools already filter correctly** by `team_slot` (`league_sensitivity`, `onesie_timing`, `construction_order`, `bench_branch_probe`, `profile_flip`, `contrast_rate`, `roster_construction`, `intervention_rate`), and **ten take the list whole into a variable named `KEEPERS` or `MY_KEEPERS`** — `archetype_rooms:105`, `variance_portfolio:399`, `bench_wire_room_sim:86`, `adp_sanity:51`, `adp_sanity_stage2:36`, `mock_walk:34`, `barbell_variance_probe:64`, `roster_room_audit:76`, `stack_effect:39`, and `live_context:109`. **The correct pattern is already in the repo eight times; the ten are not missing a design, they are missing a filter.** ⚠️ **AND I NEARLY OVERSTATED IT BY A FACTOR OF TEN.** `live_context.js` is the shared loader, 21 files reference it, and its own docstring says *"defaults to Cory's real keepers from `kept_players`"* while taking all 23 — so my first read was that every consumer inherits a 23-man phantom roster, which would corrupt every roster-aware term including `need`. **Counted instead of asserted: the default is `roster: o.roster \|\| keepers`, and of 15 `liveContext(` call-sites only TWO omit `roster` — `failure_states.js` and `stack_effect.js`. Thirteen pass one explicitly.** So the shared-loader exposure is two call-sites, not twenty-one, and the headline defect stays what this row said it was: ten tools with a missing filter, of which the two in the ASK block anything from running at all. | A | 🔴 OPEN | **A: both files are TERRITORY:
>
