"""Merge-completeness guard — pure core.
Run: python -m pytest draft/tests/test_merge_completeness.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import merge_completeness as MC  # noqa: E402


def test_dropped_modification_is_caught():
    # THE ACTUAL BUG: source added a new file AND edited an existing one; base never
    # touched the existing one; the merge kept the new file but the OLD existing one.
    merge_base = {"admin.js": "a0", "keep.js": "k0"}
    source     = {"admin.js": "a1", "keep.js": "k0", "voteenact.js": "v1"}   # edited admin, added voteenact
    base       = {"admin.js": "a0", "keep.js": "k0"}                          # base untouched
    merged     = {"admin.js": "a0", "keep.js": "k0", "voteenact.js": "v1"}    # NEW file in, edit dropped
    v = MC.assess(merge_base, base, source, merged)
    kinds = {x["path"]: x["kind"] for x in v}
    sev = {x["path"]: x["severity"] for x in v}
    assert kinds.get("admin.js") == "modification_dropped"
    assert sev.get("admin.js") == "fail"        # a definite drop must block
    assert "voteenact.js" not in kinds          # the new file DID land — not a violation


def test_new_file_missing_is_caught():
    merge_base = {"a": "0"}
    source = {"a": "0", "new.js": "n1"}
    base = {"a": "0"}
    merged = {"a": "0"}                          # new file never landed
    v = MC.assess(merge_base, base, source, merged)
    assert v and v[0]["kind"] == "new_file_missing" and v[0]["path"] == "new.js"


def test_clean_complete_merge_passes():
    merge_base = {"admin.js": "a0"}
    source = {"admin.js": "a1", "voteenact.js": "v1"}
    base = {"admin.js": "a0"}
    merged = {"admin.js": "a1", "voteenact.js": "v1"}    # edit + new file both present
    assert MC.assess(merge_base, base, source, merged) == []


def test_union_merge_flags_only_when_merged_equals_base():
    # both sides changed the file. If merged differs from base, we trust the union.
    mb = {"ci.yml": "c0"}
    source = {"ci.yml": "c_b"}
    base = {"ci.yml": "c_main"}
    ok = {"ci.yml": "c_union"}          # a real union result != base
    assert MC.assess(mb, base, source, ok) == []
    dropped = {"ci.yml": "c_main"}      # merged == base -> source's change likely dropped
    v = MC.assess(mb, base, source, dropped)
    assert v and v[0]["kind"] == "possible_union_drop" and v[0]["severity"] == "warn"
