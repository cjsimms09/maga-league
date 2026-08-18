"""The mailbox blind spot in `prior_art.py`, pinned.

On 2026-08-18 `--grep capital` returned "Nothing matched" while `ROUTES.md` carried
A's measurement in plain sight: *"The capital-only rookie prior measurably failed
(pooled optimal +1.6, realistic 6.9 points worse)."*

The tool scanned only committed JSON, so a result that was measured and written down
— but recorded in prose — was invisible to the one tool whose entire job is finding
prior work. That is the failure it exists to prevent, one level up.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import prior_art as PA  # noqa: E402


def _write(tmp_path, name, text):
    (tmp_path / name).write_text(text)


def test_a_measured_line_in_a_mailbox_is_found(tmp_path):
    _write(tmp_path, "ROUTES.md",
           "- [ ] 2026-08-17 · A → D · The capital-only rookie prior measurably failed "
           "(pooled optimal +1.6, realistic 6.9 points worse).\n")
    hits = PA.prose_hits(tmp_path, "capital")
    assert len(hits) == 1
    assert hits[0][0] == "ROUTES.md" and "measurably failed" in hits[0][2]


def test_the_real_failure_is_reproduced_and_then_caught(tmp_path):
    """KNOWN-POSITIVE: the exact 08-18 line, and the JSON-only scan that missed it."""
    line = ("- [ ] 2026-08-17 · A → D · THE HUMAN ROOKIE EDGE IS AUGUST INFORMATION, "
            "NOT DRAFT CAPITAL. The capital-only rookie prior measurably failed.\n")
    _write(tmp_path, "ROUTES.md", line)
    assert PA.scan(tmp_path, dirs=()) == [], "JSON scan should find nothing here"
    assert PA.prose_hits(tmp_path, "capital"), "prose scan must find what JSON cannot"


def test_a_plan_is_not_a_measurement(tmp_path):
    """Without this every mention of a topic matches and the signal drowns."""
    _write(tmp_path, "ROUTES.md",
           "- [ ] 2026-08-17 · relay · We should look at draft capital for rookies one day.\n")
    assert PA.prose_hits(tmp_path, "capital") == []


def test_an_unrelated_measurement_does_not_match(tmp_path):
    _write(tmp_path, "ROUTES.md", "- [ ] pace measurably failed, rho 0.024\n")
    assert PA.prose_hits(tmp_path, "capital") == []


def test_the_cap_bounds_the_output(tmp_path):
    _write(tmp_path, "ROUTES.md", "capital measurably failed\n" * 50)
    assert len(PA.prose_hits(tmp_path, "capital", cap=5)) == 5


def test_an_empty_query_matches_nothing_rather_than_everything(tmp_path):
    _write(tmp_path, "ROUTES.md", "capital measurably failed\n")
    assert PA.prose_hits(tmp_path, "") == []


def test_a_missing_mailbox_is_skipped_not_an_error(tmp_path):
    assert PA.prose_hits(tmp_path, "capital") == []


def test_the_live_repo_still_surfaces_the_line_that_prompted_this():
    """CONTROL against the real files — if this stops matching, the tool went blind."""
    hits = PA.prose_hits(PA.ROOT, "capital")
    assert any("capital-only rookie prior measurably failed" in h[2] for h in hits), \
        f"the 08-18 line is no longer found: {[h[2][:60] for h in hits]}"
