# TERRITORY: relay
"""free_source_discovery.py — the monthly census (FUTURE-PROOF-2027 §6.3).
Offline it can prove three things: every registry class has at least one
free candidate listed (or is named as uncovered), the verdict logic does
not mistake a 200 login page for a door, and a failed control REFUSES the
report. The network half runs in CI only (the sandbox gateway 403s it)."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("fsd", ROOT / "draft" / "tools" / "free_source_discovery.py")
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)
REG = json.loads((ROOT / "draft" / "data" / "source_registry.json").read_text())


def test_every_registry_class_has_a_candidate_and_every_candidate_names_a_registry_class():
    classes = {c["class"] for c in REG["classes"]}
    listed = {c["class"] for c in D.CANDIDATES}
    assert classes - listed == set(), f"classes with no candidate: {sorted(classes - listed)}"
    assert listed - classes == set(), f"candidates naming a class the registry lacks: {sorted(listed - classes)}"
    names = [c["name"] for c in D.CANDIDATES]
    assert len(names) == len(set(names))


def test_keyed_doors_are_listed_and_never_fetched():
    calls = []

    def fake(url, timeout=25):
        calls.append(url)
        return 200, '{"week": 1}', None
    doc = D.run(fetch=fake)
    keyed = [c for c in D.CANDIDATES if c.get("key")]
    assert keyed, "the paid Odds API must stay listed so nobody re-discovers it as free"
    for c in keyed:
        assert c["url"] not in calls
        assert next(r for r in doc["candidates"] if r["name"] == c["name"])["verdict"] == "needs_key_not_fetched"


def test_a_200_without_the_shape_is_not_a_door_and_403_is_blocked():
    assert D.verdict(200, '<html>Sign in</html>', r'"markets"') == "reachable_no_shape"
    assert D.verdict(200, '{"markets": [1]}', r'"markets"\s*:\s*\[') == "answers"
    assert D.verdict(403, "", r'"x"') == "blocked"
    assert D.verdict(None, "", r'"x"') == "error"
    assert D.verdict(200, '{"x": 1}', "") == "reachable_no_shape"      # an empty shape can never claim a door


def test_a_failed_control_refuses_the_report():
    def dark(url, timeout=25):
        return None, "", "URLError: gateway"
    doc = D.run(fetch=dark)
    assert doc["control"]["ok"] is False
    assert all(r["verdict"] in ("error", "needs_key_not_fetched") for r in doc["candidates"])


def test_the_known_positive_control_is_the_sleeper_state_door():
    assert "api.sleeper.app/v1/state/nfl" in D.CONTROL["url"]
    assert D.verdict(200, '{"week": 3, "season": "2026"}', D.CONTROL["shape"]) == "answers"
