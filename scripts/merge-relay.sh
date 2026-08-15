#!/usr/bin/env bash
# TERRITORY: A
# MERGE THE RELAY BRANCH — the Override #5 bypass, as a MECHANISM.
#
# integrate.sh will (correctly) refuse the relay branch: it carries the 13
# documented, Cory-authorised lane crossings recorded in TERRITORY.md
# Override #5. The documented procedure was "bypass the lane gate knowingly"
# — a hand-executed instruction, which is exactly the shape this repo keeps
# converting into mechanisms (Cory's own ruling: PREFER A MECHANISM TO AN
# INSTRUCTION). This is that mechanism. It does everything integrate.sh
# would EXCEPT the lane check it replaces with something stricter: the
# refusal must match the documented crossing set EXACTLY — an undocumented
# fourteenth crossing aborts the merge, so the bypass can never launder a
# crossing nobody authorised.
#
# WHAT IT DOES, in order — refusing at the first failure:
#   1. verify-relay-session.sh on the branch (suites, artifacts, CFG gate,
#      and the pinned refusal set — the bypass justification itself)
#   2. merge --no-ff into a LOCAL main, never touching origin
#   3. BOTH full suites on the MERGED tree (the same gates integrate.sh runs)
#   4. stop. It prints the push command and NEVER pushes — the push stays
#      A's deliberate act, same as integrate.sh's contract.
#
# Usage:  bash scripts/merge-relay.sh            (from the repo root)
#         bash scripts/merge-relay.sh --branch <name>   (default below)
set -uo pipefail
cd "$(dirname "$0")/.."

BRANCH="claude/fantasy-football-research-926y6z"
[ "${1:-}" = "--branch" ] && BRANCH="${2:?--branch needs a name}"

say() { printf '\n== %s ==\n' "$*"; }
die() { printf 'REFUSED: %s\n' "$*" >&2; exit 1; }

# A merge is a merge of COMMITTED work (integrate.sh's own rule, kept).
git diff --quiet && git diff --cached --quiet \
  || die "working tree is dirty — commit or stash before merging"

say "0. fetch"
git fetch origin main "$BRANCH" || die "fetch failed"

say "1. verify the branch (the bypass justification)"
git checkout -q "$BRANCH" || die "cannot check out $BRANCH"
git merge-base --is-ancestor origin/main "$BRANCH" \
  || die "$BRANCH is not up to date with origin/main — merge main into it first, re-verify, then rerun"
bash scripts/verify-relay-session.sh \
  || die "verify-relay-session.sh failed — fix the named check before merging; do NOT bypass a red verifier"

say "2. merge into LOCAL main (no push happens in this script)"
git checkout -q main || die "cannot check out main"
git reset -q --hard origin/main || die "cannot sync local main to origin"
git merge --no-ff --no-edit "$BRANCH" \
  || { git merge --abort || true; die "merge conflicts — resolve on the branch, not in this script"; }

say "3. both suites on the MERGED tree (the integrate.sh gates)"
python3 -m pytest draft/tests -q || { git reset -q --hard origin/main; die "Python suite red on the merged tree — rolled local main back"; }
bash scripts/js-sweep.sh          || { git reset -q --hard origin/main; die "JS sweep red on the merged tree — rolled local main back"; }

say "DONE — merged locally, both suites green, NOTHING pushed"
echo "Local main is $(git rev-parse --short HEAD) (origin/main is $(git rev-parse --short origin/main))."
echo "The push is YOUR deliberate act. Read TERRITORY.md Override #5 once more, then:"
echo ""
echo "    git push origin main"
echo ""
echo "NOTE: this push DEPLOYS (served files changed; DEPLOY-POLICY.md governs)."
echo "After pushing: the config-check workflow's last cell should go green"
echo "(weights-read ships with this merge), and deploy-verify will poll the"
echo "live site to the new commit on its own."
exit 0
