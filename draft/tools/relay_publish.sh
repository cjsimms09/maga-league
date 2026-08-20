#!/usr/bin/env bash
# TERRITORY: relay — OPERATING-MODEL.md RULE 1c's mechanism (added 08-20, Cory's order).
# Publishes the relay's mailbox-class research artifacts STRAIGHT TO main, then
# mirrors to the relay branch. Knowledge, not code: territory-owned code (the
# harness, surfaces, anything imported) is EXCLUDED by design — that is Rule 1.
#
# Usage: draft/tools/relay_publish.sh <relay-branch> "<commit message>" [--grade Pnnn ...] [file ...]
#   With no files listed, publishes every RULE-1c-class file that differs.
#   --grade Pnnn (repeatable): carry that row's GRADE from the branch ledger onto
#   main's OPEN stub — register 156's fix. The insert step below is
#   insert-never-overwrite and SKIPS a grade silently (same P-id already on
#   main); without --grade the tool prints success while main serves 🟡 OPEN,
#   which is exactly the P153–P156 stall. Constraints live in
#   ledger_grade_carry.py: main's row must be OPEN, the branch's terminal,
#   only the named rows may move, all-or-nothing.
set -euo pipefail
BRANCH="${1:?relay branch name}"; MSG="${2:?commit message}"; shift 2
GRADES=()
ARGS=()
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--grade" ]; then GRADES+=("${2:?--grade needs a P-id}"); shift 2
  else ARGS+=("$1"); shift; fi
done
set -- ${ARGS[@]+"${ARGS[@]}"}
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
WT="$(mktemp -d)/mainwt"
git fetch origin main --quiet
git worktree add --detach "$WT" origin/main >/dev/null 2>&1
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
if [ "$#" -gt 0 ]; then FILES=("$@"); else
  mapfile -t FILES < <(git diff --name-only origin/main "origin/$BRANCH" -- \
    'draft/*PREREG*.md' 'draft/*PROGRAM*.md' 'draft/ADAPTATION-POLICY.md' \
    'draft/audit/*.md' | sort -u)
fi
PUBLISHED=0
for f in "${FILES[@]}"; do
  [ -n "$f" ] || continue
  mkdir -p "$WT/$(dirname "$f")"
  git show "origin/$BRANCH:$f" > "$WT/$f" 2>/dev/null || continue
  PUBLISHED=$((PUBLISHED+1))
done
# Ledger rows: INSERT branch-only P-rows into main's copy, never overwrite.
python3 - "$WT" "$BRANCH" <<'PY'
import subprocess, sys, re
wt, branch = sys.argv[1], sys.argv[2]
mine = subprocess.check_output(['git','show',f'origin/{branch}:PREDICTION-LEDGER.md'], text=True)
main_p = wt + '/PREDICTION-LEDGER.md'
s = open(main_p).read()
have = set(re.findall(r'^\| (P\d+) ', s, re.M))
new = [l for l in mine.splitlines(True)
       if (m := re.match(r'\| (P\d+) ', l)) and m.group(1) not in have]
if new:
    i = s.index('| P')          # top of the table
    s = s[:i] + ''.join(new) + s[i:]
    open(main_p,'w').write(s)
    print(f'ledger: inserted {len(new)} row(s)')
PY
# Grade carry (register 156): explicit ids only, refusals are fatal by set -e.
if [ "${#GRADES[@]}" -gt 0 ]; then
  BL="$(mktemp)"
  git show "origin/$BRANCH:PREDICTION-LEDGER.md" > "$BL"
  python3 draft/tools/ledger_grade_carry.py "$WT/PREDICTION-LEDGER.md" "$BL" "${GRADES[@]}"
  rm -f "$BL"
fi
cd "$WT"
node draft/tools/prediction_ledger_check.js >/dev/null || { echo "LEDGER CHECK FAILED on main — refusing to publish"; exit 1; }
if git diff --quiet; then echo "nothing to publish — main already current"; exit 0; fi
git add -A
git commit -q -m "$MSG

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin HEAD:main
echo "published $PUBLISHED artifact(s) + ledger delta to main"
