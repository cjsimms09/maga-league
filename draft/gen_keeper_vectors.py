"""Generate the shared keeper test vectors.

The single source of truth for "what does keeper adjustment produce". Python
generates it; BOTH suites assert against it. A divergence between the Python
pipeline and the browser implementation would silently corrupt every pick number
while both sides looked healthy, so it is pinned rather than trusted.

Run after any deliberate change to keeper maths, then run both suites:
    python gen_keeper_vectors.py && python -m pytest tests -q && node tests/keepers.test.js
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import keepers as K  # noqa: E402

OUT = Path(__file__).parent / "fixtures" / "keeper_vectors.json"


def players(n: int = 40) -> list:
    return [{"player_id": f"p{i}", "name": f"Player {i}", "position":
             ["RB", "WR", "TE", "QB"][i % 4],
             "raw_adp": round(1.0 + i * 2.7, 2),
             "consensus_rank": 1.0 + i * 2.7} for i in range(1, n + 1)]


CASES = [
    {
        "name": "10-team snake, 3 keepers each, original_round",
        "cfg": {"teams": 10, "rounds": 9, "draft_type": "snake", "roster_size": 12,
                "my_draft_slot": 4, "adp_blend_weight": 0.7,
                "keepers": {"count": 3, "cost_model": "original_round", "undrafted_round": 10}},
        "keepers": {str(s): [{"player_id": f"p{s}", "original_round": 1},
                             {"player_id": f"p{s + 10}", "original_round": 4},
                             {"player_id": f"p{s + 20}", "original_round": 7}]
                    for s in range(1, 11)},
    },
    {
        "name": "two keepers colliding on the same cost round (roll-forward rule)",
        "cfg": {"teams": 10, "rounds": 8, "draft_type": "snake", "roster_size": 11,
                "my_draft_slot": 1, "adp_blend_weight": 0.7,
                "keepers": {"count": 2, "cost_model": "original_round", "undrafted_round": 10}},
        "keepers": {"3": [{"player_id": "p3", "original_round": 2},
                          {"player_id": "p13", "original_round": 2}]},
    },
    {
        "name": "escalator cost model, mixed years kept",
        "cfg": {"teams": 10, "rounds": 8, "draft_type": "snake", "roster_size": 11,
                "my_draft_slot": 7, "adp_blend_weight": 0.7,
                "keepers": {"count": 3, "cost_model": "escalator", "escalator_rounds": 2,
                            "undrafted_round": 10}},
        "keepers": {"7": [{"player_id": "p7", "original_round": 8, "years_kept": 1},
                          {"player_id": "p17", "original_round": 8, "years_kept": 2}],
                    "2": [{"player_id": "p2", "original_round": 5, "years_kept": 1}]},
    },
    {
        "name": "no keepers at all — adjustment must be a no-op on pick order",
        "cfg": {"teams": 10, "rounds": 6, "draft_type": "snake", "roster_size": 9,
                "my_draft_slot": 10, "adp_blend_weight": 0.7,
                "keepers": {"count": 0, "cost_model": "original_round", "undrafted_round": 10}},
        "keepers": {},
    },
    {
        "name": "third-round reversal with keepers",
        "cfg": {"teams": 10, "rounds": 7, "draft_type": "third_round_reversal",
                "roster_size": 10, "my_draft_slot": 5, "adp_blend_weight": 0.7,
                "keepers": {"count": 1, "cost_model": "fixed_round", "fixed_round": 3,
                            "undrafted_round": 10}},
        "keepers": {"5": [{"player_id": "p5"}], "9": [{"player_id": "p9"}]},
    },
    {
        "name": "undrafted keeper falls back to the assigned round",
        "cfg": {"teams": 10, "rounds": 8, "draft_type": "snake", "roster_size": 11,
                "my_draft_slot": 3, "adp_blend_weight": 0.5,
                "keepers": {"count": 1, "cost_model": "original_round", "undrafted_round": 6}},
        "keepers": {"3": [{"player_id": "p33"}]},
    },
]


def build() -> dict:
    pool = players()
    out = []
    for case in CASES:
        keeps = {int(k): v for k, v in case["keepers"].items()}
        order = K.build_true_pick_order(case["cfg"], keeps)
        kept_ids = {str(k["player_id"]) for v in keeps.values() for k in v}
        adj = K.adjusted_adp(pool, order, case["cfg"], kept_ids)
        out.append({
            "name": case["name"],
            "cfg": case["cfg"],
            "keepers": case["keepers"],
            "expect": {
                "pick_count": len(order.picks),
                "forfeited": sorted((f["team_slot"], f["cost_round"]) for f in order.forfeited),
                "my_picks": order.my_picks,
                "my_original_picks": order.my_original_picks,
                # Every adjusted ADP, not a sample: a divergence in one player
                # is a divergence, and sampling would hide it.
                "adjusted_adp": {p["player_id"]: p["adjusted_adp"] for p in adj},
                "pool_rank": {p["player_id"]: p["pool_rank"] for p in adj},
            },
        })
    return {"generated_by": "draft/gen_keeper_vectors.py", "players": pool, "cases": out}


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    OUT.write_text(json.dumps(data, indent=1))
    print(f"wrote {OUT} — {len(data['cases'])} cases, {len(data['players'])} players")
