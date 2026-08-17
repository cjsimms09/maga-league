# TERRITORY: A
"""The 2021/2022 weekly-points stores were REBUILT, not fetched.

"own_v6 can only be graded on 2025" capped nearly every study in this repo at
one season of evidence, because own_model_v2's late_rates needs two prior
seasons of weekly points and 2021/2022 did not exist. The limit was true of
the STORE, not the DATA — the points store is a pure re-scoring of the
committed component store.

A fabricated store is worse than a missing one, so the build is licensed by an
exact reproduction of a store we already have. These tests pin that licence.
"""
import json
import sys
from pathlib import Path

import pytest

BT = Path(__file__).resolve().parents[1] / "backtest"
sys.path.insert(0, str(BT))
import build_weekly_points_from_components as B  # noqa: E402
import fetch_component_stats as FCS  # noqa: E402


def test_rebuild_reproduces_a_committed_store_exactly():
    # THE LICENCE. Not "close" — zero disagreements. If this ever fails, the
    # builder must not run, and main() refuses on exactly this condition.
    comp = json.loads((BT / "component_stats_2023.json").read_text())
    committed = json.loads((BT / "nflverse_weekly_points_2023.json").read_text())
    v = B.verify_against_committed(comp, committed, FCS.frozen_scoring_table())
    assert v["exact"] is True, v["sample"]
    assert v["disagreements"] == 0
    assert v["compared"] > 5000


def test_score_row_prices_only_what_the_table_prices():
    sc = {"rush_yd": 0.1, "rush_td": 6.0}
    # Unpriced and non-numeric fields contribute nothing rather than raising —
    # the same shape the verification runs, so proven and built cannot diverge.
    assert B.score_row({"rush_yd": 100, "rush_td": 2, "team": "KC",
                        "some_new_stat": 99}, sc) == pytest.approx(22.0)


def test_absent_players_are_not_invented_as_zeros():
    # nflverse_weekly_points_2025.json is known to DROP zero-point rows, so
    # presence there means "scored something", not "played". This builder
    # inherits the component store's population instead, which is the honest
    # one — it must not add rows the component store does not have.
    comp = {"weeks": [{"week": 1, "players": {"a": {"rush_yd": 10}}}]}
    out = B.rescore_season(comp, {"rush_yd": 0.1})
    assert set(out[1]) == {"a"}


@pytest.mark.parametrize("season", (2021, 2022))
def test_rebuilt_stores_exist_and_declare_themselves_rebuilt(season):
    p = BT / f"nflverse_weekly_points_{season}.json"
    assert p.exists(), f"{p.name} missing — run the builder"
    d = json.loads(p.read_text())
    # A reader must never mistake a rebuilt store for a fetched one.
    assert "REBUILT OFFLINE" in d["_note"]
    assert d["coverage"][str(season)]["rebuilt_offline"] is True
    assert d["coverage"][str(season)]["weeks"] == 18


@pytest.mark.parametrize("season", (2021, 2022))
def test_rebuilt_stores_carry_the_same_scoring_fingerprint(season):
    # One scoring table across every season, or cross-season grading is
    # comparing different games.
    d = json.loads((BT / f"nflverse_weekly_points_{season}.json").read_text())
    fps = set(d["scoring_fingerprints"])
    assert len(fps) == 1
    for w in d["weeks"]:
        assert w["scoring_fingerprint"] in fps


def test_rebuilt_points_match_a_hand_scored_row():
    # Spot-check the actual artifact against the component line it came from,
    # so the test is not merely self-consistent with the builder.
    comp = json.loads((BT / "component_stats_2021.json").read_text())
    pts = json.loads((BT / "nflverse_weekly_points_2021.json").read_text())
    sc = FCS.frozen_scoring_table()
    wk1_comp = [w for w in comp["weeks"] if int(w["week"]) == 1][0]["players"]
    wk1_pts = [w for w in pts["weeks"] if w["week"] == 1][0]["points"]
    pid = next(iter(wk1_comp))
    expected = sum(float(wk1_comp[pid].get(k) or 0) * float(sc.get(k, 0))
                   for k in wk1_comp[pid] if isinstance(wk1_comp[pid].get(k), (int, float)))
    assert wk1_pts[pid] == pytest.approx(round(expected, 2))
