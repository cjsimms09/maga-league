"""KNOWN-NEGATIVE control: reads the store and ignores what is in it."""
import json, pathlib
json.load(open(pathlib.Path(__file__).resolve().parents[2] / "draft/data/league_history.json"))
print("constant output")
