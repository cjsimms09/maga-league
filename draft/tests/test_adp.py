"""Tests for the real-ADP path and its name matcher.

Everything here runs offline against fixtures. The one thing these tests
*cannot* prove is what FFC's live payload actually contains — that answer comes
from `describe_payload()` in a real build log, which is exactly why that
function exists and is printed.
"""
import sys
from pathlib import Path

import pytest

# IMPORTABLE ON ITS OWN. `import adp` used to work only when the whole directory
# was collected — some other test file happened to put `draft/` on the path
# first, and pytest imports in alphabetical order. Run this file by itself and it
# raised ModuleNotFoundError, which pytest reports as a collection ERROR rather
# than a FAILED test.
#
# That is not a cosmetic difference. A harness grepping for `FAILED` sees an
# empty list and reads the suite as GREEN — the mutation gate did exactly that
# and returned three SURVIVED verdicts on a module whose tests all pass in CI.
# The gate now refuses an uncollectable baseline, and this makes the file stand
# on its own so the situation does not arise.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import adp  # noqa: E402


# --- fixtures ---------------------------------------------------------------

SLEEPER_PLAYERS = {
    "4034": {"full_name": "Christian McCaffrey", "position": "RB", "team": "SF"},
    "6794": {"full_name": "D.K. Metcalf", "position": "WR", "team": "SEA"},
    "7564": {"full_name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
    "8112": {"full_name": "Amon-Ra St. Brown", "position": "WR", "team": "DET"},
    "4029": {"full_name": "Michael Thomas", "position": "WR", "team": "NO"},
    "1234": {"full_name": "Michael Thomas", "position": "TE", "team": "NYG"},
    "5849": {"full_name": "Kyler Murray", "position": "QB", "team": "ARI"},
    "2216": {"full_name": "Marvin Harrison Jr.", "position": "WR", "team": "ARI"},
    "BUF": {"full_name": "", "position": "DEF", "team": "BUF"},
    "SF":  {"full_name": "", "position": "DEF", "team": "SF"},
    "9001": {"full_name": "Justin Tucker", "position": "K", "team": "BAL"},
    # Not in any FFC payload we use — exercises the fallback path.
    "9999": {"full_name": "Deep Bench Guy", "position": "RB", "team": "NYJ"},
}


def ffc(name, pos, team, rank, adp_val, **extra):
    return dict({"name": name, "position": pos, "team": team,
                 "adp_rank": rank, "adp": adp_val}, **extra)


PAYLOAD = {
    "status": "Success", "teams": 10, "year": 2026, "format": "half-ppr",
    "players": [
        ffc("Christian McCaffrey", "RB", "SF", 1, 1.4),
        ffc("Ja'Marr Chase", "WR", "CIN", 2, 2.6),
        ffc("DK Metcalf", "WR", "SEA", 3, 30.2),            # no periods
        ffc("Amon Ra St. Brown", "WR", "DET", 4, 12.1),      # no hyphen
        ffc("Marvin Harrison", "WR", "ARI", 5, 22.0),        # suffix dropped
        ffc("Kyler Murray", "QB", "ARZ", 6, 88.5),           # team alias
        ffc("Michael Thomas", "WR", "NO", 7, 140.0),         # ambiguous name
        ffc("Buffalo Bills", "DEF", "BUF", 8, 150.0),
        ffc("Justin Tucker", "PK", "BAL", 9, 160.0),         # position alias
    ],
}


@pytest.fixture
def index():
    return adp.build_index(SLEEPER_PLAYERS)


# --- normalization ----------------------------------------------------------

@pytest.mark.parametrize("a,b", [
    ("D.K. Metcalf", "DK Metcalf"),
    ("Ja'Marr Chase", "JaMarr Chase"),
    ("Amon-Ra St. Brown", "Amon Ra St Brown"),
    ("Marvin Harrison Jr.", "Marvin Harrison"),
    ("Kenneth Walker III", "Kenneth Walker"),
])
def test_normalization_collapses_known_variants(a, b):
    assert adp.normalize_name(a) == adp.normalize_name(b)


def test_normalization_does_not_collapse_different_people():
    assert adp.normalize_name("Michael Thomas") != adp.normalize_name("Michael Thomasson")


# --- matching ---------------------------------------------------------------

def test_matches_every_fixture_player(index):
    for entry in PAYLOAD["players"]:
        pid, method = adp.match_player(entry, index)
        assert pid, f"{entry['name']} did not match (method={method})"


def test_ambiguous_name_resolved_by_position(index):
    """Two Michael Thomases. The WR must not become the TE."""
    pid, method = adp.match_player(
        ffc("Michael Thomas", "WR", "NO", 7, 140.0), index)
    assert pid == "4029"
    assert "pos" in method


def test_initials_variant_matches(index):
    pid, method = adp.match_player(ffc("DK Metcalf", "WR", "SEA", 3, 30.2), index)
    assert pid == "6794"


def test_team_alias_matches(index):
    pid, _ = adp.match_player(ffc("Kyler Murray", "QB", "ARZ", 6, 88.5), index)
    assert pid == "5849"


def test_defense_matches_by_team(index):
    pid, method = adp.match_player(ffc("Buffalo Bills", "DEF", "BUF", 8, 150.0), index)
    assert pid == "BUF"


def test_unknown_player_does_not_match(index):
    pid, _ = adp.match_player(ffc("Nonexistent Person", "WR", "KC", 400, 400.0), index)
    assert pid is None


# --- build + reporting ------------------------------------------------------

def test_build_reports_payload_shape(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    out = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)
    rep = out["report"]
    assert rep["matched"] == len(PAYLOAD["players"])
    assert rep["unmatched_count"] == 0
    # The question the work order asks: does FFC publish a stdev?
    assert "stdev_field" in rep["payload"]


def test_unmatched_top_player_fails_the_build(monkeypatch):
    """The whole point of P0.1: a broken matcher must not degrade silently."""
    broken = dict(PAYLOAD, players=PAYLOAD["players"] + [
        ffc("Totally Unknown Rookie", "RB", "KC", 12, 44.0)])
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: broken)
    with pytest.raises(RuntimeError, match="did not match"):
        adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)


