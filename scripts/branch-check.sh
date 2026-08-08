#!/usr/bin/env bash
# BRANCH CHECK — both sessions work directly on main. No feature branches, no
# session-named branches. Fails loudly before a commit if you are not on main.
#
# WHY THIS EXISTS (2026-08-08). Two sessions each committed to their own
# session-named branch — claude/new-session-jwdvn7 (A, draft/model) and
# claude/new-session-xs2lv6 (B, site/history). Neither was main. The work
# existed but was not connected to the thing that consumes it: main was stale,
# the deployed site was running old code, and neither session could see the
# other's work. Committed is not merged; branched is not deployed.
#
# THE FIX is not better merging — it is not diverging in the first place. The
# file-territory split (TERRITORY.md) already makes A and B edit disjoint files,
# so the territory IS the isolation. A branch only added a merge problem on top
# of an already-solved problem. So: everyone on main, pull --rebase before every
# commit, push immediately after.
#
# A rebase conflict under this model is therefore a SIGNAL, not a chore: it means
# two sessions edited the same file, which is a territory violation. Stop and
# report it — do not resolve it, and above all do not branch to escape it.
#
# Usage:  bash scripts/branch-check.sh        (gate a commit)
# Exit:   0 on main, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/.."

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "$branch" = "main" ]; then
  echo "OK: on main"
  exit 0
fi

echo "✋ NOT ON MAIN — you are on '$branch'."
echo "   Both sessions work directly on main (TERRITORY.md § Branch protocol)."
echo "   Do NOT commit here and do NOT push this branch. Instead:"
echo "     git stash            # if you have uncommitted work"
echo "     git checkout main"
echo "     git pull --rebase origin main"
echo "     git stash pop        # then commit on main, and push immediately"
exit 1
