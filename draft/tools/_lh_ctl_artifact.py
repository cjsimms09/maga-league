"""KNOWN-POSITIVE for the ARTIFACT path: constant stdout, but what it writes
depends on the unplayed season. Under the first snapshot (file NAMES only)
this came back insensitive, which is the false negative that fix removes."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
d = json.load(open(ROOT / "draft/data/league_history.json"))
(ROOT / "draft/backtest/zz_contamination_probe_out.json").write_text(
    json.dumps({"seasons": sorted(v.get("season") for v in d["seasons"])}))
print("constant stdout")
