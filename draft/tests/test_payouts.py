"""Payout table integrity (money function ground truth, 2026-08-08).

The whole objective (E[$]) derives from payouts.json, so a fat-fingered edit must
fail loud here, not silently corrupt every dollar-denominated recommendation.
Run: python -m pytest draft/tests/test_payouts.py -q
"""
from __future__ import annotations
import json
from pathlib import Path

PAYOUTS = Path(__file__).resolve().parent.parent / "config" / "payouts.json"


def test_payouts_checksum():
    p = json.loads(PAYOUTS.read_text())
    parts = (p["weekly_high"]["total"] + p["regular_season"]["total"] + p["playoffs"]["total"])
    assert parts == p["total_pot"] == 4000, f"parts {parts} != total_pot {p['total_pot']}"


def test_weekly_high_is_the_subsidized_share():
    p = json.loads(PAYOUTS.read_text())
    # The rationale hinges on weekly-high being ~37.5% of the pot.
    share = p["weekly_high"]["total"] / p["total_pot"]
    assert abs(share - 0.375) < 1e-9, f"weekly-high share {share} != 0.375"
    assert p["weekly_high"]["amount"] * p["weekly_high"]["weeks"] == p["weekly_high"]["total"]


def test_playoff_gradient_is_flat_and_ordered():
    p = json.loads(PAYOUTS.read_text())
    po = p["playoffs"]
    finishes = [po["1"], po["2"], po["3"], po["4"]]
    assert finishes == sorted(finishes, reverse=True), "playoff payouts must decrease by finish"
    assert po["1"] - po["4"] == po["gradient_1_to_4"] == 275
    assert sum(finishes) == po["total"] == 2125


def test_regular_season_money_present():
    p = json.loads(PAYOUTS.read_text())
    rs = p["regular_season"]
    assert rs["champ"] > rs["runner_up"] > 0
    assert rs["champ"] + rs["runner_up"] == rs["total"] == 375
