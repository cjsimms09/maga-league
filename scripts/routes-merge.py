#!/usr/bin/env python3
# TERRITORY: C
"""A THREE-WAY MERGE FOR ROUTES.md, BECAUSE `--union` CANNOT EXPRESS A CLOSE.

⚠️ SHARED-FILE TOOL BY C, 2026-08-14 — banner per Cory's three-session rule.

THE DEFECT, MEASURED. `integrate.sh` merges ROUTES.md with `git merge-file
--union`, which keeps every line from BOTH sides. A union has no way to represent
a DELETION — and in this channel the deletion IS the receipt: "when you handle an
item, DELETE THE LINE". So every close is undone by the next merge that touches
the file.

Observed today: I closed fourteen items in `b809534`, pushed it to main, and two
merges later all fourteen were back in my inbox. It is not a race and it is not a
mistake by anyone — it is what `--union` means. It also explains the symptom A
already recorded from the other side: `lane-start.sh` reporting nineteen items to
B where ten existed.

WHY UNION WAS CHOSEN AND WHY IT IS STILL HALF-RIGHT. Both sides APPEND, so
ours-vs-theirs silently discards one side's new items — that is the incident union
was added to fix, and it did fix it. The bug is that appends and deletions need
opposite treatment, and one flag was applied to both.

THE CORRECT SEMANTICS, at the ITEM level rather than the line level:

    result = (mine ∪ theirs) − (base − mine) − (base − theirs)

Read: keep everything either side has, then remove anything either side
DELETED relative to the common ancestor. An append survives because it is in one
side and not in base. A close survives because it is in base and gone from one
side. Both sides' work is preserved, which is what the union was reaching for.

AN ITEM IS ITS FIRST LINE. Items are multi-line and continuation lines are
indented; a line-level merge cannot tell a new item from a reworded one. Keying on
the `- [ ]` line makes the identity explicit and matches how `lane-start.sh` and
`routes_integrity.test.js` already count.

Usage:  python3 scripts/routes-merge.py BASE MINE THEIRS OUT
        (each a path to a ROUTES.md revision; writes the merged file to OUT)
"""
import sys


def parse_sections(text: str):
    """(preamble, [(heading, [(key, block), ...]), ...]).

    ⚠ SECTION-AWARE, BECAUSE AN ITEM BELONGS TO A LANE. My first version merged
    one flat item list and appended my new items after everything — which put an
    item addressed to A underneath `## TO: C`. That is the exact corruption A's
    `routes_integrity.test.js` fail-arm reproduces ("a resurrected item outside
    its heading"), and I reintroduced it in the tool meant to prevent it.

    An item is its `- [ ]` line plus the indented continuation lines under it.
    """
    lines = (text or "").split("\n")
    pre, sections, cur_items, cur_head, cur = [], [], None, None, None

    def flush_item():
        nonlocal cur
        if cur is not None:
            cur_items.append((cur[0], cur))
            cur = None

    def flush_section():
        nonlocal cur_head, cur_items
        flush_item()
        if cur_head is not None:
            sections.append((cur_head, cur_items))
        cur_head, cur_items = None, None

    for ln in lines:
        if ln.startswith("## ") or ln.startswith("# "):
            flush_section()
            cur_head, cur_items = ln, []
        elif ln.startswith("- [ ] "):
            if cur_head is None:
                pre.append(ln)
                continue
            flush_item()
            cur = [ln]
        elif cur is not None:
            cur.append(ln)
        elif cur_head is not None:
            cur_items.append((None, [ln]))          # prose inside a section
        else:
            pre.append(ln)
    flush_section()
    return pre, sections


def merge(base: str, mine: str, theirs: str) -> str:
    """(mine ∪ theirs) − (base − mine) − (base − theirs), PER SECTION.

    Keep everything either side has; remove anything either side DELETED relative
    to the common ancestor. An append survives because it is in one side and not
    in base. A close survives because it is in base and gone from one side.

    Section order follows `theirs` (the incoming side), with any section only
    `mine` has appended — so a lane's inbox never moves and an item never lands
    under another lane's heading.
    """
    _, sec_b = parse_sections(base)
    pre_m, sec_m = parse_sections(mine)
    pre_t, sec_t = parse_sections(theirs)

    def keys(secs, head):
        for h, items in secs:
            if h == head:
                return {k for k, _ in items if k}
        return set()

    order, seen_head = [], set()
    for h, _ in list(sec_t) + list(sec_m):
        if h not in seen_head:
            seen_head.add(h)
            order.append(h)

    out = []
    for head in order:
        kb, km, kt = keys(sec_b, head), keys(sec_m, head), keys(sec_t, head)
        closed = (kb - km) | (kb - kt)
        block, seen = [head], set()
        for src in (sec_t, sec_m):
            for h, items in src:
                if h != head:
                    continue
                for k, lines in items:
                    if k is None:
                        if not block[1:]:
                            block.extend(lines)     # section prose, once
                        continue
                    if k in closed or k in seen:
                        continue
                    seen.add(k)
                    block.extend(lines)
        out.append("\n".join(block).rstrip("\n"))

    pre = pre_t if len("\n".join(pre_t)) >= len("\n".join(pre_m)) else pre_m
    return "\n".join(pre).rstrip("\n") + "\n\n" + "\n\n".join(out) + "\n"


def main(argv):
    if len(argv) != 5:
        print(__doc__.strip().splitlines()[-2], file=sys.stderr)
        return 2
    base, mine, theirs, out = argv[1:]
    with open(base) as f:
        b = f.read()
    with open(mine) as f:
        m = f.read()
    with open(theirs) as f:
        t = f.read()
    merged = merge(b, m, t)
    with open(out, "w") as f:
        f.write(merged)
    n = merged.count("\n- [ ] ") + (1 if merged.startswith("- [ ] ") else 0)
    print("routes-merge: %d open item(s) after merge" % n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
