"""KNOWN-POSITIVE control: its output depends on the unplayed season by
construction. If the harness calls this insensitive, the harness is broken."""
import json, pathlib
d = json.load(open(pathlib.Path(__file__).resolve().parents[2] / "draft/data/league_history.json"))
print("seasons:", len(d["seasons"]), sorted(v.get("season") for v in d["seasons"]))
