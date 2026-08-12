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
    # BROADENED 2026-08-11 (FOURTH TIME, by C, announced as a cross-lane fix).
    # `within_pool_adp.py` is D7 — ADP built from the pool's own earlier picks —
    # created by C in 38d4391 and squarely "the ADP-snapshot fetch" from C's lane
    # description. It blocked C's first self-integration.
    #
    # VERIFIED THE SAME WAY THE PREVIOUS THREE WERE, against origin/main: no
    # A-owned file starts with `within_pool`. NOT broadened for `survival*`, which
    # LOOKS equally obvious and is not — `draft/tests/survival-memo.test.js` and
    # `survival_honesty.test.js` are A's, and that prefix would hand C two of A's
    # files, which is the exact accident the directory rule was rejected to avoid.
    draft/backtest/within_pool_*) return 0 ;;
    draft/tests/test_within_pool_*) return 0 ;;
    draft/backtest/crosswalk*|draft/backtest/nflverse*) return 0 ;;
    # FOURTH TIME THE LIST WAS SHORT (2026-08-11). within_pool_adp.py is D7 —
    # ADP built from the discovered pool's own earlier drafts — and its own
    # docstring registers it in INGEST-PLAN.md, which is C's plan. Clearly C's,
    # and blocked C's whole branch for one file.
    #
    # INVERTING THE DIRECTORY WAS CONSIDERED AND MEASURED, NOT ASSUMED. "A owns
    # exp*/market*/bbm*/opponent*/override*/lab*, everything else in
    # draft/backtest is C's" would be durable — but 23 A-owned files there match
    # none of those prefixes (grade.py, money_grade.py, tournament.py,
    # forecast_grade.py, roster_sim.py, …), so inverting hands C two dozen A
    # files. The comment above that lists A's prefixes is INCOMPLETE; it is left
    # in place but must not be relied on as exhaustive.
    #
    # So this stays an enumerated addition, and the durable fix is a decision for
    # Cory and C rather than another entry: either C adopts a prefix convention,
    # or ownership derives from a declaration inside the file. Recorded in
    # TERRITORY.md rather than solved here.
    draft/backtest/within_pool_adp*) return 0 ;;
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
        # EXISTENCE IS CHECKED IN THE REF, NOT THE WORKING TREE — the same bug
        # the JS derivation above hit, in the half that was already shipped.
        # In --range mode the module lives on the BRANCH being judged and is not
        # on disk here, so `[ -e ]` was false, the derivation never ran, and the
        # test fell through to A. It blocked C's entire branch on one file:
        # within_pool_adp.py was accepted by the entry above while its own test
        # was refused, so a module and its test landed on opposite sides —
        # exactly the collision this derivation was written to prevent.
        if [ -e "$_m" ] \
           || { [ -n "${RANGE_REF:-}" ] && git cat-file -e "$RANGE_REF:$_m" 2>/dev/null; } \
           || [ -n "${TERRITORY_ASSUME_MODULE:-}" ]; then
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
    # ⚠️ SHARED-FILE EDIT BY C, 2026-08-12 — banner per Cory's three-session rule.
    # THE TESTS COME WITH THEM, and leaving them out was the same hole this file
    # already found once: `*.test.js` had no rule, fell through to the default and
    # silently became A's, including fifteen tests written for B's surfaces.
    # `territory-check.sh` is shared because both sides maintain it — but its test
    # was A's, so C could change the guard and could NOT update the test that
    # pins the change. A shared file whose test is not shared has a test that goes
    # stale by construction, which is worse than no test: it keeps passing while
    # describing behaviour the file no longer has.
    scripts/territory-check.sh|scripts/branch-check.sh) return 0 ;;
    scripts/territory-check.test.sh|scripts/branch-check.test.sh) return 0 ;;
    # ⚠️ SHARED-FILE EDIT BY B, 2026-08-11 — banner per Cory's three-session rule.
    # ── *.test.js STAYS SHARED, BECAUSE NOTHING DERIVES ITS OWNER YET ────────
    #
    # Narrowing `draft/tests/*` replaced the blanket entry with a derivation for
    # `test_*.py` only. `*.test.js` was left with no rule, fell through to the
    # default, and every JS test silently became A's — including the fifteen
    # written for B surfaces this week. The first edit to one of them reported
    # `TRESPASS (B touched B's own test)`, which is how it was found.
    #
    # I TRIED TO DERIVE IT AND IT DOES NOT DERIVE. `test_<x>.py` works because a
    # Python test names its module. These do not: they are named for what they
    # CHECK (matchup_arithmetic, bank_arithmetic, pickem_copy) and most are
    # INTEGRATION tests that drive a surface over HTTP — draft_sheet_tiers
    # requires only store/data/auth/server-app and fetches /admin/draft-sheet,
    # so its require list says nothing about who owns the page it tests.
    # Deriving from fetched routes would need a second ownership model for URLs.
    #
    # So this restores yesterday's status for the JS half rather than inventing
    # one: shared, append-only. It is not the shadowing the note below fixed —
    # there is no JS derivation being shadowed, because there is none to reach.
    # ROUTED TO A: how a JS integration test should be owned is a boundary
    # decision, not a mechanical fix, and it is A's rule to settle.
    #
    # ── SETTLED BY A, 2026-08-11: THE BLANKET ENTRY IS REMOVED ──────────────
    # `shared()` is consulted BEFORE any ownership test and `continue`s, so this
    # entry made the JS derivation in b_owns UNREACHABLE the moment it landed —
    # the third instance of the exact shadowing this file documents twice below
    # (the old blanket draft/tests entry killed every c_owns test pattern; the
    # blanket .github/workflows entry killed C's three workflow entries). It
    # looked like ownership was being decided. It was not.
    # The derivation now exists, so the entry goes and the derivation is reached.

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

