#!/usr/bin/env bash
# TERRITORY CHECK — flags a parallel session touching another session's files.
#
# Usage:  bash scripts/territory-check.sh A     (engine, Lab, app, integration)
#         bash scripts/territory-check.sh B     (site)
#         bash scripts/territory-check.sh C     (external ingest)
#
# ══ THIS WAS A GUARD THAT DID NOT GUARD, and the fix is structural ══
# It used to be BINARY: `b_owns()` returned true/false and A was defined as
# "everything not B". Passing C fell through to the A branch, so a C-side call
# only ever asked "has C touched B's files" — it would have passed C editing
# draft/backtest/graduation_gate.py, which is A's. C parked that request by
# JUDGMENT, not because anything stopped it.
#
# A two-party predicate cannot express three parties, and bolting on a C branch
# would have made it three special cases. So ownership is now ONE FUNCTION
# returning the owner of a path, and the check is the same sentence for every
# side: a file you touched must be yours or shared.
#
# Checks UNCOMMITTED changes against the declared split. Exits non-zero on a
# trespass so it can gate a commit.
#
# ⚠️ READ TERRITORY.md FIRST. The split is NOT draft-vs-Lab — the Lab imports
# draft-path modules directly and cannot be separated from them.
set -uo pipefail
cd "$(dirname "$0")/.."

SIDE="${1:-}"
case "$SIDE" in
  A|B|C) ;;
  *) echo "usage: territory-check.sh A|B|C"; exit 2 ;;
esac

# ── A JS TEST FOLLOWS WHAT IT REACHES INTO (2026-08-11) ─────────────────────
#
# Cory's "a test follows its module" ruling was implemented for `test_*.py` by
# DERIVING the module name from the test name. That does not transfer to JS: B's
# tests are named for BEHAVIOUR — waiver_surface, h2h_agreement,
# draft_sheet_tiers, sidebet_unpaid — and not one of them has a module of the
# same name, so a name derivation answers "unknown" for every one and they fall
# through to A by default.
#
# THE RULE PRODUCED A WORSE OUTCOME THAN NO RULE. B fixed the draft sheet's tier
# defect — its own surface — and integrate.sh REFUSED the whole branch for
# sixteen trespasses, every one a test for a B-owned route. B could not merge
# its own bug fix.
#
# TWO FALSE STARTS, both measured rather than assumed:
#   1. Matching the string `src/` found ZERO requires in all sixteen files.
#      These tests build paths as `require(path.join(ROOT, 'src', 'store'))`, so
#      the quoted segments are 'src' and 'store' SEPARATELY. The match silently
#      never fired, which reads exactly like "these are not B's". Now TOKENS.
#   2. `require(...)` alone still missed draft_sheet_staleness, which renders
#      B's template with readFileSync + ejs and never requires it. `path.join`
#      counts too.
#
# Any A-lane token disqualifies: a test spanning both lanes is not unambiguously
# either, and stays with A rather than being guessed.
#
# READ FROM THE REF, NOT THE WORKING TREE. In --range mode the file may not exist
# locally at all, and reading the working tree would answer about a different
# file — the same class as the checkout that attributed A's work-in-progress to C.
_js_test_lane_is_b() {
  _src=""
  if [ -n "${RANGE_REF:-}" ]; then
    _src="$(git show "$RANGE_REF:$1" 2>/dev/null)" || return 1
  else
    [ -f "$1" ] || return 1
    _src="$(cat "$1" 2>/dev/null)" || return 1
  fi
  [ -n "$_src" ] || return 1
  _toks="$(printf '%s' "$_src" | grep -oE "require\([^)]*\)|path\.join\([^)]*\)" \
    | grep -oE "'[^']+'|\"[^\"]+\"" | tr -d "'\"" | tr '/' '\n' \
    | grep -vE '^(fs|path|assert|os|child_process|vm|util|crypto|ejs)$' | sort -u)"
  [ -n "$_toks" ] || return 1
  printf '%s\n' "$_toks" | grep -qxE 'draft|backtest|tools' && return 1
  printf '%s\n' "$_toks" | grep -qxE 'src|views' || return 1
  return 0
}

