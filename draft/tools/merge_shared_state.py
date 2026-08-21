#!/usr/bin/env python3
# TERRITORY: A
"""RESOLVE THE SHARED-STATE MERGE CONFLICTS BY RULE, NOT BY PREFERENCE.

Register 186's ruling (A, 2026-08-21) settled the protocol; this applies it, so
the third merge in a row is not a third hand-written script. Every lane's merge
into `main` collides on the same four files, and each has ONE correct rule:

  ROUTES.md, CORY-ASKS.md, OPEN-QUESTIONS.md   ITEM UNION
      Every `- [ ]` item from EITHER side survives. Deduped on ITEM IDENTITY
      (date + lanes + opening words, markup stripped) rather than on exact line
      equality -- equality lets a cosmetically reworded item through twice, and
      `routes_integrity`'s near-duplicate ratchet catches it (it caught me).

  DEFECT-REGISTER.md, PREDICTION-LEDGER.md     ROW UNION, MAIN WINS TIES
      Every row id from EITHER side survives. Where both carry the same id,
      MAIN's text is canonical -- register 186's ruling, and the reason is that
      main's text is the side already cited by commits, audits and tests that
      no branch author can reach.

  draft/data/register_id_watermark.json        MAX + HISTORY UNION
      A watermark is monotonic, so next_numeric_id is the max. The claim
      history is UNIONed by (id, claimed_at): taking one side erases the other
      lane's record of ids it already claimed, which is the exact bypass 186
      exists to prevent.

WHAT THIS DELIBERATELY DOES NOT DO: it never resolves a DATA file. Register
173's hazard -- `draft/data/bovada_lines_2026.jsonl`, where main is
cron-appended live capture and a branch copy is a stale snapshot -- must take
MAIN's side, and a union would silently destroy captured rows. Data files are
refused by name so nobody reaches for this script and gets a plausible wrong
answer.

Run:  python3 draft/tools/merge_shared_state.py            # resolve all staged conflicts it knows
      python3 draft/tools/merge_shared_state.py --check    # report only
"""
from __future__ import annotations
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ITEM_UNION  = {"ROUTES.md", "CORY-ASKS.md", "OPEN-QUESTIONS.md"}
ROW_UNION   = {"DEFECT-REGISTER.md", "PREDICTION-LEDGER.md"}
WATERMARK   = {"draft/data/register_id_watermark.json"}
#: refused rather than guessed -- see the module docstring
REFUSE      = {"draft/data/bovada_lines_2026.jsonl"}

_MARKUP = re.compile(r'[*`_~⚠️🔴🟡🟠✅⭐📮📣⚖️🔧🛑🔍🏛🔀]')

def _sh(args):
    return subprocess.run(args, cwd=str(ROOT), capture_output=True, text=True)

def _side(path, n):
    r = _sh(["git", "show", ":%d:%s" % (n, path)])
    return r.stdout.split("\n") if r.returncode == 0 else None

def item_key(line):
    s = _MARKUP.sub('', line)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    m = re.match(r'^- \[[ x]\] (\d{4}-\d\d-\d\d) ·? ?([^·]*)·(.{0,60})', s)
    return (m.group(1), m.group(2).strip(), m.group(3).strip()) if m else None

def row_id(line):
    m = re.match(r'^\|\s*([A-Za-z]?[0-9]+[a-z]?)\s*\|', line)
    return m.group(1) if m else None

def union_items(ours, theirs):
    have = {item_key(l) for l in ours if item_key(l)}
    lane_of, cur = {}, None
    for l in theirs:
        if l.startswith('## TO: '): cur = l
        k = item_key(l)
        if k: lane_of[k] = cur
    add, keep = [], False
    for l in theirs:
        k = item_key(l)
        if k is not None:
            keep = k not in have
            if keep: add.append(l); have.add(k)
        elif keep and l.strip():
            add.append(l)
    out = list(ours)
    for lane in sorted({lane_of.get(item_key(l)) for l in add if item_key(l)}, key=lambda x: str(x)):
        if lane is None or lane not in out:
            continue
        idx = out.index(lane) + 1
        block, keep = [], False
        for l in add:
            k = item_key(l)
            if k is not None: keep = lane_of.get(k) == lane
            if keep: block.append(l)
        out[idx:idx] = block + ['']
    return out, len([l for l in add if item_key(l)])

def union_rows(ours, theirs):
    seen = {row_id(l) for l in ours if row_id(l)}
    out, added = list(ours), 0
    tail = len(out)
    for i in range(len(out) - 1, -1, -1):
        if row_id(out[i]): tail = i + 1; break
    for l in theirs:
        r = row_id(l)
        if r and r not in seen:
            out.insert(tail, l); tail += 1; seen.add(r); added += 1
    return out, added

def merge_watermark(ours, theirs):
    a = json.loads("\n".join(ours)); b = json.loads("\n".join(theirs))
    hist = {}
    for row in (a.get("history") or []) + (b.get("history") or []):
        hist[(str(row.get("id")), str(row.get("claimed_at")))] = row
    def k(r):
        try: return (0, int(r.get("id")), str(r.get("claimed_at")))
        except Exception: return (1, 0, str(r.get("id")))
    m = dict(a)
    m["next_numeric_id"] = max(a.get("next_numeric_id", 0), b.get("next_numeric_id", 0))
    m["history"] = sorted(hist.values(), key=k)
    return (json.dumps(m, indent=1) + "\n").split("\n"), m["next_numeric_id"]

def main():
    check = "--check" in sys.argv
    conflicted = [l for l in _sh(["git", "diff", "--name-only", "--diff-filter=U"]).stdout.split("\n") if l.strip()]
    if not conflicted:
        print("no conflicted files"); return 0
    handled, refused, unknown = [], [], []
    for path in conflicted:
        base = Path(path).name
        if path in REFUSE:
            refused.append(path); continue
        ours, theirs = _side(path, 2), _side(path, 3)
        if ours is None or theirs is None:
            unknown.append(path); continue
        if base in ITEM_UNION:
            out, n = union_items(ours, theirs); what = "%d items added" % n
        elif base in ROW_UNION:
            out, n = union_rows(ours, theirs); what = "%d rows added" % n
        elif path in WATERMARK:
            out, n = merge_watermark(ours, theirs); what = "next_numeric_id=%s" % n
        else:
            unknown.append(path); continue
        if not check:
            (ROOT / path).write_text("\n".join(out))
            _sh(["git", "add", path])
        handled.append((path, what))
    for p, w in handled:
        print("  %-34s %s%s" % (p, w, "" if check else "  [resolved+staged]"))
    for p in refused:
        print("  %-34s ⛔ REFUSED BY NAME — live capture data; take MAIN's side by hand (register 173)" % p)
    for p in unknown:
        print("  %-34s ⚠️  no rule for this file — resolve by hand" % p)
    return 1 if (refused or unknown) else 0

if __name__ == "__main__":
    sys.exit(main())
