# THE DRAFT MODEL — unified architecture + live sequencing

_Cory's spec (2026-08-09): "Follow the market except where we have proof not to, and
keep looking for more proof." Three layers; the Lab decides its own next question.
This file is the durable spec AND the current queue — it is updated in the same pass
whenever a result moves what matters (per the operating addendum)._

## Assessment: is this the right architecture?

**Yes — with three corrections the evidence forces. It is not just right, it is what
the B0 result already proved empirically.** The honest version:

1. **Layer 1 is load-bearing, and a SECOND gradeable source exists (correction,
   2026-08-09).** B0 (follow FFC ADP) is the only thing that clears our gates — so
   the anchor carries the draft. I initially wrote "FFC is the only gradeable redraft
   source"; **that was an inference from what's wired in the repo, not a probe, and
   it was wrong** (the third "blocked-data" claim this month that turned out
   reachable). A real search found **FantasyPros publishes free historical half-PPR
   ADP by year and position (2015–2024 confirmed, 2025 likely), as consensus ADP
   aggregated from commissioner sites — revealed drafter behavior, exactly the kind
   that cleared our null (not paid expert rankings).** URL: `/nfl/adp/
   half-point-ppr-{overall,rb,wr,...}.php?year=YYYY`. So a graded FFC + FantasyPros
   composite CAN be tested per region. MFL historical is uncertain (docs say current-
   year only; year-scoped hosts exist — CI probe pending). Wayback CDX can recover
   Sleeper's August snapshots (but Sleeper stays in the room/survival model, not the
   anchor, per Cory's rule). nflverse has real NFL draft picks (PFR), NOT fantasy ADP.
   **So "the best possible market read" = an empirically-tested FFC+FantasyPros
   (+others if the probe confirms) composite vs the best single member, per region,
   money-graded — data-supported, being built now.** Sandbox egress is policy-blocked
   for these hosts; the fetch+grade runs in CI (open egress), like FFC/BBM.

2. **The deviation problem is real and Layer 2 is the fix — but the binding
   constraint is COHERENCE, not more exceptions.** The model deviates on 74% of
   picks with nothing behind it, yet the surfaces that should say "deviate here"
   converge **ad hoc in `renderRecommendations` with no single resolver** — so even
   the exceptions we HAVE proven (dead zone) can be contradicted by another signal
   on screen. The highest draft-day dollar is a single resolver that makes the board
   speak with one voice, not a longer exception list.

3. **Layer 3 already exists and is running** (this loop). The correction: it must
   *propagate* — a refuted belief updates the doctrine, the surface, the registry,
   and the queue in one pass. That is an operating rule, now written (below).

Everything else in the spec I endorse as-is: named/measured/cited exceptions with
magnitudes; keep Sleeper-board (room prediction) separate from value-consensus
(anchor); forward predictions as the only un-fakeable evidence; the Lab choosing its
own next question.

## The layers (what each is, what's built)

**L1 — best market read (the default, most of the draft).** FFC anchor, format-
matched (half-PPR / 6-pt pass TD; exp 36 grades QB both ways), recency-weighted
(half-life tuned, not picked). Live 2026 blends reachable current sources; weights
come from FFC's graded per-region reliability. BBM = caveat-walled corroborator.
_Built: exp 36 (FFC per-region reliability). Gap: recency half-life; live multi-
source blend; the honest "FFC-is-the-only-gradeable-source" finding (this doc)._

**L2 — evidenced deviations (a short, cited list).** Each deviation traces to a
measured finding with a magnitude, or the model does not deviate. Proven so far:
RB dead zone (overall ~60+, 4 instruments, tempered for the 2024 injury exception);
mid-round WR pocket; exp 36 per-region reliability band; B0-says-fade-RB. Adjuster
posture shifts only where a finding says a different posture pays, driven by the
finding not a schedule. _Built: deviation.js per-region band + dead-zone marker.
Gap: the one-voice RESOLVER; wiring adjuster shifts to survivors; exp 43/grid
exceptions._

**L3 — the continuous loop.** Runs on its own, picks the highest-$ question, fires
CI, reports nulls, registers findings, shifts evidence weights as sample grows.
_Built and running._

## Operating rules (the addendum, made binding)

- **The Lab chooses its own next question** by expected dollars × how soon Cory can
  act. One sentence of reasoning per pick, then go. No asking.
- **Skip lower-value asks and say why** (done once with the regression-weight sweep).
- **Results re-sequence the queue** — and the re-sequence is written here, not held
  in memory.
- **Refutations propagate in the same pass** — doctrine, surface, registry, queue.
  No refuted assumption left standing because nobody asked to remove it.
- **Unprompted search is part of the job** — hunt the residuals/identifiers for
  patterns nobody specified; register, test, report.
- **One voice on draft day** — the surfaces resolve to a single recommendation or
  say "contested"; never leave Cory to arbitrate between his own tools.
- **Plan-adherence nudge** — loud only where evidence is real and the cost is
  measurable ("mid-round RB inside the dead zone; measured cost X"); quiet when the
  pick is obvious.

## CURRENT QUEUE — re-sequenced by the B0 result (dollars × soonness to Aug 22)

The B0 result moved the money: the anchor is load-bearing but data-capped, so the
marginal dollar is NOT a fancier anchor — it is making the proven exceptions speak
cleanly on draft day, and pricing which deviations actually pay.

1. **One-voice resolver + plan-adherence nudge (L2-onto-board).** Highest draft-day
   dollar: converts every proven exception into a clean decision at pick 34.
   Buildable now on existing surfaces. → `coherence.js` (pure, tested on constructed
   conflict states) feeding the war room. **IN PROGRESS.**
2. **Full-board pick audit (exp 43).** The empirical basis for the L2 exception list
   — which picks beat market, does reaching pay, dead zone in residuals. **FIRED.**
3. **Strategy grid (exp 44).** Prices the deviations and B0 attribution (market-
   follow vs RB-fade) across seats/keepers/adjusters, frozen+simulated, robustness-
   scored, full-grid null. Feeds L2 + answers the seat question. **NEXT BUILD.**
4. **L1 honest upgrades.** Recency half-life on FFC; live 2026 multi-source blend
   (weights from exp 36); BBM-as-corroborator test (does a 2nd source help any
   region). Capped by data — bounded effort.
5. **Injury-controlled roster grading arm.** Strips injury noise from the thin
   3-season sample (likely why nothing separates). Folds into the grid's grading.
6. **Season-forward simulator (L2/L3 draft→season).** POST-DRAFT — new simulator,
   as-of-leak risk if rushed; measures in-season tool value (an in-season lever).

## What is NOT achievable (the honest version)

- A historically-graded multi-source *redraft* composite: the second redraft source
  (Sleeper 2023-25) does not exist. We get FFC + a best-ball corroborator, no more.
- A clean draft-strategy dollar winner on 3 seasons without the injury arm: outcome
  noise dominates. Robustness + injury-neutral is the honest stick, and it may still
  return "nothing separates" — which we report, not paper over.
- "Would this have been a good pick FOR CORY" from the full-board audit alone: it is
  roster-agnostic; the roster-conditional answer needs the grid.
