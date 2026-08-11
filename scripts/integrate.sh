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
# ── 2b. THE GUARD, FROM *BOTH* PERSPECTIVES, AUTOMATICALLY ──────────────────
# My own miss is why this is here rather than in a checklist: I edited B's files
# (src/notify.js, src/routes/*) without ever running territory-check, and the
# guard I own would have caught me. A GUARD THAT EXISTS BUT IS NOT EXECUTED IS
# FUNCTIONALLY CLOSE TO NO GUARD, so execution is automatic rather than
# remembered. The branch is checked as its own side above; main is checked as
# A here, so a trespass in EITHER direction stops the merge.
echo "== territory: has main's side stayed in ITS lane?"
if ! bash scripts/territory-check.sh A --range "$BASE" origin/main; then
  echo "REFUSED: main contains edits outside side A's lane. Nothing merged."
  exit 1
fi

# ── APPEND-ONLY / UNION-MERGE FILES — A CLASS, NOT AN INSTANCE ──────────────
# PARKED.md, DECISIONS-NEEDED.md and TERRITORY.md now cross all three sessions.
# Both sides append at the end, so nothing conflicts in the ordinary sense — and
# picking a side DISCARDS the other's work while the file reads as intact. It
# silently dropped A's DECISIONS-NEEDED gate proposal once already, caught only
# by grepping for the section afterwards.
#
# OURS-VS-THEIRS IS NEVER OFFERED FOR THESE. They are unioned deterministically
# (base, then mine, then theirs) before the merge is even attempted, so the merge
# cannot present them as a choice.
UNION_FILES="PARKED.md DECISIONS-NEEDED.md TERRITORY.md STATUS.md TASK-AUDIT.md"

echo "== merging into main"
git checkout -q main || { echo "FAIL: cannot checkout main"; exit 1; }
MERGE_RC=0
git merge --no-commit --no-edit "$REF" >/dev/null 2>&1 || MERGE_RC=1

# Union the append-only files FIRST, whether or not git flagged them.
for f in $UNION_FILES; do
  git cat-file -e "origin/main:$f" 2>/dev/null || continue
  git cat-file -e "$REF:$f" 2>/dev/null || continue
  mine=$(mktemp); theirs=$(mktemp); base=$(mktemp)
  git show "origin/main:$f" > "$mine"
  git show "$REF:$f"        > "$theirs"
  git show "$BASE:$f"       > "$base" 2>/dev/null || : > "$base"
  git merge-file --union "$mine" "$base" "$theirs" >/dev/null 2>&1
  if grep -qE '^<<<<<<<|^>>>>>>>' "$mine"; then
    echo "REFUSED: $f could not be unioned cleanly — resolve by hand."
    rm -f "$mine" "$theirs" "$base"; git merge --abort 2>/dev/null; exit 1
  fi
  cp "$mine" "$f"; git add "$f"
  echo "   union-merged $f (append-only class — never ours-vs-theirs)"
  rm -f "$mine" "$theirs" "$base"
done

# Anything STILL conflicted is a real semantic conflict and must be resolved
# deliberately. The union pass above means it is never one of these five files.
if git diff --name-only --diff-filter=U | grep -q .; then
  echo "REFUSED: semantic conflict in:"
  git diff --name-only --diff-filter=U | sed 's/^/     /'
  echo "  Resolve deliberately, do not force."
  git merge --abort 2>/dev/null
  exit 1
fi
if [ "$MERGE_RC" != 0 ] && ! git diff --cached --quiet; then :; fi

# THE APPEND-ONLY DROP IS ASSERTED, NOT ASSUMED. Every heading present on either
# side must survive into the merged file — the check that caught the drop by hand.
for f in $UNION_FILES; do
  [ -f "$f" ] || continue
  for side in "origin/main" "$REF"; do
    git cat-file -e "$side:$f" 2>/dev/null || continue
    missing=$(git show "$side:$f" | grep -E '^#{1,3} ' | while IFS= read -r h; do
      grep -qxF "$h" "$f" || echo "$h"; done | head -3)
    if [ -n "$missing" ]; then
      echo "REFUSED: $f lost heading(s) from $side:"; echo "$missing" | sed 's/^/     /'
      git merge --abort 2>/dev/null; exit 1
    fi
  done
done
echo "   append-only headings from BOTH sides verified present"

