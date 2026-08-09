# PARALLEL SESSIONS — the ownership split

_Answered 2026-08-08 with evidence, not assertion._

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
