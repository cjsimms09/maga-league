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
ck "Python suite (expect ~2325 passed)" python3 -m pytest draft/tests -q
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
# The exemption list IS the ruling record: VONA_WIRE_BENCH and
# KOV_MEASURED_RAMP may appear in the diff in EITHER state because Cory ruled
# on both 2026-08-16 ("1. Yes ... 3. Yes" — flipped true, with the old false
# lines leaving the diff). Any OTHER CFG default moving still fails here.
ck "no engine CFG default changed vs origin/main beyond Cory's two ruled flips" \
  bash -c "git diff origin/main -- public/js/draft/engine.js public/js/draft/composite.js | grep -E '^[-+] *[A-Z_]+:' | grep -vE '^[-+] *(VONA_WIRE_BENCH|KOV_MEASURED_RAMP): (false|true)' | grep -vE \"^\+ *KOV_MEASURED_RAMP_TABLE: \{ '4-6': 1.0, '7-9': 0.2, '10-12': 0.0, '13-15': 0.0 \}\" | grep -vE '^\+ *//' | { ! grep -q .; }"

echo ""
echo "== 3. THE TERRITORY GATE'S REFUSAL IS EXACTLY THE DOCUMENTED SET =="
# integrate.sh WILL refuse this branch — that is expected and recorded as
# Override #5 in TERRITORY.md (including its appendices). This check pins the
# refusal to EXACTLY the 23 documented files: a twenty-fourth trespass appearing later
# fails HERE, so "expected refusal" can never quietly grow. The set SHRINKS as
# authorised fixes reach main and stop diffing (test_board_pin.py first, then
# the board_activity pair with the rebuild-blocker cherry-picks) and GREW
# 2026-08-15 night with the war-room design pass (warroom.ejs, header.ejs,
# warroom.css), the sidebets.test.js guard restatement (the edge advisor),
# and the side-bet/member-site design pass (_side_bets.ejs rewrite, pickem,
# scoreboard, style.css, sidebets.js — Cory's side-bet directive verbatim) —
# each exit and entry is documented in Override #5's bookkeeping notes.
EXPECTED_TRESPASS="draft/tests/h2h_agreement.test.js
draft/tests/lineup_sanity.test.js
draft/tests/scope_agreement.test.js
draft/tests/sidebets.test.js
draft/tests/trashtalk.test.js
draft/tests/waiver_surface.test.js
public/css/style.css
public/css/warroom.css
src/routes/accuracy.js
src/routes/lineup.js
src/routes/member.js
src/routes/trashtalk.js
src/sidebets.js
views/admin/warroom.ejs
views/bank.ejs
views/dashboard.ejs
views/lineup.ejs
views/partials/_side_bets.ejs
views/partials/header.ejs
views/pickem.ejs
views/scoreboard.ejs
views/votes.ejs
views/waivers.ejs"
# awk on the LAST ": "-field, not a paren-matching regex — the C-file line
# reads "TRESPASS (A touched C's file (declared in-file)): path" and nested
# parens broke the first version of this extraction (its own dry run caught
# that: test_board_pin.py silently vanished from ACTUAL).
ACTUAL=$(bash scripts/territory-check.sh A --range origin/main HEAD 2>&1 \
  | grep '^TRESPASS' | awk -F': ' '{print $NF}' | sort) || true
if [ "$ACTUAL" == "$EXPECTED_TRESPASS" ]; then
  pass=$((pass+1)); echo "PASS  gate refusal matches Override #5's 23 files exactly"
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
echo "gate knowingly, per TERRITORY.md Override #5) — scripts/merge-relay.sh is that
act as a mechanism: verify, merge locally, suites on the merged tree, and it
STOPS before pushing."
echo ""
echo "THE DECISION QUEUE LIVES IN ONE PLACE: DECISIONS-NEEDED.md, top section"
echo "('⚡ THE QUEUE'). ONE call still needs Cory before the 22nd — ROOM_MIX_PRIOR"
echo "(flip only if the mock rehearsal is clean). Five are RULED AND EXECUTED"
echo "2026-08-16: VONA_WIRE_BENCH true, ADP correction closed, KOV_MEASURED_RAMP"
echo "true, seat-plan headline ownership, own_model_v4 promotion applied — the"
echo "queue's Settled section carries"
echo "each record, and baseline v16 freezes the ruled behavior. This footer is"
echo "a pointer, not a copy."
exit $((fail > 0))
