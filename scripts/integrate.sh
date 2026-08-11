#!/usr/bin/env bash
# INTEGRATE A SESSION'S BRANCH INTO main — A's job, made cheap so it happens.
#
# WHY THIS EXISTS. C cannot merge itself, and the single workflow blocking its
# ENTIRE program sat in PARKED.md waiting to be routed by a human. The cost of a
# merge was never the merge; it was the sequence of checks A had to remember to
# run, which is exactly the kind of thing that gets skipped under time pressure
# and then gets skipped permanently.
#
# So the sequence is one command, and it REFUSES rather than warns:
#   1. fetch the branch
#   2. verify the branch stayed in its own lane, FROM THAT SIDE'S PERSPECTIVE
#   3. run both suites on the merged tree
#   4. only then merge to main
#
# Nothing here pushes. The push stays a deliberate act.
#
# Usage:  bash scripts/integrate.sh <branch> <side A|B|C> [--push]
set -uo pipefail
cd "$(dirname "$0")/.."

BRANCH="${1:-}"; SIDE="${2:-}"; PUSH="${3:-}"
[ -n "$BRANCH" ] && [ -n "$SIDE" ] || { echo "usage: integrate.sh <branch> <A|B|C> [--push]"; exit 2; }
case "$SIDE" in A|B|C) ;; *) echo "side must be A, B or C"; exit 2 ;; esac

START_BRANCH="$(git branch --show-current)"
cleanup() { git checkout -q "$START_BRANCH" 2>/dev/null || true; }
trap cleanup EXIT INT TERM HUP

echo "== fetching $BRANCH"
git fetch -q origin "$BRANCH" || { echo "FAIL: cannot fetch $BRANCH"; exit 1; }
REF="origin/$BRANCH"

# ── 2. TERRITORY, FROM THE OTHER SIDE'S PERSPECTIVE ─────────────────────────
# The point of asking as SIDE rather than as A: A merging is legitimate, so an
# A-side check would exempt everything. The question that matters is whether the
# BRANCH stayed in its own lane before it ever reached me.
echo "== territory: did $BRANCH stay inside side $SIDE?"
# ASK ABOUT THE BRANCH, NOT THE WORKING TREE. The first version checked the
# branch out and let territory-check read the working tree — but a checkout
# carries uncommitted and untracked files across, so A's own work-in-progress was
# attributed to C and the merge was refused for two files C never touched. Found
# on the first dry run. `--range` judges exactly what the branch changed, using
# the SAME ownership definition rather than a second copy of it.
BASE="$(git merge-base origin/main "$REF")"
if ! bash scripts/territory-check.sh "$SIDE" --range "$BASE" "$REF"; then
  echo "REFUSED: $BRANCH touched files outside side $SIDE. Nothing merged."
  exit 1
fi

# ── 3. MERGE INTO main AND PROVE IT GREEN BEFORE ANYONE SEES IT ─────────────
echo "== merging into main"
git checkout -q main || { echo "FAIL: cannot checkout main"; exit 1; }
if ! git merge --no-edit -q "$REF"; then
  echo "REFUSED: merge conflict. Resolve deliberately, do not force."
  git merge --abort 2>/dev/null
  exit 1
fi

echo "== python suite"
if ! timeout 600 python -m pytest draft/tests -q </dev/null; then
  echo "REFUSED: python suite red on the merged tree. Rolling main back."
  git reset --hard -q ORIG_HEAD; exit 1
fi
echo "== js suites"
red=""
for f in draft/tests/*.test.js; do
  timeout 150 node "$f" >/dev/null 2>&1 </dev/null || red="$red $(basename "$f" .test.js)"
done
if [ -n "$red" ]; then
  echo "REFUSED: JS suites red on the merged tree:$red. Rolling main back."
  git reset --hard -q ORIG_HEAD; exit 1
fi

echo "OK: $BRANCH merged into main, both suites green."
if [ "$PUSH" = "--push" ]; then
  git push origin main && echo "pushed."
else
  echo "NOT PUSHED — run: git push origin main"
fi