def test_unmatched_outside_top_n_is_reported_not_fatal(monkeypatch):
    late = dict(PAYLOAD, players=PAYLOAD["players"] + [
        ffc("Totally Unknown Rookie", "RB", "KC", 400, 400.0)])
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: late)
    out = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)
    assert out["report"]["unmatched_count"] == 1
    assert out["report"]["unmatched_in_top_n"] == []


# --- standard deviation -----------------------------------------------------

def test_published_sd_is_used_when_present():
    sd, src = adp.fitted_sd(100.0, 9.5)
    assert sd == 9.5 and src == "ffc"


def test_fitted_sd_is_tighter_than_the_old_heuristic():
    """Old rule: max(3, 0.22*adp) -> 22.0 at adp=100, roughly double reality."""
    sd, src = adp.fitted_sd(100.0, None)
    old = max(3.0, 0.22 * 100.0)
    assert sd < old
    assert sd == pytest.approx(15.0)   # clamped
    assert src == "clamped-linear"


def test_fitted_sd_floor_and_ceiling():
    assert adp.fitted_sd(1.0, None)[0] == 3.0        # floor
    assert adp.fitted_sd(300.0, None)[0] == 15.0     # ceiling


# --- fallback provenance ----------------------------------------------------

def test_fallback_is_recorded_per_player(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [{"player_id": "4034", "search_rank": 1},
             {"player_id": "9999", "search_rank": 250}]
    prov = adp.apply_with_fallback(board, table, teams=10)
    assert board[0]["adp_source"] == "ffc"
    assert board[1]["adp_source"] == "search_rank"
    assert prov["fallback_count"] == 1


def test_high_fallback_rate_raises_a_warning(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [{"player_id": "9999", "search_rank": 200 + i} for i in range(10)]
    prov = adp.apply_with_fallback(board, table, teams=10)
    assert prov["fallback_rate"] == 1.0
    assert prov["warning"] and "degraded" in prov["warning"]


def test_low_fallback_rate_has_no_warning(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [{"player_id": "4034", "search_rank": 1}] * 20 + [{"player_id": "9999", "search_rank": 250}]
    prov = adp.apply_with_fallback(board, table, teams=10)
    assert prov["warning"] is None


def test_unpriced_players_sort_behind_every_ffc_player(monkeypatch):
    """search_rank and ADP are different scales — never interleave them.

    A popular-but-unlisted player used to inherit adp = search_rank, so a
    search_rank of 30 put him in the top 30 of the board alongside genuinely
    elite players. FFC not listing someone is evidence he goes late, not
    evidence we should guess early.
    """
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [{"player_id": pid, "search_rank": 5} for pid in table]
    board.append({"player_id": "9999", "search_rank": 5})   # unlisted, very popular
    adp.apply_with_fallback(board, table, teams=10)

    priced = [p["adp"] for p in board if p["adp_source"] == "ffc"]
    unpriced = [p["adp"] for p in board if p["adp_source"] == "search_rank"]
    assert min(unpriced) > max(priced)


def test_unpriced_players_are_ordered_by_the_only_value_quantity_we_HOLD(monkeypatch):
    """THE PREDECESSOR PROVED THE ORDERING WITH A FIELD THE REAL BOARD LACKS.

    It built `[{"player_id": "9999", "search_rank": 40}, ...]` and asserted the
    lower rank got the lower ADP. That passed forever. **The production board
    carries `search_rank` on ZERO of its rows** — C found this — so in every real
    build `p.get("search_rank")` was None, `rank` was 9999, `min(rank, 600)` was
    600 for everybody, and all 603 fallback players received the IDENTICAL price.
    `raw_adp` on the shipped board takes exactly one distinct value across them.

    A fixture that supplies a field production does not have does not test
    production; it tests the fixture. So the CONTROL below asserts the real board
    is missing the field, and the ordering is asserted on `proj_mean`, which the
    board does carry — and which is a value quantity, where `search_rank` is a
    popularity rank and would have replaced an honest tie with a confident wrong
    ordering.
    """
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [
        {"player_id": "9999", "proj_mean": 40.0},
        {"player_id": "8888", "proj_mean": 120.0},
        {"player_id": "7777", "proj_mean": 80.0},
        {"player_id": "6666"},                      # nothing to rank him by
        {"player_id": "5555", "proj_mean": 0},      # a zero is not a projection
    ]
    adp.apply_with_fallback(board, table, teams=10)
    by_id = {p["player_id"]: p for p in board}
    assert by_id["8888"]["adp"] < by_id["7777"]["adp"] < by_id["9999"]["adp"], (
        "the deep pool must be ordered best-projection-first")
    # The distinction is reported in PROVENANCE, not as a row field: adding one
    # to every player would need a season-stamp registry entry in C's file for a
    # flag no live consumer reads. Same information, countable, no new field.
    # THE TIE IS DELIBERATE AND DECLARED. Two players with nothing to separate
    # them get the same price and say so, rather than a spread that reads as
    # information.
    assert by_id["6666"]["adp"] == by_id["5555"]["adp"], (
        "players with no projection cannot be separated and must not be pretend-ranked")
    assert by_id["6666"]["adp"] > by_id["9999"]["adp"], (
        "the unrankable cohort sits BEHIND everyone we could rank")
    rep = adp.apply_with_fallback(
        [dict(p) for p in ({"player_id": "1", "proj_mean": 5.0}, {"player_id": "2"})],
        table, teams=10)
    assert rep["fallback_ordered_by_projection"] == 1, rep
    assert rep["fallback_unordered_tied"] == 1, rep
    assert "NOT search_rank" in rep["fallback_ordering_basis"], rep


def test_the_FALLBACK_cannot_outrank_a_player_the_market_actually_priced(monkeypatch):
    """The ordering is INTERNAL to the deep pool. If it started anywhere but
    after the last real ADP, a projection-happy deep player would jump the
    market — which is the failure the fallback exists to avoid, not to cause."""
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    priced = max(v["adp"] for v in table.values())
    board = [{"player_id": "9999", "proj_mean": 9_999.0}]
    adp.apply_with_fallback(board, table, teams=10)
    assert board[0]["adp"] > priced, (
        "a fallback price must start after the last real ADP no matter how good "
        "the projection is")


def test_the_REAL_BOARD_does_not_carry_search_rank_which_is_why_this_hid():
    """CONTROL for the two tests above, and the whole reason the defect lived.

    Not a style point: if a future board DID start carrying `search_rank`, the
    old fixture would have been legitimate and this comment would be wrong. It
    is asserted against the shipped artifact so the claim stays checked.
    """
    import json as _json
    board = _json.loads(
        (Path(__file__).resolve().parent.parent.parent / "public" / "draft_data.json")
        .read_text())["players"]
    assert board, "no board to check"
    carrying = [p for p in board if "search_rank" in p]
    assert not carrying, (
        "the board now carries search_rank on %d rows — the fallback's original "
        "ordering premise has become true and this test's reasoning needs "
        "re-reading, not deleting" % len(carrying))
    # AND THE FALLBACK IS NOT VACUOUS — there are players it prices.
    fb = [p for p in board if p.get("adp_source") == "search_rank"]
    assert len(fb) > 50, (
        "only %d fallback players — if the market now prices everything, this "
        "whole path is dead code and should be retired deliberately" % len(fb))


def test_bye_fills_from_ffc_only_where_sleeper_left_a_hole():
    """SPEC: the bye grid needs a bye week; Sleeper's preseason dump has none.

    On the 2026-08-07 real build, metadata.bye_week was empty for 0 of 1737
    players, so the bye grid and every bye-conflict warning computed over nulls
    and silently found nothing. FFC publishes bye alongside ADP.

    Sleeper stays the roster authority: where it HAS a value that value wins,
    so this can never overwrite good data with a provider's guess.
    """
    players = [
        {"player_id": "1", "search_rank": 5, "bye": None},   # hole -> fill from FFC
        {"player_id": "2", "search_rank": 6, "bye": 9},      # Sleeper knows -> keep 9
        {"player_id": "3", "search_rank": 7, "bye": None},   # no FFC row -> stays None
    ]
    table = {
        "1": {"adp": 5.0, "adp_sd": 2.0, "adp_source": "ffc", "bye": 6},
        "2": {"adp": 6.0, "adp_sd": 2.0, "adp_source": "ffc", "bye": 11},
    }
    adp.apply_with_fallback(players, table, teams=10, draft_picks=120)
    by_id = {p["player_id"]: p for p in players}
    assert by_id["1"]["bye"] == 6, "an empty bye must be filled from FFC"
    assert by_id["1"]["bye_source"] == "ffc"
    assert by_id["2"]["bye"] == 9, "Sleeper's bye must win over FFC's"
    assert "bye_source" not in by_id["2"]
    assert by_id["3"]["bye"] is None, "unknown must stay unknown, never guessed"


# ── THE TEAM-BYE FALLBACK, WHICH HAD NEVER FIRED ───────────────────────────
#
# `bye_source` on the shipped 2026 board was `ffc` (215) or absent (1,626)
# across all 1,841 rows and NOT ONCE `team-derived`, while 35 rows inside the
# top-225 carried no bye and their own team's bye sat on the same board — 11 RB,
# 9 TE, 8 QB, 5 WR, 2 DEF, 1 K.
#
# The cause was ORDER, not logic. The team map was built at the top of
# `apply_with_fallback` from `p.get("bye")`, and at that point no player has a
# bye at all: Sleeper's `metadata.bye_week` is empty for all 1,737 in the
# preseason, and the FFC values are merged further down. The map was built from
# nothing, so the fill loop had nothing to apply. Its own comment claimed "all
# 564 gaps fill"; zero did.
#
# A missing bye is not a visible gap, it is SILENCE: `byeStack` warns when three
# starters share a bye, and a null can never contribute to that count, so the
# warning stays quiet — indistinguishable from one that looked and found nothing.

def test_a_TEAMMATES_BYE_FILLS_A_HOLE_THAT_ONLY_FFC_COULD_HAVE_KNOWN(monkeypatch):
    """THE REGRESSION TEST FOR THE ORDERING. The teammate's bye arrives with the
    FFC merge, so this passes only if the team map is built AFTER it.

    MUTATION: build the map before the merge (the original order) — `team_bye` is
    empty, nothing fills, and `bye_source` is never `team-derived`."""
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10,
                                year=2026)["adp"]
    priced = next(iter(table))
    table[priced]["bye"] = 9
    board = [
        {"player_id": priced, "team": "GB", "search_rank": 1},      # bye via FFC
        {"player_id": "unpriced-1", "team": "GB", "search_rank": 700},
    ]
    adp.apply_with_fallback(board, table, teams=10)

    assert board[0]["bye"] == 9 and board[0]["bye_source"] == "ffc"
    assert board[1]["bye"] == 9, (
        "a teammate's bye was on the board and this hole stayed empty — the team "
        "map is being built before the merge that supplies the only bye data")
    assert board[1]["bye_source"] == "team-derived"


def test_the_TEAM_BYE_FILL_NEVER_TOUCHES_A_PLAYER_WHO_ALREADY_HAS_ONE(monkeypatch):
    """Sleeper is the roster authority and FFC beats a derivation; this may only
    ever fill a hole neither could.

    ⚠ THE OBVIOUS FIXTURE CANNOT TEST THIS, and my first one did not. Giving the
    teammate a DIFFERENT bye makes the team disagree with itself, so the
    unanimity refusal drops it and there is nothing left to overwrite with —
    the test passed because the guard never ran. The gate caught it: mutating
    the guard to `if True` survived.

    Any disagreement is a conflict by construction, so the only reachable case is
    a player whose bye already AGREES with his team's. What the guard protects
    there is not the number, it is the PROVENANCE: overwriting would relabel a
    Sleeper-sourced bye as `team-derived`, and the artifact would then claim a
    derivation for a value that was measured.

    MUTATION: fill unconditionally — the value survives and `bye_source` lies."""
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10,
                                year=2026)["adp"]
    priced = next(iter(table))
    table[priced]["bye"] = 9
    board = [{"player_id": priced, "team": "GB", "search_rank": 1},
             {"player_id": "u2", "team": "GB", "bye": 9, "bye_source": "sleeper",
              "search_rank": 700}]
    adp.apply_with_fallback(board, table, teams=10)
    assert board[1]["bye"] == 9
    assert board[1]["bye_source"] == "sleeper", (
        "a measured bye was relabelled as derived — the value is right and the "
        "provenance is now a lie")


def test_a_TEAM_WHOSE_PLAYERS_DISAGREE_gets_no_derived_bye(monkeypatch):
    """A wrong bye manufactures a conflict warning about a week the player
    actually plays, which is worse than a missing one. Unanimity or nothing.

    MUTATION: resolve by first-seen or by mode."""
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10,
                                year=2026)["adp"]
    board = [{"player_id": "a", "team": "ZZ", "bye": 5, "search_rank": 700},
             {"player_id": "b", "team": "ZZ", "bye": 9, "search_rank": 701},
             {"player_id": "c", "team": "ZZ", "search_rank": 702}]
    adp.apply_with_fallback(board, table, teams=10)
    assert board[2].get("bye") in (None, "", 0), board[2]


def test_a_TEAM_WITH_NO_BYE_AT_ALL_does_not_get_a_derived_LABEL(monkeypatch):
    """The inner guard, which the obvious mutation does not reach. If a player's
    team has no bye anywhere, nothing is derivable — and writing
    `bye_source: "team-derived"` beside a null bye would claim a derivation that
    did not happen, which is worse than the blank it replaces.

    (Tyreek Hill is the live case: team `FA`, no teammate, genuinely underivable.)

    MUTATION: drop `if b is not None` — every unfilled player is stamped as
    team-derived while still having no bye."""
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10,
                                year=2026)["adp"]
    board = [{"player_id": "lonely", "team": "FA", "search_rank": 700}]
    adp.apply_with_fallback(board, table, teams=10)
    assert board[0].get("bye") in (None, "", 0), board[0]
    assert board[0].get("bye_source") != "team-derived", (
        "claimed a derivation for a player with no teammate to derive from")
