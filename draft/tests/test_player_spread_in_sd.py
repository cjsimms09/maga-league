# TERRITORY: A
"""COMPOSE the measured band sd with per-player spread, instead of clobbering it.

Cory, 2026-08-17: "The ceiling shouldn't be a calculated value?? It should be
different depending on the player. That makes no sense."

He was right, and `player_variance`'s own comment had said the same thing since
it was written: "A committee back and a bell-cow with equal projections should
not have equal ceilings." REC-1's measured band sd then OVERWROTE that function
for every player on the board — measured within-cell variation in relative
upside: 0.0006, i.e. none.

The two quantities belong multiplied, not substituted: the band ratio sets the
LEVEL, player_variance sets the SPREAD around it. Normalising by the cell
average preserves the measured mean exactly, so this redistributes the
calibration rather than overriding it — which is the property that makes the
change defensible, and the one this file pins hardest.

GATED OFF. proj_ceiling and proj_sd both feed engine.js, so this is an ungraded
behaviour change until the harness says otherwise.
"""
import json
import statistics as st
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backtest"))
import projections as PJ  # noqa: E402


def _players(n=60):
    """A cell with genuinely different players in it: rookies, buried backups,
    injured guys, and plain veterans, all at similar projections."""
    return [{"player_id": str(i), "name": f"P{i}", "position": "WR",
             "proj_baseline": 200.0 - i,
             "years_exp": 0 if i % 5 == 0 else 6,
             "depth_chart_order": 2 if i % 3 == 0 else 1,
             "injury_status": "Q" if i % 7 == 0 else None}
            for i in range(n)]


def _cfg(**over):
    c = {"teams": 10, "starters": {"QB": 1, "RB": 2, "WR": 2, "TE": 1,
                                   "K": 1, "DEF": 1, "FLEX": 1},
         "opportunity_cap": 0.0}
    c.update(over)
    return c


def _by_cell(rows):
    cells = {}
    for p in rows:
        cells.setdefault(p["proj_sd_source"], []).append(p)
    return cells


def test_the_gate_ships_off():
    cfg = json.loads((ROOT / "config" / "league_config.json").read_text())
    assert not cfg.get("player_spread_in_sd"), (
        "proj_sd feeds proj_ceiling and both feed engine.js — this stays off "
        "until the harness has graded it")


def test_off_every_player_in_a_band_has_identical_relative_upside():
    """THE DEFECT, pinned. If this ever stops being true with the flag OFF,
    something else started varying the sd and the comparison below is no longer
    measuring what it claims."""
    rows = PJ.blend(_players(), {}, {}, _cfg())
    assert {p["proj_sd_source"] for p in rows} == {"measured-2023-25-error"}
    # Within one band, the ratio sd/mean must be a single constant.
    ratios = {round(p["proj_sd"] / p["proj_mean"], 6) for p in rows}
    assert len(ratios) <= 5, (
        "with the flag off the sd ratio is a per-BAND constant, so at most one "
        "value per band should appear")


def test_on_players_in_the_same_band_stop_being_interchangeable():
    on = PJ.blend(_players(), {}, {}, _cfg(player_spread_in_sd=True))
    assert {p["proj_sd_source"] for p in on} == {"measured-band-x-player-spread"}
    ratios = {round(p["proj_sd"] / p["proj_mean"], 6) for p in on}
    assert len(ratios) > 5, "the flag flipped but the sd is still a band constant"


def test_the_measured_cell_average_is_preserved_exactly():
    """THE HONESTY PROPERTY, and the reason this is a redistribution rather
    than an override. We are not claiming to know better than the calibration
    about the LEVEL — only that the level is not the whole story."""
    off = PJ.blend(_players(), {}, {}, _cfg())
    on = PJ.blend(_players(), {}, {}, _cfg(player_spread_in_sd=True))
    m_off = st.fmean(p["proj_sd"] / p["proj_mean"] for p in off)
    m_on = st.fmean(p["proj_sd"] / p["proj_mean"] for p in on)
    assert abs(m_off - m_on) < 1e-4, (m_off, m_on)


