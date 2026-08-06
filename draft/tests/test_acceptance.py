"""Acceptance tests from the build spec. Run: python -m pytest draft/tests -q"""
from __future__ import annotations
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import pytest  # noqa: E402

from scoring import score_stat_line, HALF_PPR_REFERENCE  # noqa: E402
from config_schema import validate, ConfigError  # noqa: E402
import keepers as K  # noqa: E402
import vorp as V  # noqa: E402


# --------------------------------------------------------------- scoring engine
# Ten real 2024 stat lines with totals computed by hand under half PPR
# (0.04/pass yd, 4/pass TD, -2/INT, 0.1/rush+rec yd, 6/TD, 0.5/rec, -2/fumble).
HAND_CHECKED = [
    # (label, stats, expected)
    ("Lamar Jackson wk: 280 pass, 3 TD, 1 INT, 60 rush, 1 rush TD",
     {"pass_yd": 280, "pass_td": 3, "pass_int": 1, "rush_yd": 60, "rush_td": 1},
     11.2 + 12 - 2 + 6 + 6),                                            # 33.20
    ("Saquon Barkley: 150 rush, 2 TD, 4 rec, 30 rec yd",
     {"rush_yd": 150, "rush_td": 2, "rec": 4, "rec_yd": 30},
     15 + 12 + 2 + 3),                                                   # 32.00
    ("Ja'Marr Chase: 11 rec, 175 yds, 2 TD",
     {"rec": 11, "rec_yd": 175, "rec_td": 2},
     5.5 + 17.5 + 12),                                                   # 35.00
    ("Brock Bowers: 7 rec, 80 yds",
     {"rec": 7, "rec_yd": 80},
     3.5 + 8),                                                           # 11.50
    ("Joe Burrow: 350 pass, 2 TD, 2 INT",
     {"pass_yd": 350, "pass_td": 2, "pass_int": 2},
     14 + 8 - 4),                                                        # 18.00
    ("Derrick Henry: 90 rush, 1 TD, 1 fumble lost",
     {"rush_yd": 90, "rush_td": 1, "fum_lost": 1},
     9 + 6 - 2),                                                         # 13.00
    ("Puka Nacua: 9 rec, 120 yds, 1 TD, 10 rush yds",
     {"rec": 9, "rec_yd": 120, "rec_td": 1, "rush_yd": 10},
     4.5 + 12 + 6 + 1),                                                  # 23.50
    ("Josh Allen: 240 pass, 1 TD, 0 INT, 55 rush, 2 rush TD, 1 2pt",
     {"pass_yd": 240, "pass_td": 1, "pass_int": 0, "rush_yd": 55, "rush_td": 2, "rush_2pt": 1},
     9.6 + 4 + 5.5 + 12 + 2),                                            # 33.10
    ("Goose egg: 0 everything",
     {"rec": 0, "rec_yd": 0, "rec_td": 0},
     0.0),
    ("Negative game: 5 rush yds, 2 fumbles lost",
     {"rush_yd": 5, "fum_lost": 2},
     0.5 - 4),                                                           # -3.50
]


@pytest.mark.parametrize("label,stats,expected", HAND_CHECKED, ids=[h[0][:28] for h in HAND_CHECKED])
def test_scoring_matches_hand_computed_half_ppr(label, stats, expected):
    assert score_stat_line(stats, HALF_PPR_REFERENCE) == pytest.approx(round(expected, 2))


def test_scoring_uses_league_table_not_provider_points():
    """A full-PPR league must score the same line higher than half PPR."""
    line = {"rec": 10, "rec_yd": 100}
    half = score_stat_line(line, HALF_PPR_REFERENCE)
    full = score_stat_line(line, {**HALF_PPR_REFERENCE, "rec": 1.0})
    assert full - half == pytest.approx(5.0)


