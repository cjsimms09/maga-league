# TERRITORY: C
"""Pins every real bug found while writing draftsharks_parse.py, against the
committed raw text (not a fixture) — the bugs were all in how a multi-column
table reflows across PDF page breaks, and a fixture would not reproduce them.

The known-positive/known-negative shapes here matter more than the exact
numbers: a future re-run against a fresh PDF export should still trip these
if the same reflow patterns recur.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import draftsharks_parse as D  # noqa: E402


def _players():
    return {r["rank"]: r for r in D.main(write=False)["players"]}


# ── THE SECOND, INDEPENDENT PATH (register 452) ─────────────────────────────
# Deliberately dumb and deliberately not shared with the thing it checks: it
# reads `public/draft_data.json` straight off disk and keys on (first initial,
# surname, position) with its own suffix list. It imports nothing from
# `adp`, does not call `build_board_index`, and does not know the matcher
# exists. That is the whole point — if the index build, the normaliser or the
# matcher regresses, this path still finds the player and the gate fires.
_SCAN_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def _scan_key(name: str, position: str):
    toks = [t for t in re.sub(r"[^a-z ]", " ", (name or "").lower()).split()
            if t not in _SCAN_SUFFIXES]
    if len(toks) < 2:
        return None
    return (toks[0][0], toks[-1], (position or "").upper())


def _independent_board_scan() -> dict:
    board = json.loads((Path(__file__).resolve().parents[2]
                        / "public" / "draft_data.json").read_text())
    idx: dict = {}
    for p in board.get("players", []) + board.get("kept_players", []):
        k = _scan_key(p.get("name"), p.get("position"))
        if k:
            idx.setdefault(k, []).append(p.get("name"))
    return idx


def test_the_independent_scan_can_actually_find_players():
    """⚠️ RULE 3E — the scan above is a NULL DETECTOR, and a null detector that
    has never returned a positive is untested, not passing. "No Draft Sharks
    row was lost by the matcher" and "my scan finds nobody, ever" are the same
    output from outside.

    So: every row the matcher DID match must be re-findable by the scan. That
    is 248 demonstrated positives on the 08-31 board (250 on 08-26), which is
    what licenses reading the scan's silence on the unmatched rows as a real
    "these players are gone" rather than as a broken probe.
    """
    doc = D.main(write=False)
    scan = _independent_board_scan()
    assert scan, "the scan indexed nothing at all — it cannot report an absence"
    matched = [r for r in doc["players"] if r["sleeper_id"] is not None]
    assert matched, "no rows matched; the arm below would be vacuous"
    missed = [(r["rank"], r["name"], r["position"]) for r in matched
              if not scan.get(_scan_key(r["name"], r["position"]))]
    assert not missed, (
        f"{len(missed)} rows the MATCHER found cannot be re-found by the "
        f"independent scan: {missed[:8]}. The scan is the weaker path here, so "
        "this is a defect in the scan (a name shape it mishandles) and it must "
        "be fixed before its silence on an unmatched row means anything.")


def test_all_250_ranks_present_no_gaps():
    players = _players()
    assert set(players) == set(range(1, 251))


def test_no_parse_errors():
    doc = D.main(write=False)
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
    """RULED BY A 2026-08-31 on D's finding (register 436), which found the
    defect in the fix that was already queued for this test.

    ── WHY THIS CHANGED AT ALL ───────────────────────────────────────────────
    `D.main()` rebuilds this store against the LIVE board, and the board is
    rebuilt nightly. `n_unmatched == 0` therefore asserted that tonight's board
    contains every player Draft Sharks ranks — which stops being true the
    moment Sleeper drops a free agent. It did: `4988` and `11589` went on
    2026-08-27 (register 435), and this test has been on the acceptance gate's
    refusal list every night since, with the board unpublished since 08-26.

    ── AND WHY THE QUEUED FIX WAS NOT ENOUGH ─────────────────────────────────
    C's branch turned the first line into a 0.95 match-rate floor and kept the
    uniqueness line "a hard equality" — deliberately. But an UNMATCHED row
    carries `sleeper_id = None`, so two unmatched rows put two `None`s in that
    list and the equality fires as `assert 250 == 249`, reporting *"two Draft
    Sharks rows matched the same player"* when no two rows matched anything.
    The gate still refuses, and the message sends the next reader hunting a
    crosswalk bug that does not exist. Found by D; reproduced here in a
    throwaway worktree with `4988`/`11589` removed — 250 rows, n_unmatched 2,
    two Nones, naive uniqueness FALSE, uniqueness-over-matched TRUE.

    `None` is not an id. Uniqueness is a claim about the rows that MATCHED.

    ── AND WHY THE 0.95 FLOOR IS GONE TOO (A, 2026-08-31, register 452) ──────
    Cory froze this source: *"Let's ignore draft sharks and remove from data, I
    won't be uploading more"* — freeze, not delete. So the store is now 250
    FIXED rows measured against a board that keeps turning over, which makes
    the match rate a MONOTONICALLY DECAYING quantity and any floor on it a
    dated claim wearing a threshold's clothes. Measured across four committed
    board versions: 250/250 on 08-22, 08-25 and 08-26, then 248/250 on 08-31.
    Two losses in the one interval that moved — Trey Benson and Nick Chubb,
    both off Sleeper's board. At that rate 0.95 (which trips at 13 unmatched)
    is reached inside the season, and it would fire on exactly the thing this
    test's own comment said it was not measuring.

    ⚠️ ONE INTERVAL IS NOT A SLOPE (rule 3i) — three intervals lost nothing and
    one lost two, so the DATE is a guess. The DIRECTION is not: a frozen store
    cannot gain coverage on a board it is not re-parsed for.

    WHAT REPLACES IT IS STRICTLY STRONGER, not weaker. A floor tolerates twelve
    silent crosswalk failures; this tolerates none. Every unmatched row must be
    unmatched BECAUSE THE PLAYER IS NOT ON THE BOARD, proven by a second,
    independent path — a raw scan of `public/draft_data.json` on (first
    initial, surname, position) that shares no code with `build_board_index`,
    `adp.normalize_name` or the matcher's index (rule 3e: two independent paths
    that check each other). If the scan CAN find a row the matcher lost, that
    is a crosswalk regression and it fails on the first one.

    Both arms measured on two board versions: on 08-31, 248/248 matched rows
    are re-findable by the scan (so it has 248 demonstrated positives) and 0/2
    unmatched rows are; on the 08-26 board, 250 matched, 0 unmatched, 0
    not-refindable.
    """
    doc = D.main(write=False)
    ids = [r["sleeper_id"] for r in doc["players"]]
    matched = [i for i in ids if i is not None]
    assert len(matched) == len(set(matched)), (
        "two Draft Sharks rows matched the SAME board player (unmatched rows "
        "are excluded: they carry sleeper_id None and collide with each other, "
        "not with a player — register 436)")

    scan = _independent_board_scan()
    lost = [(r["rank"], r["name"], r["position"], scan.get(_scan_key(r["name"], r["position"])))
            for r in doc["players"]
            if r["sleeper_id"] is None and scan.get(_scan_key(r["name"], r["position"]))]
    assert not lost, (
        f"{len(lost)} Draft Sharks row(s) went unmatched even though an "
        f"independent scan of the raw board finds a player with the same first "
        f"initial, surname and position: {lost[:5]}. That is a CROSSWALK "
        "REGRESSION, not board churn — the board still has these players and "
        "the matcher stopped reaching them (register 452).")

    #: DISCLOSURE, not a gate — the number is real and decaying, and a reader
    #: who never sees it cannot notice the day the source stops being useful.
    print(f"\n  Draft Sharks (FROZEN 2026-08-25): {len(matched)}/{len(ids)} rows "
          f"reach a board player; {len(ids) - len(matched)} of their players have "
          f"left the board since capture. This number only falls.")


def test_the_unmatched_rows_are_unmatched_and_not_silently_zero_filled():
    """The other half of what `n_unmatched == 0` used to buy: it also meant
    nobody could ship a row that LOOKED matched and was not. Dropping it for a
    floor would have lost that, so it is asserted directly instead."""
    doc = D.main(write=False)
    for r in doc["players"]:
        if r["sleeper_id"] is None:
            assert not r.get("name_board"), (
                f"row {r.get('rank')} has no sleeper_id but carries a board name — "
                "that is a half-matched row, which is worse than an unmatched one")
    n_none = sum(1 for r in doc["players"] if r["sleeper_id"] is None)
    assert n_none == doc["n_unmatched"], (
        f"the store's own n_unmatched ({doc['n_unmatched']}) disagrees with the "
        f"rows carrying no sleeper_id ({n_none}) — a miscount, not board churn")


def test_the_uniqueness_check_still_fires_on_a_REAL_collision():
    """⚠️ RULE 3E, AND THE REASON THIS EXISTS IS THAT THE CONTROL SHIPPED WITH
    THE QUEUED FIX COULD NOT FAIL. It built `broken = dict(doc, n_unmatched=n)`
    and asserted `1 - n/n < 0.95` — that is `0 < 0.95`, a constant-true
    comparison that never touches the matcher, the board or the parser. It
    proves the inequality operator works (D's second finding, register 436).

    This one injects a real duplicate into the real parser output and requires
    the real assertion to fire — and separately proves that adding a second
    UNMATCHED row does NOT fire it, which is the exact distinction the change
    above turns on.
    """
    doc = D.main(write=False)
    rows = [dict(r) for r in doc["players"]]

    def uniq(rs):
        m = [r["sleeper_id"] for r in rs if r["sleeper_id"] is not None]
        return len(m) == len(set(m))

    assert uniq(rows), "the live store must be clean before the arms mean anything"

    real = [dict(r) for r in rows]
    donor = next(r for r in real if r["sleeper_id"] is not None)
    victim = next(r for r in real if r["sleeper_id"] is not None and r is not donor)
    victim["sleeper_id"] = donor["sleeper_id"]
    assert not uniq(real), "FAIL ARM — a genuine duplicate sleeper_id must fire"

    nones = [dict(r) for r in rows]
    for r in nones[:2]:
        r["sleeper_id"] = None
    assert uniq(nones), (
        "CONTROL — two UNMATCHED rows must NOT be read as a collision; that "
        "false positive is register 436 and it is what kept the board unpublished")


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
    doc = D.main(write=False)
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
