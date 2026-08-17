# TERRITORY: A
"""replay_league_restated — the contract of the restated proxy table:
it quotes the original beside itself (never over it), its bracket and league
summaries are arithmetic identities of its own seat rows, the promoted
room_draftable_pool cell reproduces the committed single-seat sensitivity
cell exactly at seat 1, the status filter is deterministic and its exclusions
never appear on a restated tool roster, and the owner side of every
comparison is untouched by the filter."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R  # noqa: E402

ARTIFACT = DRAFT / "data" / "replay_league_table_restated.json"
ORIGINAL = DRAFT / "data" / "replay_league_table.json"
SINGLE = DRAFT / "data" / "draft_replay_2025.json"


@pytest.fixture(scope="module")
def artifact():
    assert ARTIFACT.exists(), "run draft/tools/replay_league_restated.py first"
    return json.loads(ARTIFACT.read_text())


@pytest.fixture(scope="module")
def original():
    return json.loads(ORIGINAL.read_text())


def test_provenance_mechanism_and_estimands(artifact):
    assert next(iter(artifact)) == "_territory"
    assert "replay_league_restated.py" in artifact["_territory"]
    assert artifact["mechanism"].startswith("the proxy's losses")
    for arm in ("optimal", "realistic"):
        assert arm in artifact["estimand"]
    assert artifact["original_artifact"] == \
        "draft/data/replay_league_table.json"
    assert set(artifact["years"]) == {"2023", "2024", "2025"}


def test_original_is_quoted_not_overwritten(artifact, original):
    """The restated artifact must carry the ORIGINAL summary verbatim, and
    the original file itself must still carry its own numbers."""
    q = artifact["original_summary_quoted"]
    assert q["pooled_baseline"] == \
        original["pooled"]["baseline"]["_summary"]
    for s in ("2023", "2024", "2025"):
        for arm in ("optimal", "realistic"):
            assert q["per_year_baseline"][s][arm] == \
                original["years"][s]["configs"]["baseline"][
                    "league_summary"][arm]
    b = artifact["summary_bracket"]
    for arm in ("optimal", "realistic"):
        assert b[arm]["cory_mean_delta"]["original_unfiltered"] == \
            original["pooled"]["baseline"]["_summary"][arm][
                "cory_mean_delta"]


def test_league_summaries_match_seat_rows(artifact):
    for s, y in artifact["years"].items():
        for arm in ("optimal", "realistic"):
            deltas = sorted(y["seats"][str(rid)]["arms"][arm]
                            ["delta_tool_minus_owner"]
                            for rid in range(1, 11))
            ls = y["league_summary_restated"][arm]
            assert ls["beats_n_of_10"] == sum(1 for d in deltas if d > 0)
            assert ls["median_owner_delta"] == round(
                (deltas[4] + deltas[5]) / 2.0, 2)
            assert ls["cory_delta"] == y["seats"]["1"]["arms"][arm][
                "delta_tool_minus_owner"]
        room = sorted(y["seats"][str(rid)]["room_draftable_pool_optimal"]
                      ["delta_tool_minus_owner"] for rid in range(1, 11))
        lr = y["league_summary_room_pool_optimal"]
        assert lr["beats_n_of_10"] == sum(1 for d in room if d > 0)
        assert lr["median_owner_delta"] == round(
            (room[4] + room[5]) / 2.0, 2)


def test_pooled_and_bracket_are_identities(artifact):
    pool = artifact["pooled"]
    for rid in map(str, range(1, 11)):
        for arm in ("optimal", "realistic"):
            per = [artifact["years"][s]["seats"][rid]["arms"][arm]
                   ["delta_tool_minus_owner"]
                   for s in ("2025", "2024", "2023")]
            assert pool[rid][arm]["mean_delta"] == round(sum(per) / 3.0, 2)
        per = [artifact["years"][s]["seats"][rid]
               ["room_draftable_pool_optimal"]["delta_tool_minus_owner"]
               for s in ("2025", "2024", "2023")]
        assert pool[rid]["room_draftable_pool_optimal"]["mean_delta"] == \
            round(sum(per) / 3.0, 2)
    b = artifact["summary_bracket"]
    for arm in ("optimal", "realistic"):
        assert b[arm]["cory_mean_delta"]["restated_status_filtered"] == \
            pool["_summary"][arm]["cory_mean_delta"]
    assert b["optimal"]["cory_mean_delta"]["room_draftable_pool"] == \
        pool["_summary"]["room_draftable_pool_optimal"]["cory_mean_delta"]


def test_seat1_room_pool_cell_reproduces_the_committed_single_seat_grid(
        artifact):
    single = json.loads(SINGLE.read_text())
    for s in ("2023", "2024", "2025"):
        got = artifact["years"][s]["seats"]["1"][
            "room_draftable_pool_optimal"]
        want = single["years"][s]["sensitivity_grid_optimal_arm"][
            "room_draftable_pool"]
        assert got["tool_total"] == want["tool_optimal_total"]
        assert got["delta_tool_minus_owner"] == \
            want["delta_tool_minus_cory"]


def test_status_filter_is_deterministic_and_names_brady(artifact):
    from model_accuracy_backtest import positions_record
    from own_model_v2 import board_ages
    positions = positions_record()
    ages = board_ages()
    proj = R.build_projections(2023, positions, ages)
    excluded, kept = R.roster_status_exclusions(2023, proj)
    got = {e["player_id"] for e in
           artifact["years"]["2023"]["board"]["excluded"]}
    assert got == set(excluded)
    assert "167" in excluded, "Brady (retired pre-2023-draft) must be caught"
    assert kept == []  # pre-2025 seasons corroborate via later stores
    # a second run is byte-identical input->output (no hidden state).
    again, _ = R.roster_status_exclusions(2023, proj)
    assert again == excluded


def test_excluded_players_never_on_restated_tool_rosters(artifact):
    for s, y in artifact["years"].items():
        excluded = {e["player_id"] for e in y["board"]["excluded"]}
        for rid in map(str, range(1, 11)):
            roster = set(y["seats"][rid]["tool_roster"])
            assert not (roster & excluded), (s, rid, roster & excluded)


def test_kept_indeterminate_only_where_no_later_season_exists(artifact):
    assert artifact["years"]["2023"]["board"][
        "kept_indeterminate_zero_game_players"] == []
    assert artifact["years"]["2024"]["board"][
        "kept_indeterminate_zero_game_players"] == []
    # 2025's kept list is exactly the zero-game players the 2026 board still
    # carries a team for — spot-check they are disjoint from the exclusions.
    y25 = artifact["years"]["2025"]["board"]
    kept = {p["player_id"]
            for p in y25["kept_indeterminate_zero_game_players"]}
    excl = {e["player_id"] for e in y25["excluded"]}
    assert not (kept & excl)


def test_owner_side_is_untouched_by_the_filter(artifact, original):
    """The filter changes the TOOL's candidate pool only: every seat's
    owner_total must equal the original baseline table's owner_total."""
    for s in ("2023", "2024", "2025"):
        for rid in map(str, range(1, 11)):
            for arm in ("optimal", "realistic"):
                got = artifact["years"][s]["seats"][rid]["arms"][arm][
                    "owner_total"]
                want = original["years"][s]["configs"]["baseline"][
                    "seats"][rid]["arms"][arm]["owner_total"]
                assert got == want, (s, rid, arm)
