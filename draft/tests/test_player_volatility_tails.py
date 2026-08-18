# TERRITORY: A
"""PREREG §2, WIRED: the tails carry the player's own realized volatility.

Cory's order, verbatim: "fix!!!! floors and ceilings need to be corrected like
I have agreed to." The construction is VOLATILITY-WIRING-PREREG.md §2 and every
test here checks a clause the prereg DECLARED before any number existed:

  1. within a cell, a volatile player out-ceilings a steady one (the point);
  2. f preserves the cell mean (the §2 gate — "a gate, not a diagnostic");
  3. a player with no 2025 cv keeps his CELL constant, and the _source stamp
     says which construction he got (§3's absent-population rule);
  4. the floor moves opposite the ceiling (one f, divided);
  5. flag off → byte-identical to the cell-constant board (reversibility).

Every test feeds real rows through the real blend() — no source-substring
assertions; that lesson is written on test_calibration_population.py.

Run: python3 -m pytest draft/tests/test_player_volatility_tails.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import projections as PJ  # noqa: E402


def _mk(pid, pos, mean):
    return {"player_id": pid, "position": pos, "proj_mean": mean,
            "years_exp": 4, "depth_chart_order": 1}


def _pool():
    """40 RBs so bands 1-3 through 33+ populate against the real calibration."""
    return [_mk(f"rb{i}", "RB", 250 - i * 4) for i in range(40)]


def _run(cv_map, flag=True):
    players = _pool()
    baseline = {p["player_id"]: p["proj_mean"] for p in players}
    cfg = {"opportunity_cap": 0.0, "use_measured_ceiling": True,
           "player_volatility_in_tails": flag}
    orig = PJ._weekly_cv_2025
    PJ._weekly_cv_2025 = lambda: cv_map
    try:
        PJ.blend(players, baseline, {}, cfg)
    finally:
        PJ._weekly_cv_2025 = orig
    return {p["player_id"]: p for p in players}


# Ranks 9-16 land in one measured cell; give them a real cv spread.
CVS = {f"rb{i}": cv for i, cv in zip(range(8, 16),
       [0.35, 0.80, 0.50, 0.55, 0.60, 0.45, 0.65, 0.40])}


def test_a_volatile_player_out_ceilings_a_steady_one_in_the_same_cell():
    rows = _run(CVS)
    steady, volatile = rows["rb8"], rows["rb9"]  # cv 0.35 vs 0.80, same cell
    r_steady = steady["proj_ceiling"] / steady["proj_mean"]
    r_vol = volatile["proj_ceiling"] / volatile["proj_mean"]
    assert r_vol > r_steady * 1.2, (
        f"ceiling/mean {r_vol:.3f} vs {r_steady:.3f}: a cv of 0.80 against 0.35 "
        "must separate two players the cell constant made interchangeable")
    assert volatile["proj_floor"] < steady["proj_floor"], (
        "the same volatility that raises his ceiling must lower his floor")


def test_the_cell_mean_is_preserved_the_section_2_gate():
    with_f = _run(CVS)
    without = _run({}, flag=True)  # empty cv map → every player on cell constant
    cell = [f"rb{i}" for i in range(8, 16)]
    m_with = sum(with_f[k]["proj_ceiling"] for k in cell) / len(cell)
    m_without = sum(without[k]["proj_ceiling"] for k in cell) / len(cell)
    # f is mean-normalized on the ratio, not on mean×f — exact preservation is
    # of f itself; on the ceiling it holds to within a few points because f is
    # independent of the within-cell mean gradient. 2% is the gate.
    assert abs(m_with - m_without) / m_without < 0.02, (
        f"cell mean moved {m_without:.1f} -> {m_with:.1f}: f is a level shift "
        "wearing a dispersion change's clothes — the exact §2 failure")


def test_absent_stays_absent_and_the_source_stamp_says_so():
    rows = _run(CVS)
    carrier, absent = rows["rb9"], rows["rb20"]
    assert carrier["proj_ceiling_source"] == "measured-2023-25-p90-x-player-cv"
    assert carrier["proj_floor_source"] == "measured-2023-25-p10-x-player-cv"
    assert absent["proj_ceiling_source"] == "measured-2023-25-p90", (
        "a player with no 2025 cv must keep the cell constant AND its original "
        "stamp — one field name holding two constructions unlabelled is the "
        "exact 2027 failure the _source fields exist to prevent")
    # And the absent player's number is the cell constant, not a filled-in f.
    without = _run({}, flag=True)
    assert absent["proj_ceiling"] == without["rb20"]["proj_ceiling"]


def test_flag_off_is_byte_identical_reversibility():
    on_empty = _run(CVS, flag=False)
    plain = _run({}, flag=False)
    for k in on_empty:
        assert on_empty[k]["proj_ceiling"] == plain[k]["proj_ceiling"]
        assert on_empty[k]["proj_floor"] == plain[k]["proj_floor"]
        assert on_empty[k]["proj_ceiling_source"] == plain[k]["proj_ceiling_source"]


def test_the_config_actually_carries_the_flag():
    """The wiring is inert unless league_config turns it on — this pins the
    live build's behaviour, not just the function's capability."""
    import json
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    assert cfg.get("player_volatility_in_tails") is True, (
        "Cory ordered this fix ON ('fix!!!! floors and ceilings need to be "
        "corrected like I have agreed to'); the flag being off means the board "
        "quietly reverted to cell constants")
    assert cfg.get("use_measured_ceiling") is True, (
        "player_volatility_in_tails composes ON TOP of the measured cell "
        "p90/p10 — without it the f never applies")


def test_4w_the_weekly_ratio_is_season_rescaled_and_nothing_impossible_prints():
    """Register 4w: the unscaled weekly f put 31 physically impossible ceilings
    on the board (Gibbs 679 vs best-ever RB season 437). Two pins:
    (1) the applied multiplier is 1+(f-1)/sqrt(G), not f, so a wildly volatile
    player moves his ceiling by percents, not by a factor;
    (2) no ceiling exceeds the measured best-season-plus-headroom rail."""
    rows = _run(CVS)
    volatile = rows["rb9"]  # cv 0.80 vs cell median ~0.525 → raw f ≈ 1.4+
    r_vol = volatile["proj_ceiling"] / volatile["proj_mean"]
    cell = _run({}, flag=True)["rb9"]["proj_ceiling"] / rows["rb9"]["proj_mean"]
    assert r_vol < cell * 1.20, (
        f"ceiling ratio {r_vol:.3f} vs cell {cell:.3f}: a weekly cv ratio "
        "applied unscaled to a season — the exact 4w failure")
    for p in rows.values():
        cap = PJ.PLAUSIBILITY_CEILING.get(p["position"])
        if cap:
            assert p["proj_ceiling"] <= cap + 0.01, (
                f"{p['player_id']} ceiling {p['proj_ceiling']} exceeds the "
                f"{p['position']} plausibility rail {cap}")


def test_4w_the_rail_bases_match_the_committed_stores():
    """The rail is MEASURED (best realized season per position, our scoring,
    2023-25) x 1.20 declared headroom. This regenerates the bases from the
    stores so the constant cannot rot when a season is added."""
    import json
    idx = json.loads((ROOT / "draft" / "backtest" /
                      "sleeper_name_index.json").read_text())["index"]
    pos_of = {str(v["player_id"]): (v.get("position") or "").upper()
              for v in idx.values()}
    best = {}
    for season in (2023, 2024, 2025):
        d = json.loads((ROOT / "draft" / "backtest" /
                        f"nflverse_weekly_points_{season}.json").read_text())
        tot = {}
        for wk in d["weeks"]:
            for pid, pts in (wk.get("points") or {}).items():
                tot[pid] = tot.get(pid, 0) + pts
        for pid, t in tot.items():
            po = pos_of.get(pid)
            if po and t > best.get(po, 0):
                best[po] = t
    for pos in ("QB", "RB", "WR", "TE"):
        expect = round(best[pos] * 1.20)
        assert abs(PJ.PLAUSIBILITY_CEILING[pos] - expect) <= 1.5, (
            f"{pos} rail {PJ.PLAUSIBILITY_CEILING[pos]} vs stores-derived "
            f"{expect} — regenerate the constant, a season moved the base")
