#!/usr/bin/env bash
# RUN EVERY JS SUITE AND REPORT WHAT IS ACTUALLY RED.
#
# Written because the ad-hoc version of this was got wrong FOUR TIMES in one day,
# each time producing a confident "green" that was a statement about the scanner:
#
#   1. `grep '^FAIL'`            — missed every suite that indents its failures.
#   2. `grep -iE 'FAIL'`         — matched "FAIL CLOSED" inside PASS lines, so
#                                  four healthy suites were reported red.
#   3. FAIL lines only           — a suite that CRASHES on load prints no FAIL
#                                  line at all and scored GREEN. Verified: break
#                                  live_context.js and the suite dies with a
#                                  stack trace and zero FAIL lines.
#   4. `cmd | tail` for the code — the pipe returns tail's exit status, so a
#                                  non-zero suite read as 0.
#
# THREE INDEPENDENT SIGNALS, because each one alone has a blind spot:
#   FAIL lines   catch assertion failures in suites that exit 0 anyway (several do)
#   exit code    catches suites that report properly and exit non-zero
#   stack trace  catches suites that never reach their own reporting at all
#
# Usage: bash draft/tools/suite_scan.sh [dir]   (default draft/tests)
set -uo pipefail
DIR="${1:-draft/tests}"
red=0 total=0
for f in "$DIR"/*.test.js; do
  [ -e "$f" ] || continue
  total=$((total + 1))
  out=$(timeout 300 node "$f" 2>&1); rc=$?
  fails=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]]' || true)
  crash=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]+at .*\(node:internal|^[A-Za-z]*Error:' || true)
  if [ "$fails" != "0" ] || [ "$rc" != "0" ] || [ "$crash" != "0" ]; then
    red=$((red + 1))
    echo "RED  $f   (fail-lines=$fails exit=$rc crash-lines=$crash)"
  fi
done
echo "scanned $total suites, $red red"
[ "$red" = "0" ] || exit 1
