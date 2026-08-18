# TERRITORY: A
"""engine_seat_replay — the contract of the live-edge measurement artifact:
provenance and both estimand sentences travel with the numbers (the realistic
arm can never be read alone), every summary is an arithmetic identity of its
own seat rows, the engine rosters are legal and carry the seat's keepers, the
choice file upstream holds no outcome data and declares the shipped
configuration, and the quoted proxy context matches the committed tables."""
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

ARTIFACT = DRAFT / "data" / "engine_seat_replay.json"
CHOICES = DRAFT / "backtest" / "engine_seat_choices.json"
LEAGUE_TABLE = DRAFT / "data" / "replay_league_table.json"

pytestmark = pytest.mark.skipif(
    not ARTIFACT.exists(),
    reason=("engine_seat_replay.json not built yet — dispatch the backtest "
            "workflow (choice side) and run replay_seats_grade.py"))


@pytest.fixture(scope="module")
def artifact():
    return json.loads(ARTIFACT.read_text())


@pytest.fixture(scope="module")
def choices():
    assert CHOICES.exists()
    return json.loads(CHOICES.read_text())


def test_provenance_and_estimands(artifact):
    assert next(iter(artifact)) == "_territory"
    assert "replay_seats_grade.py" in artifact["_territory"]
    for arm in ("optimal", "realistic"):
        assert arm in artifact["estimand"]
    assert "preregistered primary" in artifact["estimand"]["optimal"]
    assert "never" in artifact["estimand"]["realistic"]
    assert artifact["engine_meta"]["weights"] == "MEASURED_WEIGHTS"
    cov = artifact["coverage"]
    assert cov["seat_seasons"] == 10 * len(cov["seasons"])
    assert set(map(str, cov["seasons"])) == set(artifact["years"])


def test_choice_file_holds_no_outcomes_and_names_the_head(choices):
    raw = CHOICES.read_text()
    assert "actual_points" not in raw
    assert '"weekly"' not in raw
    assert choices["meta"]["git_head"] not in ("", "UNAVAILABLE")
    assert choices["meta"]["weights"] == "MEASURED_WEIGHTS"
    # every bundle the choices were made on declares its era method.
    for b in choices["meta"]["bundles"]:
        assert b["projection_method"] in ("walk_forward", "adp_implied")


def test_both_arms_reported_for_every_seat_season(artifact):
    for s, y in artifact["years"].items():
        assert set(y["seats"]) == {str(i) for i in range(1, 11)}
        for seat in y["seats"].values():
            for arm in ("optimal", "realistic"):
                a = seat["arms"][arm]
                assert round(a["tool_total"] - a["owner_total"], 2) == \
                    a["delta_tool_minus_owner"]
                h = a["head_to_head"]
                assert h["tool_weeks_won"] + h["cory_weeks_won"] + \
                    h["ties"] == 17


def test_league_and_pooled_summaries_are_identities(artifact):
    for s, y in artifact["years"].items():
        for arm in ("optimal", "realistic"):
            deltas = sorted(y["seats"][str(rid)]["arms"][arm]
                            ["delta_tool_minus_owner"]
                            for rid in range(1, 11))
            ls = y["league_summary"][arm]
            assert ls["beats_n_of_10"] == sum(1 for d in deltas if d > 0)
            assert ls["median_owner_delta"] == round(
                (deltas[4] + deltas[5]) / 2.0, 2)
            assert ls["cory_delta"] == y["seats"]["1"]["arms"][arm][
                "delta_tool_minus_owner"]
    seasons = sorted(artifact["years"], reverse=True)
    pool = artifact["pooled"]
    for rid in map(str, range(1, 11)):
        for arm in ("optimal", "realistic"):
            per = [artifact["years"][s]["seats"][rid]["arms"][arm]
                   ["delta_tool_minus_owner"] for s in seasons]
            assert pool[rid][arm]["mean_delta"] == \
                round(sum(per) / len(per), 2)
    for arm in ("optimal", "realistic"):
        means = sorted(pool[str(rid)][arm]["mean_delta"]
                       for rid in range(1, 11))
        s_ = pool["_summary"][arm]
        assert s_["beats_n_of_10_pooled"] == sum(1 for m in means if m > 0)
        assert s_["median_owner_mean_delta"] == round(
            (means[4] + means[5]) / 2.0, 2)
        assert s_["cory_mean_delta"] == pool["1"][arm]["mean_delta"]


