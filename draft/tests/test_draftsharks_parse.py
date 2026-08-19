# TERRITORY: C
"""Pins every real bug found while writing draftsharks_parse.py, against the
committed raw text (not a fixture) — the bugs were all in how a multi-column
table reflows across PDF page breaks, and a fixture would not reproduce them.

The known-positive/known-negative shapes here matter more than the exact
numbers: a future re-run against a fresh PDF export should still trip these
if the same reflow patterns recur.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import draftsharks_parse as D  # noqa: E402


def _players():
    return {r["rank"]: r for r in D.main()["players"]}


def test_all_250_ranks_present_no_gaps():
    players = _players()
    assert set(players) == set(range(1, 251))


def test_no_parse_errors():
    doc = D.main()
    assert doc["n_parse_errors_pts_file"] == 0
    assert doc["n_parse_errors_ceil_file"] == 0


def test_floor_never_exceeds_ceiling():
    players = _players()
    for r in players.values():
        assert r["floor_proj"] <= r["ceil_proj"], r


def test_tier_heading_digit_does_not_shift_rank_1():
    # "TIER 1"'s own digit was mistaken for row 1's rank marker on the first
    # attempt, corrupting every field of the top-ranked player.
    r = _players()[1]
    assert r["name"] == "J Gibbs"
    assert (r["team"], r["position"], r["position_rank"]) == ("DET", "RB", 1)
    assert (r["pts_rush"], r["pts_rec"]) == (202, 120)
    assert (r["floor_proj"], r["ds_proj"], r["ceil_proj"]) == (261, 322, 370)


def test_coincidental_value_equal_to_next_rank_does_not_merge_two_rows():
    # Ranks 39 and 40 both carry a 3D Value of exactly 40 — the same integer
    # as rank 40's own marker — which the naive rank-finder briefly latched
    # onto as rank 40's row.
    players = _players()
    assert players[39]["name"] == "J Waddle"
    assert players[40]["name"] == "K Williams"
    assert players[39]["value_3d"] == players[40]["value_3d"] == 40


def test_wrapped_last_column_does_not_shift_every_field_one_slot():
    # At some page breaks 3D Value reflows onto the name's own line, ahead
    # of ADP/floor/etc in the token stream — caught by a monotonicity sweep
    # (3D Value must not jump UP as rank gets worse), which flagged 13 rows.
    r = _players()[100]
    assert r["name"] == "M Stafford"
    assert (r["floor_proj"], r["ds_proj"], r["ceil_proj"], r["value_3d"]) == (278, 299, 403, 19)


def test_rank_marker_printed_after_its_own_row_is_recovered():
    # Two rows had the rank token itself reflow to AFTER the row's data
    # instead of before it; recovered via explicit, hand-verified overrides.
    r = D.parse_ceil()[51]
    assert r["name"] == "D Maye" and r["team"] == "NE"
    r = D.parse_ceil()[247]
    assert r["name"] == "K Miller" and r["floor_proj"] == 36


def test_ligature_corrupted_name_is_fixed():
    r = _players()[111]
    assert r["name"] == "B Mayfield"


def test_crosswalk_matches_every_player_uniquely():
    doc = D.main()
    assert doc["n_unmatched"] == 0
    ids = [r["sleeper_id"] for r in doc["players"]]
    assert len(ids) == len(set(ids)), "two Draft Sharks rows matched the same player"


def test_same_initial_same_team_same_position_collision_resolves_correctly():
    # Bijan Robinson (board rank 2) and Brian Robinson (board rank 189) both
    # collapse to the same first-initial+team+position key at ATL RB.
    # Picking "the more prominent candidate" unconditionally would give both
    # DS rows the same (wrong, for one of them) player.
    players = _players()
    assert players[2]["name"] == "B Robinson"
    assert players[153]["name"] == "B Robinson Jr."
    assert players[2]["sleeper_id"] != players[153]["sleeper_id"]


def test_no_row_has_a_category_split_impossible_for_its_position():
    # Caught on a second, closer look after the first pass shipped: the
    # page-break reflow that corrupts floor/cons/ds/ceil order also
    # corrupts this file's pass/rush/rec/kick/def order, but with no
    # ADP-decimal anchor to key off — a QB with zero passing points and
    # an RB or WR with nonzero kicking points both slipped through the
    # first version of this check, which only forbade impossible
    # categories and never required a position's OWN category to be
    # present.
    for r in _players().values():
        pos, p, ru, rec_, k, dd = (r["position"], r["pts_pass"], r["pts_rush"],
                                    r["pts_rec"], r["pts_kick"], r["pts_def"])
        assert pos == "K" or k == 0, r
        assert pos == "QB" or p == 0, r
        if pos == "QB":
            assert p > 0, r
        if pos == "K":
            assert k > 0, r
        if pos == "DEF":
            assert dd > 0 and p == 0 and ru == 0 and rec_ == 0 and k == 0, r


def test_cross_file_identity_join_survives_the_two_captures_disagreeing_on_order():
    # The two source PDFs were exported minutes apart, and Draft Sharks'
    # live ranking reordered 8 marginal players (RB58/TE19/DEF11-13/QB30/
    # K13/RB59) in between — verified against both raw files directly:
    # the same 8 identities appear in both, just at different rank
    # numbers. Joining by raw rank number silently pairs one player's
    # floor/ceiling with a DIFFERENT player's category split here; joining
    # on (team, position, position_rank) does not.
    doc = D.main()
    assert doc["n_join_mismatches"] == 8
    players = _players()
    checks = {
        214: ("G Smith", "NYJ", "QB", 214, 16, 0, 0, 0),
        215: ("C Smyth", "NO", "K", 0, 0, 0, 147, 0),
        217: ("N Giants", "NYG", "DEF", 0, 0, 0, 0, 107),
        221: ("E Johnson", "KC", "RB", 0, 38, 32, 0, 0),
    }
    for rank, (name, team, pos, p, ru, rec_, k, dd) in checks.items():
        r = players[rank]
        assert (r["name"], r["team"], r["position"]) == (name, team, pos), r
        assert (r["pts_pass"], r["pts_rush"], r["pts_rec"], r["pts_kick"], r["pts_def"]) == (
            p, ru, rec_, k, dd), r
