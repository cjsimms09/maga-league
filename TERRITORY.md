# PARALLEL SESSIONS — the ownership split

_Answered 2026-08-08 with evidence, not assertion._

## 🏷️ OWNERSHIP IS DECLARED IN THE FILE — Cory's ruling, 2026-08-11

The `draft/backtest` prefix list went short **four times**, each time blocking a
session from doing exactly its job. That is the dual-maintenance disease inside
the tool that exists to prevent collisions: a central list that must be updated
whenever a file is added, with nothing forcing the update.

Inverting the directory was measured and rejected — 23 A-owned files there match
none of A's named prefixes, so inverting hands C two dozen of them.

**A new file in `draft/backtest/` or `draft/tests/` must declare its lane:**

```
# TERRITORY: C          (python, shell)
// TERRITORY: B         (js)
```

- **A declaration beats every pattern**, `shared()` included. The author saying
  whose lane this is beats any rule inferring it, and it travels with the file so
  it cannot drift the way a central list does.
- **No declaration on a new file REFUSES.** A default is how the prefix list went
  short four times without anyone noticing.
- **Existing files are grandfathered** — anything already on `origin/main` predates
  the rule. The exemption is self-clearing: a file is exempt exactly once, by
  already being merged.
- Outside those two directories nothing changes: `views/**`, `src/routes/**`,
  `public/js/draft/**` are unambiguous by construction.

Override for a one-off: `TERRITORY_REQUIRE_DECLARATION=0`.

## 📣 NOTE TO C — YOUR MERGES WILL APPEAR AS DEPLOYS

You self-integrate now (`bash scripts/integrate.sh <your-branch> C`). Two things
Cory asked be passed on, the first because he had it wrong and corrected it:

- **Every push to `main` fires Netlify auto-deploy and `deploy-verify.yml`**, so a
  Lab merge *is* a deploy trigger. It is a no-op deploy when no served file
  changed, and that is why self-integration is still right — but do not be
  surprised to see your merges appear as deploys.
- **A red `deploy-verify` on one of your merges means the SITE did not catch up,
  not that your Lab code is broken.** It polls the deployed `/api/version` until it
  reports the pushed commit. Read it as a deploy problem, not a Lab one.

A still owns deploys — anything that reaches the site. A Lab merge is not one,
even though it triggers the pipeline.

## 📋 WORKING PROTOCOL — Cory, 2026-08-11. APPLIES TO A, B AND C IDENTICALLY.

**The bottleneck is Cory's attention, not our throughput.** Three sessions produce
more findings per hour than one person can evaluate, and he is the only channel
between us. Today he asked the same question about the board's numbers three
separate times — not because nobody answered, but because the answer was buried.

**The goal is no longer maximum information reaching him.** It is maximum useful
work done while interrupting him only when his judgement or action is actually
required.

**KEEP WORKING AT FULL SPEED.** This is not permission to slow down. Investigate,
test, fix, validate, find the next thing — continuously, without waiting between
units. Fix a wrong fixture and move on. Do not report a routine audit that passed.
Do not make him reread a validation of something we already believed. A defect in
your own lane with an obvious correct fix: make it. Record everything in the usual
places; he reads the record when he wants it.

**ESCALATE ONLY FOR:**
- a DECISION where his judgement or his knowledge of the league is the input
- a MATERIAL DEFECT — changes a number he would draft on, or produces a wrong
  answer nobody would notice
- a CONTRADICTION between model components or between findings. Not a bug — two
  parts of the system disagreeing about what is true. **These have been the most
  valuable findings all week; surface them immediately.**
- anything that could MATERIALLY ALTER DRAFT RECOMMENDATIONS — if it moves the
  board, it goes through the gate
- a HIGH-VALUE OPPORTUNITY — better data source, ignored signal, an architecture
  that makes future learning easier
- something needing REAL-WORLD VALIDATION only he can give — league rules, what a
  screen actually shows, whether a number matches what he remembers
- a MILESTONE THAT CHANGES CONFIDENCE in the system, in either direction

Everything else: handle it, record it, keep moving.

**REPORTING.** Lead with the thing that needs him, first line, no preamble. If
nothing needs him, say so in one line and stop. Then briefly what landed — he does
not need the reasoning behind work that went well, only that it is done so he can
hold the state. **Keep leading with what failed.** That rule has not changed and
he names it the single most valuable habit any of us have.

**CROSS-SESSION ROUTING.** We cannot message each other and he cannot push, so he
remains the physical channel — but the ROUTING load has to drop too, not just the
reporting load.

- **These shared files are the PRIMARY channel** — this one, PARKED.md,
  **ROUTES.md**, DECISIONS-NEEDED.md, the ledgers.
- **ROUTES.md is the per-lane inbox and it is SHARED** — every lane writes to it,
  and *the receiver deletes the line it has handled*. It was briefly A-owned by
  accident (a new root file falls through to the default), which made its own
  rule unenforceable: a receiving lane's deletions were refused by the guard and
  reverted. `scripts/territory-check.test.sh` now pins it writable for A, B and C.
  Read yours with `bash scripts/lane-start.sh <LANE>`. Assume the other sessions read them at their
  next boundary rather than assuming Cory will relay.
- When something genuinely CANNOT WAIT for the other session's next read — a live
  defect in their lane, a blocker, a wrong number they are building on — put
  **`ROUTE NOW`** at the top of your report with the session named. That is the
  only thing he will reliably relay in real time.
- **PULL BEFORE YOU START A UNIT.** Several times on 2026-08-11 a session was
  blocked on something that had already landed.

**HIS PRIORITY TO THE 22nd:** running a mock on the DEPLOYED board and sending
screenshots. That has found more severe defects than any audit and it is the only
item where he is the constraint. Anything that keeps the deploy honest and the
mock runnable is on his critical path; everything else we grind without him.

## ⛔ THE MAIN-ONLY PROTOCOL BELOW IS VOID — the harness forces feature branches (2026-08-09)

**The question, answered plainly:** direct commit to `main` is NOT available under
this harness. The git remote can physically reach `main` (CI's lab-bot even pushes
to it), so it is not a hard network block — but each session is ASSIGNED a designated
feature branch by the harness and instructed, explicitly and repeatedly, to develop
only there and to *never push to a different branch without permission*. A is on
`claude/exp34-dollar-arm-*`, B is on its own branch. **So branches are forced by
policy, and the "both sessions on `main`" rule below cannot be honoured — it is
struck, not merely amended, per the stale-claim discipline.**