def test_scoring_ignores_descriptive_keys():
    line = {"rec": 4, "rec_yd": 50, "gp": 17, "team": "CIN"}
    assert score_stat_line(line, {**HALF_PPR_REFERENCE, "gp": 99}) == pytest.approx(7.0)


# --------------------------------------------------------------------- config
def base_config(**over):
    cfg = {
        "league_id": "test", "season": "2026", "teams": 12, "draft_type": "snake",
        "my_draft_slot": 4,
        "roster_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "K": 1, "DEF": 1, "BN": 6},
        "scoring": dict(HALF_PPR_REFERENCE),
        "keepers": {"count": 3, "cost_model": "original_round", "max_years": 3,
                    "undrafted_rule": "assigned_round", "undrafted_round": 10},
    }
    cfg.update(over)
    return validate(cfg)


def test_config_validator_rejects_garbage():
    with pytest.raises(ConfigError) as exc:
        validate({"league_id": "x", "season": "2026", "teams": 99, "draft_type": "auction",
                  "roster_slots": {}, "scoring": {}, "keepers": {}})
    msg = str(exc.value)
    assert "teams" in msg and "draft_type" in msg and "roster_slots" in msg


# ------------------------------------------------------- keepers / pick order
def make_pool(n=200):
    """Synthetic pool: strictly decreasing projections, ADP == rank."""
    pool, pid = [], 0
    for rank in range(1, n + 1):
        pos = ["RB", "WR", "WR", "TE", "QB", "RB", "WR", "K", "DEF", "RB"][rank % 10]
        pid += 1
        pool.append({
            "player_id": str(pid), "name": f"Player {rank}", "position": pos,
            "raw_adp": float(rank), "consensus_rank": float(rank),
            "proj_mean": 400.0 - rank * 1.5,
        })
    return pool


def test_zero_keepers_leaves_adp_essentially_unchanged():
    """Sanity check: no keepers means the board should look like public ADP."""
    cfg = base_config()
    order = K.build_true_pick_order(cfg, {})
    pool = make_pool()
    out = K.adjusted_adp(pool, order, cfg, kept_ids=set())
    diffs = [abs(p["adjusted_adp"] - p["raw_adp"]) for p in out[:120]]
    assert max(diffs) < 1.0, f"largest drift {max(diffs)} — adjusted ADP should track raw ADP with no keepers"


def test_full_keeper_slate_shifts_my_picks_and_removes_kept_players():
    """12 teams x 3 keepers = 36 kept players and 36 forfeited picks."""
    cfg = base_config()
    pool = make_pool()
    keepers_by_team, kept_ids = {}, set()
    idx = 0
    for slot in range(1, cfg["teams"] + 1):
        ks = []
        for round_cost in (1, 2, 3):
            p = pool[idx]; idx += 1
            ks.append({"player_id": p["player_id"], "name": p["name"],
                       "position": p["position"], "original_round": round_cost})
            kept_ids.add(p["player_id"])
        keepers_by_team[slot] = ks
    assert len(kept_ids) == 36

    order = K.build_true_pick_order(cfg, keepers_by_team)

    # Every team gave up rounds 1-3, so the real draft starts at round 4.
    assert len(order.forfeited) == 36
    assert all(p["round"] >= 4 for p in order.picks)
    assert len(order.picks) == len(K.draft_order(cfg["teams"], cfg["rounds"], "snake")) - 36

    # My pick numbers shift. Rounds 1-3 are gone, so the draft opens on round 4,
    # which snakes backward (12->1), putting slot 4 ninth. Before keepers I was
    # picking 4th overall; now my first selection is overall 9 of the real draft
    # — the exact shift the tool exists to compute.
    assert order.my_original_picks[0] == 4
    assert order.my_picks[0] == 9
    assert order.picks[order.my_picks[0] - 1]["round"] == 4
    assert order.picks[order.my_picks[0] - 1]["team_slot"] == cfg["my_draft_slot"]
    # One pick per surviving round, and the gap between them snakes.
    assert len(order.my_picks) == cfg["rounds"] - 3

    # No kept player can be drafted.
    out = K.adjusted_adp(pool, order, cfg, kept_ids)
    assert not (kept_ids & {p["player_id"] for p in out})
    assert len(out) == len(pool) - 36


