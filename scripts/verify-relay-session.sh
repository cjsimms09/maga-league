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
# -m "not repo_parity": matches EXACTLY what draft-data.yml's publication gate
# runs (see draft/tests/conftest.py + test_gate_selection.py). repo_parity
# tests compare a committed artifact against a fresh regeneration of THAT
# SAME artifact's own generator — by design they can legitimately disagree
# with a stale snapshot (a same-day board rebuild, live-market drift, or
# Python's per-process hash randomization affecting float summation/dict
# iteration order in a fit) without that meaning anything is BROKEN. Running
# the unfiltered suite here made this script flap independent of the branch's
# actual health (2026-08-16: 8 repo_parity tests went red/green across
# successive runs with zero code changes between them — confirmed by hand,
# not a regression). The full suite (including repo_parity) still runs on
# every real PR/CI check; this script's job is the gate's own promise.
ck "Python suite (expect ~2325 passed)" python3 -m pytest draft/tests -q -m "not repo_parity"
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
#
# EXEMPTION ENTRY, 2026-08-16 — the PYTHON scoring-path change this gate does
# not see, recorded here so the branch's proof surface names it: under Cory's
# same-day ruling on DECISIONS #0/#000 (verbatim: "Don't agree with timelines
# we fix now"), draft/scoring.py gained normalize_def_stat_line (DEF projection
# TD components -> the aggregates the league prices; measured across all 32 DEF
# rows), draft/adp.py gained the FP rec_rec/2pt_tds recovery, and the committed
# board + baseline v18 were regenerated through the real generators. This gate
# covers only the JS engine CFG surface, which did not move; the Python change
# is pinned by draft/tests/test_projection_correctness.py (13 checks) and
# documented in draft/audit/projection_correctness_2026-08-16.md.
ck "no engine CFG default changed vs origin/main beyond Cory's three ruled flips" \
  bash -c "git diff origin/main -- public/js/draft/engine.js public/js/draft/composite.js public/js/draft/survival.js | grep -E '^[-+] *[A-Z_]+:' | grep -vE '^[-+] *(VONA_WIRE_BENCH|KOV_MEASURED_RAMP|ROOM_MIX_PRIOR): (false|true)' | grep -vE '^\+ *ROOM_MIX_W: 0.25,' | grep -vE \"^\+ *KOV_MEASURED_RAMP_TABLE: \{ '4-6': 1.0, '7-9': 0.2, '10-12': 0.0, '13-15': 0.0 \}\" | grep -vE '^\+ *//' | { ! grep -q .; }"

echo ""
echo "== ARTIFACT FRESHNESS (informational, never blocks) =="
# draft/data/artifact_registry.json + draft/tools/check_artifact_freshness.py
# (2026-08-16, draft/audit/artifact_freshness_infra_2026-08-16.md): every
# committed-artifact-vs-regeneration study registered there, in ONE place, so
# nobody has to hunt pytest's full output for which repo_parity tests are red
# because the board moved on today vs which (if any) errored for a real
# reason. STALE is normal and expected; this section is not one of the
# pass/fail checks above and never flips this script's exit code.
python3 draft/tools/check_artifact_freshness.py
FRESHNESS_EXIT=$?
if [ "$FRESHNESS_EXIT" -ne 0 ]; then
  echo ""
  echo "NOTE: check_artifact_freshness.py exited nonzero — that means a"
  echo "regenerate_command itself CRASHED (a real bug), not that anything is"
  echo "merely stale. Read the ERROR lines above."
fi

echo ""
echo "== 3. THE TERRITORY GATE'S REFUSAL IS EXACTLY THE DOCUMENTED SET =="
# integrate.sh WILL refuse this branch — that is expected and recorded as
# Override #5 in TERRITORY.md (including its appendices). This check pins the
# refusal to EXACTLY the 45 documented files: a forty-sixth trespass appearing
# later fails HERE, so "expected refusal" can never quietly grow. The set SHRINKS as
# authorised fixes reach main and stop diffing (test_board_pin.py first, then
# the board_activity pair with the rebuild-blocker cherry-picks) and GREW
# 2026-08-15 night with the war-room design pass (warroom.ejs, header.ejs,
# warroom.css), the sidebets.test.js guard restatement (the edge advisor),
# and the side-bet/member-site design pass (_side_bets.ejs rewrite, pickem,
# scoreboard, style.css, sidebets.js — Cory's side-bet directive verbatim),
# then 2026-08-16 with the member-site design pass (+13: memberweek/
# recordswatch/whatwatch routes, week-nav + races + preview views/partials,
# matchup/team/watch surfaces — Cory's five ordered features verbatim), and
# again 2026-08-16 with the war-room clarity pass's REPIN (+2: the
# projections-page pair src/routes/admin.js + views/admin/projections.ejs,
# created by the Monday-brief commit 402419fc and never entered here — the
# clarity pass itself added ZERO files to the set; it edited three files
# already pinned) — each exit and entry is documented in Override #5's
# bookkeeping notes. GREW again 2026-08-16 with the persistence-hardening
# pass (+3: src/ledger.js — the money ledger's writers migrated onto the new
# atomic store.mutate seam, and the two cron workflows now sending the
# Authorization: Bearer header — the external audit's findings 1/3/4;
# red-then-green evidence in draft/audit/persistence_hardening_2026-08-16.md).
EXPECTED_TRESPASS=".github/workflows/sunday-alert.yml
.github/workflows/weekly-recap.yml
draft/tests/h2h_agreement.test.js
draft/tests/lineup_sanity.test.js
draft/tests/scope_agreement.test.js
draft/tests/sidebets.test.js
draft/tests/trashtalk.test.js
draft/tests/waiver_surface.test.js
public/css/style.css
public/css/warroom.css
src/ledger.js
src/routes/accuracy.js
src/routes/admin.js
src/routes/lineup.js
src/routes/member.js
src/routes/memberweek.js
src/routes/recordswatch.js
src/routes/trashtalk.js
src/routes/whatwatch.js
src/sidebets.js
views/accuracy.ejs
views/admin/model-scoreboard.ejs
views/admin/projections.ejs
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
  pass=$((pass+1)); echo "PASS  gate refusal matches Override #5's 45 files exactly"
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
echo "('⚡ THE QUEUE'). ZERO gated rulings open before the 22nd (standing research items stay open in DECISIONS-NEEDED \u00a7OPEN). Seven are RULED AND"
echo "EXECUTED 2026-08-16: VONA_WIRE_BENCH true, ADP correction closed,"
echo "KOV_MEASURED_RAMP true, seat-plan headline ownership, own_model_v4"
echo "promotion applied, ROOM_MIX_PRIOR true (baseline v17), and own_model_v6"
echo "promotion applied ('YES on V6' — v4's QB arm + v5's component arms,"
echo "cleared REC-3 at all four positions). The queue's Settled section"
echo "carries each record. This footer is a pointer, not a copy."
exit $((fail > 0))
