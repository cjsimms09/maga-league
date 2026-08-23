"""Tests for draft/tools/recover_shadow_recommendations.py — register 260.

Cory: "Why only 21? That's not enough!! Need to fix."

The load-bearing test is `reproduces_the_original` — a recovery tool that
cannot reproduce the KNOWN-WRONG answer when configured the wrong way is not
modelling the original path, and its "fix" would be measuring something else.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_s = importlib.util.spec_from_file_location(
    "rec", ROOT / "draft" / "tools" / "recover_shadow_recommendations.py")
R = importlib.util.module_from_spec(_s); _s.loader.exec_module(R)

FREEZE = json.loads(R.FREEZE.read_text())
ROWS = [json.loads(l) for l in R.LOG.read_text().splitlines() if l.strip()]


# ── the ranking rule ──────────────────────────────────────────────────────

def test_KNOWN_POSITIVE_demotion_pushes_a_high_vorp_onesie_below_a_low_vorp_skill():
    pool = [{"player_id": "1", "name": "Rams", "position": "DEF", "vorp": 29.0},
            {"player_id": "2", "name": "A Back", "position": "RB", "vorp": 3.0}]
    assert R.rank_pool(pool, True)[0]["name"] == "A Back"


def test_KNOWN_NEGATIVE_with_demotion_OFF_the_onesie_wins_which_is_the_old_bug():
    pool = [{"player_id": "1", "name": "Rams", "position": "DEF", "vorp": 29.0},
            {"player_id": "2", "name": "A Back", "position": "RB", "vorp": 3.0}]
    assert R.rank_pool(pool, False)[0]["name"] == "Rams"


def test_demotion_does_NOT_reorder_within_the_onesies_or_within_the_skills():
    pool = [{"player_id": "1", "name": "D1", "position": "DEF", "vorp": 9.0},
            {"player_id": "2", "name": "D2", "position": "DEF", "vorp": 29.0},
            {"player_id": "3", "name": "S1", "position": "WR", "vorp": 1.0},
            {"player_id": "4", "name": "S2", "position": "WR", "vorp": 5.0}]
    got = [p["name"] for p in R.rank_pool(pool, True)]
    assert got == ["S2", "S1", "D2", "D1"], got


# ── the replay ────────────────────────────────────────────────────────────

def test_REPRODUCES_THE_ORIGINAL_when_the_demotion_is_off():
    """The control that licenses the fix. With demotion OFF the replay must
    land on the logger's own outcome -- a K/DEF leading ~101 selections and
    only ~21 decidable disagreements."""
    c = R.replay(FREEZE, ROWS, demote_onesies=False)["counts"]
    assert c["onesie_led"] == 101, c
    assert c["disagreement"] == 21, c


def test_the_fix_removes_every_onesie_led_pick_and_lifts_n_to_118():
    c = R.replay(FREEZE, ROWS, demote_onesies=True)["counts"]
    assert c["onesie_led"] == 0, c
    assert c["disagreement"] == 118, c


def test_the_partition_adds_up_to_the_real_selections():
    sel = sum(1 for r in ROWS if r.get("is_selection"))
    c = R.replay(FREEZE, ROWS, demote_onesies=True)["counts"]
    assert sum(c.values()) == sel, (c, sel)


def test_a_player_once_taken_is_never_recommended_again():
    """The gone-set must actually accumulate; without it the same name would
    top the board all night, which is how the original looked."""
    rec = R.replay(FREEZE, ROWS, demote_onesies=True)["records"]
    seen = set()
    for r in rec:
        assert r["recovered_top_id"] not in seen, r["pick"]
        seen.add(r["room_took_id"])


def test_the_recovery_is_OUTCOME_BLIND():
    """It may read the freeze and the gone-set and nothing else. A season
    result reaching this would make every recovered decision unusable."""
    src = (ROOT / "draft" / "tools" / "recover_shadow_recommendations.py").read_text()
    for banned in ("actual", "realized", "season_total", "points_scored", "weekly"):
        assert banned not in src.replace("_reconstruction_not_capture", ""), banned


# ── the controls themselves ───────────────────────────────────────────────

def test_controls_pass_on_the_real_data():
    assert R.controls(FREEZE, ROWS)["ok"] is True


def test_controls_can_FAIL_when_the_demotion_silently_stops_working(monkeypatch):
    monkeypatch.setattr(R, "ONESIE", ())        # demotion becomes a no-op
    res = R.controls(FREEZE, ROWS)
    assert res["ok"] is False
    # NOT over-specifying WHICH control fires: with ONESIE empty nothing is
    # classified as a onesie at all, so the KNOWN-POSITIVE ("demotion off
    # reproduces the flood") goes red first. The first version of this test
    # asserted the known-negative and failed for that reason -- the control
    # suite caught my test, which is the right way round.
    assert [c["control"] for c in res["checks"] if not c["ok"]], res


def test_the_artifact_labels_itself_a_RECONSTRUCTION():
    doc = json.loads((ROOT / "draft" / "data" /
                      "shadow_recommendations_recovered_2026.json").read_text())
    # the word lives in the KEY; the VALUE carries the substance. Assert both,
    # since a future rename of either would quietly drop the disclaimer.
    assert "_reconstruction_not_capture" in doc
    v = doc["_reconstruction_not_capture"]
    assert "Computed after the draft, NOT recorded before it" in v
    assert "NOT evidence about what the tool displayed" in v
