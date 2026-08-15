# DEPLOY POLICY — commits are free, deploys are not

_Effective 2026-08-08. Enforced by `netlify-ignore.sh`, alarmed by
`site-check.yml` + `draft/tools/deploy_drift.py`._

> 🚨 **CORRECTION, 2026-08-15 (Cory research relay) — THE MECHANISM BELOW IS
> STALE AND DESCRIBES THE OPPOSITE OF WHAT'S ACTUALLY ENFORCED.** This doc says
> deploys are opt-in (`[deploy]` in the tip commit). `netlify-ignore.sh` itself
> says it flipped to **opt-out on 2026-08-09** — a build happens BY DEFAULT
> when a served path changes (`public/`, `views/`, `src/`, `server-app.js`,
> `package.json`, `netlify.toml`, `netlify/functions/`); `[skip deploy]` /
> `[skip netlify]` is now the ONLY way to suppress one. This doc is one day
> older than that flip and was never updated.
>
> **This was not caught in time.** A served-file commit pushed to `main`
> earlier today (`b6ea669e`, the doctrine-governance pill fix) and another
> (`f235ad0d`, the own-model consensus.js wiring) each triggered a REAL
> Netlify deploy — confirmed directly from `deploy-verify.yml`'s own log, not
> inferred: `"range touches 1 served file(s) — BUILDING"`, followed by the
> live `build-stamp.json` actually advancing to the new commit. Nobody
> intended either deploy; both happened because this document said the
> opposite of what the enforced gate does.
>
> **Read `netlify-ignore.sh` directly for the real rule, not this section,
> until it's rewritten properly.** The one-line version: any served-path
> change auto-deploys unless the tip commit carries `[skip deploy]`.

## ⚠️ THE SECTION BELOW ("How to deploy") IS THE STALE OPT-IN DESCRIPTION — DO NOT FOLLOW IT AS WRITTEN. See the correction above.

## The numbers that caused this

| measurement | value |
|---|---|
| build-triggering pushes to `main`, Aug 1–8 | **349** |
| daily trend | 31 → 124 → **194** (Aug 6 / 7 / 8) |
| August allowance consumed | **75%** |
| implied cost per build | **~0.64 min** |
| Netlify build command | `echo 'no build step'` — a file copy |

Running out **suspends the site until Sept 1**, which would take the war room
down on **draft day, Aug 22**.

There is no expensive work inside the Netlify build to move to GitHub Actions:
the 1.25MB draft board is *committed*, not generated at deploy. **The burn was
never per-build cost. It was build count.** So the fix is not to make builds
cheaper; it is to stop making so many.

## The budget

| | |
|---|---|
| remaining | **75 min** (25% of 300) |
| **draft-week reserve (Aug 20–22)** | **15 builds ≈ 9.6 min — UNTOUCHABLE** |
| spendable now | 65.4 min ≈ **102 builds** |
| through Aug 19 (12 days) | **~8.5 builds/day** |

The reserve is subtracted **before** the daily rate is computed, so ordinary
work cannot drift into it a little each day. **If the reserve is ever at risk,
deploys stop entirely except for draft-critical fixes.**

Alerts: **85% → warn, 95% → critical.**

## The deploy-intent rule

**Default is SKIP. Deploying is the deliberate act.**

Deploy when Cory needs something live:

- ✅ mock-blocking fixes
- ✅ pre-mock war-room surface changes
- ✅ draft-week hotfixes
- ✅ anything he has asked to see live

Do **not** deploy for:

- ❌ spec and doc commits
- ❌ Lab code, backtests, experiments
- ❌ CI-only work and workflow edits
- ❌ tests

**Batch to roughly one deploy per work session** unless something is needed
live sooner.

### How to deploy

Put `[deploy]` in the **tip** commit message. That is the whole mechanism —
ten commits become one build because only the last one carries the marker.
Tags and manual/hook triggers also build.

`[skip ci]`, `[skip netlify]` and `[netlify skip]` are honoured explicitly.

## The alarm that makes default-skip safe

Default-skip **inverts the failure mode**: instead of burning minutes, the risk
becomes *rehearsing a mock on a stale site while the repo is already fixed*.
That would be worse than the problem being solved.

So the build writes `public/build-stamp.json` naming the deployed commit, and
`site-check` compares it to `main`. **The threshold is what changed, not how
many commits** — counting is the wrong instrument:

| undeployed drift | verdict |
|---|---|
| anything under `public/js/draft/` or `draft_data.json` | 🔴 **RED** — the war room being rehearsed on is not the war room in the repo |
| any other served path (`public/`, `views/`, `src/`, `netlify/`) | 🔴 **RED** |
| docs, Lab, CI, tests only | 🟢 OK — this is exactly what the gate is for |

Forty undeployed spec commits are fine. **One** undeployed draft-path file is
not. The rule lives in `draft/tools/deploy_drift.py` as pure functions and is
unit-tested — including the case of deliberately skipping a deploy and
confirming the alarm fires.

**The gate and the alarm are one mechanism in two files. Do not remove either
while the other is in place.**

## Checklist line

Add to the pre-mock and pre-draft checklists, and to the Sunday self-audit:

> **Build minutes:** `___%` used · `___` builds left · draft-week reserve
> **HELD / AT RISK** · live site **== main / RED drift**

---

## RECOMMENDATION (A, 2026-08-09) — keep [deploy] opt-in UNTIL the draft; make stranding LOUD

Cory asked whether to flip the deploy gate from opt-in (`[deploy]` triggers) to
opt-out (served-file changes auto-build, a marker only SKIPS). My recommendation, with
the budget math:

- **The danger of opt-in** is silent stranding — a forgotten (or buried) `[deploy]`
  leaves prod behind main invisibly. This has bitten us **twice**.
- **The danger of opt-out** is build-minute exhaustion. On Aug 8 we were at ~75% of
  August's minutes consumed (349 builds, accelerating to 194/day); running out
  **suspends the site until Sept 1 — which takes the WAR ROOM DOWN ON DRAFT DAY
  (Aug 22).** B is mid design-sweep, pushing served files frequently; auto-deploy on
  every served change could burn the remaining ~25% fast.

**RECOMMENDATION: keep `[deploy]` opt-in through Aug 22, but make stranding
impossible to miss instead of switching policies under budget pressure.** The fix for
"twice bitten" is VISIBILITY, not auto-build — the same principle as everywhere:
*committed ≠ merged ≠ deployed ≠ verified; each gap should be visible, not remembered.*
Done this session:
- The Sunday audit now reports **"prod is N commits behind main"** with a number and
  ESCALATES to HARD when the drift includes served-file changes (a stranded release),
  and no longer hard-fails on feature branches (that rule was wrong).
- The deploy-gate reads `[deploy]` from the **tip commit only**, so the tip must carry
  it — a merge for deploy uses `[deploy]` in the MERGE message (learned this session
  after `df19f98`'s marker was buried by later commits before Netlify read the tip).

**AFTER Aug 22:** revisit opt-out. Once draft-day risk is gone, auto-deploy on
served-file changes (with `[skip netlify]` to opt out, and lab/doc/report commits
naturally skipping because they touch no served files) is the better long-run policy —
it removes the human-memory dependency entirely. Flip it then, not now.
