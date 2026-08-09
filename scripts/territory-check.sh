#!/usr/bin/env bash
# TERRITORY CHECK — flags a parallel session touching the other's files.
#
# Usage:  bash scripts/territory-check.sh A     (draft path + Lab)
#         bash scripts/territory-check.sh B     (site)
#
# Checks UNCOMMITTED changes against the declared split. Exits non-zero on a
# trespass so it can gate a commit.
#
# ⚠️ READ TERRITORY.md FIRST. The split is NOT draft-vs-Lab — the Lab imports
# draft-path modules directly and cannot be separated from them.
set -uo pipefail
cd "$(dirname "$0")/.."

SIDE="${1:-}"
[ -n "$SIDE" ] || { echo "usage: territory-check.sh A|B"; exit 2; }

# B (site) owns these. A owns everything else.
b_owns() {
  case "$1" in
    # THE WAR ROOM VIEW IS A's, despite living under views/. It IS the draft
    # surface — the split is by SUBSTANCE, not by directory, and this exception
    # was found by the check failing on A's own legitimate work.
    views/admin/warroom.ejs) return 1 ;;
    # Site-feature src/*.js modules — reassigned to B by SUBSTANCE (2026-08-09;
    # see TERRITORY.md § Substance reassignment). Imported only by src/routes/*,
    # never by draft/**. A keeps predledger/sleeper/prefs + shared infra.
    src/sidebets.js|src/betlogic.js|src/venmo.js|src/dashboard.js|src/ledger.js|src/notify.js) return 0 ;;
    views/*|src/routes/*|public/css/*|public/icons/*|public/*.webmanifest) return 0 ;;
    public/js/*) case "$1" in public/js/draft/*) return 1 ;; *) return 0 ;; esac ;;
    docs/queued/league-history-page.md|docs/queued/history-chronicle-voice.md) return 0 ;;
    docs/queued/contact-directory.md) return 0 ;;
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
    # Shared TEST infra: draft/tests holds tests for BOTH lanes — a test follows
    # the substance of the module it tests (venmo/sidebets/access_guard are B's,
    # engine/mcts are A's). ci.yml wires them. Append-only, rebase before push.
    draft/tests/*|.github/workflows/ci.yml) return 0 ;;
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

trespass=0; shared_n=0; merged_n=0
report_trespass() {   # $1=file $2=who
  if matches_source "$1"; then merged_n=$((merged_n+1)); return; fi
  echo "TRESPASS ($2): $1"; trespass=$((trespass+1))
}
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if shared "$f"; then shared_n=$((shared_n+1)); continue; fi
  if [ "$SIDE" = "B" ]; then
    b_owns "$f" || report_trespass "$f" "B touched A's file"
  else
    if b_owns "$f"; then report_trespass "$f" "A touched B's file"; fi
  fi
done < <(git diff --name-only; git diff --cached --name-only; git ls-files --others --exclude-standard)

[ "$shared_n" -gt 0 ] && echo "note: $shared_n shared file(s) touched — APPEND ONLY, rebase before push"
[ "$merged_n" -gt 0 ] && echo "note: $merged_n file(s) from the other lane are byte-identical to $INTEG_REF — merged, not edited (integration-exempt)"
if [ "$trespass" -gt 0 ]; then
  echo "FAIL: $trespass file(s) outside side $SIDE's territory (and NOT a clean merge from $INTEG_REF). See TERRITORY.md."
  exit 1
fi
echo "OK: side $SIDE stayed in its territory"
