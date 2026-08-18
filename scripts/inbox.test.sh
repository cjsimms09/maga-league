#!/usr/bin/env bash
# TERRITORY: A
# inbox.sh's triage is a CLAIM about which items are decisions/receipts/work —
# claims get fail arms. Runs against a fixture ROUTES.md in a temp repo so the
# real one's churn can never make this flaky, plus one live smoke run.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ck() { local n="$1"; shift; if "$@" >/dev/null 2>&1; then pass=$((pass+1)); echo "PASS  $n";
       else fail=$((fail+1)); echo "FAIL  $n"; fi; }

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cd "$T"; git init -q .; git commit -q --allow-empty -m x
cat > ROUTES.md <<'EOF'
# routes
## TO: A
- [ ] 2026-08-14 · C · 🔁 **DECISION: pick one of the two options.** Body here.
  **Say go and it is built; say no and I record the reason.**
- [ ] 2026-08-13 · C · 🧊 **A finding that got handled later.**
  **✅ RESOLVED 2026-08-15 (relay):** fixed, tests green.
- [ ] 2026-08-12 · B · 🔧 **Plain open work item.** One paragraph of evidence.
## TO: B
- [ ] 2026-08-14 · A · 📌 **Item A routed to B, still open.**
## TO: C
EOF
cp "$HERE/inbox.sh" .

OUT="$(bash inbox.sh A)"
ck "counts each kind exactly once (1 decision, 1 receipt, 1 work)" \
  bash -c "printf '%s' '$OUT' | grep -q '3 open — 1 decision(s), 1 receipt(s), 1 work'"
ck "the DECISION item lands under the decisions header" \
  bash -c "printf '%s\n' \"\$0\" | awk '/DECISIONS/{d=1} /RECEIPTS/{d=0} d && /pick one of the two/{found=1} END{exit !found}'" "$OUT"
ck "the RESOLVED item lands under receipts, not work" \
  bash -c "printf '%s\n' \"\$0\" | awk '/RECEIPTS/{r=1} /WORK/{r=0} r && /got handled later/{found=1} END{exit !found}'" "$OUT"
ck "FAIL ARM — the work item is NOT classified as a decision" \
  bash -c "! printf '%s\n' \"\$0\" | awk '/DECISIONS/{d=1} /RECEIPTS/{d=0} d && /Plain open work/{found=1} END{exit !found}'" "$OUT"

OUT_B="$(bash inbox.sh B)"
ck "lane B sees only its own item" \
  bash -c "printf '%s' '$OUT_B' | grep -q 'routed to B' && ! printf '%s' '$OUT_B' | grep -q 'pick one of the two'"
ck "an empty lane block says so rather than erroring" \
  bash -c "bash inbox.sh C | grep -q 'no open items'"

SENT="$(bash inbox.sh A --sent)"
ck "outbox shows A's still-open item in B's block" \
  bash -c "printf '%s' '$SENT' | grep -q 'routed to B'"
ck "FAIL ARM — outbox does NOT list items A received" \
  bash -c "! printf '%s' '$SENT' | grep -q 'pick one of the two'"

# Live smoke: the real ROUTES.md parses without error and reports a count.
cd "$HERE/.."
ck "live ROUTES.md parses and reports an inbox line" \
  bash -c "bash scripts/inbox.sh A | head -1 | grep -qE 'INBOX A: [0-9]+ open'"

echo ""
echo "$pass passed, $fail failed"
exit $((fail > 0))
