#!/usr/bin/env bash
# TERRITORY: C
# THE UNION CANNOT EXPRESS A CLOSE — and this proves both halves.
#
# Both real incidents are reconstructed as FAIL ARMS: the one `--union` was added
# to fix (an append discarded by ours-vs-theirs) and the one it CAUSED (a close
# undone by the next merge). A tool that fixes only the second would be the first
# bug again.
set -uo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()   { pass=$((pass+1)); echo "PASS  $1"; }
bad()  { fail=$((fail+1)); echo "FAIL  $1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 -> got '$2' want '$3'"; fi; }

cat > "$T/base" <<'EOF'
# ROUTES

## TO: A
- [ ] A1 first
  continuation of A1
- [ ] A2 second

## TO: C
- [ ] C1 handled by C
- [ ] C2 also handled
EOF

# MINE: C closed both of its items and routed a new one to A.
cat > "$T/mine" <<'EOF'
# ROUTES

## TO: A
- [ ] A1 first
  continuation of A1
- [ ] A2 second
- [ ] A3 routed by C

## TO: C
EOF

# THEIRS: A appended a new item to C's inbox and touched nothing else.
cat > "$T/theirs" <<'EOF'
# ROUTES

## TO: A
- [ ] A1 first
  continuation of A1
- [ ] A2 second

## TO: C
- [ ] C1 handled by C
- [ ] C2 also handled
- [ ] C3 new from A
EOF

python3 scripts/routes-merge.py "$T/base" "$T/mine" "$T/theirs" "$T/out" >/dev/null || bad "merge exited non-zero"
OUT=$(cat "$T/out")

# ── THE INCIDENT THIS TOOL EXISTS FOR ────────────────────────────────────────
check "a CLOSE survives the merge (C1)" \
  "$(grep -c 'C1 handled by C' <<<"$OUT")" "0"
check "a CLOSE survives the merge (C2)" \
  "$(grep -c 'C2 also handled' <<<"$OUT")" "0"

# ── THE INCIDENT `--union` WAS ADDED FOR, which must NOT come back ───────────
check "the other side's APPEND is kept (C3)" \
  "$(grep -c 'C3 new from A' <<<"$OUT")" "1"
check "my own APPEND is kept (A3)" \
  "$(grep -c 'A3 routed by C' <<<"$OUT")" "1"
check "untouched items survive (A1)" "$(grep -c 'A1 first' <<<"$OUT")" "1"
check "multi-line items keep their continuation" \
  "$(grep -c 'continuation of A1' <<<"$OUT")" "1"

# ── AN ITEM MUST LAND UNDER ITS OWN LANE, which my first version broke ───────
A_SECTION=$(awk '/^## TO: A/{f=1;next} /^## /{f=0} f' <<<"$OUT")
C_SECTION=$(awk '/^## TO: C/{f=1;next} /^## /{f=0} f' <<<"$OUT")
check "A3 is under TO: A"      "$(grep -c 'A3 routed by C' <<<"$A_SECTION")" "1"
check "A3 is NOT under TO: C"  "$(grep -c 'A3 routed by C' <<<"$C_SECTION")" "0"
check "C3 is under TO: C"      "$(grep -c 'C3 new from A' <<<"$C_SECTION")" "1"
check "C3 is NOT under TO: A"  "$(grep -c 'C3 new from A' <<<"$A_SECTION")" "0"

# ── CONTROL: NOTHING CHANGED ON EITHER SIDE ─────────────────────────────────
# A merge that alters an untouched file would be worse than the bug.
python3 scripts/routes-merge.py "$T/base" "$T/base" "$T/base" "$T/same" >/dev/null
check "an unchanged merge is a no-op on item count" \
  "$(grep -c '^- \[ \] ' "$T/same")" "$(grep -c '^- \[ \] ' "$T/base")"

# ── CONTROL: BOTH SIDES CLOSE THE SAME ITEM ─────────────────────────────────
sed '/C1 handled by C/d' "$T/base" > "$T/both_m"
sed '/C1 handled by C/d' "$T/base" > "$T/both_t"
python3 scripts/routes-merge.py "$T/base" "$T/both_m" "$T/both_t" "$T/both" >/dev/null
check "an item both sides closed stays closed" \
  "$(grep -c 'C1 handled by C' "$T/both")" "0"

# ── FAIL ARM: what a UNION would have done, so the difference is asserted ────
cp "$T/mine" "$T/u"; git merge-file --union "$T/u" "$T/base" "$T/theirs" >/dev/null 2>&1 || true
UNION_KEEPS=$(grep -c 'C1 handled by C' "$T/u")
check "CONTROL — a union DOES resurrect the closed item (this is the bug)" \
  "$UNION_KEEPS" "1"

echo
echo "routes-merge: $pass passed, $fail failed"
[ "$fail" = "0" ] || exit 1
