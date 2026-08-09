"""EXP 36 pure core — the ADP-efficiency surface, verifiable WITHOUT egress.

The egress (FFC ADP + nflverse realized) runs in CI; the ANALYSIS — cell
statistics, the floor/thin rule, the efficiency->shrink mapping, the surface
assembly, the tier-cliff detector — is pure and tested here against fixtures, so a
bug in the reliability surface is caught in the sandbox, not in a CI number the
Anchor Doctrine then consumes as a shrinkage weight.

Run: python -m pytest draft/tests/test_exp36.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp36 as E  # noqa: E402


def test_round_bands_and_clamp():
    assert E.round_band(1) == "r1-3"
    assert E.round_band(7) == "r4-7"
    assert E.round_band(12) == "r12+"
    assert E.round_band(None) is None
    assert E.clamp01(-0.4) == 0.0
    assert E.clamp01(1.7) == 1.0
    assert E.clamp01(0.6) == 0.6


def test_thin_cell_defaults_to_full_anchor_no_rank():
    # below the floor -> thin, no efficiency, shrink defaults to the conservative 1.0
    players = [{"adp": i, "realized": 100 - i} for i in range(E.CELL_FLOOR - 1)]
    st = E.cell_stats(players)
    assert st["thin"] is True and st["ranked"] is False
    assert st["efficiency"] is None
    assert st["shrink"] == E.THIN_SHRINK == 1.0


def test_efficient_cell_high_shrink():
    # ADP perfectly orders realized (lower adp -> higher realized): rho ~ +1 -> shrink ~1
    players = [{"adp": i + 1, "realized": 300 - 10 * i} for i in range(12)]
    st = E.cell_stats(players)
    assert st["ranked"] is True
    assert st["efficiency"] > 0.9
    assert st["shrink"] > 0.9
    assert st["verdict"] == "efficient"


def test_inefficient_cell_low_shrink():
    # ADP ANTI-correlated with realized (market backwards here) -> rho negative -> shrink 0
    players = [{"adp": i + 1, "realized": 10 * i} for i in range(12)]  # low adp -> low realized
    st = E.cell_stats(players)
    assert st["ranked"] is True
    assert st["efficiency"] < 0
    assert st["shrink"] == 0.0            # clamped: a backwards market earns no anchor
    assert st["verdict"] == "inefficient"


def test_cell_ci_present_and_ordered_when_ranked():
    players = [{"adp": i + 1, "realized": 300 - 10 * i + (i % 3)} for i in range(15)]
    st = E.cell_stats(players)
    lo, hi = st["efficiency_ci"]
    assert lo <= hi


def test_build_surface_shape_and_counts():
    # two full cells: an efficient R1-3 RB cell and a thin R12+ K cell
    picks = []
    picks += [{"round": 2, "position": "RB", "adp": i + 1, "realized": 300 - 8 * i} for i in range(10)]
    picks += [{"round": 13, "position": "K", "adp": 150 + i, "realized": 90 - i} for i in range(3)]
    surf = E.build_surface(picks)
    assert set(surf["cells"].keys()) == {b[0] for b in E.ROUND_BANDS}
    rb = surf["cells"]["r1-3"]["RB"]
    assert rb["ranked"] is True and rb["n"] == 10
    k = surf["cells"]["r12+"]["K"]
    assert k["ranked"] is False and k["n"] == 3
    assert surf["n_cells_ranked"] >= 1
    assert surf["n_picks"] == 13


def test_position_pooling_gathers_across_rounds():
    picks = ([{"round": 1, "position": "WR", "adp": i + 1, "realized": 200 - 5 * i} for i in range(5)] +
             [{"round": 6, "position": "WR", "adp": 50 + i, "realized": 120 - 3 * i} for i in range(6)])
    pooled = E.position_group_pooling(picks)
    assert pooled["WR"]["n"] == 11        # pooled across both rounds -> clears the floor
    assert pooled["WR"]["ranked"] is True


def test_tier_cliffs_flags_a_real_gap():
    # a clean cliff: top 3 elite, then a big drop, then a smooth tail
    realized = [300, 295, 290, 200, 195, 190, 185, 180]   # drop of 90 after rank 3
    picks = [{"position": "RB", "adp": i + 1, "realized": realized[i]} for i in range(len(realized))]
    t = E.tier_cliffs(picks, "RB")
    assert t["thin"] is False
    assert any(c["after_adp_rank"] == 3 for c in t["cliffs"]), t["cliffs"]


def test_qb_format_summary_reports_both_currencies():
    rows = [{"adp": i + 1, "realized_6pt": 300 - 5 * i, "realized_4pt": 250 - 5 * i} for i in range(10)]
    qf = E._qb_format_summary(rows)
    assert qf["n"] == 10
    assert "efficiency_6pt_our_league" in qf and "efficiency_4pt_adp_source" in qf
    assert qf["delta"] == round(qf["efficiency_6pt_our_league"] - qf["efficiency_4pt_adp_source"], 3)
