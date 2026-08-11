#!/usr/bin/env bash
# RULE 10 BREAK HARNESS — bounded, stdin-safe, and restoring even when killed.
#
# WHY THIS EXISTS. A "break the zero-collection guard both ways" task ran for
# 2h24m and had to be killed. A rule-10 break should take seconds. Three separate
# faults combined, and only one of them was the hang:
#
#   1. NO TIMEOUT. Nothing bounded the step, so a blocked command ran until a
#      human noticed. Measured in this sandbox: `python3 -` with no heredoc body
#      reads stdin until EOF and blocks FOREVER at ~0% CPU — a signature that
#      looks identical to "still working" from outside. `git commit` with no -m
#      is the same shape (core.editor is unset here, so it falls through to vi).
#
#   2. STDIN WAS ATTACHED. `</dev/null` turns that infinite block into an
#      immediate EOF. Verified both ways before writing this.
#
#   3. THE RESTORE WAS A TRAILING LINE, WHICH IS THE WORST OF THE THREE.
#      Every break harness used here so far applied an edit, ran the suite, and
#      restored on the NEXT line — so a kill, a timeout or a non-zero exit during
#      the run left the source in its BROKEN state. That is not hypothetical: the
#      killed run left `roster: state.myRoster,` deleted from app.js's live
#      context(), and it stayed deleted through subsequent work. It was caught
#      only because the context-interface guard built minutes earlier went red.
#      A break harness that can leave the tree broken is more dangerous than the
#      bug it is testing for, because it corrupts the thing under test.
#
#      So the restore is a TRAP on EXIT INT TERM HUP. Ctrl-C restores. A timeout
#      restores. A crash restores.
#
# Usage:
#   draft/tools/rule10_break.sh -f <file> -o <old> -n <new> -c <check-cmd> [-t secs]
#
#   -f  file to perturb            -o  exact string to replace (must be unique-ish)
#   -n  replacement                -c  command whose RED/GREEN is the evidence
#   -t  timeout seconds (default 120)
#
# Exit codes: 0 the check FAILED (the guard caught the break — what you want)
#             1 the check PASSED (the guard did NOT catch it — a silence)
#             2 the break was a NO-OP (nothing was changed; the test proves nothing)
#             3 the check TIMED OUT (treated as inconclusive, never as a pass)
set -u

FILE=""; OLD=""; NEW=""; CHECK=""; TMO=120
while getopts "f:o:n:c:t:" a; do
  case "$a" in
    f) FILE="$OPTARG";; o) OLD="$OPTARG";; n) NEW="$OPTARG";;
    c) CHECK="$OPTARG";; t) TMO="$OPTARG";;
    *) echo "bad flag"; exit 2;;
  esac
done
[ -n "$FILE" ] && [ -n "$CHECK" ] || { echo "usage: -f FILE -o OLD -n NEW -c CHECK [-t SECS]"; exit 2; }
[ -f "$FILE" ] || { echo "no such file: $FILE"; exit 2; }

BAK="$(mktemp)"
cp "$FILE" "$BAK"

# THE TRAP IS THE POINT. Registered BEFORE the file is touched, so there is no
# window in which the tree can be left broken.
restore() {
  cp "$BAK" "$FILE"
  rm -f "$BAK"
}
trap restore EXIT INT TERM HUP

# Apply the break as an EXACT string replacement, and refuse a no-op. "A break
# that cannot change behaviour tests nothing" — a mis-typed search string
# silently produces a green run that reads as protection.
node -e '
const fs = require("fs");
const [file, old, nw] = process.argv.slice(1);
const before = fs.readFileSync(file, "utf8");
if (!old) { console.error("NO-OP: empty search string"); process.exit(2); }
const idx = before.indexOf(old);
if (idx < 0) { console.error("NO-OP: search string not found — the break did not apply"); process.exit(2); }
const occurrences = before.split(old).length - 1;
if (occurrences > 1) {
  // AIM, DO NOT SPRAY. A break that lands on the wrong occurrence tests the
  // wrong code and reports a confident result about it. This bit us: a 6-space
  // search string matched inside a 10-space line in an unrelated function, so
  // the intended target was never touched and the run read as a silence.
  console.error("AMBIGUOUS: " + occurrences + " occurrences — narrow the search string");
  process.exit(2);
}
fs.writeFileSync(file, before.slice(0, idx) + nw + before.slice(idx + old.length));
' "$FILE" "$OLD" "$NEW" || exit 2

# ── STALE BYTECODE MISATTRIBUTES THE BREAK ──────────────────────────────────
# C's finding, 2026-08-11: running mutation breaks back to back lets a stale
# .pyc be reused, so pytest scores one mutation against the PREVIOUS one's
# bytecode. It caught it because the named test did not match what the mutation
# should logically break — i.e. the harness reported a CONFIDENT WRONG
# ATTRIBUTION, which is worse than a failure.
#
# Python invalidates a .pyc by source mtime AND size, so the exposure is exactly
# the back-to-back case this harness creates: two mutations of the same byte
# length landing inside one mtime-second look identical to the cache. Every break
# run here is by construction "quick succession".
#
# Belt and braces, because a misattribution is silent: refuse to write bytecode
# at all, run python with -B, and purge any __pycache__ left by earlier runs.
export PYTHONDONTWRITEBYTECODE=1
export PYTHONPYCACHEPREFIX=""
find draft -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null

echo "-- broke $FILE, running: $CHECK (timeout ${TMO}s, bytecode cache disabled)"
START=$(date +%s)
# </dev/null so a command that reads stdin gets EOF instead of blocking forever.
timeout -s TERM "$TMO" bash -c "$CHECK" </dev/null >/tmp/rule10_check.log 2>&1
RC=$?
ELAPSED=$(( $(date +%s) - START ))

case "$RC" in
  124) echo "   TIMED OUT after ${ELAPSED}s — INCONCLUSIVE, not a pass."
       echo "   last output:"; tail -5 /tmp/rule10_check.log | sed 's/^/     /'
       exit 3;;
  0)   echo "   check PASSED in ${ELAPSED}s -> THE GUARD DID NOT CATCH THIS BREAK (a silence)"
       exit 1;;
  *)   echo "   check FAILED (exit $RC) in ${ELAPSED}s -> the guard caught it"
       exit 0;;
esac
