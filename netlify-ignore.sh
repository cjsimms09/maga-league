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
# ── THE POLICY ──
# Default is SKIP. A build happens only on EXPLICIT INTENT:
#
#   1. the commit message contains [deploy]            -> BUILD
#   2. the commit is tagged (refs/tags/...)            -> BUILD
#   3. a manual/API deploy trigger                     -> BUILD
#      (Netlify sets INCOMING_HOOK_TITLE for hook builds; manual "Trigger
#       deploy" from the UI sets no CACHED_COMMIT_REF on first run, which we
#       treat as build-anyway rather than risk never deploying.)
#
# Everything else — specs, docs, Lab code, CI-only work, tests, bot artifact
# pushes — skips. Ten commits become one build, by default rather than by
# anyone remembering.
#
# ── THE FAILURE MODE THIS CREATES, AND ITS ALARM ──
# The risk of a default-skip policy is a SILENTLY STALE SITE: someone forgets
# [deploy] and production drifts behind main without anyone noticing. That is
# why `site-check.yml` compares the deployed commit against main HEAD and
# alerts on drift. Do not remove that check while this gate is in place — the
# gate and the drift alarm are one mechanism in two files.

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

# --- 1. [deploy] in the commit message ---------------------------------------
# Read the message for the commit being built, not for HEAD of the working
# tree, so a batched deploy marker on the tip commit is what counts.
REF="${COMMIT_REF:-HEAD}"
MSG="$(git log -1 --pretty=%B "$REF" 2>/dev/null || echo '')"

if printf '%s' "$MSG" | grep -qiE '\[deploy\]'; then
  log "commit message carries [deploy] — BUILDING"
  exit 1
fi

# NETLIFY-ONLY MARKERS. `[skip ci]` is DELIBERATELY ABSENT.
#
# It was here, and it caused a real outage of our own making: `[skip ci]` is a
# GITHUB ACTIONS convention, not a Netlify one, and GitHub honours it on the
# head commit by skipping EVERY workflow for that push. Two commits carrying it
# (7858343, 41ca3d7) therefore skipped CI, the test suites, and the Lab —
# silently, while the commit messages claimed the suites were green locally.
#
# The two budgets are unrelated: Netlify build minutes are the scarce resource;
# GitHub Actions is free and does not compete with it. Coupling them was a
# category error. Deploys are gated here; CI and the Lab must ALWAYS run.
if printf '%s' "$MSG" | grep -qiE '\[skip netlify\]|\[netlify skip\]'; then
  log "commit message carries an explicit Netlify skip — SKIPPING"
  exit 0
fi

log "no explicit deploy intent — SKIPPING (add [deploy] to the tip commit to ship)"
exit 0