# B (site) owns these. A owns everything else.
b_owns() {
  case "$1" in
    # WAR-ROOM PRESENTATION SPLIT (Cory, approved 2026-08-09). The war-room SHELL
    # is B's now — layout, hierarchy, CSS, mobile, the single rehearsal indicator.
    # A keeps app.js (the logic + the markup it emits) and the draft module include
    # list, which lives in the A-owned partial below so A never edits B's shell.
    views/admin/_warroom_scripts.ejs) return 1 ;;   # A owns its module includes
    views/admin/warroom.ejs) return 0 ;;            # B owns the shell
    # Site-feature src/*.js modules — reassigned to B by SUBSTANCE (2026-08-09;
    # see TERRITORY.md § Substance reassignment). Imported only by src/routes/*,
    # never by draft/**. A keeps predledger/sleeper/prefs + shared infra.
    src/sidebets.js|src/betlogic.js|src/venmo.js|src/dashboard.js|src/ledger.js|src/notify.js) return 0 ;;
    # src/champs.js — the crown (defending champion, derived). League-visible site
    # feature, imported only by src/routes/member; never by draft/**. B by substance.
    src/champs.js) return 0 ;;
    # src/rivalries.js — Rivalry Game of the Week billing (+ the German egg). Same
    # substance: league-visible, imported only by src/routes/member. B.
    src/rivalries.js) return 0 ;;
    # src/matchup.js — slot-aligned matchup starters (QB vs QB). In-season site
    # surface, imported only by src/routes/member; never by draft/**. B by substance.
    src/matchup.js) return 0 ;;
    # ⚠️ SHARED-FILE EDIT BY B, 2026-08-11 — banner per Cory's three-session rule.
    # src/recap.js — the weekly recap's story generator. Pure text over a week of
    # Sleeper data; imported only by src/routes/*, never by draft/**. Same
    # substance test as the six above, claimed the same way. A: if this collides
    # with anything in your lane, say so and I will move it.
    src/recap.js) return 0 ;;
    views/*|src/routes/*|public/css/*|public/icons/*|public/*.webmanifest) return 0 ;;
    public/js/*) case "$1" in public/js/draft/*) return 1 ;; *) return 0 ;; esac ;;
    # ── B'S WORKFLOWS, by the same substance test as its src/*.js files ──────
    # Narrowing shared() to repo-wide workflows would otherwise drop these into
    # A's lane by default — B has never been NAMED here because the blanket
    # `shared` entry meant nobody had to be. These run B's member-facing features
    # (the Sunday alert, the weekly recap, the annual reset) and B maintains them.
    .github/workflows/sunday-alert.yml|.github/workflows/weekly-recap.yml) return 0 ;;
    .github/workflows/annual.yml|.github/workflows/annual-key-smoke.yml) return 0 ;;
    docs/queued/league-history-page.md|docs/queued/history-chronicle-voice.md) return 0 ;;
    docs/queued/contact-directory.md) return 0 ;;
    # A test for a B-owned surface is B's — derived from what it reaches into.
    draft/tests/*.test.js) _js_test_lane_is_b "$1" && return 0 || return 1 ;;
    *) return 1 ;;
  esac
}

# ── C — THE EXTERNAL INGEST (session C, 2026-08-11) ─────────────────────────
# C owns MFL league discovery, the ADP-snapshot fetch, the crosswalk at scale,
# the replay harness, attrition reporting, and nflverse when it starts: the
# ingest modules, their tests, and the workflows that run them.
#
# NAMED BY FILE, NOT BY DIRECTORY, and that is deliberate. draft/backtest/ also
# holds the market layer (market_*.py) and every experiment — all A's. A
# directory rule would have handed C two thirds of A's lane by accident.
#
# C DOES NOT DEPLOY and does not touch the engine, the Lab, valuation, the
# ledger, config, the app or any view; it parks precise requests instead.
# A still owns the ingest's CONSUMERS — anything in the Lab that eats what C
# produces, and the graduation gate any external finding passes through.
c_owns() {
  case "$1" in
    # PREFIXES, NOT A FILE LIST — and still NOT the directory.
    #
    # The first version enumerated files, and C's next two commits trespassed
    # immediately: external_replay_run.py and its test are obviously the replay
    # harness, obviously C's, and obviously not on a list written before they
    # existed. A guard that blocks a session for doing exactly its job is friction
    # that gets the guard switched off, which is worse than no guard.
    #
    # draft/backtest/ ALSO holds the market layer (market_*) and every experiment
    # (exp*), all A's — so this matches ingest-specific PREFIXES rather than the
    # directory. A directory rule would hand C two thirds of A's lane by accident.
    draft/backtest/mfl_*) return 0 ;;
    # BROADENED 2026-08-11, THIRD TIME THE LIST WAS SHORT. C created
    # external_replay_run.py, then discovery_probe.py and external_adp_capture.py
    # — each obviously ingest ("MFL league discovery, the ADP-snapshot fetch" is
    # C's lane verbatim) and each blocked a merge. Verified against origin/main
    # first: NO A-owned file in draft/backtest starts with `external_` or
    # `discovery_`. A's prefixes there are exp*, market*, bbm*, opponent*,
    # override*, lab*.
    draft/backtest/external_*) return 0 ;;
    draft/backtest/discovery_*) return 0 ;;
    draft/backtest/adp_asof_*) return 0 ;;
    draft/backtest/ingest_*) return 0 ;;
    draft/backtest/crosswalk*|draft/backtest/nflverse*) return 0 ;;
    # ── A TEST FILE FOLLOWS ITS MODULE ──────────────────────────────────────
    #
    # Cory's ruling, 2026-08-11, after `draft/tests/test_external_outcomes.py`
    # landed on A's side of the line while its module
    # `draft/backtest/external_outcomes.py` was C's. Nobody decided that; the
    # test patterns were a hand-written list and the module patterns were
    # prefixes, so the two drifted the moment C added a module whose test name
    # was not already enumerated. A module and its test on opposite sides
    # produces a real collision the first time one side changes both.
    #
    # DERIVED, NOT LISTED. `test_<x>.py` asks who owns `<x>.py` and answers the
    # same. A new C module carries its test automatically, and the list cannot
    # drift from the prefixes again because it is no longer a separate list.
    #
    # The explicit entries below survive ONLY for tests whose module name does
    # not match the file they test — they are exceptions now, not the mechanism,
    # and each is a candidate for a rename rather than a permanent entry.
    draft/tests/test_*.py)
      _t="${1#draft/tests/test_}"; _t="${_t%.py}"
      for _m in "draft/backtest/${_t}.py" "draft/${_t}.py"; do
        if [ -e "$_m" ] || [ -n "${TERRITORY_ASSUME_MODULE:-}" ]; then
          c_owns "$_m" && return 0
        fi
      done
      # EXCEPTIONS — the test is named for what it CHECKS, not for its module.
      # Each is verified against the file's own imports, not guessed:
      #   test_crosswalk_known_answers.py  imports mfl_adapter   (C)
      #   test_attrition_seam.py           imports ingest_filters (C)
      # `test_nflverse*` was dropped: no such test exists, and when C adds one the
      # derivation above will pick it up from draft/backtest/nflverse*.py without
      # an edit here — which is the whole point of deriving.
      case "$1" in
        draft/tests/test_attrition*|draft/tests/test_crosswalk*) return 0 ;;
      esac
      return 1 ;;
    # ── WORKFLOWS DERIVE FROM THE SAME PREFIXES AS THE MODULES ──────────────
    #
    # THE SECOND DEAD LIST, found by asking Cory's question once (2026-08-11).
    # This used to name three files — adp-asof-probe, mfl-probe, mfl-schema-probe
    # — and it had BOTH defects at once:
    #
    #   · UNREACHABLE: `shared()` claimed `.github/workflows/*` and runs before
    #     ownership, so these three lines never executed. Same disease as the
    #     test-name list, in the same function, and it survived that fix.
    #   · STALE: C has EIGHT ingest workflows on disk. The list named three.
    #     external-adp-capture, external-discovery, external-ingest-run,
    #     external-outcomes-probe and discovery-probe were never in it.
    #
    # Both are the hand-written-list failure. The names already carry the lane —
    # they use the SAME prefixes as C's modules — so they are derived here
    # instead, and cannot drift from the modules again.
    .github/workflows/mfl-*|.github/workflows/external-*) return 0 ;;
    .github/workflows/discovery-*|.github/workflows/adp-asof-*) return 0 ;;
    INGEST-PLAN.md) return 0 ;;
    *) return 1 ;;
  esac
}

# Files BOTH sides legitimately append to. Coordinated by convention, not lock:
# append-only, never rewrite, and rebase before push.
shared() {
  case "$1" in
    STATUS.md|PARKED.md|DECISIONS-NEEDED.md|TASK-AUDIT.md|TERRITORY.md) return 0 ;;
    # Shared coordination infra: the split's own enforcement, maintained by both.
    scripts/territory-check.sh|scripts/branch-check.sh) return 0 ;;
    # ── draft/tests/* IS NO LONGER BLANKET-SHARED ───────────────────────────
    #
    # A GUARD THAT EXISTED AND DID NOT GUARD. This entry claimed every test file
    # for both lanes, which means `c_owns` was NEVER CONSULTED for any test —
    # `shared()` short-circuits it. So the whole list of test-name patterns
    # inside c_owns (test_mfl_*, test_ingest_*, test_crosswalk*, …) has been
    # DEAD CODE for its entire life. It looked like ownership was being decided.
    # It was not. Found 2026-08-11 while fixing what looked like a gap in that
    # list, by writing the first test that actually asked the question.
    #
    # The old comment stated the right principle — "a test follows the substance
    # of what it serves" — and implemented it as `shared`, which is a convention
    # with no enforcement. Cory's ruling makes it structural: a test follows its
    # MODULE, and c_owns derives that. So the entry is removed and the derivation
    # becomes reachable.
    #
    # ── ONLY REPO-WIDE WORKFLOWS ARE SHARED ─────────────────────────────────
    #
    # `.github/workflows/*` was blanket-shared, which made the three C workflow
    # entries in c_owns unreachable — the same shadowing that made every
    # test-name pattern dead. Narrowed to the workflows that genuinely serve the
    # WHOLE REPO rather than one lane's feature: ci.yml runs both suites and every
    # shell guard; deploy-verify, site-check and self-audit check the deployed
    # artifact, not a lane.
    #
    # Everything else follows the feature it runs, by the same prefixes that own
    # the code. A lane-specific workflow is as much that lane's as its module is.
    .github/workflows/ci.yml|.github/workflows/deploy-verify.yml) return 0 ;;
    .github/workflows/site-check.yml|.github/workflows/self-audit.yml) return 0 ;;
    *) return 1 ;;
  esac
}

# MERGE-AWARENESS. During an integration (A owns merging both lanes into `main`),
# the working tree legitimately contains the OTHER lane's files. A check that failed
# on every integration would train us to ignore it — the deploy-verify failure mode.
# So a would-be trespass is EXEMPT when the file is byte-identical to the integration
# source ref: a MERGED file matches its source exactly; an EDITED one does not. This
# passes a clean integration and still fails loudly if you actually modified a file in
# the other lane. Override the ref with TERRITORY_INTEGRATION_REF (default origin/main).
INTEG_REF="${TERRITORY_INTEGRATION_REF:-origin/main}"
has_ref=0
git rev-parse --verify -q "$INTEG_REF^{commit}" >/dev/null 2>&1 && has_ref=1

# 0 (true) when the working-tree file is byte-identical to INTEG_REF's version —
# i.e. it was merged in from the integration source, not edited here.
matches_source() {
  [ "$has_ref" = 1 ] || return 1
  git cat-file -e "$INTEG_REF:$1" 2>/dev/null || return 1   # not on the source ref -> a real add
  git diff --quiet "$INTEG_REF" -- "$1" 2>/dev/null         # empty diff -> identical -> merged
}

# WHICH FILES ARE WE JUDGING?
#
# By default the WORKING TREE, which is what a pre-commit check wants.
# With `--range BASE REF` the files a BRANCH changed, which is what integration
# wants — and the distinction is not cosmetic. integrate.sh first tried to judge a
# branch by checking it out and reading the working tree, but an `git checkout`
# carries uncommitted and untracked files across, so A's own work-in-progress got
# attributed to C and the merge was refused for files C never touched.
RANGE_BASE=""; RANGE_REF=""
if [ "${2:-}" = "--range" ]; then RANGE_BASE="${3:-}"; RANGE_REF="${4:-}"; fi
file_list() {
  if [ -n "$RANGE_BASE" ] && [ -n "$RANGE_REF" ]; then
    git diff --name-only "$RANGE_BASE" "$RANGE_REF"
  else
    git diff --name-only; git diff --cached --name-only
    git ls-files --others --exclude-standard
  fi
}

trespass=0; shared_n=0; merged_n=0
report_trespass() {   # $1=file $2=who
  if matches_source "$1"; then merged_n=$((merged_n+1)); return; fi
  echo "TRESPASS ($2): $1"; trespass=$((trespass+1))
}
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if shared "$f"; then shared_n=$((shared_n+1)); continue; fi
  # ONE SENTENCE FOR EVERY SIDE: a file you touched must be yours or shared.
  # The old form asked a different question per side, which is how the C case
  # silently became "did C touch B's files".
  if c_owns "$f"; then own="C"
  elif b_owns "$f"; then own="B"
  else own="A"; fi
  [ "$own" = "$SIDE" ] || report_trespass "$f" "$SIDE touched ${own}'s file"
done < <(file_list)

[ "$shared_n" -gt 0 ] && echo "note: $shared_n shared file(s) touched — APPEND ONLY, rebase before push"
[ "$merged_n" -gt 0 ] && echo "note: $merged_n file(s) from the other lane are byte-identical to $INTEG_REF — merged, not edited (integration-exempt)"
if [ "$trespass" -gt 0 ]; then
  echo "FAIL: $trespass file(s) outside side $SIDE's territory (and NOT a clean merge from $INTEG_REF). See TERRITORY.md."
  exit 1
fi
echo "OK: side $SIDE stayed in its territory"
