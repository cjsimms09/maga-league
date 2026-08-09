#!/usr/bin/env bash
# The deploy gate's exit-code contract, asserted in BOTH directions — now OPT-OUT.
#
# An inverted gate fails silently: either nothing ever deploys (the site rots behind
# main), or everything deploys (August's build minutes are gone before draft day).
# Neither surfaces as an error, so the contract gets a test. The gate reads the RANGE
# since the last successful build (CACHED_COMMIT_REF..COMMIT_REF): a served change
# builds; docs/Lab/CI-only skips; a buried served change (or [deploy]) still builds —
# that last one is the RACE this policy exists to kill.
#
# Run: bash netlify-ignore.test.sh
set -uo pipefail
cd "$(dirname "$0")"
GATE="$PWD/netlify-ignore.sh"
pass=0; fail=0
# EXPECTED: 0 = Netlify skips, 1 = Netlify builds
run() {  # name expected CACHED COMMIT [extra env...]
  local name="$1" expected="$2" cached="$3" commit="$4"; shift 4
  local out rc
  out="$(cd "$TMP" && env CACHED_COMMIT_REF="$cached" COMMIT_REF="$commit" "$@" bash "$GATE" 2>&1)"; rc=$?
  if [ "$rc" -eq "$expected" ]; then pass=$((pass+1)); echo "PASS  $name"
  else fail=$((fail+1)); echo "FAIL  $name  -> exit $rc, expected $expected"; echo "        $out"; fi
}

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
(
  cd "$TMP"; git init -q; git config user.email t@t; git config user.name t; git config commit.gpgsign false
  mkdir -p views docs draft/backtest public/js src
  echo base > base.txt; git add -A; git commit -qm base
  echo x > views/page.ejs; git add -A; git commit -qm "site: new matchup view"          # served
  echo y > docs/note.md;   git add -A; git commit -qm "docs: a note"                     # non-served
  echo z > draft/backtest/exp.py; git add -A; git commit -qm "lab: exp change [deploy]"  # non-served + [deploy]
  echo w > views/two.ejs;  git add -A; git commit -qm "site: another view [skip deploy]" # served + suppress
  {
    echo "BASE=$(git rev-parse HEAD~4)"
    echo "SERVED=$(git rev-parse HEAD~3)"
    echo "DOC=$(git rev-parse HEAD~2)"
    echo "DEPLOYP=$(git rev-parse HEAD~1)"
    echo "SUPPRESS=$(git rev-parse HEAD)"
  } > refs.env
)
. "$TMP/refs.env"

# served change since last build -> BUILD
run "a served change (views/) since last build deploys"            1 "$BASE"    "$SERVED"
# docs-only since last build -> SKIP (budget batching)
run "a docs-only change does NOT deploy"                           0 "$SERVED"  "$DOC"
# THE RACE FIX: a served change BURIED under a later docs commit still deploys,
# because the gate scans BASE..DOC (which includes the served commit), not the tip.
run "a served change buried under a later docs commit STILL deploys" 1 "$BASE"  "$DOC"
# [deploy] anywhere in range forces a build even for non-served files
run "[deploy] in the range builds even for a Lab-only change"      1 "$DOC"     "$DEPLOYP"
# [skip deploy] on the tip suppresses even a served change
run "[skip deploy] on the tip suppresses a served change"          0 "$DEPLOYP" "$SUPPRESS"
# first build (no CACHED) -> BUILD, never risk never-deploying
run "first build with no CACHED_COMMIT_REF deploys"                1 ""         "$SERVED"
# manual hook always builds
run "a build hook deploys regardless of range"                     1 "$SERVED"  "$DOC" INCOMING_HOOK_TITLE="manual deploy"

echo
echo "$pass/$((pass+fail)) deploy-gate checks passed"
[ "$fail" -eq 0 ] || exit 1
