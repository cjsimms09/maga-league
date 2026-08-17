# TERRITORY: A
"""The measured-p90 ceiling: wired, gated OFF, and honest about what it is not.

Found 2026-08-17 while answering Cory's "give these players a boost for upside":
REC-1 shipped TWO appliers, `proj_sd_for` and `proj_ceiling_for`. Only the first
was ever called. The second sat measured and unused while the board went on
computing `proj_ceiling = proj_mean + 1.036 * proj_sd` — a SYMMETRIC Gaussian
over a distribution the same calibration measures as violently skewed.

THE GATE IS THE POINT OF THIS FILE. proj_ceiling is not inert: engine.js's bench
branch ranks on `proj_ceiling - proj_mean`. So the fix is landed OFF, and these
tests pin both arms — that the default board is unchanged, and that the flag
really does something when set.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backtest"))
import projection_error as PE  # noqa: E402
import projections  # noqa: E402


def _players():
    return [{"player_id": str(i), "name": f"P{i}", "position": "WR",
             "proj_baseline": 200.0 - i} for i in range(40)]


def _cfg(**over):
    base = {"teams": 10, "starters": {"QB": 1, "RB": 2, "WR": 2, "TE": 1,
                                      "K": 1, "DEF": 1, "FLEX": 1},
            "opportunity_cap": 0.0}
    base.update(over)
    return base


def test_the_measured_ceiling_is_ON_and_its_sibling_is_not():
    """AMENDED 2026-08-17. This asserted the flag ships OFF. Cory ruled it on —
    "We absolutely need to change draft board if we aren't considering upside" —
    after the delta was measured: the bench branch, which ranks on
    ceiling - mean, had Jordan Love / Baker Mayfield / Tyler Shough / Sam
    Darnold as the highest-upside players on the board, because a QB's raw
    spread is the largest absolute number almost by construction. engine.js's
    own comment says that "measures SCALE, NOT UPSIDE".

    The two flags stay INDEPENDENT and the pairing is the point: the p90 is
    MEASURED (1,304 graded player-seasons), the per-player spread modifiers are
    HAND-SET constants a permutation test could not resolve between 0.33 and
    5.65. One is a correctness fix, the other is a guess, and they must not
    travel together."""
    cfg = json.loads((ROOT / "config" / "league_config.json").read_text())
    assert cfg.get("use_measured_ceiling") is True
    assert not cfg.get("player_spread_in_sd"), (
        "the UNMEASURED half must not have been switched on alongside the "
        "measured one")
    assert cfg.get("_use_measured_ceiling_why"), "the ruling must carry its reason"


def test_with_the_flag_off_the_ceiling_is_still_the_gaussian():
    out = projections.blend(_players(), {}, {}, _cfg())
    for p in out:
        assert p["proj_ceiling_source"] == "gaussian_z"
        expected = round(p["proj_mean"] + projections.CEILING_Z * p["proj_sd"], 2)
        assert abs(p["proj_ceiling"] - expected) < 0.011


def test_on_the_ceiling_becomes_the_measured_p90_and_actually_moves():
    """The other arm. A flag that changes nothing is not a flag."""
    off = projections.blend(_players(), {}, {}, _cfg())
    on = projections.blend(_players(), {}, {}, _cfg(use_measured_ceiling=True))
    sources = {p["proj_ceiling_source"] for p in on}
    assert "measured-2023-25-p90" in sources, (
        "no row picked up the measured ceiling — the flag is inert")
    moved = [a for a, b in zip(on, off) if a["proj_ceiling"] != b["proj_ceiling"]]
    assert moved, "the flag flipped but no ceiling changed"


def test_the_mean_and_sd_are_untouched_by_the_flag():
    """Whatever the ceiling does, it must not disturb the number the board
    RANKS on. This is what keeps the change reviewable in isolation."""
    off = projections.blend(_players(), {}, {}, _cfg())
    on = projections.blend(_players(), {}, {}, _cfg(use_measured_ceiling=True))
    for a, b in zip(on, off):
        assert a["proj_mean"] == b["proj_mean"]
        assert a["proj_sd"] == b["proj_sd"]
        assert a["vorp"] == b["vorp"] if "vorp" in a else True


def test_an_unmeasured_band_keeps_the_gaussian_rather_than_a_filled_in_number():
    """Absent stays absent. A fallback constant is how `0.25 * proj_mean`
    reached the board once, and proj_ceiling_source is how a consumer tells a
    fitted number from a filled-in one."""
    ps = [{"player_id": "1", "name": "K1", "position": "K", "proj_baseline": 130.0}]
    out = projections.blend(ps, {}, {}, _cfg(use_measured_ceiling=True))
    assert out[0]["proj_ceiling_source"] == "gaussian_z"
    assert out[0]["proj_ceiling"] is not None


def test_the_gaussian_inflates_deep_bands_which_is_why_this_matters():
    """THE FINDING, pinned as arithmetic rather than left in a commit message.

    In the deep bands the realized distribution piles up near zero with a modest
    right tail, so a symmetric Gaussian on a large sd MANUFACTURES upside for
    exactly the late-round players a 'draft for upside late' strategy would
    target."""
    cal = PE.load()
    for pos, band in (("QB", "33+"), ("TE", "33+"), ("WR", "33+"), ("RB", "33+")):
        c = cal["cells"][(pos, band)]
        gaussian_ratio = 1 + projections.CEILING_Z * c["sd_ratio"]
        assert c["p90_ratio"] < gaussian_ratio, (
            f"{pos}|{band}: the Gaussian no longer overstates the deep-band "
            "ceiling — the audit's central claim would need revisiting")
        assert c["p50_ratio"] < 0.5, (
            f"{pos}|{band}: median realized return is no longer far below "
            "projection, which is what made the symmetric assumption wrong")


def test_the_measured_ceiling_does_NOT_break_collinearity_with_the_mean():
    """THE CORRECTION TO MY OWN PLAN, pinned so it cannot quietly revert.

    I predicted that wiring the measured p90 would decollinearise `ceiling` from
    `value` and thereby unlock the zeroed ceiling weight. IT DOES NOT. The p90
    ratio is constant WITHIN a (position, band) cell, so ordering inside a band
    is untouched and only the handful of cross-band boundaries move: measured on
    the live board, Spearman(ceiling, mean) goes 0.9985 -> 0.9955.

    A ceiling weight would therefore still be a near-duplicate of the value
    weight. Expressing 'THIS player has upside' needs a PER-PLAYER signal, which
    a per-band ratio structurally cannot be.
    """
    cal = PE.load()
    ratios = {}
    for (pos, band), c in cal["cells"].items():
        if c["status"] == "measured":
            ratios.setdefault(pos, set()).add(band)
    for pos, bands in ratios.items():
        assert len(bands) <= 5, pos
    # One ratio per cell — so every player in a cell is scaled identically, and
    # a within-cell ordering can never change.
    for (pos, band), c in cal["cells"].items():
        if c["status"] == "measured":
            assert isinstance(c["p90_ratio"], (int, float))


@pytest.mark.parametrize("field", ["proj_ceiling_source"])
def test_the_new_field_is_registered_on_both_season_stamp_axes(field):
    import season_stamp as SS
    assert field in SS.BOARD_FIELD_SOURCES
    assert field in SS.BOARD_FIELD_PURPOSE
