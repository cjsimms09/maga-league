#!/usr/bin/env bash
# DEPLOY GATE — decides whether a push becomes a Netlify build.
#
# WHY THIS EXISTS. Every push to main was auto-deploying. Between Aug 1 and
# Aug 8 that was 349 builds, accelerating 31 -> 124 -> 194 per day, and it
# consumed 75% of August's build minutes. Running out suspends the site until
# Sept 1 — which would take the WAR ROOM DOWN ON DRAFT DAY (Aug 22). The
# commit discipline stays (commit at every boundary, nothing gets stranded);
# what stops is treating every commit as a release.
#
# ── THE EXIT-CODE CONTRACT (easy to get backwards, so it is stated once) ──
#   exit 0  -> Netlify SKIPS the build   ("yes, ignore this commit")
#   exit 1  -> Netlify RUNS the build
# Getting this inverted fails silently in one of two ways: never deploying, or
# deploying every time. `netlify-ignore.test.sh` asserts both directions.
#
# ── THE POLICY (OPT-OUT, since 2026-08-09) ──
# A build happens by DEFAULT when main changes in a way a visitor would see. It
# SKIPS only for changes a visitor would not (docs, Lab, reports, CI) or an
# explicit suppress marker. This inverts the old opt-in [deploy] gate, which
# raced three times: reading the marker on the TIP only meant whoever pushed
# last silently decided whether anything shipped, and a buried marker never built.
#
#   * manual/API hook (INCOMING_HOOK_TITLE)            -> BUILD
#   * tagged commit                                    -> BUILD
#   * [skip deploy] / [skip netlify] on the tip        -> SKIP  (the only marker now)
#   * [deploy] ANYWHERE in CACHED..COMMIT range        -> BUILD (force; race-immune)
#   * the range touches a SERVED file                  -> BUILD (opt-out default)
#   * the range is all non-served (docs/Lab/CI)        -> SKIP  (budget batching)
#
# Reading the RANGE since the last successful build (CACHED_COMMIT_REF..COMMIT_REF),
# not the tip, is what kills the race: a served change (or a [deploy]) under a
# later doc/Lab commit still ships. The budget is still protected because the
# high-frequency noise — Lab reports, docs, STATUS/PARKED, CI edits — touches no
# served files and skips. (Reserve [skip deploy] for a served change you explicitly
# do NOT want live yet.) The 194-builds/day crisis was auto-deploying on EVERY
# push including bot artifact spam; scoping to served files removes that without
# reintroducing silent stranding.
#
# ── ALARM (unchanged) ── `site-check.yml` + the Sunday self-audit compare the
# deployed commit against main HEAD and report "prod is N commits behind"; the
# audit HARD-fails when a stranded release includes served files. The gate and the
# drift alarm are one mechanism across files — do not remove either.

set -uo pipefail

log() { echo "[deploy-gate] $*"; }

# --- 3. explicit manual / hook trigger ---------------------------------------
if [ -n "${INCOMING_HOOK_TITLE:-}" ]; then
  log "build hook '${INCOMING_HOOK_TITLE}' — explicit trigger, BUILDING"
  exit 1
fi

# --- 2. tagged commit ---------------------------------------------------------
# Netlify exposes the branch; a tag build arrives with BRANCH set to the tag.
if [ -n "${COMMIT_REF:-}" ] && git describe --exact-match --tags "${COMMIT_REF}" >/dev/null 2>&1; then
  log "commit ${COMMIT_REF:0:8} is tagged — BUILDING"
  exit 1
fi

# ── THE POLICY IS NOW OPT-OUT (2026-08-09) — forgetting a marker can no longer
#    silently strand work. The old opt-in [deploy]-on-the-TIP gate raced three
#    times: two sessions push to main, the tip is whoever pushed last, and a
#    buried [deploy] never built. Opt-out over the RANGE since the last build kills
#    both failure modes at once.
#
#    A build happens when the commits SINCE THE LAST SUCCESSFUL BUILD
#    (CACHED_COMMIT_REF..COMMIT_REF) either touch a SERVED file or carry [deploy]
#    anywhere in the range. It SKIPS only when the range is all non-served (docs,
#    Lab code, reports, CI, STATUS/PARKED — the 194-builds/day noise) or an
#    explicit [skip deploy] is on the tip. Reading the RANGE, not the tip, is what
#    makes a buried marker (or a served change under a later doc commit) still ship.
REF="${COMMIT_REF:-HEAD}"
MSG="$(git log -1 --pretty=%B "$REF" 2>/dev/null || echo '')"

# Explicit suppress wins (the ONLY marker now — opt-out, not opt-in). `[skip ci]`
# stays DELIBERATELY ABSENT: it is a GitHub Actions convention that once skipped
# our whole CI+Lab silently (commits 7858343, 41ca3d7). Netlify minutes and Actions
# minutes are unrelated budgets; never couple them.
if printf '%s' "$MSG" | grep -qiE '\[skip deploy\]|\[skip netlify\]|\[netlify skip\]'; then
  log "tip carries an explicit skip marker — SKIPPING"
  exit 0
fi

