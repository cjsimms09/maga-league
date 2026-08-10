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

  # ── EVERY SERVED ROOT, one commit each ────────────────────────────────────
  # Until 2026-08-10 this suite only ever exercised `views/`. The fixture even
  # created public/js and src and then never committed to them, so every other
  # entry in the gate's served-file pattern was unasserted — drop `public/` and
  # the entire war room stops deploying with this suite still green.
  #
  # That is the worst failure available here, because it is DOUBLE-silent: the
  # gate says SKIP, and deploy-verify then reports "the deploy gate SKIPS this
  # push (no served change) — nothing to verify. OK." Two green checks over code
  # that never reached the site, which is the stranded-deploy class exactly.
  prev="$(git rev-parse HEAD)"
  : > served_refs.env
  add_served () {  # <label> <path>
    mkdir -p "$(dirname "$2")"
    echo "served-$1" > "$2"
    git add -A; git commit -qm "served: $1"
    echo "SERVED_${1}_BEFORE=$prev"   >> served_refs.env
    echo "SERVED_${1}_AFTER=$(git rev-parse HEAD)" >> served_refs.env
    prev="$(git rev-parse HEAD)"
  }
  add_served PUBLIC   public/js/draft/app.js
  add_served SRC      src/sleeper.js
  add_served SERVERJS server-app.js
  add_served PKG      package.json
  add_served TOML     netlify.toml
  add_served FUNCS    netlify/functions/api.js
)
. "$TMP/refs.env"
. "$TMP/served_refs.env"

# served change since last build -> BUILD
run "a served change (views/) since last build deploys"            1 "$BASE"    "$SERVED"
# EVERY OTHER SERVED ROOT. `public/` is the war room itself; if it ever falls out
# of the gate's pattern, draft-night JS silently stops shipping and BOTH the gate
# and deploy-verify report green over it.
run "a served change under public/ deploys"          1 "$SERVED_PUBLIC_BEFORE"   "$SERVED_PUBLIC_AFTER"
run "a served change under src/ deploys"             1 "$SERVED_SRC_BEFORE"      "$SERVED_SRC_AFTER"
run "a change to server-app.js deploys"              1 "$SERVED_SERVERJS_BEFORE" "$SERVED_SERVERJS_AFTER"
run "a change to package.json deploys"               1 "$SERVED_PKG_BEFORE"      "$SERVED_PKG_AFTER"
run "a change to netlify.toml deploys"               1 "$SERVED_TOML_BEFORE"     "$SERVED_TOML_AFTER"
run "a change under netlify/functions/ deploys"      1 "$SERVED_FUNCS_BEFORE"    "$SERVED_FUNCS_AFTER"
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
