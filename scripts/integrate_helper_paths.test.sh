#!/usr/bin/env bash
# TERRITORY: A
# AFTER THE RE-EXEC, `$0` IS A TEMP PATH. ANY HELPER RESOLVED FROM IT IS GONE.
#
# integrate.sh re-execs itself from a `mktemp` copy so a `git checkout` cannot
# swap its source mid-run. That fix is correct and stays. Its side effect is
# that `$0` stops being the repository path, and the re-exec comment says so
# explicitly — then two call sites were left resolving `ci_status.sh` from
# `dirname "$0"`, which after the re-exec is /tmp.
#
# MEASURED 2026-08-14, integrating review-schema-fix:
#
#   == CI: is main green BEFORE this merge is called done?
#   bash: /tmp/ci_status.sh: No such file or directory
#   OK: review-schema-fix merged into main. Suites green LOCALLY.
#
# The gate's only guard against merging onto an already-red main did not run,
# printed its own failure, and the merge was called OK. A missing file exits
# 127; the branches below it test for 1 and 2, so 127 fell through to silence.
#
# THE FAILURE CLASS: an alarm that cannot fire reads exactly like an alarm that
# did not need to. Nothing counted how often the check failed to run, which is
# the same aggregate-nobody-computes shape as every other defect in this audit.
#
# Run: bash scripts/integrate_helper_paths.test.sh
set -uo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

pass=0; fail=0
ck() { if [ "$2" = "0" ]; then pass=$((pass+1)); echo "PASS  $1";
       else fail=$((fail+1)); echo "FAIL  $1${3:+ -> $3}"; fi; }

SRC=scripts/integrate.sh

# ── CONTROL: the file and the re-exec it is about are both really there ──────
[ -f "$SRC" ]; ck "CONTROL: $SRC exists" $?
grep -q 'exec bash "\$_self"' "$SRC"; ck "CONTROL: the re-exec this test is about is present" $? \
  "no re-exec — if it was removed, delete this test rather than letting it pass vacuously"

# ── THE RULE: nothing may resolve a repo path from \$0 after the re-exec ─────
#
# ⚠️ THE NEEDLE IS ASSEMBLED FROM FRAGMENTS ON PURPOSE. Written literally, this
# pattern would match ITS OWN TEXT in this file — and if the test ever searched
# both files, or someone moved the check into integrate.sh, it would report a
# defect that is only its own assertion. This repo has hit that absence-assertion
# trap seven times; the cost of avoiding it is one string concatenation.
NEEDLE='dirname "$'"0"'"'
REEXEC_END=$(grep -n 'cd "\$INTEGRATE_ROOT"' "$SRC" | head -1 | cut -d: -f1)
[ -n "$REEXEC_END" ]; ck "CONTROL: located the end of the re-exec block" $?

# Comments are allowed to mention it — the fix comment does, by design.
AFTER=$(awk -v n="$REEXEC_END" 'NR>n {print NR": "$0}' "$SRC" \
  | grep -- "$NEEDLE" | grep -v ':[[:space:]]*#' || true)
[ -z "$AFTER" ]; ck "no executable line past the re-exec resolves a path from \$0" $? "$AFTER"

# ── EVERY HELPER integrate.sh SHELLS OUT TO MUST ACTUALLY EXIST ─────────────
#
# The rule above catches the mechanism. This catches the OUTCOME regardless of
# mechanism — a helper renamed, moved, or never committed fails here even if the
# path expression is textually fine.
MISSING=""
while read -r ref; do
  resolved="${ref/\$INTEGRATE_ROOT/.}"
  resolved="${resolved/\$\{INTEGRATE_ROOT\}/.}"
  case "$resolved" in
    *'$'*) continue ;;                       # still has a variable — cannot check statically
  esac
  [ -f "$resolved" ] || MISSING="$MISSING $resolved"
done < <(grep -o 'bash "[^"]*\.sh"' "$SRC" | sed 's/^bash "//; s/"$//' | sort -u)
[ -z "$MISSING" ]; ck "every helper script integrate.sh invokes exists on disk" $? "$MISSING"

# ── THE SPECIFIC HELPER THAT WENT MISSING, BY NAME ─────────────────────────
grep -q 'INTEGRATE_ROOT/scripts/ci_status.sh' "$SRC"
ck "ci_status.sh is resolved under INTEGRATE_ROOT, not \$0" $?
n=$(grep -c 'INTEGRATE_ROOT/scripts/ci_status.sh' "$SRC")
[ "$n" = "2" ]; ck "BOTH ci_status call sites were fixed, not just the one that was seen" $? \
  "found $n, expected 2 (pre-merge check on main, and post-push check on the SHA)"
[ -f scripts/ci_status.sh ]; ck "scripts/ci_status.sh is in the repository" $?

# ── FAIL ARM: prove the check can go red ───────────────────────────────────
#
# A path assertion that passes against a deliberately broken copy is proving
# nothing. Break it in a scratch copy and require a red.
TMP="$(mktemp)"; sed 's|"$INTEGRATE_ROOT/scripts/ci_status.sh"|"$(dirname "$0")/ci_status.sh"|' \
  "$SRC" > "$TMP"
if grep -q 'INTEGRATE_ROOT/scripts/ci_status.sh' "$TMP"; then
  ck "FAIL ARM: the scratch copy really was broken" 1 "sed did not reintroduce the defect"
else
  ck "FAIL ARM: the scratch copy really was broken" 0
fi
BROKEN=$(awk -v n="$REEXEC_END" 'NR>n {print NR": "$0}' "$TMP" \
  | grep -- "$NEEDLE" | grep -v ':[[:space:]]*#' || true)
[ -n "$BROKEN" ]; ck "FAIL ARM: the \$0 rule FIRES on the broken copy" $? \
  "the rule passed a file with the exact defect it exists to catch"
rm -f "$TMP"

echo
echo "$pass passed, $fail failed"
[ "$fail" = "0" ] || exit 1
