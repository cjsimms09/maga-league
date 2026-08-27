#!/bin/bash
# SessionStart hook — make a freshly-created remote container usable again.
#
# ── WHY THIS EXISTS (register 379) ─────────────────────────────────────────
#
# Claude Code on the web runs in a container that is RECLAIMED after a period
# of inactivity and recreated from a snapshot. On 2026-08-27 that happened
# three times in one session. Diagnosed rather than guessed:
#
#   · /proc/uptime read 1.4 minutes  — the container was newly booted;
#   · HEAD landed on the SAME commit every time (fb01d7d8) — restored from a
#     fixed snapshot, not a partial revert;
#   · every `pip install` was gone — the whole filesystem was restored, so
#     eight test failures reappeared as ModuleNotFoundError;
#   · `origin/main` had rolled back TOO, so `git rev-list HEAD..origin/main`
#     answered 0 — "up to date" — while the real remote was 33 commits ahead.
#
# That last one is the dangerous half. A stale remote-tracking ref makes the
# standard staleness check LIE in the reassuring direction, and it cost a false
# "my work has been lost" alarm before the remote was checked directly.
#
# Nothing here prevents reclamation — that is the platform working as
# documented. This makes RECOVERY automatic, so a new container starts level.
set -euo pipefail

# Web only. A local checkout is not snapshot-restored and does not need this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
echo "── session-start: restoring a fresh container ──"

# ── 1. GIT: fetch FIRST, always ────────────────────────────────────────────
# The fetch is the load-bearing step even when nothing else happens: without
# it every "am I current?" check reads a rolled-back tracking ref and answers
# yes. Everything below is deliberately refusing rather than clever — this
# hook must never be able to discard work.
if git rev-parse --git-dir >/dev/null 2>&1; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
  if git fetch --quiet origin "$branch" 2>/dev/null; then
    behind="$(git rev-list --count "HEAD..origin/$branch" 2>/dev/null || echo 0)"
    ahead="$(git rev-list --count "origin/$branch..HEAD" 2>/dev/null || echo 0)"
    dirty="$(git status --porcelain 2>/dev/null | head -1)"

    if [ -n "$dirty" ]; then
      echo "  git: $behind behind / $ahead ahead, but the tree is DIRTY — not touching it."
      echo "       (uncommitted work is yours to resolve; this hook never discards)"
    elif [ "$ahead" != "0" ]; then
      echo "  git: $ahead local commit(s) not on origin/$branch — NOT fast-forwarding."
      echo "       (that is real work; push or rebase it deliberately)"
    elif [ "$behind" != "0" ]; then
      git merge --ff-only "origin/$branch" >/dev/null 2>&1 \
        && echo "  git: fast-forwarded $behind commit(s) to origin/$branch" \
        || echo "  git: ff-only merge REFUSED — resolve by hand before trusting this tree"
    else
      echo "  git: already at origin/$branch"
    fi
  else
    echo "  git: fetch failed — treat HEAD as UNVERIFIED, it may be a stale snapshot"
  fi
fi

# ── 2. PYTHON: the deps the snapshot loses ─────────────────────────────────
# draft/requirements.txt is the same file ci.yml installs, so the container
# matches CI rather than a second hand-maintained list. pyyaml matches ci.yml's
# separate install. Idempotent: pip no-ops when a package is already present,
# which is what makes the post-hook container cache worth having.
if [ -f draft/requirements.txt ]; then
  echo "  pip: installing draft/requirements.txt + pyyaml"
  pip install --quiet --disable-pip-version-check -r draft/requirements.txt pyyaml 2>&1 \
    | grep -v 'Running pip as the .root. user' || true
fi

# ── 3. NODE: usually already in the snapshot, cheap to confirm ─────────────
if [ -f package.json ] && [ ! -d node_modules ]; then
  echo "  npm: node_modules missing — installing"
  npm install --silent --no-audit --no-fund || echo "  npm: install failed (JS suites will not run)"
fi

# ── 4. SAY WHAT THE MACHINE IS ─────────────────────────────────────────────
# So a red suite can be read as CODE or as MACHINE without spending an hour
# on it first — the failure this session actually had (register 378).
if [ -f draft/tools/check_python_env.py ]; then
  python3 draft/tools/check_python_env.py 2>/dev/null | sed 's/^/  /' || true
fi
echo "── session-start: done ──"
