#!/usr/bin/env bash
# REFUSE A SCORING-PATH COMMIT THAT HAS NOT BEEN SCANNED.
#
# Cory, 2026-08-13: "A change to live scoring should not be able to ship on the
# same reflex as a change to a comment... If a commit touches the scoring path,
# IT SHOULD REQUIRE THE SCAN TO HAVE COMPLETED. Not a reminder — a refusal, the
# way integrate.sh now refuses while main is red."
#
# THE EVIDENCE THIS EXISTS FOR: on 2026-08-13 a change to what scorePlayer
# returns was committed on a stop-hook prompt with the scan mid-flight. Four
# suites went red, two of them crashing, and the branch carried a broken build.
# Three earlier commits that day were committed the same way and were harmless —
# they touched comments, gated code and tests. THE PATH TREATED ALL FOUR
# IDENTICALLY, and that is the defect. Intent to be slower does not distinguish
# them; a gate does.
#
# It checks a RECEIPT written by suite_scan.sh: the digest of the scoring-path
# files at the moment the scan ran, plus the red count. If the files have moved
# since, the receipt does not match and this refuses — a scan of a DIFFERENT
# tree is not evidence about this one.
#
# Usage: bash scripts/scoring_path_gate.sh          (checks the working tree)
# Exit 0 clear, 1 refused, 2 cannot determine (which is NOT clear).
set -uo pipefail
cd "$(dirname "$0")/.."

SCORING_FILES="public/js/draft/engine.js public/js/draft/survival.js
               public/js/draft/needrule.js public/js/draft/value.js"
RECEIPT=".scan_receipt.json"

digest() { cat $SCORING_FILES 2>/dev/null | sha256sum | cut -d' ' -f1; }

# Does this change touch the scoring path at all?
touched=0
for f in $SCORING_FILES; do
  if ! git diff --quiet -- "$f" 2>/dev/null || ! git diff --cached --quiet -- "$f" 2>/dev/null; then
    touched=1
  fi
done
if [ "$touched" = "0" ]; then
  echo "scoring-path gate: NOT APPLICABLE (no scoring-path file changed)"
  exit 0
fi

echo "scoring-path gate: this change touches live scoring."
if [ ! -f "$RECEIPT" ]; then
  echo "REFUSED — no scan receipt. Run: bash draft/tools/suite_scan.sh"
  exit 1
fi
want=$(digest)
got=$(grep -o '"scoring_digest"[[:space:]]*:[[:space:]]*"[a-f0-9]*"' "$RECEIPT" | grep -o '[a-f0-9]\{64\}')
redn=$(grep -o '"red"[[:space:]]*:[[:space:]]*[0-9]*' "$RECEIPT" | grep -o '[0-9]*$')
if [ -z "$got" ] || [ -z "$redn" ]; then
  echo "CANNOT DETERMINE — receipt is unreadable. That is not a pass."
  exit 2
fi
if [ "$want" != "$got" ]; then
  echo "REFUSED — the receipt is for a DIFFERENT tree."
  echo "  scanned : $got"
  echo "  current : $want"
  echo "  A scan of code you have since edited is not evidence about this code."
  exit 1
fi
if [ "$redn" != "0" ]; then
  echo "REFUSED — the last scan of THIS tree was red ($redn suite(s))."
  exit 1
fi
echo "CLEAR — scan completed on this exact scoring path, 0 red."
exit 0
