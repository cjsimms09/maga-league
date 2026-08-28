#!/bin/bash
# TERRITORY: A.  RUN WHAT CI RUNS — DERIVED FROM ci.yml, NEVER RETYPED.
#
# ── WHY THIS EXISTS (register 389) ─────────────────────────────────────────
#
# The single largest class of mistake in the 2026-08-27/28 session was not a
# bad fix or a bad premise. It was MEASURING WITH THE WRONG INSTRUMENT, eight
# times, and the most expensive instance is the one this tool removes:
#
#   I reported "the Python suite has 16 standing failures" and filed a register
#   row on it. CI does not run that command. CI runs
#   `-m "not repo_parity"`, which segregates the pins that are red by design.
#   Under CI's actual command the number was NINE — and then eight of those
#   turned out to be missing packages, leaving ONE. I had written 16 into a
#   register row and called the Python side ungated.
#
# The root cause is banal and permanent: the authoritative command lives in
# `ci.yml`, and anyone measuring locally retypes it from memory. A retyped
# command drifts silently and is wrong in the reassuring direction — it finds
# MORE failures, which reads as diligence.
#
# So this does not contain the commands. It EXTRACTS them from ci.yml at run
# time and shows you what it found before running anything. If CI's command
# changes, this changes with it; if the extraction breaks, it REFUSES rather
# than falling back to a guess, because a wrong instrument that looks right is
# the whole problem.
#
# Usage:  bash draft/tools/what_ci_runs.sh            # show, then run
#         bash draft/tools/what_ci_runs.sh --show     # show only
#         bash draft/tools/what_ci_runs.sh --self-test
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

CI=".github/workflows/ci.yml"

extract() {
  # The BLOCKING python gate: the pytest line that EXCLUDES repo_parity.
  # `python` and `python3` both appear in this repo's workflows; normalise.
  grep -oE '(python3?) -m pytest [^"]*"not repo_parity"' "$CI" \
    | head -1 | sed 's/^python /python3 /'
}

self_test() {
  local fails=0
  local cmd; cmd="$(extract)"
  # KNOWN-POSITIVE: the extraction must actually find something.
  if [ -z "$cmd" ]; then
    echo "FAIL  extraction found no blocking pytest command in $CI"; fails=$((fails+1))
  else
    echo "PASS  extraction finds the blocking pytest command"
  fi
  # It must carry the exclusion — that is the entire point of the tool.
  case "$cmd" in
    *'not repo_parity'*) echo "PASS  the extracted command carries -m \"not repo_parity\"";;
    *) echo "FAIL  extracted command lost the marker exclusion: $cmd"; fails=$((fails+1));;
  esac
  # KNOWN-NEGATIVE: extraction against a file with no such line returns empty,
  # so the refusal path below is reachable rather than theoretical.
  local tmp; tmp="$(mktemp)"; printf 'jobs:\n  x:\n    steps: []\n' > "$tmp"
  if [ -z "$(CI="$tmp" bash -c 'grep -oE "(python3?) -m pytest [^\"]*\"not repo_parity\"" "$0" | head -1' "$tmp")" ]; then
    echo "PASS  a workflow with no pytest line yields NOTHING, so the refusal is real"
  else
    echo "FAIL  extraction invented a command from an empty workflow"; fails=$((fails+1))
  fi
  rm -f "$tmp"
  echo ""
  [ "$fails" -eq 0 ] && echo "self-test: all passed" || echo "self-test: $fails FAILED"
  return "$fails"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
esac

if [ ! -f "$CI" ]; then
  echo "⛔ no $CI — cannot derive what CI runs, and will not guess." >&2
  exit 2
fi

PY_CMD="$(extract)"
if [ -z "$PY_CMD" ]; then
  echo "⛔ could not find the blocking pytest command in $CI." >&2
  echo "   REFUSING to fall back to a remembered command — a wrong instrument" >&2
  echo "   that looks right is exactly what this tool exists to prevent." >&2
  exit 2
fi

echo "── WHAT CI ACTUALLY RUNS (extracted from $CI, not retyped) ──"
echo
echo "  PYTHON (blocking gate):"
echo "    $PY_CMD"
echo
echo "  NOTE: the repo_parity pins run in a SEPARATE continue-on-error step."
echo "  They are red BY DESIGN against live repo/market state. Measuring"
echo "  without the exclusion inflates the failure count and reads as diligence."
echo
echo "  JS: every draft/tests/*.test.js via a glob, plus the red ratchet."
echo

[ "${1:-}" = "--show" ] && exit 0

echo "── running the Python blocking gate ──"
eval "$PY_CMD"
PY_STATUS=$?
echo
echo "  python blocking gate exit: $PY_STATUS"
exit "$PY_STATUS"
