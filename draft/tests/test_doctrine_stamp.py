"""The enrolled doctrine reaches the War Room through ONE path, or not at all.

Data spine: the verdict is decided by experiment 19b, lives in
`cory-conditional.json`, and is stamped into the board artifact by build.py's
`_load_doctrine`. `stamp_doctrine.py` re-stamps an already-built artifact so a
fresh verdict does not wait on an egress rebuild — it calls the same function,
so there is exactly one definition of "enrolled".

What these tests protect:
  1. a real verdict is stamped with its edge, CI and runner-up intact;
  2. a missing / unreadable / un-enrolled verdict yields None, so the banner
     honestly reports the control instead of rendering a plan nobody raced;
  3. the stamp touches ONE key and is idempotent.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))

import build  # noqa: E402
import stamp_doctrine  # noqa: E402

VERDICT = {
    "experiment": "19b Cory-conditional archetype race",
    "rooms": 200,
    "control": "balanced",
    "enrolled": "wr_anchor",
    "leaderboard": [
        {"archetype": "wr_anchor", "mean_edge": 91.5, "ci95": [73.88, 108.88],
         "verdict": "WINNER — enroll as THE PLAN"},
        {"archetype": "early_qb", "mean_edge": 67.62, "ci95": [50.25, 87.12],
         "verdict": "WINNER — enroll as THE PLAN"},
        {"archetype": "zero_rb", "mean_edge": 0.0, "ci95": [0.0, 0.0],
         "verdict": "parked: CI includes $0"},
    ],
}


@pytest.fixture
def verdict_at(tmp_path, monkeypatch):
    """Point build._load_doctrine at a temp verdict file."""
    def _set(payload):
        p = tmp_path / "cory-conditional.json"
        if payload is None:
            p.unlink(missing_ok=True)          # None means the verdict is GONE
        else:
            p.write_text(payload if isinstance(payload, str) else json.dumps(payload))
        monkeypatch.setattr(build, "DOCTRINE_PATH", p)
        return p
    return _set


def test_a_real_verdict_stamps_winner_edge_ci_and_runner_up(verdict_at):
    verdict_at(VERDICT)
    block = build._load_doctrine()
    assert block is not None
    assert block["enrolled"] == "wr_anchor"
    assert block["edge"] == 91.5
    assert block["ci95"] == [73.88, 108.88]
    assert block["runner_up"] == "early_qb"
    assert block["runner_up_edge"] == 67.62
    assert block["rooms"] == 200 and block["control"] == "balanced"
    assert "19b" in block["source"]


def test_the_stamped_edge_matches_the_enrolled_archetype_not_the_top_row(verdict_at):
    """The winner is whoever `enrolled` names — reading row 0 blindly would
    attach the wrong dollar figure the moment the leaderboard is re-sorted."""
    shuffled = dict(VERDICT)
    shuffled["leaderboard"] = list(reversed(VERDICT["leaderboard"]))
    verdict_at(shuffled)
    block = build._load_doctrine()
    assert block["enrolled"] == "wr_anchor" and block["edge"] == 91.5
    assert block["runner_up"] != "wr_anchor"


@pytest.mark.parametrize("payload,label", [
    (None, "missing file"),
    ("{not json", "unreadable file"),
    ({"rooms": 200, "leaderboard": []}, "no enrollment"),
    ({"enrolled": "wr_anchor", "leaderboard": []}, "enrolled name with no leaderboard row"),
])
def test_no_verdict_means_no_doctrine(verdict_at, payload, label):
    verdict_at(payload)
    assert build._load_doctrine() is None, label


def test_stamp_writes_the_block_and_is_idempotent(tmp_path, monkeypatch, verdict_at):
    verdict_at(VERDICT)
    art = tmp_path / "draft_data.json"
    art.write_text(json.dumps({"version": 9, "players": [{"name": "keep me"}], "league": {"teams": 10}}))

    changed, block = stamp_doctrine.stamp(art)
    assert changed is True and block["enrolled"] == "wr_anchor"
    data = json.loads(art.read_text())
    assert data["doctrine"]["edge"] == 91.5
    # Every other byte survives — the stamp is not a rebuild.
    assert data["players"] == [{"name": "keep me"}] and data["version"] == 9

    changed_again, _ = stamp_doctrine.stamp(art)
    assert changed_again is False, "a second stamp should be a no-op"


def test_stamp_clears_the_block_when_the_verdict_disappears(tmp_path, verdict_at):
    """A retracted verdict must un-stamp, or the banner keeps showing a plan the
    Lab no longer stands behind."""
    verdict_at(VERDICT)
    art = tmp_path / "draft_data.json"
    art.write_text(json.dumps({"players": []}))
    stamp_doctrine.stamp(art)
    assert json.loads(art.read_text())["doctrine"] is not None

    verdict_at(None)
    changed, block = stamp_doctrine.stamp(art)
    assert changed is True and block is None
    assert json.loads(art.read_text())["doctrine"] is None


def test_stamp_on_an_unbuilt_artifact_is_not_an_error(tmp_path, verdict_at):
    verdict_at(VERDICT)
    changed, block = stamp_doctrine.stamp(tmp_path / "nope.json")
    assert changed is False and block is None


def test_the_live_verdict_file_stamps_a_doctrine_the_banner_can_name():
    """Against the REAL committed verdict: whatever is enrolled must be a key
    `doctrine.js` knows, or the banner renders a raw machine id at the top of
    the screen on draft night."""
    if not build.DOCTRINE_PATH.exists():
        pytest.skip("no verdict committed yet")
    block = build._load_doctrine()
    if block is None:
        return                                   # nothing enrolled is a valid state
    js = (ROOT / "public" / "js" / "draft" / "doctrine.js").read_text()
    assert f"{block['enrolled']}:" in js, (
        f"the Lab enrolled '{block['enrolled']}' but doctrine.js has no doctrine "
        "with that key — the banner would show a raw id"
    )
