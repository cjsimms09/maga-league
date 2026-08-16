# TERRITORY: A
"""replay_all_seats — the contract of the league-relative benchmark:
seat-1 parity with the committed single-seat replay (the answer to "just
mine?" must be built on the exact arm that answered "would it have drafted
me a better team"), per-seat replay/board consistency, league-table and
pooled arithmetic, layer-grade identities, the drafter-skill study's
internal consistency, the live-board roster-status verification, and the
committed artifact's regeneration pin.
"""
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
import drafter_skill as DS  # noqa: E402
import replay_all_seats as A  # noqa: E402

ARTIFACT = DRAFT / "data" / "replay_league_table.json"
SINGLE = DRAFT / "data" / "draft_replay_2025.json"


@pytest.fixture(scope="module")
def artifact():
    assert ARTIFACT.exists(), "run draft/tools/replay_all_seats.py first"
    return json.loads(ARTIFACT.read_text())


@pytest.fixture(scope="module")
def single():
    return json.loads(SINGLE.read_text())


def test_territory_first_questions_verbatim(artifact):
    assert next(iter(artifact)) == "_territory"
    assert artifact["question_verbatim"].startswith(
        "Does model lose to everyone's drafting or just mine?")
    assert artifact["addendum_verbatim"].startswith(
        "Do we need to find who the best drafter were?")
    assert set(artifact["years"]) == {"2023", "2024", "2025"}
    for y in artifact["years"].values():
        assert set(y["configs"]) == {"baseline", "rookie_prior",
                                     "year2_escalator", "both"}
        assert set(y["configs"]["baseline"]["seats"]) == {
            str(i) for i in range(1, 11)}


# ── seat 1 IS the committed single-seat replay, exactly ─────────────────────

@pytest.mark.parametrize("season", ["2025", "2024", "2023"])
def test_seat1_baseline_reproduces_the_committed_replay(artifact, single,
                                                        season):
    seat = artifact["years"][season]["configs"]["baseline"]["seats"]["1"]
    want = single["years"][season]["arms"]
    for arm, key in (("optimal", "delta_tool_minus_cory"),
                     ("realistic", "delta_tool_minus_cory")):
        assert seat["arms"][arm]["delta_tool_minus_owner"] == \
            want[arm][key]
        assert seat["arms"][arm]["head_to_head"]["tool_weeks_won"] == \
            want[arm]["head_to_head"]["tool_weeks_won"]
        assert seat["arms"][arm]["tool_total"] == \
            want[arm]["tool"]["season_total"]


# ── internal arithmetic ──────────────────────────────────────────────────────

def test_baseline_weekly_series_sum_to_totals_and_h2h(artifact):
    for season, y in artifact["years"].items():
        for rid, seat in y["configs"]["baseline"]["seats"].items():
            for arm in ("optimal", "realistic"):
                a = seat["arms"][arm]
                assert round(sum(a["tool_weekly"]), 2) == a["tool_total"]
                assert round(sum(a["owner_weekly"]), 2) == a["owner_total"]
                assert round(a["tool_total"] - a["owner_total"], 2) == \
                    a["delta_tool_minus_owner"]
                h = a["head_to_head"]
                assert h["tool_weeks_won"] + h["cory_weeks_won"] + \
                    h["ties"] == 17


def test_league_summary_matches_seat_deltas(artifact):
    for season, y in artifact["years"].items():
        for cfg, c in y["configs"].items():
            for arm in ("optimal", "realistic"):
                deltas = sorted(
                    c["seats"][str(rid)]["arms"][arm]
                    ["delta_tool_minus_owner"] for rid in range(1, 11))
                s = c["league_summary"][arm]
                assert s["beats_n_of_10"] == sum(1 for d in deltas if d > 0)
                assert s["median_owner_delta"] == round(
                    (deltas[4] + deltas[5]) / 2.0, 2)
                assert s["cory_delta"] == c["seats"]["1"]["arms"][arm][
                    "delta_tool_minus_owner"]
                assert len(s["owners_tool_beats"]) == s["beats_n_of_10"]


def test_pooled_means_are_the_per_year_means(artifact):
    for cfg, table in artifact["pooled"].items():
        for rid in map(str, range(1, 11)):
            for arm in ("optimal", "realistic"):
                row = table[rid][arm]
                per = [artifact["years"][s]["configs"][cfg]["seats"][rid]
                       ["arms"][arm]["delta_tool_minus_owner"]
                       for s in ("2025", "2024", "2023")]
                assert row["mean_delta"] == round(sum(per) / 3.0, 2)
                assert set(row["per_year"]) == {"2025", "2024", "2023"}


def test_layer_grades_are_baseline_vs_layer_identities(artifact):
    for cfg, g in artifact["layer_grades"].items():
        for arm in ("optimal", "realistic"):
            p = g["pooled"][arm]
            assert p["cory_gap_change"] == round(
                p["cory_mean_delta_layer"]
                - p["cory_mean_delta_baseline"], 2)
            assert p["cory_mean_delta_baseline"] == \
                artifact["pooled"]["baseline"]["_summary"][arm][
                    "cory_mean_delta"]
        for season, yr in g["per_year"].items():
            base = artifact["years"][season]["configs"]["baseline"][
                "league_summary"]
            layer = artifact["years"][season]["configs"][cfg][
                "league_summary"]
            for arm in ("optimal", "realistic"):
                assert yr[arm]["cory_delta_baseline"] == \
                    base[arm]["cory_delta"]
                assert yr[arm]["cory_delta_layer"] == \
                    layer[arm]["cory_delta"]


# ── the replayed boards obey the drafts they replay (every seat) ─────────────

