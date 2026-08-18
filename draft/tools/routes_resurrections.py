#!/usr/bin/env python3
# TERRITORY: relay — the relay owns "nothing is lost". This is the other half of
# that job, and it took four days to notice: nothing is lost, and nothing STAYS
# ANSWERED either, because a closed item can come back open and nobody sees it.
"""WHICH CLOSED ITEMS CAME BACK OPEN — AND OUR OWN MERGE DOCTRINE IS WHY.

── THE MECHANISM, NAMED 2026-08-18 ────────────────────────────────────────────

`routes_integrity.test.js` carries a merge-union check whose stated guarantee is
*"a true union loses nothing"* — when two branches both edit `ROUTES.md`, take
both sides. That rule is correct and it is the reason no item has been lost.

**It is also the reason nine duplicate pairs exist, and `git blame` proves it:**

    89a731cc  08-17 21:20  "Close five informational items in A's queue"
    bcdeef0a  08-18 00:19  "Merge the red-team lane's three fixes"  → +51 lines

E's branch forked from `main` BEFORE the closures and therefore still carried the
`- [ ]` copies. The union merge took both sides, exactly as doctrine says. So
`main` ended up with the `- [x]` copy AND a resurrected `- [ ]` copy of the same
seven items — items A had already dealt with, back in A's inbox four days before
the draft, with `routes_response_check.js` counting them as open.

**A union is safe against LOSS and unsafe against RESURRECTION.** Those are not
the same failure and only one of them had a gate. Union-merging is still right —
the fix is this check, not a different merge rule.

── WHAT COUNTS AS PROVABLY SAFE TO REPAIR ─────────────────────────────────────

Only where the CLOSED copy strictly CONTAINS the OPEN one — every difflib opcode
between them is `equal` or `insert`, i.e. the closed copy is the open text plus
an appended closure note and nothing else. Then deleting the open copy provably
loses zero characters.

This bar is not paranoia, it is a scar. Repairing two of these by hand earlier the
same day took **16 lines of evidence** with it, because the copy that had been
CLOSED was the one carrying the body and the copy still OPEN was the stub. That
is the general case here too: in six of the seven repairable pairs the closed copy
is the LONGER one, so "delete the stale closed one" is exactly backwards.

Anything failing the containment test is REPORTED AND LEFT ALONE. A mailbox whose
contract is line-by-line is not safe to de-duplicate on a similarity score.

Run:  python3 draft/tools/routes_resurrections.py            # report only
      python3 draft/tools/routes_resurrections.py --repair   # delete provably-safe open copies
"""
from __future__ import annotations

import argparse
import difflib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROUTES = ROOT / "ROUTES.md"

ITEM_RE = re.compile(r"^- \[([ xX])\]")
HEAD_RE = re.compile(r"^## TO: ")

#: Below this the key is too short to be a safe join — two genuinely different
#: one-line items from one author on one day would collide.
MIN_KEY = 40


