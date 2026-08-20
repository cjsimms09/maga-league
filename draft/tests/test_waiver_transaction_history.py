# TERRITORY: C
"""Register: relay's 08-20 in-season dispatch, ASK 1 (waiver/FAAB transaction
history). The headline finding here is that there IS no FAAB money on this
league -- pinned as a real assertion against real committed data, not a
narrated claim. The known-positive for `competing_claims` is a REAL case
(2024 week 3, player 5937), verified by hand against league_history.json
before writing this file.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import waiver_transaction_history as W  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
HISTORY = ROOT / "draft" / "data" / "league_history.json"


def _real_history():
    return json.loads(HISTORY.read_text())


def test_the_real_store_has_zero_non_null_waiver_bids():
    # THE FAIL ARM: this assertion can break. If it ever does, the FAAB
    # premise has changed and every downstream claim in this module's
    # docstring needs re-checking, not defending.
    txs = W.flatten_transactions(_real_history(), (2023, 2024, 2025))
    check = W.verify_no_faab(txs)
    assert check["checked"] == 1091, check["checked"]
    assert check["non_null_waiver_bid"] == 0
    assert check["is_faab_league"] is False


def test_verify_no_faab_correctly_flags_a_planted_bid():
    # rule 3e fail arm: prove the check CAN fire, not just that it currently
    # passes on real data.
    txs = [{"waiver_bid": None}, {"waiver_bid": None}, {"waiver_bid": 23}]
    check = W.verify_no_faab(txs)
    assert check["is_faab_league"] is True
    assert check["non_null_waiver_bid"] == 1


def test_flatten_transactions_covers_all_three_real_seasons():
    txs = W.flatten_transactions(_real_history(), (2023, 2024, 2025))
    seasons = {t["season"] for t in txs}
    assert seasons == {2023, 2024, 2025}


def test_flatten_transactions_respects_the_season_filter():
    txs = W.flatten_transactions(_real_history(), (2024,))
    assert txs and all(t["season"] == 2024 for t in txs)


# ── competing_claims: the real, verified 2024 week 3 / player 5937 case ─────

REAL_5937_ROWS = [
    {"type": "waiver", "status": "complete", "roster_ids": [5],
     "adds": {"5937": 5}, "drops": {}, "waiver_bid": None,
     "created": 1727135108190},
    {"type": "waiver", "status": "failed", "roster_ids": [9],
     "adds": {"5937": 9}, "drops": {}, "waiver_bid": None,
     "created": 1727233421481},
    {"type": "waiver", "status": "failed", "roster_ids": [9],
     "adds": {"5937": 9}, "drops": {}, "waiver_bid": None,
     "created": 1727233486737},
]


def test_competing_claims_matches_the_real_verified_case():
    history = {"seasons": [{"season": 2024, "transactions": {"3": REAL_5937_ROWS}}]}
    txs = W.flatten_transactions(history, (2024,))
    contested = W.competing_claims(txs)
    assert len(contested) == 1
    row = contested[0]
    assert row["player_id"] == "5937" and row["n_claims"] == 3
    assert row["winner"]["roster_id"] == 5
    assert len(row["losers"]) == 2
    assert all(l["roster_id"] == 9 for l in row["losers"])
    # the winner cleared strictly before both losers, matching the real timestamps
    assert row["winner"]["created"] < row["losers"][0]["created"]


def test_a_player_claimed_by_only_one_roster_is_not_contested():
    rows = [{"type": "waiver", "status": "complete", "roster_ids": [1],
            "adds": {"9999": 1}, "drops": {}, "waiver_bid": None,
            "created": 100}]
    history = {"seasons": [{"season": 2024, "transactions": {"1": rows}}]}
    txs = W.flatten_transactions(history, (2024,))
    assert W.competing_claims(txs) == []


def test_trades_are_not_scored_as_contested_claims():
    # a trade's "adds" are not a waiver competition; excluded by type filter
    rows = [{"type": "trade", "status": "complete", "roster_ids": [1, 2],
            "adds": {"1234": 1}, "drops": {"1234": 2}, "waiver_bid": None,
            "created": 1},
           {"type": "waiver", "status": "failed", "roster_ids": [3],
            "adds": {"1234": 3}, "drops": {}, "waiver_bid": None,
            "created": 2}]
    history = {"seasons": [{"season": 2024, "transactions": {"1": rows}}]}
    txs = W.flatten_transactions(history, (2024,))
    contested = W.competing_claims(txs)
    assert contested == []


def test_created_order_does_not_reliably_predict_the_winner():
    # THE CORRECTED FINDING, PINNED: an earlier draft of this module claimed
    # `created` reconstructs waiver priority, generalized from exactly one
    # hand-checked case. Checked properly across the real data: it does not.
    # This test protects against re-introducing that false claim.
    doc = W.build_store((2023, 2024, 2025), history=_real_history())
    earliest_wins, other = 0, 0
    for row in doc["contested_claims"]:
        w = row["winner"]
        if not w or w.get("created") is None:
            continue
        losers = [l for l in row["losers"] if l.get("created") is not None]
        if not losers:
            continue
        if all(w["created"] < l["created"] for l in losers):
            earliest_wins += 1
        else:
            other += 1
    total = earliest_wins + other
    assert total > 100, "population too small to say anything"
    rate = earliest_wins / total
    assert rate < 0.6, (
        f"earliest-submission win rate is {rate:.2f} -- if this climbs, "
        "created may have become a real priority signal and the module "
        "docstring's correction should be revisited")


def test_build_store_on_the_real_data_reports_the_faab_finding_honestly():
    doc = W.build_store((2023, 2024, 2025), history=_real_history())
    assert doc["total_transactions"] == 1091
    assert doc["faab_check"]["is_faab_league"] is False
    assert doc["n_contested"] > 0
    assert "transactions" in doc and len(doc["transactions"]) == 1091