# The range since the last successful build. On the first build CACHED is empty —
# build (never risk never-deploying). If the diff can't be computed (force-push,
# unrelated history), build rather than silently skip.
RANGE_FILES=""
if [ -n "${CACHED_COMMIT_REF:-}" ] && [ -n "${COMMIT_REF:-}" ]; then
  RANGE_FILES="$(git diff --name-only "${CACHED_COMMIT_REF}" "${COMMIT_REF}" 2>/dev/null)" || {
    log "cannot diff ${CACHED_COMMIT_REF:0:8}..${COMMIT_REF:0:8} — BUILDING (conservative)"; exit 1; }
  RANGE_MSGS="$(git log --pretty=%B "${CACHED_COMMIT_REF}..${COMMIT_REF}" 2>/dev/null || echo '')"
else
  log "no CACHED_COMMIT_REF (first build or unknown) — BUILDING"
  exit 1
fi

# [deploy] ANYWHERE in the range forces a build (backward-compat + race-immunity:
# a buried marker still counts because we scan the whole range, not just the tip).
if printf '%s' "${RANGE_MSGS:-$MSG}" | grep -qiE '\[deploy\]'; then
  log "[deploy] present in range ${CACHED_COMMIT_REF:0:8}..${COMMIT_REF:0:8} — BUILDING"
  exit 1
fi

# SERVED files: anything that changes what a visitor's browser receives. Non-served
# (draft/ Lab, docs/, scripts/, .github/, root *.md like STATUS/PARKED, *.json Lab
# reports) does NOT rebuild the site — that is the batching that protects the budget.
if printf '%s' "$RANGE_FILES" | grep -qE '^(views/|public/|src/|server-app\.js|package(-lock)?\.json|netlify\.toml|netlify/functions/)'; then
  n="$(printf '%s' "$RANGE_FILES" | grep -cE '^(views/|public/|src/|server-app\.js|package(-lock)?\.json|netlify\.toml|netlify/functions/)')"

  # ── CORY'S CADENCE RULING, 2026-08-24 ──────────────────────────────────────
  # "I want things updated but we shouldn't deploy 100x a day, 2-3xs a day is
  # enough."
  #
  # MEASURED THE SAME HOUR, because "100x" deserved a number rather than
  # agreement: 170 commits landed on main in 24 hours; the served-file gate
  # above already suppressed 143 of them, and 27 would have built. So the gate
  # is working — 84% suppressed — and 27/day is still ten times what he asked
  # for. The remaining volume is not bot noise; it is real product commits
  # (bet edit, Venmo prefill, phone nav, the waivers page), each individually
  # worth shipping and collectively far too frequent.
  #
  # A TIME WINDOW, NOT A RETURN TO OPT-IN. The gate's own header records why
  # opt-in was abandoned: it "raced three times: reading the marker on the TIP
  # only meant whoever pushed last silently decided whether anything shipped,
  # and a buried marker never built." Batching by TIME keeps the opt-out
  # property — every served change still ships, and nothing needs a marker —
  # while capping how often. A change made inside the window is not dropped; it
  # rides the next build, together with everything else queued behind it.
  #
  # THREE ESCAPE HATCHES, all pre-existing and all still ahead of this check:
  # a build hook, a tag, and [deploy] anywhere in the range — so anything
  # urgent ships immediately by saying so.
  #
  # VISIBILITY IS ALREADY BUILT: site-check.yml and the Sunday self-audit
  # compare the deployed commit against main HEAD and report "prod is N commits
  # behind", hard-failing when a stranded release includes served files. That
  # alarm is what makes a delay safe to have; without it this would be silent
  # stranding, which is the failure the opt-in gate had.
  WINDOW_HOURS="${DEPLOY_WINDOW_HOURS:-8}"   # 8h => at most 3 builds/day
  last_ts="$(git show -s --format=%ct "${CACHED_COMMIT_REF}" 2>/dev/null || true)"
  now_ts="$(date +%s 2>/dev/null || true)"
  if [ -n "$last_ts" ] && [ -n "$now_ts" ] && [ "$WINDOW_HOURS" -gt 0 ] 2>/dev/null; then
    age_h=$(( (now_ts - last_ts) / 3600 ))
    if [ "$age_h" -lt "$WINDOW_HOURS" ]; then
      log "range touches ${n} served file(s), but the last deploy was ${age_h}h ago"
      log "and the window is ${WINDOW_HOURS}h (Cory's 2-3x/day ruling, 2026-08-24)"
      log "— SKIPPING. Nothing is lost: this change ships with the next build."
      log "  Force it now with [deploy] in a commit message, a tag, or a build hook."
      exit 0
    fi
    log "range touches ${n} served file(s) and the last deploy was ${age_h}h ago"
    log "(window ${WINDOW_HOURS}h) — BUILDING"
    exit 1
  fi
  # Could not establish when the last build was — BUILD, same conservative
  # direction as the un-diffable case above. A cadence cap must never become a
  # reason the site silently stops updating.
  log "range touches ${n} served file(s); last-deploy time unavailable — BUILDING (conservative)"
  exit 1
fi

log "range touches no served files (docs/Lab/reports/CI only) — SKIPPING (add [skip deploy] is unnecessary)"
exit 0
