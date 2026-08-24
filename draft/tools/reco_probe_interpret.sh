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
#   skipped=already captured            -> BEST: the SCHEDULED run fired and wrote
#   captured>=1                         -> scheduled fire missing; the probe just
#                                          captured as fallback (loud warning)
#   captured=0 + note                   -> recorded hold/not-live week (real answer)
#   anything else / ok!=true / !=200    -> FAIL
set -u
code="${1:?http status}" ; fn="${2:?function name}"
body="$(cat)"

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
    echo "OK (pre-season): $fn is wired end-to-end and cleanly skipping ('$skipped')."
    exit 0 ;;
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
