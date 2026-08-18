"""A join that guesses is worse than a join that refuses.

This repo's recurring defect is a lookup that returns confidently and returns the
wrong row: the register closure that matched a branch name inside a quoted summary,
the calibration that fitted punters into a skill-position population. So the tests
that matter here are the ones about what happens when the name is ambiguous.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import sleeper_name_index as NI  # noqa: E402


POOL = {
    "4034": {"full_name": "Christian McCaffrey", "position": "RB", "team": "SF"},
    "11631": {"full_name": "Marvin Harrison Jr.", "position": "WR", "team": "ARI"},
    "6794": {"full_name": "Amon-Ra St. Brown", "position": "WR", "team": "DET"},
    # THE COLLISION CASE: two rostered players, one normalized name.
    "2306": {"full_name": "Michael Thomas", "position": "WR", "team": "NO"},
    "9999": {"full_name": "Michael Thomas", "position": "TE", "team": "NYJ"},
    # A defensive Josh Allen must NOT collide with the quarterback — 4r's mistake.
    "4984": {"full_name": "Josh Allen", "position": "QB", "team": "BUF"},
    "6126": {"full_name": "Josh Allen", "position": "LB", "team": "JAX"},
    "1111": {"full_name": "A Punter", "position": "P", "team": "NE"},
    "2222": {"full_name": "A Kicker", "position": "K", "team": "NE"},
}


@pytest.fixture
def art():
    return NI.build_index(POOL)


def test_suffixes_and_punctuation_do_not_break_a_real_match():
    """FP and Sleeper disagree about suffixes constantly, and a suffix mismatch is
    the most common reason a real player reads as absent."""
    assert NI.normalize_name("Marvin Harrison Jr.") == "marvin harrison"
    assert NI.normalize_name("Amon-Ra St. Brown") == "amonra st brown"
    assert NI.normalize_name("Ja'Marr Chase") == "jamarr chase"
    assert NI.normalize_name("Kenneth Walker III") == "kenneth walker"


def test_accents_are_folded():
    assert NI.normalize_name("Equanimeous St. Brown") == "equanimeous st brown"
    assert NI.normalize_name("Josë Smith") == NI.normalize_name("Jose Smith")


def test_a_clean_name_resolves_to_the_right_id(art):
    assert NI.lookup(art, "Christian McCaffrey")["player_id"] == "4034"
    assert NI.lookup(art, "Marvin Harrison Jr")["player_id"] == "11631"


def test_AN_AMBIGUOUS_NAME_RETURNS_NOTHING_rather_than_a_guess(art):
    """The whole point. Two rostered Michael Thomases, so the answer is None and the
    pair is listed — a caller gets no answer instead of a wrong one."""
    assert NI.lookup(art, "Michael Thomas") is None
    assert "michael thomas" in art["collisions"]
    assert len(art["collisions"]["michael thomas"]) == 2
    assert "michael thomas" not in art["index"], "a collision must not also be usable"


def test_a_defensive_player_does_not_collide_with_a_rostered_one(art):
    """Josh Allen the linebacker is not in this league's population, so Josh Allen
    the quarterback resolves cleanly. Register 4r is this exact mistake made the
    other way — non-rostered positions contaminating a skill-position fit."""
    got = NI.lookup(art, "Josh Allen")
    assert got is not None, "the QB was lost to a phantom collision with an LB"
    assert got["player_id"] == "4984" and got["position"] == "QB"


@pytest.mark.parametrize("name", ["A Punter", "A Kicker"])
def test_non_rostered_positions_never_enter_the_index(art, name):
    assert NI.lookup(art, name) is None
    assert NI.normalize_name(name) not in art["collisions"]


def test_coverage_NAMES_the_misses_rather_than_reporting_only_a_hit_rate(art):
    """A join that reports only its hit rate hides which rows it dropped, and the
    dropped rows are never random."""
    c = NI.coverage_against(art, ["Christian McCaffrey", "Michael Thomas",
                                  "Nobody At All", "Ja'Marr Chase"])
    assert c["asked"] == 4
    assert c["resolved"] == 1
    assert c["unresolved_collision"] == 1
    assert c["unresolved_missing"] == 2
    assert "Michael Thomas" in c["collided_names"]
    assert "Nobody At All" in c["missing_names"]
    assert "Ja'Marr Chase" in c["missing_names"], "a real miss must be named too"


def test_empty_and_malformed_pool_entries_do_not_raise():
    got = NI.build_index({"1": None, "2": {"position": "RB"}, "3": {"full_name": ""}})
    assert got["index"] == {} and got["collisions"] == {}


def test_first_last_name_fallback_when_full_name_is_absent():
    got = NI.build_index({"7": {"first_name": "Bijan", "last_name": "Robinson",
                                "position": "RB"}})
    assert NI.lookup(got, "Bijan Robinson")["player_id"] == "7"


def test_normalize_is_stable_under_repeated_application():
    """A normalizer that is not idempotent silently splits one player into two keys
    depending on which side of the join called it first."""
    for n in ["Marvin Harrison Jr.", "Amon-Ra St. Brown", "Ja'Marr Chase"]:
        once = NI.normalize_name(n)
        assert NI.normalize_name(once) == once, n
