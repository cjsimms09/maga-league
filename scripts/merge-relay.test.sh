#!/usr/bin/env bash
# TERRITORY: A
# merge-relay.sh makes CLAIMS about when it refuses — claims get fail arms.
# Runs against a synthetic repo so the real tree is never touched, plus
# structure checks on the real script (the parts a synthetic repo can't see).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ck() { local n="$1"; shift; if "$@" >/dev/null 2>&1; then pass=$((pass+1)); echo "PASS  $n";
       else fail=$((fail+1)); echo "FAIL  $n"; fi; }

SRC="$HERE/merge-relay.sh"

# ── structure: the promises the header makes exist in the code ────────────
ck "it never pushes (no 'git push' outside the printed instruction)" \
  bash -c "! grep -E '^[^#]*git push' '$SRC' | grep -v echo | grep -q ."
ck "a red verifier is a hard refusal, not a warning" \
  bash -c "grep -q 'do NOT bypass a red verifier' '$SRC'"
ck "a red merged-tree suite ROLLS LOCAL MAIN BACK before refusing" \
  bash -c "grep -c 'reset -q --hard origin/main' '$SRC' | grep -qE '^[3-9]'"
ck "a stale branch (behind origin/main) refuses with instructions" \
  bash -c "grep -q 'is-ancestor' '$SRC'"
ck "conflicts abort the merge rather than leaving a half-merged main" \
  bash -c "grep -q 'merge --abort' '$SRC'"

# ── behavior, in a scratch repo ───────────────────────────────────────────
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
(
  cd "$T"
  git init -q -b main .
  git config user.email t@t; git config user.name t
  echo base > f; git add f; git commit -qm base
  # a bare "origin" so fetch/reset against origin/main work
  git clone -q --bare . origin.git
  git remote add origin "$T/origin.git"
  git fetch -q origin
) || { echo "FAIL  scratch repo setup"; exit 1; }

ck "dirty tree refuses before touching anything" \
  bash -c "cd '$T' && echo dirt >> f && ! bash '$SRC' --branch main 2>&1 | grep -q . && exit 1 || { git checkout -q -- f; bash '$SRC' --branch nope 2>&1 | grep -q 'REFUSED' || true; }; cd '$T' && echo dirt2 >> f && out=\$(bash '$SRC' --branch main 2>&1); git checkout -q -- f; printf '%s' \"\$out\" | grep -q 'working tree is dirty'"

ck "an unknown branch refuses at fetch/checkout, exit nonzero" \
  bash -c "cd '$T' && ! bash '$SRC' --branch does-not-exist >/dev/null 2>&1"

echo ""
echo "$pass passed, $fail failed"
exit $((fail > 0))
