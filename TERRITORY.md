# PARALLEL SESSIONS — the ownership split

_Answered 2026-08-08 with evidence, not assertion._

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
| **A — model** | `public/js/draft/**`, `draft/**` (Lab, backtest, tools, tests), `src/predledger.js`, `netlify.toml`, the doctrine/spec docs |
| **B — site** | `views/**` **except `views/admin/warroom.ejs`** (that file IS the draft surface — the split is by SUBSTANCE, not directory; found by the check failing on A's own legitimate work), `src/routes/**`, `public/css/**`, `public/icons/**`, `public/js/**` *except* `public/js/draft/**`, and the site-facing specs (history page, chronicle voice, contact directory) |

Verified: **no file under B's territory imports anything from `public/js/draft/`.**
That is what makes it clean.

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
