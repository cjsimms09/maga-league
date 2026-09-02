"""The source registry (FUTURE-PROOF-2027 §6): every data class names a primary,
a fallback (or says NONE loudly), and every workflow it cites exists. A class
with no fallback is a known gap, not a silent one — the test pins the list so
a new gap cannot appear without being written down."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REG = json.loads((ROOT / "draft" / "data" / "source_registry.json").read_text())
WORKFLOWS = {p.name for p in (ROOT / ".github" / "workflows").glob("*.yml")}


def _workflows_named(s: str):
    return [w for w in WORKFLOWS if w in (s or "")]


def test_every_class_has_primary_fallback_cost_and_feeds():
    for c in REG["classes"]:
        for k in ("class", "feeds", "primary", "fallback", "cost"):
            assert k in c, (c.get("class"), k)
        assert c["cost"].startswith("free"), c["class"]        # Cory's standing ruling
        for k in ("source", "workflow", "cadence", "control"):
            assert k in c["primary"], (c["class"], k)


def test_every_cited_workflow_exists_or_is_declared_manual_or_none():
    for c in REG["classes"]:
        for side in ("primary", "fallback"):
            wf = c[side]["workflow"]
            if any(w in wf for w in ("none", "manual", "TODO", "Netlify")):
                continue
            assert _workflows_named(wf), (c["class"], side, wf)


def test_the_no_fallback_classes_are_exactly_the_known_gaps():
    """KNOWN-POSITIVE + the pin. snaps_usage has no free second source; weather,
    depth charts and team context are not captured yet. Anything else showing
    NONE is a new gap somebody has to register."""
    none = sorted(c["class"] for c in REG["classes"] if c["fallback"]["source"].upper().startswith("NONE"))
    assert none == ["depth_charts_team_context", "expert_ranks", "player_bio_capital", "snaps_usage", "weather"], none


def test_props_class_names_both_free_doors_and_the_census():
    props = next(c for c in REG["classes"] if c["class"] == "player_props")
    assert "Sleeper Picks" in props["primary"]["source"] and "Underdog" in props["fallback"]["source"]
    assert "free-props-census.yml" in props["discovery"]