@pytest.mark.parametrize("season", ["2025", "2024", "2023"])
def test_every_seat_tool_roster_is_legal_and_disjoint_from_history(
        artifact, season):
    """Each seat's tool roster may contain a pid history gave another owner
    ONLY as a counted shadow; keepers of the seat must appear; caps hold."""
    srec = R.season_record(int(season))
    picks, keepers = R.season_draft(srec)
    from model_accuracy_backtest import positions_record
    positions = positions_record()
    for rid in range(1, 11):
        seat = artifact["years"][season]["configs"]["baseline"]["seats"][
            str(rid)]
        roster = seat["tool_roster"]
        assert len(roster) == len(set(roster))
        counts = {}
        for p in roster:
            counts[positions.get(p)] = counts.get(positions.get(p), 0) + 1
        for pos, cap in R.POSITION_CAPS.items():
            assert counts.get(pos, 0) <= cap, (season, rid, pos)
        # the seat's own keeper skill players are on the tool roster.
        own_keep = [str(p["player_id"]) for p in picks
                    if p["roster_id"] == rid
                    and (p.get("is_keeper")
                         or str(p["player_id"]) in keepers)
                    and positions.get(str(p["player_id"]))
                    in ("QB", "RB", "WR", "TE")]
        for pid in own_keep:
            assert pid in roster, (season, rid, pid)


# ── drafter study ────────────────────────────────────────────────────────────

def test_drafter_ranking_is_ordered_and_consistent(artifact):
    ds = artifact["drafter_study"]
    ranked = ds["ranking"]
    assert [r["rank"] for r in ranked] == list(range(1, 11))
    surp = [r["surplus_total_3yr"] for r in ranked]
    assert surp == sorted(surp, reverse=True)
    for r in ranked:
        per_year_sum = round(sum(v["surplus"]
                                 for v in r["per_year"].values()), 2)
        assert abs(per_year_sum - r["surplus_total_3yr"]) < 0.05
        assert r["n_live_skill_picks"] == sum(
            v["n"] for v in r["per_year"].values())
    assert ds["top3_roster_ids"] == [r["roster_id"] for r in ranked[:3]]
    assert ds["bottom_half_roster_ids"] == [
        r["roster_id"] for r in ranked[5:]]


def test_round_means_are_keeper_free_league_means(artifact):
    """Hand-recompute one season's round means from the raw draft + stores;
    the study's table must match exactly."""
    from model_accuracy_backtest import positions_record
    positions = positions_record()
    season = 2024
    srec = R.season_record(season)
    picks, keepers = R.season_draft(srec)
    totals = {pid: round(sum(rows.values()), 2)
              for pid, rows in R.weekly_points_of(season).items()}
    by_round = {}
    for p in picks:
        pid = str(p["player_id"])
        if p.get("is_keeper") or pid in keepers:
            continue
        if positions.get(pid) not in ("QB", "RB", "WR", "TE"):
            continue
        by_round.setdefault(DS.round_of(p["pick_no"]), []).append(
            float(totals.get(pid, 0.0)))
    want = {str(rd): round(sum(v) / len(v), 2)
            for rd, v in sorted(by_round.items())}
    got = artifact["drafter_study"]["round_means_by_season"]["2024"]
    assert {str(k): v for k, v in got.items()} == want


def test_tool_contrast_covers_top3_both_configs(artifact):
    c = artifact["tool_behavior_in_top3_seats"]
    top3 = {str(r) for r in artifact["drafter_study"]["top3_roster_ids"]}
    for cfg in ("baseline", "both"):
        assert set(c[cfg]) == top3
        for row in c[cfg].values():
            assert row["n_live_picks"] > 0
    # baseline boards carry no rookies by construction.
    assert all(v["rookies_taken"] == 0 for v in c["baseline"].values())


# ── layer (c): roster-status verification ────────────────────────────────────

def test_roster_status_verification_is_true_and_reproducible(artifact):
    v = artifact["roster_status_verification"]
    assert v["verified"] is True
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    teamless = [p for p in board["players"] if not p.get("team")]
    assert len(teamless) == v["players_with_null_team"]
    assert [p["name"] for p in teamless
            if (p.get("proj_mean") or 0) > 0] == \
        v["teamless_players_carrying_projection"]


# ── the prepared live diff is GATED and its dry run mutates nothing ──────────

def test_prepared_rookie_diff_refuses_apply_and_dry_run_mutates_nothing(
        capsys):
    import apply_rookie_prior_own_model_2026 as AP
    board_path = ROOT / "public" / "draft_data.json"
    before = board_path.read_bytes()
    assert AP.main(["apply"]) == 2, "apply without approval must refuse"
    assert AP.main([]) == 0
    out = capsys.readouterr().out
    assert "DRY RUN" in out and "REFUSING" in out
    assert board_path.read_bytes() == before, (
        "the prepared diff touched the board without approval")


# ── determinism and the regeneration pin ─────────────────────────────────────

def test_one_replay_year_is_deterministic():
    from model_accuracy_backtest import positions_record
    from own_model_v2 import board_ages
    from rookie_prior import load_store
    positions = positions_record()
    ages = board_ages()
    names = R.name_map()
    store = load_store()
    class_of = DS.class_of_map(store)
    a = A.replay_year(2024, positions, ages, names, store, class_of)
    b = A.replay_year(2024, positions, ages, names, store, class_of)
    assert a == b


@pytest.mark.repo_parity
def test_artifact_matches_regeneration(artifact):
    """repo_parity: regeneration reads the tree's positions record, board
    ages and the live board (roster-status verification + names), which the
    nightly board rebuild legitimately refreshes — same class as the
    draft-replay pin, excluded only in the publication gate."""
    assert A.run() == artifact
