"""The expert-rank capture must report its own gaps — register 4s's lesson.

4s: `regenerate()` lost the 2025 season because a fetch failed, the `missing` list
was never surfaced, and the skip was never persisted. Three silent layers, and the
artifact still looked complete. So the tests that matter here are the ones about
what the store says when it did NOT get something.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import fp_expert_ranks as X  # noqa: E402


PAYLOAD = json.dumps({
    "expert_names": {"1046": "Some Analyst"},
    "players": [
        {"player_id": 22968, "player_name": "Jahmyr Gibbs", "player_position_id": "RB",
         "player_team_id": "DET", "rank_ecr": 1, "rank_min": "1", "rank_max": "5",
         "rank_ave": "1.70", "rank_std": "0.76", "pos_rank": "RB1",
         "experts": {"1046": "1", "7649": "3", "5662": "5"}},
        # A deep player the industry disagrees about — the case the whole row is for.
        {"player_id": 30001, "player_name": "Kimani Vidal", "player_position_id": "RB",
         "player_team_id": "LAC", "rank_ecr": 160, "rank_min": "96", "rank_max": "240",
         "rank_ave": "158.2", "rank_std": "41.0", "pos_rank": "RB48",
         "experts": {"1046": "96", "7649": "240", "5662": "150"}},
        # Ranked, but no expert breakdown — must be COUNTED, not dropped silently.
        {"player_id": 30002, "player_name": "No Experts Guy", "player_position_id": "WR",
         "rank_ecr": 300, "experts": {}},
        # Not a position this league rosters.
        {"player_id": 30003, "player_name": "A Kicker", "player_position_id": "K",
         "rank_ecr": 400, "experts": {"1046": "400"}},
    ],
})


def test_expert_ranks_are_kept_verbatim_not_reduced_to_summary_statistics():
    """Reducing early is exactly how we ended up with a cohort p90 and no way back
    to the players inside it."""
    s = X.parse(PAYLOAD)
    vidal = [p for p in s["players"] if p["name"] == "Kimani Vidal"][0]
    assert vidal["expert_ranks"] == {"1046": 96, "7649": 240, "5662": 150}
    assert vidal["n_experts"] == 3


def test_string_ranks_are_coerced_to_int_so_a_later_sort_cannot_reorder_itself():
    s = X.parse(PAYLOAD)
    for p in s["players"]:
        for v in p["expert_ranks"].values():
            assert isinstance(v, int), p
        for f in ("rank_ecr", "rank_min", "rank_max"):
            assert p[f] is None or isinstance(p[f], int), (p["name"], f)


def test_a_player_with_no_expert_breakdown_is_NAMED_not_silently_dropped():
    """4s: the season that vanished left no trace, and that is why nobody caught it."""
    s = X.parse(PAYLOAD)
    assert "No Experts Guy" in s["players_without_experts"]
    assert any(p["name"] == "No Experts Guy" for p in s["players"]), "dropped, not recorded"


def test_non_rostered_positions_are_dropped_AND_counted():
    """Register 4r: punters entered the calibration because nothing asserted the
    population. Dropping is right; dropping silently is the defect."""
    s = X.parse(PAYLOAD)
    assert not any(p["position"] == "K" for p in s["players"])
    assert s["non_rostered_dropped"] == 1


def test_players_come_back_in_ECR_order():
    s = X.parse(PAYLOAD)
    ranks = [p["rank_ecr"] for p in s["players"]]
    assert ranks == sorted(ranks), ranks


def test_coverage_reports_DEEP_players_because_that_is_the_only_useful_question():
    """Expert coverage that stops at the top 60 is a null for our purpose even at
    100% of what FP serves — every complaint is about round 4 onward."""
    s = X.parse(PAYLOAD)
    c = X.coverage(s)
    assert c["with_experts"] == 2
    assert c["without_experts"] == 1
    assert c["deep_with_experts"] == 1, "Vidal at ECR 160 must count as deep"
    assert c["max_experts_on_a_player"] == 3


def test_coverage_counts_DISTINCT_spreads_the_4j_test():
    """4j: 0 of 535 players shared a proj_mean and differed on any dispersion field.
    A field with one value per band is not player-specific. Gibbs' spread is 4,
    Vidal's is 144 — two distinct values, so the source really does vary by player."""
    c = X.coverage(X.parse(PAYLOAD))
    assert c["distinct_rank_spreads"] == 2, c


def test_an_empty_or_broken_payload_produces_an_empty_store_rather_than_raising():
    for bad in ("{}", "[]", json.dumps({"players": "nonsense"})):
        s = X.parse(bad)
        assert s["players"] == []
        assert X.coverage(s)["with_experts"] == 0


def test_garbage_expert_ranks_are_skipped_without_taking_the_player_with_them():
    p = json.dumps({"players": [
        {"player_name": "X", "player_position_id": "WR", "rank_ecr": 10,
         "experts": {"1": "12", "2": "n/a", "3": None, "4": "20"}}]})
    s = X.parse(p)
    assert s["players"][0]["expert_ranks"] == {"1": 12, "4": 20}
    assert s["players"][0]["n_experts"] == 2


def test_store_path_is_season_scoped():
    """One file per season. 4s lost a season inside a single artifact that could not
    say which seasons it held."""
    assert X.store_path(2026).name == "fp_expert_ranks_2026.json"
    assert X.store_path(2025) != X.store_path(2026)


@pytest.mark.parametrize("field", ["fetch_error", "coverage", "players_without_experts"])
def test_the_artifact_contract_names_the_fields_that_report_gaps(field):
    """Pinning the shape: if a refactor drops one of these, the store goes back to
    looking complete when it is not — which is exactly 4s."""
    src = (Path(X.__file__)).read_text()
    assert field in src, field
