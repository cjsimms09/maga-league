# TERRITORY: C
"""Age / rookie flag / draft capital -- register: relay's 08-20 CEILING-PROGRAM
dispatch. The Tom Brady fixture is not a nice example -- it is the exact bug
this module shipped with once already: an earlier version filtered
draft_picks to season >= 2015 and reported Brady (6th round, 2000) as
'UDFA'. Caught by hand before shipping (rule 3e/3f), fixed, and pinned here
so it cannot silently come back.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import player_bio_capital as P  # noqa: E402


# ── real rows, verified against the live nflverse fetch before writing this file ─

BRADY_DRAFT_ROW = {"season": 2000, "round": 6, "pick": 199, "team": "NWE",
                   "gsis_id": "00-0019596", "pfr_player_name": "Tom Brady"}
BRADY_ROSTER_ROW = {"full_name": "Tom Brady", "position": "QB",
                    "birth_date": "1977-08-03", "rookie_year": 2000.0,
                    "gsis_id": "00-0019596", "sleeper_id": "116"}

# a real, recent late-round pick who never made an active roster -- the
# GENUINE reason to filter, verified against the real gsis_id format gap
BAD_GSIS_ROW = {"season": 2015, "round": 6, "pick": 201, "team": "STL",
                "gsis_id": "BUDSASSER0", "pfr_player_name": "Bud Sasser"}

# ── real rows, the SECOND bug: the ENTIRE 2026 draft class carries a
# PFR-style gsis_id (nflverse's own convention for a fresh class, before
# ids get "promoted") -- 257 of 257 real 2026 picks failed the format
# check, not just a handful of ghosts. Jeremiyah Love, round 1 pick 3,
# read "UDFA" in the first shipped version of this fix. Verified against
# the live nflverse fetch before writing this file (rule 3f).
LOVE_DRAFT_ROW = {"season": 2026, "round": 1, "pick": 3, "team": "ARI",
                  "gsis_id": "LOV121782", "pfr_player_name": "Jeremiyah Love"}
LOVE_ROSTER_ROW = {"full_name": "Jeremiyah Love", "position": "RB",
                   "birth_date": "2005-05-31", "rookie_year": 2026.0,
                   "gsis_id": "00-0041027", "sleeper_id": "13287"}

# Mike Washington: a REAL residual gap the by-name fix does NOT close, and
# it is documented rather than silently left. Three real nflverse sources
# disagree on his gsis_id (draft_picks WAS797326, 2026 roster 00-0040878,
# nfl.import_ids() a THIRD id WAS569019), and on top of that draft_picks'
# own name ("Mike Washington Jr.") does not exact-match the roster's
# ("Mike Washington") -- verified against the live fetch before writing
# this file. The name-index fix is exact-match only by design (a fuzzy
# suffix-stripping match risks matching the WRONG player), so he stays
# UDFA -- correctly absent from the fix's population, not silently wrong.
WASHINGTON_DRAFT_ROW = {"season": 2026, "round": 4, "pick": 122, "team": "LVR",
                        "gsis_id": "WAS797326", "pfr_player_name": "Mike Washington Jr."}
WASHINGTON_ROSTER_ROW = {"full_name": "Mike Washington", "position": "RB",
                         "birth_date": "2003-07-03", "rookie_year": 2026.0,
                         "gsis_id": "00-0040878", "sleeper_id": None}


def test_draft_capital_label_matches_sleeper_style_round_names():
    assert P.draft_capital_label(1) == "1st"
    assert P.draft_capital_label(6) == "6th"
    assert P.draft_capital_label(None) == "UDFA"


def test_age_as_of_season_uses_september_first():
    # born Aug 3 -> already had this year's birthday by Sept 1
    assert P.age_as_of_season("1977-08-03", 2021) == 44.0
    # born Oct 1 -> has NOT had this year's birthday by Sept 1
    assert P.age_as_of_season("1990-10-01", 2021) == 30.0


def test_age_as_of_season_returns_none_for_missing_birthdate():
    assert P.age_as_of_season(None, 2021) is None


def test_build_bio_table_normalizes_birth_date_to_a_plain_string():
    # THE BUG: parquet round-trips birth_date as a native date object, which
    # broke JSON serialization until this was fixed at the one place every
    # value enters the table.
    from datetime import date
    row = {**BRADY_ROSTER_ROW, "birth_date": date(1977, 8, 3)}
    bio = P.build_bio_table({2021: [row]})
    assert bio["00-0019596"]["birth_date"] == "1977-08-03"
    assert isinstance(bio["00-0019596"]["birth_date"], str)


def test_build_draft_table_includes_a_pre_2015_pick_with_a_modern_gsis_id():
    # THE REAL BUG, PINNED: an earlier version filtered by season >= 2015 and
    # reported Brady as UDFA. The correct filter is gsis_id FORMAT, and
    # Brady's 2000 row carries the same modern format as every recent pick.
    draft = P.build_draft_table([BRADY_DRAFT_ROW])
    assert "00-0019596" in draft
    assert draft["00-0019596"]["round"] == 6
    assert draft["00-0019596"]["pick"] == 199


def test_build_draft_table_excludes_a_real_non_standard_gsis_id():
    # the GENUINE reason to filter -- a real late-round pick who never
    # appears in any roster file and never got a modern gsis_id
    draft = P.build_draft_table([BAD_GSIS_ROW])
    assert draft == {}


def test_unique_name_index_excludes_a_real_roster_collision():
    # THE REAL COLLISION: the 2026 roster carries two different players
    # both named "Justin Jefferson" (verified against the live fetch) --
    # the index must drop the name rather than guess which one.
    bio = {"00-1": {"name": "Justin Jefferson"}, "00-2": {"name": "Justin Jefferson"},
          "00-3": {"name": "Jeremiyah Love"}}
    idx = P.unique_name_index(bio)
    assert "Justin Jefferson" not in idx
    assert idx["Jeremiyah Love"] == "00-3"


def test_build_draft_table_resolves_the_real_2026_class_by_name():
    # THE SECOND REAL BUG, PINNED: draft_picks.parquet's own convention
    # gives the ENTIRE incoming class a PFR-style id (not just ghosts) --
    # ALL 257 real 2026 picks failed the format check, including
    # round-1-pick-3 Jeremiyah Love, who read "UDFA" in the first shipped
    # version. Verified against the live fetch: his draft_picks row is
    # `LOV121782`/`pfr_player_name "Jeremiyah Love"`; his real 2026
    # roster row carries a modern gsis (`00-0041027`) under the identical
    # name string.
    bio = P.build_bio_table({2026: [LOVE_ROSTER_ROW]})
    draft = P.build_draft_table([LOVE_DRAFT_ROW], P.unique_name_index(bio))
    assert "00-0041027" in draft
    assert draft["00-0041027"]["round"] == 1
    assert draft["00-0041027"]["pick"] == 3


def test_build_draft_table_still_excludes_a_real_suffix_mismatch():
    # THE FIX'S REAL BOUNDARY, NAMED RATHER THAN HIDDEN: draft_picks calls
    # him "Mike Washington Jr."; the 2026 roster calls him "Mike
    # Washington" -- no "Jr." Exact-match by design (a fuzzy match risks
    # resolving to the WRONG Washington), so he correctly stays excluded
    # rather than silently mismatched to a different person.
    bio = P.build_bio_table({2026: [WASHINGTON_ROSTER_ROW]})
    draft = P.build_draft_table([WASHINGTON_DRAFT_ROW], P.unique_name_index(bio))
    assert draft == {}


def test_build_store_gives_love_first_round_capital_not_udfa():
    bio = P.build_bio_table({2026: [LOVE_ROSTER_ROW]})
    draft = P.build_draft_table([LOVE_DRAFT_ROW], P.unique_name_index(bio))
    doc = P.build_store(bio, draft, (2026,))
    row = doc["players"]["13287"]
    assert row["draft_capital"] == "1st"
    assert row["draft_round"] == 1


def test_build_store_gives_brady_the_correct_draft_capital_not_udfa():
    bio = P.build_bio_table({2021: [BRADY_ROSTER_ROW]})
    draft = P.build_draft_table([BRADY_DRAFT_ROW])
    doc = P.build_store(bio, draft, (2021,))
    row = doc["players"]["116"]
    assert row["draft_capital"] == "6th"
    assert row["draft_round"] == 6
    assert row["draft_pick"] == 199
    assert row["draft_team"] == "NWE"


def test_build_store_labels_a_genuinely_undrafted_player_as_udfa_not_null():
    row = {"full_name": "Nobody Drafted", "position": "WR",
          "birth_date": "1998-01-01", "rookie_year": 2021.0,
          "gsis_id": "00-9999999", "sleeper_id": "999999"}
    bio = P.build_bio_table({2021: [row]})
    doc = P.build_store(bio, {}, (2021,))
    assert doc["players"]["999999"]["draft_capital"] == "UDFA"
    assert doc["players"]["999999"]["draft_round"] is None


def test_is_rookie_by_season_flags_only_the_real_rookie_year():
    row = {"full_name": "Rookie Guy", "position": "RB", "birth_date": "2001-01-01",
          "rookie_year": 2023.0, "gsis_id": "00-1111111", "sleeper_id": "111111"}
    bio = P.build_bio_table({2023: [row]})
    doc = P.build_store(bio, {}, (2022, 2023, 2024))
    flags = doc["players"]["111111"]["is_rookie_by_season"]
    assert flags == {"2022": False, "2023": True, "2024": False}


def test_resolve_sleeper_id_fills_the_gap_without_overwriting_a_real_one():
    bio = {"00-1": {"sleeper_id": None, "name": "A"},
          "00-2": {"sleeper_id": "already-set", "name": "B"}}
    resolved = P.resolve_sleeper_id(bio, {"00-1": "fallback-id", "00-2": "should-not-be-used"})
    assert resolved["00-1"]["sleeper_id"] == "fallback-id"
    assert resolved["00-2"]["sleeper_id"] == "already-set"


def test_unmatched_players_are_listed_not_silently_dropped():
    row = {"full_name": "No Sleeper", "position": "WR", "birth_date": "1999-01-01",
          "rookie_year": 2020.0, "gsis_id": "00-2222222", "sleeper_id": None}
    bio = P.build_bio_table({2021: [row]})
    doc = P.build_store(bio, {}, (2021,))
    assert doc["population"]["unmatched_no_sleeper_id"] == 1
    assert doc["unmatched_sample"][0]["name"] == "No Sleeper"


# ── rule 3e control: fail arm proving it CAN fail, not just currently pass ──

def test_verify_top170_coverage_is_a_real_fail_arm():
    board = {"players": [{"player_id": "1", "name": "Ghost", "overall_rank": 1},
                        {"player_id": "2", "name": "Ghost2", "overall_rank": 2}],
            "kept_players": []}
    doc = {"players": {}}  # nobody matched at all
    control = P.verify_top170_coverage(doc, board, top_n=2)
    assert control["ok"] is False
    assert control["coverage_pct"] == 0.0
    assert len(control["missed_players"]) == 2


def test_verify_top170_coverage_passes_when_data_is_complete():
    board = {"players": [{"player_id": "1", "name": "Real Player", "overall_rank": 1}],
            "kept_players": []}
    doc = {"players": {"1": {"birth_date": "1990-01-01", "draft_capital": "1st"}}}
    control = P.verify_top170_coverage(doc, board, top_n=1)
    assert control["ok"] is True
    assert control["coverage_pct"] == 100.0


# ── the SECOND rule 3e control -- this is the one that would have caught
#    the real 2026-rookie-class bug before it shipped, since the first
#    control's 100% coverage passed while every one of those rows was
#    wrong, not missing ──────────────────────────────────────────────────

def test_verify_rookie_udfa_rate_is_a_real_fail_arm():
    # THE REAL SHAPE OF THE BUG THIS CONTROL EXISTS TO CATCH: coverage is
    # 100% (every rookie has SOME label) and every one of those labels is
    # wrong.
    board = {"players": [{"player_id": str(i), "name": f"Rookie{i}",
                         "is_nfl_rookie": True} for i in range(10)],
            "kept_players": []}
    doc = {"players": {str(i): {"draft_capital": "UDFA"} for i in range(10)}}
    control = P.verify_rookie_capital_not_systematically_udfa(doc, board)
    assert control["ok"] is False
    assert control["udfa_pct"] == 100.0


def test_verify_rookie_udfa_rate_passes_on_a_real_draft_class_shape():
    board = {"players": [{"player_id": str(i), "name": f"Rookie{i}",
                         "is_nfl_rookie": True} for i in range(10)],
            "kept_players": []}
    doc = {"players": {str(i): {"draft_capital": "1st" if i < 8 else "UDFA"}
                       for i in range(10)}}
    control = P.verify_rookie_capital_not_systematically_udfa(doc, board)
    assert control["ok"] is True
    assert control["udfa_pct"] == 20.0


def test_verify_rookie_udfa_rate_ignores_non_rookies():
    board = {"players": [{"player_id": "1", "name": "Veteran", "is_nfl_rookie": False}],
            "kept_players": []}
    doc = {"players": {"1": {"draft_capital": "UDFA"}}}
    control = P.verify_rookie_capital_not_systematically_udfa(doc, board)
    assert control["checked"] == 0
    assert control["ok"] is True
