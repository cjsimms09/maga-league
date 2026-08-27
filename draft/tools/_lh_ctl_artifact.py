"""KNOWN-POSITIVE for the ARTIFACT path: constant stdout, but what it WRITES
depends on the store. Under the first version of the sweep (which compared
file NAMES, not contents) this came back insensitive, which is the false
negative that fix removes -- and then it came back insensitive twice more
because the sweep's own exclusion filter matched the control's output name.

It counts OWNER-WEEK ENTRIES rather than listing seasons, so it is sensitive
in BOTH counterfactual modes: `whole` removes the season and its weeks with
it, `weeks` removes the weeks and keeps the season. A control that is blind to
the mode it is certifying is not a control."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
d = json.load(open(ROOT / "draft/data/league_history.json"))
n = sum(len(e or []) for v in d["seasons"] for e in (v.get("weeks") or {}).values())
(ROOT / "draft/backtest/zz_contamination_probe_out.json").write_text(
    json.dumps({"owner_week_entries": n}))
print("constant stdout")
