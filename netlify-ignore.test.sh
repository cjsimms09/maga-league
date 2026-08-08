#!/usr/bin/env bash
# The deploy gate's exit-code contract, asserted in BOTH directions.
#
# An inverted gate fails silently: either nothing ever deploys (and the site
# quietly rots behind main), or everything deploys (and August's build minutes
# are gone before draft day). Neither shows up as an error anywhere, so the
# contract gets a test rather than a comment.
#
# Run: bash netlify-ignore.test.sh
set -uo pipefail
cd "$(dirname "$0")"

pass=0; fail=0
# EXPECTED: 0 = Netlify skips, 1 = Netlify builds
check() {
  local name="$1" expected="$2"; shift 2
  local out rc
  out="$(env "$@" bash netlify-ignore.sh 2>&1)"; rc=$?
  if [ "$rc" -eq "$expected" ]; then
    pass=$((pass+1)); echo "PASS  $name"
  else
    fail=$((fail+1)); echo "FAIL  $name  -> exit $rc, expected $expected"
    echo "        $out"
  fi
}

# A real commit ref whose message we control is awkward here, so the message
# paths are exercised through COMMIT_REF pointing at crafted commits below.
TMP="$(mktemp -d)"
git init -q "$TMP"
(
  cd "$TMP"
  git config user.email t@t; git config user.name t
  echo a > a; git add a
  git commit -qm "ordinary work: fix a thing"
  ORDINARY=$(git rev-parse HEAD)
  echo b > b; git add b
  git commit -qm "ship the war room fixes [deploy]"
  DEPLOYC=$(git rev-parse HEAD)
  echo c > c; git add c
  git commit -qm "docs only [skip ci]"
  SKIPC=$(git rev-parse HEAD)
  echo "$ORDINARY $DEPLOYC $SKIPC" > refs.txt
)
read -r ORDINARY DEPLOYC SKIPC < "$TMP/refs.txt"

# Run the gate from inside the fixture repo so `git log` resolves those refs.
run_in_fixture() {
  local name="$1" expected="$2" ref="$3"; shift 3
  local out rc
  out="$(cd "$TMP" && env COMMIT_REF="$ref" "$@" bash "$OLDPWD/netlify-ignore.sh" 2>&1)"; rc=$?
  if [ "$rc" -eq "$expected" ]; then
    pass=$((pass+1)); echo "PASS  $name"
  else
    fail=$((fail+1)); echo "FAIL  $name  -> exit $rc, expected $expected"; echo "        $out"
  fi
}

OLDPWD="$PWD"
run_in_fixture "an ORDINARY commit does NOT deploy (this is the whole point)" 0 "$ORDINARY"
run_in_fixture "a commit marked [deploy] DOES deploy"                         1 "$DEPLOYC"
run_in_fixture "a commit marked [skip ci] does NOT deploy"                     0 "$SKIPC"
run_in_fixture "a build hook deploys regardless of the message"               1 "$ORDINARY" INCOMING_HOOK_TITLE="manual deploy"

rm -rf "$TMP"
echo
echo "$pass/$((pass+fail)) deploy-gate checks passed"
[ "$fail" -eq 0 ] || exit 1