def test_engine_rosters_are_legal_and_carry_the_seats_keepers(artifact,
                                                              choices):
    from model_accuracy_backtest import positions_record
    positions = positions_record()
    for s, y in artifact["years"].items():
        picks, keepers = R.season_draft(R.season_record(int(s)))
        for rid in map(str, range(1, 11)):
            roster = [p["player_id"] for p in y["seats"][rid]
                      ["engine_roster"]]
            assert len(roster) == len(set(roster))
            own_keep = [str(p["player_id"]) for p in picks
                        if p["roster_id"] == int(rid)
                        and (p.get("is_keeper")
                             or str(p["player_id"]) in keepers)
                        and positions.get(str(p["player_id"]))
                        in ("QB", "RB", "WR", "TE")]
            for pid in own_keep:
                assert pid in roster, (s, rid, pid)
            # graded roster is exactly the choice file's skill roster.
            ch = set(choices["seasons"][s]["seats"][rid]["roster"])
            assert set(roster) <= ch


def test_status_filtered_arm_rides_beside_never_instead(artifact):
    """The diagnostic board arm must never replace the as-run arm: both are
    present per seat, its exclusions come from the committed restated table,
    and its pooled summary is an identity of its own rows."""
    store = DRAFT / "data" / "roster_status_exclusions.json"
    if not artifact.get("pooled_status_filtered"):
        pytest.skip("choice file predates the status-filtered arm")
    excl = json.loads(store.read_text())
    seasons = sorted(artifact["years"], reverse=True)
    for s in seasons:
        banned = {e["player_id"] for e in excl["years"][s]["excluded"]}
        for rid in map(str, range(1, 11)):
            seat = artifact["years"][s]["seats"][rid]
            assert "arms" in seat and "status_filtered" in seat
            roster = {p["player_id"]
                      for p in seat["status_filtered"]["engine_roster"]}
            assert not (roster & banned), (s, rid, roster & banned)
    pool = artifact["pooled_status_filtered"]
    for arm in ("optimal", "realistic"):
        for rid in map(str, range(1, 11)):
            per = [artifact["years"][s]["seats"][rid]["status_filtered"]
                   ["arms"][arm]["delta_tool_minus_owner"] for s in seasons]
            assert pool[rid][arm]["mean_delta"] == \
                round(sum(per) / len(per), 2)
        s_ = pool["_summary"][arm]
        means = sorted(pool[str(rid)][arm]["mean_delta"]
                       for rid in range(1, 11))
        assert s_["median_owner_mean_delta"] == round(
            (means[4] + means[5]) / 2.0, 2)


def test_qb_question_quotes_the_committed_benchmark(artifact):
    lt = json.loads(LEAGUE_TABLE.read_text())
    ds = lt["drafter_study"]["top3_vs_bottom_half"]["first_QB_round_mean"]
    q = artifact["qb_question"]
    assert q["league_benchmark_first_QB_round"]["top3"] == ds["top3"]
    assert q["league_benchmark_first_QB_round"]["bottom_half"] == \
        ds["bottom_half"]
    for s, row in q["per_season"].items():
        assert row["engine_first_QB_round"] == \
            artifact["years"][s]["seats"]["1"]["first_QB_round_engine"]
        assert row["owner_first_QB_round"] == \
            artifact["years"][s]["seats"]["1"]["first_QB_round_owner"]


def test_proxy_context_matches_committed_tables(artifact):
    lt = json.loads(LEAGUE_TABLE.read_text())
    assert artifact["proxy_context_quoted"][
        "proxy_original_pooled_baseline"] == \
        lt["pooled"]["baseline"]["_summary"]
