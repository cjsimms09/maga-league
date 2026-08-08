#!/usr/bin/env python3
"""CHAT-CLAUDE BRIEF — one command, one copy, one paste.

Emits a single compact markdown block for pasting to chat-Claude: current
position, recent completions with commits, open decisions, Lab states, flags.
Everything is READ from the truth files (STATUS.md, DECISIONS-NEEDED.md,
LAB-REGISTRY.md, lab-results.json) and git — the brief can never drift from the
files because it IS the files, compressed.

Run: python brief.py           (prints to stdout; pipe anywhere)
     python brief.py --n 15    (more completions)
"""
from __future__ import annotations
import argparse
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _read(name):
    p = HERE / name
    return p.read_text() if p.exists() else ""


def _git(*args):
    try:
        return subprocess.check_output(["git", *args], cwd=HERE, text=True).strip()
    except Exception:
        return ""


def queue_position(status):
    """The Continuous-queue line: done count, current item, what's next."""
    line = next((l for l in status.split("\n") if "Continuous queue" in l), "")
    body = line.split(":", 1)[1] if ":" in line else ""
    items = [s.strip() for s in re.split(r"→", body) if s.strip()]
    done = [i for i in items if "✅" in i]
    current = next((i for i in items if "[NEXT]" in i), None)
    after = items[items.index(current) + 1:] if current in items else []
    clean = lambda t: re.sub(r"\*\*|\[NEXT\]|✅|\(.*?\)", "", t).strip(" *→")
    return {
        "done": len(done), "total": len(items),
        "current": clean(current) if current else "(no [NEXT] marker)",
        "after": [clean(a) for a in after[:3]],
    }


def recent_completions(n):
    out = _git("log", f"-{n}", "--pretty=%h|%s")
    rows = []
    for line in out.split("\n"):
        if "|" not in line:
            continue
        h, s = line.split("|", 1)
        if s.startswith("Lab report"):        # bot noise, not a completion
            continue
        rows.append((h, s))
    return rows


def open_decisions(dec):
    """First occurrence of each D-number is its CURRENT status (the files keep
    older provenance copies below) — so dedup across resolved AND open, then
    report only the ids whose first occurrence is open."""
    seen, out = set(), []
    for l in dec.split("\n"):
        m = re.match(r"^##\s+([A-Z]+-?\d+)\s*[—-]\s*(.+)$", l)
        if not m:
            continue
        did, title = m.group(1), m.group(2)
        if did in seen:
            continue                     # a provenance copy, not the status
        seen.add(did)
        if not re.search(r"resolved|✅|done|implemented|built", title, re.I):
            out.append(f"{did}: {re.sub(r'—.*$', '', title).strip()}")
    return out


def lab_state():
    res = {}
    p = HERE / "draft" / "backtest" / "lab-results.json"
    if p.exists():
        try:
            res = json.loads(p.read_text())
        except Exception:
            pass
    lines = []
    for r in res.get("results", []):
        lines.append(f"{r['id']} [{r['kind']}]: {r.get('summary', '')[:140]}")
    pend = res.get("pending_gated_experiments", [])
    if pend:
        lines.append("gated pending the replay path: "
                     + ", ".join("#" + p["registry"] for p in pend))
    return lines


def flags(status):
    """Anything the status marks urgent/red — plus standing constraints."""
    out = []
    for l in status.split("\n"):
        if "🚨" not in l or "URGENT" not in l.upper():
            continue
        # Only list ITEMS (numbered/bulleted lines) — the alerts-protocol prose
        # describes how urgent items surface and is not itself an alert.
        if not re.match(r"^\s*(\d+\.|[-*])\s", l):
            continue
        out.append(re.sub(r"\*\*", "", l).strip()[:160])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=10, help="completions to list")
    args = ap.parse_args()

    status = _read("STATUS.md")
    dec = _read("DECISIONS-NEEDED.md")
    q = queue_position(status)
    head = _git("rev-parse", "--short", "HEAD")
    branch = _git("rev-parse", "--abbrev-ref", "HEAD")

    L = ["```markdown", "# SANDBOX → CHAT-CLAUDE BRIEF",
         f"_HEAD `{head}` on `{branch}` · queue {q['done']}/{q['total']} done_", ""]
    L.append(f"**POSITION:** current = **{q['current']}**"
             + (f" · then: {' → '.join(q['after'])}" if q['after'] else ""))
    L.append("")
    L.append("**RECENT COMPLETIONS (newest first):**")
    for h, s in recent_completions(args.n):
        L.append(f"- `{h}` {s}")
    L.append("")
    od = open_decisions(dec)
    L.append(f"**OPEN DECISIONS ({len(od)}):**" if od else "**OPEN DECISIONS: none**")
    for d in od:
        L.append(f"- {d}")
    L.append("")
    ls = lab_state()
    if ls:
        L.append("**LAB:**")
        for x in ls:
            L.append(f"- {x}")
        L.append("")
    fl = flags(status)
    if fl:
        L.append("**FLAGS:**")
        for f in fl:
            L.append(f"- {f}")
        L.append("")
    L.append("_Generated by `python brief.py` — reads STATUS/DECISIONS/LAB + git; never hand-assembled._")
    L.append("```")
    print("\n".join(L))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
