#!/usr/bin/env bash
# Interpret a reco-cron manual-probe response (register 287's week-1
# verification, made mechanical — A: "a green run and an empty store look
# identical; week 1 must produce a real graded row").
#
# stdin:  the function's JSON response body
# $1:     HTTP status code
# $2:     function name (for messages)
# exit 0: verified (message says which way) · exit 1: FAILED, with why
#
# The states, exhaustively — an unknown shape FAILS rather than passing,
# because a probe that greens on garbage is the exact rule-3e trap:
#   skipped=preseason|no live week yet  -> OK pre-season (wiring proven)
#                                          ⚠️ ONLY BEFORE KICKOFF — see below
#   skipped=already captured            -> BEST: the SCHEDULED run fired and wrote
#   captured>=1                         -> scheduled fire missing; the probe just
#                                          captured as fallback (loud warning)
#   captured=0 + note                   -> recorded hold/not-live week (real answer)
#   anything else / ok!=true / !=200    -> FAIL
#
# ── THE DATE TRAP (register 430) ────────────────────────────────────────────
# "Cleanly skipping pre-season" is the RIGHT answer on 2026-08-31 and the
# WORST POSSIBLE answer on 2026-09-10, and until now this script could not
# tell the two apart. That is the exact failure its own header names: a green
# run and a dead capture rail printing the same reassuring line, every week of
# the season, while the store stays empty. `preseason` is not a shape you
# grow out of by itself — it is whatever Sleeper's `season_type` says, and if
# that field lies or the gate misreads it, nothing else in the chain notices.
#
# So the verdict is now DATE-DEPENDENT: at or after week 1's kickoff a
# pre-season skip is a FAILURE. Kickoff is read from the captured schedule
# rather than hardcoded, with a documented fallback, and the message always
# says which source it used — a guard that cannot say where its threshold came
# from is a guard nobody can check.
#
# `RECO_PROBE_TODAY=YYYY-MM-DD` overrides today, so both arms of the guard are
# provable in a test rather than only after the season starts (rule 3e: this
# guard has a known positive, and `reco_probe_route.test.js` runs it).
set -u
code="${1:?http status}" ; fn="${2:?function name}"
body="$(cat)"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEDULE="$HERE/../data/nfl_schedule_2026.json"
KICKOFF_FALLBACK="2026-09-10"     # documented in src/betlogic.js CFG.SEASON_START_MONTHDAY
kickoff="$(jq -r '.weeks["1"].first // empty' "$SCHEDULE" 2>/dev/null | cut -c1-10)"
if [ -n "$kickoff" ]; then kickoff_src="the captured 2026 schedule"
else kickoff="$KICKOFF_FALLBACK" ; kickoff_src="the hardcoded fallback (schedule unreadable)" ; fi
today="${RECO_PROBE_TODAY:-$(date -u +%F)}"
# GRACE: fire from kickoff + 2 days, not from kickoff itself. Week 1's first
# game is 00:20 UTC on the 10th and Sleeper does not flip `season_type` to
# `regular` at the whistle, so a probe run in that boundary window would cry
# wolf on a rail that is fine. This guard exists to catch a rail dead for
# WEEKS; two days costs it nothing, and a guard that fires on ordinary work
# is a guard somebody deletes (registers 388, 417, 422).
alarm="$(date -u -d "$kickoff +2 days" +%F 2>/dev/null || echo "$kickoff")"

if [ "$code" != "200" ]; then
  echo "FAIL: $fn answered HTTP $code — body: $(echo "$body" | head -c 300)"
  exit 1
fi
ok=$(echo "$body" | jq -r '.ok // empty' 2>/dev/null)
if [ "$ok" != "true" ]; then
  echo "FAIL: $fn did not answer ok:true — body: $(echo "$body" | head -c 300)"
  exit 1
fi
skipped=$(echo "$body" | jq -r '.skipped // empty')
captured=$(echo "$body" | jq -r '.captured // empty')
note=$(echo "$body" | jq -r '.note // empty')

case "$skipped" in
  preseason|"no live week yet")
    if [[ "$today" < "$alarm" ]]; then
      echo "OK (pre-season): $fn is wired end-to-end and cleanly skipping ('$skipped'). Kickoff $kickoff, from $kickoff_src; this answer stops being OK on $alarm."
      exit 0
    fi
    echo "FAIL: $fn still answers '$skipped' on $today, but week 1 kicked off $kickoff (from $kickoff_src)."
    echo "      This is the failure the probe exists to catch: the capture rail is NOT running and"
    echo "      the response looks identical to the one that was correct last week. Check Sleeper's"
    echo "      season_type and the autoCaptureContext gate in netlify/functions/*-reco-cron.js."
    exit 1 ;;
  "already captured")
    echo "OK (verified): $fn's SCHEDULED run already fired and wrote this week's marker — the probe found the row it came for."
    exit 0 ;;
  "no commissioner owner"|"commissioner not mapped to a Sleeper roster")
    echo "FAIL: $fn cannot capture — '$skipped'. This silently costs every week until fixed."
    exit 1 ;;
esac

if [ -n "$captured" ]; then
  if [ "$captured" -ge 1 ] 2>/dev/null; then
    echo "WARN-BUT-CAPTURED: $fn's scheduled fire is MISSING today — the probe itself just captured ($captured row(s)). The ledger is whole; the schedule needs a look."
    exit 0
  fi
  if [ "$captured" = "0" ] && [ -n "$note" ]; then
    echo "OK (hold week): $fn captured nothing on purpose — '$note'. The marker records the absence."
    exit 0
  fi
fi

echo "FAIL: $fn answered a shape this probe does not recognize — refusing to call that verified. Body: $(echo "$body" | head -c 300)"
exit 1
