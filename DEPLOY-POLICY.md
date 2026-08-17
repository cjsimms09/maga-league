# DEPLOY POLICY — commits are free, deploys are deliberate, nothing strands

_Rewritten 2026-08-15 on Cory's ruling: **"I don't want excessive deploys but
don't want the project too far behind either!! Find the happy medium."**
This version describes the gate that is ACTUALLY ENFORCED (`netlify-ignore.sh`,
opt-out since 2026-08-09) — the previous version described the opt-in gate that
was retired that same day, and the mismatch caused both failure modes in one
week: two unintended deploys (2026-08-15 morning, confirmed from
deploy-verify's own logs) and then a blanket `[skip deploy]` freeze that
stranded every fix while STILL leaking deploys whenever an unmarked bot push
topped the branch. Policy and mechanism now say the same thing._

## THE MECHANISM (what `netlify-ignore.sh` enforces — the authority is that file)

| situation | result |
|---|---|
| range since last build touches a SERVED path (`public/`, `views/`, `src/`, `server-app.js`, `package*.json`, `netlify.toml`, `netlify/functions/`) | **BUILD** (opt-out default) |
| range is docs / Lab (`draft/`) / CI / reports / root `*.md` only | **SKIP** (this is the budget batching — most commits) |
| `[skip deploy]` / `[skip netlify]` on the **tip** commit | **SKIP** (the only suppressor; tip-only, so it delays to the next unmarked push rather than cancelling) |
| `[deploy]` anywhere in the range, a tag, or a manual hook | **BUILD** (force) |

## THE PRACTICE (the happy medium, effective 2026-08-15)

1. **The blanket `[skip deploy]` habit is RETIRED.** It fought the gate and
   delivered the worst of both worlds: fixes stranded between deploys that
   still leaked unpredictably (the skip marker is read from the TIP only, so
   any unmarked push — the nightly board bot included — shipped the entire
   accumulated range anyway).
2. **Served-path changes deploy when they land on `main`.** A merged fix goes
   live the same day it merges. Lab work, docs, data archives, CI — the great
   majority of commits — never build, by path, with no marker needed.
3. **`[skip deploy]` returns to its designed job**: a served change
   deliberately not ready for the live site. Rare, and the commit message must
   say why, so the next session doesn't cargo-cult it back into a blanket.
4. **Draft-week exception (Aug 20–22): the reserve is untouchable.** Only
   draft-critical served fixes deploy in that window; everything else carries
   `[skip deploy]` those three days and ships after the draft.
5. **Deploying is never assumed — every path is verified:**
   - human/session pushes → `deploy-verify.yml` polls the live build-stamp on
     every push to `main`;
   - the nightly board bot push → verified **in-run** by `draft-data.yml`'s
     own poll step (added 2026-08-15; GITHUB_TOKEN pushes trigger no
     workflows, so this was the one deploy nothing checked — draft morning's
     included);
   - drift → `site-check.yml` + the Sunday audit go **RED on ONE undeployed
     served file** (forty undeployed doc commits are fine; rule lives
     unit-tested in `draft/tools/deploy_drift.py`).
6. **Rollback** is `[deploy]` on the revert commit, or Netlify's UI restore.

## WHY THE BUDGET SURVIVES THIS

The August crisis (349 builds Aug 1–8, 75% of minutes, trend 31→124→194/day)
was auto-deploy on EVERY push, dominated by bot artifact spam — traffic that
now skips by path. Under this policy the expected build count is the nightly
board push (1/day, served) plus merged served fixes (~0–3/day in a heavy
week), an order of magnitude inside the ~8.5 builds/day the remaining
allowance supported as of 08-08, before the draft-week reserve (15 builds)
which is subtracted first and stays untouchable. The alarms are unchanged:
85% warn, 95% critical, and the Sunday checklist line still asks for the
numbers rather than assuming them.

## HISTORY (kept because each entry is a failure mode this policy now names)

- **2026-08-08**: opt-in `[deploy]` adopted after the build-minute crisis.
- **2026-08-09**: gate flipped to opt-out on served paths (A's doc
  recommendation said flip after Aug 22; the flip happened early and this doc
  was not updated — the root of everything below).
- **2026-08-15 morning**: two unintended deploys from served commits, because
  this doc still said opt-in.
- **2026-08-15 midday**: blanket `[skip deploy]` freeze ordered; every relay
  commit marked. The freeze leaked anyway (tip-only marker + unmarked bot
  pushes) — the macro audit found the live site current while the policy said
  frozen.
- **2026-08-15 evening**: this rewrite; policy = mechanism; bot deploy
  verified in-run; blanket marker retired.