def test_keeper_cost_models():
    cfg = base_config(keepers={"count": 3, "cost_model": "escalator", "escalator_rounds": 2,
                               "max_years": 3, "undrafted_rule": "assigned_round", "undrafted_round": 12})
    k = {"player_id": "1", "original_round": 8, "years_kept": 2}
    assert K.keeper_cost_round(k, cfg) == 4          # 8 - 2*2

    cfg_fixed = base_config(keepers={"count": 3, "cost_model": "fixed_round", "fixed_round": 5,
                                     "undrafted_rule": "ineligible"})
    assert K.keeper_cost_round({"player_id": "1", "original_round": 9}, cfg_fixed) == 5

    cfg_none = base_config(keepers={"count": 3, "cost_model": "no_cost", "undrafted_rule": "ineligible"})
    assert K.keeper_cost_round({"player_id": "1"}, cfg_none) is None

    cfg_undrafted = base_config()
    assert K.keeper_cost_round({"player_id": "999"}, cfg_undrafted) == 10   # undrafted_round

    cfg_strict = base_config(keepers={"count": 3, "cost_model": "original_round",
                                      "undrafted_rule": "ineligible"})
    with pytest.raises(ValueError):
        K.keeper_cost_round({"player_id": "999", "name": "Waiver Guy"}, cfg_strict)


def test_two_keepers_costing_same_round_roll_forward():
    """A team can't forfeit one pick twice; the second rolls to the next round."""
    cfg = base_config()
    order = K.build_true_pick_order(cfg, {1: [
        {"player_id": "a", "original_round": 5},
        {"player_id": "b", "original_round": 5},
    ]})
    rounds = sorted(f["cost_round"] for f in order.forfeited)
    assert rounds == [5, 6]


# ------------------------------------------------------------------- survival
def test_survival_declines_monotonically():
    probs = [K.survival_probability(40, pick) for pick in range(1, 120, 5)]
    assert all(a >= b for a, b in zip(probs, probs[1:])), "survival must never increase with pick number"
    assert probs[0] > 0.95 and probs[-1] < 0.05


def test_survival_sd_grows_with_adp():
    assert K.adp_sd_for(10) == pytest.approx(3.0)     # floor
    assert K.adp_sd_for(100) == pytest.approx(22.0)   # 0.22 x adp
    assert K.adp_sd_for(100, provided=8) == 8.0


# ----------------------------------------------------------------- VORP/tiers
def test_replacement_level_uses_last_starter_and_flex_allocation():
    cfg = base_config()
    pool = make_pool(300)
    scored, diag = V.apply_vorp(pool, cfg)
    counts = diag["starter_counts"]
    # 12 teams x 2 RB = 24 dedicated, plus some share of the 12 FLEX slots.
    assert counts["RB"] >= 24 and counts["WR"] >= 24
    assert sum(counts[p] for p in ("RB", "WR", "TE")) == 24 + 24 + 12 + 12
    # A top player must out-VORP a replacement-level one.
    assert scored[0]["vorp"] > 0
    assert any(abs(p["vorp"]) < 5 for p in scored)


def test_tiers_break_on_real_cliffs():
    players = [
        {"player_id": str(i), "position": "RB", "proj_mean": v}
        for i, v in enumerate([300, 298, 295, 250, 248, 246, 200], start=1)
    ]
    V.assign_tiers(players)
    tiers = [p["tier"] for p in sorted(players, key=lambda p: -p["proj_mean"])]
    assert tiers[0] == tiers[1] == tiers[2], "the top three are one tier"
    assert tiers[3] > tiers[0], "a 45-point gap must start a new tier"
