#!/usr/bin/env bash
# TERRITORY: A  (shared infra — A owns scripts/, per TERRITORY.md)
#
# WHAT A LANE MUST SEE BEFORE IT REPORTS ANYTHING.
#
# TERRITORY.md already says it: "assume the other sessions read them at their
# next boundary rather than assuming Cory will relay", and "PULL BEFORE YOU
# START A UNIT." Both were true today and both were skipped, in both directions:
#
#   B reported `grep -c localStorage predledger.js -> 0` and routed the fix as
#     undone. It was done, on a pushed branch B had not fetched.
#   C reported main red on two A-owned participation tests, blocking every lane.
#     A clean origin/main worktree runs them 4/4 green; the actual red is C's own
#     test_nflverse_weekly_store.py failing on a pandas import CI never installs.
#
# Neither was carelessness. Both are what an INSTRUCTION produces when the thing
# it asks for is manual: it gets done until the moment it matters. Cory's own
# ruling on the scoring-path gate applies — PREFER A MECHANISM TO AN INSTRUCTION.
#
# So this script makes "pull before you start" the default rather than a habit,
# and it is deliberately READ-ONLY: it fetches and reports, it never merges,
# rebases or checks anything out. A tool that mutates your tree at session start
# is a tool people disable.
#
#   bash scripts/lane-start.sh [A|B|C]
#
# Exit code is always 0 — this informs, it does not gate. A gate that fires at
# session start on a stale fetch would train people to skip it.
set -uo pipefail
LANE="${1:-${MAGA_LANE:-}}"
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

say() { printf '%s\n' "$*"; }
say "── LANE START ─────────────────────────────────────────────────────────"

BR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
say "  branch: $BR${LANE:+   lane: $LANE}"

# 1. FETCH. The whole point. Failure is reported, never fatal.
if git fetch --quiet origin main 2>/dev/null; then
  BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
  say "  vs origin/main: $BEHIND behind, $AHEAD ahead"
  if [ "$BEHIND" != "0" ] && [ "$BEHIND" != "?" ]; then
    say ""
    say "  ⚠ $BEHIND COMMIT(S) ON MAIN YOU HAVE NOT SEEN. Anything you report about"
    say "    shared state may already be stale. What landed:"
    git log --oneline --no-decorate HEAD..origin/main 2>/dev/null | head -12 | sed 's/^/      /'
  fi
else
  say "  vs origin/main: FETCH FAILED — treat every cross-lane claim below as unverified"
fi

# 2. OTHER LANES' BRANCHES. The predledger case: the work existed on a branch.
say ""
say "  OTHER LANES' PUSHED BRANCHES (a claim about 'main' is not a claim about these):"
git for-each-ref --sort=-committerdate --count=8 \
  --format='      %(refname:short)  %(committerdate:relative)  %(contents:subject)' \
  refs/remotes/origin 2>/dev/null | grep -v "origin/HEAD" | cut -c1-118 || say "      (none)"

# 3. THE ROUTED INBOX. Unacknowledged items addressed to this lane.
say ""
if [ -f ROUTES.md ]; then
  if [ -n "$LANE" ]; then
    # AN EMPTY RESULT MUST NOT READ AS "CHECKED AND CLEAN".
    # My first version matched "^## +TO:<lane>" and the file says "## TO: C" —
    # with a space. It printed "nothing open for lane C" while three items sat
    # open, which is the exact failure B reported in citesZeroContribution the
    # same hour: a guard that returns empty because nothing was RECOGNISED,
    # rendered as nothing being WRONG. So the block match and the item count are
    # now reported separately, and a missing block says so.
    FOUND="$(awk -v lane="$LANE" '
      /^## / { inblk = 0 }
      $0 ~ ("^## +TO: *" lane "[ \t]*$") { inblk = 1; seen = 1; next }
      inblk && /^- \[ \]/ { print "      " $0 }
      END { if (!seen) print "__NOBLOCK__" }
    ' ROUTES.md)"
    if [ "$FOUND" = "__NOBLOCK__" ]; then
      say "  📬 ROUTES.md has NO \"## TO: $LANE\" block — not an empty inbox, an UNRECOGNISED lane."
    elif [ -n "$FOUND" ]; then
      N="$(printf '%s\n' "$FOUND" | grep -c '^ ')"
      say "  📬 $N OPEN ITEM(S) ROUTED TO LANE $LANE:"
      printf '%s\n' "$FOUND" | cut -c1-118
    else
      say "  📬 lane $LANE block found, 0 open items — genuinely clear."
    fi
  else
    say "  📬 ROUTES.md present — pass your lane (A|B|C) to see your items"
  fi
else
  say "  📬 no ROUTES.md yet"
fi

# 4. THE TWO THINGS EVERY LANE GETS WRONG, named rather than implied.
say ""
say "  BEFORE YOU REPORT A CROSS-LANE DEFECT:"
say "    1. Did you run it on a CLEAN origin/main worktree, or on your own tree?"
say "         git worktree add -f /tmp/chk origin/main && cd /tmp/chk && <repro>"
say "    2. Is the fix already on a branch you have not fetched? See the list above."
say "  Both of today's mis-routings would have been caught by exactly one of these."
say "───────────────────────────────────────────────────────────────────────"
exit 0
