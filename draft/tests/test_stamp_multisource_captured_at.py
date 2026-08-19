# TERRITORY: C
"""stamp() is the only logic in stamp_multisource_captured_at.py worth
testing -- everything else is file I/O and the real clock."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import stamp_multisource_captured_at as S  # noqa: E402


def test_stamp_sets_captured_at():
    out = S.stamp({"players": {}}, "2026-08-20T06:00:00Z")
    assert out["_captured_at"] == "2026-08-20T06:00:00Z"


def test_stamp_does_not_touch_other_fields():
    doc = {"players": {"1": {"mean": 10.0}}, "sources_used": ["CBS"]}
    out = S.stamp(dict(doc), "2026-08-20T06:00:00Z")
    assert out["players"] == doc["players"]
    assert out["sources_used"] == doc["sources_used"]


def test_stamp_overwrites_a_stale_previous_stamp():
    out = S.stamp({"_captured_at": "2026-08-19T00:00:00Z"}, "2026-08-20T06:00:00Z")
    assert out["_captured_at"] == "2026-08-20T06:00:00Z"
