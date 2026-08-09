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
  log "range touches ${n} served file(s) — BUILDING (opt-out: served changes auto-deploy)"
  exit 1
fi

log "range touches no served files (docs/Lab/reports/CI only) — SKIPPING (add [skip deploy] is unnecessary)"
exit 0
