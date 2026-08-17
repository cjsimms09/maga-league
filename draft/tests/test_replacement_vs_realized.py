# TERRITORY: C
"""Does the flex split that sets replacement match what actually happened?

Written break-first: each assertion exists because the mutation named in its
docstring was applied to the module and the suite was watched fail.

The module DECIDES NOTHING — `draft/vorp.py` is A's and so is the modelling
call. These guards are about the measurement being honest, not about the answer.

Run: python3 -m pytest draft/tests/test_replacement_vs_realized.py -q
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import replacement_vs_realized as R  # noqa: E402

DED = {"RB": 2, "WR": 2, "TE": 1}


def _ranked(rb, wr, te):
    return {"RB": sorted(rb, reverse=True), "WR": sorted(wr, reverse=True),
            "TE": sorted(te, reverse=True)}


def test_the_flex_slot_goes_to_the_BEST_NEXT_MAN_not_a_fixed_position():
    """MUTATION: hand every flex slot to the first eligible position — the split
    stops depending on the values entirely and always reports the same answer,
    which would have matched the board by luck and hidden the disagreement."""
    ranked = _ranked([50, 40, 30, 1, 1], [50, 40, 99, 98, 97], [10, 9, 8])
    got = R.greedy_split(ranked, DED, 2)
    assert got["WR"] == 4, got          # WR's next two (99, 98) beat RB's 30
    assert got["RB"] == 2, got


def test_a_position_that_RUNS_OUT_stops_rather_than_indexing_past_the_end():
    """MUTATION: drop the `i < len(pool)` guard — a short pool raises IndexError
    mid-allocation and the whole comparison dies on a thin position."""
    ranked = _ranked([5], [4], [3])
    got = R.greedy_split(ranked, {"RB": 1, "WR": 1, "TE": 1}, 10)
    assert sum(got.values()) == 3, got   # nothing left to allocate


def test_the_board_is_judged_against_the_RANGE_not_the_mean():
    """Three seasons is a small sample. Averaging them into one target implies a
    precision the sample does not carry; asking whether the board falls inside
    the observed spread is the weaker claim the data supports.

    MUTATION: compare against the mean and flag any difference — a board sitting
    comfortably inside the seasons' own disagreement is reported as wrong."""
    board = _ranked([100, 90, 80, 70], [99, 89, 79, 69], [50, 40, 30, 20])
    # two seasons that disagree with each other; the board lands between them
    s1 = _ranked([100, 90, 80, 70], [99, 89, 79, 69], [50, 40, 30, 20])
    s2 = _ranked([100, 90, 60, 50], [99, 89, 88, 87], [50, 40, 30, 20])
    out = R.compare(board, {2023: s1, 2024: s2}, DED, 2)
    assert out["status"] == "measured", out
    assert out["seasons"] == 2
    lo, hi = out["realized_flex_range"]["WR"]
    assert lo <= out["board_flex"]["WR"] <= hi, out
    assert not out["outside_realized_range"], out
    assert "INSIDE the range" in out["note"]


def test_a_split_OUTSIDE_the_range_says_they_disagree_NOT_who_is_right():
    """MUTATION: word the note as "the board is wrong" — the measurement starts
    issuing a verdict on A's modelling choice, which it cannot support: a rule
    may correctly refuse to chase noise in three seasons."""
    board = _ranked([100, 90, 80, 70], [1, 1, 1, 1], [1, 1, 1, 1])
    s1 = _ranked([1, 1, 1, 1], [100, 90, 80, 70], [1, 1, 1, 1])
    out = R.compare(board, {2023: s1}, DED, 2)
    assert out["outside_realized_range"], out
    assert "NOT which of them is right" in out["note"], out["note"]
    assert "refuse to chase noise" in out["note"]


def test_every_result_carries_what_it_AUTHORIZES():
    """MUTATION: drop `authorizes` — a reader gets a table comparing our rule to
    outcomes with nothing saying it may not be acted on directly.

    Same discipline as `sd_stability`: the standing rides on the result."""
    for out in (R.compare(_ranked([9, 8], [7, 6], [5, 4]), {}, DED, 1),
                R.compare(_ranked([9, 8], [7, 6], [5, 4]),
                          {2023: _ranked([9, 8], [7, 6], [5, 4])}, DED, 1)):
        assert out["authorizes"].startswith("nothing"), out
        assert "does not license a change to draft/vorp.py" in out["authorizes"]


def test_NO_realized_season_is_unmeasured_not_agreement():
    """MUTATION: return `measured` with an empty comparison — a board that was
    never checked against anything reads as a board that passed."""
    out = R.compare(_ranked([9, 8], [7, 6], [5, 4]), {}, DED, 1)
    assert out["status"] == "unmeasured", out
    assert "not the same as the split being right" in out["note"]


def test_a_CLIFF_is_relative_to_its_neighbourhood_not_an_absolute_drop():
    """Ten points is nothing at the top of a board and enormous at the
    replacement line.

    MUTATION: report the raw drop and threshold it — a steep but ORDINARY region
    reads as a cliff, and a genuine discontinuity in a flat region is missed."""
    steep = [300, 280, 260, 240, 220, 200, 180, 160, 140, 120]   # 20 apart
    got = R.cliff(steep, 5)
    assert got["drop"] == 20.0 and got["typical_drop_nearby"] == 20.0
    assert got["cliff_ratio"] == 1.0, got     # steep, but not a cliff

    flat = [100, 99, 98, 97, 96, 60, 59, 58, 57, 56]             # one real cliff
    got2 = R.cliff(flat, 5)
    assert got2["drop"] == 36.0
    assert got2["cliff_ratio"] > 5, got2      # same shape as the live RB result


