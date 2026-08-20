"""CORY'S BAND RULE, WITH HIS OWN WORKED EXAMPLE AS THE FIRST TEST.

Cory, 2026-08-20, the ruling and then the arithmetic he used to state it:

    "I want to use draft sharks ceilings.. for every source that doesn't offer
     ceilings, make the ceiling AND floor the same % away from their proj as
     draft sharks."
    "so if draft shark has proj 100, ceiling 120, and fantasy pros has proj at
     150, then ceiling should be 180"

His example IS the specification, so it is the first case here rather than a
paraphrase of it. If this file and his sentence ever disagree, his sentence wins.
"""
import json
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "asr", ROOT / "draft" / "tools" / "alt_source_rankings.py")
asr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(asr)


def _one(**kw):
    p = {"player_id": "1", "name": "Test", "position": "RB"}
    p.update(kw)
    return p


def test_CORYS_OWN_EXAMPLE_ds_100_120_and_fp_150_gives_180():
    p = _one(proj_ds=100, proj_ds_ceiling=120, proj_ds_floor=80,
             proj_fantasypros=150)
    asr.apply_source_bands([p])
    assert p["proj_ceiling_fantasypros"] == 180.0, p
    # and the floor travels the same way: 80/100 = 0.8, so 150 * 0.8 = 120
    assert p["proj_floor_fantasypros"] == 120.0, p


def test_draft_sharks_own_band_is_reproduced_exactly_not_approximated():
    """DS's own ceiling must come back as DS's own number. A ratio that does not
    round-trip on the source it came from is wrong before any other source is
    considered."""
    p = _one(proj_ds=322, proj_ds_ceiling=370, proj_ds_floor=261)
    asr.apply_source_bands([p])
    assert abs(p["proj_ceiling_ds"] - 370) < 0.01
    assert abs(p["proj_floor_ds"] - 261) < 0.01


def test_a_LOWER_source_gets_a_LOWER_ceiling_not_draft_sharks_points():
    """The failure this rule is written against: lending an ABSOLUTE band would
    give a source projecting 20 points lower a ceiling as high as DS's. The
    ratio keeps each source inside its own scale."""
    p = _one(proj_ds=300, proj_ds_ceiling=360, proj_ds_floor=240,
             proj_sleeper=250)
    asr.apply_source_bands([p])
    assert p["proj_ceiling_sleeper"] == 300.0          # 250 * 1.2
    assert p["proj_ceiling_sleeper"] < p["proj_ceiling_ds"]


def test_ABSENT_IS_NOT_A_GUESS_no_ds_band_means_no_band_anywhere():
    """A player Draft Sharks does not carry gets NO ceiling on any source. A
    fabricated ceiling is indistinguishable on screen from a measured one."""
    p = _one(proj_fantasypros=150, proj_sleeper=140)   # no DS fields at all
    d = asr.apply_source_bands([p])
    assert not any(k.startswith("proj_ceiling_") for k in p), p
    assert not any(k.startswith("proj_floor_") for k in p), p
    assert d["no_ds_band"] == 1 and d["with_ds_band"] == 0


def test_a_source_the_player_lacks_gets_no_band_even_when_DS_covers_him():
    p = _one(proj_ds=100, proj_ds_ceiling=120, proj_ds_floor=80,
             proj_fantasypros=150)          # no sleeper, no ownmodel
    asr.apply_source_bands([p])
    assert "proj_ceiling_fantasypros" in p
    assert "proj_ceiling_sleeper" not in p
    assert "proj_ceiling_ownmodel" not in p


def test_a_zero_or_negative_ds_projection_cannot_produce_an_infinite_ratio():
    for bad in (0, -5, None):
        p = _one(proj_ds=bad, proj_ds_ceiling=120, proj_ds_floor=80,
                 proj_fantasypros=150)
        asr.apply_source_bands([p])
        assert "proj_ceiling_fantasypros" not in p, bad


@pytest.mark.post_chain  # the DS band this rule travels FROM is written by
# attach_draftsharks.py, which runs in the post-processing chain. On a freshly
# built board this measured `with_ds_band: 0, no_ds_band: 700` and refused the
# publish (run 32425450897) — not because the rule broke, but because it was
# being asked about a board that has no Draft Sharks bands on it yet. Marked
# here and added to draft-data.yml's post-chain step in the same commit, per
# the conftest rule. The synthetic tests above stay unmarked: they build their
# own players and are true of any board.
def test_ON_THE_REAL_BOARD_the_rule_covers_Corys_draftable_scope():
    """The counts that matter: it is worthless if it fires only on players he
    will never see."""
    art = json.loads((ROOT / "public" / "draft_data.json").read_text())
    players = art["players"]
    d = asr.apply_source_bands(players)
    assert d["with_ds_band"] > 200, d

    def adp(p):
        for k in ("adjusted_adp", "raw_adp"):
            if p.get(k) is not None:
                return float(p[k])
        return 9999.0

    scope = (art["league"].get("draftable_scope") or {}).get("focus", 200)
    top = sorted([p for p in players if p.get("position") and p.get("proj_mean")],
                 key=adp)[:scope]
    banded = [p for p in top if p.get("proj_ceiling_ds") is not None]
    # DS covers 189 of the top 200; the rule must reach essentially all of them
    assert len(banded) >= 0.9 * scope, (len(banded), scope)

    # and every banded player's per-source ceiling must sit above its own proj
    for p in banded:
        for key in ("ds", "fantasypros", "sleeper"):
            c, v = p.get("proj_ceiling_" + key), p.get("proj_" + key)
            if c is None or v is None:
                continue
            assert c >= v, (p["name"], key, v, c)