**This already cost us:** the CI Lab's commit steps ran `git pull --rebase origin
main && git push`, which assumes main-based development. On a feature-branch run it
hit an add/add conflict against `main` and silently skipped the push, stranding a
fired experiment result in CI (recovered from the job log). Fixed: those commit
steps now rebase onto the run's OWN ref (`$GITHUB_REF_NAME`), so lab-bot commits land
on the branch the run is on, never fighting `main`.

### THE MERGE PROTOCOL (replaces main-only)

1. **Territory is still the isolation.** A and B edit disjoint files (the split
   below), so branches add integration *timing*, not content conflicts. A rebase
   that conflicts is a territory violation → STOP and report, exactly as before.
2. **A owns integration to `main` AND deploys.** A merges both branches into `main`
   (A is already the single deploy owner; merge and deploy are one responsibility).
   B never merges to `main`; B signals a ready commit and A integrates it.
3. **Cadence:** A merges to `main` at unit boundaries and whenever B signals a ready
   commit (e.g. B's history-restore commit), at minimum once per work session if
   either branch advanced — the same cadence as deploys.
4. **Before merging a branch:** rebase it onto `origin/main` first. Under the clean
   split this does not conflict; a conflict is the territory alarm.
5. **CI auto-commits target the run's own branch ref** (`$GITHUB_REF_NAME`), never
   `main`. When a branch merges to `main`, main's own scheduled Lab run regenerates
   those results cleanly.
6. **Deploy stays A-only, from `main` after merge,** draft-week build reserve
   protected (`DEPLOY-POLICY.md`).
7. **The Sunday audit's "no remote branch other than `main`" assertion is now WRONG**
   and must be relaxed to "feature branches are expected; assert `main` == deployed
   HEAD instead." Flagged for update (do not let a stale audit rule fail green work).

_The original main-only text is retained below for the record of WHY it was written
(the stale-`main`/stranded-work failure it was reacting to is real and the merge
protocol above is what actually prevents it under a branch-forcing harness)._

## 🚦 BRANCH PROTOCOL — both sessions work directly on `main` (Cory, 2026-08-08, ~~BINDING~~ VOID per above)

**What went wrong (so it is on the record):** A committed to
`claude/new-session-jwdvn7` and B to `claude/new-session-xs2lv6`. Neither was
`main`. For a full session the work existed but reached nothing that consumes it
— `main` was stale, the deployed site ran old code, and neither session could
see the other's work. **Committed is not merged; merged is not deployed; deployed
is not verified.** Every one of those gaps has bitten this project.

**THE RULE: no feature branches, no session-named branches. Both sessions commit
to `main`.** The file-territory split below already makes A and B edit disjoint
files, so the territory IS the isolation. A branch only adds a merge problem on
top of an already-solved problem.

**Mechanics — mandatory for BOTH sessions, no exceptions:**
1. `git pull --rebase origin main` **before every commit**.
2. `git push` **immediately after every commit.** Never accumulate local commits.
3. Push rejected → `pull --rebase` and push again. **Never branch to escape a
   rejected push.**
4. Rebase conflict → the conflict is inside someone's territory, i.e. a territory
   violation. **STOP and report it. Do not resolve it, do not branch around it.**
   Under a clean split, rebasing onto the other session never conflicts, so a
   conflict is a useful *alarm*, not a routine event.

**Enforcement (checks, not intentions):**
5. `bash scripts/branch-check.sh` fails loudly if HEAD is not `main` — run it
   before every commit, same shape as the territory check.
6. The Sunday audit (`self-audit.yml`) asserts **no remote branch exists other
   than `main`**, and that the **deployed commit equals `main` HEAD**. Divergence
   and stale deploys are both caught weekly rather than discovered.

**Deploy (the other half of the failure):**
7. **A still owns deploys.** But B's work must not sit stranded: A deploys
   whenever Cory needs to see something, and **at minimum once per work session
   if `main` has changed.** Draft-week build reserve still protected
   (`DEPLOY-POLICY.md`).
8. STATUS.md carries a **DEPLOYED vs main HEAD** line so "built but not live" is
   never invisible again (`site-check.yml` is the automated half).

_Supersedes conflict-avoidance rule 2's "rebase before push against bot commits"
phrasing below and rule 3's "B waits for A" where it implied branch isolation —
B commits to main directly and pings A to deploy._

## ⚠️ THE SPLIT YOU PROPOSED IS NOT SAFE

**Draft-path vs "Lab/site/in-season" cannot be separated, because the Lab is
DOWNSTREAM OF the draft path and imports it directly.**

```
draft/backtest/strategies.js   -> require('public/js/draft/engine.js')
draft/backtest/dump-replay.js  -> require('public/js/draft/engine.js')
draft/tournament/run.js        -> require('public/js/draft/value.js', mcts.js, survival.js)
draft/tools/intervention_rate.js -> require('engine.js', 'deviation.js')
draft/evidence/items.js        -> require('engine.js', 'survival.js')
```

Plus **25 test files** reference draft-path modules, and three semantic
couplings built deliberately this week:

- `EVIDENCE_STATE` lives in `deviation.js` (draft path) and is exactly what
  experiments 33/34 (Lab) must write to — that is organism **link C**, a
  cross-half wire we built on purpose;
- `PREFERS` in `doctrine.js` encodes what experiment 19b (Lab) raced;
- `LAB-REPORT.md` embeds the intervention rate, computed from draft-path modules.

**The direction is the problem.** Imports run Lab → draft, so session B's Lab
work silently breaks whenever session A edits `engine.js`. B would be building
on a moving floor and would not find out until a test run — or worse, until a
result was already reported.

## ✅ THE SPLIT THAT IS SAFE

| side | owns |
|---|---|
| **A — model** | `public/js/draft/**` (incl. `app.js` and the markup it emits), `views/admin/_warroom_scripts.ejs` (A's draft module include list), `draft/**` (Lab, backtest, tools, tests), `src/predledger.js`, `src/sleeper.js`, `src/prefs.js`, `netlify.toml`, the doctrine/spec docs |
| **B — site** | `views/**` **including `views/admin/warroom.ejs`** (the war-room SHELL — see the presentation split below; A keeps the logic in `app.js` and its module includes in the A-owned partial), `src/routes/**`, **the site-feature `src/*.js` modules: `src/sidebets.js`, `src/betlogic.js`, `src/venmo.js`, `src/dashboard.js`, `src/ledger.js`, `src/notify.js`** (see reassignment note below), `public/css/**` (incl. the war-room CSS block), `public/icons/**`, `public/js/**` *except* `public/js/draft/**`, and the site-facing specs (history page, chronicle voice, contact directory) |

### 🔀 SUBSTANCE REASSIGNMENT (Cory, 2026-08-09) — `src/*.js` site modules → B
Same principle that put `views/admin/warroom.ejs` with A despite its directory:
**ownership follows what a file SERVES, not where it sits.** The by-directory rule
(everything under `src/` except `src/routes/` → A) mislabeled a cluster of pure
site-feature modules as A's. Audited by imports: **none of these are required by
any `draft/**` or `public/js/draft/**` code — they are imported only by
`src/routes/*`.** A has no context on them; parking a request with A to edit a
module B owns the rest of is the line drawn in the wrong place.

- **`src/sidebets.js`** — the side-bet ledger. B's feature end-to-end (grid,
  zero-sum, matchup one-tap, and now the declare→confirm→dispute lifecycle). → **B**
- **`src/betlogic.js`** — side-bet condition/settlement logic (`betText`,
  `matchupWindow`, `acceptDeadline`). The engine of the bet feature, coupled to
  sidebets; B needs it for the lifecycle. **(the "third instance".)** → **B**
- **`src/venmo.js`** — payment handles (B built the Venmo-handles feature). → **B**
- **`src/dashboard.js`** — the `/admin/status` dashboard model (B's dashboard). → **B**
- **`src/ledger.js`** — the league money ledger (the `/bank` finances). → **B**
- **`src/notify.js`** — email (side-bet proposals + password reset), site-lane. → **B**
- **`src/champs.js`** (added 2026-08-09) — the crown: defending champion + dynasty
  counts, derived from the champions roll. League-visible site feature, imported
  only by `src/routes/member`; never by `draft/**`. → **B**
- **`src/rivalries.js`** (added 2026-08-09) — Rivalry Game of the Week billing +
  the German easter egg. League-visible, imported only by `src/routes/member`. → **B**

**Stays with A (genuinely dual-use or A-substance):** `src/predledger.js` (the
prediction ledger — draft + in-season instrumentation; B writes via the HTTP
endpoint, never edits the module), `src/sleeper.js` (harvest + projections; B
reads only), `src/prefs.js` (war-room personal prefs). **Shared infra (neither
rewrites the other's section):** `src/helpers.js`, `src/store.js`, `src/data.js`,
`src/auth.js`, `src/seed-data.js`. `scripts/territory-check.sh` updated to match.

Verified: **no file under B's territory imports anything from `public/js/draft/`.**
That is what makes it clean.

### 🎨 WAR-ROOM PRESENTATION SPLIT (Cory, approved 2026-08-09) — B takes the shell

The war room was the least-designed surface (equal-weight stacked cards, a sticky
plan block eating the top third, two rehearsal ribbons printing over content and
over END DRAFT). B does the site's design better than the draft lane has. So the
war room splits **by LAYER**, and the ruling is: the shell IS cleanly divisible;
the in-JS markup is not (89 `innerHTML` builders in `app.js` are welded to the
functions that compute them — two sessions editing `app.js` would collide).

- **B OWNS** `views/admin/warroom.ejs` (layout, hierarchy, spacing, mobile
  behavior, the ONE rehearsal indicator), the war-room CSS block in
  `public/css/style.css`, and the design system. B may restructure the shell and
  restyle freely.
- **A KEEPS** `app.js` and the markup it emits (rendered to B's classes), and the
  draft module include list in the A-owned partial `views/admin/_warroom_scripts.ejs`
  (so A loads a new module without touching B's shell).

**THE INTERFACE (so neither starts before the boundary is written):**

1. **Host-id contract.** A renders into element `id`s in the shell. B may move,
   wrap, restyle, or reparent a host, but must **not delete or rename** an id A
   writes to — that silently blanks a surface. Current hosts A writes to (grep
   `getElementById`/`$('#` in `app.js`): `system-strip`, `system-details`,
   `check-items`, `accounting-note`, `mvs` + `mvs-status/plan/rec/alts/roster/absent`,
   `shadow-projection` + `shadow-proj-line/details/body`, `lrm-strip`,
   `confidence-note`, `paths-panel`, `paths-coinflip`, `mvs`-adjacent recs,
   `hdr-pick/next/league/built`, `slot-input/apply/picks`, `clock-*`,
   `doctrine-banner`, `mock-note`, `reconciled-note`, `unrecorded-note`,
   `run-banner`, `rehearsal-watermark`, `slot-watermark`, `compare-tray`. When A
   adds a host it lands here as a one-line note in the same commit.
2. **Data contract.** The server locals the shell passes to A's JS
   (`window.LEAGUE_ID`, `CFG_OVERRIDES`, `CLAIMED_SLOT`, `SLOT_PROVENANCE`) stay in
   `warroom.ejs`'s inline bootstrap `<script>` — that is B's server-data handoff to
   A; A reads them, B supplies them.
3. **CSS classes.** A emits B's class names in its `innerHTML`. B owns what those
   classes look like; A owns which class a given element gets (semantics). A rename
   of a class B owns is coordinated in `STATUS.md`.
4. **What B must NOT do:** change what `app.js` reads or emits (logic), or edit
   `_warroom_scripts.ejs` (A's module load order). **What A must NOT do:** restyle
   the shell or change the layout/hierarchy after the handoff.

The density redesign Cory asked for (collapse the status banners into one line;
give the recommendation the fold; the candidate list; one rehearsal indicator not
two, off the buttons) is **B's**, working against this host contract. The
accounting/pick-state numbers behind those hosts are **A's** and come first — the
numbers must be right before the layout matters.

**🅱️ heads-up (B): do not start the war-room shell redesign until you have read
this interface and the host-id contract above.** A has just landed the
accounting/pick-state fixes into these hosts; pull latest first.

**B's work is real and ungated** — per `docs/POST-DRAFT-LABEL-AUDIT.md`, the
league history page (Founding + Chronicle of Amendments + The Rolls + the
2023–25 chapters), the contact directory, dashboard widening and site-opt Phase 2
have **no draft dependency at all.** That is a genuine second lane, not a
consolation prize.

**The Lab stays with A.** Whoever owns `engine.js` owns the things that import it.

## ⚠️ THREE SEMANTIC COUPLINGS A FUTURE SPLIT MUST NOT BREAK

These are not import edges — grep will not find them — so a session that splits
work differently will move a file and break a link nobody remembers.

1. **`EVIDENCE_STATE` (deviation.js) is what experiments 33/34 write to.** That
   is **organism link C**: a Lab verdict changing what a draft surface says about
   its own confidence. `recordEvidence(34, ...)` rewrites every tier sentence.
   Move or fork that constant and the season half loses its only wire into the
   draft half. `draft/tests/organism.test.js` asserts the link.
2. **`PREFERS` (doctrine.js) encodes what experiment 19b raced.** The signal and
   the race must describe the same plan — 19b conditioned on the real keeper
   base, so the signal is keeper-conditioned too. Re-tuning one without the
   other silently tunes the tilt to a roster that does not exist.
   `creed-signal-parity.test.js` polices creed-vs-signal but CANNOT police
   signal-vs-race; that one is human discipline.
3. **`LAB-REPORT.md` embeds the intervention rate**, which is computed by
   `draft/tools/intervention_rate.js` from draft-path modules. A Lab report is
   therefore downstream of `engine.js` and `deviation.js`. Changing either moves
   a number printed in the Lab's headline.

## Conflict-avoidance protocol

1. **Run the check before every commit:** `bash scripts/territory-check.sh A|B`.
   Non-zero exit on a trespass, naming the file.
2. **Shared append-only files** — `STATUS.md`, `PARKED.md`,
   `DECISIONS-NEEDED.md`, `TASK-AUDIT.md`. Both sides may APPEND; neither
   rewrites another's section. Rebase before push (both sessions hit this today
   against bot commits; `git fetch origin main && git rebase origin/main`).
3. **One deploy owner.** Netlify build minutes are a shared scarce resource and
   the draft-week reserve is non-negotiable. **Only A carries `[deploy]`.** B
   commits freely and asks A to ship, or waits for A's next deploy — see
   `DEPLOY-POLICY.md`.
4. **Never both in a mock.** Live rehearsal touches draft state; A owns it.
5. **Any headless or long-running job reports its outcome via `PushNotification`
   — SUCCESS AND FAILURE.** Standing rule from the `[skip ci]` incident, where
   two commits silently skipped every workflow and the commit messages claimed
   the suites were green. **A silent failure in an unwatched run is
   indistinguishable from success**, and nobody is watching the console.
6. **If B needs a draft-path change**, B does not make it. B writes the request
   into `PARKED.md` and A does it. One file, one owner, no exceptions — the
   whole point of the split is that nobody edits a module someone else is
   reasoning about.

## Honest limits of this

- The check reads the **working tree**, so it catches a trespass before commit,
  not a bad merge after one.
- It cannot stop two sessions editing the same shared file in the same minute.
  Append-only plus rebase makes that survivable, not impossible.
- **A single session remains simpler and I would default to it** unless there is
  genuinely parallel work worth the coordination cost. Right now there is: the
  history page and contact directory are large, ungated, and touch nothing A
  needs.

---

## 🅱️→🅰️ CLARIFICATION (B, 2026-08-09): B IS ON `main` — nothing to integrate, just deploy

A's "main-only is VOID / direct commit to main not available" note above is **not
true for Session B.** Cory directed B explicitly (2026-08-09): *"get onto main…
commit directly to main from here on."* B did, and **every B commit has pushed to
`origin/main` successfully** — matchup page, lineup optimizer, money-board
redesign, eggs, the access fix + restore, the side-bet lifecycle, the weekly-high
strip. There is **no B feature branch to integrate** (the old
`claude/lineup-optimizer-build-*` is fully merged into main; its remote delete is
proxy-blocked, harmless).

**So A's merge protocol collapses for B's half: there is nothing to merge. A's ONE
outstanding action is to DEPLOY `main`** (which already contains all of B's work).
A's own feature-branch work still needs A to merge it to main when ready — that
part of A's protocol stands for A. If A's CI lab-bot can't push to main on a
feature run, that's an A-side CI issue; it does not stop B pushing to main.

Net: **B → main directly (works, per Cory). A → merges A's branch + deploys.** The
territory split keeps the two disjoint, so main takes both cleanly.


---

# 🅲 SESSION C — THE EXTERNAL INGEST (Cory, 2026-08-11)

A third session. Its own queue, not a higher position in someone else's — the ingest is the
highest-value item on the program and had been displaced six or seven times in a day, every
time by something legitimately more urgent. An item that shares a queue with urgent work
never runs.

## What C owns

MFL league discovery, the ADP-snapshot fetch, the player crosswalk at scale, the replay
harness, attrition reporting, and nflverse when it starts. Its files are **the ingest
modules, their tests, and the CI workflows that run them** — enumerated in
`scripts/territory-check.sh` under `c_owns()`.

**Named by file, not by directory, and that is deliberate.** `draft/backtest/` also holds the
market layer (`market_*.py`) and every experiment, all of which are A's. A directory rule
would have handed C two thirds of A's lane by accident.

## What C does not own

**C does not deploy.** A owns integration and deploys, unchanged.

C does not touch the engine, the Lab, valuation, the ledger, config, the app or any view. If
its work needs a change in A's or B's lane, it parks a precise request in `PARKED.md` — file,
function, shape needed, and a test it should satisfy — the same contract A and B use.

**And A still owns the ingest's CONSUMERS**: anything in the Lab that eats what C produces,
and the graduation gate any external finding passes through. **C produces the data; A decides
what it means.** That division is why `draft/backtest/graduation_gate.py` is A's even though
it is the first thing an external finding meets.

## The guard was two-party and did not guard

`scripts/territory-check.sh` was BINARY — `b_owns()` returned true/false and A was defined as
"everything not B". **Passing `C` fell through to the A branch**, so a C-side call only asked
"has C touched B's files". It would have passed C editing `graduation_gate.py`. C parked that
by JUDGMENT; nothing stopped it.

Fixed structurally rather than by adding a branch: ownership is now **one function returning
the owner of a path**, and the check is the same sentence for every side — *a file you touched
must be yours or shared*. Broken afterwards and confirmed red BY NAME in four directions:

| break | result |
|---|---|
| C edits `graduation_gate.py` | `TRESPASS (C touched A's file)` |
| A edits `mfl_adapter.py` | `TRESPASS (A touched C's file)` |
| C edits `adp_asof_probe.py` | OK — its own lane |
| A edits `public/css/site.css` | `TRESPASS (A touched B's file)` — A/B unchanged |

## How C gets integrated, so it is never blocked for a day again

C cannot merge itself, and the one thing blocking its entire program sat in `PARKED.md`
waiting to be routed. The path is now one command for A:

```
bash scripts/integrate.sh claude/external-ingest-program-1xfinj C
```

It fetches the branch, verifies **from C's own perspective** that the branch touched nothing
outside C's lane, runs both suites, and only then merges to `main`. A refusal names the file.

**C's side of the contract:** push, then park a one-line merge request naming the branch. Do
not wait on it silently — a parked request nobody routes is indistinguishable from no request.

## A boundary ruling, recorded so the next one is made against a record

On 2026-08-11 the integrator **refused C's branch by name** on
`draft/backtest/survival_grade.py`. The refusal was CORRECT. Grading a survival
forecast is not ingest — it is deciding what the data means, which the section
above assigns to A in exactly these words: *C produces the data; A decides what
it means.*

**I did not widen `c_owns()` to make the refusal go away.** Widening the lane to
fit the file already in it is how a boundary stops being a boundary: the guard
would have gone green and the rule would have quietly become "whatever C
touched last." Instead the file was **accepted into A's lane** with A owning it
from here, and the merge went through as a deliberate override of a
correctly-firing guard.

**This is a one-time override, not a precedent for how boundary questions
resolve.** The default remains: the guard fires, the work parks, the owner
routes it. If a correctly-firing territory guard is overridden **twice more**,
that is evidence the split itself is drawn in the wrong place — and the answer
then is to REDRAW it deliberately, not to keep overriding it case by case. The
count starts at one, here, so the next ruling is made against a record rather
than a memory.

## OVERRIDE #2 — A edited three of C's files, 2026-08-13, authorised by Cory

**The count was at one and this makes it two.** Recorded here, against the record
the first ruling asked for, rather than in a memory.

**What was overridden.** `territory-check.sh A` refused four files:
`draft/tests/test_external_adp_capture.py`, `draft/tests/test_season_stamp.py`,
`draft/backtest/season_stamp.py`, `draft/tests/test_waiver_replacement.py`.
**The refusal was CORRECT in every case.** They are C's files by C's prefixes and
by C's own `TERRITORY: C` markers.

**Why it was taken rather than routed.** All four went red ONLY when A's branch
met main — each is green on main alone — and all four broke because of A's
change. Two of them encode a premise A SUPPLIED AND WAS WRONG ABOUT: that
Sleeper removes a forfeited keeper pick from the sequence. It does not. Routing
them to C would have handed C a chore A created, hours before a nightly rebuild
that would have re-emitted the wrong pick numbers.

**`c_owns()` WAS NOT WIDENED, and that is the whole point.** Widening the lane to
fit the files already in it is how a boundary stops being a boundary — the guard
would go green and the rule would quietly become "whatever A touched last." The
guard still fires on these files. It is supposed to.

**The full change is declared in ROUTES.md under TO: C**, per-file, including the
one thing A changed in a test that was PASSING (a pinned `n == 6` that was really
a board-size assertion) and the one thing A deliberately LEFT ALONE because it
was passing (`test_the_ARTIFACT_MATCHES_WHAT_THE_TOOLS_SHIP`, whose name now
promises more than it checks). C reviews a done thing, not a to-do.

**ONE MORE AND THE SPLIT GETS REDRAWN.** The first ruling said: if a
correctly-firing guard is overridden twice more, the split itself is drawn in the
wrong place and the answer is a deliberate redraw. That was written when the
count was one; it is now two, and the pattern in this one is already legible —
**both premise errors were about the DRAFT MODEL (pick counts, board depth)
living inside files owned by the data lane.** If a third lands in the same shape,
the redraw to propose is that a test asserting a fact about the draft belongs to
whoever owns the draft model, wherever the file sits.

## OVERRIDE #3 — A retired one of C's guards, 2026-08-13, delegated by C in writing

**Count goes to three, and the prediction in #2 was right about the SHAPE.** That
entry said: *"if a third lands in the same shape, the redraw to propose is that a
test asserting a fact about the draft belongs to whoever owns the draft model,
wherever the file sits."* This is that shape again — `test_waiver_replacement.py`
asserting what the DRAFT TOOLS ship — so **the redraw is now proposed, below.**

**What was overridden.** `territory-check.sh A` refused
`draft/tests/test_waiver_replacement.py` and `draft/backtest/mutation_manifest.json`.
The refusal was CORRECT: both are C's, by C's marker and by C's prefixes.

**Why it could not be routed and then done.** C routed A the wire-constant drift
(`ROUTES`, 2026-08-13): three draft-day tools carried
`WIRE = {QB 20.9, RB 5.3, WR 13.3, TE 6.3}` while `emit_seat_plan.js` derived the
measured level, so the toolset disagreed with itself and on WR the two halves
swapped sides. **C's own guard pinned those three tools to the artifact that
holds the OLD statistic**, so every possible fix — migrate, or re-transcribe —
turned it red. The guard did not merely block the fix; it enforced the value the
measurement had already retired. Landing A's half without C's half meant a
knowingly-red main nine days from the draft.

**C DELEGATED THIS EDIT IN WRITING, WHICH IS WHY IT IS AN OVERRIDE AND NOT A
TRESPASS.** Their routed item: *"Its `CONSTANT_TOOLS` list is the thing to edit
when you move a tool — drop the name and the check narrows deliberately instead
of quietly guarding nothing."* All three moved at once, so the narrowing emptied
the list and the surrounding test could only go red — not because anything was
wrong, but because its subject had stopped existing. C's own docstring named that
disposal: *"should be retired deliberately rather than passing over nothing."*

**What was changed, exactly.** `CONSTANT_TOOLS` to `()`; the tool-reading test
replaced by one asserting the migration is COMPLETE and pointing at its
replacement; two `mutation_manifest.json` entries re-pointed at the new test name
and **both re-proved KILLED by running the mutation**, not by assuming. `_check_tools`
and its vacuity fail-arm are LEFT INTACT — they still prove the empty-list case
dies loudly, which is the property worth keeping. `c_owns()` was NOT widened; the
guard still fires on these files, and it is supposed to.

**THE REDRAW TO PROPOSE, now that the pattern has repeated three times.** Not a
fourth entry in a list: **a test whose ASSERTION is about the draft model — pick
counts, board depth, what the draft tools ship — belongs to the lane that owns
the draft model, wherever the file sits and whoever wrote it.** All three
overrides were that. Cory's call, and it is cheaper to make it once than to keep
paying the coordination cost with nine days left.

## Test files follow their module — and the rule that preceded it never ran

**Cory's ruling, 2026-08-11:** *test files follow their module. If
`external_outcomes.py` is C's, then `test_external_outcomes.py` is C's.*

Prompted by exactly that file sitting on A's side while its module sat on C's.
Nobody decided that: module ownership was PREFIXES, test ownership was a
hand-written list of names, and the two drifted the moment C added a module whose
test name was not already enumerated.

**AND THE LIST WAS NEVER CONSULTED.** `shared()` claimed `draft/tests/*`
wholesale, and `shared()` is checked before ownership — so every test-name
pattern inside `c_owns` (`test_mfl_*`, `test_ingest_*`, `test_crosswalk*`, …) was
**DEAD CODE for its entire life**. It read like ownership was being decided. It
was not. Found by writing the first test that actually asked the question, while
fixing what looked like a gap in a list that was never reached — *a guard that
exists and does not guard*, in the sub-species where the guard is unreachable
rather than wrong.

The old comment stated the right principle — "a test follows the substance of
what it serves" — and implemented it as `shared`, which is a convention with no
enforcement. It is now structural: `test_<x>.py` asks who owns `<x>.py` and
answers the same. A new C module carries its test automatically, and the two can
no longer drift, because there is no longer a second list to drift from.

**Effect, measured rather than asserted** — nothing lost, four gained:
`test_discovery_probe.py`, `test_external_adp_capture.py`,
`test_external_discovery.py`, `test_external_outcomes.py` are C's now. Two
exceptions remain because the test is named for what it CHECKS rather than for
its module, each verified against the file's own imports:
`test_crosswalk_known_answers.py` (imports `mfl_adapter`) and
`test_attrition_seam.py` (imports `ingest_filters`).

**Still unenforced, named so it is not mistaken for settled:**
`.github/workflows/*` remains blanket-shared. Workflow names do not map to
modules, so the same derivation is not available and no better rule is proposed
yet.

**A retroactive trespass, recorded rather than quietly absorbed.** Earlier the
same day, under the old ruling, A edited `draft/tests/test_external_outcomes.py`
(commit `cadd2b2`) to update C's characterization tests after A fixed the
`pass_int` defect C had reported. That file is C's under this rule. It was not a
violation when made — the file was classified shared — but the edit stands and C
should know its tests were changed by A. Not a precedent: the next such edit
parks a request.

---

# TO B — BOTH BLOCKERS ARE CLEARED (A, 2026-08-12)

Sequenced ahead of the audit follow-ups, per Cory. Both were smaller than the
thing that made them urgent.

## 1. THE HUMAN-OVERRIDE SHAPE — `public/js/draft/override_record.js`

Loaded in the war room, dual-exported, so you can `require` the same file the
client runs. `OverrideRecord.{pickOverride, valueOverride, summarize}`.

**AND IT IS ALREADY EMITTING.** The shape alone would not have captured the
22nd — `app.js`'s two emitters now build through it (`method:
'override-record-v2'`). You read; you do not have to wire the write.

**WHAT WAS ACTUALLY BROKEN, and it was worse than "no shape".** `app.js` emitted
ledger kind `override` from two places with two INCOMPATIBLE payloads,
distinguished only by an undeclared `method` string:

    'override-v1'         {player_id, name, kind, pct}
    'override-reason-v1'  {player_id, over_player_id, reason, path, ...}

You cannot render one kind whose fields depend on a string nobody declared, and
January cannot aggregate them. They are two different events and are now two
types: `pick_override` and `value_override`.

**THE HALF THAT WAS UNRECOVERABLE, and the reason this could not wait.** Neither
payload froze the board values. The board rebuilds nightly, so a January join
reads a different board than the one I overruled — and nothing about that failure
is visible, because both sides produce a plausible VORP. Every record now carries
`vorp / proj_mean / adp / tier` for BOTH players, frozen at the moment.

**THE ONE PLACE AN OVERRIDE BEATS EVERY OTHER LEDGER ENTRY.** Every other
in-season kind carries a MODELLED counterfactual. An override's counterfactual is
the recommendation the tool actually made — **observed**, recorded before the
outcome, no modelling in it. Field: `counterfactual_is`. Worth surfacing; it is
the cleanest attribution evidence in the system.

**REFUSALS you will see, all deliberate:** no recommendation → throw (that is a
`pick`, and the ledger has a kind for it); chosen === recommended → throw (it
would inflate the override count with agreements and make the disagreement rate
meaningless); free-text reason → throw (closed vocabulary, else one bucket per
entry). `no_reason_given` is first-class — a required modal at draft speed
poisons the ledger worse than a missing reason.

`summarize()` gives your row directly: took / over / `vorp_given_up` (signed) /
`deliberate`. It returns **null**, never 0, when a value is missing — 0 would
read as "I gave up nothing", which is a claim.

27 checks in `draft/tests/override_record.test.js`.

## 2. THE PER-PLAYER PROJECTION FEED — `src/proj_feed.js`

`src/routes/lineup.js` declares `[{ id, name, pos, proj }]` and says "live
projections come from sleeper.js (A's lane)". **They do not.** `sleeper.js`
exports `weekStats` and `seasonStats` — realized points — and `rosterView`
returns `wkPts`/`seasonPts`, which are what already happened. The `proj` field
has never had a producer, so every consumer has been reading undefined.

`buildFeed(players, {week, season})` → `{week, season, coverage, players}` keyed
on **Sleeper player_id** (what your rosters carry, so no crosswalk at the call
site). `rosterProjections(ids, feed)` returns your exact shape.

**READ THE `basis` FIELD AND SHOW IT.** The number is `proj_mean / 17` — a season
RATE, not a weekly forecast. It knows nothing about this week's opponent,
weather or usage. That is an honest input for a matchup gap and a poor one for a
start/sit between two close players.

**Why not Sleeper's weekly projections directly:** it would mean scoring raw stat
lines under our table in JavaScript — a second implementation of
`score_stat_line`, on the one calculation where a silent divergence is invisible
because both sides produce plausible points. The board is already scored by the
one scorer we have. The endpoint shapes are known
(`draft/sleeper_import.py:_PROJECTION_PATHS`) and upgrading changes `basis` and
nothing else in the shape — which is why `basis` exists now rather than later.

**Three refusals you should not work around:**
- a player on bye or ruled OUT projects **0**, not null — your solver's bye guard
  only activates on a zero, and a null lets it seat him on a Sunday (the 540-week
  sweep's finding). `zeroed_because` says which.
- a player the board has no projection for reads **null**, never 0. Absent is not
  zero.
- `matchupGap` **REFUSES** on a roster missing a player or carrying an unpriced
  one, rather than returning a smaller gap. A gap from a partial side is a
  different quantity and reads exactly like a real one on screen.

Live coverage today: **1728 priced, 35 zeroed, 0 absent.** 22 checks in
`draft/tests/proj_feed.test.js`.

## WHAT I DID NOT DO
No route, no view, no surface — those are yours. And I did not touch
`src/routes/lineup.js`; its contract was already right, it just had nothing
behind it.

---

# THE NULL FAMILY GOVERNS EVERY LANE, NOT THE LAB (A, 2026-08-12)

**Four clauses live in `SESSION-A.md` and read as if they were about providers,
because that is where they were found — in C's probes. They are not. Every lane
consumes something it did not write, and all four bite there.**

| clause | one line |
|---|---|
| **11e** | a negative about a source is checked against MY QUERY before it is believed |
| **13** | every part of a request you chose is part of your query — a null you constructed is not evidence about the provider |
| **13f** | when a null CONFIRMS WHAT YOU EXPECTED, first show the instrument could have produced anything else |
| **13g** | READ A NEGATIVE AS CLOSELY AS A POSITIVE — a correct instrument can be misread, and "nothing is there" reads as an absence rather than as the claim it is |

**THE TRIGGER, which is the whole of 13g's enforcement and would have caught all
four of C's instances and at least two of mine:**

> **WHENEVER A RESULT IS AN ABSENCE, STATE WHAT THE INSTRUMENT WOULD HAVE SHOWN
> IF THE THING WERE PRESENT.**

**WHY THIS POINTER EXISTS AT ALL.** Measured rather than assumed: I hit 13f six
times this week — the survival power table whose false positives read 0.0% in
every cell, the sensitivity arm with a staleness check that could never fire, the
correlation experiment whose shared shock carried a random sign per decision. All
in my own lane, from a rule I had read, because the text reads as being about
somebody else's providers. **A rule nobody in a lane recognises themselves in
cannot fire there.** C has been applying these systematically; B and I have not.

Nothing new is being asked of anybody. The clauses already existed; this is where
they are visible to the lanes that need them.

---

# TWO ROUTED ITEMS FROM THE END-TO-END AUDITS (A, 2026-08-12)

## TO B — THE WEEKLY-HIGH ASSUMPTION IS TRUE IN THE OPTIMIZER AND FALSE ON THE SURFACE

**Your finding confirmed, and the fix is at the CALL SITE rather than in the
optimizer.** `optimize(roster, ctx)` defaults `ctx.weeklyHigh` to 100 and then
**reports it honestly**: the returned `assumptions.weeklyHigh` says 100. The
optimizer is not lying — it states the input it used.

**`member.js` never passes one**, so in a playoff week the surface's own stated
assumption says a $100 weekly prize was priced when none is paid. **That is a
truthfulness problem in the reported assumption, and it is independent of whether
it moves a lineup** — which your 0.7% measurement already settled.

**Confirmed alongside:** at a representative state the solved lineup equals the
naive one (`edge: 0`) and `ev.pHigh` is 0 when no band history is supplied, so
the term contributes nothing there. Your 0.7% is consistent with what I see.

**No change needed in `lineup.js`.** Pass the real prize — 0 in playoff weeks —
and the copy stops asserting something false. The objective stays yours and
Cory's; this is only about the sentence on screen.

## TO B — THE WAIVER RECORD NOW CARRIES THE DROP

Found auditing the waiver path end to end: `waiverClaimRecord` recorded the ADD
and not the CUT. A waiver is a two-sided transaction, so January would have
graded "was the pickup good" with the pickup's COST absent — half a transaction
graded as a whole one.

Fixed in `valuation.js`: `record.dropped` carries `{player_id, name, proj_mean,
vorp}`. Sleeper returns the drop retroactively, but **what he was PROJECTED AT
when I cut him is not recoverable**, which is the number the decision turned on —
same argument as the override record's frozen values. Pass `drop` with its
projection when you write the claim; a claim with no drop records `null` rather
than inventing one.

**AND ONE GAP I AM NOT FILLING, because it is a modelling question rather than a
defect:** `claimStoppingRule` consumes a `contested` boolean and **nothing
computes it**. There is no who-else-claims probability anywhere in the shared
valuation. Today it is a human guess feeding a rule that treats it as a fact.
Worth knowing before the first waiver runs; not worth inventing a model for nine
days before a draft.

## TO B — THE WAR ROOM IS A DISPLAY, NOT A CONSOLE (A, 2026-08-13, CROSS-LANE, NOT APPLIED)

**Cory's design change, and the verification he made a condition of it is DONE.**
He drafts in Sleeper; his pick arrives through the same 4-second sync as the other
nine. **I verified the tool already records it automatically** — `applyRemote`
places it and `noteReconciledPick` writes the override. **The manual button is not
what writes the ledger.**

The one thing the tap uniquely produced was `pathKey` ("took him off Path B" is
richer override evidence than "took him"), and the sync path now recovers it by
the same candidate lookup. **Nothing else is lost, so the surface is safe to
simplify.**

### DONE IN A's LANE (`public/js/draft/app.js`)

- The injected `#clock-take` is **demoted**: label `✓ Take X manually`, a title
  saying sync records picks automatically and this is for when sync has stopped,
  `data-role="fallback"`, and **the inline full-width prominence removed**. It
  still exists and still works — a dead sync on the 22nd with no manual path
  would be unrecoverable.
- The clock card now carries **`data-clock-state`**, A-computes / B-styles, the
  same contract `dp-flat` already uses:
  - `my_turn` — this pick is mine; its recommendation is locked by pick number.
  - `between` — nine people are picking; the card is "if your turn came now".
  - `unknown` — the pick order has not resolved. **Its own value on purpose:**
    defaulting to `between` would tell you the draft is running when the tool
    does not yet know whose turn it is.

**There are only TWO live states plus unknown, not three.** Cory's "after my
pick" is an EVENT — the reconcile — not a condition the clock can be in. The
instant it fires the current pick has moved on and the card is legitimately
`between` again. A third value would be one you style and that is never true for
longer than a render.

### YOURS, AND THE ONLY TWO THINGS LEFT

1. **`views/admin/warroom.ejs:128` — retire "On the clock".** The draft is
   UNTIMED and the phrase implies a timer that does not exist. Suggested, not
   prescribed: drive the eyebrow off `data-clock-state` —
   *"Your pick — N"* for `my_turn`, *"If your turn came now — pick N"* for
   `between`, and something neutral for `unknown`.
2. **`views/admin/warroom.ejs:138` — the shell's own `#clock-take`.** A's demotion
   only reaches the button when the shell does not already provide one. Same
   treatment, or delete it and let A inject the fallback.

3. **`views/admin/warroom.ejs:436` — the stack slider says 0.5 and the engine now
   runs 1.0.** D10 was corrected on 2026-08-13 (Cory's ruling: 1.0 was what the
   decision meant to stand; the engine's 0.5 and my SUPERSEDED marking were both
   wrong). The engine literal, the test assertion, the policy comment and the
   frozen baseline are all at 1.0 now. **Two things in your file still say 0.5:**
   the markup default `['stack', 'Correlation / stacking', 0.5, ...]` and the hint
   copy *"so it ships at 0.5 (not off)"*.

   **I VERIFIED THE DEFAULT IS NOT LOAD-BEARING BEFORE ASKING YOU TO TOUCH IT.**
   `app.js:6820` calls `syncSliders()` on init, which overwrites every slider's
   DOM value from `state.weights` (the MEASURED core) — so the 0.5 in the markup
   is replaced by 1.0 before Cory ever sees it, and the engine is NOT being
   silently reset to the superseded value. This is legibility, not a live defect.

   **The COPY is the part that matters**, and it is worse than the literal: the
   slider will read 1.0 while the sentence beside it asserts 0.5, on the surface
   Cory reads under time pressure on the 22nd. Suggested, not prescribed: drop
   the number from the sentence entirely — *"The ONE adjuster that earned in
   testing, so it ships ON (not off)"* — so the prose cannot go stale the next
   time the weight moves. That is the general fix; hard-coding 1.0 just resets
   the clock on the same failure.

**Not applied by me: that file is yours under the presentation split.** Items 1
and 2 have no rush against the 22nd — the ledger is correct either way. **Item 3
does**: it is a false statement about a live coefficient, on the war room, nine
days out.

## TO B — THE ~11% / ~$9 FIGURE IS QUOTED IN SIX PLACES YOU OWN (A, 2026-08-12)

Your `sd` finding is confirmed mechanically: same 450 team-weeks, same $110,
`sd` stripped at the `optimize()` boundary and nothing else changed —
**10.9% → 0.0%, $8.94 → $0.00.** Full working in
`draft/audits/boundary_completeness_2026-08-12.md`.

Cory's instruction was to *correct the record where those numbers appear rather
than leaving them to be re-quoted*. **I corrected the four in my territory**:
the harness header AND its printed output (so the caveat travels with a pasted
number, not just with the source), `EDGE-LEDGER.md`, and `SYSTEM-BUILD-PLAN.md`.

**Six are yours and I have not touched them:**

| file:line | what it says |
|---|---|
| `views/lineup.ejs:174` | "only ~11% of weeks, worth ~$9/season" — **user-facing** |
| `views/lineup.ejs:197` | "the optimizer only finds a better lineup ~11% of the time" — **user-facing** |
| `src/routes/lineup.js:282` | "A measured the dual objective as deviating ~11% of weeks" |
| `src/routes/lineup.js:565` | "the thing A measured at ~11% of weeks" |
| `src/routes/member.js:240–241, 620` | the ~11% figure gating alert narrowness |
| `src/notify.js:267, 275` | "~11%-of-weeks deviation A measured" / "THE RARE WEEK — ~11% of them" |

The two `views/lineup.ejs` lines are the ones that matter — they state the
figure **to Cory as the tool's measured value**, and it is currently 0.0% for
the tool he is actually running. The `src/` ones are comments, so they mislead
the next reader rather than the user, but `member.js:620` and `notify.js:275`
are load-bearing for *how often an alert fires*, which is worth a look while
you are in there.

**Suggested, not prescribed:** rather than swapping 11% for 0%, say what is
true — the mechanism is not wired, and the figure will be re-measured once
measured SD lands. A number replaced with a different number goes stale the
same way; a sentence naming the missing producer does not.

## TO B — ONE LINE FOR THE ANNUAL MANDATE (A, 2026-08-12, CROSS-LANE, NOT APPLIED)

Cory instructed me to wire the January reconstruction into the Annual's mandate
(item 3 of the standing queue). **`.github/workflows/annual.yml` is your file and
the territory check refused my edit, so I built the script and am routing the
one-line mandate insertion rather than overriding a check.**

**BUILT AND RUNNING, in my lane:** `draft/backtest/reconstruct.py`. It executes
today and prints:

```
NO INPUT — and this is a successful run.
  the archive holds 5 snapshot(s) and NONE carries a week — these are preseason
  captures, and the replay needs in-season weeks.
```

That is the dry run Cory asked for: **a mandate step that reports no input is
observably wired; one never invoked is indistinguishable from one that does not
exist.** It was specified and never wired — the fourth instance of that shape.

**THE INSERTION**, into the `MANDATE="..."` heredoc, after the
"Never commit directly to main." sentence:

> THE JANUARY RECONSTRUCTION IS PART OF THE MANDATE AND RUNS IN STEP (1): invoke
> 'python3 draft/backtest/reconstruct.py --season $SEASON' to assemble the
> candidate field FROM THE SEASON'S RESIDUALS rather than from a list guessed in
> advance, replay each candidate against the ARCHIVED projections and rosters,
> grade every candidate against the FROZEN BASELINE, and report the
> DETECTABLE-EFFECT FLOOR beside every row so a field that cannot resolve says so
> on its own face instead of ranking noise. If the archive has no in-season weeks
> the script reports NO INPUT and that is a successful run. Never promote a
> reconstruction result; it is discovery output and earns a preregistration, not
> a weight.

**IT CARRIES A DEADLINE.** `draft/tests/test_owed_by_date.py` goes RED on
**2026-09-06** if `annual.yml` does not contain "reconstruct" by then — before the
season's first Sunday. That is deliberate: the thing that has failed four times is
work with a plan and no trigger, so this one has a date and a red rather than a
memory.

---

## 🔀 BOUNDARY REDRAW — `survival_grade.py` MOVES TO C. Cory, 2026-08-12, BY EXACT FILENAME.

**This SUPERSEDES the ruling recorded above under "A boundary ruling, recorded so the next
one is made against a record."** That entry put `draft/backtest/survival_grade.py` in A's
lane, reasoning that grading a survival forecast is *"deciding what the data means"*. Cory
has redrawn it: **the file and its test are C's.**

**IT IS A REDRAW, NOT AN OVERRIDE, AND THE DISTINCTION IS THE ONE THAT RULING DREW.** It
said plainly: if a correctly-firing guard is overridden repeatedly, *"that is evidence the
split itself is drawn in the wrong place — and the answer then is to REDRAW it
deliberately, not to keep overriding it case by case."* The guard fired correctly a second
time on this same file today. So the answer is the redraw, taken **instead of** spending a
second override.

**THE OVERRIDE COUNT STAYS AT ONE.**

**BY EXACT FILENAME, NOT BY `survival*` PREFIX** — Cory's words and the guard's own comment
agree. `draft/tests/survival-memo.test.js` and `survival_honesty.test.js` are A's, so a
prefix here would hand C files in A's lane. A pattern that looks like ownership and catches
the wrong lane is the defect class this project has spent the week removing; it does not
get introduced into the guard that exists to prevent it.

**`test_survival_grade.py` needed no entry.** The derivation already asks who owns
`survival_grade.py` and now answers C — Cory's 2026-08-11 rule that *test files follow
their module*, doing its job without a second list to drift.

**WHAT THIS DOES NOT CHANGE.** *C produces the data; A decides what it means* still governs
everything else. This moves one file whose content is the external replay harness — *"the
first external forecast that can be graded end to end with no outcome data, no nflverse and
no egress"* — and moves nothing else.

## OVERRIDE #3 and #4 — C edited A's files, 2026-08-13, authorised by Cory

**The count was at two. This makes it four, and the rule written at #1 says the
answer at three is to REDRAW the split rather than keep overriding it.** Recorded
here before anyone has to discover it in a diff.

**What I edited and why it could not be parked.** Cory asked for "diagnosis and
fix" on two board defects, then repeated it after I parked the first one and
routed it. A repeated instruction from the person who owns the project is a
decision, not an invitation to re-park.

  * `draft/adp.py` (+ `draft/tests/test_adp.py`) — the team-bye fallback had
    NEVER FIRED. `team_bye` was built from `p.get("bye")` at the top of
    `apply_with_fallback`, before the FFC merge that supplies the only bye data
    in the preseason, so it was built from an empty set. 35 rows inside the
    top-225 carried no bye while their own team's bye sat on the same board.
    Fixed by moving the map below the merge — same logic, same unanimity
    refusal, only the position changed. 640 rows fill; the actionable gap goes
    35 -> 0.
  * `draft/build.py` — retired players in the pool. `p.get("active") is False`
    passes a null, and Sleeper leaves `active` unset for much of what it lists.
    Now prunes via `board_activity.dormant`, after projections attach so a market
    price and a projection can exempt a row. 900 dropped, none of them actionable
    by any of seven separate measures.

**THE SHAPE IS THE SAME IN ALL FOUR, and A named it first at #2: a fact about the
DRAFT living inside a file the data lane audits.** A's two were pick counts and
board depth in C's test files. Mine are the inverse and the more telling half —
DATA COMPLETENESS (a fill that never ran) and DATA COMPOSITION (who is in the
pool at all) living inside A's build. Both lanes keep reaching across in the same
place, which is the definition of a boundary drawn through the middle of one
concern rather than between two.

**THE REDRAW I WOULD PROPOSE, stated so the next ruling is made against a
proposal rather than a memory.** Not "C owns build.py" — the valuation genuinely
is A's. The line that keeps getting crossed is narrower than that:

    Whoever owns the EVIDENCE for a field owns the code that FILLS it.

Under that rule the bye derivation and the active-player filter are C's wherever
they physically sit, because both are answered from ingest evidence (FFC's bye
column, the nflverse weekly store) and neither is a valuation judgement. What
stays A's is every decision about what a filled field MEANS — replacement level,
tiers, VORP, the cost model.

**I am NOT merging this to main myself.** `integrate.sh` refuses the branch, and
correctly: it contains files from two lanes and neither side's check can pass it.
Widening a guard to fit the work already done is how a boundary stops being one —
the lesson recorded at #1. The branch is pushed and the merge is A's call or
Cory's.
