# TERRITORY: A
"""K and DEF must not hold a cross-position rank.

Cory, 2026-08-17, seeing the board's own output: "La rams??? Mike Evans??
That's fucking wrong then."

He was right. The LA Rams sat at overall 35 against an ADP of 127 — the engine
recommending a 4th-round defence. VORP is only comparable across positions when
the distributions are, and measured on the live board they are not:

    pos   n    VORP@1   depth20   <- points lost by waiting 20 more picks
    WR   238   124.6      32.7      deep: waiting is nearly free
    DEF   32    29.0      30.0      waiting costs the whole position's VORP
    K     44    10.0      35.0      waiting costs MORE than it is worth

A defence's 29 points over replacement were never purchasable — you can still
get a defence 30 points below replacement twenty picks later.

public/js/draft/app.js already demoted them in the BOARD VIEW. These tests pin
the same truth in the ARTIFACT, so keeperui.js (which sorts on overall_rank with
no guard) and every future consumer inherit it.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import vorp  # noqa: E402

# `starters` (not `roster_slots`) is the key vorp.py reads, via
# config_schema.starters_at/flex_slots — it is the normalized starters-only view
# that validate() derives. Writing the raw slot map here silently gives every
# position zero starters, which is a different board entirely.
CFG = {"teams": 10, "starters": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "K": 1,
                                 "DEF": 1, "FLEX": 1}}


def _mk(pid, pos, proj):
    return {"player_id": pid, "position": pos, "proj_mean": proj}


def _board():
    # A DEF whose VORP would out-rank real skill players under the old sort.
    ps = []
    for i in range(40):
        ps.append(_mk(f"wr{i}", "WR", 300 - i * 4))
    for i in range(30):
        ps.append(_mk(f"rb{i}", "RB", 320 - i * 6))
    for i in range(15):
        ps.append(_mk(f"qb{i}", "QB", 400 - i * 5))
    for i in range(12):
        ps.append(_mk(f"te{i}", "TE", 230 - i * 7))
    for i in range(12):
        ps.append(_mk(f"def{i}", "DEF", 132 - i * 2))
    for i in range(12):
        ps.append(_mk(f"k{i}", "K", 107 - i))
    return ps


def test_no_onesie_outranks_any_skill_player():
    ranked, _ = vorp.apply_vorp(_board(), CFG)
    worst_skill = max(p["overall_rank"] for p in ranked
                      if p["position"] not in vorp.ONESIE_POSITIONS)
    best_onesie = min(p["overall_rank"] for p in ranked
                      if p["position"] in vorp.ONESIE_POSITIONS)
    assert best_onesie > worst_skill, (
        "a K or DEF outranks a skill player — the exact defect that put the "
        "Rams at overall 35 against ADP 127")


def test_onesies_keep_a_real_vorp_and_are_not_dropped():
    # Demoted, NOT deleted. Their VORP is still meaningful WITHIN position, and
    # the position filter must still give real tiers.
    ranked, _ = vorp.apply_vorp(_board(), CFG)
    defs = [p for p in ranked if p["position"] == "DEF"]
    assert len(defs) == 12
    assert all(p.get("vorp") is not None for p in defs)
    assert defs[0]["vorp"] > defs[-1]["vorp"]


def test_onesies_still_sort_among_themselves_by_vorp():
    ranked, _ = vorp.apply_vorp(_board(), CFG)
    for pos in vorp.ONESIE_POSITIONS:
        arr = [p for p in ranked if p["position"] == pos]
        ranks = [p["overall_rank"] for p in arr]
        vorps = [p["vorp"] for p in arr]
        assert ranks == sorted(ranks)
        assert vorps == sorted(vorps, reverse=True)


def test_skill_positions_keep_their_relative_order():
    # The demotion must not perturb anything above it.
    ranked, _ = vorp.apply_vorp(_board(), CFG)
    skill = [p for p in ranked if p["position"] not in vorp.ONESIE_POSITIONS]
    assert [p["vorp"] for p in skill] == sorted(
        [p["vorp"] for p in skill], reverse=True)


def test_the_constant_is_exactly_k_and_def():
    # A future edit that adds TE here would silently bury a real starting slot.
    assert set(vorp.ONESIE_POSITIONS) == {"K", "DEF"}
