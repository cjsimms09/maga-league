"""Draft-length regression (2026-08-08).

Pins the fix for the rounds-vs-picks conflation: the draft is 15 rounds (one per
roster spot), and keepers forfeit SPECIFIC rounds (1-3) rather than shortening
the draft, so my live picks are 12 (rounds 4-15). The old bug derived rounds as
roster_size - keeper_count = 12 for everyone.

The property that must hold forever: under top_picks_flat, draft length NEVER
depends on keeper count. Run: python -m pytest draft/tests/test_rounds.py -q
"""
from __future__ import annotations
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import config_schema  # noqa: E402
import keepers as K  # noqa: E402


def _our_cfg():
    return config_schema.load(str(HERE.parent / "config" / "league_config.json"))


def test_our_league_is_15_rounds_12_live_picks():
    cfg = _our_cfg()
    assert cfg["roster_size"] == 15
    assert config_schema.draft_rounds(cfg) == 15
    assert cfg["rounds"] == 15                       # normalize routed through draft_rounds

    # Build the true pick order with my 3 keepers and confirm 12 live picks in
    # rounds 4-15 (the k-th keeper forfeits round k under top_picks_flat).
    my_slot = cfg["my_draft_slot"]
    keeper_map = {my_slot: [
        {"player_id": "7564", "position": "WR", "name": "Ja'Marr Chase"},
        {"player_id": "3198", "position": "RB", "name": "Derrick Henry"},
        {"player_id": "8151", "position": "RB", "name": "Kenneth Walker"},
    ]}
    order = K.build_true_pick_order(cfg, keeper_map)
    assert len(order.my_picks) == 12

    # READ THE ROUND OFF THE PICK, DO NOT RE-DERIVE IT FROM THE OVERALL NUMBER.
    #
    # This was `(p - 1) // teams + 1`, which assumes an UNCOMPRESSED board. Keeper
    # forfeits remove picks, so the board is 147 long, and dividing an overall
    # number by 10 stops naming the round. It agreed at slot 4 by coincidence and
    # broke the moment the seat moved to 8 — a second derivation of a value the
    # pick order already carries, which is the two-places defect in miniature.
    my_rounds = sorted({p["round"] for p in order.picks
                        if p["team_slot"] == my_slot})
    assert my_rounds == list(range(4, 16)), my_rounds   # rounds 4..15 inclusive

    # And the two agree on the count, which is the property the old line was
    # reaching for: twelve live picks, one per round from 4 to 15.
    assert len(my_rounds) == 12


def test_draft_length_never_depends_on_keeper_count():
    """The general property the bug violated: rounds is a function of roster
    size alone, not of how many players are kept."""
    base = _our_cfg()
    base.pop("rounds", None)                          # force re-derivation
    for count in (0, 1, 2, 3, 5):
        cfg = dict(base)
        cfg["keepers"] = dict(base["keepers"], count=count)
        cfg.pop("rounds", None)
        assert config_schema.draft_rounds(cfg) == cfg["roster_size"] == 15, \
            f"draft length moved with keeper count={count} — the conflation is back"


def test_explicit_rounds_is_honored():
    cfg = _our_cfg()
    cfg["rounds"] = 17
    assert config_schema.draft_rounds(cfg) == 17      # explicit config wins