def test_a_rank_with_NO_NEXT_MAN_is_unmeasured_not_a_zero_drop():
    """MUTATION: treat the end of the pool as a drop of 0 — the deepest possible
    replacement reports the flattest possible neighbourhood, which is the most
    reassuring answer available and is produced by having no data."""
    got = R.cliff([10, 9, 8], 3)
    assert got["status"] == "unmeasured", got
    assert "no next man" in got["note"]
    assert R.cliff([10, 9, 8], 9)["status"] == "unmeasured"


def test_an_UNPARSEABLE_weekly_point_does_not_become_a_zero(tmp_path):
    """A point that will not parse would shrink a player's season and move him
    down the ranking that sets replacement.

    MUTATION: `float(pts or 0)` — a corrupt week silently deflates every player
    it touches and the replacement line moves with them."""
    p = tmp_path / "w.json"
    p.write_text(json.dumps({"weeks": [
        {"season": 2023, "week": 1, "points": {"a": 10.0, "b": "n/a", "c": "x"}},
        {"season": 2023, "week": 2, "points": {"a": 5.0, "b": 7.0}}]}))
    tot = R.season_totals(2023, path=p)
    assert tot["a"] == 15.0
    assert tot["b"] == 7.0, "the parseable week must still count"
    # ⚠ THE ASSERTION ABOVE IS NOT ENOUGH AND THE GATE PROVED IT. `tot` is a
    # defaultdict(float), so mutating the skip to `+= 0.0` produces the IDENTICAL
    # total for any player who also has a good week — the mutation SURVIVED. The
    # difference that matters is a player whose ONLY week is unparseable: he must
    # be ABSENT, not a 0-point player entering the ranking that sets replacement,
    # where he would sit at the bottom of his position and drag the line down.
    assert "c" not in tot, ("a player with no parseable week must not exist at "
                            "0.0: %r" % tot)


def test_by_position_ranks_ONLY_flex_eligible_positions():
    """MUTATION: include QB — a superflex-shaped pool enters a comparison about
    a FLEX slot our league gives to RB/WR/TE only."""
    pos = {"1": "RB", "2": "WR", "3": "QB", "4": "TE", "5": "K"}
    got = R.by_position({"1": 10.0, "2": 9.0, "3": 400.0, "4": 8.0, "5": 1.0}, pos)
    assert set(got) == {"RB", "WR", "TE"}, got
    assert 400.0 not in sum(got.values(), [])


def test_a_cliff_in_SOME_sources_is_not_a_scarcity_break():
    """The obvious remedy for a replacement perched on a cliff is "put it where
    the real cliff is". Measured across projections plus three realized seasons
    there ISN'T one at either replacement rank — RB@21 shows a cliff in 2 of 4
    sources and WR@29 in 2 of 4. Cliff POSITION is not stable at these ranks.

    MUTATION: return `stable` on a simple majority — an inconsistent
    discontinuity is reported as a feature of the position and a replacement
    level gets anchored to one season's accident."""
    flat = [100 - i for i in range(12)]                 # smooth, no cliff
    steep = [100, 99, 98, 97, 96, 50, 49, 48, 47, 46]   # a real cliff at 5
    out = R.cliff_stability({"a": steep, "b": flat, "c": flat}, 5)
    assert out["status"] == "measured", out
    assert out["with_cliff"] == 1 and out["sources"] == 3, out
    assert out["stable"] is False, out
    assert "not a stable scarcity break" in out["note"]

    # ⚠ THE MINORITY CASE ABOVE DOES NOT DISCRIMINATE A MAJORITY RULE and the
    # gate proved it: with 1 of 3, `len(hits) >= len(seen)/2` is also False, so
    # the mutation SURVIVED. The case that separates them is a MAJORITY that is
    # not unanimous — which is also the live shape, RB@21 and WR@29 both showing
    # a cliff in 2 of 4 sources.
    maj = R.cliff_stability({"a": steep, "b": list(steep), "c": flat}, 5)
    assert maj["with_cliff"] == 2 and maj["sources"] == 3, maj
    assert maj["stable"] is False, ("a majority is not unanimity: %r" % maj)
    assert "not a stable scarcity break" in maj["note"]


def test_UNANIMOUS_either_way_is_a_feature():
    """Both arms, so `stable` is a discrimination rather than a word that only
    ever means no.

    MUTATION: hard-code `stable = False` — the function can never say a
    discontinuity IS real, and a genuine positional tier break reads the same as
    noise."""
    steep = [100, 99, 98, 97, 96, 50, 49, 48, 47, 46]
    flat = [100 - i for i in range(12)]
    allc = R.cliff_stability({"a": steep, "b": list(steep)}, 5)
    assert allc["stable"] is True and allc["with_cliff"] == 2, allc
    assert "feature of the position" in allc["note"]
    none = R.cliff_stability({"a": flat, "b": list(flat)}, 5)
    assert none["stable"] is True and none["with_cliff"] == 0, none


def test_NO_measurable_source_is_unmeasured_not_smooth():
    """MUTATION: report `stable` True with zero sources — a rank nobody could
    measure reads as a smooth neighbourhood, which is the reassuring answer
    produced by having no data (rule 13f)."""
    out = R.cliff_stability({"a": [1, 2]}, 9)
    assert out["status"] == "unmeasured", out
    assert "not the same as the neighbourhood being smooth" in out["note"]
