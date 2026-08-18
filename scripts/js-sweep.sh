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
infra=""
for f in "${suites[@]}" "${extras[@]}"; do
  name="$(basename "$f")"
  [ -n "$QUIET" ] || echo "== $name =="
  # `rc=$?` INSIDE `if ! out=$(...)` CAPTURES THE NEGATION, NOT NODE. My first
  # version did exactly that and reported a process that exited 137 as "exit 0",
  # which silently disabled the signal detection this block exists for — the
  # fail-arm probe caught it, which is the only reason it is not still there.
  out="$(node "$f" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    # ── A KILLED PROCESS IS NOT A FAILED ASSERTION, AND THIS REPORTED THEM
    #    IDENTICALLY (2026-08-14) ──────────────────────────────────────────
    #
    # Two suites went RED here on one run and green on the next, standalone exit
    # 0 both times — and NEITHER printed a `FAIL` line, so the grep below emitted
    # nothing and the report was a bare "RED: <name>" with no evidence. That is
    # the signature of a process that DIED (OOM, signal, resource limit under 239
    # sequential node starts), not of a test that ran and disagreed.
    #
    # Conflating them costs both ways: a real assertion failure looks like
    # infrastructure noise and gets re-run away, and a machine problem looks like
    # a code defect and gets debugged in the wrong file. I have been quoting
    # "239 green" as evidence all session; a sweep that cannot tell these apart
    # is weaker evidence than I was treating it as.
    #
    # Exit >128 is a signal (128+N). Exit 1 with no FAIL line is a throw before
    # the assertions ran. Both are reported as INFRA, distinctly.
    if echo "$out" | grep -qE '^FAIL'; then
      failed="$failed $name"
      echo "RED: $name"
      echo "$out" | grep -E '^FAIL' | head -4
    else
      infra="$infra $name"
      echo "INFRA: $name — exit $rc with no FAIL line ($(
        if [ "$rc" -gt 128 ]; then echo "signal $((rc - 128)) — killed, not failed";
        else echo "died before asserting"; fi))"
      echo "$out" | tail -3
    fi
  fi
done

total=$(( ${#suites[@]} + ${#extras[@]} ))
echo
echo "js-sweep: $total JS entry points ( ${#suites[@]} globbed + ${#extras[@]} from ci.yml: $(for e in "${extras[@]}"; do basename "$e"; done | tr '\n' ' '))"
if [ -n "$failed" ]; then
  echo "RED:$failed"
  [ -n "$infra" ] && echo "INFRA (died without asserting, NOT a code failure):$infra"
  exit 1
fi
if [ -n "$infra" ]; then
  # STILL EXIT NON-ZERO. A suite that died told us nothing, and "nothing" must
  # not read as "green" — that is the whole defect this split was written for.
  # It is reported SEPARATELY so the next reader debugs the machine rather than
  # the code, and re-running is a legitimate response here in a way it never is
  # for a real FAIL.
  echo "INFRA (died without asserting, NOT a code failure):$infra"
  echo "no assertion failed, but the sweep did not COVER those suites — re-run"
  exit 1
fi
echo "all green"