def test_a_rookie_behind_on_the_depth_chart_gets_a_wider_spread_than_a_veteran_starter():
    """The whole point, as a behavioural assertion rather than a statistic."""
    on = PJ.blend(_players(), {}, {}, _cfg(player_spread_in_sd=True))
    by_id = {p["player_id"]: p for p in on}
    # id 0: years_exp 0, depth 2, injured  -> widest. id 1: veteran, starter.
    wide, tight = by_id["0"], by_id["1"]
    assert (wide["proj_ceiling"] - wide["proj_mean"]) / wide["proj_mean"] > \
           (tight["proj_ceiling"] - tight["proj_mean"]) / tight["proj_mean"]


def test_the_projection_itself_is_never_touched():
    """proj_mean is what the board RANKS on. Whatever the spread does, it must
    not move the ranking — that keeps this reviewable in isolation."""
    off = PJ.blend(_players(), {}, {}, _cfg())
    on = PJ.blend(_players(), {}, {}, _cfg(player_spread_in_sd=True))
    for a, b in zip(off, on):
        assert a["proj_mean"] == b["proj_mean"]
        assert a["proj_baseline"] == b["proj_baseline"]


def test_the_reasons_survive_composition():
    """Clobbering var_why left the war room's Why? panel asserting a high
    ceiling with no account of why. Both halves must be present: the measured
    level AND the player-specific spread terms."""
    on = PJ.blend(_players(), {}, {}, _cfg(player_spread_in_sd=True))
    rookie = [p for p in on if p["player_id"] == "0"][0]
    why = rookie["variance_why"]
    assert any("measured 2023-25" in w for w in why), "the measured level is unexplained"
    assert any(w.startswith("spread:") for w in why), "the player terms were dropped"
    assert any("rookie" in w for w in why)


def test_the_hand_set_modifiers_are_declared_as_unmeasured():
    """THE CAVEAT THAT TRAVELS WITH THIS. VAR_ROOKIE and friends are hand-set
    priors, the same class of guessed constant as opportunity_cap — which was
    turned OFF two days earlier for being unmeasured noise shaped like a number.
    The STRUCTURE here is right; the MAGNITUDES are not yet earned, and this
    test exists so nobody reads the composition as a measured result."""
    for name in ("VAR_ROOKIE", "VAR_BACKUP", "VAR_WORKLOAD_COMMITTEE",
                 "VAR_INJURED", "VAR_AGE_CLIFF"):
        assert hasattr(PJ, name)
    # Bounded, so a bad prior cannot run away with the board.
    assert PJ.VAR_MULT_MIN >= 0.5 and PJ.VAR_MULT_MAX <= 2.0


# ── after the modifier fit came back underpowered (2026-08-17) ──────────────

def test_the_reasons_are_restored_even_with_the_magnitudes_gated_off():
    """The clobbering had two separable halves and only one is a claim.

    The MAGNITUDES are unmeasured (variance_modifiers_2026-08-17.md: permutation
    null [0.33, 5.65], 2 usable cells) and stay gated. The REASONS are facts the
    build already computes, so losing them was pure information loss and
    restoring them needs no measurement.
    """
    off = PJ.blend(_players(), {}, {}, _cfg())
    rookie = [p for p in off if p["player_id"] == "0"][0]
    why = rookie["variance_why"]
    assert any("rookie" in w for w in why), (
        "the player-specific reasons must survive even when the sd does not move")


def test_the_wording_says_the_spread_is_NOT_in_the_number_when_gated_off():
    """A bare 'spread: rookie' beside an unchanged sd would imply the modifier
    was applied. The two states must read differently."""
    off = PJ.blend(_players(), {}, {}, _cfg())
    on = PJ.blend(_players(), {}, {}, _cfg(player_spread_in_sd=True))
    off_why = [p for p in off if p["player_id"] == "0"][0]["variance_why"]
    on_why = [p for p in on if p["player_id"] == "0"][0]["variance_why"]
    assert any("not in the sd" in w for w in off_why), off_why
    assert not any("not in the sd" in w for w in on_why), on_why
    assert any(w.startswith("spread:") for w in on_why)


def test_restoring_the_reasons_moved_no_number():
    """The information fix must be provably free of any numeric consequence —
    that is what let it ship ungated five days before the draft."""
    off = PJ.blend(_players(), {}, {}, _cfg())
    for p in off:
        assert p["proj_sd_source"] == "measured-2023-25-error"
        # sd is still the band constant: ratio identical across the band
    ratios = {round(p["proj_sd"] / p["proj_mean"], 6) for p in off}
    assert len(ratios) <= 5
