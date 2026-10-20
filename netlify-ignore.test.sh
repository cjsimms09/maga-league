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
  # THE WEEKLY HIGH'S PATH (2026-09-17). league_history.json lives under draft/
  # — Lab territory — but the chronicle derives the weekly-high ledger and the
  # money board from it at server load, so it IS served. It is named as ONE
  # FILE, never the directory, and the pair below asserts both halves.
  add_served HISTORY  draft/data/league_history.json
  # …and its NEGATIVE twin: a sibling under the same directory must still SKIP,
  # or the narrow rule has quietly become a wide one and draft/data's daily
  # capture churn starts spending the build budget this gate exists to protect.
  mkdir -p draft/data; echo churn > draft/data/proj_series.json
  git add -A; git commit -qm 'lab: daily capture churn'
  echo "SIBLING_BEFORE=$prev" >> served_refs.env
  echo "SIBLING_AFTER=$(git rev-parse HEAD)" >> served_refs.env
  prev="$(git rev-parse HEAD)"
)
. "$TMP/refs.env"
. "$TMP/served_refs.env"

# served change since last build -> BUILD
run "a served change (views/) since last build deploys"            1 "$BASE"    "$SERVED" DEPLOY_WINDOW_HOURS=0
# EVERY OTHER SERVED ROOT. `public/` is the war room itself; if it ever falls out
# of the gate's pattern, draft-night JS silently stops shipping and BOTH the gate
# and deploy-verify report green over it.
run "a served change under public/ deploys"          1 "$SERVED_PUBLIC_BEFORE"   "$SERVED_PUBLIC_AFTER" DEPLOY_WINDOW_HOURS=0
run "a served change under src/ deploys"             1 "$SERVED_SRC_BEFORE"      "$SERVED_SRC_AFTER" DEPLOY_WINDOW_HOURS=0
run "a change to server-app.js deploys"              1 "$SERVED_SERVERJS_BEFORE" "$SERVED_SERVERJS_AFTER" DEPLOY_WINDOW_HOURS=0
run "a change to package.json deploys"               1 "$SERVED_PKG_BEFORE"      "$SERVED_PKG_AFTER" DEPLOY_WINDOW_HOURS=0
# THE WEEKLY HIGH, BOTH DIRECTIONS. The first is Cory's 09-17 ask — the Tuesday
# export must reach the site. The second is the guard on my own fix: if the rule
# ever widens from the file to the directory, THIS one flips and says so.
run "league_history.json deploys (the weekly high reaches the site)" 1 "$SERVED_HISTORY_BEFORE" "$SERVED_HISTORY_AFTER" DEPLOY_WINDOW_HOURS=0
run "a SIBLING under draft/data/ still SKIPS (the rule is one file, not the dir)" 0 "$SIBLING_BEFORE" "$SIBLING_AFTER" DEPLOY_WINDOW_HOURS=0
run "a change to netlify.toml deploys"               1 "$SERVED_TOML_BEFORE"     "$SERVED_TOML_AFTER" DEPLOY_WINDOW_HOURS=0
run "a change under netlify/functions/ deploys"      1 "$SERVED_FUNCS_BEFORE"    "$SERVED_FUNCS_AFTER" DEPLOY_WINDOW_HOURS=0
# docs-only since last build -> SKIP (budget batching)
run "a docs-only change does NOT deploy"                           0 "$SERVED"  "$DOC"
# THE RACE FIX: a served change BURIED under a later docs commit still deploys,
# because the gate scans BASE..DOC (which includes the served commit), not the tip.
run "a served change buried under a later docs commit STILL deploys" 1 "$BASE"  "$DOC" DEPLOY_WINDOW_HOURS=0
# [deploy] anywhere in range forces a build even for non-served files
run "[deploy] in the range builds even for a Lab-only change"      1 "$DOC"     "$DEPLOYP"
# [skip deploy] on the tip suppresses even a served change
run "[skip deploy] on the tip suppresses a served change"          0 "$DEPLOYP" "$SUPPRESS"
# first build (no CACHED) -> BUILD, never risk never-deploying
run "first build with no CACHED_COMMIT_REF deploys"                1 ""         "$SERVED"
# manual hook always builds
run "a build hook deploys regardless of range"                     1 "$SERVED"  "$DOC" INCOMING_HOOK_TITLE="manual deploy"

echo

