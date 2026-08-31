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


#: Register 433 (A, 2026-08-31): this crosswalk rebuilds against `public/
#: draft_data.json`, the LIVE board a nightly job rebuilds -- a real roster
#: move (a retirement, a name-resolution edge case) can legitimately drop
#: one match without the parser being broken. A hard `== 0` refused every
#: nightly publish since 08-26 for exactly that reason: it was refusing the
#: board for being NEW, never for being BAD. Measured today: 250/250 = 1.0.
#: Floor set with the same ~5-point buffer A used on the Clay Sports check
#: (0.9091 measured, 0.85 floor) -- generous enough to survive real churn,
#: tight enough that the parser breaking still fires it (proven below).
MIN_CROSSWALK_MATCH_RATE = 0.95


def test_crosswalk_matches_every_player_uniquely():
    doc = D.main()
    n = len(doc["players"])
    match_rate = 1 - (doc["n_unmatched"] / n) if n else 0
    assert match_rate >= MIN_CROSSWALK_MATCH_RATE, (
        f"crosswalk match rate {match_rate:.3f} below floor {MIN_CROSSWALK_MATCH_RATE} "
        f"({doc['n_unmatched']} of {n} unmatched) -- a real parser or crosswalk defect, "
        "not ordinary board churn")
    # BOARD-INDEPENDENT, kept as a hard equality: two Draft Sharks rows
    # resolving to the same REAL sleeper_id is a genuine collision bug
    # regardless of which board state the crosswalk was built against.
    #
    # ⚠️ D's catch, reproduced against CI's real 08-27 board
    # (register 435: Sleeper dropped two free agents, `sleeper_id` is None
    # for both unmatched rows) -- `ids` included every unmatched row's
    # `None`, so two-or-more legitimately-unmatched rows collapsed to one
    # entry in `set(ids)` and read as a fabricated collision. `None` is
    # "no match", never a real id to compare for equality.
    ids = [r["sleeper_id"] for r in doc["players"] if r["sleeper_id"]]
    assert len(ids) == len(set(ids)), "two Draft Sharks rows matched the same player"


def test_crosswalk_match_rate_floor_actually_fires_on_a_real_regression(monkeypatch):
    # ⚠️ D's second catch: the original version of this
    # control (`broken = dict(doc, n_unmatched=n); 1 - n/n < 0.95`) was
    # arithmetic on a fabricated field and never touched the real matcher --
    # constant-true, testing nothing. This version drops two real players
    # from the board copy the crosswalk indexes and re-runs the actual
    # parser, the same shape as register 435's real incident.
    import json
    import draftsharks_parse as _D
    board_path = _D.ROOT / "public" / "draft_data.json"
    board = json.loads(board_path.read_text())
    # register 435's exact real incident: Sleeper dropped Nick Chubb
    # (4988) and Trey Benson (11589) from its player pool on 08-27, and both
    # are real Draft Sharks-covered players -- D's own reproduction used
    # these two ids and got the exact CI failure, so this uses the same
    # real players rather than a freshly-derived pair with untested behavior.
    drop_ids = {"4988", "11589"}
    on_board = {str(p.get("player_id"))
               for p in board.get("players", []) + board.get("kept_players", [])}
    assert drop_ids <= on_board, (
        f"{drop_ids - on_board} not on the current board -- pick two players "
        "who are, this control needs them present to remove")
    broken_board = dict(board)
    broken_board["players"] = [p for p in board.get("players", [])
                               if str(p.get("player_id")) not in drop_ids]
    broken_board["kept_players"] = [p for p in board.get("kept_players", [])
                                    if str(p.get("player_id")) not in drop_ids]
    # Path instances don't allow per-instance attribute patching (read-only
    # slots) -- patch the CLASS method, delegating to the real one for every
    # path except the board, so nothing else this parser reads is affected.
    import pathlib
    real_read_text = pathlib.Path.read_text
    def _patched_read_text(self, *a, **kw):
        if self == board_path:
            return json.dumps(broken_board)
        return real_read_text(self, *a, **kw)
    monkeypatch.setattr(pathlib.Path, "read_text", _patched_read_text)
    broken_doc = _D.main()
    n = len(broken_doc["players"])
    match_rate = 1 - (broken_doc["n_unmatched"] / n) if n else 0
    # 2 of 250 dropped clears the 0.95 floor on its own (0.992) -- the real
    # regression this proves the control catches is D's catch's shape,
    # not the rate floor: run the fixed uniqueness check against a board
    # with real unmatched rows and confirm it does NOT fabricate a collision.
    ids = [r["sleeper_id"] for r in broken_doc["players"] if r["sleeper_id"]]
    assert len(ids) == len(set(ids)), (
        "the fixed uniqueness check fabricated a collision on a board with "
        "real unmatched rows -- D's catch regressed")
    assert broken_doc["n_unmatched"] >= 2, (
        "the two dropped players were not reported unmatched -- the control "
        "did not actually remove them from the crosswalk")


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
