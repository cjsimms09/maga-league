#!/usr/bin/env bash
# WHAT DOES CI SAY? — the one question integrate.sh could never answer.
#
# integrate.sh has carried this comment since it was written:
#
#     "This script CANNOT check CI — there is no gh in the environments it
#      runs in."
#
# THAT WAS NEVER TESTED AND IT IS NOT TRUE. `gh` is indeed absent. The GitHub
# REST API is not: `curl https://api.github.com/repos/...` answers 200 from the
# same container, unauthenticated, on a public repo. The impossibility was
# asserted, a caveat was printed instead of a gate, and the caveat was printed
# on every run until nobody read it — which is how thirty consecutive merges
# landed on a red main, each reporting "green locally".
#
# Same self-description class as everything else this week: a sentence
# describing what the code CAN DO, believed rather than checked.
#
# Usage:
#   ci_status.sh latest [branch]   -> conclusion of the newest COMPLETED run
#   ci_status.sh sha <sha> [secs]  -> poll until that sha's run completes
#
# Exit: 0 success, 1 failure/cancelled, 2 CANNOT DETERMINE.
#
# EXIT 2 IS NOT EXIT 0. A network failure, a rate limit or an unparseable
# response must never read as "fine" — that is the null-as-absence defect, and
# this file exists because of it.
set -u
REPO="${CI_STATUS_REPO:-cjsimms09/maga-league}"
WF="${CI_STATUS_WORKFLOW:-ci.yml}"
API="https://api.github.com/repos/$REPO/actions/workflows/$WF/runs"

_auth=()
[ -n "${GITHUB_TOKEN:-}" ] && _auth=(-H "Authorization: Bearer $GITHUB_TOKEN")

_fetch() {
  curl -sS --max-time 25 "${_auth[@]}" -H 'Accept: application/vnd.github+json' "$1" 2>/dev/null
}

# Reads a runs payload on stdin, prints "<status> <conclusion> <sha>" for the
# first run, or nothing. Python because a jq dependency is one more thing that
# can be absent in the environment this is meant to work in.
_first_run() {
  python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    runs = d.get("workflow_runs") or []
    if not runs: sys.exit(3)
    r = runs[0]
    print(r.get("status") or "?", r.get("conclusion") or "-", (r.get("head_sha") or "")[:8])
except SystemExit: raise
except Exception:
    sys.exit(3)
' 2>/dev/null
}

cmd="${1:-latest}"

case "$cmd" in
  latest)
    branch="${2:-main}"
    out="$(_fetch "$API?branch=$branch&status=completed&per_page=1")"
    parsed="$(printf '%s' "$out" | _first_run)"
    if [ -z "$parsed" ]; then
      echo "CANNOT DETERMINE: no completed CI run readable for $branch."
      echo "  (network, rate limit, or the workflow file name changed: $WF)"
      exit 2
    fi
    set -- $parsed
    echo "$branch latest completed run: $3 -> $2"
    [ "$2" = "success" ] && exit 0
    exit 1
    ;;

  sha)
    want="${2:?usage: ci_status.sh sha <sha> [wait-seconds]}"
    budget="${3:-600}"
    short="${want:0:8}"
    waited=0
    while :; do
      out="$(_fetch "$API?per_page=20")"
      line="$(printf '%s' "$out" | python3 -c '
import sys, json
want = sys.argv[1]
try:
    for r in (json.load(sys.stdin).get("workflow_runs") or []):
        if (r.get("head_sha") or "").startswith(want):
            print(r.get("status") or "?", r.get("conclusion") or "-")
            break
except Exception:
    pass
' "$short" 2>/dev/null)"
      if [ -n "$line" ]; then
        set -- $line
        if [ "$1" = "completed" ]; then
          echo "CI for $short: $2"
          [ "$2" = "success" ] && exit 0
          exit 1
        fi
        echo "  CI for $short: $1 (${waited}s elapsed)"
      else
        echo "  no CI run for $short yet (${waited}s elapsed)"
      fi
      [ "$waited" -ge "$budget" ] && {
        echo "CANNOT DETERMINE: CI for $short did not complete within ${budget}s."
        echo "  A timeout is NOT a pass. Check the run before reporting verified."
        exit 2; }
      sleep 20
      waited=$((waited + 20))
    done
    ;;

  *)
    echo "usage: ci_status.sh latest [branch] | ci_status.sh sha <sha> [secs]"
    exit 2
    ;;
esac
