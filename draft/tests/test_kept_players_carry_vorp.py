# TERRITORY: A
"""E's sweep-16 finding, pinned at the source.

kept_players never pass through apply_vorp, shipped with vorp absent, and
engine.js's `(player.vorp || 0)` turned absent into a confident zero — the
keeper-target badge then named the wrong man on screen at Cory's first pick
("Zay Flowers beats Ja'Marr Chase by 17" against a 295-point Chase). The bar
was set by zeroed keepers, went negative, and INFLATED every candidate.

Two pins:
  1. repo_parity — every kept player on the PUBLISHED board carries a vorp
     equal to the board's own identity (proj_mean − replacement[pos]);
  2. the identity E verified (682/682 available rows) still holds, so the
     kept-player number is the same construction, not a second formula.

No suite had ever exercised the keeper path with real keepers — that is how a
weight-1.0 term could lie on screen and stay green.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"


def _board():
    return json.loads(BOARD.read_text())


@pytest.mark.repo_parity
def test_every_kept_player_on_the_published_board_carries_vorp():
    b = _board()
    repl = b["replacement"]["replacement_points"]
    kept = b.get("kept_players") or []
    assert kept, "no keepers on the board — the keeper path is unexercised again"
    missing = [k.get("name") for k in kept if k.get("vorp") is None]
    assert not missing, (
        f"kept players without vorp: {missing} — engine.js reads "
        "(player.vorp || 0), so absent becomes a confident zero, the keeper "
        "bar flips negative, and the badge names the wrong man (sweep 16). "
        "If the board predates the build.py fix, rebuild it.")
    for k in kept:
        rp = repl.get(k.get("position"))
        assert rp is not None
        assert abs(k["vorp"] - (k["proj_mean"] - rp)) < 0.05, (
            f"{k.get('name')}: keeper vorp {k['vorp']} disagrees with the "
            f"board's own identity {k['proj_mean']} - {rp} — two formulas "
            "for one field name")


@pytest.mark.repo_parity
def test_the_identity_the_fix_relies_on_still_holds_boardwide():
    b = _board()
    repl = b["replacement"]["replacement_points"]
    bad = 0
    checked = 0
    for p in b["players"]:
        rp = repl.get(p.get("position"))
        if rp is None or p.get("vorp") is None or p.get("proj_mean") is None:
            continue
        checked += 1
        if abs(p["vorp"] - (p["proj_mean"] - rp)) > 0.05:
            bad += 1
    assert checked > 500 and bad == 0, (
        f"vorp == proj_mean - replacement broke on {bad} of {checked} rows — "
        "the keeper derivation now invents numbers; re-derive both from "
        "whatever the new construction is")
