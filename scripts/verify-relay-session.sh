#!/usr/bin/env bash
# TERRITORY: A
# VERIFY THE RELAY SESSION'S BRANCH IN ONE COMMAND — A's Monday runbook.
#
# Cory's requirement, verbatim: "A should not have to run more test and do a
# bunch of things. It should just be able to verify your work and approve!"
# This is that: every claim the relay branch makes, checked mechanically, one
# command, PASS/FAIL per claim, non-zero exit if anything fails. What it does
# NOT do is decide the two judgment calls that are genuinely A's/Cory's —
# those are listed at the end with their evidence files, not smuggled into a
# green checkmark.
#
# Run from the repo root, on the branch:  bash scripts/verify-relay-session.sh
set -uo pipefail
cd "$(dirname "$0")/.."

pass=0; fail=0
ck() { # ck <label> <command...>
  local label="$1"; shift
  if "$@" >/tmp/verify-relay-last.log 2>&1; then
    pass=$((pass+1)); echo "PASS  $label"
  else
    fail=$((fail+1)); echo "FAIL  $label"
    tail -15 /tmp/verify-relay-last.log | sed 's/^/        /'
  fi
}

echo "== 1. THE FULL SUITES (the same gates integrate.sh applies) =="
ck "Python suite (expect ~2196 passed)" python3 -m pytest draft/tests -q
ck "JS sweep (expect all green)" bash scripts/js-sweep.sh

echo ""
echo "== 2. ARTIFACT CONSISTENCY (committed data matches its own generators) =="
ck "wire_level.json matches a fresh run of wire_level.js" \
  node draft/tests/vona_wire_bench.test.js
ck "bench_wire_room_sim.json is the canonical 3-arm 60-room seeds-1-60 run" \
  python3 -c "
import json; d = json.load(open('draft/data/bench_wire_room_sim.json'))
assert d['rooms'] == 60 and d['seed_start'] == 1, (d['rooms'], d['seed_start'])
assert set(d['summary']) >= {'shipped','off','on'}, list(d['summary'])"
ck "opening_script.json fingerprint is fresh against the committed board" \
  python3 -c "
import json, sys; sys.path.insert(0, 'draft')
import opening_script as OS
board = json.load(open('public/draft_data.json'))
pred = json.load(open('draft/data/predicted_keepers.json'))
script = json.load(open('draft/data/opening_script.json'))
stale = OS.is_stale(script['meta'], OS.fingerprint(board, pred))
assert stale == [], stale"
ck "no engine CFG default changed vs origin/main (the standing scoring gate)" \
  bash -c "git diff origin/main -- public/js/draft/engine.js | grep -E '^[-+] *[A-Z_]+:' | grep -v '^\+ *VONA_WIRE_BENCH: false' | grep -vE '^\+ *//' | { ! grep -q .; }"

echo ""
echo "== 3. THE TERRITORY GATE'S REFUSAL IS EXACTLY THE DOCUMENTED SET =="
# integrate.sh WILL refuse this branch — that is expected and recorded as
# Override #5 in TERRITORY.md (including its appendices). This check pins the
# refusal to EXACTLY the 10 documented files: an eleventh trespass appearing later
# fails HERE, so "expected refusal" can never quietly grow. The set SHRINKS as
# authorised fixes reach main and stop diffing (test_board_pin.py first, then
# the board_activity pair with the rebuild-blocker cherry-picks) — each exit
# and entry is documented in Override #5's bookkeeping notes.
EXPECTED_TRESPASS="draft/tests/h2h_agreement.test.js
draft/tests/lineup_sanity.test.js
draft/tests/scope_agreement.test.js
src/routes/accuracy.js
src/routes/lineup.js
src/routes/member.js
views/bank.ejs
views/dashboard.ejs
views/lineup.ejs
views/waivers.ejs"
# awk on the LAST ": "-field, not a paren-matching regex — the C-file line
# reads "TRESPASS (A touched C's file (declared in-file)): path" and nested
# parens broke the first version of this extraction (its own dry run caught
# that: test_board_pin.py silently vanished from ACTUAL).
ACTUAL=$(bash scripts/territory-check.sh A --range origin/main HEAD 2>&1 \
  | grep '^TRESPASS' | awk -F': ' '{print $NF}' | sort) || true
if [ "$ACTUAL" == "$EXPECTED_TRESPASS" ]; then
  pass=$((pass+1)); echo "PASS  gate refusal matches Override #5's 10 files exactly"
else
  fail=$((fail+1)); echo "FAIL  gate refusal does NOT match the documented set:"
  diff <(echo "$EXPECTED_TRESPASS") <(echo "$ACTUAL") | sed 's/^/        /'
fi

echo ""
echo "== RESULT: $pass passed, $fail failed =="
echo ""
echo "WHAT A GREEN RUN MEANS: every mechanical claim on this branch verifies —"
echo "suites, artifact/generator consistency, no scoring default moved, and the"
echo "territory refusal is exactly the documented, Cory-authorised Override #5"
echo "set. The merge itself stays A's deliberate act (bypass integrate.sh's lane"
echo "gate knowingly, per TERRITORY.md Override #5), not this script's."
echo ""
echo "THE TWO OPEN JUDGMENT CALLS (evidence complete, decision NOT made here):"
echo "  1. VONA_WIRE_BENCH ship/no-ship — draft/audit/vona_slot_aware_isolation_"
echo "     2026-08-15.md. The anomaly is resolved (it is VONA_SLOT_AWARE's own);"
echo "     the wire branch's timing effect matches real history exactly. Cory's"
echo "     ruling required either way."
echo "  2. Scoring-gap ADP correction — draft/audit/scoring_gap_correction_"
echo "     backtest_2026-08-15.md. Recommendation IN the report: do not ship"
echo "     (right size, \$0.00 in dollars)."
exit $((fail > 0))
