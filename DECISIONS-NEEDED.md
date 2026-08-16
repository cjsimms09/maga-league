# DECISIONS NEEDED — findings that imply a gated change

Standing rule (SESSION-A.md habit 7): a finding that implies a change with unbounded
blast radius goes HERE as a decision with evidence — never left inert in a JSON file.
Each: what was found · what it implies · magnitude · confidence · cost of inaction ·
recommendation. Cory's call, made with the evidence. Auto-adaptable findings (bounded
blast radius) are NOT here — they change on their own and say so.

Audit date: 2026-08-09 (swept every recorded verdict in draft/backtest/*.json + *.md).

**REORGANIZED 2026-08-15 (Cory research relay).** This file had closed and open items
interleaved (two entries numbered "1", two numbered "7"), which caused a real mistake
that day — a resolved item was read as still-open from a partial scan. Restructured
into **OPEN** (top, actually needs a decision or is blocked) and **RESOLVED /
HISTORICAL** (bottom, kept for the audit trail). **Nothing was deleted, edited, or
renamed — every heading below is byte-identical to before, only relocated** — so this
respects the same rule that already governs superseded headings in this file
(`integrate.sh` refuses a merge that loses one).

---

# ⚡ THE QUEUE — every open decision, one screen (2026-08-15 night)

**This section is THE decision list. Every other surface (the Monday runbook's
footer, TODO.md's state block, ROUTES items) POINTS here rather than keeping
its own copy — one list, referenced everywhere, per Cory: "the decision list
should live in one place." Each line: the call · the gated switch · the
evidence file. Detail lives in the evidence, not here.**

## Needs Cory before the 22nd

*(Items 1-4 RULED 2026-08-16 — "1. Yes, 2. No, 3. Yes, 4. Yes? If you think
so", v4 promotion "Yes on v4", ROOM_MIX_PRIOR "YES, turn it on" — ALL
EXECUTED; records in "Settled" below.)*

*(none — every before-the-22nd call is ruled and executed; the seventh,
own_v6 promotion, was RULED 2026-08-16 — "YES on V6" — and EXECUTED the
same session: see Settled below)*

- **[NEW 2026-08-16, edge hunt] The measured tie-break lean** — add a
  late-season-trajectory fact FIRST in the war room's toss-up facts? · gated
  switch: the PREPARED diff to `public/js/draft/verdict.js tiebreakFacts`
  (+ its one board field) in `draft/audit/edge_hunt_2026-08-16.md` §3.1 —
  prepared, NOT applied · evidence: `draft/data/fifty_fifty_study.json`
  (in 176 historical toss-ups the hotter-finishing player won 58%, CI
  51–65%; clears the preregistered rule, fails Bonferroni ×9 at p=0.31 —
  a lean, not a law; the other eight features predicted NOTHING, which is
  itself the bigger Saturday finding). Full entry: § "THE 50/50 TIE-BREAK
  LEAN" below.

## Standing open (predate today; unresolved; details under OPEN below)

- ~~Two projection sources disagree by position, systematically (#000,
  2026-08-12)~~ — **FIXED 2026-08-16 under Cory's ruling ("Don't agree with
  timelines we fix now")**: FP's live payload serves receptions as `rec_rec`,
  which `_FP_STAT_MAP` dropped — every FP number was scored without reception
  points. Recovered exactly (not rescaled); record appended to #000 below;
  evidence chain in `draft/audit/projection_correctness_2026-08-16.md`.
  (The 2026-08-15 partial answers — FP-archive skill benchmark + §1.7 fork
  measurement — stand; the archive endpoints serve `rec` and were never broken.)
- ~~DEF projections 12 points short — `def_fum_td` maps to nothing (#0,
  2026-08-11)~~ — **FIXED 2026-08-16 under the same ruling**, and the gap was
  larger than documented: all-32 measurement found FOUR unmapped TD component
  keys (`def_fum_td`, `pass_int_td`, `def_kr_td`, `pr_td`); 11 defenses were
  short 6-18 points. Record appended to #0 below; same audit doc.
- Regression/shrinkage weight over-regresses — $ arm pending (#2).
- Simplify AUTO: mask + value is the whole measured edge (#3).
- STREAMABLE_LATE defined, tested, never read (#000000, 2026-08-15).
- The tool drafts 0.9 RBs per draft in every arm (#0000) · TE at 3.6 picks
  undiagnosed (#00000).
- Sunday alert fires before official inactives (B, #7) · self-referential
  fixtures clause awaiting authorization (A).

## Settled today (rulings made; records, not questions)

- **PROJECTION CORRECTNESS #0 + #000 — Cory 2026-08-16 "Don't agree with
  timelines we fix now" → BOTH FIXED, evidence-first, same session.** #0: all-32
  DEF capture proved Sleeper's projection rows carry only TD *components*
  (never the aggregates our table prices) — `normalize_def_stat_line` folds
  them in with aggregate-wins/components-sum discipline; 11 DEFs corrected
  +6..+18 (Rams 114→132), DEF replacement 99→103. #000: FP's payload serves
  receptions as `rec_rec`, which the map dropped — every FP number lacked
  reception points (WR 0.824/TE 0.810 → 1.039/1.059 after exact recovery; the
  RB ~1.00 "control" was two errors cancelling). Board regenerated through the
  real generators, baseline v18 frozen under the ruling, 13 new pins, suites
  green, verify 7/7. Records appended to #0/#000 below; evidence chains in
  `draft/audit/projection_correctness_2026-08-16.md`.

- **own_model_v6 PROMOTION — Cory 2026-08-16 "YES on V6" → APPLIED**
  (upgrading his same-day v4 acceptance). v6 = v4's QB arm byte for byte +
  v5's component arms at RB/WR/TE (usage x efficiency x availability, with
  the week-1 vegas tilt and the target-share/pace features his addendum
  mandated); cleared REC-3 at ALL four positions with nothing tuned in the
  composition. v5 alone failed exactly the QB Spearman cell (+0.0006 fold
  margin — the fragility its prereg named). Executed: own_projections.py v6
  layer live; vegas store extended to 2026 (week-1 lines cover all 32
  teams, the §7 deployment prerequisite); board column refreshed (424
  players, provenance own_v6); REC-3 regenerated via learning_loop.py with
  v5+v6 candidate records; opening script regenerated;
  test_own_projections_v6_live.py repinned (arithmetic tripwire recomputes
  the v5 ensemble by hand from V5_CONFIG). Role unchanged: display-only
  third opinion; proj_mean composition stays blocked on REC-2 (January
  2027). Honesty note carried: 2025 read three times in this lineage.
- **ROOM_MIX_PRIOR — Cory 2026-08-16 "YES on room mix prior, turn it on" →
  flipped TRUE** (survival.js). Unprofiled-seat position probabilities now
  blend the league's measured bucket mix (forward-tested on 2025; per-owner
  terms excluded as non-persistent) at the existing 0.25 weight; survival
  moves ≤3.1pp. Baseline v17 frozen under the ruling; room_prior.test.js
  repinned to the ruled default with the off-arm still proven.
- **own_model_v4 PROMOTION — Cory 2026-08-16 "Yes on v4" → APPLIED.** The
  first REC-3 bar clear (all four positions, both metrics, preregistered).
  `proj_ownmodel` now runs the v4 construction (`draft/own_projections.py`,
  graded modules imported, zero network, v1 core kept as rollback), board
  label own_v4, committed board column refreshed + verified against a fresh
  run by test. Still display-only: composition entry vs Sleeper stays
  blocked on the January 2027 grade (REC-2). Caveats on the record in
  REC-3's regenerated entry.
- **VONA_WIRE_BENCH — Cory 2026-08-16 "Yes" → flipped TRUE** (engine.js), test
  pins updated to the ruled state, baseline v16 frozen with the ruling as its
  `_why` (v15 stays on the books as the pre-ruling reference).
- **Scoring-gap ADP correction — Cory 2026-08-16 "No" → CLOSED**, per the
  report's own recommendation ($0.00 through the certified grader).
- **KOV_MEASURED_RAMP — Cory 2026-08-16 "Yes" → flipped TRUE** (composite.js).
  Keeper value now prices where this league actually keeps from (rounds 4-6
  peak, zero in 10-15); every KOV test suite rewritten to the measured shape
  with the rollback path still pinned behind the flag.
- **Pick-33 headline ownership — Cory 2026-08-16 "Yes? If you think so" →
  THE SEAT PLAN OWNS THE HEADLINE** wherever it speaks (verdict.js): a
  personal-list pin first, then the plan's answer with the value pick always
  printed as the priced second line, rule/value doctrine unchanged where the
  plan is silent. 9 new fidelity pins (ui_fidelity_verdict 40/40).

- Deploy policy — Cory's "find the happy medium" → DEPLOY-POLICY.md rewritten,
  blanket freeze retired.
- Learning loop — Cory's "We need to fix!!!" → REC-1 measured proj_sd LIVE
  (decision arm re-verified on the fresh board), read-side wired.
- Pre-draft phantom availability — Cory's Nacua ruling → survival filter live.
- FP-archive Week-1 source prior — Cory's "Yes! If it works" → preregistered
  gates said NO (error scale doesn't transfer); flat start stands, negative
  pinned.

---

# OPEN — needs a decision, or is blocked and waiting

## 🚨 URGENT — NOTHING CAPTURES THE LIVE DRAFT RIGHT NOW, DRAFT IS 7 DAYS OUT (Cory research relay, 2026-08-15)

> **✅ SUPERSEDED later the same day — the capture path now EXISTS and was
> fired for real.** `.github/workflows/draft-night-sync.yml`: dispatch it when
> the draft opens (paste the Sleeper draft_id), it polls every 20s and commits
> each pick. Verified by two REAL runs in dry-run mode against a completed
> historical draft — the first run caught a genuine bash -e bug that had made
> its own retry logic dead code, fixed, re-verified. THE ONE REMAINING MANUAL
> STEP, unchanged and worth repeating: **someone must dispatch it when the
> draft opens on the 22nd** — deliberately not automatic (a snake draft's
> start time isn't predictable). The heading is kept verbatim per this file's
> no-delete rule; the body below is the state BEFORE the workflow existed.

**Checked because Cory asked to "hammer down predictions, snapshots, grades, and
closing the loop." The capture machinery for GRADING the draft after the fact is
fully built, tested, and rehearsed — and there is currently no plan, automated or
manual, to actually run it during the live draft.**

**What exists and is genuinely solid:**
- `draft/freeze_pre_draft.py` — freezes projections/replacement/ADP before the draft
  starts (already run: sha256 `17bd1e45f83a`, 686 players).
- `draft/log_draft_picks.py` — append-only JSONL pick log, joins every real pick to
  the frozen board by sha256, records the model's recommendation AT THE MOMENT each
  pick landed (not reconstructed later — Cory's own stated rule: "this repo has been
  wrong about that class of claim four times"). Has a `sync_live(draft_id)` mode
  built specifically to poll Sleeper's live draft picks and log them as they happen —
  "the draft-night entry point," per its own docstring.
- `draft/tests/test_pick_log_rehearsal.py` — rehearsed against a REAL 150-pick
  Sleeper draft (2025, from `league_history.json`, not a synthetic fixture), across 7
  conditions: normal sequence, duplicate event, out-of-order event, player
  unavailable, reconnect/repeat payload, keeper-adjusted clock, final-row behavior.
  This is genuinely thorough, real work — not a gap.

**What's missing: nothing calls `--sync` during the actual draft.** Checked directly:
`grep`'d every `.github/workflows/*.yml` and every root-level `.md` for
`log_draft_picks`, `sync_live`, or `--sync` — zero hits outside the tool itself and
its own tests. No scheduled workflow, no documented manual runbook step, nothing.
The nightly `draft-data.yml` cron (confirmed healthy and running today) does NOT call
this — it rebuilds the board, it doesn't watch a live draft. Without something
invoking `--sync <draft_id>` repeatedly during the ~150-pick live event on Aug 22,
every pick happens, the freeze/rehearsal machinery sits idle, and post-draft grading
has nothing to grade against — not because the tool is broken, but because nobody
runs it.

**Why this isn't something to just fix silently:** it interacts with the build-minute
budget question right below this entry, which is ALSO unresolved and ALSO flagged as
untouchable during draft week. A scheduled GitHub Actions poller during the draft
window is the obvious automated fix, but adding new recurring CI usage before that
budget number is re-verified is exactly the kind of thing that entry warns against.
A manual fallback (someone runs `python3 draft/log_draft_picks.py --sync <draft_id>`
in a loop, or repeatedly, during the draft) costs nothing and needs no budget —
that alone would close the gap without touching CI at all.

**Recommendation:** at minimum, write the one-line manual runbook step into whatever
doc gets read on draft day, so this doesn't get missed by omission. A scoped
automated poller (only active during a declared draft-day window, not year-round) is
a very small, very safe build once the budget question resolves — Cory's call on
timing, not mine to just ship given the open budget interaction.

## 🚨 URGENT, SUPERSEDES THE ORIGINAL VERSION OF THIS ENTRY — THE DEPLOY GATE WAS BACKWARDS, TWO REAL DEPLOYS ALREADY HAPPENED (Cory research relay, 2026-08-15)

> **✅ SETTLED later the same day, Cory's ruling ("find the happy medium") —
> no decision remains here.** The blanket-[skip deploy] freeze this entry
> instituted is RETIRED; `DEPLOY-POLICY.md` was rewritten from scratch and is
> the single authority (served-path changes deploy when they land on main,
> every deploy path verified — including the previously-unchecked nightly bot
> push, which now polls its own deploy in-run; Aug 20-22 the build reserve is
> untouchable). Kept verbatim below per the no-delete rule as the record of
> WHY the rewrite happened.

**The original version of this entry (below the line) said "no commit carries a
[deploy] marker, nothing was pushed to main, the budget hasn't moved." That was
wrong, and not from lack of pushing — from a wrong model of the gate.**

`DEPLOY-POLICY.md` describes an OPT-IN gate: default skip, a build only happens
if the tip commit carries `[deploy]`. That description is **stale and backwards**.
The actually-enforced `netlify-ignore.sh` flipped to **OPT-OUT on 2026-08-09**: a
build happens BY DEFAULT the moment a served path changes (`public/`, `views/`,
`src/`, `server-app.js`, `package.json`, `netlify.toml`, `netlify/functions/`) —
`[skip deploy]` / `[skip netlify]` on the tip commit is now the ONLY way to
suppress one. This whole research-relay session operated on the wrong model all
day, because the doc it trusted was one day older than the policy it described.

**Confirmed, not inferred — pulled the real `deploy-verify.yml` job log:**
```
last built commit (from the live build-stamp): b6ea669e77a9
[deploy-gate] range touches 1 served file(s) — BUILDING (opt-out: served changes auto-deploy)
OK — live site build-stamp is ccd48a66d4e2 (branch main, built 2026-08-15T05:02:07Z)
```
**Two real, unintended Netlify deploys already happened today** — one from an
earlier served-file commit (`b6ea669e`, the doctrine-governance pill fix), one from
this session's own `consensus.js` change (`f235ad0d`, batched into the build that
landed as `ccd48a66`). Nobody intended either one.

**Cory's ruling, same day, on being told: "Let's say last deploy part. No reason to
deploy til everything is done. I will tell you when to deploy."**

**STANDING RULE FROM HERE FORWARD, until Cory says otherwise:** every commit this
session pushes — served file or not, no exceptions, no judgment calls about whether
a given file "counts" — carries `[skip deploy]` in its message. That's the whole
mechanism (`netlify-ignore.sh` reads the TIP commit's message and skips outright if
present, before even computing what changed), so it's simple to hold to and cheap to
verify: `git log -1 --format=%s` should show the tag on everything from here on.

`DEPLOY-POLICY.md` has its own correction note now (2026-08-15) pointing at the real
gate. This entry is the decision record; that one is the fix to the doc itself.

**RECOMMENDATION, in order:**
1. Standing: no deploy fires again until Cory explicitly says go — enforced via
   `[skip deploy]` on every commit, not by hoping nobody touches a served path.
2. The actual build-minute usage is still unverified from this sandbox (I have no
   dashboard access) — worth a real check before the eventual real deploy, given two
   unplanned ones already landed today. Original ask (below) still stands.
3. A: when back, `DEPLOY-POLICY.md`'s "How to deploy" section needs a real rewrite,
   not just the correction banner — this entry and that banner are a stopgap.

---

### ORIGINAL VERSION OF THIS ENTRY (superseded above, kept verbatim per this file's own no-delete rule)

**Read this before doing anything that could trigger a build.** `DEPLOY-POLICY.md` is
dated 2026-08-08 and its numbers (75 min / 25% remaining, ~8.5 builds/day through
Aug 19, **draft-week reserve Aug 20-22 marked UNTOUCHABLE**) are now a full week
stale as of this entry. Nobody has been able to re-check the actual current Netlify
usage since — I do not have dashboard access and cannot verify it from this sandbox.

**Why it matters more than usual right now:** the draft is Aug 22, seven days out,
and the policy's own stated failure mode is explicit — *"Running out suspends the
site until Sept 1, which would take the war room down on draft day."* The reserve
window (Aug 20-22) is now less than a week away.

**What I confirmed is SAFE, so this is not currently an active emergency:** every
change I made this week is on `claude/fantasy-football-research-926y6z`, not `main`;
no commit carries a `[deploy]` marker; nothing was merged or pushed to `main`. No
session was running to trigger a build while Cory was locked out, so the budget has
not moved from whatever it was Friday — but nobody has looked at the real number
since then either.

**⚠️ THIS PARAGRAPH WAS WRONG — see the correction above.** It described the gate
backwards and, unrelatedly, the "nothing pushed to main" claim stopped being true
almost immediately after it was written, as this whole session's `git push origin
...:main` history shows.

**RECOMMENDATION, in order:**
1. Cory: check the actual current Netlify build-minute usage directly (I cannot) —
   this takes under a minute and resolves the only real unknown here.
2. A, first thing Monday, before touching anything else: re-run whatever produced
   the Aug 8 table (or check the Netlify dashboard directly) and update this entry
   with the real current number before deciding to deploy anything, including any
   of the work below.
3. Until that's confirmed, default to **not deploying** — everything built this week
   is staged on the research branch specifically so it can wait for that check
   without costing anything.

## THE 50/50 TIE-BREAK LEAN — one measured feature, one prepared diff (A, 2026-08-16) 🔴 OPEN

- **WHAT WAS FOUND** (preregistered study, `draft/audit/edge_hunt_2026-08-16.md`
  §1 prereg / §3 results; artifact `draft/data/fifty_fifty_study.json`; Cory's
  mandate verbatim: *"Is it in the actual roster construction? Is it in the
  50/50 picks? Find it, beat it, prove it, implement it."*). Across 259
  historical near-tie picks (2023-25; 30 replay toss-ups + 229 the room's own
  drafts revealed), **eight of nine pick-time-knowable features predicted the
  winner of a 50/50 NOT AT ALL** — age (n=133, 48.9%), experience (n=101),
  prior games missed (n=142), TD-share (n=195), team change (n=59), prior ppg
  (n=195), weekly boom/bust cv (n=184), depth-chart proxy (n=79). **One
  feature cleared the preregistered bar: last season's late-window trajectory
  — in 176 toss-ups the hotter-finishing player won 58.0% (Wilson CI
  50.6-65.0%).** Same direction in both pair sources and every band; it is
  also the exact mechanism the draft replay measured from the other side
  (walk-forward boards under-rank ascending players — where Cory's own reads
  beat the model three years running).
- **THE HONESTY LINE, both halves printed:** it clears the preregistered
  per-feature rule (CI excludes .50, n ≥ 30) and it does NOT clear
  multiplicity (nine features tested; two-sided p = .035, Bonferroni ×9 =
  .31). The weeks-won secondary outcome sits at exactly .500. This is a
  LEAN, not a law, and the prepared fact's own printed text says so.
- **WHAT IT IMPLIES.** The war room's toss-up facts (market/byes/age/depth)
  print nothing that measurably decides a 50/50; the one thing that measured
  anything is not printed. The bigger half of the finding needs no ruling at
  all: **50/50s are true coin flips on this league's record — stop sweating
  them at the table.**
- **MAGNITUDE.** A 58/42 lean applied to the ~2-4 genuine toss-ups a draft
  produces — order of one better pick every couple of drafts. Small, priced
  honestly, and free (the facts panel already exists).
- **CONFIDENCE.** Preregistered, n stated everywhere, CI-clear once, fails
  Bonferroni; both pair sources agree in direction. Medium-low.
- **COST OF INACTION.** Zero measurable points; the panel keeps printing
  unmeasured facts first.
- **RECOMMENDATION.** Apply the prepared diff (§3.1 of the audit doc:
  trajectory fact FIRST in `tiebreakFacts` + the one `late_trajectory` board
  field) with its measured-strength wording, OR explicitly decline and keep
  the null as the standing answer. Either ruling closes this. **Nothing is
  applied until you say so.** — The companion variance-portfolio study
  (same audit doc, §2/§4) came back NULL under its own prereg rule
  (variance-tilting buys ~$5/season of weekly-high money, real but not
  batch-stable; anti-tilt loses $7 CI-clear) — **no diff prepared there, no
  ruling needed; recorded for the trail.**

## 000. THE TWO PROJECTION SOURCES DISAGREE BY POSITION, SYSTEMATICALLY (2026-08-12) 🔴 OPEN

- **WHAT WAS FOUND.** Median per-player ratio of `proj_fantasypros` to
  `proj_sleeper`, by position: **QB 1.019 · RB 1.002 · WR 0.807 · TE 0.784.**
  QB and RB agree within 2%. WR and TE are off by ~20% across every player.
- **WHAT IT IMPLIES.** That is not two opinions about players; it is two different
  assumptions. Our consensus averages them, which moves WR/TE value roughly 10%
  down relative to Sleeper alone and **changes cross-position ordering on the live
  board**, ten days before the draft.
- **WHAT IT IS NOT.** Not a dropped receptions column — `_FP_STAT_MAP` maps `rec`,
  and RBs catch ~50 balls a year while showing no gap at all. Beyond that it is
  undiagnosed.
- **MAGNITUDE.** Unknown until diagnosed. Bounded by the fact that the anchor
  decision (#1) already put FantasyPros in the primary seat for ADP, so a scale
  error here would compound with it.
- **COST OF INACTION.** If FP's WR/TE numbers are on a different footing than
  Sleeper's, the consensus is averaging apples and oranges on two of four skill
  positions, and every WR/TE VORP on the draft board carries it.
- **RECOMMENDATION.** Diagnose before the draft — it is a couple of hours against a
  provider row — but **do not "correct" it by rescaling.** If the two sources
  genuinely disagree about WR/TE volume, averaging them is the right thing and the
  finding is only that we should know. Surfaced by
  `draft/audit/high_contrast_candidates_2026-08-12.md` §D.
- **RE-CHECKED 2026-08-15 (Cory research relay), NOT ADVANCED — network-blocked, not
  stale.** Reproduced live on `public/draft_data.json` today: QB 1.001, RB 1.014,
  WR 0.824, TE 0.81 — same shape, still live, 419 players with both sources. Tried
  to go further than the original diagnosis and could not: this needs FantasyPros'
  *component* stat-line projections (yardage/TD/reception assumptions), not just
  their final point total, and `fantasypros_adp.py`'s fetch is `# pragma: no cover
  (egress, CI only)` — blocked from this sandbox exactly like every non-GitHub host.
  **Ready-to-run for whoever has network access:** pull `fetch_projections()` /
  `fetch()` output for ~10 WR and ~10 TE alongside their `proj_sleeper` component
  stats, diff yardage/TD/reception assumptions per player the way the original rule-12
  audit diffed the DEF row by hand. If FP's WR/TE *receptions* are markedly lower
  than Sleeper's at the same yardage, that is a PPR-format assumption baked into FP's
  raw numbers before it ever reaches our scoring table — the same class of confound
  the anchor decision (#1) already found and resolved for ADP (MFL's full-PPR tilt).
  That is the first thing I would check, not a certainty.
- **✅ FIXED WITH EVIDENCE 2026-08-16 — Cory's ruling, verbatim: "Don't agree
  with timelines we fix now" (overriding this entry's own diagnose-don't-rescale
  caution AND the network block).** The blocked diff was run for real: a CI
  probe (`draft/proj_correctness_probe.py`, dispatched where egress works)
  committed FP's raw 2026 payload alongside Sleeper's component rows
  (`draft/audit/proj_correctness_evidence_2026-08-16.json`). **The mechanism is
  neither of the entry's candidate stories:** FP serves receptions under the
  field name `rec_rec` (all 437 receiving rows; `rec`/`receptions` appear
  nowhere), `_FP_STAT_MAP` maps only `rec`/`receptions`, so every
  `proj_fantasypros` was scored with receptions DROPPED. WR/TE lost ~19-25% of
  their total (the measured 0.824/0.810); QBs had nothing to lose (1.001); and
  the RB control that stalled this diagnosis was two effects cancelling — RBs
  lost their reception points too, masked by FP's genuinely higher rushing
  volumes (post-fix RB ratio 1.138). Proof the recovery is exact: mapped stats
  + 0.5×rec_rec reproduces FP's OWN `points_half` with median error 0.00 (IQR
  ±0.01) across 249 board WR/TE — receptions were the whole gap, and the fix is
  FP's exact number recovered, NOT a rescale (a position factor would have
  erased FP's real, independent reception opinions — e.g. Chase 121 vs
  Sleeper's 109). Fix live in `draft/adp.py recover_fp_dropped_stats()`
  (deliberately not a backtest-module edit — the FP ARCHIVE endpoints
  exp_fp_hist_proj graded DO serve `rec`, which is why the historical grades
  showed near-zero WR/TE bias while the live column was broken); board column
  recovered on 309 players via
  `draft/tools/apply_projection_correctness_2026_08_16.py` (double-preflighted:
  refuses unless the evidence reproduces the committed board AND the offline
  downstream re-run reproduces the build); 13 pins in
  `draft/tests/test_projection_correctness.py`; baseline v18 frozen under the
  ruling. New live ratios QB 1.001 · RB 1.138 · WR 1.039 · TE 1.059 — genuine
  source disagreement on compatible units, averaged per this entry's own
  standing rule, no further correction applied. **Caveat that outlives the
  fix:** `proj_series.json`'s FP snapshots dated 2026-08-09..08-15 carry the
  defect and are frozen/append-only — the January 2027 grade must use FP rows
  from 08-16 onward or account for it. Full chain + top-30 consensus movement
  table: `draft/audit/projection_correctness_2026-08-16.md`.

## 0. DEF PROJECTIONS ARE 12 POINTS SHORT — `def_fum_td` maps to nothing (2026-08-11) 🔴 OPEN

- **WHAT WAS FOUND.** Sleeper's projection row for the Rams DEF carries
  `def_fum_td: 2.0`. The league scoring table has no such key — it has `def_td: 6.0`
  and `fum_rec_td: 6.0`, and neither appears in any sampled row. `score_stat_line`
  iterates the SCORING keys and skips any the stat line does not carry, so two
  projected defensive fumble-return touchdowns score **zero**.
- **WHAT IT IMPLIES.** Every defense's `proj_baseline` is short by 6 points per
  projected defensive TD. Rams: `proj_baseline` 114.00 → 126.00, `vorp` 15.00 →
  27.00 before the replacement level moves. Because DEF replacement is the 10th-best
  DEF, correcting all 32 moves the replacement line too, so every DEF `vorp` changes.
- **MAGNITUDE.** 12 points on the one defense measured. Unmeasured across the other
  31 — deliberately, per rule 12's scope rule (document value eleven, do not sweep).
- **CONFIDENCE.** High on the mechanism: verified by hand from the raw provider row
  against the league's own scoring table, and it is structurally identical to the
  `pass_int` defect C found (provider renames a stat, scorer skips a key it cannot
  find, loss is silent because skipping IS correct for an optional bonus).
- **THE FIX CARRIES C's TRAP.** Our table has BOTH `def_td` and `fum_rec_td` at 6.0.
  Mapping `def_fum_td` to both scores 12 per touchdown — a silent undercount becomes
  a silent overcount, which is worse. And if the provider emits `def_int_td` for
  other teams, that is a genuine COMPONENT that must accumulate while the fumble
  alias must not. Aliases take first-writer-wins; components sum.
- **COST OF INACTION.** DEF is systematically underrated on the board. Low direct
  cost — Cory takes a DEF in round 14-15 where a 12-point projection error rarely
  changes which one — but it compounds with the separate finding that K and DEF are
  SINGLE-SOURCE (Sleeper only, no FantasyPros second opinion), so the DEF column is
  a one-source number with a known undercount.
- **RECOMMENDATION: fix it AFTER the draft, not before.** It moves every DEF `vorp`
  and the DEF replacement level eleven days out, on a position that is picked last
  and where the ordering is unlikely to change. The evidence and the trap are
  written down; the change is one alias plus a components-vs-aliases test.
- **RE-CHECKED 2026-08-15 (Cory research relay) — CORRECTED SAME DAY, `def_kr_td` is
  not actually a gap.** First pass here claimed `def_kr_td: 1.0` on the raw row was a
  second missing stat key alongside `def_fum_td`. Checked `draft/config/league_config.json`
  directly afterward: `def_kr_td` and `def_pr_td` ARE in the scoring table, both
  explicitly set to `0.0` — this league deliberately does not reward kick/punt-return
  TDs, not an omission. `score_stat_line` scores it correctly at zero on purpose.
  **Only `def_fum_td` is genuinely missing** (confirmed absent from the scoring table
  entirely, not zero-valued) — the original 2026-08-11 finding stands as originally
  scoped, my "bigger than documented" claim was wrong. Also worth noting for whoever
  picks this up: `int:
  15.0` and `sack: 52.0` are season-total counting stats sitting in what looks like a
  single-week-shaped row (`gp: 1.0`) — worth confirming these are being treated as
  season totals, not per-game, wherever `proj_baseline` consumes them.
  **I cannot go further than this.** All 32 DEFs are on the live board but I only
  have `proj_baseline` (already-scored output) for the other 31 — not their raw
  stat lines, which is the one thing needed to know whether `def_kr_td` is common
  or a one-off, and whether a `def_int_td`-style key exists anywhere. That needs a
  live Sleeper fetch (403 from this sandbox, same as FantasyPros above).
  **Ready-to-run once someone has that access:** pull raw projection rows for all 32
  DEFs, collect every key starting with `def_` or `st_`/`blk_` across all of them
  (not just one), and build the alias/component table from the FULL set in one pass
  — rather than patching `def_fum_td` alone and re-discovering `def_kr_td` (and
  whatever else is in the other 31) as a second silent gap next month. The
  components-vs-aliases distinction from the original write-up still holds: sum
  real components, first-writer-wins on aliases, never both.
- Full arithmetic: `draft/audit/rule12_statline_check_2026-08-11.md`.
- **✅ FIXED WITH EVIDENCE 2026-08-16 — Cory's ruling, verbatim: "Don't agree
  with timelines we fix now" (overriding this entry's own fix-it-AFTER-the-draft
  recommendation).** The re-check's ready-to-run plan was executed exactly: a CI
  probe fetched the raw projection rows for ALL 32 defenses and the full key
  census (`draft/audit/proj_correctness_evidence_2026-08-16.json`), the capture
  proven to be the build's own input record (all 32 rescore to the committed
  board to the cent) before anything moved. **The census settles the trap this
  entry recorded:** the aggregates `def_td` / `def_st_td` / `fum_rec_td` appear
  in ZERO of the 32 projection rows — only components do (`def_fum_td` 1 row,
  `pass_int_td` 4 — the predicted "def_int_td-style key", found under a
  different spelling — `def_kr_td` 4, `pr_td` 5) — so mapping components into
  the aggregates cannot double-count any row Sleeper serves, and the
  aggregate-wins/components-sum discipline is pinned by test for the payload
  that could. Also corrected from the 2026-08-15 re-check: `def_kr_td: 0.0` in
  the league table is duplicate-suppression, not "this league does not reward
  return TDs" — the league prices the AGGREGATE `def_st_td` at 6.0, so a
  projected DST return TD is worth 6 and was also silently zero. Fix live in
  `draft/scoring.py normalize_def_stat_line()` (+`DEF_PROJ_TD_ALIASES`) applied
  by `projections.baseline_from_projections` to DST rows only (individual
  returners carry the same keys and correctly stay at the league's st_td 0.0 —
  measured, pinned). Board regenerated through the real generators
  (`draft/tools/apply_projection_correctness_2026_08_16.py`, double-
  preflighted): 11 defenses corrected +6..+18 (Rams 114 → **132** — the
  original −12 plus a kick-return TD the one-row sample couldn't see), DEF
  replacement 99.0 → 103.0, every DEF vorp moved, DEF order genuinely changed
  (NE/MIN/JAX into the top six; PHI/DEN/BAL out). Rams recomputed by hand +
  all-32 no-double-count sweep vs Sleeper's own implied totals:
  `draft/tests/test_projection_correctness.py` (13 pins). Baseline v18 frozen
  under the ruling. Full chain: `draft/audit/projection_correctness_2026-08-16.md`.
  **Left on the record, not fixed here:** K/DEF remain single-source on the
  board, but the same capture shows FantasyPros DOES serve full DEF projections
  (def_td/def_sack/def_int/def_pa_* on 32 rows) — a second DEF opinion is now
  demonstrably obtainable, unruled, unbuilt.

## 2. REGRESSION / SHRINKAGE WEIGHT: over-regresses — ACCURACY+OVERFITTING GATE CLEARED, $ pending (2026-08-10)
- **✅ CV UPDATE (exp_regression_cv):** the gate exp35 set ("leave-one-season-out CV")
  is PASSED. Holding out each season and picking the weight by top-decile on the other
  two selected a LOW weight every fold (**0.1, 0.1, 0.0**) and it **beat-or-tied the
  shipped 0.35 out-of-sample on all three** (margins +0.065, +0.13, +0.0 — never loses).
  Most robust single value = **0.1** (mean held-out top-decile 0.536 vs 0.35's ~0.41;
  rank-corr 0.62 vs 0.60; 0.0 edges it on worst-case + rho). So the pooled monotonic-to-0
  curve is NOT an in-sample artifact — lowering the weight generalises. **RECOMMEND
  0.35 → 0.1** (or 0.0). REMAINING GATE: the dollar arm (roster grader, egress) to size
  it at Cory's picks before the numeric install — accuracy is cleared, $ is not. 4/4 tests.
- **Found:** exp33 — the blend over-regresses and loses to a naive baseline at
  identifying ELITE players. exp35 regression sweep — top-decile accuracy peaks BELOW
  the shipped 0.35, **peak at 0.0**; report says verbatim "over-regression is a real
  lever — but installing a new value is a separate gated SHIP decision, not done here."
- **Implies:** lower the projection blend's regression-toward-prior weight (0.35 → lower)
  for elite identification; connects to the rookie/2nd-year under-ranking (young players
  have thin priors to regress from — same mechanism).
- **Magnitude:** not yet in dollars — measured in top-decile rank accuracy; needs the
  sweep's dollar arm to size it at the picks.
- **Confidence:** the sweep is on real data but the optimum-at-0.0 needs a held-out /
  dollar check before install (a naive 0.0 may overfit noise elsewhere on the board).
- **Cost of inaction:** the board keeps under-ranking high-upside young players (Nabers
  was the trigger case) — matters for a closer keeper/draft call than this year's.
- **Recommendation:** run the sweep's dollar arm + held-out, then bring a specific
  proposed weight here. NOT ready to install blind. (queued behind slate rails + cron)
- **ATTEMPTED 2026-08-15 (Cory research relay), BLOCKED — same wall as #0/#000 above.**
  Confirmed the pure sweep math (`draft/tests/test_exp35.py`, 4/4 pass, no network) and
  confirmed `nfl_data_py` (nflverse realized points) works fine from this sandbox — ran
  it live, 5,653 rows for 2023. Ran `exp35_regression_sweep.py`'s real egress path
  directly: it fails at `sleeper_import.fetch_players()` — `Tunnel connection failed:
  403`. That's the ONE blocked call; `history`/`payouts` are already local files and
  everything else in the pipeline (`nfl.import_weekly_data`, `nfl.import_ids`) is
  nflverse and works. Checked for a local substitute for the players dict before giving
  up: `draft/fixtures/players.json` is synthetic test data (fake names, 233 rows) — using
  it would map fabricated identities onto real historical picks. `public/draft_data.json`'s
  686 real players is real but current-year-only — feeding 2023-2025 rosters through it
  would silently drop retired/off-board players and bias the dollar figure in an unknown
  direction, for a number whose whole job is gating whether this weight changes on the
  live board. Declined to produce a number either way rather than guess.
  **Ready-to-run once someone has Sleeper access:** `python
  draft/backtest/exp35_regression_sweep.py --out draft/backtest` — that's the whole
  command, nothing else needs building. Should complete in one shot given every other
  dependency is already confirmed working.

## 3. SIMPLIFY AUTO: mask + value is the WHOLE measured edge — the 6 adjusters don't earn — OPEN
- **Found (exp_participation, 400 paired rooms — the all-terms test):** built each adjuster UP
  from the defensible core (mask + value anchor). **Core = $704; core + every adjuster at
  engine default = $407** — the adjuster panel, at fair-fight strength, *loses ~$300*. On the
  clean core NOTHING earns a place: **need-weight +6.5 [−8,+20]** (decoration — confirms
  exp_need_phase; it's the always-on MASK that earns, not the additive weight), **ceiling −4.8
  [−26,+17] with no clean weekly-high gain** (my pre-registered "shape pays" guess did NOT
  survive de-confounding — the apparent weekly-high win was a confound of the ablation-from-full
  frame), **bye ~0**, and **tier −235 / risk −143 actively HURT** (they pull picks off the value
  anchor toward a mechanism no payout rewards). **stack reads −63 but that is an INSTRUMENT
  ARTIFACT** — grade_room draws weekly scores independently (no within-team correlation), so
  this harness can't reward a stack; exp6/stack_sweep (rho=0.35) is the sound instrument and
  found stack a **WINNER (+$196 @ dose 0.5)** — kept ON. Value anchor removal costs a BOARD-DEPENDENT figure that has moved $362 -> $288 -> $267
  across three Lab runs; see EDGE-LEDGER (the one place it is written out) rather than
  quoting a number here. It
  and the mask are the earners.
- **Implies:** Auto collapses to **mask + value anchor + a STACK tilt (~0.5)**; drop tier/risk
  (measured drag) and need-weight/ceiling/bye (decoration). The slider panel should say which
  controls do anything rather than presenting eight equals.
- **Magnitude:** the harmful dollar figures are an **upper bound at a uniform ~30-pt nudge**
  (see caveat) — the ROBUST claim is the SIGN/ordering: no adjuster earns; at any strength big
  enough to move a pick, tier/risk lose (stack is instrument-limited here — see below). The win is a large **robustness/legibility**
  gain plus removing a measured drag.
- **Regional check (exp_participation_regional, 400 rooms — disaggregate before discard):** split
  each term by Cory's pick bands (early r4-6 / mid r7-10 / late r11-15). No term earns in ANY band,
  so the pooled "drop them" STANDS — but it sharpened the picture: tier hurts early −147 AND mid −68,
  risk hurts early −97, bye hurts early −13, all neutral late; ceiling flat everywhere. The harm
  concentrates in the EARLY rounds (4-6, Cory's most valuable picks) where the value anchor is
  strongest — i.e. the terms distort a good ranking exactly where ranking matters most, and go inert
  once the board flattens. (An n=20 pass falsely showed "risk earns mid +44"; n=400 killed it — a
  reminder that regional cells must be read at full power.)
- **Confidence — split by faithfulness:** **need-weight (drop/flatten): STRONG & FAITHFUL** —
  need_signal is the exact harness term, and exp_need_phase agrees. **tier/risk/ceiling/bye:
  DIRECTIONAL via PROXY** — computed from the same board fields the engine uses but not the
  engine's exact functions, so a proxy null bounds the *mechanism*, it doesn't by itself convict
  the *live term*. **stack: NOT JUDGED HERE** — grade_room has no within-team correlation, so
  the harness can't reward it; stack_sweep (+$196) is authoritative. The proper instrument to
  convict tier/risk is a faithful JS-engine ablation (queued, not built).
- **Cost of inaction:** Auto drives six hand-built terms on draft day, at least two of which
  (tier, risk) measurably drag against the value anchor; the panel teaches distrust by
  presenting inert/harmful controls as equal to the two that matter.
- **Recommendation (GATED — the live pick screen, 13 days out):**
  1. **DO NOW (robust+faithful):** flatten Auto's need-weight ramp to a flat ~0.5 (or drop the
     additive need term; mask stays). Zero risk to the measured edge.
  2. **DRAFT-DAY PRESET (recommended):** run Auto as **mask + value(1.0)**, with tier/risk/bye
     at **0** and **stack ~0.5** (exp6 winner). This is the "flat preset" Cory floated.
     **REVISED 2026-08-09 by the interior look (Cory's flat-vs-structured question) — two numbers
     move off Cory's approved "need & ceiling at zero":**
     - **need-weight: 0 or 0.5 barely matters — it's NEAR-INERT (redundant with the mask).**
       Participation-rate probe (exp_participation_rate): need-weight flips only **5% of picks at
       w=0.5, 8% even at w=3.0** — because within the startable-cap MASK the need signal is nearly
       uniform, so the additive weight rarely changes the argmax. The +$16 peak at w=0.5 is real
       but comes from that ~5% slice. So the mask IS the need mechanism; the weight is a marginal
       tweak. Cory's approved 0 is fine; 0.5 captures a thin +$16 — his call, low-stakes either way.
     - **ceiling: do NOT zero — it GENUINELY participates and has a real positive region.** Probe:
       ceiling flips **49% of picks at default, 58% at w=1.0** (giving up ~14 VORP/flip to chase
       upside) — so its flatness at DEFAULT is a REAL null (moves half the picks, nets ~0), NOT a
       scale artifact. The single-seed curve showed +$23-26 at w≈1.0-1.5, but **REPLICATION across
       3 fresh seeds (exp_ceiling_replicate, 2026-08-09): w=1.0 = +6/+7/+18 (mean +$10, positive
       every seed but separable in 0/3)** — the +$23 was the high end of a thin effect (winner's
       curse on the peak). VERDICT: **draft at 0.65 (settled, unchanged); w=1.0 stays an OPEN
       question — it leans positive so do NOT zero it, but not enough to raise it.** Ceiling is the
       live lead for the public-league scale-up (37.5% of the pot pays weekly-high — the mechanism).
     - tier/risk stay 0 (negative or fading everywhere sampled; risk-late is a dead zone, not a
       positive). **Cory's call to confirm the two revised numbers before wiring.**
  3. **BEFORE ripping the live terms out of engine.js:** build the faithful JS-engine ablation
     to convict tier/risk on the real functions (proxy caveat); stack's mechanism (within-team correlation) needs a correlation-aware grader, which stack_sweep already is. Until then, the *preset*
     (weights→0) achieves the same draft-day effect without deleting code.
  - The autoWeights edit is staged and ready to bundle; **Cory's call on scope before Aug 22.**

- **✅ SUBSTANTIALLY RESOLVED, found 2026-08-15 (Cory research relay) — was mis-surfaced as still
  open.** Checked the live `MEASURED_WEIGHTS` and its own provenance comment in `engine.js`
  (line ~411) before touching anything, on the near-miss below. Every term this entry asks about
  already matches a LATER, more specific decision than this entry itself:
  - **Stack** stays at 1.0, not the "~0.5" this entry suggests — you personally resolved this
    exact conflict on 2026-08-13 (D10 correction): the code was right, an earlier record was
    wrong, and 1.0 is what was always meant to ship.
  - **Ceiling** stays at 0, not the "0.65" this entry recommends — you ruled it to 0 on
    **2026-08-10**, a day AFTER this entry's revision, specifically rejecting 0.65 (a "flip
    diagnostic" showed it deciding a third of the late board on a term with "no defensible
    sign"). A 2026-08-14 follow-up found the underlying measurement this entry cites was itself
    flawed (collinear with the value term, not real evidence either way) and explicitly kept
    ceiling at 0 rather than move it on broken evidence — "UNCHANGED AND THAT IS DELIBERATE" in
    the code's own words.
  - value/need/tier/risk/bye/keeper already match what this entry recommends.
  - **I almost implemented the 0.65 change before finding this** — caught only because the
    code's own provenance comment carries the full decision history and I read it before editing
    rather than after. Two rulings I'd have silently reverted if I hadn't.
  - **What's actually still open, narrowly:** item 3 above — building the faithful JS-engine
    ablation before deleting the tier/risk code paths outright (they currently ship at weight 0,
    which is not the same as removed). Low urgency, not a live-board question.

## 7. THE SUNDAY ALERT FIRES BEFORE THE OFFICIAL INACTIVES (B, 2026-08-11)
- **Trigger (Cory):** does the alert reach me when I'm not looking at the site, and does it
  fire when it should not? The second half is fixed (it now sends only when there is something
  to do, once per week). This is what the first half turned up that I can't decide for you.
- **The facts.** The cron is `40 14 * * 0` — 14:40 UTC. That is **10:40am ET** while the clocks
  are forward (Sept–early Nov) and **9:40am ET** after they go back. The NFL announces official
  inactives **90 minutes before kickoff**, i.e. **11:30am ET** for the 1pm slate. So the alert
  fires 50–110 minutes before the list that turns a QUESTIONABLE into an OUT.
- **What that costs.** The "⛔ a starter cannot score this week" case now added to the alert
  catches byes and players already ruled OUT on the Wed–Fri practice reports — most of the
  value, and known by Saturday. It will systematically **miss game-time decisions**, which are
  exactly the players whose status is still in question on a Sunday morning.
- **Why I'm not just moving it.** One UTC cron cannot hold one ET time across the DST change,
  and pushing it later trades warning time for accuracy — 11:45am ET leaves you 75 minutes,
  which is fine if you're near your phone and useless if you're driving to a game.
- **The options, cheapest first:**
  1. **Leave it.** Accept that game-time decisions are yours to catch. Zero work.
  2. **Move to `45 15 * * 0`** — 11:45am ET in the fall, 10:45am ET after the clocks change.
     Catches most inactives during the stretch that matters, one line of YAML.
  3. **Two runs** — keep the 10:40 planning alert, add a ~11:35am ET run that sends ONLY if a
     starter's status changed since the first. More useful, more moving parts, and it needs the
     first run's state stamped (the once-per-week stamp already written would need a second key).
- **My recommendation: (2).** The alert's job is the lineup, and a lineup set at 11:45 is still
  a lineup set. (3) is the right shape eventually but not before there is a season to test it on.
- **✅ ALREADY SHIPPED, found 2026-08-15 (Cory research relay) — was mis-surfaced as still open.**
  `.github/workflows/sunday-alert.yml` already runs option 2 (`45 15 * * 0`), with a detailed
  dated comment and a dedicated regression test (`draft/tests/sunday_cron.test.js`) pinning the
  schedule against the same reasoning above, including the DST honest-limitation note. Cory
  re-confirmed option 2 today without knowing it already shipped — nothing to build. **Third
  time this file has had a resolved item read as open from its status label alone** (after F4 and
  now this) — the OPEN section's reorg fixed structure but did not re-verify each item against
  current code. The remaining OPEN items have not been re-checked against code either; treat them
  as unverified until someone does, not as confirmed-open.

## PROPOSED CLAUSE (A, 2026-08-11) — self-referential fixtures, needs your authorization

**Not added to SESSION-A.md.** Constitution changes require explicit
authorization, so this is a proposal, not a rewrite.

**The observation (Cory's words):** *a fixture that derives from the thing under
test can stop exercising its case without failing — same shape as a guard whose
baseline comes from what it's guarding.*

**Evidence, from today, two instances in one change.** C's `wk()` seeds a column
for every key in `grade._WEEKLY_MAP` — the right instinct, since a fixture
carrying only the columns a test cares about would pass a schema check on a shape
the live path never serves. But adding one alias to that map silently changed
what every fixture contained: a helper named `unmapped_rename` removed one
interception column and left the other, and the present-but-never-populated case
nulled one alias of two. Both kept passing. **A fixture cannot fail for no longer
representing its case; it quietly tests something easier.**

**Why it belongs next to the baseline clause rather than as a new rule.** It is
the same defect with the arrow reversed. A guard whose reference derives from the
code always agrees; a fixture whose input derives from the code always passes.
Both swap a fixed question for a self-referential one, and both hide inside a
derivation that is genuinely the better engineering choice.

**Proposed wording, for rule 10 as a further clause:**

> **10d.** A fixture or baseline that DERIVES from the thing under test can stop
> exercising its case without ever failing. Deriving is usually right — it is what
> keeps a fixture honest against a live shape — so the requirement is not to stop.
> It is that anything the test SUBTRACTS from a derived set must be derived from
> THE SAME SOURCE, and that a fixture whose meaning depends on the code's current
> shape carries an assertion that it still represents its case.

Applied to the two helpers already; they now derive their removals from
`_WEEKLY_MAP` instead of listing column names.

## 5. IN-SEASON MARKET SIGNALS + MOCK-DRAFT FORWARD EVIDENCE — sequenced 2026-08-09
Cory raised three in-season/forward inputs. Sequencing verdict (dollars × soonness),
recorded so the calls don't evaporate. My recommendations; Cory's to override.

**5a. Betting-market movement as a Sunday start-sit input — IN-SEASON, no window, test-before-build.**
- **The signal:** implied team total (spread+total) is the workhorse; game total = shootout/
  ceiling (matters doubly — 37.5% of the pot pays weekly-high); spread = game script; props
  where they exist; **line MOVEMENT** = info that arrived after projections were built.
- **Key correction to the ADP analogy:** betting movement is NOT an archival-window problem.
  Opening lines, closing lines, and outcomes are all public HISTORICAL data — testable today,
  no archiving needed. (Contrast ADP: no history, archive started 2026-08-09, predictive half
  blocked.) We DO NOT retain as-built weekly projection snapshots, so "moved since OUR Tuesday
  projection" is not reconstructable from our history — but the thread is validated without it.
- **LEVEL vs MOVEMENT:** level likely already in our projections (double-count risk, expensive
  to disentangle). Movement is cleaner, is the un-priced part, and self-gates (silent when
  nothing changed). Cory's instinct confirmed.
- **The ~$0 gate (do FIRST):** does line movement predict outcome-vs-OPENING? Pure external
  data, no dependence on our projection archive. Fails → thread dies cheap. Passes → THEN the
  harder "incremental over our projection" build earns it, and we start stamping projection
  build-time going forward.
- **Kalshi:** probe for game-level depth/volume, but expect thin player-prop coverage (a thin
  market is not a wise one); props likely need a sportsbook odds aggregator. Implied team total
  is derivable from Kalshi's spread+total if volume carries.
- **Recommendation:** QUEUE post-draft. Zero cost to waiting. Post-draft slack → run the
  movement-vs-outcome backtest; if it passes, build the movement signal into the Sunday alert,
  attached to a specific chase-vs-protect call (render nothing that doesn't change a decision).

**5b. Mock drafts as forward evidence — PRE-22nd WINDOW, in Session A's lane (survival + ledger).**
- **What they are:** real picks/boards/behaviour, run on demand. NOT a strategy-earning
  substitute for MFL (no season outcomes). Three uses, judged against the overfit objection:
  - **Use 2 — calibrate survival: STRONGEST, survives.** Survival = board-depletion rate at a
    position, not opponent psychology; mocks deplete too. "91% to last to my next pick" has
    NEVER been graded. Caveat to STAMP: mock autopickers deplete ADP-strict → curve may run
    slightly optimistic vs our noisier real room. "Never graded → graded" is strict progress.
  - **Use 3 — forward evidence: valid, same activity as Use 2.** Pre-pick prediction answered
    by reality, no re-running. The ONLY non-retrospective source we have. Window closes 22nd.
  - **Use 1 — opponent model vs strangers: run it, but a NULL is INCONCLUSIVE.** Mocks lack
    keepers/money/rivalries and half autopick/abandon → a non-firing run-detector can't be told
    apart from behaviorally-degenerate mocks. Pre-register that a mock null doesn't convict the
    mechanism. Downweight.
- **Clean interface:** I don't need the live war room driven through a mock. Give me the ordered
  PICK LOG; I replay it through the survival estimator at each of "my" picks and grade offline.
  B's open question (can mocks be driven/logged programmatically?) gates only how fast logs
  arrive, not whether I can consume them. Human-only is fine — Cory clicks, log still captures.
- **Recommendation:** BUILD the offline survival-calibration grader (Session A lane), sequenced
  AFTER the FP-anchor wiring, still pre-22nd. Live data collection gates on B's driving check.

**Sequence (unchanged draft work first):** (1) FP-anchor wiring [active] → (2) mock survival
grader [new, pre-22nd, windowed] → (3) betting movement-vs-outcome backtest [post-draft, no
window] → (4) betting LEVEL [lowest, only if movement proves out].

## 6. PROJECTION SOURCE — the board's projection quality is UNGRADED on clean data (2026-08-10)
- **Trigger (Cory):** is the Sleeper projection number clean, and have we graded FantasyPros
  projections? Answers: (1) NO — exp33's Sleeper grade (0.69 top-decile / 0.82 rank-corr) is
  LEAKED (in-season endpoint, safe=False, disqualified). (2) NO — we've only ever graded ADP,
  never projections from any source.
- **Implies:** we do not actually know the best projection source. The live board uses Sleeper
  PRESEASON projections (fine at draft time, no leak in live use) but that choice is unproven vs
  FantasyPros projections (free, we already parse FP) or a naive/low-regression prior (which BEAT
  our blend on clean data).
- **The catch:** a clean projection grade needs a PRESEASON-FROZEN snapshot — any source whose
  endpoint updates in-season can't be graded retroactively without leaking. So a clean grade of
  past seasons is not recoverable; the honest path is to snapshot 2026 preseason projections from
  Sleeper + FP NOW and grade after the season (same shape as the ADP archive; every un-snapshotted
  day before the season is unrecoverable).
- **Magnitude:** projections drive proj_mean/VORP/VONA/tiers — the entire value side. A better
  source would beat the ADP-anchor swap in impact. But UNKNOWN until graded clean.
- **Recommendation (pre-Aug 22, cheap):** (a) snapshot the 2026 preseason projections from Sleeper
  AND FantasyPros now (frozen, for a clean grade after the season); (b) compare the two on the 2026
  board — do they diverge at Cory's picks (34/41/54…)? If they largely agree, the source choice is
  cosmetic; if they diverge, flag it. (c) Do NOT swap the projection source blind — unlike the ADP
  anchor (which had a clean grade), there is NO clean projection grade to justify a swap yet.
- **✅ PART (a) DONE, found 2026-08-15 (Cory research relay).** `draft/data/proj_series.json`
  already carries daily frozen snapshots of BOTH `sleeper` and `fantasypros`, dated 2026-08-09
  through 2026-08-14 (six consecutive days) — exactly the recommendation, already running.
  Part (b) — whether they diverge at Cory's actual picks — is answered elsewhere: see
  `DECISIONS-NEEDED.md` entry #000 (this same file), which reconfirmed live TODAY that WR/TE
  diverge ~20%, QB/RB agree within 2%. Part (c) still holds — no swap, this is diagnosis only.
  **Not re-verified: whether the daily snapshot capture is still running today** (last dated row
  is 2026-08-14) — worth a 30-second check that it fired again since, not just that it once worked.

## 000000. STREAMABLE_LATE IS DEFINED, TESTED, AND NEVER READ (2026-08-15) 🔴 OPEN

- **WHAT WAS FOUND.** Cory raised a generic VBD critique (source unverified, network-blocked from
  checking it directly): QB/TE replacement level should be anchored to what's realistically
  streamable off the wire, not the "next starter." Checked against the live engine before agreeing
  or dismissing it: `formatDefaults()` in `engine.js` already computes exactly this —
  `STREAMABLE_LATE: teams <= 10 ? ['QB', 'TE', 'K', 'DEF'] : ['K', 'DEF']` — correctly, per-format.
  `engine.test.js` even asserts it computes right for both team-count cases.
- **WHAT IT IMPLIES.** Grepped every reference to `STREAMABLE_LATE` in the codebase. Outside its
  own definition and its own test, **nothing reads it.** It affects zero recommendations, zero
  weights, zero anything a player on the board sees. A real, reasoned, tested concept that was
  computed and then never connected to the thing it was computed for — same shape as `needrule.js`'s
  mask (measured, tested, real, and never called by `recommend()`) and the pre-restoration
  `ONESIE_MAX_SPARE` history earlier this file.
- **CONFIDENCE.** High and mechanical — a grep, not an inference.
- **COST OF INACTION.** Unknown/unmeasured. The two OTHER generic-critique ideas checked alongside
  this one (flex-eligible pricing, positional ceiling normalization) are both already live — this
  is the one gap of the three, and nobody has measured what wiring it in would be worth.
- **RECOMMENDATION.** Not scoped here — this is a "found it, didn't build it" entry, consistent
  with the rest of today's work. Whoever picks it up needs to decide WHERE it plugs in (most
  likely: as an input to the replacement-level calc for QB/TE specifically, or as a modifier
  inside `onesieState`) and whether it's worth measuring before wiring, given the project's own
  standing rule against installing anything unmeasured this close to the draft.

## 0000. THE TOOL DRAFTS 0.9 RUNNING BACKS IN EVERY ARM (2026-08-12) 🔴 OPEN — NOT FIXED, NOT DISAPPEARING

- **WHAT WAS FOUND.** The roster-construction run measured position mix across
  three weight vectors, same seeds. RB is essentially constant:

  | arm | QB | **RB** | WR | TE |
  |---|---|---|---|---|
  | MEASURED + bench floors (shipped) | 3.0 | **0.9** | 2.5 | 3.6 |
  | MEASURED, floors removed (pre-fix) | 4.7 | **0.9** | 2.3 | 2.1 |
  | DEFAULT_WEIGHTS | 3.7 | **0.8** | 3.2 | 2.3 |

  **Three different weight vectors, three different QB/TE shapes, the same 0.8–0.9
  running backs.** And after the onesie cap landed, the freed picks went to
  **WR (3 → 5), not RB** — RB stayed at 1.
- **WHAT IT IMPLIES.** This is a property of the RULE, not of a coefficient. No
  weight setting reachable from the panel changes it, and the onesie cap — which
  moved everything else — did not touch it.
- **THE RISK, and it is not a valuation error.** With Henry and Walker kept, the
  mask is doing its job: RB2 is filled, so RB depth reads as bench and the FLEX
  is genuinely position-agnostic. But twelve picks ending with Henry, Walker and
  one other means **a single injury puts a replacement-level back in a FLEX that
  could have held anyone**. Nothing in the system prices that. `riskAdjustment`
  scores a player's own injury probability; nothing scores the roster's
  concentration.
- **MAGNITUDE.** Unpriced. The arm table is the evidence that it is structural;
  what it costs in points or dollars has not been measured and I am not going to
  estimate it.
- **COST OF INACTION.** One injury away from a hole the draft cannot fix,
  every season, until something prices roster concentration.
- **RECOMMENDATION: do not fix this week.** It is not a defect with a one-hour
  patch — it needs a concentration/insurance term that does not exist, and
  inventing one nine days before a draft is how the bench branch got its anchor
  removed in the first place. Recorded here so it survives the fix that capped
  the visible half.
- Evidence: `draft/audit/roster_construction_2026-08-12.md`,
  `draft/tools/roster_construction.js`.
- **✅ RE-RUN 2026-08-15 (Cory research relay) — LARGELY RESOLVED, not a live problem
  today.** Ran the same tool, same seat, same MEASURED_WEIGHTS, 120 rooms (matching
  the original sample size exactly). The shape has reversed:

  | | QB | **RB** | WR | TE |
  |---|---|---|---|---|
  | 2026-08-12 (original finding) | 3.0 | **0.9** | 2.5 | 3.6 |
  | 2026-08-15 (re-run, weighted mean, 120 rooms) | ~1.7 | **~3.4** | ~3.4 | ~1.5 |

  Modal shape is now **QB2 RB3 WR3 TE2** (28.3% of rooms) — was QB3 RB1 WR3 TE3
  (45.8%). RB moved from the worst-drafted position to among the best-stocked;
  onesie spend (QB+TE) roughly halved.
  **CORRECTION, same day: my first pass at this attributed the improvement to
  the 2026-08-13 ceiling-units fix. That was too fast.** Checked `engine.js`
  directly afterward: `CFG.ONESIE_HARD_CAP` is `true` and `ONESIE_MAX_SPARE`
  (`{QB:1, TE:1}`) is live and actually gating `onesieState()` right now —
  `draft/tests/onesie_cap.test.js` confirms a 3rd QB/TE gets sunk below rank 12.
  The cap's own history is tangled: deleted 2026-08-14 ("delete them, do not fix
  them" — the units defect was real, see PARKED.md), then **restored** at some
  point after (undated in what I read, found via `git log` on `engine.js` — not
  traced to the exact commit). The test file's own comment says as much: it was
  rewritten to assert the exposure (defect present) right after the 2026-08-14
  deletion, then rewritten AGAIN back to asserting the cap works, "because the
  cap is restored." **So this healthy roster shape may be the restored hard cap
  doing its job, not the underlying units defect being fixed — I cannot tell
  which from a black-box roster-shape re-run, and I should not have guessed.**
  **The unpriced concentration risk this entry named (an injury away from a hole
  the roster can't fix) is smaller now that RB depth is real**, but not
  necessarily zero — worth a fresh look at whether 3-4 RBs still cluster on a
  small number of NFL teams, not re-measured here.
- **RECOMMENDATION, revised:** downgrade from "do not fix this week" — the
  underlying shape problem that motivated the original urgency appears to have
  already improved substantially. A full re-audit (the three-arm isolation, same
  rigor as the original) would confirm the mechanism rather than just the outcome,
  but this is no longer a live fire.
- **✅ FURTHER MOVE FOUND, THEN SELF-CORRECTED, SAME DAY 2026-08-15 (Cory research
  relay) — see PARKED.md #00000000 and its correction, #000000000.** First pass:
  `ONESIE_MAX_SPARE.TE: 1 -> 0` tested on a 60-room, 12-PICK simulator, looked
  clean. NOT APPLIED — Cory dismissed the go/no-go prompt before choosing, which
  is what caught this before it shipped: the 12-pick simulator structurally
  cannot see round 13-15 behavior, where real duplicate QB/TE picks concentrate.
  Checked against 3 real completed drafts in THIS league instead
  (`league_history.json`, 30 team-seasons): **QB2 is the modal real outcome
  (57%), TE2 happens 47% of the time** — cutting the spare allowance to 0 would
  have fought what this league's own drafters actually do most seasons. BUT the
  TIMING matches the code's existing endgame-relaxation logic almost exactly:
  zero of 30 real duplicate QB/TE picks in three years happened with more than 5
  picks left on that team's clock. Revised recommendation: widen
  `CFG.ONESIE_ENDGAME_PICKS` from 2 to ~4-5 instead of touching
  `ONESIE_MAX_SPARE` at all — covers 89-94% (QB) / 83-100% (TE) of real
  historical duplicate picks instead of ~44-50%, while leaving the early/mid
  cap (which the same data supports) untouched. Not applied — same gate.

## 00000. TIGHT END AT 3.6 PICKS IS UNDIAGNOSED (2026-08-12) 🟡 OPEN QUESTION, NOT A HYPOTHESIS

- **THE NUMBER.** Before the onesie cap, the tool took a mean **3.6 tight ends**
  in twelve picks — more than any other position, in a league that starts one.
- **WHAT IT IS NOT.** It is not explained by the ceiling-spread mechanism that
  explains the quarterbacks. Measured p90 of `proj_ceiling − proj_mean`:
  QB 66.5, RB 44.9, DEF 41.7, WR 34.7, **TE 30.8**, K 28.1. **TE has the
  smallest skill-position spread on the board**, so the units argument that
  accounts for QB predicts the opposite of what TE does.
- **STATUS.** Recorded with the number attached and NO hypothesis, deliberately.
  The onesie cap has since bounded it at 2, so the visible cost is gone — but
  the reason a term over-selected the position with the *smallest* upside spread
  is unknown, and an unexplained mechanism that happened to be capped is still
  unexplained.
- **WHAT WOULD ANSWER IT.** A term-isolation pass at a state with two tight ends
  carried, the same way the bench branch was decomposed — an hour, post-draft.
- **✅ RE-RUN 2026-08-15 (Cory research relay) — the symptom is gone, the
  mechanism is still unexplained.** Same 120-room re-run as #0000 above: TE mean
  is now ~1.5 (weighted), modal TE count is 2, not 3.6 — matches the onesie cap's
  intended ceiling and then some. **This closes the practical question (is TE
  over-drafted today — no) without answering the original one** (why did a term
  over-select the position with the SMALLEST upside spread — still not diagnosed;
  the "it's the ceiling units bug" hypothesis is plausible given the timing of the
  2026-08-13 fix but not verified against this specific number). Recommend closing
  this as an ACTIVE risk and keeping it as a genuine open research question only,
  behind the higher-priority items.
- **RELATED, not the same question, found THEN CORRECTED later the same day
  2026-08-15 (see PARKED.md #00000000 and its correction #000000000):** first
  found `starter_counts.TE = 10 = teams * starters_at(TE)` (zero computed flex
  overflow for TE) and proposed tightening `ONESIE_MAX_SPARE.TE` to 0 — but that
  was tested only on a 12-pick simulator, which cannot see round 13-15, where 12
  of 14 real TE2 picks across 3 actual drafts in this league actually happen. TE2
  is 47% of real final rosters (30 team-seasons, `league_history.json`) — cutting
  the spare to 0 would fight normal, common human behavior in this exact league,
  not fix a defect. Revised fix instead widens `CFG.ONESIE_ENDGAME_PICKS`
  (2 -> ~4-5) so the existing late-draft relaxation actually covers when real
  duplicates get taken. Doesn't answer why the original term over-selected TE
  early/mid-draft pre-cap; does give a tested, history-grounded adjustment to
  when the cap relaxes. Awaiting Cory's go/no-go, not yet applied.

---

# RESOLVED / HISTORICAL — kept for the audit trail, not action items

## 00. THE SHIPPED WEIGHTS RECOMMEND NON-PLAYERS FROM ROUND 8 — ✅ FIXED 2026-08-12 (option 1)

> **CLOSED.** Cory chose option 1. `CFG.BENCH_CEILING_FLOOR` and
> `CFG.BENCH_RISK_FLOOR` floor the bench branch's anchor the way
> `VALUE_WEIGHT_FLOOR` floors the starter branch's, and the branch recomputes
> `upsideBonus` with the gate OPEN — `CEILING_LATE_FROM = 0.6` is a *proxy* for
> the throwaway rounds and the bench branch is the actual condition.
> **Reaches (ADP > 250): 111/240 → 0/240**, with the branch still firing on
> 120/240 picks, so it is not that the branch stopped running.
> Baseline re-frozen **v6 → v7** against the SAME board, departure confined to
> the `late-onesies-open` state (ranking + composite scores; per-player survival
> did not move). Intervention rate re-pinned 78.3% → 85.8%, magnitude 19.8 →
> 15.0 — opposite directions, which is the fix's signature: it now departs from
> ADP more often and by far less. The starter branch and the 2026-08-10
> ceiling-zero decision are untouched. Guard:
> `draft/tests/bench_branch_anchor.test.js` (14 checks, inverted from the
> characterisation test it retired).

The record below is the evidence that drove the fix.

- **WHAT WAS FOUND.** Once every starting slot is filled, `scorePlayer` takes its
  bench branch. `MEASURED_WEIGHTS` — what `app.js:52` ships — zeroes four of that
  branch's six terms, and the two weights it does not zero (`value`, `tier`) do
  not appear in the branch at all. The shipped bench score is therefore
  `0.5*stack + 1*keeper`, and `stack` is a flat bonus for sharing an NFL team with
  somebody already on my roster, regardless of whether the player can play.
- **MAGNITUDE, measured.** 20 simulated drafts, `draft/tools/bench_branch_probe.js`:
  **MEASURED reaches (ADP > 250) on 111/240 picks = 46.3%. DEFAULT reaches on 0/240.**
  Concentrated rounds 8–13; 20 of 20 drafts reach in rounds 8, 11, 12 and 13.
  Actual recommendations: Denzel Mims (ADP 696) over Sam LaPorta, then Josh
  Johnson, Joe Flacco, **Tom Brady**, Marcedes Lewis, Jason Witten.
- **AND THE ANCHOR THE COMMENT CREDITS WAS NEVER RUNNING.** The branch says its top
  pick "is the highest-ceiling player left". `upsideBonus` is gated to zero until
  pick 90 of 150; the branch starts firing near pick 70. At pick 73 the ceiling
  term is 0.00 for **every** player on the board. Rule 11e — and it is the second
  defect that makes the first one reachable.
- **WHY DEFAULT SURVIVES, which is diagnostic not reassuring.** What saves it is the
  `risk` term (−42.00 on Mims at weight 1), not the ceiling. MEASURED zeroed risk
  because the Lab measured it as drag **in the starter branch**, where `value`
  anchors everything. In the bench branch it was the only thing holding the floor.
  A weight measured on one composition, applied to another.
- **CONFIDENCE.** High and mechanical. Isolated term by term through the engine's
  own scorer; pinned by `draft/tests/bench_branch_anchor.test.js` (10 checks).
- **COST OF INACTION.** Six of my fifteen picks, on draft day, ten days out.
- **RECOMMENDATION — YOUR CALL, because it changes a weights policy the week of the
  draft and re-opens the frozen baseline (`draft/baseline/v6.json`).** Floor the
  bench branch's ceiling weight the way `wValue` is already floored by
  `CFG.VALUE_WEIGHT_FLOOR = 0.25`, **and** start the ceiling ramp where the bench
  branch starts rather than at 0.6 of the draft, with a risk-weight floor as the
  safety net. Two alternatives and their trade-offs are in the audit. I have not
  applied any of them.
- Full diagnosis: `draft/audit/bench_branch_2026-08-12.md`.

## 1. ANCHOR SOURCE: ✅ WIRED & VERIFIED LIVE 2026-08-09 — board anchors on FantasyPros
> **LANDED (main @ FP-anchor commit + real egress rebuild):** the live board now ranks by
> FantasyPros PRIMARY, FFC gap-fill, search_rank last. Verified on the rebuilt board:
> `primary_source=fantasypros`, 342 FP rows matched, **primary_priced 342 / ffc_gap_fill 3**
> (Pearsall/Metchie/Wease — the exact probe gap), top-200 = 197 FP / 3 FFC / 0 search_rank,
> fallback_rate 0.0. Coverage-gated so a thin/failed FP fetch keeps FFC untouched. The
> record below is the evidence that drove the swap.

## 1. ANCHOR SOURCE: the three-way LANDED — anchor on FantasyPros (our format), not MFL — 2026-08-09
- **Three-way result (FantasyPros now IN the grade, 126/105 players):** n-weighted ρ —
  2023: FFC 0.281 · MFL **0.397** · FP 0.307; 2024: FFC −0.03 · MFL 0.070 · FP **0.075**.
  Region wins FP 5 / MFL 4 / FFC 3; **composite beats no single source** (blend nothing).
- **The format confound is resolved:** **FantasyPros (half-PPR, OUR format) beats FFC
  (half-PPR) in BOTH seasons** — so the market-read edge is REAL and format-independent, not
  an artifact. MFL edges FP only in 2023 (0.397 vs 0.307) and ties in 2024, but MFL carries a
  full-PPR handicap (2023 was receiver-friendly, which full-PPR over-weights) — exactly the
  confound we refused to act on. Per the pre-registered rule (FP beats FFC like MFL did →
  crowd quality, anchor on the clean same-format source): **anchor on FantasyPros.**
- **Recommendation:** swap the live anchor FFC → **FantasyPros** (single source; composite
  doesn't beat it; FFC fallback for deep gaps). FP wins the EARLY regions (r1-3, r4-7) where
  Cory drafts, and it feeds the value anchor that the participation test showed is half our
  edge. **Still thin (2 seasons, n~90/67, no CI on gaps, 2024 ~0 for all — leans on 2023),**
  so directional; but FP is our exact format with no handicap, so it's the *cleaner* anchor
  regardless of the thinness. MFL's residual 2023 edge is format-confounded — do not chase it.
- **Cost of inaction:** the live board ranks by FFC, which FP beats in both graded seasons.
- **Status:** supersedes the earlier MFL lean. Wiring = ingest FP 2026 ADP onto the live
  board (was HELD on this result; the block is cleared). Confirm the FP endpoint reproduces
  (re-fire in flight) before wiring. (EXP-SOURCE-GRADE.md, exp_source_grade.json)

## 1b. (superseded) ANCHOR SOURCE: MFL over FFC — the MFL-only lean, now replaced by #1
- **Found:** source grade — MFL orders realized value better than FFC (ρ 0.40 vs 0.28
  in 2023; 0.07 vs −0.03 in 2024; MFL won 7 pooled regions to 5; composite/hybrid does
  not beat MFL alone). Decomposition: MFL's edge is strongest in **rounds 1-7** (where
  Cory drafts), not the deep board; FFC wins r12+.
- **Implies:** swap the live board's ADP anchor from FFC to MFL.
- **Magnitude:** at Cory's picks, top-50 median rank move 18; pick 41 (Bucky Irving)
  moves 25 ranks. Real where he drafts, not cosmetic.
- **Confidence:** directional — two graded seasons, resting substantially on 2023 (2024
  near-zero for both); thin per-cell n (10-18).
- **Cost of inaction:** the whole draft rule ranks by the worse board through Aug 22.
- **Recommendation:** swap, MFL-alone (hybrid doesn't beat it), FFC fallback for the 28%
  uncovered (all deep; top-130 ~100% covered). Approved by Cory — but **WIRING ON HOLD
  pending the three-way grade (2026-08-09), because a FORMAT CONFOUND surfaced that we
  hadn't turned on this banked result:** MFL is FULL-PPR, which tilts receivers/pass-catching
  backs up for a game we don't play; the grade never isolated "better ordering" from "a
  receiver-lean that aligned with a receiver-friendly 2023" (and the finding rests on 2023).
  FantasyPros is **half-PPR (our format)** and is the natural de-confounding CONTROL: if FP
  beats FFC like MFL does, it's crowd quality not format tilt → **anchor on FP (cleaner, no
  handicap), not MFL**; if only MFL wins, the edge is provisional and we do NOT swap on it.
  So the swap is still on, but the SOURCE (MFL vs FP) and whether it survives format-matching
  are settled by the three-way — do not wire until it lands. (EXP-MFL-SWAP.md)

## 4. FANTASYPROS AS A THIRD SOURCE — ✅ RESOLVED (endpoint found, in the grade) → folds into #1
- **Found:** the FP page SSR-renders only a top-5 teaser; the full board is served by an
  export/data variant of the ADP URL, surfaced by the self-discovering fetch after prioritizing
  export variants over the proven-teaser nav links. FP now crosswalks 126 (2023) / 105 (2024)
  players and is IN the three-way grade. See #1 for the result and the anchor decision.
- **Status:** measurement DONE; the decision is #1 (anchor on FantasyPros). Reproducibility of
  the endpoint re-firing in CI; endpoint recorded in `fantasypros_source` for future runs.

### (historical) FANTASYPROS — the discovery path, kept for the record
- **Found:** the parser is correct, but the FantasyPros ADP page **server-renders only the
  top-5 rows** (a teaser; `ssrHeader:true`) — players 6-300 are hydrated client-side from a
  data endpoint the initial HTML never contains. So the grade only ever saw 5 rows (self-
  diagnosing dump caught it — a miss looked like a miss, not an absent source). First discovery
  probe: the reports bundle references **no `api.fantasypros.com` host** and two guessed
  endpoints 403'd, so the endpoint is a relative/other-host path; a broadened discovery pass is
  in flight.
- **Implies:** until the data endpoint is found, FP **cannot** de-confound the MFL swap (#1),
  so the three-way stays unresolved and **the MFL wiring stays HELD** and format-confounded.
- **Confidence/cost:** FP feeds the input to our LARGEST earner (the value anchor — see the
  participation test), so it's worth the discovery iterations; but it may not be cheaply
  scrapable (endpoint could be constructed dynamically in minified JS). If two more discovery
  passes don't surface it, fall back: keep FFC (our format) as the live anchor, hold MFL, and
  record the source question as format-confounded-and-parked rather than burn more egress.
- **Status:** measurement blocked on discovery; NOT a decision yet. On the model queue.

### Acted-on findings checked in this audit (no decision needed — recorded so they're not re-surfaced)
- **Keeper-need rule** (b0_need +$258, value_depth +$51): WIRED live (needrule.js). ✅
- **Dead zone** (mid-round RB worst allocation): board marker live. ✅
- **Doctrine "enroll as THE PLAN"** (frontier/19b): board shows `enrolled: wr_anchor`,
  edge +172 — the plan IS enrolled. ✅
- **Keeper decision (Nabers)**: settled — keep Chase/Henry/Walker. ✅

### ⚠️ NEEDS VALIDATION before promotion (Cory 2026-08-09 — do not surface ghosts)
Several recorded "install" verdicts predate later work that may have SUPERSEDED, REFUTED,
or CONFOUNDED-INSTRUMENTED them. Validate each against everything learned since before
writing it up as a live decision; record the ones that don't survive as RETIRED-with-reason.
- **`install via the gates (slider change, cited)` ×4** and **`WINNER — dose pays` (exp6
  stack) / `enroll as THE PLAN` ×2** — check against: the keeper-need rule (changed what
  the composite does), the market-reliability surface (changed the anchor story), exp43's
  within-position fix (invalidated confounded cross-position readings), and the phantom-null
  result. Present only survivors, ranked by dollars.
- **This validation pass + the AUTOMATIC finding→decision mechanism** (fire at experiment
  conclusion, not via a remembered audit) are queued BEHIND the slate rails and the weekly
  cron per Cory — they are the process fix that prevents the next backlog, worth more than
  clearing this one.

## 7. CONSERVATION TILT — WIRED LIVE as a gated departure (2026-08-11), baseline v3 → v4

- **Trigger (Cory):** "conservedSurvival is built, exported, and exercised only by its own test.
  The app reads s.survival_to_next straight from the engine. So the conservation correction I
  approved IS DOING NOTHING. Wire it through the gate, and make sure it actually reaches the app
  this time rather than being wired to a test."
- **What changed:** `DraftEngine` no longer binds `survival` to `S.survivalProbability`. One
  accessor now routes all five call sites — VONA's `expectedBestAvailable`, the tier-cliff
  exhaustion product, `survival_to_next`, the branch forecast, and the draft sheet — through
  `S.conservedSurvival`. Tilting some and not others would leave the board's expected-best
  disagreeing with the number printed beside the player, on the same screen.
- **Two corrections found while wiring, neither of which was the wiring:**
  - **N was the whole window.** `conservedSurvival` solved for `targetPick - currentPick`, which
    counts MY OWN pick among the departures. Now `ctx.intervening.length`: 6, not 7.
  - **The tilt was one-sided.** `solveTilt` returned null unless the raw mass EXCEEDED the count —
    a guard written when the model over-predicted (v1: 7.279 over 6). Correcting the frozen
    context flipped the sign to 5.258 over 6, so on first wiring the tilt fired **zero times on
    every state** and the baseline did not trip. That was not the wiring failing:
    `conservedSurvival` was measured being called 1,687,612 times with N correct at 6. It was a
    correction that only knew how to push one way while the error had moved to the other.
- **Why two-sided is right, not merely symmetric:** six opponent picks remove six players. A board
  summing to 5.26 expected departures claims fewer players will be taken than there are picks to
  take them. That is not conservatism; it makes every player look **safer to wait on than he is**,
  which is the direction that costs money in a draft room.
- **Result:** conservation ratio exactly **1.000000** on all three canonical states (was 0.876,
  0.900, 0.862). λ 1.26–1.43. **Top-10 ranking and the rule headline are UNCHANGED on every
  state**; composite scores moved. 8 baseline checks tripped, as a gated departure must.

### The two caveats, carried into the gate rather than discovered later

- **ENFORCING THE IDENTITY IS NOT CALIBRATION.** It makes the total right. If the model's *shape*
  is wrong, the tilt yields per-player numbers that are still wrong and now merely sum correctly —
  necessary, insufficient. Calibration needs outcome data this project does not have. Nothing here
  should be read as "survival is now accurate"; it is "survival now stops claiming an impossible
  total".
- **λ IS FITTED PER BOARD STATE, which is a NEW instability.** Two adjacent windows can produce
  different λ, so in principle a player's number could move between renders with no pick
  occurring. The independent model did not have that property. **Mitigation, stated rather than
  assumed:** λ is fitted ONCE per (board version, currentPick, targetPick, N) and memoised in a
  `WeakMap` keyed on the board array, so repeated renders of the same state return byte-identical
  numbers. The instability is real between states, contained within one.

### Reversal, and what it costs

`CFG.CONSERVE_SURVIVAL_ON = false` restores the pre-departure surface **exactly** — asserted in
`survival_honesty` against v3's frozen mass to 1e-6, not assumed. One edit on draft morning. The
app's conservation banner widens its band automatically in that mode, because a raw model that
does not conserve should not paint the banner red on every render of a deliberate revert.

### Open, and NOT resolved by this — the one live sub-question in this entry

The per-player *ordering* within the tilted total is unvalidated. The tilt concentrates correction
where the weight is, which is defensible but untested against outcomes. That is a **post-draft**
question (mock-calibration arm), not a pre-Aug-22 one.

## ✅ RULED — F4 GATES OUTCOME-DEPENDENT GRADING ONLY (Cory, 2026-08-11)

> **CORY'S RULING, 2026-08-11.** F4 gates **outcome-dependent grading only**. Replay and
> forecast emission proceed on any league passing the other filters; only the
> outcome-graded portion waits for January. **Two conditions:** it is recorded as a
> **dated interpretation with the reasoning, not as an amendment** to F4; and
> **survival-only leagues are labelled and never pooled** with outcome-graded ones.
>
> **Recorded** in `INGEST-PLAN.md` → *"F4 — DATED INTERPRETATION, NOT AN AMENDMENT"*.
> **Implemented** as `ingest_filters.passed_pre_outcome()` (precise only because `screen()`
> checks outcomes last — an ordering change that altered no league's verdict) and
> `ingest_run.survival_gate()`. Every grade carries `outcome_graded`, and
> `survival_pass()` counts `graded_ready` and `survival_only` apart rather than summing them.
>
> **Verified end to end** on a synthetic 2026-shaped league — `has_weekly_outcomes=False`,
> everything else clean, verdict `F4.no_weekly_outcomes`:
>
>     survival_only: 1 | replayed: 1 | observations: 60
>     grade: {'outcome_graded': False, 'n_scored': 40, 'n_unresolvable': 20,
>             'brier': 0.7697, 'base_rate': 1.0, 'beats_base_rate': False}
>
> Sixty forecasts from a league F4 would have excluded whole, forty of them resolved, and
> **no outcome data used**. That is the ruling working.
>
> **ONE THING THE VERIFICATION ITSELF SURFACED, now fixed.** `base_rate: 1.0` makes the
> reference Brier `base*(1-base)` exactly **zero**, so `beats_base_rate` is arithmetically
> forced False whatever the policy did — and "0 of 1 leagues beat their own base rate" then
> reads as a verdict on the model when it is a statement about the sample. The run now says
> so instead, and in a mixed sample the saturated leagues leave the denominator and are
> named. Nothing is admitted or excluded that was not before.

*Original entry, kept unedited below, under its own heading.*

## MAY AN F4-EXCLUDED LEAGUE BE REPLAYED FOR A FORECAST THAT NEVER TOUCHES OUTCOMES? (C, 2026-08-11) 🔴 OPEN

> **SUPERSEDED — ruled above, 2026-08-11.** The heading is kept VERBATIM rather than
> rewritten: a decision log whose headings can be edited after the fact cannot be
> audited, and `integrate.sh` refuses a merge that loses one. The question below is
> exactly as it was asked.

- **WHAT WAS FOUND.** Survival — *will this player still be there when this seat picks
  again* — resolves from the draft's **own later picks**. It uses no weekly data, no
  nflverse, no January. A 2026 league that has drafted with clean dated ADP can therefore
  produce a real graded observation **today**, of the same forecast type the home league
  emits. The replay and the grader are both built and are now wired into the run.
- **WHAT IT IMPLIES, AND WHY IT IS YOUR CALL.** F4 as registered says: *"A league missing
  any of {complete draft, pre-draft ADP, weekly outcomes} is excluded whole. No
  partial-credit leagues."* Every 2026 league is missing weekly outcomes by calendar, so
  F4 excludes all of them, so `replay_league` refuses them all, so **the survival pass
  produces nothing for 2026 until January** — even though survival needs nothing that is
  missing.
- **THE TWO READINGS.**
  - **NARROW (what the code does now).** F4 is categorical. An excluded league is not
    replayed for anything. 2026 survival waits for January.
  - **BROAD.** F4's stated rationale is *no partial-credit leagues* — a league graded on
    some forecast types and not others produces an aggregate whose denominator nobody can
    state. A forecast type that **structurally cannot touch** the missing data is not
    partial credit; it is a complete measurement of a different thing. Under this reading
    F4 gates OUTCOME-DEPENDENT grading, and survival is admissible now.
- **MAGNITUDE.** This is the difference between the 2026 sample producing graded
  observations from August and producing them from January. If run 12 confirms the format
  rate is near zero it changes little; if 2026's pool is richer than 2025's it is most of
  the year.
- **CONFIDENCE.** High that survival touches no outcome data — it resolves from
  `record["draft"]["picks"]`, which the record already carries, and the F3 ingest is not
  on its path at all. That part is mechanical, not a judgement.
- **COST OF INACTION.** Zero today. The narrow reading is what ships, and it is the safe
  one. The cost is five months of observations we could have been grading.
- **RECOMMENDATION.** Broad reading, but **as a new dated registration that names the
  restriction**, not as a reinterpretation of F4: *an F4-excluded league may be replayed
  ONLY for forecast types whose resolution rule references no data outside the league
  record, and every such observation carries a flag saying so, so it can never be pooled
  with outcome-graded ones.* I have not implemented it. F4 stands until you rule.
- **WHAT I WILL NOT DO EITHER WAY.** Relax F4 to reach a number. F7 already says a short
  sample reports the number and changes nothing, and that case has arrived as a
  measurement.

## KOV RAMP SHAPE — MEASURED HISTORY INVERTS THE SHIPPED KEEPER RAMP (A, 2026-08-15) 🔴 OPEN

- **THE QUESTION.** Flip `CFG.KOV_MEASURED_RAMP` (composite.js, built today, ships FALSE) or keep the reasoned ramp? The keeper term is LIVE at weight 1.0 in `MEASURED_WEIGHTS`, so this shapes real late-round tie-breaks on the 22nd.
- **THE MEASUREMENT** (`draft/backtest/exp_keeper_option.py`, preregistered; the league's own 450 picks + keeper designations 2023-25, realized points under our scoring): keeper-option value by the round a pick was made = **+7.1 pts (rounds 4-6) / +1.4 (7-9) / −1.1 (10-12) / 0.0 (13-15 — zero of 31 such picks were EVER kept)**. The shipped ramp is the inverse: zero credit through round 6, maximum by round 12. Full working: `draft/audit/roster_construction_audit_2026-08-15.md` §B.4, artifact `draft/backtest/exp_keeper_option.json`.
- **ALSO IN THE SAME MEASUREMENT, no action proposed:** keeping paid overall (+23.5 mean over the forfeited round) but the round-1 keeper slot returned NEGATIVE (−11.7 mean, 39.3% positive, n=28) — the value of keeping three lives in slots 2-3. Worth knowing before keeper lock on the 21st; the current Chase+Henry+Walker slate was separately optimized (EXP-KEEPER-NABERS) and this does not reopen it.
- **CAVEATS, stated:** two keep transitions, ~40 keep events; behavior-revealed (what managers chose to keep), not counterfactual-optimal; sub-n=10 cells reported but not trusted. That is why it ships OFF.
- **COST OF INACTION:** the live keeper term keeps leaning late-round near-ties toward players whose keeper option, in three real seasons of this league, was never once exercised.
