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
    *) return 1 ;;
  esac
}

trespass=0; shared_n=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if shared "$f"; then shared_n=$((shared_n+1)); continue; fi
  if [ "$SIDE" = "B" ]; then
    b_owns "$f" || { echo "TRESPASS (B touched A's file): $f"; trespass=$((trespass+1)); }
  else
    if b_owns "$f"; then echo "TRESPASS (A touched B's file): $f"; trespass=$((trespass+1)); fi
  fi
done < <(git diff --name-only; git diff --cached --name-only; git ls-files --others --exclude-standard)

[ "$shared_n" -gt 0 ] && echo "note: $shared_n shared file(s) touched — APPEND ONLY, rebase before push"
if [ "$trespass" -gt 0 ]; then
  echo "FAIL: $trespass file(s) outside side $SIDE's territory. See TERRITORY.md."
  exit 1
fi
echo "OK: side $SIDE stayed in its territory"
