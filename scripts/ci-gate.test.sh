#!/usr/bin/env bash
# THE CI GATE MUST FAIL WHEN CI FAILS, AND MUST NOT PASS WHEN IT CANNOT TELL.
#
# integrate.sh printed "NOT CI-VERIFIED" as a warning and exited 0 for more than
# thirty consecutive merges onto a red main. The gate that replaced it is worth
# exactly as much as its ability to say no, so this file drives ci_status.sh
# through all three outcomes with a stubbed API rather than trusting the live one
# — a test that depends on the real CI's current colour would flip meaning every
# time somebody pushed.
#
# Run: bash scripts/ci-gate.test.sh
set -u
cd "$(dirname "$0")/.."
pass=0; fail=0
ck() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS $1"; else
  fail=$((fail+1)); echo "FAIL $1 -> got '$2', want '$3'"; fi; }

STUB="$(mktemp -d)"
trap 'rm -rf "$STUB"' EXIT

# A fake `curl` on PATH, so the helper's own parsing is what is under test.
mkfake() {  # $1 = json body ("" = empty, "ERR" = non-zero exit)
  cat > "$STUB/curl" <<EOF
#!/usr/bin/env bash
[ "\$(cat "$STUB/mode")" = "ERR" ] && exit 7
cat "$STUB/body.json"
EOF
  chmod +x "$STUB/curl"
  printf '%s' "${2:-OK}" > "$STUB/mode"
  printf '%s' "$1" > "$STUB/body.json"
}
run() { PATH="$STUB:$PATH" bash scripts/ci_status.sh "$@" >/dev/null 2>&1; echo $?; }

GREEN='{"workflow_runs":[{"status":"completed","conclusion":"success","head_sha":"abc12345deadbeef"}]}'
RED='{"workflow_runs":[{"status":"completed","conclusion":"failure","head_sha":"abc12345deadbeef"}]}'
RUNNING='{"workflow_runs":[{"status":"in_progress","conclusion":null,"head_sha":"abc12345deadbeef"}]}'
EMPTY='{"workflow_runs":[]}'

mkfake "$GREEN";   ck "latest: a green run exits 0"            "$(run latest main)" "0"
mkfake "$RED";     ck "latest: a RED run exits 1"              "$(run latest main)" "1"
mkfake "$EMPTY";   ck "latest: no runs exits 2 (cannot tell)"  "$(run latest main)" "2"
mkfake "not json"; ck "latest: unparseable exits 2, not 0"     "$(run latest main)" "2"
mkfake "$GREEN" ERR; ck "latest: curl failure exits 2, not 0"  "$(run latest main)" "2"

mkfake "$GREEN";   ck "sha: green exits 0"                     "$(run sha abc12345 0)" "0"
mkfake "$RED";     ck "sha: RED exits 1"                       "$(run sha abc12345 0)" "1"
mkfake "$RUNNING"; ck "sha: STILL RUNNING at budget exits 2"   "$(run sha abc12345 0)" "2"
mkfake "$GREEN";   ck "sha: a DIFFERENT sha's green is not mine — exits 2" \
                                                                "$(run sha ffffffff 0)" "2"

# ── THE CONTROL. If `run` always returned the same code the table above would
# be meaningless, so require that it actually varies. ──────────────────────────
mkfake "$GREEN"; g="$(run latest main)"
mkfake "$RED";   r="$(run latest main)"
ck "CONTROL: the helper distinguishes green from red at all" "$([ "$g" != "$r" ] && echo yes || echo no)" "yes"

# ── AND THE GATE IS ACTUALLY WIRED INTO integrate.sh ─────────────────────────
grep -q 'ci_status.sh" latest main' scripts/integrate.sh \
  && ck "integrate.sh checks main BEFORE calling the merge done" ok ok \
  || ck "integrate.sh checks main BEFORE calling the merge done" missing ok
grep -q 'ci_status.sh" sha' scripts/integrate.sh \
  && ck "integrate.sh polls the SHA it pushed" ok ok \
  || ck "integrate.sh polls the SHA it pushed" missing ok
grep -q 'A timeout or an unreachable API is NOT a pass' scripts/integrate.sh \
  && ck "integrate.sh treats unreadable CI as unverified" ok ok \
  || ck "integrate.sh treats unreadable CI as unverified" missing ok
# The regression itself: the old code printed a caveat and exited 0.
grep -q 'exit 1' scripts/integrate.sh \
  && ck "integrate.sh can exit non-zero on a red CI" ok ok \
  || ck "integrate.sh can exit non-zero on a red CI" missing ok

echo
echo "$pass passed, $fail failed"
[ "$fail" = "0" ] || exit 1
