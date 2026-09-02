#!/usr/bin/env python3
# TERRITORY: A
"""BLIND-FOLD GUARD (register 472).

A sealed prereg holds a (arm, season) fold blind until its grade. Nothing in
the repo used to answer "is this fold blind?" — the ledger is a table of
claims, not an index of folds — and on 2026-09-02 two different sessions
spent two of P347's folds in one day, both by running a harness that takes a
season argument. This is the index, and the refusal.

    from blind_folds import refuse_if_blind
    refuse_if_blind("props_weekly", SEASON, sys.argv)

exits 2 with the ledger row named unless `--spend-blind-fold` is on argv —
an explicit, greppable act, never a default. The registry is
draft/data/blind_folds.json; a row whose ledger row is no longer OPEN is
stale and test_blind_folds.py fails on it, so the registry cannot outlive
the prereg it protects.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "draft" / "data" / "blind_folds.json"
LEDGER = ROOT / "PREDICTION-LEDGER.md"
OVERRIDE = "--spend-blind-fold"


def load(path: Path = REGISTRY) -> list[dict]:
    return list(json.loads(path.read_text()).get("folds") or [])


def blind_rows(arm: str, season: int, folds: list[dict] | None = None) -> list[dict]:
    """Registry rows that hold (arm, season) blind. Pure."""
    folds = load() if folds is None else folds
    return [f for f in folds if f.get("arm") == arm and int(season) in [int(s) for s in f.get("seasons", [])]]


def refuse_if_blind(arm: str, season: int, argv: list[str] | None = None,
                    folds: list[dict] | None = None, out=None) -> bool:
    """True if the run may proceed. Prints the refusal and exits 2 otherwise
    (or returns False when `out` is given, for tests)."""
    argv = sys.argv if argv is None else argv
    rows = blind_rows(arm, season, folds)
    if not rows or OVERRIDE in argv:
        return True
    msg = (f"⛔ BLIND FOLD: ({arm}, {season}) is held blind by "
           + ", ".join(f"{r['ledger_row']} (owner {r.get('owner')}, grade-by {r.get('grade_by')})" for r in rows)
           + f". Reading it spends another lane's primary fold (register 472). "
             f"Pass {OVERRIDE} only with that owner's word, and say so in the artifact.")
    if out is not None:
        print(msg, file=out)
        return False
    print(msg, file=sys.stderr)
    raise SystemExit(2)


def ledger_status(row_id: str, text: str | None = None) -> str | None:
    """The status cell of one ledger row, or None if the row is absent."""
    text = LEDGER.read_text() if text is None else text
    for line in text.splitlines():
        if line.startswith(f"| {row_id} |"):
            cells = [c.strip() for c in line.split("|")[1:-1]]
            return cells[5] if len(cells) > 5 else ""
    return None


def stale(folds: list[dict] | None = None, text: str | None = None) -> list[dict]:
    """Registry rows whose ledger row is missing or no longer OPEN."""
    folds = load() if folds is None else folds
    out = []
    for f in folds:
        st = ledger_status(f["ledger_row"], text)
        if st is None or not re.search(r"\bOPEN\b", st):
            out.append({**f, "ledger_status": st})
    return out


if __name__ == "__main__":
    s = stale()
    for f in load():
        print(f"{f['arm']:<16} seasons {f['seasons']}  {f['ledger_row']} (owner {f.get('owner')}, grade-by {f.get('grade_by')})")
    if s:
        print(f"STALE: {[f['ledger_row'] for f in s]} — ledger row graded or gone; delete the registry row")
        raise SystemExit(1)
    print("registry consistent with the ledger")
