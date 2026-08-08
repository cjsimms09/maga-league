# DEPLOY POLICY — commits are free, deploys are not

_Effective 2026-08-08. Enforced by `netlify-ignore.sh`, alarmed by
`site-check.yml` + `draft/tools/deploy_drift.py`._

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