# ── THE OWNER IS DECLARED IN THE FILE (Cory, 2026-08-11) ────────────────────
#
# THE PREFIX LIST WENT SHORT FOUR TIMES. That is not a maintenance problem, it is
# the dual-maintenance disease inside the tool that exists to prevent collisions:
# a central list that must be updated whenever a file is added, with nothing
# forcing the update. Each time, a session was blocked from doing exactly its job.
#
# Inverting the directory was measured and rejected — 23 A-owned files in
# draft/backtest match none of A's named prefixes, so inverting hands C two dozen
# of them. Between a prefix convention and an in-file declaration, Cory took the
# declaration: a header line travels WITH the file and cannot drift from it,
# whereas a prefix convention still needs someone to name the file correctly and
# misclassifies silently when they do not — the same failure one layer up.
#
# A DECLARATION BEATS EVERY PATTERN, including shared(). It is the author saying
# whose lane this is, which is better evidence than any rule inferring it.
#
#     # TERRITORY: C          (python, shell)
#     // TERRITORY: B         (js)
#     <%# TERRITORY: B %>     (ejs)
#
# Read from the REF in --range mode, for the same reason the derivations are:
# the file may exist only on the branch being judged.
# A DECLARATION IS A HEADER, AND THE SCAN DEPTH SAYS SO.
#
# This read `head -40`, and TERRITORY.md documents the convention with a fenced
# example at lines 18-19:
#
#     # TERRITORY: C          (python, shell)
#     // TERRITORY: B         (js)
#
# so the file that DEFINES the convention was captured BY it — read as C-owned,
# which made every A edit to it a trespass and blocked BOTH lanes from
# integrating. A self-referential guard: the doc block is not a claim of
# ownership, it is a picture of one.
#
# MEASURED across every declaration in the repo before choosing the depth:
# 24 markers on line 1, 4 on line 2 (after a shebang), and NOTHING legitimate
# below line 2. TERRITORY.md's example at 18 is the only thing down there.
# 5 leaves room for a shebang and an encoding line and stays far above it.
#
# The failure direction is safe either way: a marker placed too low is not
# silently mis-assigned, it reports NO OWNER DECLARED and someone moves it up.
_declared_owner() {
  _d=""
  if [ -n "${RANGE_REF:-}" ]; then
    _d="$(git show "$RANGE_REF:$1" 2>/dev/null | head -5)" || _d=""
  fi
  [ -n "$_d" ] || { [ -f "$1" ] && _d="$(head -5 "$1" 2>/dev/null)"; }
  [ -n "$_d" ] || return 1
  _o="$(printf '%s' "$_d" | grep -oE 'TERRITORY:[[:space:]]*[ABC]\b' | head -1 \
        | grep -oE '[ABC]\b' | head -1)"
  [ -n "$_o" ] || return 1
  printf '%s' "$_o"
}

