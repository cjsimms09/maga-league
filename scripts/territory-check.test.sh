#!/usr/bin/env bash
# TEST — territory-check.sh is MERGE-AWARE: a clean integration passes, an actual
# edit to the other lane's file fails and names it. Isolated in a throwaway git repo
# so it never touches the real one. Run: bash scripts/territory-check.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/territory-check.sh"
pass=0; fail=0
ck() { if [ "$1" = "$2" ]; then echo "PASS $3"; pass=$((pass+1)); else echo "FAIL $3 (got exit $1, want $2)"; fail=$((fail+1)); fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
git init -q; git config user.email t@t; git config user.name t; git config commit.gpgsign false
mkdir -p scripts views public/js/draft
cp "$CHECK" scripts/territory-check.sh
# a B-owned file (views/*) and an A-owned file (public/js/draft/*)
echo "B original" > views/page.ejs
echo "A original" > public/js/draft/engine.js
git add -A; git commit -qm base
# the "integration source" ref = a branch where B advanced views/page.ejs
git branch integ-src
git checkout -q integ-src
echo "B advanced by the other lane" > views/page.ejs
git commit -qam "B lane advances"
git checkout -q master 2>/dev/null || git checkout -q main

export TERRITORY_INTEGRATION_REF=integ-src

# SCENARIO 1 — CLEAN MERGE: bring in integ-src's version byte-identical. A must PASS.
git merge -q integ-src -m "integrate [test]" 2>/dev/null
bash scripts/territory-check.sh A >/tmp/tc1.out 2>&1; ck $? 0 "clean integration of B's file passes for A"
grep -q "integration-exempt" /tmp/tc1.out && echo "  (noted as merged, not edited)" || true

# SCENARIO 2 — ACTUAL EDIT: A modifies the B-owned file to differ from the source. FAIL + names it.
echo "A EDITED a B file — trespass" > views/page.ejs
bash scripts/territory-check.sh A >/tmp/tc2.out 2>&1; ck $? 1 "an actual edit to a B file fails for A"
grep -q "views/page.ejs" /tmp/tc2.out; ck $? 0 "the failure names the trespassed file"

# SCENARIO 3 — A editing its OWN file is always fine.
git checkout -q views/page.ejs
echo "A edits its own engine" > public/js/draft/engine.js
bash scripts/territory-check.sh A >/tmp/tc3.out 2>&1; ck $? 0 "A editing its own file passes"

echo ""; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
