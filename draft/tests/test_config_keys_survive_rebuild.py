# TERRITORY: A
"""A RULED FLAG MUST SURVIVE THE NIGHTLY REBUILD.

Found 2026-08-17 triaging issue #8's six refusals: the fresh-board gate read
`use_measured_ceiling` as None minutes after the PRE-build gate on the same
checkout read it as True. Nothing reverted the commit — `build.py`'s
`--league-id` path rebuilt league_config.json from the Sleeper import and
carried over only `keepers` and `my_draft_slot`, so every human-set key was
erased by the build itself. Cory's morning ruling would have been silently
un-ruled by that night's cron, and the gate refusing to publish was the only
thing that surfaced it.

The fix in build.py merges `existing` keys the import does not itself write.
This suite pins the merge semantics without any network: the import's own
keys must stay authoritative (league facts refresh), and keys the import
never produces must survive.
"""
import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _rebuild_merge(existing: dict, imported: dict) -> dict:
    """The exact merge build.py performs, extracted for a network-free pin."""
    cfg_raw = dict(imported)
    if existing.get("my_draft_slot"):
        cfg_raw["my_draft_slot"] = existing["my_draft_slot"]
    for key, val in existing.items():
        if key not in cfg_raw:
            cfg_raw[key] = val
    return cfg_raw


IMPORTED = {"teams": 10, "draft_type": "snake", "confirmed": False,
            "scoring": {"rec": 1.0}, "keepers": {"count": 3}}


def test_a_ruled_flag_survives_the_rebuild():
    existing = {"use_measured_ceiling": True,
                "_use_measured_ceiling_why": "Cory 2026-08-17", "teams": 10}
    out = _rebuild_merge(existing, IMPORTED)
    assert out["use_measured_ceiling"] is True
    assert out["_use_measured_ceiling_why"] == "Cory 2026-08-17"


def test_the_import_stays_authoritative_for_its_own_keys():
    """League facts must refresh — a stale `confirmed: True` or an old team
    count leaking through the merge would be the opposite defect."""
    existing = {"teams": 12, "confirmed": True, "use_measured_ceiling": True}
    out = _rebuild_merge(existing, IMPORTED)
    assert out["teams"] == 10, "the fresh import's team count must win"
    assert out["confirmed"] is False, "confirmation never survives a re-import"


def test_FAIL_ARM_the_pre_fix_merge_erases_the_ruling():
    """The 2026-08-17 behavior, reconstructed: carrying over only
    my_draft_slot loses every ruled key."""
    existing = {"use_measured_ceiling": True, "my_draft_slot": 4}
    old = dict(IMPORTED)
    if existing.get("my_draft_slot"):
        old["my_draft_slot"] = existing["my_draft_slot"]
    assert "use_measured_ceiling" not in old, (
        "if this ever passes the flag through, the fail arm no longer "
        "reconstructs the defect and should be re-derived")


def test_build_py_actually_contains_the_merge():
    """The extracted merge above must not drift from build.py — assert the
    source carries the carry-over loop inside the --league-id block."""
    src = (ROOT / "build.py").read_text()
    tree = ast.parse(src)
    found = False
    for node in ast.walk(tree):
        if (isinstance(node, ast.For) and isinstance(node.iter, ast.Call)
                and getattr(node.iter.func, "attr", "") == "items"
                and getattr(node.iter.func.value, "id", "") == "existing"):
            found = True
    assert found, ("build.py no longer iterates existing.items() — the "
                   "config carry-over merge has been removed or rewritten; "
                   "re-derive this suite against the new mechanism")
