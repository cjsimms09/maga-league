# The Annual Button — One Press Per Year, The System Improves Itself

Close the last manual gap in the learning loop. Everything deterministic already runs on crons forever. What still requires a human-driven session is IMPLEMENTING the Annual's gated proposals. Build the automation that does it — with one press from my phone, and my approval as the only remaining human step (by design, not by limitation).

## 🔒 ATTRIBUTION WORDING RULE — binding on every in-season and January report

Experiment 37 is **observational with no control arm** (randomised compliance
declined for 2026, `DECISIONS-NEEDED.md` D12). Its numbers are therefore
**associational, and no sample size changes that.**

**Required phrasing, verbatim (Cory, 2026-08-08):**

> ✅ "**$X was realised on decisions where the tool recommended Y**"
> ❌ "the tool earned $X"

The banned form asserts causation the design cannot support: with your own past
behavior as the baseline, a good outcome is equally consistent with *"the tool
helped"* and *"the tool agreed with what a competent manager would have done
anyway."* Every attribution figure — per component, per week, and in the January
Annual — carries the permitted wording. This is enforced by
`draft/tests/test_attribution_wording.py`, which scans generated report
artifacts, not by anyone remembering.

## Standing re-raise items (surface these every January without anyone remembering to)
- **RANDOMISED COMPLIANCE for 2027** — declined for 2026 (see `DECISIONS-NEEDED.md` D12) on the grounds that the shadow season gives a quasi-experimental read at zero cost, near-tie randomisation carries little marginal causal information, and Cory wanted to play 2026 believing his own decisions. **Re-raise once the tool has real evidence behind it**, with experiment 37's associational 2026 numbers attached so the trade-off is concrete rather than abstract.

## The architecture

