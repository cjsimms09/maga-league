# TERRITORY: A
"""THE ADP SEASON STAMP — the half of Cory's gate that lives in A's lane.

Cory, HIGH: *"we really need a gate to make sure historical drafts and data don't
make their way into this years recommendations. Ie players that were drafted high
last year may not be drafted high or at all this year."*

C's `season_stamp` supplies the vocabulary and the detector; `build.py` has to
apply it where each value is attached, because that is the only place that still
knows where the value came from. These tests pin the part that is easy to get
wrong and impossible to notice: WHICH stamp each branch gets.

The failure this guards against is not a crash. It is a board that carries
`raw_adp_season: 2026` on a column that is actually Sleeper popularity rank — a
true-looking stamp on an unverified value, which is strictly worse than no stamp,
because the gate downstream would then pass it.
"""
from __future__ import annotations
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "backtest"))

import season_stamp  # noqa: E402
from build import adp_season_stamps  # noqa: E402


def _stamp_for(adp_source, year=2026):
    """THE SHIPPED FUNCTION, imported — not a copy of its logic.

    The first version of this file re-implemented the branch in the test. That
    version passed against a deliberately broken build.py, because it was
    checking its own copy of the rule. A test that cannot fail when the code is
    wrong is a description of intent, not a guard. Verified by mutation: making
    build.py stamp search_rank as seasonal(year) turns
    test_the_search_rank_FALLBACK_is_current_and_NOT_stamped_2026 red.
    """
    return adp_season_stamps(adp_source, year)


def test_a_real_adp_source_is_stamped_with_the_TARGET_SEASON():
    """fantasypros and ffc both carry the season in the request URL, and adp.py
    derives the cache key from that url, so the year is a fact about the fetch."""
    for src in ("fantasypros", "ffc"):
        out = _stamp_for(src)
        assert out["raw_adp_season"] == 2026, (src, out)
        assert out["adp_season"] == 2026
        assert out["consensus_rank_season"] == 2026
        # and it must NOT claim to be a deliberately-carried prior season
        assert "raw_adp_historical" not in out


def test_the_search_rank_FALLBACK_is_current_and_NOT_stamped_2026():
    """The branch that bites. Sleeper popularity rank has no season anywhere in
    the payload; stamping it 2026 would be an assertion wearing a measurement's
    clothes. This is the assertion that fails if someone 'simplifies' the
    per-player branch into a blanket seasonal(year)."""
    out = _stamp_for("search_rank")
    assert out["raw_adp_season"] == season_stamp.CURRENT
    assert out["raw_adp_season"] != 2026


def test_the_two_branches_actually_DIFFER():
    """A control. If both branches produced the same stamp, both tests above
    would still pass while the distinction they exist to protect was gone."""
    assert _stamp_for("fantasypros") != _stamp_for("search_rank")


def test_a_2026_stamp_does_not_trip_the_gate_and_a_2025_one_DOES():
    """The stamp is only worth applying if the detector acts on it. Runs C's
    own violations() over both, so this is the real gate and not a restatement
    of the stamping rule."""
    good = dict(player_id="1", raw_adp=12.0, **_stamp_for("fantasypros"))
    assert season_stamp.violations([good], 2026, fields=("raw_adp",)) == []

    stale = dict(player_id="2", raw_adp=12.0,
                 **season_stamp.stamp({}, {"raw_adp": season_stamp.seasonal(2025)}))
    bad = season_stamp.violations([stale], 2026, fields=("raw_adp",))
    assert len(bad) == 1, bad
    assert "2025" in bad[0]["why"]


def test_an_UNSTAMPED_adp_is_a_violation_rather_than_a_pass():
    """The whole design rests on this default. The field that bites is always
    the one added by someone who did not know the gate existed."""
    bare = {"player_id": "3", "raw_adp": 12.0}
    bad = season_stamp.violations([bare], 2026, fields=("raw_adp",))
    assert len(bad) == 1
    assert "unstamped" in bad[0]["why"]


def test_the_stamp_adds_ONLY_season_keys_and_mutates_no_value():
    """build.py does `p.update(stamp({}, ...))`. If stamp() ever returned the
    record itself rather than the stamps, this would silently overwrite the
    board. Cheap to check, catastrophic to miss."""
    out = _stamp_for("fantasypros")
    assert set(out) == {"raw_adp_season", "adp_season", "consensus_rank_season"}
