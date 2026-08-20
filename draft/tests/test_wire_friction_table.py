# TERRITORY: C
"""Wire-friction table — pull-list №3 item 1. `position_of`'s DEF-vs-bio
branch is fixture-tested first, then the full pipeline is asserted against
the real committed 2023-2025 history so the numbers in the store are proven,
not just the shape of the code that produced them.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import wire_friction_table as WFT  # noqa: E402

FANNIN_BIO = {
    "12506": {"gsis_id": "00-0040663", "name": "Harold Fannin Jr.",
             "position": "TE", "draft_capital": "3rd"},
}


def test_position_of_resolves_a_real_team_code_to_def():
    assert WFT.position_of("GB", {}) == "DEF"
    assert WFT.position_of("DET", {}) == "DEF"


def test_position_of_resolves_a_real_bio_covered_player():
    assert WFT.position_of("12506", FANNIN_BIO) == "TE"


def test_position_of_returns_none_for_an_unresolvable_token_rather_than_guessing():
    assert WFT.position_of("99999999", FANNIN_BIO) is None


def test_friction_table_counts_made_and_won_correctly():
    transactions = [
        {"season": 2025, "week": 1, "type": "waiver", "status": "complete",
         "adds": {"12506": 3}},
        {"season": 2025, "week": 1, "type": "waiver", "status": "failed",
         "adds": {"12506": 7}},
        {"season": 2025, "week": 1, "type": "waiver", "status": "complete",
         "adds": {"GB": 5}},
    ]
    table = WFT.friction_table(transactions, FANNIN_BIO)
    te = table["by_season_week"][2025][1]["TE"]
    assert te["made"] == 2 and te["won"] == 1
    assert te["contested_rate"] == 0.5
    df = table["by_season_week"][2025][1]["DEF"]
    assert df["made"] == 1 and df["won"] == 1 and df["contested_rate"] == 0.0
    assert table["unresolved_count"] == 0


def test_friction_table_reports_unresolved_ids_rather_than_dropping_them():
    transactions = [
        {"season": 2025, "week": 1, "type": "waiver", "status": "complete",
         "adds": {"999999": 3}},
    ]
    table = WFT.friction_table(transactions, {})
    assert table["unresolved_count"] == 1
    assert "999999" in table["unresolved_ids"]
    assert table["by_season_week"] == {}


def test_friction_table_ignores_non_waiver_transaction_types():
    transactions = [
        {"season": 2025, "week": 1, "type": "free_agent", "status": "complete",
         "adds": {"12506": 3}},
        {"season": 2025, "week": 1, "type": "trade", "status": "complete",
         "adds": {"12506": 3}},
    ]
    table = WFT.friction_table(transactions, FANNIN_BIO)
    assert table["by_season_week"] == {}
    assert table["unresolved_count"] == 0


def test_partition_check_true_when_contested_positions_really_are_more_contested():
    pooled = {
        "RB": {"made": 100, "won": 40}, "WR": {"made": 100, "won": 40},
        "TE": {"made": 100, "won": 40},
        "QB": {"made": 100, "won": 95}, "K": {"made": 100, "won": 99},
        "DEF": {"made": 100, "won": 95},
    }
    check = WFT.partition_check(pooled)
    assert check["partition_holds"] is True
    assert check["contested_positions_measured"]["contested_rate"] == 0.6


def test_partition_check_false_when_the_shape_does_not_hold():
    pooled = {
        "RB": {"made": 100, "won": 95}, "WR": {"made": 100, "won": 95},
        "TE": {"made": 100, "won": 95},
        "QB": {"made": 100, "won": 40}, "K": {"made": 100, "won": 40},
        "DEF": {"made": 100, "won": 40},
    }
    check = WFT.partition_check(pooled)
    assert check["partition_holds"] is False


def test_verify_known_positive_control_passes_on_the_real_fannin_fixture():
    transactions = [
        {"season": 2025, "week": 1, "type": "waiver", "status": "complete",
         "adds": {"12506": 3}},
        {"season": 2025, "week": 1, "type": "waiver", "status": "failed",
         "adds": {"12506": 7}},
    ]
    control = WFT.verify_known_positive(transactions, FANNIN_BIO)
    assert control["ok"] is True
    assert control["matched_transactions"] == 2
    assert control["resolved_position"] == "TE"


def test_verify_known_positive_control_fails_on_a_broken_crosswalk():
    transactions = [
        {"season": 2025, "week": 1, "type": "waiver", "status": "complete",
         "adds": {"12506": 3}},
        {"season": 2025, "week": 1, "type": "waiver", "status": "failed",
         "adds": {"12506": 7}},
    ]
    control = WFT.verify_known_positive(transactions, {})  # empty bio, break it
    assert control["ok"] is False


# ── real end-to-end, against the actual committed history + bio store ──────

def test_build_store_against_the_real_committed_data():
    doc = WFT.build_store()
    assert doc["total_waiver_transactions"] == 648
    assert doc["unresolved_count"] == 0
    assert doc["position_resolved"] == 648
    assert doc["rule_3e_control"]["ok"] is True
    # every real skill/stream position must appear with real n
    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        assert pos in doc["pooled"], f"{pos} missing from a 3-season pool"
        assert doc["pooled"][pos]["made"] > 0