# COMMIT THE MERGE. The union pass needs --no-commit, and the first version of
# that rewrite never added the commit back — so a "successful" integration left
# C's work STAGED WITH NO MERGE_HEAD: an unrecorded merge that looks clean in
# `git log` and vanishes on the next checkout. Found by a checkout refusing to
# switch branches over a modified INGEST-PLAN.md, not by the script, which had
# already printed OK.
if ! git diff --cached --quiet || [ "$MERGE_RC" != 0 ]; then
  git commit -q --no-edit -m "Merge $BRANCH (side $SIDE) via integrate.sh" \
    || { echo "REFUSED: could not commit the merge"; git merge --abort 2>/dev/null; exit 1; }
fi
# AND ASSERT IT LANDED, before the suites run. Green on a staged tree reads
# exactly like green on a merged one, which is how this got as far as a push.
if ! git merge-base --is-ancestor "$REF" HEAD; then
  echo "REFUSED: $REF is not an ancestor of HEAD — the merge did not commit."
  exit 1
fi
echo "   merge committed: $(git log --oneline -1)"

echo "== python suite"
if ! timeout 600 python -m pytest draft/tests -q </dev/null; then
  echo "REFUSED: python suite red on the merged tree. Rolling main back."
  git reset --hard -q ORIG_HEAD; exit 1
fi
# ── JS SUITES: A TIMEOUT IS NOT A FAILURE ───────────────────────────────────
# The cap was 150s and sanity-sweep.test.js legitimately takes ~206s since the
# conservation tilt went live. So MY OWN CHOSEN TIMEOUT manufactured a red and
# rolled back a good merge of B's branch — the same class as a chosen header or
# timeout manufacturing a provider-shaped null (clause 11e), applied to my own
# tooling.
#
# Two changes: the cap is 400s, and exit 124 is reported as INCONCLUSIVE rather
# than folded into "red". A bounded run that proved nothing must never read as a
# suite that failed.
JS_TMO="${INTEGRATE_JS_TIMEOUT:-400}"
echo "== js suites (per-suite timeout ${JS_TMO}s)"
red=""; slow=""
for f in draft/tests/*.test.js; do
  timeout "$JS_TMO" node "$f" >/dev/null 2>&1 </dev/null
  rc=$?
  if [ "$rc" = 124 ]; then slow="$slow $(basename "$f" .test.js)"
  elif [ "$rc" != 0 ]; then red="$red $(basename "$f" .test.js)"; fi
done
if [ -n "$slow" ]; then
  echo "REFUSED: JS suite(s) TIMED OUT at ${JS_TMO}s:$slow"
  echo "  INCONCLUSIVE, not a failure — raise INTEGRATE_JS_TIMEOUT or fix the suite."
  echo "  Rolling main back rather than merging on evidence that does not exist."
  git reset --hard -q ORIG_HEAD; exit 1
fi
if [ -n "$red" ]; then
  echo "REFUSED: JS suites red on the merged tree:$red. Rolling main back."
  git reset --hard -q ORIG_HEAD; exit 1
fi

# ── THE TREE MUST BE CLEAN BEFORE THIS DECLARES SUCCESS ─────────────────────
# Cory's requirement, and it is the right generalisation of the bug rather than a
# patch on it. The missing-commit fault was caught by a CHECKOUT refusing to
# switch branches, not by this script, which had already printed OK and pushed.
# A merge tool that can exit with staged changes will do it again, in some other
# way I have not anticipated. So the exit condition is the STATE, not the steps:
# nothing staged, nothing modified, no merge in progress. Any residue is a
# failure regardless of which step left it.
RESIDUE="$(git status --porcelain)"
if [ -n "$RESIDUE" ] || [ -f .git/MERGE_HEAD ]; then
  echo "REFUSED: integration finished with an UNCLEAN TREE — this is the state that"
  echo "  loses work on the next checkout, and it is a failure even though every"
  echo "  earlier step passed."
  [ -f .git/MERGE_HEAD ] && echo "  a merge is still in progress (MERGE_HEAD present)"
  echo "$RESIDUE" | sed 's/^/     /'
  exit 1
fi
echo "   tree clean: nothing staged, nothing modified, no merge in progress"

echo "OK: $BRANCH merged into main, both suites green."
if [ "$PUSH" = "--push" ]; then
  git push origin main && echo "pushed."
else
  echo "NOT PUSHED — run: git push origin main"
fi
