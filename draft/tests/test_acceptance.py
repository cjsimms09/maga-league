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

    # MY PICK NUMBERS DO NOT SHIFT, AND THIS BLOCK USED TO SAY THEY DID.
    #
    # It asserted `my_picks[0] == 9` — round 4 opens the real draft, snakes
    # backward 12->1, slot 4 is ninth — and called that "the exact shift the tool
    # exists to compute". The shift is not real. Sleeper leaves a forfeited pick
    # in place, occupied by the keeper, and nothing after it moves up: this
    # league's own log shows 150 picks and round 4 beginning at overall 31 in
    # 2023 (0 keepers), 2024 (23) and 2025 (20) alike.
    #
    # So my first live pick is round 4 at my slot on the ORIGINAL board: round 4
    # is EVEN, the snake reverses, slot 4 is the (teams+1-4)-th pick of the
    # round. With 12 teams that is 3*12 + 9 = 45.
    teams = cfg["teams"]
    assert order.my_original_picks[0] == 4
    assert order.my_picks[0] == 3 * teams + (teams + 1 - cfg["my_draft_slot"]) == 45
    # The BOARD keeps every slot; only the LIVE list is shorter.
    assert len(order.board) == len(K.draft_order(cfg["teams"], cfg["rounds"], "snake"))
    board_row = next(p for p in order.board if p["overall"] == order.my_picks[0])
    assert board_row["round"] == 4
    assert board_row["slot"] == cfg["my_draft_slot"]
    assert board_row["keeper_slot"] is False
    # CONTROL — 36 keepers is a large enough slate that the old renumbering
    # really would have moved this, so the equality above is not trivially true.
    assert order.my_picks[0] - 36 == 9
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
    """THIS TEST WAS PINNING THE DEFECT (2026-08-13, routed by C).

    It asserted `adp_sd_for(100) == 22.0` — the old python-only rate — while
    survival.js had moved to 0.15 with a cap. So the one test covering this
    function was GUARDING the half of the two-place change that never happened,
    and would have gone red on the fix rather than on the bug.

    The literals are gone rather than updated. A hardcoded 15.0 here would just
    be a THIRD place the constant lives, and the next edit would leave one of
    the three behind exactly as before. The assertions are now on BEHAVIOUR —
    floor, rate, cap, and provided-wins — with the values coming from the module
    under test. Cross-language agreement is pinned separately, and properly, in
    test_survival_parity.py, which reads survival.js rather than trusting a
    number copied out of it.
    """
    assert K.adp_sd_for(10) == pytest.approx(K.ADP_SD_FLOOR)          # floor binds low
    assert K.adp_sd_for(60) == pytest.approx(K.ADP_SD_RATE * 60)      # rate binds mid
    assert K.adp_sd_for(1000) == pytest.approx(K.ADP_SD_CAP)          # cap binds high
    assert K.adp_sd_for(100, provided=8) == 8.0                       # a real sd wins
    # And the three regimes are genuinely distinct, so this cannot pass on a
    # degenerate config where floor == cap and every branch returns the same
    # number — which is how a three-branch assertion becomes a one-branch one.
    assert K.ADP_SD_FLOOR < K.ADP_SD_RATE * 60 < K.ADP_SD_CAP


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


# --- draft slot changes (asked directly: "will this adapt if my position
#     changes?") --------------------------------------------------------------

def test_pick_order_is_slot_independent_except_for_my_picks():
    """The client can re-derive my picks because `picks` carries the owning slot.

    This is what makes a late draft-spot change survivable without a rebuild:
    the true pick sequence after keeper forfeits is the same for everyone, and
    "which of them are mine" is a filter over it.
    """
    cfg = {
        "teams": 10, "rounds": 5, "draft_type": "snake",
        "roster_size": 8, "keepers": {"count": 3, "cost_model": "original_round"},
        "my_draft_slot": 4,
    }
    keeps = {1: [{"player_id": "a", "original_round": 2}]}
    order4 = K.build_true_pick_order(cfg, keeps)

    cfg9 = dict(cfg, my_draft_slot=9)
    order9 = K.build_true_pick_order(cfg9, keeps)

    # Same sequence, same forfeits — only the ownership filter differs.
    assert [p["overall"] for p in order4.picks] == [p["overall"] for p in order9.picks]
    assert order4.my_picks != order9.my_picks

    # And the filter the client applies reproduces the pipeline exactly.
    derived9 = [p["overall"] for p in order4.picks if p["team_slot"] == 9]
    assert derived9 == order9.my_picks


def test_slot_change_survives_keeper_forfeits():
    """A team that forfeits picks must not shift anyone else's derived picks."""
    cfg = {
        "teams": 10, "rounds": 6, "draft_type": "snake",
        "roster_size": 9, "keepers": {"count": 3, "cost_model": "original_round"},
        "my_draft_slot": 1,
    }
    keeps = {
        3: [{"player_id": "x", "original_round": 1}, {"player_id": "y", "original_round": 2}],
        7: [{"player_id": "z", "original_round": 4}],
    }
    order = K.build_true_pick_order(cfg, keeps)
    for slot in range(1, 11):
        cfg_s = dict(cfg, my_draft_slot=slot)
        expected = K.build_true_pick_order(cfg_s, keeps).my_picks
        derived = [p["overall"] for p in order.picks if p["team_slot"] == slot]
        assert derived == expected, f"slot {slot} mismatch"


