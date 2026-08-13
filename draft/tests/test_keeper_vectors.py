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


def test_removing_a_keeper_does_NOT_move_anybody_else_s_picks(vectors):
    """THE ASSERTION THAT INVERTED, and the inversion is the whole correction.

    This used to read `test_removing_a_keeper_shifts_every_downstream_pick`, with
    the docstring "Not just that team's — the renumbering is global", and it
    asserted `after.my_picks != before.my_picks`. That was true of the compressed
    model and of nothing else.

    Sleeper leaves a forfeited pick in place, occupied. Dropping team 1's keeper
    converts one KEEPER SLOT into a LIVE PICK — it adds a selection and moves no
    board number at all. This league's own log: 150 picks in 2023 (0 keepers),
    2024 (23) and 2025 (20).
    """
    case = vectors["cases"][0]
    keeps = {int(k): list(v) for k, v in case["keepers"].items()}
    before = K.build_true_pick_order(case["cfg"], keeps)
    keeps[1] = keeps[1][1:]
    after = K.build_true_pick_order(case["cfg"], keeps)
    # One more SELECTION happens...
    assert len(after.picks) == len(before.picks) + 1
    # ...on a board of exactly the same size...
    assert len(after.board) == len(before.board)
    assert (sum(1 for p in before.board if p["keeper_slot"])
            == sum(1 for p in after.board if p["keeper_slot"]) + 1)
    # ...and MY seat does not move.
    assert after.my_picks == before.my_picks, (
        "team 4's picks must NOT move when team 1 drops a keeper")
    # CONTROL — team 1 is not me, and the change really did land on team 1.
    assert case["cfg"]["my_draft_slot"] != 1
    assert ({(f["team_slot"], f["cost_round"]) for f in before.forfeited}
            - {(f["team_slot"], f["cost_round"]) for f in after.forfeited})


def test_MY_OWN_keeper_count_is_the_only_thing_that_moves_my_seat(vectors):
    """The positive half, so the test above cannot pass by the code ignoring
    keepers entirely."""
    case = vectors["cases"][0]
    cfg = case["cfg"]
    keeps = {int(k): list(v) for k, v in case["keepers"].items()}
    mine = cfg["my_draft_slot"]
    before = K.build_true_pick_order(cfg, keeps)
    keeps.setdefault(mine, [])
    dropped = dict(keeps)
    if dropped.get(mine):
        dropped[mine] = dropped[mine][1:]
        after = K.build_true_pick_order(cfg, dropped)
        assert after.my_picks[0] < before.my_picks[0], (
            "dropping one of MY keepers must give me back an earlier round")
