# SESSION A — the model & draft lane (read this first, every time)

_Resume ritual: **"You are session A, read SESSION-A.md and STATUS.md, then continue."**
Everything a fresh session needs is here or linked from here. Files are truth, not
memory. If a rule changes, it changes HERE, in the same commit that changes the
behaviour — never only in a chat prompt._

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
- **Deploy** when Cory needs something live; one per batch; draft-week build reserve
  protected (`DEPLOY-POLICY.md`).

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

The live queue lives in the newest Session-A section of **STATUS.md** and in
**PARKED.md** (scoped deferred increments). The Lab's registered experiments are in
**LAB-REGISTRY.md**.