# --- Per-player variance / UpsideBonus (audit P1.7) -------------------------
# The audit asked for a test that "should currently FAIL — that's the point":
# within a position, UpsideBonus ordering must differ from proj_mean ordering.
# Against the real board it did fail: Spearman was exactly 1.0000 at every
# position, with (ceiling - mean) / mean a literal constant.

import projections as PJ  # noqa: E402


def _mk(pid, pos, proj, **kw):
    return dict({"player_id": pid, "position": pos, "proj_mean": proj,
                 "years_exp": 4, "age": 25}, **kw)


def test_bellcow_and_committee_backs_do_not_share_a_ceiling():
    bell = _mk("a", "RB", 200)
    comm = _mk("b", "RB", 200)
    v_bell, why_bell = PJ.player_variance(bell, {"opportunity_share": 0.28})
    v_comm, why_comm = PJ.player_variance(comm, {"opportunity_share": 0.04})
    assert v_bell < v_comm, "a bell-cow must be less volatile than a committee back"
    assert why_bell and why_comm, "each modifier explains itself"


def test_rookies_and_backups_carry_more_variance():
    starter = _mk("a", "WR", 150, years_exp=5, depth_chart_order=1)
    rookie = _mk("b", "WR", 150, years_exp=0, depth_chart_order=1)
    backup = _mk("c", "WR", 150, years_exp=5, depth_chart_order=3)
    base, _ = PJ.player_variance(starter, {})
    assert PJ.player_variance(rookie, {})[0] > base
    assert PJ.player_variance(backup, {})[0] > base


def test_variance_multiplier_is_clamped():
    worst = _mk("x", "RB", 100, years_exp=0, depth_chart_order=4,
                injury_status="Questionable", age=33)
    v, _ = PJ.player_variance(worst, {"opportunity_share": 0.01})
    assert v <= PJ.POSITION_VARIANCE["RB"] * PJ.VAR_MULT_MAX + 1e-9
    best = _mk("y", "RB", 100, years_exp=6, depth_chart_order=1, age=24)
    v2, _ = PJ.player_variance(best, {"opportunity_share": 0.35})
    assert v2 >= PJ.POSITION_VARIANCE["RB"] * PJ.VAR_MULT_MIN - 1e-9


def test_upside_ordering_now_differs_from_projection_ordering():
    """THE test from the audit, re-derived for REC-1 (2026-08-15).

    The original degeneracy: ceiling - mean was mean x ONE constant across the
    whole position, so upside ordering WAS projection ordering everywhere. Two
    successive fixes broke it two different ways, and this test now pins both:

    - MEASURED path (REC-1, Cory's ruling): sd/mean varies BY RANK BAND — the
      measured 2023-25 table gives deep bands wider relative spread than the
      top (RB 33+ 0.666 vs RB 1-3 0.492), so across bands the ceiling ordering
      diverges from the mean ordering. WITHIN a measured band the ratio is
      deliberately flat: that is what was measured, and the hand-set per-player
      modifiers do not override a measurement (every intuition-based term added
      to this model failed measurement — draft_plan's own record).
    - FALLBACK path (no calibration on disk): the per-player variance modifiers
      still differentiate a committee rookie from a bell-cow, exactly as the
      audit's original fix built.
    """
    cfg = {"opportunity_cap": 0.15}

    def mkset():
        players = [
            _mk("bell", "RB", 210, years_exp=5, depth_chart_order=1),
            _mk("comm", "RB", 205, years_exp=0, depth_chart_order=2),
            _mk("mid", "RB", 200, years_exp=4, depth_chart_order=1),
            # a deep-band back: measured RB|33+ carries a WIDER relative band
            # than RB|1-3, so his ceiling-minus-mean can outrank a top back's
            # despite a fraction of the projection.
            *[_mk(f"deep{i}", "RB", 190 - i * 3, years_exp=4, depth_chart_order=1)
              for i in range(35)],
        ]
        baseline = {p["player_id"]: p["proj_mean"] for p in players}
        metrics = {"bell": {"opportunity_share": 0.30},
                   "comm": {"opportunity_share": 0.03},
                   "mid": {"opportunity_share": 0.15}}
        return players, baseline, metrics

    # ── measured path: band structure breaks the global tie ─────────────────
    players, baseline, metrics = mkset()
    PJ.blend(players, baseline, metrics, cfg)
    assert players[0]["proj_sd_source"] == "measured-2023-25-error"
    ratios = {p["player_id"]: (p["proj_ceiling"] - p["proj_mean"]) / p["proj_mean"]
              for p in players}
    assert len({round(v, 4) for v in ratios.values()}) > 1, (
        "ceiling - mean collapsed back to mean x ONE constant — the original "
        "degeneracy this test exists to block")
    by_mean = [p["player_id"] for p in sorted(players, key=lambda x: -x["proj_mean"])]
    by_upside = [p["player_id"] for p in
                 sorted(players, key=lambda x: -(x["proj_ceiling"] - x["proj_mean"]))]
    assert by_mean != by_upside, "upside ordering is still just projection ordering"

    # ── fallback path: the per-player modifiers still do their work ─────────
    players, baseline, metrics = mkset()
    import unittest.mock as _mock
    with _mock.patch.object(PJ, "_sd_calibration", lambda: None):
        PJ.blend(players, baseline, metrics, cfg)
    assert players[0]["proj_sd_source"] == "position_variance"
    by_upside_fb = [p["player_id"] for p in
                    sorted(players, key=lambda x: -(x["proj_ceiling"] - x["proj_mean"]))]
    # the committee rookie outranks the bell-cow on ceiling despite a lower
    # projection — the whole point of the per-player term, alive on this path.
    assert by_upside_fb.index("comm") < by_upside_fb.index("bell")