def norm(line: str) -> str:
    """The join key: an item's text with emphasis, emoji and checkbox removed.

    Byte-equality sees NONE of these pairs — the copies differ by a checkbox, by
    a leading emoji, by `~~strikethrough~~`. That is why the duplicates survived
    four days of the file being read every session.
    """
    s = ITEM_RE.sub("", line, count=1).lstrip()
    for a in ("~~", "**", "`"):
        s = s.replace(a, "")
    s = re.sub(r"[^\w·\s.,:;()/-]", "", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip().lower()[:MIN_KEY + 70]


def body(line: str) -> str:
    """Everything after the checkbox — what a deletion would actually destroy."""
    return ITEM_RE.sub("", line, count=1)


def is_open(line: str) -> bool:
    return line.startswith("- [ ]")


def contained(open_body: str, closed_body: str) -> bool:
    """Is the open copy's text wholly present in the closed copy?

    `insert` means the closed copy has text the open one lacks (the closure note).
    `delete`/`replace` mean the OPEN copy carries something the closed one does
    not — a later edit, an added measurement — and deleting it would lose that.
    """
    tags = {t for t, *_ in difflib.SequenceMatcher(None, open_body, closed_body).get_opcodes()}
    return tags <= {"equal", "insert"}


def scan(text: str) -> tuple[list, list]:
    """`(repairable, needs_human)` — pairs of the same item within one inbox.

    WITHIN ONE INBOX, never across the file: `ROUTES.md` is organised by
    addressee and standing rules are broadcast to every lane on purpose, so the
    same text in two sections is design and twice in ONE section is the defect.
    """
    lines = text.split("\n")
    groups: dict = {}
    section = None
    for i, line in enumerate(lines, start=1):
        if HEAD_RE.match(line):
            section = line.strip()
            continue
        if not ITEM_RE.match(line):
            continue
        key = norm(line)
        if len(key) < MIN_KEY:
            continue
        groups.setdefault((section, key), []).append(i)

    repairable, needs_human = [], []
    for (section, _key), idx in sorted(groups.items(), key=lambda kv: kv[1][0]):
        if len(idx) < 2:
            continue
        opens = [i for i in idx if is_open(lines[i - 1])]
        closed = [i for i in idx if not is_open(lines[i - 1])]
        if not opens or not closed:
            state = "both OPEN" if opens else "both CLOSED"
            needs_human.append((section, idx, state + " — not a resurrection, a paste"))
            continue
        if len(opens) > 1 or len(closed) > 1:
            needs_human.append((section, idx, "more than two copies"))
            continue
        o, c = body(lines[opens[0] - 1]), body(lines[closed[0] - 1])
        if contained(o, c):
            repairable.append((section, opens[0], closed[0], len(o), len(c)))
        else:
            needs_human.append((section, [opens[0], closed[0]],
                                "the OPEN copy carries text the CLOSED one does not"))
    return repairable, needs_human


def repair(text: str) -> tuple[str, list]:
    """Delete only the provably-contained open copies. Re-verified before writing."""
    repairable, _ = scan(text)
    lines = text.split("\n")
    drop = set()
    for section, o, c, _lo, _lc in repairable:
        # BELT AND BRACES: prove it again against the live lines, because the
        # index came from a scan and a stale index deletes the wrong row.
        assert is_open(lines[o - 1]) and not is_open(lines[c - 1]), (section, o, c)
        assert contained(body(lines[o - 1]), body(lines[c - 1])), (section, o, c)
        drop.add(o)
        # a lone blank line left behind by the deletion, if the row is isolated
        if o < len(lines) and lines[o] == "" and o - 2 >= 0 and lines[o - 2] == "":
            drop.add(o + 1)
    out = [l for i, l in enumerate(lines, start=1) if i not in drop]
    return "\n".join(out), repairable


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repair", action="store_true",
                    help="delete the open copies that are provably contained in a closed one")
    a = ap.parse_args()

    text = ROUTES.read_text()
    repairable, needs_human = scan(text)

    print("=" * 78)
    print("RESURRECTED ITEMS — closed, then re-opened by a union merge")
    print("=" * 78)
    print(f"  {len(repairable)} provably safe to repair · {len(needs_human)} need a human\n")
    for section, o, c, lo, lc in repairable:
        longer = "CLOSED copy is LONGER" if lc > lo else "same length"
        print(f"  {section:12s} L{o} open ({lo}ch)  ←  L{c} closed ({lc}ch)   [{longer}]")
    if needs_human:
        print()
        for section, idx, why in needs_human:
            print(f"  ⚠ {section:12s} lines {idx} — {why}")

    if not a.repair:
        print("\n  Report only. `--repair` deletes ONLY the provably-contained open copies.")
        print("=" * 78)
        return 0

    new, done = repair(text)
    ROUTES.write_text(new)
    print(f"\n  REPAIRED {len(done)} open copies. Nothing else touched.")
    print("=" * 78)
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
