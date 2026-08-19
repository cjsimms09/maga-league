# TERRITORY: C
"""Stamps `_captured_at` into `multisource_projections.json` after a fresh
capture. ROUTES.md 2026-08-19 dispatch item C1: the store had no capture
timestamp at all, so nothing could tell a fresh build from a four-day-stale
one. Workflow-side rather than a change to `multisource_projections.py`
(TERRITORY: A) -- this only touches the file AFTER that module has already
written it, and adds one field, nothing else.

Run: python3 draft/tools/stamp_multisource_captured_at.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "data" / "multisource_projections.json"


def stamp(doc: dict, now: str) -> dict:
    """PURE — doc in, doc out with `_captured_at` set. Fixture-testable
    without touching the filesystem or the clock."""
    doc["_captured_at"] = now
    return doc


def main() -> None:  # pragma: no cover  (reads/writes the real committed file)
    doc = json.loads(PATH.read_text())
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    PATH.write_text(json.dumps(stamp(doc, now), indent=1))
    print(f"stamped _captured_at={now} into {PATH.name}")


if __name__ == "__main__":
    main()
