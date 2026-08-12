#!/usr/bin/env bash
# RULE 10 FOR stated_derivation_sweep.js — BREAK IT BEFORE TRUSTING IT.
#
# The first version of that sweep reported "residual 0" and could not detect the
# defect it was written for. This script reintroduces that exact defect into
# engine.js — PATHS_BAND: 12.0 with its shipped comment — runs the sweep, and
# requires it to FIRE. Then it restores engine.js byte-for-byte and requires the
# sweep to come back clean. A green run means the null is a null and not a
# structural incapacity.
#
# Run: bash draft/tools/stated_derivation_sweep_verify.sh
set -u
cd "$(dirname "$0")/../.."
ENGINE=public/js/draft/engine.js
BAK="$(mktemp)"; cp "$ENGINE" "$BAK"
restore() { cp "$BAK" "$ENGINE"; rm -f "$BAK"; }
trap restore EXIT

fail=0

echo "── ARM 1: clean tree — the sweep must report residual 0 ──────────────────"
node draft/tools/stated_derivation_sweep.js; clean=$?
[ $clean -eq 0 ] || { echo "UNEXPECTED: clean tree is not clean (exit $clean)"; fail=1; }

echo
echo "── ARM 2: the historical defect reintroduced — the sweep must FIRE ───────"
python3 - "$ENGINE" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """    PATHS_POOL: 10,
    get PATHS_BAND() { return (this.COIN_FLIP_GAP == null ? 1 : this.COIN_FLIP_GAP) * 4; },"""
new = """    PATHS_POOL: 10,
    // how far below the top score a direction may sit: max(12, COIN_FLIP_GAP*4) = 12
    PATHS_BAND: 12.0,"""
if old not in s:
    sys.exit("ANCHOR MISSING — PATHS_BAND no longer matches the shape this check injects into.\n"
             "That is not a pass. Update this script or the guard is not being exercised.")
open(p, 'w').write(s.replace(old, new))
PY
[ $? -eq 0 ] || { echo "could not reintroduce the defect"; exit 1; }

out="$(node draft/tools/stated_derivation_sweep.js 2>&1)"; dirty=$?
echo "$out"
if [ $dirty -eq 0 ]; then
  echo
  echo "*** VERIFICATION FAILED — the sweep reported CLEAN with the defect present."
  echo "    Its nulls mean nothing. This is exactly the state the first version shipped in."
  fail=1
elif ! echo "$out" | grep -q 'PATHS_BAND.*INERT REFERENCE'; then
  echo
  echo "*** VERIFICATION FAILED — the sweep fired, but not on PATHS_BAND as an"
  echo "    INERT REFERENCE. It is detecting something other than the defect class."
  fail=1
else
  echo
  echo "ARM 2 OK — fired on PATHS_BAND as an INERT REFERENCE."
fi

restore; trap - EXIT
if cmp -s "$ENGINE" "$(git rev-parse --show-toplevel)/$ENGINE" 2>/dev/null; then :; fi
if ! git diff --quiet -- "$ENGINE"; then
  echo "*** engine.js WAS NOT RESTORED — working tree is dirty. Fix before committing."
  fail=1
else
  echo "engine.js restored, working tree clean."
fi

echo
if [ $fail -eq 0 ]; then
  echo "VERIFIED: the sweep fires on the defect and is silent without it."
else
  echo "NOT VERIFIED."
fi
exit $fail
