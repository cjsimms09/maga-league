#!/usr/bin/env bash
# TERRITORY: A  (shared infra — A owns scripts/, per TERRITORY.md)
#
# TRIAGE THE ROUTED INBOX, DON'T JUST LIST IT.
#
# Cory, 2026-08-15: "Organization so A can knock out tasks quickly without
# reducing standards... streamline 2 way communication." The bottleneck
# lane-start.sh leaves open: a lane's ROUTES.md block is a queue of items that
# are each 5-60 lines of dense evidence, and THREE DIFFERENT KINDS of thing
# live in it with nothing marking which is which:
#
#   DECISION — the sender needs this lane's (or Cory's) judgment. Highest
#              value per minute; invisible among the walls of text.
#   RECEIPT  — the sender ALREADY RESOLVED it (relay covering a lane, marked
#              "✅ RESOLVED" in-line per protocol) and the line survives only
#              because the receiver-deletes rule says the OWNER confirms and
#              deletes. Cheapest to clear; reads identical to open work.
#   WORK     — a real open item for this lane.
#
# Reading order IS the standard: decisions first, receipts batch-cleared,
# work by age. This prints exactly that, one line per item, with the line
# count as an honest effort proxy. It changes nothing and never gates
# (exit 0 always) — same philosophy as lane-start.sh: a mechanism, not an
# instruction, and read-only so nobody disables it.
#
#   bash scripts/inbox.sh A          # my inbox, triaged
#   bash scripts/inbox.sh A --sent   # my OUTBOX: items I routed that other
#                                    # lanes have not closed yet (the other
#                                    # half of two-way: deletion is the
#                                    # receipt, so still-present = still open)
#
# Parsing contract (the format ROUTES.md already uses, not a new convention):
#   items start  "- [ ] YYYY-MM-DD · SENDER · <head line...>"
#   blocks start "## TO: <LANE>"
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

LANE="${1:-}"
MODE="${2:-}"
[ -n "$LANE" ] || { echo "usage: inbox.sh A|B|C [--sent]"; exit 0; }
[ -f ROUTES.md ] || { echo "no ROUTES.md in this tree — run scripts/lane-start.sh $LANE first"; exit 0; }

TODAY_S="$(date -u +%s)"

# One awk pass builds a record per item: block lane, sender, date, head, body
# size, and classification. Classification is TEXTUAL and deliberately dumb —
# it keys on markers the protocol already uses, so nothing new to remember:
#   RECEIPT:  the item body carries "✅ RESOLVED"
#   DECISION: the head or body carries "DECISION" as a word, or "yours" in the
#             sender's characteristic "the call is yours" constructions
#   WORK:     everything else
awk -v today="$TODAY_S" '
  function flush() {
    if (head == "") return
    kind = "WORK"
    if (body ~ /✅[^A-Za-z]*RESOLVED/) kind = "RECEIPT"
    else if (head ~ /DECISION/ || body ~ /DECISION[:,]? *(YOURS|yours)|call is yours|Say the word|say go/) kind = "DECISION"
    gsub(/\|/, "/", head)
    printf "%s|%s|%s|%s|%d|%s\n", blk, sender, d, kind, lines, head
    head = ""; body = ""; lines = 0
  }
  /^## TO: / { flush(); blk = $3; next }
  /^## /     { flush(); blk = ""; next }
  /^- \[ \] / {
    flush()
    if (blk == "") next
    line = $0
    sub(/^- \[ \] /, "", line)
    d = substr(line, 1, 10)
    rest = substr(line, 14)
    n = index(rest, "·")
    if (n > 0) { sender = substr(rest, 1, n - 2); head = substr(rest, n + 2) }
    else { sender = "?"; head = rest }
    gsub(/^[ \t]+|[ \t]+$/, "", sender)
    lines = 1
    next
  }
  head != "" { body = body $0; lines++ }
  END { flush() }
' ROUTES.md > /tmp/inbox_items.$$

emit() { # emit <filter-expr-label> <records...>
  local label="$1"; shift
  local rows="$1"
  [ -n "$rows" ] || return 0
  printf '%s\n' "  $label"
  printf '%s\n' "$rows" | while IFS='|' read -r blk sender d kind lines head; do
    age=$(( (TODAY_S - $(date -u -d "$d" +%s 2>/dev/null || echo "$TODAY_S")) / 86400 ))
    printf '    %2sd  %-7.7s %3d¶  %s\n' "$age" "$sender" "$lines" "$(printf '%s' "$head" | cut -c1-92)"
  done
  printf '\n'
}

if [ "$MODE" = "--sent" ]; then
  echo "── OUTBOX: items lane $LANE routed that are STILL OPEN elsewhere ──────"
  echo "   (deletion is the receipt — an item still present has not been closed)"
  for other in A B C; do
    [ "$other" = "$LANE" ] && continue
    ROWS="$(awk -F'|' -v b="$other" -v s="$LANE" '$1 == b && $2 == s' /tmp/inbox_items.$$)"
    [ -n "$ROWS" ] && emit "→ TO: $other  ($(printf '%s\n' "$ROWS" | wc -l) open)" "$ROWS"
  done
  # Sent-as-"this session" belongs to whichever lane is running the relay.
  ROWS="$(awk -F'|' -v s="this session" '$2 == s && $1 != "'"$LANE"'"' /tmp/inbox_items.$$)"
  [ -n "$ROWS" ] && emit "→ sent as 'this session' (relay items in other lanes)" "$ROWS"
  rm -f /tmp/inbox_items.$$
  exit 0
fi

MINE="$(awk -F'|' -v b="$LANE" '$1 == b' /tmp/inbox_items.$$)"
rm -f /tmp/inbox_items.$$
if [ -z "$MINE" ]; then
  echo "── INBOX $LANE: no open items (or no block — run lane-start.sh to tell apart) ──"
  exit 0
fi

ND="$(printf '%s\n' "$MINE" | awk -F'|' '$4=="DECISION"' | wc -l)"
NR="$(printf '%s\n' "$MINE" | awk -F'|' '$4=="RECEIPT"'  | wc -l)"
NW="$(printf '%s\n' "$MINE" | awk -F'|' '$4=="WORK"'     | wc -l)"
echo "── INBOX $LANE: $((ND+NR+NW)) open — $ND decision(s), $NR receipt(s), $NW work ──"
echo "   Read in this order. Receipts are ALREADY RESOLVED by the sender: confirm,"
echo "   delete the line, commit — that IS the two-way receipt (see lane-start §3b)."
echo ""
emit "🎯 DECISIONS — highest value per minute, read these first:" \
  "$(printf '%s\n' "$MINE" | awk -F'|' '$4=="DECISION"')"
emit "✅ RECEIPTS — sender already resolved; confirm and delete the line:" \
  "$(printf '%s\n' "$MINE" | awk -F'|' '$4=="RECEIPT"')"
emit "🔧 WORK — open items, oldest first:" \
  "$(printf '%s\n' "$MINE" | awk -F'|' '$4=="WORK"' | sort -t'|' -k3,3)"
exit 0