# WHERE A DECLARATION IS REQUIRED RATHER THAN OPTIONAL.
#
# Cory: "make a file with no declaration REFUSE rather than default. A default is
# how 101 files ended up in the wrong lane and how the prefix list went short
# four times without anyone noticing."
#
# SCOPED TO NEW FILES IN THE AMBIGUOUS ZONES, and that scope is the whole design
# rather than a softening of it. Outside draft/backtest and draft/tests the
# structural rules are unambiguous — views/**, src/routes/**, public/js/draft/**
# each belong to exactly one lane by construction, and no list goes short there.
# Inside them, ownership has always been guessed from a name. And requiring a
# declaration on EXISTING files would refuse hundreds of them at once, blocking
# all three sessions to fix a problem that only bites when a file is ADDED —
# which is when every one of the four short-list incidents happened.
_needs_declaration() {
  case "$1" in
    draft/backtest/*|draft/tests/*) return 0 ;;
    *) return 1 ;;
  esac
}

# ADDED IN THIS RANGE? Only answerable with a range; in working-tree mode an
# untracked file is the equivalent, and both are "a file that did not exist
# before this work".
NEW_ONLY_DECL="${TERRITORY_REQUIRE_DECLARATION:-1}"
is_new_in_range() {
  # GRANDFATHERED: anything already on the integration ref existed before this
  # rule and is not made retroactively illegal by it. Without this the very next
  # integration refuses every file merged earlier today — a rule that starts by
  # blocking the work it was written to unblock. The exemption is self-clearing:
  # a file is exempt exactly once, by already being merged.
  if [ "$has_ref" = "1" ] && git cat-file -e "$INTEG_REF:$1" 2>/dev/null; then
    return 1
  fi
  if [ -n "${RANGE_BASE:-}" ] && [ -n "${RANGE_REF:-}" ]; then
    git diff --name-status "$RANGE_BASE" "$RANGE_REF" 2>/dev/null \
      | awk -v f="$1" '$1=="A" && $2==f {found=1} END{exit !found}'
    return $?
  fi
  git ls-files --others --exclude-standard | grep -qxF "$1"
}

# ── AUTHORISED CROSS-LANE EXCEPTIONS ────────────────────────────────────────
#
# ⚠️ SHARED-FILE EDIT BY C, 2026-08-12 — banner per Cory's three-session rule.
#
# NOT A GENERAL ESCAPE HATCH, and it is deliberately shaped so it cannot become
# one. Each entry is ONE side and ONE exact path, granted by Cory in writing for
# a NAMED edit, and every entry PRINTS on every run — an exception nobody can
# see is a hole, and this is meant to be an audit line.
#
# EACH ENTRY IS MEANT TO BE DELETED once the owning side has reviewed the edit at
# its next boundary. If you are reading this and the referenced edit is long since
# reviewed, removing the entry is the correct action, not a cleanup someone should
# ask permission for.
#
# WHY IT EXISTS AT ALL. Cory authorised C to register two kinds in A's
# `src/predledger.js` on 2026-08-12: main was red on the contract test, which
# refuses integration, and it blocked eleven commits of D3 capture hardening nine
# days before the draft. The guard then refused the authorised edit, so the
# authorisation could not be executed. The choice was to bypass the guard silently
# or to record the exception inside it. This is the second one.
authorised_exception() {   # $1=file, $2=side
  case "$2:$1" in
    # C in A's file. Two entries in KINDS registering `opponent_prediction` and
    # `opponent_prediction_resolved`, both emitted by public/js/draft/app.js and
    # registered nowhere, so both 400 and the draft-night record is lost. A
    # reviews at its next boundary and reverts if wrong. REMOVE AFTER THAT REVIEW.
    "C:src/predledger.js") return 0 ;;
    *) return 1 ;;
  esac
}

trespass=0; shared_n=0; merged_n=0; exception_n=0
report_trespass() {   # $1=file $2=who
  if matches_source "$1"; then merged_n=$((merged_n+1)); return; fi
  if authorised_exception "$1" "$SIDE"; then
    echo "AUTHORISED CROSS-LANE EXCEPTION (see authorised_exception in this file): $1"
    exception_n=$((exception_n+1)); return
  fi
  echo "TRESPASS ($2): $1"; trespass=$((trespass+1))
}
undeclared=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  # A DECLARATION WINS OVER EVERY PATTERN, shared() included.
  if _dec="$(_declared_owner "$f")"; then
    [ "$_dec" = "$SIDE" ] || report_trespass "$f" "$SIDE touched ${_dec}'s file (declared in-file)"
    continue
  fi
  if [ "$NEW_ONLY_DECL" = "1" ] && _needs_declaration "$f" && is_new_in_range "$f"; then
    echo "NO OWNER DECLARED: $f"
    undeclared=$((undeclared+1)); continue
  fi
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
[ "$exception_n" -gt 0 ] && echo "note: $exception_n AUTHORISED cross-lane exception(s) applied — each is a named, dated grant meant to be REMOVED after the owning side reviews"
if [ "$undeclared" -gt 0 ]; then
  echo "FAIL: $undeclared NEW file(s) in draft/backtest or draft/tests with no owner declared."
  echo "  Add a header line naming the lane — it travels with the file and cannot"
  echo "  drift from it, which a central prefix list demonstrably does (short four"
  echo "  times). One of:"
  echo "      # TERRITORY: C        (python, shell)"
  echo "      // TERRITORY: B       (js)"
  echo "  A default is exactly how the prefix list went short without anyone noticing."
  exit 1
fi
if [ "$trespass" -gt 0 ]; then
  echo "FAIL: $trespass file(s) outside side $SIDE's territory (and NOT a clean merge from $INTEG_REF). See TERRITORY.md."
  exit 1
fi
echo "OK: side $SIDE stayed in its territory"