### 1. SELF-IMPROVE.md — the standing instructions, committed to the repo
The permanent prompt the button executes. It must be self-contained (a fresh model instance with no chat history reads only the repo) and contain:
- The mission: read THE-ANNUAL.md (the January cron's output), the hypothesis ledger, the calibration history, the shadow-roster final standings, and STATUS.md
- The rules, verbatim from Part 11: implement ONLY gated proposals that carry their evidence; the evidence bar (multi-season consistency or in-season significance); never loosen a gate; never touch raw archives; every changed constant cites its evidence; every change is reversible with the prior value recorded; a planted-noise proposal must still be rejected — re-run that gate test as part of the cycle
- **Dollar evidence is top-level (money function):** every proposal cites its **realized-$ improvement** (weekly-high $, playoff-equity $, RS-equity $) as the primary justification, not point deltas (points may appear as the secondary/input line). **The multi-season-consistency gate is UNCHANGED** — dollars is the currency, not a lower bar: a dollar edge still must clear multi-season consistency (or in-season significance) and beat the null baseline. A dollar case that is only N=1–3 seasons is labeled a lean, not a law.
- The standing analysis mandate beyond the proposals: re-run the strategy hunt on the now-larger draft archive with the null baseline; re-run all Section B intel with the new season appended (every N increments); re-fit the three Section A scalars on the expanded sample through their out-of-sample gates; re-run survival calibration per layer; check every hypothesis in the ledger against the new season's evidence and update statuses; propose (not implement) anything new it notices — into the hypothesis ledger, not into code
- The output contract: all changes as PULL REQUESTS, never direct commits to main — one PR per logical change, each PR description containing the evidence, the prior value, the rollback line, and the grade-next-year registration. Plus ANNUAL-CYCLE-REPORT.md summarizing everything done, everything proposed-but-below-bar, and the three findings most likely to be noise (the standing honesty paragraph).

### 1b. ONE BUTTON, ONE JANUARY, ONE RUN — every season-end artifact in a single PR set
**Consolidation directive (Cory, 2026-08-08):** the League History page's yearly chapter is **NOT a separate trigger** — and neither is any other season-end job. The Annual Button is the single January entry point; one `workflow_dispatch` → one headless run → **one PR set** produces ALL season-end artifacts. The run's mandate, beyond the gated code proposals of §1, produces:

1. **Season grading + recalibration proposals** (as specced in §1 / Part 11 L5).
2. **The history chapter** (`league-history-page.md`): the **full-banter recap** (per that spec's §5 four rules), the season page **sealed from live mode to permanent**, the **records book + Money Board + Bad Beats** recomputation, and the **dossier year-end appends**.
3. **The four season-end artifacts** (§1c below): season rollover, final shadow verdicts + certification, the ledger calibration report, and the financial settlement report.

**⚠️ SEQUENCE INSIDE THE RUN IS A HARD INVARIANT — non-negotiable:** grading and **any data corrections complete FIRST**; the **history chapter (and every derived record/Money-Board/Bad-Beat) generates ONLY from the corrected data.** The recap must never cite a number that the same run later corrects. Concretely the run is ordered: **(a) harvest/ingest + reconcile + apply any data corrections → (b) grade season + recompute calibration + shadow verdicts → (c) THEN generate the history chapter and all derived records off the now-frozen corrected numbers → (d) open the PR set.** A robot/CI assertion in the workflow checks that no history artifact was written before the corrections step's completion marker.

### 1c. Season-end orphans folded into the same run (same PR set)
1. **SEASON ROLLOVER — the important one.** Sleeper spawns a **NEW `league_id` each year** (`auto_continue`). The Annual **detects the new league object, re-points all config** to it, **runs the settings watchdog** (Part 12, float-normalized hash) against the new object, and **diffs the rules year-over-year.** January is exactly when next season's rule changes first appear — this diff is the moment the machine catches them with **seven months to adapt** instead of discovering them in August. The old season's IDs are **archived into the chain** (the 2023→2024→2025→… lineage). A rule-change surfaced here becomes a flagged item in the report (and, if it invalidates a fitted parameter, a gated proposal to refit).
2. **Final shadow-roster verdicts + strategy certification update — the grading PR's headline.** The season-long shadow race gets its official ending: **final E[$] per strategy**, luck-baseline comparison (Phase N 95th percentile), and **certification status updated per the multi-season gates.** Strategies that cleared the gate this season advance; those that didn't stay leans. This is the top line of the grading PR.
3. **Prediction-ledger annual calibration report — the model's public report card.** Every survival %, projection, and lineup call graded; **calibration curves recomputed per layer**; the report card feeds the recalibration proposals (§1). Renders both process verdicts and $ deltas where computable (governing principle).
4. **League financial settlement report.** The final money table cross-referenced into a season-end settlement: per-owner **weekly-high $ + RS $ + playoff $ = total earned**, reconciled against the pot (the `money_history` reconciliation guard), rendered as the plain-language "who owes/gets what" ledger. *(Cory's message was truncated here — this item captures the intent as stated; reconcile against the full spec when it lands.)*

Every one of these lands in the **same single PR set** the button opens, each as its own logically-scoped PR (grading, history chapter, records recompute, rollover/config, settlement), all carrying evidence + rollback + grade-next-year registration per the §1 output contract.

### 2. The button itself
A `workflow_dispatch` GitHub Actions workflow — "Run Annual Improvement Cycle" — triggerable from the GitHub mobile app with one tap:
- Spins up Claude Code headless (the claude-code GitHub Action / SDK path) with the Anthropic API key stored as a repo secret
  - **SECRET NAME PINNED:** the repo secret is `ANTHROPIC_API_KEY` (GitHub → Settings → Secrets and variables → **Actions**, a *secret* not a variable). The workflow references `${{ secrets.ANTHROPIC_API_KEY }}`. NEVER Netlify env, never committed, never served. Cory can add it any time; it's read at workflow-run time, no redeploy.
  - **KEY IS PLACED (Cory, 2026-08-09) as a GitHub ENVIRONMENT secret — the workflow MUST match this or the key is invisible even though it exists:**
    - Environment name: `ANTHROPIC_API_KEY`; secret inside it: `ANTHROPIC_API_KEY`.
      The key-using job MUST declare `environment: ANTHROPIC_API_KEY` (env secrets are NOT available without the job-level `environment:` line). Reference: `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`.
    - Branch restriction: the environment allows **main only** → the workflow runs from main (workflow_dispatch defaults to the default branch — fine; never a feature branch).
    - **Required reviewer = Cory** → the run PAUSES at the key-using job for his GitHub 'Review deployments' approval. This is the intended human gate, NOT a failure, and it waits up to ~30 days (no January timeout risk). DESIGN CONSTRAINT: keep the key to a SINGLE job so approval is requested ONCE, not per-job. So there are exactly two human touchpoints: (a) approve the run to start, (b) review/merge the resulting PRs.
    - Spend: Cory set ~$50/mo at Anthropic; the Annual is ~$10-25/run → safe headroom for one run/month. The only risk is STACKING (fall dry-run + a retry, or annual + a mid-season check) in the SAME calendar month; space them across months or raise the cap temporarily. The design does not need more than $50/mo.

  - **THE KEY PATH MUST BE EXERCISED, NOT JUST DESIGNED (Cory, 2026-08-09): "I want to have watched it work once before January."**
    - `annual-key-smoke.yml` exists NOW: a pennies-cost workflow_dispatch that fires the SAME environment secret + required-reviewer approval + a real authenticated Anthropic call. Run it from the GitHub app any time to watch the wiring work months early; green = the key path is proven.
    - The FALL DRY RUN must exercise the REAL key path end to end — its 'dry-ness' gates the INSTALL/merge ONLY, never authentication. So the dry run genuinely: hits the approval gate, resolves the env secret, makes real authenticated headless calls (real spend, ~$10-25), and OPENS the PRs — it just marks them DRY-RUN / does not merge. A dry run that stubs or skips the key would leave the January path untested, which is the exact failure Cory is guarding against. NEVER build the dry run to bypass auth.
    - Optional: renaming the environment to `annual` would be clearer than a secret-named environment, but it is not required — the workflow will match whatever name exists; a rename is a one-line change on our side.
- Points it at SELF-IMPROVE.md and lets it run the full cycle: read, analyze, implement gated items, open PRs, write the report
- Full test suite + robot mock must pass inside the workflow before any PR opens; a cycle that breaks the build produces a report and zero PRs
- Budget-capped and time-capped in the workflow config so a runaway session can't burn tokens indefinitely; the report says if it hit the cap mid-cycle
- Also schedulable: wire the same workflow to a February 1 cron with a config flag OFF by default — I can flip it to fully automatic later if year one's button-press cycle earns trust

### 3. What lands on my phone
- GitHub notification: "Annual cycle complete — 4 PRs, 1 report"
- I read ANNUAL-CYCLE-REPORT.md (written for a phone, plain language, evidence linked)
- I approve/merge PRs from the GitHub app — tap, tap, done — or reject any with one comment, which the next cycle reads
- **My approval stays in the loop ON PURPOSE.** The gates' whole philosophy is that no change installs without evidence AND sign-off; automating my judgment away would be the one "improvement" that breaks the system's safety model. The button eliminates the labor, not the judgment. Merging four PRs from a couch in January is the entire annual cost.

### 4. The mid-season mini-cycle (optional, same machinery)
A lighter workflow_dispatch — "Run Mid-Season Check" — same headless setup, narrower mandate: grade everything gradeable to date, verify calibration isn't drifting, verify the crons/ledger/capture are all actually running (a watchdog for the watchdogs), fix only broken plumbing (never models), report. Worth a tap around week 6 and week 12. This is also the insurance against the failure mode where silent infrastructure rot eats a season of data and nobody notices until January.

### 5. Survivability requirements
- SELF-IMPROVE.md, all specs, all pre-registrations live in the repo — the system's brain is version-controlled, not in any chat history
- The workflow pins model choice in config (update it yearly to the current best coding model — that one-line edit is a legitimate part of the annual button-press ritual)
- If the Anthropic API/action interface changes, the mini-cycle's plumbing check catches the workflow failure and the report says exactly what needs re-pointing
- Document the whole loop in the repo README: what runs itself, what the buttons do, what I approve — written so that me-in-2029, having forgotten everything, can operate it from the doc alone

## Acceptance
- Dry-run the full cycle NOW against current state: it should read the (pre-season) Annual materials, correctly find few-to-no gated proposals, still run the analysis mandate, open zero-or-few PRs, and produce the report — proving the machinery before the January it matters
- The planted-noise proposal test runs inside the cycle and the report shows it rejected
- One deliberately-broken cron in a test branch → the mini-cycle's plumbing check names it
- README loop documentation exists and I can follow it cold

## ⚠️ LEARNING-HALF STATUS AUDIT (honest, 2026-08-09) — plumbing built, learning NOT

The chain is predict → record → grade → update. Steps 1–2 compound today; 3–4 do not.
- **emission + recording (1–2): BUILT & WIRED** — live draft render commits timestamped
  predictions to `predledger` (forward-guarantee).
- **grading logic (3): BUILT BUT DORMANT** — `forecast_grade.py` (8/8) exists; nothing
  runs it but tests.
- **weekly automatic grading (3, wired): NOT BUILT** — no cron grades resolved
  predictions; no calibration ledger accumulates. **KEYSTONE.**
- **derived evidence-weight fn (4 substrate): BUILT BUT DORMANT** — `evidence_weight.py`
  exists (inverse-variance + trajectory); only `bbm_translate` calls it. Nothing
  re-weights the live board from graded outcomes.
- **model update — move confidence / deepen dossiers / retire-strengthen findings (4):
  SPEC-ONLY** — the Annual delegates it to a headless PROMPT, not deterministic code,
  and it depends on the missing graded record.

**VERDICT: as-is, January TIDIES (chapter/money/reset) but does not COMPOUND (no graded
season to learn from, no wired re-weighting).** TOP POST-DRAFT BUILD, **September deadline**:
wire weekly `forecast_grade` → calibration ledger BEFORE the season's predictions start
resolving, else January inherits an ungraded pile. Then wire `evidence_weight` to consume
that ledger (step 4). The Annual's headless mandate is not a substitute for the wired
weekly grading — it needs a graded record to read.
