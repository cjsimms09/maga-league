#!/usr/bin/env bash
# Regenerate the network-dependent evidence items against a REAL pipeline build.
#
# WHY THIS EXISTS. Items 5-7, 9, 13, 15, 25 and 26 were all filed CANNOT
# PRODUCE for one single reason: this environment's proxy refuses CONNECT to
# api.sleeper.app and fantasyfootballcalculator.com, so every build here is an
# offline fixture build. Eight items, one blocker. When the blocker clears, the
# useful thing is one command, not eight scripts reconstructed from memory.
#
#   bash draft/evidence/regen.sh <league_id> <draft_slot>
#
# IT REFUSES TO RUN ON FIXTURE DATA. That refusal is the point. A fixture
# artifact and a real one differ only in a provenance field; the boards look
# equally plausible and the numbers are equally confident. This exact confusion
# already happened once in this project. A script that silently regenerated
# item 13 off fixtures would produce a page of numbers that LOOK like the
# answer and are not, which is worse than the CANNOT PRODUCE it replaced.
set -euo pipefail
cd "$(dirname "$0")/../.."
LEAGUE_ID="${1:?usage: regen.sh <league_id> <draft_slot>}"
SLOT="${2:?usage: regen.sh <league_id> <draft_slot>}"
ART=public/draft_data.json

echo "=== ACCEPTANCE: the league endpoint answers at all ==="
# No retry on 403. Per /root/.ccr/README.md a proxy policy denial is an answer,
# not a transient failure, and retrying it returns the same answer more slowly.
code=$(curl -sS -m 30 -o /tmp/league.json -w '%{http_code}' \
  "https://api.sleeper.app/v1/league/${LEAGUE_ID}" || echo 000)
echo "HTTP ${code}"
if [ "$code" != "200" ]; then
  echo "STOP: the league endpoint is not reachable (HTTP ${code})."
  echo "  403/000 at CONNECT means the proxy policy still blocks api.sleeper.app."
  echo "  A policy change requires a NEW SESSION — a running container keeps the"
  echo "  policy it started with, so updating the setting is necessary but not"
  echo "  sufficient. Nothing below can run; do not substitute fixtures."
  exit 1
fi
python3 -c 'import json,sys;d=json.load(open("/tmp/league.json"));print(json.dumps({k:d.get(k) for k in ("league_id","name","season","status","total_rosters","playoff_week_start")},indent=1))'

echo
echo "=== FULL REAL PIPELINE BUILD ==="
python3 draft/build.py --league-id "$LEAGUE_ID" --slot "$SLOT" 2>&1 | tail -40

echo
echo "=== GUARD: is this artifact actually real? ==="
python3 - "$ART" <<'PY'
import json, sys
a = json.load(open(sys.argv[1]))
prov = a.get("provenance", {})
adp = (prov.get("adp") or {}).get("adp_source")
opp = prov.get("opportunity_adjustment") or (
      "APPLIED" if prov.get("opportunity_applied") else "DISABLED")
print("  adp_source                :", adp)
print("  opportunity_adjustment    :", opp)
print("  opportunity_adj_coverage  :", prov.get("opportunity_adj_coverage"))
print("  built_at                  :", a.get("built_at"))
if adp in (None, "fixture"):
    sys.exit("STOP: adp_source is %r. This is a fixture build. The evidence "
             "items below would be indistinguishable from real output and are "
             "therefore worse than not producing them." % adp)
PY

# Each half runs even if the other fails.
#
# The first CI run lost SEVEN working items because item 5 raised a KeyError,
# `set -e` aborted the script, and items.js never executed. An evidence bundle
# whose failure mode is "produce nothing" defeats its own purpose: a failed
# item is itself evidence, and the items that would have worked are the ones
# a reader most needs. Failures are collected and re-raised at the end, so
# nothing is hidden — only isolated.
rc=0
echo
echo "=== ITEMS 5, 6, 7, 9 (joins, match rates, live scoring settings) ==="
python3 draft/evidence/items.py "$LEAGUE_ID" || { rc=1; echo "!! python items exited non-zero"; }

echo
echo "=== ITEMS 13, 15, 25, 26 (board, survival, end-to-end traces) ==="
SLOT="$SLOT" node draft/evidence/items.js || { rc=1; echo "!! node items exited non-zero"; }

echo
if [ "$rc" -ne 0 ]; then
  echo "=== ONE OR MORE ITEMS FAILED — see the tracebacks above ==="
else
  echo "=== all items produced output ==="
fi
exit $rc
