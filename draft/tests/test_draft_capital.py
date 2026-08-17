# TERRITORY: A
"""Gates for the NFL draft-capital board column (step 0 of Cory's boost).

The column is INFORMATIONAL — that is the entire safety argument for landing it
five days before the draft, so the test that proves it touches nothing else is
the most important one here.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import draft_capital as DC  # noqa: E402

CAP = [
    {"season": 2026, "round": 1, "pick": 24, "team": "CLE", "position": "WR",
     "name": "KC Concepcion", "sleeper_id": None},
    {"season": 2026, "round": 5, "pick": 176, "team": "KAN", "position": "WR",
     "name": "Cyrus Allen", "sleeper_id": None},
    {"season": 2024, "round": 1, "pick": 4, "team": "ARI", "position": "WR",
     "name": "Marvin Harrison Jr.", "sleeper_id": "11111"},
    {"season": 2026, "round": 2, "pick": 33, "team": "SFO", "position": "WR",
     "name": "Not On Our Board", "sleeper_id": None},
]


def _board():
    return [
        {"player_id": "1", "name": "KC Concepcion", "position": "WR", "proj_mean": 127.4},
        {"player_id": "11111", "name": "Marvin Harrison Jr", "position": "WR", "proj_mean": 200.0},
        {"player_id": "3", "name": "Some Undrafted Guy", "position": "WR", "proj_mean": 40.0},
    ]


def test_tiers_only_name_rounds_the_study_actually_graded():
    assert DC.tier_of(1) == "rd1"
    assert DC.tier_of(2) == "rd2"
    assert DC.tier_of(3) == "rd3"
    for r in (4, 5, 6, 7):
        assert DC.tier_of(r) == "rd4-7", (
            "rounds the study pooled must stay pooled — splitting them here "
            "would invent a verdict for a cell with no measured distribution")


def test_name_normalization_handles_the_join_cases_that_actually_occur():
    assert DC.normalize_name("Marvin Harrison Jr.") == DC.normalize_name("Marvin Harrison")
    assert DC.normalize_name("Omar Cooper Jr.") == DC.normalize_name("omar cooper")
    assert DC.normalize_name("Chris Brazzell II") == DC.normalize_name("Chris Brazzell")
    # ...and does NOT collapse two different people.
    assert DC.normalize_name("Cyrus Allen") != DC.normalize_name("Josh Allen")


def test_attach_writes_capital_and_flags_this_year_as_rookie():
    b = _board()
    diag = DC.attach_capital(b, CAP, season=2026)
    kc = b[0]
    assert kc["nfl_draft_round"] == 1 and kc["nfl_draft_pick"] == 24
    assert kc["capital_tier"] == "rd1" and kc["is_nfl_rookie"] is True
    assert diag["attached"] == 2


def test_a_prior_class_veteran_gets_capital_but_is_not_a_rookie():
    b = _board()
    DC.attach_capital(b, CAP, season=2026)
    mh = b[1]
    assert mh["nfl_draft_round"] == 1
    assert mh["is_nfl_rookie"] is False, (
        "capital is permanent; rookie-ness is about THIS season, and conflating "
        "them would tier every former first-rounder as a rookie bet")


def test_an_unmatched_player_is_left_completely_untouched():
    """Absent must stay distinguishable from undrafted. A None here would make
    a genuinely undrafted free agent and a join failure look identical."""
    b = _board()
    DC.attach_capital(b, CAP, season=2026)
    undrafted = b[2]
    for k in ("nfl_draft_round", "nfl_draft_pick", "capital_tier", "is_nfl_rookie"):
        assert k not in undrafted


def test_the_column_changes_no_projection_or_ranking_field():
    """THE SAFETY ARGUMENT, as a test. This is why the column can land five days
    before the draft: it is additive and provably so."""
    b = _board()
    before = [dict(p) for p in b]
    DC.attach_capital(b, CAP, season=2026)
    new_keys = {"nfl_draft_round", "nfl_draft_pick", "capital_tier", "is_nfl_rookie"}
    for old, now in zip(before, b):
        for k, v in old.items():
            assert now[k] == v, f"{k} was modified by an additive attach"
        assert set(now) - set(old) <= new_keys


def test_unmatched_members_of_this_class_are_reported_not_dropped():
    b = _board()
    diag = DC.attach_capital(b, CAP, season=2026)
    assert "Not On Our Board" in diag["unmatched_this_class"]
    assert "KC Concepcion" not in diag["unmatched_this_class"]
    assert diag["join_note"]


def test_id_join_is_preferred_over_name_join():
    b = _board()
    diag = DC.attach_capital(b, CAP, season=2026)
    assert diag["matched_by_id"] == 1 and diag["matched_by_name"] == 1, (
        "the id join must win where an id exists — falling back to names "
        "everywhere would make a name collision silently authoritative")


def test_the_real_committed_stores_load_and_carry_both_classes():
    cap = DC.load_capital()
    assert len(cap) > 300
    seasons = {int(c["season"]) for c in cap}
    assert {2023, 2024, 2025, 2026} <= seasons


def test_the_diag_states_plainly_that_nothing_downstream_moves():
    diag = DC.attach_capital(_board(), CAP, season=2026)
    assert diag["column_is_informational"] is True
    assert diag["changes_projection_or_ranking"] is False
