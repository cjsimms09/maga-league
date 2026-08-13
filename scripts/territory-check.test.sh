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

# SCENARIO 4 — A TEST FILE FOLLOWS ITS MODULE (Cory, 2026-08-11).
#
# The rule that replaced a hand-written list of test-name patterns. It is the
# MECHANISM now, so it needs its own case: the previous arrangement passed every
# test it had while `test_external_outcomes.py` sat on A's side of the line and
# its module sat on C's, because no test asked the question.
#
# Built as a fresh scenario rather than bolted onto the merge cases above: this
# is about CLASSIFICATION, not about merge-awareness, and mixing them would let a
# pass come from the wrong half.
git checkout -q public/js/draft/engine.js
# UNSET THE MERGE-AWARENESS REF. Scenarios 1-3 export it, and leaving it set here
# would make the checker compare these new files against a branch that does not
# contain them — so every case below would pass for the wrong reason. Caught by
# the cases failing when they were written; worth stating, because a leftover
# export is exactly how a test stops exercising the thing it is named for.
unset TERRITORY_INTEGRATION_REF
mkdir -p draft/backtest draft/tests

# A C-owned module (draft/backtest/external_*) and its test.
echo "C module" > draft/backtest/external_outcomes.py
echo "C test"   > draft/tests/test_external_outcomes.py
# An A-owned module in the SAME directory (market_* is A's) and its test.
echo "A module" > draft/backtest/market_capture.py
echo "A test"   > draft/tests/test_market_capture.py
git add -A; git commit -qm "modules and their tests"

echo "A EDITED C's test" > draft/tests/test_external_outcomes.py
bash scripts/territory-check.sh A >/tmp/tc4.out 2>&1; ck $? 1 \
  "A editing test_external_outcomes.py fails — the test follows its C module"
grep -q "draft/tests/test_external_outcomes.py" /tmp/tc4.out; ck $? 0 \
  "  and the failure names it"

git checkout -q draft/tests/test_external_outcomes.py
echo "A edits its own test" > draft/tests/test_market_capture.py
bash scripts/territory-check.sh A >/tmp/tc5.out 2>&1; ck $? 0 \
  "A editing test_market_capture.py passes — same directory, A-owned module"

# AND THE OTHER DIRECTION: C must not be handed a test whose module is A's.
git checkout -q draft/tests/test_market_capture.py
echo "C EDITED A's test" > draft/tests/test_market_capture.py
bash scripts/territory-check.sh C >/tmp/tc6.out 2>&1; ck $? 1 \
  "C editing test_market_capture.py fails — its module is A's"
git checkout -q draft/tests/test_market_capture.py

# SCENARIO 5 — WORKFLOWS FOLLOW THE FEATURE THEY RUN (2026-08-11).
#
# `.github/workflows/*` was blanket-shared, which made three C workflow entries
# in c_owns unreachable AND let the list go stale by five files. Both defects at
# once, in the same function that held the dead test list. These cases exist so
# the narrowing cannot be silently widened back.
mkdir -p .github/workflows
echo "C ingest job" > .github/workflows/external-ingest-run.yml
echo "B member job" > .github/workflows/sunday-alert.yml
echo "repo-wide"    > .github/workflows/ci.yml
git add -A; git commit -qm "workflows"

echo "A EDITED C's ingest workflow" > .github/workflows/external-ingest-run.yml
bash scripts/territory-check.sh A >/tmp/tc7.out 2>&1; ck $? 1 \
  "A editing external-ingest-run.yml fails — C's ingest job"
git checkout -q .github/workflows/external-ingest-run.yml

echo "A EDITED B's alert workflow" > .github/workflows/sunday-alert.yml
bash scripts/territory-check.sh A >/tmp/tc8.out 2>&1; ck $? 1 \
  "A editing sunday-alert.yml fails — B's member job"
git checkout -q .github/workflows/sunday-alert.yml

# ci.yml is genuinely repo-wide: it runs both suites and every shell guard.
echo "A adds a CI step" > .github/workflows/ci.yml
bash scripts/territory-check.sh A >/tmp/tc9.out 2>&1; ck $? 0 \
  "ci.yml stays shared — repo-wide, not one lane's feature"
git checkout -q .github/workflows/ci.yml

# ── ROUTES.md MUST BE WRITABLE BY EVERY LANE ────────────────────────────────
# It is the cross-lane inbox and its own Rule 2 is "the receiver deletes the
# line". As a new ROOT file it fell through to the default and resolved to A, so
# a receiving lane's deletions were REFUSED and reverted — the protocol was
# unenforceable by construction. Pinned for all three sides, because a shared
# list with no test is a list one edit away from going short, which this guard's
# own history already shows four times.
echo "- [ ] test item" >> ROUTES.md
for lane in A B C; do
  bash scripts/territory-check.sh "$lane" >/tmp/tcR.out 2>&1; ck $? 0 \
    "ROUTES.md is writable by lane $lane — the receiver must be able to close an item"
done
# The suite runs in a scratch repo (mktemp -d), so ROUTES.md is CREATED here
# rather than modified — `git checkout` has nothing to restore and errors. The
# guard treats untracked files as touched (verified), so the checks above are
# real, but the cleanup has to match how the file got here.
git checkout -q ROUTES.md 2>/dev/null || rm -f ROUTES.md
git checkout -q .github/workflows/ci.yml


# ── AN ARGUMENT IT DOES NOT READ MUST BE A REFUSAL, NOT AN OK ───────────────
# `territory-check.sh C some/file.js` used to IGNORE the path and print
# "OK: side C stayed in its territory" — an answer to a question it had not been
# asked. C ran exactly that on a file that turned out to be B's, read the OK as
# clearance, edited it, and had the merge refused by integrate.sh. A false OK is
# worse than no answer because it is evidence. Pinned here because this file is
# shared and a shared script whose test does not pin its change gets a test that
# quietly goes stale.
for lane in A B C; do
  bash scripts/territory-check.sh "$lane" some/path.js >/tmp/tcX.out 2>&1; ck $? 2 \
    "lane $lane: a path argument is REFUSED, not silently ignored"
  grep -q "REFUSING" /tmp/tcX.out; ck $? 0 \
    "lane $lane: and it says so in those words"
done
# AND BOTH REAL FORMS STILL WORK — the refusal above must not have been bought by
# breaking a caller. My first version refused ANY second argument and broke
# `integrate.sh`, which legitimately calls `--range BASE REF` twice. A guard
# written without reading its callers is a guard that breaks them, and this pins
# the contract so the next person tightening this cannot repeat it.
bash scripts/territory-check.sh C >/tmp/tcY.out 2>&1; ck $? 0 \
  "the correct one-argument invocation still passes on a clean tree"
bash scripts/territory-check.sh C --range HEAD HEAD >/tmp/tcZ.out 2>&1; ck $? 0 \
  "--range BASE REF is accepted — integrate.sh depends on it"
grep -q "REFUSING" /tmp/tcZ.out; ck $? 1 \
  "  and is not mistaken for the bad form"

echo ""; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
