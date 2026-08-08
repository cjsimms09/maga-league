# The Annual Button — One Press Per Year, The System Improves Itself

Close the last manual gap in the learning loop. Everything deterministic already runs on crons forever. What still requires a human-driven session is IMPLEMENTING the Annual's gated proposals. Build the automation that does it — with one press from my phone, and my approval as the only remaining human step (by design, not by limitation).

## The architecture

### 1. SELF-IMPROVE.md — the standing instructions, committed to the repo
The permanent prompt the button executes. It must be self-contained (a fresh model instance with no chat history reads only the repo) and contain:
- The mission: read THE-ANNUAL.md (the January cron's output), the hypothesis ledger, the calibration history, the shadow-roster final standings, and STATUS.md
- The rules, verbatim from Part 11: implement ONLY gated proposals that carry their evidence; the evidence bar (multi-season consistency or in-season significance); never loosen a gate; never touch raw archives; every changed constant cites its evidence; every change is reversible with the prior value recorded; a planted-noise proposal must still be rejected — re-run that gate test as part of the cycle
- **Dollar evidence is top-level (money function):** every proposal cites its **realized-$ improvement** (weekly-high $, playoff-equity $, RS-equity $) as the primary justification, not point deltas (points may appear as the secondary/input line). **The multi-season-consistency gate is UNCHANGED** — dollars is the currency, not a lower bar: a dollar edge still must clear multi-season consistency (or in-season significance) and beat the null baseline. A dollar case that is only N=1–3 seasons is labeled a lean, not a law.
- The standing analysis mandate beyond the proposals: re-run the strategy hunt on the now-larger draft archive with the null baseline; re-run all Section B intel with the new season appended (every N increments); re-fit the three Section A scalars on the expanded sample through their out-of-sample gates; re-run survival calibration per layer; check every hypothesis in the ledger against the new season's evidence and update statuses; propose (not implement) anything new it notices — into the hypothesis ledger, not into code
- The output contract: all changes as PULL REQUESTS, never direct commits to main — one PR per logical change, each PR description containing the evidence, the prior value, the rollback line, and the grade-next-year registration. Plus ANNUAL-CYCLE-REPORT.md summarizing everything done, everything proposed-but-below-bar, and the three findings most likely to be noise (the standing honesty paragraph).

### 2. The button itself
A `workflow_dispatch` GitHub Actions workflow — "Run Annual Improvement Cycle" — triggerable from the GitHub mobile app with one tap:
- Spins up Claude Code headless (the claude-code GitHub Action / SDK path) with the Anthropic API key stored as a repo secret
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
