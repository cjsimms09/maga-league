#!/usr/bin/env bash
# RUN WHAT CI RUNS ON THE JS SIDE — derived from ci.yml, not transcribed.
#
# ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
#
# For a full session I verified with `for f in draft/tests/*.test.js; do node $f;
# done` and reported "JS red: 0" after every change. That was TRUE of the files
# it ran and FALSE of the checks CI runs: `ci.yml` invokes the same glob AND a
# separate step for `draft/tests/robot-mock.js`, which does not match `*.test.js`.
#
# `robot-mock` was RED on every single CI run for the whole session — on an
# assertion my own `computePaths` change had invalidated — and my sweep could not
# see it. I reported "the only failure is h2h_agreement" to Cory more than once,
# from a signal that structurally could not have shown me the second one.
#
# THE SAME DEFECT THIS REPOSITORY KEEPS FINDING: one name ("the JS suites"), two
# quantities (the files I globbed / the checks CI runs). It found me in my own
# verification, which is the only place it had left to hide.
#
# ── WHY IT PARSES ci.yml INSTEAD OF LISTING THE FILES ───────────────────────
#
# A hand-maintained list here would drift from ci.yml the first time CI gained a
# step — which is exactly how the hole appeared. ci.yml's own JS step already
# refuses to enumerate ("GLOB, don't enumerate. A hand-maintained list is how 23
# suites ended up existing but never running"). This applies the same rule one
# level up: the ENTRY POINTS are read out of the workflow, so a new `node
# draft/tests/...` step is picked up the day it lands.
#
# Usage:  bash scripts/js-sweep.sh [--quiet]
# Exit:   0 all green · 1 something failed · 2 could not read ci.yml
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CI="$ROOT/.github/workflows/ci.yml"
QUIET=""
[ "${1:-}" = "--quiet" ] && QUIET=1

[ -r "$CI" ] || { echo "REFUSING: cannot read $CI — a sweep that cannot see what CI"
                  echo "runs is the exact blindness this script exists to remove."; exit 2; }

# ── THE GLOBBED SUITES (ci.yml's "JS suites" step) ──────────────────────────
suites=()
for f in "$ROOT"/draft/tests/*.test.js; do [ -e "$f" ] && suites+=("$f"); done

# ── EVERY OTHER `node draft/tests/<x>.js` ci.yml INVOKES ────────────────────
# Read from the workflow so this cannot drift from it. The glob above already
# covers *.test.js, so anything else named here is an extra entry point.
extras=()
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  case "$rel" in *.test.js) continue ;; esac        # already in the glob
  [ -e "$ROOT/$rel" ] && extras+=("$ROOT/$rel")
done < <(grep -oE 'node +draft/tests/[A-Za-z0-9_.-]+\.js' "$CI" \
         | sed 's/^node  *//' | sort -u)

if [ "${#suites[@]}" -eq 0 ]; then
  echo "REFUSING: matched ZERO suites. A sweep that runs nothing reports green,"
  echo "which is worse than reporting red."; exit 2
fi
# NON-VACUITY ON THE DERIVATION ITSELF. If the parse silently matched nothing,
# this script would quietly become the old broken sweep again — green, and blind
# to precisely the step it was written to catch.
if [ "${#extras[@]}" -eq 0 ]; then
  echo "REFUSING: parsed ZERO extra entry points out of ci.yml. That is how this"
  echo "hole opened — robot-mock.js is invoked by its own step and does not match"
  echo "*.test.js. Either ci.yml changed shape or the parse broke; check before"
  echo "trusting a green from this script."; exit 2
fi

failed=""
for f in "${suites[@]}" "${extras[@]}"; do
  name="$(basename "$f")"
  [ -n "$QUIET" ] || echo "== $name =="
  if ! out="$(node "$f" 2>&1)"; then
    failed="$failed $name"
    echo "RED: $name"
    echo "$out" | grep -E '^FAIL' | head -4
  fi
done

total=$(( ${#suites[@]} + ${#extras[@]} ))
echo
echo "js-sweep: $total JS entry points ( ${#suites[@]} globbed + ${#extras[@]} from ci.yml: $(for e in "${extras[@]}"; do basename "$e"; done | tr '\n' ' '))"
if [ -n "$failed" ]; then
  echo "RED:$failed"
  exit 1
fi
echo "all green"
