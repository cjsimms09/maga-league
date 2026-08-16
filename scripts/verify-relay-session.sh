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
# The exemption list IS the ruling record: VONA_WIRE_BENCH, KOV_MEASURED_RAMP
# and ROOM_MIX_PRIOR may appear in the diff in EITHER state because Cory ruled
# on all three 2026-08-16 ("1. Yes ... 3. Yes"; "YES on room mix prior, turn
# it on" — flipped true, old false lines leaving the diff). ROOM_MIX_W is the
# ruled switch's declared blend weight (0.25 = BUCKET_BLEND, pinned by
# room_prior.test.js). Any OTHER CFG default moving still fails here.
ck "no engine CFG default changed vs origin/main beyond Cory's three ruled flips" \
  bash -c "git diff origin/main -- public/js/draft/engine.js public/js/draft/composite.js public/js/draft/survival.js | grep -E '^[-+] *[A-Z_]+:' | grep -vE '^[-+] *(VONA_WIRE_BENCH|KOV_MEASURED_RAMP|ROOM_MIX_PRIOR): (false|true)' | grep -vE '^\+ *ROOM_MIX_W: 0.25,' | grep -vE \"^\+ *KOV_MEASURED_RAMP_TABLE: \{ '4-6': 1.0, '7-9': 0.2, '10-12': 0.0, '13-15': 0.0 \}\" | grep -vE '^\+ *//' | { ! grep -q .; }"

echo ""
echo "== 3. THE TERRITORY GATE'S REFUSAL IS EXACTLY THE DOCUMENTED SET =="
# integrate.sh WILL refuse this branch — that is expected and recorded as
# Override #5 in TERRITORY.md (including its appendices). This check pins the
# refusal to EXACTLY the 39 documented files: a fortieth trespass appearing later
# fails HERE, so "expected refusal" can never quietly grow. The set SHRINKS as
# authorised fixes reach main and stop diffing (test_board_pin.py first, then
# the board_activity pair with the rebuild-blocker cherry-picks) and GREW
# 2026-08-15 night with the war-room design pass (warroom.ejs, header.ejs,
# warroom.css), the sidebets.test.js guard restatement (the edge advisor),
# and the side-bet/member-site design pass (_side_bets.ejs rewrite, pickem,
# scoreboard, style.css, sidebets.js — Cory's side-bet directive verbatim),
# then 2026-08-16 with the member-site design pass (+13: memberweek/
# recordswatch/whatwatch routes, week-nav + races + preview views/partials,
# matchup/team/watch surfaces — Cory's five ordered features verbatim) —
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
src/routes/memberweek.js
src/routes/recordswatch.js
src/routes/trashtalk.js
src/routes/whatwatch.js
src/sidebets.js
views/accuracy.ejs
views/admin/warroom.ejs
views/analyzer.ejs
views/bank.ejs
views/dashboard.ejs
views/lineup.ejs
views/matchup-spectator.ejs
views/matchup-week.ejs
views/matchup.ejs
views/partials/_preview_line.ejs
views/partials/_season_sched.ejs
views/partials/_side_bets.ejs
views/partials/_week_strip.ejs
views/partials/_wr_explain.ejs
views/partials/header.ejs
views/pickem.ejs
views/races.ejs
views/scoreboard-week.ejs
views/scoreboard.ejs
views/team.ejs
views/votes.ejs
views/waivers.ejs
views/watch.ejs"
# awk on the LAST ": "-field, not a paren-matching regex — the C-file line
# reads "TRESPASS (A touched C's file (declared in-file)): path" and nested
# parens broke the first version of this extraction (its own dry run caught
# that: test_board_pin.py silently vanished from ACTUAL).
ACTUAL=$(bash scripts/territory-check.sh A --range origin/main HEAD 2>&1 \
  | grep '^TRESPASS' | awk -F': ' '{print $NF}' | sort) || true
if [ "$ACTUAL" == "$EXPECTED_TRESPASS" ]; then
  pass=$((pass+1)); echo "PASS  gate refusal matches Override #5's 39 files exactly"
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
echo "('⚡ THE QUEUE'). ZERO calls open before the 22nd. Seven are RULED AND"
echo "EXECUTED 2026-08-16: VONA_WIRE_BENCH true, ADP correction closed,"
echo "KOV_MEASURED_RAMP true, seat-plan headline ownership, own_model_v4"
echo "promotion applied, ROOM_MIX_PRIOR true (baseline v17), and own_model_v6"
echo "promotion applied ('YES on V6' — v4's QB arm + v5's component arms,"
echo "cleared REC-3 at all four positions). The queue's Settled section"
echo "carries each record. This footer is a pointer, not a copy."
exit $((fail > 0))
