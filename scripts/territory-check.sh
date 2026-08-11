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
    views/*|src/routes/*|public/css/*|public/icons/*|public/*.webmanifest) return 0 ;;
    public/js/*) case "$1" in public/js/draft/*) return 1 ;; *) return 0 ;; esac ;;
    docs/queued/league-history-page.md|docs/queued/history-chronicle-voice.md) return 0 ;;
    docs/queued/contact-directory.md) return 0 ;;
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
    draft/backtest/mfl_adapter.py|draft/backtest/mfl_adp.py) return 0 ;;
    draft/backtest/mfl_live_probe.py|draft/backtest/mfl_schema_probe.py) return 0 ;;
    draft/backtest/mfl_live_probe.json|draft/backtest/mfl_schema_probe.json) return 0 ;;
    draft/backtest/adp_asof_probe.py|draft/backtest/ingest_filters.py) return 0 ;;
    draft/backtest/external_replay.py) return 0 ;;
    draft/tests/test_mfl_adapter.py|draft/tests/test_mfl_schema_probe.py) return 0 ;;
    draft/tests/test_adp_asof_probe.py|draft/tests/test_attrition_seam.py) return 0 ;;
    draft/tests/test_external_replay.py|draft/tests/test_ingest_filters.py) return 0 ;;
    .github/workflows/adp-asof-probe.yml) return 0 ;;
    .github/workflows/mfl-probe.yml|.github/workflows/mfl-schema-probe.yml) return 0 ;;
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
    # Shared TEST + CI infra: draft/tests holds tests for BOTH lanes, and each
    # side maintains the WORKFLOWS for the features it owns (A: lab/self-audit/
    # deploy-verify…; B: sunday-alert…). A test/workflow follows the substance of
    # what it serves. Append-only, rebase before push; neither rewrites the other's.
    draft/tests/*|.github/workflows/*) return 0 ;;
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