# ── CORY'S CADENCE WINDOW (2026-08-24) ────────────────────────────────────────
# "we shouldn't deploy 100x a day, 2-3xs a day is enough". MEASURED that day:
# 170 commits on main in 24h, 143 already suppressed by the served-file gate,
# 27 would have built. The window caps the remainder.
#
# ⛔⛔ THIS BLOCK ASSERTED THE 33-DAY OUTAGE AS CORRECT BEHAVIOUR. Read the
# previous version before trusting the paragraph below it:
#
#   run "served change INSIDE the window is held..."  0 ... DEPLOY_WINDOW_HOURS=8
#   run "served change OUTSIDE the window builds"     1 ... DEPLOY_WINDOW_HOURS=0
#
# It claimed "BOTH DIRECTIONS, because a cap that never lets anything through
# and a cap that never stops anything are both silent" — and then tested the
# open direction by setting the window to ZERO, which DISABLES the cap rather
# than ageing the deploy. A genuinely stale deploy was never exercised once.
# Meanwhile the closed direction ran on fixture commits made seconds earlier,
# which is precisely the production state that froze the site, and the suite
# recorded exit 0 as the right answer.
#
# So the one thing this block was written to prevent is the one thing it could
# not see: the gate measured the window from CACHED_COMMIT_REF (the last BUILD,
# which Netlify advances on every skipped build) while calling it "the last
# deploy", so every push reset the clock to 0h and nothing ever shipped again.
# Cory, 2026-10-20: "it keeps building but skipping deploy.. why?"
#
# BOTH DIRECTIONS NOW MEAN BOTH DIRECTIONS: the window stays at 8h throughout
# and it is the DEPLOY'S AGE that varies, via DEPLOY_WINDOW_DEPLOYED_TS. The
# escape hatches are re-asserted with the window active — if [deploy] stopped
# working under a cadence cap an urgent fix would be stuck behind a timer with
# no way out, which is worse than the over-deploying this solves.
NOW_TS="$(date +%s)"
FRESH_TS="$NOW_TS"                      # deployed 0h ago
STALE_TS="$((NOW_TS - 40 * 3600))"      # deployed 40h ago
FROZEN_TS="$((NOW_TS - 794 * 3600))"    # the real 2026-09-17 gap, 33 days

run "served change with a FRESH deploy (0h) is held for the next build" \
  0 "$BASE" "$SERVED" DEPLOY_WINDOW_HOURS=8 DEPLOY_WINDOW_DEPLOYED_TS="$FRESH_TS"

# ⚠️ THE TEST THAT DID NOT EXIST. The window must open on a STALE DEPLOY, not
# only when someone disables it.
run "served change with a STALE deploy (40h) BUILDS, window still 8h" \
  1 "$BASE" "$SERVED" DEPLOY_WINDOW_HOURS=8 DEPLOY_WINDOW_DEPLOYED_TS="$STALE_TS"

# ⚠️ THE REGRESSION ITSELF, at the real magnitude: every fixture commit here is
# SECONDS old, which is exactly the CACHED_COMMIT_REF the old gate measured and
# the reason it reported "the last deploy was 0h ago" while prod sat 33 days
# behind. The deploy's real age is the only input that may decide this. If it
# ever returns 0 again the site is frozen and nobody will be told.
#   (First draft of this test used $SUPPRESS as the tip and failed — that commit
#    carries [skip deploy], which short-circuits long before the window. My
#    fixture was wrong, not the gate; worth leaving on the record since a
#    wrongly-wired regression test is how this block came to pass for 33 days.)
run "LOCKOUT — last build seconds ago but prod 794h behind must BUILD" \
  1 "$BASE" "$SERVED" DEPLOY_WINDOW_HOURS=8 DEPLOY_WINDOW_DEPLOYED_TS="$FROZEN_TS"

# ⚠️ THE ANTI-FREEZE INVARIANT. When the deployed commit cannot be read at all
# the gate must BUILD, never fall back to the cache ref — that fallback WAS the
# outage. Pointed at a dead port so the fetch genuinely fails.
run "unknown deployed commit BUILDS (conservative), never freezes" \
  1 "$BASE" "$SERVED" DEPLOY_WINDOW_HOURS=8 DEPLOY_WINDOW_SITE="https://127.0.0.1:1"

run "ESCAPE HATCH — [deploy] forces a build inside the window" \
  1 "$DOC" "$DEPLOYP" DEPLOY_WINDOW_HOURS=8 DEPLOY_WINDOW_DEPLOYED_TS="$FRESH_TS"
run "ESCAPE HATCH — a build hook forces a build inside the window" \
  1 "$BASE" "$SERVED" DEPLOY_WINDOW_HOURS=8 DEPLOY_WINDOW_DEPLOYED_TS="$FRESH_TS" \
  INCOMING_HOOK_TITLE="manual deploy"
run "a docs-only change still skips regardless of the window" \
  0 "$SERVED" "$DOC" DEPLOY_WINDOW_HOURS=8 DEPLOY_WINDOW_DEPLOYED_TS="$STALE_TS"

echo "$pass/$((pass+fail)) deploy-gate checks passed"
[ "$fail" -eq 0 ] || exit 1
