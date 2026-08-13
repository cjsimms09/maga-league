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

# THE RECEIPT. scripts/scoring_path_gate.sh reads this to decide whether a
# scoring-path commit has actually been scanned. It records the DIGEST OF THE
# SCORING-PATH FILES AS THEY WERE WHEN THIS RAN, so a scan of a tree that has
# since been edited cannot be mistaken for evidence about the current one.
SCORING_FILES="public/js/draft/engine.js public/js/draft/survival.js
               public/js/draft/needrule.js public/js/draft/value.js"
_dg=$(cat $SCORING_FILES 2>/dev/null | sha256sum | cut -d' ' -f1)
printf '{\n "scanned_at": "%s",\n "suites": %s,\n "red": %s,\n "scoring_digest": "%s"\n}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$total" "$red" "$_dg" > .scan_receipt.json

[ "$red" = "0" ] || exit 1
