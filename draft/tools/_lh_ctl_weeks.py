"""KNOWN-POSITIVE for LH_MODE=weeks. The season-list controls cannot certify
that mode -- weeks mode keeps every season, so they come back insensitive and
(correctly) void the run. This one counts OWNER-WEEK ENTRIES, which is exactly
what weeks mode changes."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
d = json.load(open(ROOT / "draft/data/league_history.json"))
n = sum(len(e or []) for v in d["seasons"] for e in (v.get("weeks") or {}).values())
print("owner-week entries:", n)
