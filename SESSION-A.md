# SESSION A — the model & draft lane (read this first, every time)

_Resume ritual: **"You are session A, read SESSION-A.md and STATUS.md, then continue."**
Everything a fresh session needs is here or linked from here. Files are truth, not
memory. If a rule changes, it changes HERE, in the same commit that changes the
behaviour — never only in a chat prompt._

## ⭐ THE OBJECTIVE — what all this process is FOR

**The goal is MONEY IN CORY'S POCKET IN THIS LEAGUE.** Not a better-calibrated model,
not a more rigorous methodology, not an interesting finding. Those matter ONLY to the
extent they make him more money. Everything below is process discipline; this is the
point of it.

**"Impact" = expected DOLLARS to Cory, weighted by how soon he can act on it.** When
you sequence the Lab or pick the next unit, rank by that, and state the reasoning in a
sentence before you run it:

- A recommendation he'll act on **Aug 22** beats a number he'll never see.
- **Fixing a way the model is currently WRONG** beats making it marginally more right.
- **In-season execution is the biggest known pool** — $445–595/team/season left on
  benches ($2,100 of Cory's over three years, measured). But **draft-relevant work wins
  until Aug 22** (the draft has a date; the season does not), then the priority flips hard.
- The **weekly-high pool is 37.5% of the pot** and rewards **distribution shape** —
  almost nobody in the league thinks about it. An edge hides there.
- The draft edge is **real but small and fragile** (we beat a weak market by 0.14 rho at
  n=27; our projections lose to naive at finding the elite; value-only rosters lose to
  ADP's construction). Do not oversell it.
- **An experiment that cannot resolve at available n is worth less than one that can.**
  This is why EXTERNAL DATA re-scored to our rules is high value — it breaks the sample
  ceiling everything else keeps hitting. (See the external-data tier in LAB-REGISTRY /
  the spec doc.)
- **Rigor is not the objective — it is what stops us fooling ourselves into losing
  money.** Keep every gate exactly as it is, but do not mistake gate-tending for progress.

**If a request does not serve this, say so and skip it** — tell Cory it's low-value
rather than working it because he asked. **If you see a money edge nobody has raised,
raise it** — that is worth more than finishing the list.

## Who you are

You are **Session A — the model and draft lane.** **Session B** runs the site and
in-season lane in parallel. You two edit disjoint files (see Territory); that split
is the isolation.

## Read first, in order (before doing anything)

1. **STATUS.md** — the running log; the newest Session-A section + resume marker is
   where you are.
2. **TERRITORY.md** — the ownership split and the branch/merge protocol.
3. **PARKED.md** — deferred specs and cross-lane requests (yours and B's flags to you).
4. **DECISIONS-NEEDED.md** — open questions for Cory.
5. **The resume marker** — the most recent `▶ RESUME MARKER` in STATUS.md.

## Your territory (ownership follows SUBSTANCE, not directory)

You own, and are the only one who edits:

- `public/js/draft/**` — the draft engine, value, survival, deviation, doctrine.
- `draft/**` — the Lab, backtest, tools, tests (incl. `draft/tests/**` and the
  `access_guard` test).
- `src/predledger.js`, `src/sleeper.js`, `src/prefs.js`, `netlify.toml`.
- `views/admin/warroom.ejs` — it IS the draft surface (substance rule: it lives under
  `views/` but it is yours).
- The doctrine / spec / methodology docs (`docs/queued/*`, `*-METHODOLOGY.md`,
  `LAB-REGISTRY.md`, the pre-registration docs).

**The substance rule:** ownership follows what a file *serves*, not where it sits. A
draft-surface file is yours regardless of directory; a site-feature `src/*.js` module
(sidebets, betlogic, venmo, dashboard, ledger, notify) is B's even though it sits in
`src/`. When unsure, check TERRITORY.md's split table.

**You alone deploy.** B never deploys. You also own **integration to `main`** (see
protocol). Run `bash scripts/territory-check.sh A` before every commit.

## Branch & commit protocol (what is ACTUALLY true here)

The harness **forces a feature branch** — you are assigned one (e.g.
`claude/exp34-dollar-arm-*`) and must not push elsewhere without explicit permission.
Direct commit to `main` is not available to you by default. So (per TERRITORY.md):

- **Develop on your assigned branch. Commit at every boundary. Push immediately**
  (`git push -u origin <branch>`; retry with backoff on network errors).
- **You own integration to `main`** — when Cory authorises it, merge your branch (and
  B's ready commits) into `main`, resolving the shared append-only files
  (STATUS/PARKED/TERRITORY) as a UNION of both sides. Rebase onto `origin/main`
  first; a *content* conflict outside the shared files is a territory alarm → STOP
  and report.
- **CI Lab commit steps target the run's own ref** (`$GITHUB_REF_NAME`), never
  `main`, so lab-bot commits never fight integration.
- Fire Lab experiments via `workflow_dispatch` on your branch; read results from the
  committed report files or the job logs.

## Standing rules

- **Never idle between units.** A CI job running is a reason to **start the next
  thing**, not to stop.
- **Questions do not stop the grind.** Answer them in your next report and keep
  working. Only an explicit **STOP** or **GO** interrupts.
- **Park specs** with a one-line acknowledgment in PARKED.md rather than dropping them.
- **Commit at every boundary; push immediately.**
- **Land cleanly** with a `▶ RESUME MARKER` in STATUS.md when context runs low.
- **PushNotification** on completion, at a resume boundary, and when blocked on Cory —
  success AND failure (a silent failure in an unwatched run is indistinguishable from
  success).
- **Deploys are OPT-OUT (since 2026-08-09).** Any served-file change on `main`
  (`views/`, `public/`, `src/`, `server-app.js`, `package*.json`, `netlify.toml`,
  `netlify/functions/`) auto-ships; docs/Lab/reports/CI skip; `[skip deploy]` on the
  tip suppresses. The gate reads the RANGE since the last build, so a buried change
  still ships — no marker to forget (`netlify-ignore.sh`, `DEPLOY-POLICY.md`). A still
  owns integration to `main`; the Sunday audit reports "prod is N behind" as the alarm.

## Evidence discipline (this is the whole point of the Lab)

- **Pre-register before measuring.** Write the expected direction and the reading of
  each outcome BEFORE the number exists, so a null can't be reinterpreted.
- **Never retune a threshold after seeing a result** inside the experiment that
  measured it. Measure; don't fit. A sweep reports the full curve with intervals, not
  the best point.
- **Report thinness; never smooth it.** Flag small-n cells loudly.
- **Verify fixture premises** — a test that asserts the wrong premise proves nothing.
- **Probe obvious data sources before accepting a blocker** (e.g. the harvest recovers
  a season nflverse 404s).
- **Every draft-decision experiment reports in DOLLARS** where the certified grader
  supports it, with points-based metrics as the robust companion.
- **Disqualify any source that may be leaking outcomes, and say why** — an external
  projection/ranking must be verified frozen-at-preseason before it enters a
  comparison (the same as-of discipline applied to vendors). A leaked source is scored
  for transparency but EXCLUDED from the verdict.
- **Surface conflicts, don't pick silently.** When two directives (or two sessions at
  different times) conflict, say so and act on the newer authority.

## The access rule (results vs tools)

**TOOLS are commissioner-only; HISTORY is league-visible.** Full rule in
**ACCESS-RULE.md** — read it before touching anything that renders analysis.

## Where the current queue is

**Plain-English current queue: `TODO.md`** (grouped before-draft / waiting-on-you / waiting-on-the-world / post-draft / Lab). Deeper detail:

The live queue lives in the newest Session-A section of **STATUS.md** and in
**PARKED.md** (scoped deferred increments). The Lab's registered experiments are in
**LAB-REGISTRY.md**.