# ---------------------------------------------------------------------------
# Provenance must agree with the data it describes.
# ---------------------------------------------------------------------------

def test_provenance_disagreeing_with_data_fails_the_build():
    """A label that can disagree with its own data is decoration, not a guarantee.

    The fixture artifact shipped with provenance.opportunity_adjustment
    'DISABLED', notes.opportunity_applied True, and opportunity_adj None on
    every one of 203 players. Three claims about one thing, two of them wrong,
    and the wrong one was the COMPUTED one — which is worse, because computed
    reads like proof.
    """
    import build as B

    # Claims ok, data says the adjustment never touched a projection.
    art = {"provenance": {"opportunity_adjustment": "ok"}}
    players = [{"player_id": "1", "opportunity_adj": None},
               {"player_id": "2", "opportunity_adj": None}]
    with pytest.raises(SystemExit) as e:
        B._assert_provenance_matches_data(players, art)
    assert "PROVENANCE DISAGREES WITH THE DATA" in str(e.value)

    # Claims DISABLED, data says it plainly ran. The other direction, which is
    # the one the shipped fixture actually exhibited.
    art2 = {"provenance": {"opportunity_adjustment": "DISABLED — offline build"}}
    live = [{"player_id": "1", "opportunity_adj": 0.07}]
    with pytest.raises(SystemExit):
        B._assert_provenance_matches_data(live, art2)


def test_provenance_agreeing_with_data_passes_and_records_both():
    import build as B
    art = {"provenance": {"opportunity_adjustment": "ok"}}
    players = [{"player_id": "1", "opportunity_adj": 0.05},
               {"player_id": "2", "opportunity_adj": -0.02}]
    B._assert_provenance_matches_data(players, art)
    assert art["provenance"]["opportunity_claimed_ok"] is True
    assert art["provenance"]["opportunity_observed_in_data"] is True

    art2 = {"provenance": {"opportunity_adjustment": "DISABLED — offline build"}}
    off = [{"player_id": "1", "opportunity_adj": None}]
    B._assert_provenance_matches_data(off, art2)
    assert art2["provenance"]["opportunity_claimed_ok"] is False
    assert art2["provenance"]["opportunity_observed_in_data"] is False


def test_the_RULED_cap_zero_board_is_buildable():
    """Run 32042127531: the first build ever to carry Cory's opportunity_cap
    0.0 (every earlier nightly had the cap erased back to 0.15 by the
    config-rewrite bug). blend() ran and wrote adj == 0.0 on every player —
    the adjustment reached every projection, multiplying by 1+0.0 — and the
    metrics status was honestly "ok". The asserter's truthiness read called
    the zeros "never ran" and refused the ruled state as a provenance lie.
    A falsy value is a decision, not an absence — the same rule
    test_config_local_rulings_survive pins for config keys."""
    import build as B
    art = {"provenance": {"opportunity_adjustment": "ok"}}
    ruled_off = [{"player_id": "1", "opportunity_adj": 0.0},
                 {"player_id": "2", "opportunity_adj": 0.0}]
    B._assert_provenance_matches_data(ruled_off, art)      # must NOT raise
    assert art["provenance"]["opportunity_observed_in_data"] is True

    # The refusal this asserter exists for still fires: claims ok, field
    # genuinely absent (blend never ran).
    never_ran = [{"player_id": "1", "opportunity_adj": None}]
    with pytest.raises(SystemExit):
        B._assert_provenance_matches_data(never_ran, {"provenance": {"opportunity_adjustment": "ok"}})


def test_opportunity_applied_reads_the_field_that_proves_it():
    """`opportunity_z` is the INPUT to the adjustment, not evidence of it.

    A fixture can populate z without ever calling blend(). Only
    `opportunity_adj` is set in the same statement that applies the adjustment
    to the projection, so only it can prove the adjustment happened.
    """
    src = (Path(__file__).resolve().parent.parent / "build.py").read_text()
    i = src.index('"opportunity_applied"')
    line = src[i:src.index("\n", i)]
    assert "opportunity_adj" in line, line
    assert "opportunity_z" not in line, line
