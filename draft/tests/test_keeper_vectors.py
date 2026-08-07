"""Python side of the shared keeper parity fixture.

The JS implementation asserts against these same vectors in
`draft/tests/keepers.test.js`. This file exists so that BOTH suites go red on a
divergence rather than only one: without it, changing keepers.py would silently
regenerate different behaviour and only the JS suite would notice — and only if
someone remembered to regenerate.

If this fails, keepers.py changed. Decide whether that was intended, then run
`python gen_keeper_vectors.py` and re-run BOTH suites.
"""
from __future__ import annotations
import json
from pathlib import Path

import pytest

import keepers as K

VECTORS = Path(__file__).parent.parent / "fixtures" / "keeper_vectors.json"


@pytest.fixture(scope="module")
def vectors():
    assert VECTORS.exists(), "run python gen_keeper_vectors.py first"
    return json.loads(VECTORS.read_text())


def _case_ids(v):
    return [c["name"] for c in v["cases"]]


def test_vectors_cover_the_cost_models(vectors):
    models = {c["cfg"]["keepers"]["cost_model"] for c in vectors["cases"]}
    assert {"original_round", "escalator", "fixed_round"} <= models


def test_python_still_reproduces_every_vector(vectors):
    pool = vectors["players"]
    for case in vectors["cases"]:
        keeps = {int(k): v for k, v in case["keepers"].items()}
        order = K.build_true_pick_order(case["cfg"], keeps)
        e = case["expect"]
        label = case["name"]

        assert len(order.picks) == e["pick_count"], label
        got = sorted((f["team_slot"], f["cost_round"]) for f in order.forfeited)
        assert got == [tuple(x) for x in e["forfeited"]], label
        assert order.my_picks == e["my_picks"], label
        assert order.my_original_picks == e["my_original_picks"], label

        kept_ids = {str(k["player_id"]) for v in keeps.values() for k in v}
        adj = K.adjusted_adp(pool, order, case["cfg"], kept_ids)
        assert len(adj) == len(e["adjusted_adp"]), label
        for p in adj:
            assert p["adjusted_adp"] == pytest.approx(e["adjusted_adp"][p["player_id"]]), \
                f"{label}: {p['player_id']}"
            assert p["pool_rank"] == e["pool_rank"][p["player_id"]], f"{label}: {p['player_id']}"


def test_removing_a_keeper_shifts_every_downstream_pick(vectors):
    """Not just that team's — the renumbering is global."""
    case = vectors["cases"][0]
    keeps = {int(k): list(v) for k, v in case["keepers"].items()}
    before = K.build_true_pick_order(case["cfg"], keeps)
    keeps[1] = keeps[1][1:]
    after = K.build_true_pick_order(case["cfg"], keeps)
    assert len(after.picks) == len(before.picks) + 1
    assert after.my_picks != before.my_picks, "team 4's picks must move when team 1 drops a keeper"
