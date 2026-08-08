# The Strategy Hunt + The Learning Seed — Built to Compound

> **This document IS "Part 11" (the learning loop).** The in-season-master and
> EVIDENCE-BUNDLE reference a "Part 11" spec that was never separately committed.
> Phase L here (L1 ledger → L2 raw → L3 calibration auto-refresh → L4 dossier
> append → L5 The Annual → L6 hypothesis ledger) is that learning loop in full;
> the Annual Button (`annual-button.md`) is its one-press implementation arm.
> Where anything cites "Part 11 gates" (multi-season consistency OR in-season
> significance; never loosen a gate; planted-noise proposal must be rejected;
> every changed constant cites its evidence and is reversible), those rules live
> in Phase L / Phase N of this document. Folded here 2026-08-08 so there is one
> authoritative learning-loop spec, not a dangling reference.

Two mandates, one document. First: an **exhaustive** search for strategies that would have performed well in this league's actual drafts — every honest avenue, not eight hand-picked profiles. Second: the learning infrastructure instrumented NOW, before draft day, so 2026 is fully captured and the system is materially smarter every season. These connect: the search generates hypotheses; the learning system grades them on live data; years compound.

Framing, locked before any numbers: the historical search **ranks, characterizes, and eliminates**. Certification comes from the null-baseline test (Phase N) and live shadow grading (Phase H) — never from a raw backtest ranking alone. Runs on the corrected foundations (real keepers, top_picks_flat where each season's reality matches, full board coverage) and after/alongside Backtest Round 2.

---

# PHASE S — The Exhaustive Strategy Search

Search the full space, four families, all seasons, my seat and league-wide, graded per pick and per final roster:

### S1. Weight-space sweep
Coarse grid over the composite weights (each of tier/need/risk/ceiling at {0, 0.5, 1, 1.5, 2.5}, value at {0.5, 1, 1.5}) — thousands of combinations are fine in CI. Also round-dependent variants: each weight allowed one schedule (flat, ramp-up-by-round, ramp-down). Record every combination's result; report the top 20 by pooled surplus with per-season splits and intervals.

### S2. Sequencing strategies (decision rules, not weights)
Positional opening books from my real first picks (34/41/54 under current rules; each season's true slots historically): RB-RB, WR-WR, WR-RB, best-available-pure, TE-early, QB-early, late-QB-hard (no QB before pick 90), onesie-at-LRM-exactly. Each rule constrains the first 2–3 live picks, Default drafts the rest. These test the openings a human actually chooses between.

### S3. Counterfactual mining (find where the points actually lived)
For every replayed pick: the gap between what Default took and the best-available-by-actual-season-outcome. Aggregate the gaps: which rounds, which positions, which situations (post-run, faller-available, opponent-just-reached) held the most recoverable value? Then invert: what *systematic, describable* adjustment captures the largest recurring gap? This generates strategies from the data rather than testing preconceptions — report the top 5 data-generated candidates alongside the designed ones.

### S4. Oracle gap (the ceiling on all of this)
Perfect-hindsight drafting from my seat vs Default: the total points available to ANY strategy. This number contextualizes everything — if the oracle gap is 120 points/season, a strategy claiming +90 is suspect; if it's 300, there's real room. Report it per season.

# PHASE N — The Luck Baseline (how we get honest significance at small N)

The classical p-value is unreachable at N≤3 drafts. The honest substitute: **race the search against its own luck.**

1. Permutation runs: repeat the ENTIRE Phase S search ≥500 times on outcome-shuffled data (player season-outcomes permuted within position, preserving the draft structure). Record the best-performing strategy's score in each permutation.
2. That distribution is what "the best strategy the search finds" looks like **when there is nothing to find**.
3. The real search's top candidates are then reported against it: "Real best: +47/season. Luck-only best (95th percentile of 500 null searches): +52." → not distinguishable from luck, and we say so. Or: "+83 vs luck-best +52" → genuine signal, honestly earned.
4. This is the pre-registered certification bar for anything from Phase S: **a strategy earns 'candidate' status only if it beats the null-search 95th percentile.** Below it: ranked, recorded, and carried as a hypothesis — never installed.
5. Multiple-comparisons honesty is thereby built in structurally: the null baseline already includes the search's ability to cherry-pick, because the null searches cherry-pick too.

# PHASE $ — Money grading (how E[$] is computed for every replayed & shadow strategy)

Refinements locked 2026-08-08 (Cory). Dollars is the top-level currency (Phase L governing principle); this is the METHOD that makes each strategy's E[$] faithful to the league that actually exists, not a flat abstraction. It feeds both Phase N (the dollar luck baseline) and Phase H (shadow standings), so it is defined once here.

1. **Weekly-high odds grade against the HARVESTED per-week winning thresholds, never a flat number.** Each week has its own bar from the money-history harvest — 2024 week 1's high was **126**, week 2's was **166** — and a strategy's P(weekly-high, w) is its roster's optimal-lineup score distribution vs *that week's* actual threshold, season by season. A flat "≈140" bar would credit an easy week and rob a hard one; the per-week, per-season thresholds are ground truth. (Weeks 1–15 pay; 16–17 don't.)
2. **Opponent scores simulate at their OBSERVED lineup efficiency, not optimal.** Each opponent's weekly score is drawn from *their* roster's ceiling scaled by *their* measured efficiency (Schmelley 84–87%, mhagen ~90%, per the dossiers), not a perfect lineup. H2H results, top-4 playoff-entry odds, and RS standings therefore reflect the real league — where points are routinely left on benches — instead of an all-optimal fantasy that nobody plays. My/shadow rosters still grade at *their* strategy's lineup logic; the asymmetry is the point (the edge is partly that opponents misfire).
3. **Every strategy's E[$] is reported DECOMPOSED — weekly-high $ vs playoff-entry $ vs RS $ — never just a total.** The headline number hides where the money is made: a variance strategy might buy weekly-high lottery tickets while a floor strategy banks RS-equity and playoff entry. The decomposition is the actionable output (it tells us which lever a strategy actually pulls); the total is the ranking key.
4. **The dollar luck-baseline verdict (Phase N, computed in $) is the certification bar.** A strategy earns 'candidate' status only if its **E[$] beats the null-search 95th percentile in dollars** (not points). Anything that clears it is **flagged for the shadow-roster set (Phase H) if not already in it** — the live 2026 season becomes its out-of-sample certification. Below the bar: ranked, recorded, carried as a hypothesis, never installed. N=3-season dollar edges render as leans, not laws (governing principle).

# PHASE H — Shadow Rosters (2026 becomes the certification season)

The answer to "would this strategy have worked" that no replay can provide: **run them all, live, silently.**

1. On draft night, after every real pick, each surviving strategy (Default, all Phase-S candidates above the elimination line, and the null-beating candidates especially) maintains its own counterfactual draft — what IT would have taken at my slots, from the actually-available board. Log each shadow roster at draft end.
2. All season: every week, score every shadow roster's optimal lineup with real results, alongside my real roster. **Standings render in DOLLARS** (E[$] to date — weekly-highs banked + playoff-entry equity + RS equity), points as the secondary/input line: "Shadow standings: Tier-Hunter **$180** (1,204 pts) · You **$100** (1,187) · Default **$60** (1,151)…". Dollars is the scoreboard per the governing principle above.
3. Season end: a full out-of-sample grading of every strategy on a season none of them saw — the certification the backtest couldn't produce. Next year's default weighting gets chosen WITH this evidence, through the Part 11 gates.
4. Shadow rosters are frozen at draft night (no shadow waivers in v1 — note the limitation; a v2 can shadow waiver policies too, September decision).
5. This compounds: every future season adds a full live grading of the whole strategy space. By year 3, strategy selection rests on 3 live seasons + 6 replayed drafts — a real sample, accumulated automatically.

### Phase H build requirements (folded in 2026-08-08 — implement exactly)
1. **Correct board state per shadow pick.** A shadow drafts only at MY slots, and only from the board AS IT ACTUALLY STOOD when my real pick arrived (not the end-of-draft board). Log a **board-state hash per shadow pick**; the robot scenario asserts this sequencing (a shadow pick made against the wrong board snapshot is a bug).
2. **Hard filters yes, personal taste no.** Shadows obey legality + positional caps (the hard filters) but **IGNORE my targets/never lists** — they test strategies, not my taste. This decision is written here so January's grading interprets shadow rosters correctly.
3. **Freeze means freeze.** Each shadow roster stamps: strategy name, **weight-function hash**, board `built_at`, and a `frozen` flag. September grading MUST REFUSE to grade a roster whose strategy hash no longer matches the code (a changed strategy is a different strategy — don't credit it with an old roster's outcome).
4. **Fire during mocks/rehearsals too**, flagged as `rehearsal` entries (never mixed with real draft-night entries), so the whole shadow path is exercised before draft night.

# PHASE L — The Learning Seed (instrument NOW, before draft day)

> **GOVERNING PRINCIPLE — REALIZED DOLLARS IS THE TOP-LEVEL GRADING CURRENCY**
> (2026-08-08, from the money function). Everything the learning loop grades is
> scored in **$** first, points second:
> - **Every graded decision reports BOTH** its *process verdict* (was the call
>   defensible given what was known?) **AND its `$ delta` where computable**
>   (weekly-high $ gained/lost, playoff-equity $, RS-equity $). A decision with
>   no computable dollar effect still carries its process verdict and says
>   `$ delta: n/a (reason)` — never silently points-only.
> - **Shadow standings render in dollars** (Phase H) — points are the input, E[$]
>   is the scoreboard, from week 1.
> - **The Annual's proposals cite DOLLAR evidence** — a weight change is justified
>   by realized-$ improvement across seasons, not point deltas.
> - **The multi-season-consistency gate is UNCHANGED** — dollars is the *currency*,
>   not a loosening of the *bar*. A dollar edge still must clear multi-season
>   consistency (or in-season significance) and beat the null baseline; N=3 dollar
>   results are leans, not laws, and render as such.
> - Interim (pre-quantile-V) dollar figures are the August approximation; they
>   steer gently (display > weight) until quantile V makes E[$] exact.

The single biggest determinant of how powerful this system is in 2-3 years is whether 2026 is fully captured from day one. Build the capture layer before the draft; the analysis layers (the full Part 11) follow in September.

### L1. The prediction ledger — live before draft night
Append-only, written AT DECISION TIME (grading may read, never write — the contamination rule): every draft recommendation with full board context and what I actually took; every survival estimate at every pick; my overrides with one-tap reasons; the LRM countdowns vs when positions actually died; run-detection firings vs actual runs. Draft night is the ledger's first big harvest — if it isn't wired, that data is gone forever.

### L2. Raw-forever storage
The complete 2026 draft (every pick, timestamped, with board state), all season's weekly data, all transactions and lineups league-wide, archived raw. Features recompute; raw is permanent. A metric invented in 2028 backtests against 2026 only if this exists.

### L3. Calibration auto-refresh
After the draft: automatically grade every survival prediction made live (Layer by layer) and append to the calibration history. After each season week: grade any in-season predictions. The calibration curve becomes a living document that sharpens with every prediction the system ever makes.

### L4. Dossier append pipeline
The 2026 draft and season auto-append to the nine opponent dossiers (reach deltas from live picks vs behavior-ADP, keeper choices graded under flat-cost surplus, in-season efficiency once weekly data flows). Era-tagged to this year's ruleset. New-owner and rule-change handling per the Part 12 spec.

**Literature grounding (Cambridge/Sleeper draft study, cited 2026-08-08).** Two findings from the published draft-behavior research anchor this whole opponent-modeling programme, and belong on the record here:
- **The behavioral-dossier approach IS that paper's explicitly-named future work.** The paper models draft behavior in aggregate and flags per-opponent behavioral modeling as the open direction; the nine dossiers operationalize exactly that. We are not guessing that opponent modeling helps — the literature named it as the next step, and this is it.
- **"No universal optimal strategy — it depends on your room" is the formal justification for our league-conditional tournament design.** The paper's central result is that the best draft strategy is room-dependent; that is precisely why the Lab races strategies **Cory-conditional and per-slot** (experiments 1/10/19) rather than seeking one global answer. Our tournament architecture is that finding, applied.
- **Herding is published and exploitable** (drafters herd on early QBs and on K/DST): Lab experiment 20 tests fading herd-shaped runs for dollars and scans our own three seasons' dossiers for the signature — herding is encoded into the opponent model, not left implicit.

### L5. The Annual — scheduled, not aspirational
A January job (cron, not intention) that generates the season review: shadow-roster final standings, my overrides graded (was I right?), calibration verdicts, dossier drift, and the gated proposals for 2027 (strategy default, weight changes, parameter fits) — each proposal carrying its evidence and requiring my sign-off, each applied change graded the following year. The gate rules from Part 11 apply verbatim: multi-season consistency or in-season significance; a planted noise-proposal must be rejected (test the gate).

### L6. The hypothesis ledger (connects S/N/H to the years ahead)
Every strategy, parameter idea, and intel lean this project generates — from the Phase S search, the Intel Card, my own hunches logged via a one-line "add hypothesis" input — becomes a tracked entry: statement, origin, evidence for/against, status (active/eliminated/certified). Shadow rosters and each season's data grade the active ones automatically where possible. Nothing interesting is ever lost to a chat scroll again; nothing gets believed without accumulating evidence. This ledger IS the 2-3 year compounding, made concrete.

---

## Deliverables
- `STRATEGY-HUNT.md`: full Phase S results (top 20 weights, all sequencing rules, counterfactual-mined candidates, oracle gaps), the Phase N luck distribution and verdicts **in dollars**, the elimination list, and the candidate list entering shadow tracking — every claim with N and intervals, provenance-stamped
- **Phase $ per-strategy E[$] table, DECOMPOSED** (weekly-high $ · playoff-entry $ · RS $ · total), graded against the harvested per-week thresholds with opponents at observed efficiency — the "where does each strategy make its money" view, with the dollar luck-baseline bar drawn on it and every clearing strategy marked for the shadow set
- Shadow-roster system live and robot-tested before draft night
- Ledger capture verified live (trigger one recommendation, show the entry, decision-time timestamp)
- STATUS.md: the luck-baseline verdict verbatim ("real best vs null-95th"), the shadow-tracked candidate list, and the L1–L6 readiness checklist
- Honest closing paragraph, per house rules: what the search could not determine, and what specifically the 2026 shadow season will resolve
