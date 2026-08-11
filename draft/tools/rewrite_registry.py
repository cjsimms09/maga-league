#!/usr/bin/env python3
"""Rewrite the registry's `imported` dispositions FROM THE MEASUREMENT.

Not a general-purpose tool — a one-shot correction, kept because the correction
should be reproducible rather than a diff someone has to take on trust. It only
ever moves keys between `imported`, `imported_unread`, and `unused_pending`; the
ignored/should_import judgment is about whether a setting MATTERS, which is not
something a probe can answer, so those `why` strings are written by hand.

Run: python3 draft/tools/rewrite_registry.py [--apply]
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft", "tools"))

import settings_access as ACCESS      # noqa: E402
import settings_influence as INFL     # noqa: E402

REG_PATH = os.path.join(ROOT, "draft", "config", "sleeper_settings_registry.json")


def classify() -> dict:
    infl = INFL.measure()
    reaches = infl["reaches_config"]
    keys = sorted(json.load(open(os.path.join(ROOT, "draft", "data",
                  "sleeper_league_settings.json"), encoding="utf-8"))["settings"])
    acc = ACCESS.scan(keys)
    fields = sorted({f for fs in reaches.values() for f in fs})
    field_reads = ACCESS.scan(fields, require_settings=False)

    out = {}
    for k in keys:
        reads = acc[k]["reads"]
        landed = reaches.get(k, [])
        via = [f for f in landed if field_reads.get(f, {}).get("reads")]
        if reads or via:
            out[k] = ("imported", reads, landed)
        elif landed:
            out[k] = ("imported_unread", [], landed)
        else:
            out[k] = ("unused_pending", [], [])
    return out


if __name__ == "__main__":
    res = classify()
    reg = json.load(open(REG_PATH, encoding="utf-8"))
    moved = []
    for k, (disp, reads, landed) in sorted(res.items()):
        was = reg["settings"][k]["disposition"]
        if disp == "unused_pending":
            # The probe proves only that nothing reads it. Whether that is fine
            # (`ignored`) or a gap (`should_import`) is a judgment; leave it.
            if was in ("imported", "imported_unread"):
                moved.append((k, was, "UNUSED — needs a hand-written ignored/should_import reason"))
            continue
        if was != disp:
            moved.append((k, was, disp))
        if "--apply" in sys.argv:
            reg["settings"][k]["disposition"] = disp
            reg["settings"][k]["evidence"] = (
                ("read at " + ", ".join(reads[:3])) if reads
                else ("reaches league_config." + ", ".join(landed) + " and nothing reads it"))
    for k, a, b in moved:
        print("  %-24s %s -> %s" % (k, a, b))
    if "--apply" in sys.argv:
        json.dump(reg, open(REG_PATH, "w", encoding="utf-8"), indent=2, sort_keys=True)
        print("\nwrote " + REG_PATH)
    else:
        print("\n(dry run — pass --apply)")
